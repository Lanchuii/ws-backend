import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BaseRepository } from 'src/common/base/base.repository';
import { Song, SongDocument } from '../schemas/songs.schema';

export class SongsRepository extends BaseRepository<SongDocument> {
  constructor(
    @InjectModel(Song.name)
    private readonly songModel: Model<SongDocument>,
  ) {
    super(songModel);
  }

  async findByNormalizedIdentity(title: string, artist: string) {
    return await this.songModel
      .findOne({
        normalized_title: title,
        normalized_artist: artist,
      })
      .lean()
      .exec();
  }

  async search(
    search: string,
    page: number,
    limit: number,
    includeInactive: boolean,
  ) {
    const query: any = includeInactive ? {} : { is_active: true };

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), 'i');
      query.$or = [
        { normalized_title: pattern },
        { normalized_artist: pattern },
      ];
    }

    const [items, total] = await Promise.all([
      this.songModel
        .find(query)
        .sort({ normalized_title: 1, normalized_artist: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.songModel.countDocuments(query).exec(),
    ]);

    return {
      items,
      pagination: {
        page: total ? page : 0,
        per_page: limit,
        last_page: total ? Math.ceil(total / limit) : 0,
        total_rows: total,
      },
    };
  }
}

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
