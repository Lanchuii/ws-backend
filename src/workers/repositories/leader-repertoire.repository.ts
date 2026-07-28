import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LeaderRepertoire,
  LeaderRepertoireDocument,
} from '../schemas/leader-repertoire.schema';

export class LeaderRepertoireRepository {
  constructor(
    @InjectModel(LeaderRepertoire.name)
    private readonly repertoireModel: Model<LeaderRepertoireDocument>,
  ) {}

  async findByWorker(
    workerId: string,
    search: string,
    page: number,
    limit: number,
  ) {
    const songMatch: any = {};

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), 'i');
      songMatch.$or = [
        { 'song.normalized_title': pattern },
        { 'song.normalized_artist': pattern },
      ];
    }

    const [result] = await this.repertoireModel.aggregate([
      { $match: { worker_id: new Types.ObjectId(workerId) } },
      {
        $lookup: {
          from: 'songs',
          localField: 'song_id',
          foreignField: '_id',
          as: 'song',
        },
      },
      { $unwind: '$song' },
      ...(Object.keys(songMatch).length ? [{ $match: songMatch }] : []),
      { $sort: { 'song.normalized_title': 1, 'song.normalized_artist': 1 } },
      {
        $facet: {
          items: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                worker_id: 1,
                song_id: 1,
                key: 1,
                createdAt: 1,
                updatedAt: 1,
                song: {
                  _id: '$song._id',
                  title: '$song.title',
                  artist: '$song.artist',
                  spotify_url: '$song.spotify_url',
                  is_active: '$song.is_active',
                },
              },
            },
          ],
          metadata: [{ $count: 'total' }],
        },
      },
    ]);

    const total = result?.metadata?.[0]?.total ?? 0;

    return {
      items: result?.items ?? [],
      pagination: {
        page: total ? page : 0,
        per_page: limit,
        last_page: total ? Math.ceil(total / limit) : 0,
        total_rows: total,
      },
    };
  }

  async findByIdForWorker(entryId: string, workerId: string) {
    return await this.repertoireModel
      .findOne({
        _id: new Types.ObjectId(entryId),
        worker_id: new Types.ObjectId(workerId),
      })
      .lean()
      .exec();
  }

  async findByWorkerAndSong(workerId: string, songId: string) {
    return await this.repertoireModel
      .findOne({
        worker_id: new Types.ObjectId(workerId),
        song_id: new Types.ObjectId(songId),
      })
      .lean()
      .exec();
  }

  async insert(workerId: string, songId: string, key: string) {
    const record = await this.repertoireModel.create({
      worker_id: new Types.ObjectId(workerId),
      song_id: new Types.ObjectId(songId),
      key,
    });
    return record.toObject();
  }

  async upsert(workerId: string, songId: string, key: string) {
    return await this.repertoireModel
      .findOneAndUpdate(
        {
          worker_id: new Types.ObjectId(workerId),
          song_id: new Types.ObjectId(songId),
        },
        { $set: { key } },
        { new: true, upsert: true },
      )
      .lean()
      .exec();
  }

  async updateKey(entryId: string, workerId: string, key: string) {
    return await this.repertoireModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(entryId),
          worker_id: new Types.ObjectId(workerId),
        },
        { $set: { key } },
        { new: true },
      )
      .lean()
      .exec();
  }

  async delete(entryId: string, workerId: string) {
    return await this.repertoireModel
      .deleteOne({
        _id: new Types.ObjectId(entryId),
        worker_id: new Types.ObjectId(workerId),
      })
      .exec();
  }

  async deleteByWorker(workerId: string) {
    return await this.repertoireModel
      .deleteMany({ worker_id: new Types.ObjectId(workerId) })
      .exec();
  }

  async countByWorkers(workerIds: string[]) {
    if (!workerIds.length) {
      return new Map<string, number>();
    }

    const counts = await this.repertoireModel.aggregate([
      {
        $match: {
          worker_id: {
            $in: workerIds.map((id) => new Types.ObjectId(id)),
          },
        },
      },
      { $group: { _id: '$worker_id', count: { $sum: 1 } } },
    ]);

    return new Map<string, number>(
      counts.map((item) => [item._id.toString(), item.count]),
    );
  }
}

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
