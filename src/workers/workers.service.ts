import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { UserRole } from 'src/common/enums/user-role.enum';
import { WorkerRole } from 'src/common/enums/worker-role.enum';
import { WorkerLabel } from 'src/common/enums/worker-label.enum';
import { WorkerStatus } from 'src/common/enums/worker-status.enum';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { LeaderSongDto } from './dto/leader-song.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { WorkersRepository } from './repositories/workers.repository';
import { UsersService } from 'src/users/users.service';
import { WorkerGroupsService } from 'src/worker-groups/worker-groups.service';
import { SongsService } from 'src/songs/songs.service';
import { AddLeaderRepertoireDto } from './dto/add-leader-repertoire.dto';
import { LeaderRepertoireRepository } from './repositories/leader-repertoire.repository';
import { Types } from 'mongoose';

@Injectable()
export class WorkersService implements OnModuleInit {
  constructor(
    private readonly workersRepository: WorkersRepository,
    private readonly usersService: UsersService,
    private readonly workerGroupsService: WorkerGroupsService,
    private readonly songsService: SongsService,
    private readonly leaderRepertoireRepository: LeaderRepertoireRepository,
  ) {}

  async onModuleInit() {
    await this.workerGroupsService.ensureDefaults();
    const groups = await this.workerGroupsService.getByCodes(['main', 'youth']);
    const main = groups.find((group) => group.code === 'main');
    const youth = groups.find((group) => group.code === 'youth');

    if (main && youth) {
      await this.workersRepository.backfillLegacyWorkerGroups(
        main._id.toString(),
        youth._id.toString(),
      );
    }

    await this.migrateLegacyLeaderSongs();
  }

  async createWorker(dto: CreateWorkerDto) {
    await this.ensureUserLinkIsAvailable(dto.user_id);
    const workerGroupIds = await this.resolveSavedWorkerGroupIds(
      dto.worker_group_ids,
      dto.label,
    );
    const { user_id, leader_songs: leaderSongs = [], ...workerData } = dto;

    const worker = await this.workersRepository.insertRecord({
      ...workerData,
      ...(user_id ? { user_id } : {}),
      worker_group_ids: workerGroupIds,
      label: dto.label || WorkerLabel.Main,
      status: dto.status || WorkerStatus.Active,
    } as any);

    if (worker.roles.includes(WorkerRole.Leader) && leaderSongs.length) {
      await this.replaceLegacyLeaderSongs(worker._id.toString(), leaderSongs);
    }

    return await this.withRepertoireSummary(worker);
  }

  async getWorkers(status?: WorkerStatus) {
    const filter = status ? ({ status } as any) : {};

    const records = await this.workersRepository.getRecords(
      filter,
      1,
      100,
      'asc',
      'name',
    );
    const counts = await this.leaderRepertoireRepository.countByWorkers(
      records.items.map((worker) => worker._id.toString()),
    );

    return {
      ...records,
      items: records.items.map((worker) => ({
        ...worker,
        leader_song_count: counts.get(worker._id.toString()) ?? 0,
      })),
    };
  }

  async getWorkerById(id: string) {
    const worker = await this.workersRepository.getRecordById(id);

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    return await this.withRepertoireSummary(worker);
  }

  async findWorkerByUserId(userId: string) {
    return await this.workersRepository.findByUserId(userId);
  }

  async findWorkersByIds(ids: string[]) {
    if (!ids.length) {
      return [];
    }

    return await this.workersRepository.findByIds(ids);
  }

  async updateMyLeaderSongs(userId: string, leaderSongs: LeaderSongDto[]) {
    const worker = await this.getLinkedLeader(userId);
    await this.replaceLegacyLeaderSongs(worker._id.toString(), leaderSongs);

    return {
      ...(await this.withRepertoireSummary(worker)),
      leader_songs: await this.getLegacyLeaderSongsForWorker(
        worker._id.toString(),
      ),
    };
  }

  async getMyRepertoire(
    userId: string,
    search = '',
    pageValue: number | string = 1,
    limitValue: number | string = 10,
  ) {
    const worker = await this.getLinkedLeader(userId);
    return await this.getWorkerRepertoire(
      worker._id.toString(),
      search,
      pageValue,
      limitValue,
    );
  }

  async getWorkerRepertoire(
    workerId: string,
    search = '',
    pageValue: number | string = 1,
    limitValue: number | string = 10,
  ) {
    await this.getLeaderWorker(workerId);
    const page = this.toPositiveInteger(pageValue, 1);
    const limit = Math.min(this.toPositiveInteger(limitValue, 10), 50);

    return await this.leaderRepertoireRepository.findByWorker(
      workerId,
      this.normalizeSearch(search),
      page,
      limit,
    );
  }

  async addToMyRepertoire(userId: string, dto: AddLeaderRepertoireDto) {
    const worker = await this.getLinkedLeader(userId);
    return await this.addToWorkerRepertoire(worker._id.toString(), dto);
  }

  async addToWorkerRepertoire(
    workerId: string,
    dto: AddLeaderRepertoireDto,
  ) {
    await this.getLeaderWorker(workerId);
    const song = dto.song_id
      ? await this.songsService.getSongById(dto.song_id, true)
      : dto.title
        ? await this.songsService.findOrCreateSong(
            dto.title,
            dto.artist,
            dto.spotify_url,
          )
        : null;

    if (!song) {
      throw new BadRequestException(
        'Select a catalog song or provide a new song title',
      );
    }

    const songId = song._id.toString();
    const existing =
      await this.leaderRepertoireRepository.findByWorkerAndSong(
        workerId,
        songId,
      );

    if (existing) {
      throw new ConflictException(
        'This song is already in the leader repertoire',
      );
    }

    const entry = await this.leaderRepertoireRepository.insert(
      workerId,
      songId,
      this.cleanKey(dto.key),
    );

    return { ...entry, song };
  }

  async updateMyRepertoireKey(
    userId: string,
    entryId: string,
    key: string,
  ) {
    const worker = await this.getLinkedLeader(userId);
    return await this.updateWorkerRepertoireKey(
      worker._id.toString(),
      entryId,
      key,
    );
  }

  async updateWorkerRepertoireKey(
    workerId: string,
    entryId: string,
    key: string,
  ) {
    await this.getLeaderWorker(workerId);
    this.assertObjectId(entryId, 'Repertoire entry not found');
    const entry = await this.leaderRepertoireRepository.updateKey(
      entryId,
      workerId,
      this.cleanKey(key),
    );

    if (!entry) {
      throw new NotFoundException('Repertoire entry not found');
    }

    const song = await this.songsService.getSongById(entry.song_id.toString());
    return { ...entry, song };
  }

  async removeFromMyRepertoire(userId: string, entryId: string) {
    const worker = await this.getLinkedLeader(userId);
    return await this.removeFromWorkerRepertoire(
      worker._id.toString(),
      entryId,
    );
  }

  async removeFromWorkerRepertoire(workerId: string, entryId: string) {
    await this.getLeaderWorker(workerId);
    this.assertObjectId(entryId, 'Repertoire entry not found');
    const result = await this.leaderRepertoireRepository.delete(
      entryId,
      workerId,
    );

    if (!result.deletedCount) {
      throw new NotFoundException('Repertoire entry not found');
    }

    return { deleted: true };
  }

  async updateWorker(id: string, dto: UpdateWorkerDto) {
    await this.ensureUserLinkIsAvailable(dto.user_id, id);
    if (dto.worker_group_ids) {
      await this.workerGroupsService.assertIdsExist(dto.worker_group_ids);
    }

    const { leader_songs: leaderSongs, ...workerUpdate } = dto;
    const update = workerUpdate.user_id === null
      ? { $set: this.withoutUserId(workerUpdate), $unset: { user_id: 1 } }
      : workerUpdate;
    const worker = await this.workersRepository.updateRecord(
      { _id: id } as any,
      update as any,
    );

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    if (leaderSongs !== undefined) {
      if (worker.roles?.includes(WorkerRole.Leader)) {
        await this.replaceLegacyLeaderSongs(id, leaderSongs);
      } else {
        await this.leaderRepertoireRepository.deleteByWorker(id);
      }
    }

    return await this.withRepertoireSummary(worker);
  }

  async deleteWorker(id: string) {
    const result = await this.workersRepository.deleteRecord({ _id: id } as any);

    if (!result.deletedCount) {
      throw new NotFoundException('Worker not found');
    }

    await this.leaderRepertoireRepository.deleteByWorker(id);
    return result;
  }

  async getLegacyLeaderSongsForWorker(workerId: string) {
    const records = await this.leaderRepertoireRepository.findByWorker(
      workerId,
      '',
      1,
      500,
    );

    return records.items.map((entry: any) => ({
      title: entry.song.artist
        ? `${entry.song.title} - ${entry.song.artist}`
        : entry.song.title,
      key: entry.key,
    }));
  }

  private withoutUserId<T extends { user_id?: string | null }>(dto: T) {
    const update = { ...dto };
    delete update.user_id;
    return update;
  }

  private async ensureUserLinkIsAvailable(userId?: string | null, excludeWorkerId?: string) {
    if (!userId) {
      return;
    }

    const user = await this.usersService.findById(userId);

    if (
      !user ||
      user.role !== UserRole.Member ||
      !user.is_active ||
      user.is_verified === false
    ) {
      throw new BadRequestException(
        'Only active, verified member accounts can be linked to workers',
      );
    }

    const linkedWorker = await this.workersRepository.findByUserId(userId);

    if (linkedWorker && linkedWorker._id.toString() !== excludeWorkerId) {
      throw new ConflictException('This user account is already linked to another worker');
    }
  }

  async getWorkerGroupIds(worker: {
    worker_group_ids?: unknown[];
    label?: WorkerLabel;
  }) {
    if (worker.worker_group_ids?.length) {
      return worker.worker_group_ids.map(String);
    }

    const code = worker.label === WorkerLabel.Youth ? 'youth' : 'main';
    const groups = await this.workerGroupsService.getByCodes([code]);
    return groups.map((group) => group._id.toString());
  }

  private async resolveSavedWorkerGroupIds(
    ids?: string[],
    label?: WorkerLabel,
  ) {
    if (ids?.length) {
      await this.workerGroupsService.assertIdsExist(ids);
      return ids;
    }

    const code = label === WorkerLabel.Youth ? 'youth' : 'main';
    const groups = await this.workerGroupsService.getByCodes([code]);
    return groups.map((group) => group._id);
  }

  private async getLinkedLeader(userId: string) {
    const worker = await this.findWorkerByUserId(userId);

    if (!worker) {
      throw new ForbiddenException('Your account is not linked to a worker');
    }

    if (!worker.roles?.includes(WorkerRole.Leader)) {
      throw new ForbiddenException('Only leaders can manage leader songs');
    }

    return worker;
  }

  private async getLeaderWorker(workerId: string) {
    this.assertObjectId(workerId, 'Worker not found');
    const worker = await this.workersRepository.getRecordById(workerId);

    if (!worker) {
      throw new NotFoundException('Worker not found');
    }

    if (!worker.roles?.includes(WorkerRole.Leader)) {
      throw new BadRequestException('This worker is not a leader');
    }

    return worker;
  }

  private async replaceLegacyLeaderSongs(
    workerId: string,
    leaderSongs: LeaderSongDto[],
  ) {
    await this.leaderRepertoireRepository.deleteByWorker(workerId);

    for (const legacySong of leaderSongs) {
      const identity = this.parseLegacySongTitle(legacySong.title);
      const song = await this.songsService.findOrCreateSong(
        identity.title,
        identity.artist,
      );
      await this.leaderRepertoireRepository.upsert(
        workerId,
        song._id.toString(),
        this.cleanKey(legacySong.key),
      );
    }
  }

  private async migrateLegacyLeaderSongs() {
    const workers = await this.workersRepository.findWithLegacyLeaderSongs();

    for (const worker of workers) {
      for (const legacySong of worker.leader_songs ?? []) {
        const identity = this.parseLegacySongTitle(legacySong.title);
        const song = await this.songsService.findOrCreateSong(
          identity.title,
          identity.artist,
        );
        await this.leaderRepertoireRepository.upsert(
          worker._id.toString(),
          song._id.toString(),
          this.cleanKey(legacySong.key),
        );
      }

      await this.workersRepository.clearLegacyLeaderSongs(
        worker._id.toString(),
      );
    }
  }

  private parseLegacySongTitle(value: string) {
    const cleanValue = value.trim().replace(/\s+/g, ' ');
    const separatorIndex = cleanValue.lastIndexOf(' - ');

    if (separatorIndex < 1) {
      return { title: cleanValue, artist: '' };
    }

    return {
      title: cleanValue.slice(0, separatorIndex).trim(),
      artist: cleanValue.slice(separatorIndex + 3).trim(),
    };
  }

  private async withRepertoireSummary(worker: any) {
    const counts = await this.leaderRepertoireRepository.countByWorkers([
      worker._id.toString(),
    ]);

    return {
      ...worker,
      leader_song_count: counts.get(worker._id.toString()) ?? 0,
    };
  }

  private cleanKey(key: string) {
    const value = key.trim().replace(/\s+/g, ' ');

    if (!value) {
      throw new BadRequestException('Song key is required');
    }

    return value;
  }

  private normalizeSearch(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  private toPositiveInteger(value: number | string, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private assertObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(message);
    }
  }
}
