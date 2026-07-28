import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SongsRepository } from './repositories/songs.repository';
import { SongsService } from './songs.service';

describe('SongsService', () => {
  let service: SongsService;
  const repository = {
    search: jest.fn(),
    getRecordById: jest.fn(),
    findByNormalizedIdentity: jest.fn(),
    insertRecord: jest.fn(),
    updateRecord: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SongsService,
        { provide: SongsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(SongsService);
    jest.clearAllMocks();
  });

  it('normalizes search and caps page size', async () => {
    repository.search.mockResolvedValue({
      items: [],
      pagination: { page: 0, per_page: 50, last_page: 0, total_rows: 0 },
    });

    await service.getSongs('  Holy   Forever ', '2', '100');

    expect(repository.search).toHaveBeenCalledWith(
      'holy forever',
      2,
      50,
      false,
    );
  });

  it('creates a normalized catalog song', async () => {
    repository.findByNormalizedIdentity.mockResolvedValue(null);
    repository.insertRecord.mockImplementation(async (value) => value);

    const song = await service.createSong({
      title: '  Holy   Forever ',
      artist: ' Chris Tomlin ',
    });

    expect(song).toMatchObject({
      title: 'Holy Forever',
      artist: 'Chris Tomlin',
      normalized_title: 'holy forever',
      normalized_artist: 'chris tomlin',
      is_active: true,
    });
  });

  it('rejects duplicate title and artist identities', async () => {
    repository.findByNormalizedIdentity.mockResolvedValue({
      _id: 'song-id',
    });

    await expect(
      service.createSong({
        title: 'Holy Forever',
        artist: 'Chris Tomlin',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns an existing song during find-or-create', async () => {
    repository.findByNormalizedIdentity.mockResolvedValue({
      _id: 'song-id',
      title: 'Holy Forever',
      artist: 'Chris Tomlin',
    });

    const song = await service.findOrCreateSong(
      'Holy Forever',
      'Chris Tomlin',
    );

    expect(song._id).toBe('song-id');
    expect(repository.insertRecord).not.toHaveBeenCalled();
  });
});
