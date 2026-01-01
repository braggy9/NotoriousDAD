// Beatport chart scraper and Spotify matcher
import { SpotifyTrackWithFeatures } from './types';

export interface BeatportTrack {
  title: string;
  artists: string[];
  remixers?: string[];
  mix?: string;
  label: string;
  releaseDate: string;
  bpm: number;
  key: string;
  genre: string;
  chartPosition?: number;
  beatportUrl?: string;
}

export interface BeatportChart {
  genre: string;
  tracks: BeatportTrack[];
  updatedAt: string;
}

/**
 * Scrape Beatport Top 100 chart for a specific genre
 * Note: This is a simplified version - in production you'd use Puppeteer or Cheerio
 */
export async function scrapeBeatportChart(genre: string): Promise<BeatportChart> {
  // Beatport genre slugs
  const genreMap: Record<string, string> = {
    'tech-house': 'tech-house',
    'techno': 'techno',
    'house': 'house',
    'progressive-house': 'progressive-house',
    'deep-house': 'deep-house',
    'electro-house': 'electro-house',
    'trance': 'trance',
    'drum-and-bass': 'drum-and-bass',
    'dubstep': 'dubstep',
    'minimal': 'minimal-deep-tech',
  };

  const genreSlug = genreMap[genre.toLowerCase()] || 'tech-house';

  // For now, return a mock response
  // In production, you'd fetch from Beatport's website
  console.log(`📊 Scraping Beatport ${genre} chart...`);

  // TODO: Implement actual scraping with Puppeteer or API
  return {
    genre,
    tracks: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Match a Beatport track to a Spotify track using fuzzy matching
 */
export function matchBeatportToSpotify(
  beatportTrack: BeatportTrack,
  spotifyTracks: SpotifyTrackWithFeatures[]
): SpotifyTrackWithFeatures | null {
  // Normalize strings for comparison
  const normalizeBeatport = (str: string) =>
    str.toLowerCase().replace(/[^\w\s]/g, '').trim();

  const beatportTitle = normalizeBeatport(beatportTrack.title);
  const beatportArtists = beatportTrack.artists.map(normalizeBeatport);

  // Strategy 1: Exact title + artist match
  for (const track of spotifyTracks) {
    const spotifyTitle = normalizeBeatport(track.name);
    const spotifyArtists = track.artists.map((a: any) => normalizeBeatport(a.name));

    // Check if title matches
    const titleMatch = spotifyTitle.includes(beatportTitle) || beatportTitle.includes(spotifyTitle);

    // Check if at least one artist matches
    const artistMatch = beatportArtists.some(bArtist =>
      spotifyArtists.some(sArtist => sArtist.includes(bArtist) || bArtist.includes(sArtist))
    );

    if (titleMatch && artistMatch) {
      return track;
    }
  }

  // Strategy 2: Fuzzy match with BPM tolerance
  const bpmTolerance = 2;
  for (const track of spotifyTracks) {
    const spotifyTitle = normalizeBeatport(track.name);
    const spotifyArtists = track.artists.map((a: any) => normalizeBeatport(a.name));
    const spotifyBpm = track.tempo || 0;

    // Title similarity (check if either contains the other)
    const titleSimilar =
      spotifyTitle.includes(beatportTitle) ||
      beatportTitle.includes(spotifyTitle) ||
      levenshteinDistance(spotifyTitle, beatportTitle) < 5;

    // Artist match
    const artistMatch = beatportArtists.some(bArtist =>
      spotifyArtists.some(sArtist =>
        sArtist.includes(bArtist) ||
        bArtist.includes(sArtist) ||
        levenshteinDistance(sArtist, bArtist) < 3
      )
    );

    // BPM match (within tolerance)
    const bpmMatch = Math.abs(spotifyBpm - beatportTrack.bpm) <= bpmTolerance;

    if (titleSimilar && artistMatch && bpmMatch) {
      return track;
    }
  }

  return null;
}

/**
 * Levenshtein distance for fuzzy string matching
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Search Spotify for a Beatport track
 */
export async function searchSpotifyForBeatportTrack(
  beatportTrack: BeatportTrack,
  accessToken: string
): Promise<SpotifyTrackWithFeatures | null> {
  // Build search query
  const artists = beatportTrack.artists.join(' ');
  const query = `track:${beatportTrack.title} artist:${artists}`;

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const tracks = data.tracks?.items || [];

    if (tracks.length === 0) {
      return null;
    }

    // Use fuzzy matching to find best match
    return matchBeatportToSpotify(beatportTrack, tracks);
  } catch (error) {
    console.error('Error searching Spotify for Beatport track:', error);
    return null;
  }
}

/**
 * Get popular Beatport genres for UI
 */
export function getBeatportGenres(): string[] {
  return [
    'Tech House',
    'Techno',
    'House',
    'Progressive House',
    'Deep House',
    'Electro House',
    'Trance',
    'Melodic House & Techno',
    'Drum & Bass',
    'Dubstep',
    'Minimal / Deep Tech',
    'Afro House',
    'Bass House',
    'Future House',
    'Hardstyle',
  ];
}

/**
 * Enhanced matching: Try to find Beatport track in user's library
 */
export async function findBeatportTracksInLibrary(
  beatportTracks: BeatportTrack[],
  userTracks: SpotifyTrackWithFeatures[],
  accessToken: string
): Promise<Array<{ beatport: BeatportTrack; spotify: SpotifyTrackWithFeatures }>> {
  const matches: Array<{ beatport: BeatportTrack; spotify: SpotifyTrackWithFeatures }> = [];

  console.log(`🔍 Matching ${beatportTracks.length} Beatport tracks to library...`);

  for (const beatportTrack of beatportTracks) {
    // First try to match within user's library
    let spotifyTrack = matchBeatportToSpotify(beatportTrack, userTracks);

    // If not found in library, search Spotify
    if (!spotifyTrack) {
      spotifyTrack = await searchSpotifyForBeatportTrack(beatportTrack, accessToken);
    }

    if (spotifyTrack) {
      matches.push({ beatport: beatportTrack, spotify: spotifyTrack });
    }
  }

  console.log(`✓ Matched ${matches.length}/${beatportTracks.length} Beatport tracks`);

  return matches;
}

/**
 * Sample Beatport chart data (for testing without scraping)
 */
export function getSampleBeatportChart(genre: string): BeatportChart {
  const sampleTracks: Record<string, BeatportTrack[]> = {
    'tech-house': [
      { title: 'Move Your Body', artists: ['Cloonee'], bpm: 128, key: '5A', genre: 'Tech House', label: 'Techne', releaseDate: '2024-01-15', chartPosition: 1 },
      { title: 'Underground', artists: ['Wade'], bpm: 127, key: '8A', genre: 'Tech House', label: 'Solid Grooves', releaseDate: '2024-01-10', chartPosition: 2 },
    ],
    'techno': [
      { title: 'Rave', artists: ['Amelie Lens'], bpm: 138, key: '12A', genre: 'Techno', label: 'LNSD', releaseDate: '2024-01-12', chartPosition: 1 },
      { title: 'Spfdj', artists: ['Charlotte de Witte'], bpm: 140, key: '9A', genre: 'Techno', label: 'KNTXT', releaseDate: '2024-01-08', chartPosition: 2 },
    ],
    'house': [
      { title: 'Show Me Love', artists: ['Dom Dolla'], bpm: 124, key: '7A', genre: 'House', label: 'Sweat It Out', releaseDate: '2024-01-14', chartPosition: 1 },
      { title: 'Feel Good', artists: ['Purple Disco Machine'], bpm: 123, key: '11B', genre: 'House', label: 'Columbia', releaseDate: '2024-01-11', chartPosition: 2 },
    ],
    'progressive-house': [
      { title: 'Opus', artists: ['Eric Prydz'], bpm: 126, key: '10A', genre: 'Progressive House', label: 'Pryda', releaseDate: '2024-01-13', chartPosition: 1 },
      { title: 'Strobe', artists: ['deadmau5'], bpm: 128, key: '6A', genre: 'Progressive House', label: 'mau5trap', releaseDate: '2024-01-09', chartPosition: 2 },
    ],
    'deep-house': [
      { title: 'Need U', artists: ['Duke Dumont'], bpm: 122, key: '9A', genre: 'Deep House', label: 'Blasé Boys Club', releaseDate: '2024-01-16', chartPosition: 1 },
      { title: 'Cola', artists: ['CamelPhat', 'Elderbrook'], bpm: 123, key: '1A', genre: 'Deep House', label: 'Defected', releaseDate: '2024-01-12', chartPosition: 2 },
    ],
    'melodic-house': [
      { title: 'Your Mind', artists: ['Adam Port'], bpm: 120, key: '7A', genre: 'Melodic House', label: 'Keinemusik', releaseDate: '2024-01-15', chartPosition: 1 },
      { title: 'Peggy Gou', artists: ['Starry Night'], bpm: 121, key: '4A', genre: 'Melodic House', label: 'Ninja Tune', releaseDate: '2024-01-10', chartPosition: 2 },
    ],
    'trance': [
      { title: 'Adagio for Strings', artists: ['Tiësto'], bpm: 136, key: '8A', genre: 'Trance', label: 'Black Hole', releaseDate: '2024-01-14', chartPosition: 1 },
      { title: 'Shivers', artists: ['Armin van Buuren'], bpm: 138, key: '12A', genre: 'Trance', label: 'Armada', releaseDate: '2024-01-11', chartPosition: 2 },
    ],
    'psytrance': [
      { title: 'The Tribe', artists: ['Vini Vici'], bpm: 142, key: '9A', genre: 'Psytrance', label: 'Iboga', releaseDate: '2024-01-13', chartPosition: 1 },
      { title: 'Great Spirit', artists: ['Armin van Buuren', 'Vini Vici'], bpm: 138, key: '5A', genre: 'Psytrance', label: 'Armada', releaseDate: '2024-01-09', chartPosition: 2 },
    ],
    'drum-and-bass': [
      { title: 'Tarantula', artists: ['Pendulum'], bpm: 174, key: '11A', genre: 'Drum & Bass', label: 'Breakbeat Kaos', releaseDate: '2024-01-15', chartPosition: 1 },
      { title: 'Wilkinson', artists: ['Afterglow'], bpm: 174, key: '7A', genre: 'Drum & Bass', label: 'RAM', releaseDate: '2024-01-12', chartPosition: 2 },
    ],
    'dubstep': [
      { title: 'Scary Monsters', artists: ['Skrillex'], bpm: 140, key: '10A', genre: 'Dubstep', label: 'OWSLA', releaseDate: '2024-01-14', chartPosition: 1 },
      { title: 'Cracks', artists: ['Flux Pavilion'], bpm: 140, key: '8A', genre: 'Dubstep', label: 'Circus', releaseDate: '2024-01-11', chartPosition: 2 },
    ],
    'bass-house': [
      { title: 'Bust Them', artists: ['Jauz'], bpm: 128, key: '6A', genre: 'Bass House', label: 'Bite This!', releaseDate: '2024-01-13', chartPosition: 1 },
      { title: 'Core', artists: ['RL Grime'], bpm: 150, key: '9A', genre: 'Bass House', label: 'WeDidIt', releaseDate: '2024-01-10', chartPosition: 2 },
    ],
    'future-house': [
      { title: 'Gecko', artists: ['Oliver Heldens'], bpm: 128, key: '8A', genre: 'Future House', label: 'Spinnin', releaseDate: '2024-01-15', chartPosition: 1 },
      { title: 'Animals', artists: ['Martin Garrix'], bpm: 128, key: '5A', genre: 'Future House', label: 'STMPD RCRDS', releaseDate: '2024-01-12', chartPosition: 2 },
    ],
    'electro-house': [
      { title: 'Levels', artists: ['Avicii'], bpm: 126, key: '7A', genre: 'Electro House', label: 'Universal', releaseDate: '2024-01-14', chartPosition: 1 },
      { title: 'Reload', artists: ['Sebastian Ingrosso'], bpm: 128, key: '11A', genre: 'Electro House', label: 'Refune', releaseDate: '2024-01-11', chartPosition: 2 },
    ],
    'minimal': [
      { title: 'Changes', artists: ['Richie Hawtin'], bpm: 125, key: '9A', genre: 'Minimal', label: 'M_nus', releaseDate: '2024-01-13', chartPosition: 1 },
      { title: 'Pale Blue Dot', artists: ['Ricardo Villalobos'], bpm: 124, key: '4A', genre: 'Minimal', label: 'Perlon', releaseDate: '2024-01-10', chartPosition: 2 },
    ],
    'afro-house': [
      { title: 'Jerusalema', artists: ['Master KG'], bpm: 112, key: '6A', genre: 'Afro House', label: 'Open Mic', releaseDate: '2024-01-15', chartPosition: 1 },
      { title: 'Love & Hate', artists: ['Black Coffee'], bpm: 120, key: '9A', genre: 'Afro House', label: 'Ultra', releaseDate: '2024-01-12', chartPosition: 2 },
    ],
    'garage': [
      { title: 'Flowers', artists: ['Sweet Female Attitude'], bpm: 130, key: '8A', genre: 'Garage', label: 'Millie', releaseDate: '2024-01-14', chartPosition: 1 },
      { title: 'Fill Me In', artists: ['Craig David'], bpm: 131, key: '5A', genre: 'Garage', label: 'Wildstar', releaseDate: '2024-01-11', chartPosition: 2 },
    ],
    'breakbeat': [
      { title: 'Block Rockin Beats', artists: ['The Chemical Brothers'], bpm: 131, key: '11A', genre: 'Breakbeat', label: 'Virgin', releaseDate: '2024-01-13', chartPosition: 1 },
      { title: 'Right Here Right Now', artists: ['Fatboy Slim'], bpm: 143, key: '7A', genre: 'Breakbeat', label: 'Skint', releaseDate: '2024-01-10', chartPosition: 2 },
    ],
    'leftfield-bass': [
      { title: 'Girl', artists: ['SBTRKT'], bpm: 138, key: '6A', genre: 'Leftfield Bass', label: 'Young Turks', releaseDate: '2024-01-15', chartPosition: 1 },
      { title: 'Holding On', artists: ['Disclosure'], bpm: 135, key: '9A', genre: 'Leftfield Bass', label: 'Island', releaseDate: '2024-01-12', chartPosition: 2 },
    ],
    'hard-dance': [
      { title: 'Psycho', artists: ['Headhunterz'], bpm: 150, key: '10A', genre: 'Hard Dance', label: 'Scantraxx', releaseDate: '2024-01-14', chartPosition: 1 },
      { title: 'Dragonborn', artists: ['Headhunterz'], bpm: 150, key: '8A', genre: 'Hard Dance', label: 'Scantraxx', releaseDate: '2024-01-11', chartPosition: 2 },
    ],
    'indie-dance': [
      { title: 'Get Lucky', artists: ['Daft Punk'], bpm: 116, key: '6A', genre: 'Indie Dance', label: 'Columbia', releaseDate: '2024-01-13', chartPosition: 1 },
      { title: 'Midnight City', artists: ['M83'], bpm: 105, key: '10A', genre: 'Indie Dance', label: 'Mute', releaseDate: '2024-01-10', chartPosition: 2 },
    ],
  };

  return {
    genre,
    tracks: sampleTracks[genre] || [],
    updatedAt: new Date().toISOString(),
  };
}
