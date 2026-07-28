import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from 'src/auth/auth.module';
import { Song, SongSchema } from './schemas/songs.schema';
import { SongsController } from './songs.controller';
import { SongsRepository } from './repositories/songs.repository';
import { SongsService } from './songs.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Song.name, schema: SongSchema }]),
    AuthModule,
  ],
  controllers: [SongsController],
  providers: [SongsService, SongsRepository],
  exports: [SongsService],
})
export class SongsModule {}
