import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { UserRole } from 'src/common/enums/user-role.enum';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { SongsService } from './songs.service';

@Controller('songs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Get()
  async getSongs(
    @Query('search') search = '',
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('include_inactive') includeInactive = 'false',
  ) {
    return await this.songsService.getSongs(
      search,
      page,
      limit,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  async getSongById(@Param('id') id: string) {
    return await this.songsService.getSongById(id);
  }

  @Post()
  @Roles(UserRole.Admin)
  async createSong(@Body() dto: CreateSongDto) {
    return await this.songsService.createSong(dto);
  }

  @Patch(':id')
  @Roles(UserRole.Admin)
  async updateSong(@Param('id') id: string, @Body() dto: UpdateSongDto) {
    return await this.songsService.updateSong(id, dto);
  }
}
