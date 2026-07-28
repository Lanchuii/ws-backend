import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { SongsRepository } from './repositories/songs.repository';

@Injectable()
export class SongsService {
  constructor(private readonly songsRepository: SongsRepository) {}

  async getSongs(
    search = '',
    pageValue: number | string = 1,
    limitValue: number | string = 10,
    includeInactive = false,
  ) {
    const page = this.toPositiveInteger(pageValue, 1);
    const limit = Math.min(this.toPositiveInteger(limitValue, 10), 50);

    return await this.songsRepository.search(
      this.normalize(search),
      page,
      limit,
      includeInactive,
    );
  }

  async getSongById(id: string, requireActive = false) {
    this.assertObjectId(id);
    const song = await this.songsRepository.getRecordById(id);

    if (!song || (requireActive && !song.is_active)) {
      throw new NotFoundException('Song not found');
    }

    return song;
  }

  async createSong(dto: CreateSongDto) {
    const identity = this.getIdentity(dto.title, dto.artist);
    const existing = await this.songsRepository.findByNormalizedIdentity(
      identity.normalized_title,
      identity.normalized_artist,
    );

    if (existing) {
      throw new ConflictException('This song already exists in the catalog');
    }

    return await this.songsRepository.insertRecord({
      ...identity,
      spotify_url: dto.spotify_url?.trim() || undefined,
      is_active: dto.is_active ?? true,
    } as any);
  }

  async findOrCreateSong(
    title: string,
    artist?: string,
    spotifyUrl?: string,
  ) {
    const identity = this.getIdentity(title, artist);
    const existing = await this.songsRepository.findByNormalizedIdentity(
      identity.normalized_title,
      identity.normalized_artist,
    );

    if (existing) {
      return existing;
    }

    try {
      return await this.songsRepository.insertRecord({
        ...identity,
        spotify_url: spotifyUrl?.trim() || undefined,
        is_active: true,
      } as any);
    } catch (error: any) {
      if (error?.code === 11000) {
        const concurrent = await this.songsRepository.findByNormalizedIdentity(
          identity.normalized_title,
          identity.normalized_artist,
        );

        if (concurrent) {
          return concurrent;
        }
      }

      throw error;
    }
  }

  async updateSong(id: string, dto: UpdateSongDto) {
    const current = await this.getSongById(id);
    const identity = this.getIdentity(
      dto.title ?? current.title,
      dto.artist ?? current.artist,
    );
    const duplicate = await this.songsRepository.findByNormalizedIdentity(
      identity.normalized_title,
      identity.normalized_artist,
    );

    if (duplicate && duplicate._id.toString() !== id) {
      throw new ConflictException('This song already exists in the catalog');
    }

    const song = await this.songsRepository.updateRecord(
      { _id: id } as any,
      {
        ...identity,
        ...(dto.spotify_url !== undefined
          ? { spotify_url: dto.spotify_url.trim() || undefined }
          : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      } as any,
    );

    if (!song) {
      throw new NotFoundException('Song not found');
    }

    return song;
  }

  private getIdentity(title: string, artist?: string) {
    const cleanTitle = this.cleanDisplayValue(title);
    const cleanArtist = this.cleanDisplayValue(artist ?? '');

    if (!cleanTitle) {
      throw new ConflictException('Song title is required');
    }

    return {
      title: cleanTitle,
      artist: cleanArtist,
      normalized_title: this.normalize(cleanTitle),
      normalized_artist: this.normalize(cleanArtist),
    };
  }

  private cleanDisplayValue(value: string) {
    return value.trim().replace(/\s+/g, ' ');
  }

  private normalize(value: string) {
    return this.cleanDisplayValue(value).toLocaleLowerCase();
  }

  private toPositiveInteger(value: number | string, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private assertObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Song not found');
    }
  }
}
