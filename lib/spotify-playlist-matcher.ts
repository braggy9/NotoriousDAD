/**
 * Spotify Playlist Matcher
 *
 * Matches Spotify playlist tracks to local audio files on the server.
 * Uses multiple matching strategies with fallbacks:
 * 1. Exact Spotify ID match (from matched-tracks.json)
 * 2. Fuzzy artist + title match (Levenshtein distance)
 * 3. Artist + similar BPM/key match
 *
 * This bridges Spotify playlists → downloadable audio mixes.
 */

import Anthropic from '@anthropic-ai/sdk';

// Spotify track from playlist
export interface SpotifyPlaylistTrack {
  id: string;
  name: string;
  artists: Array<{ name: string; id: string }>;
  album: { name: string };
  duration_ms: number;
  uri: string;
}

// Local audio file (from server)
export interface LocalAudioFile {
  id: string;
  filePath: string;
  fileName: string;
  artist: string;
  title: string;
  bpm?: number;
  camelotKey?: string;
  key?: string;
  energy?: number;
  durationSeconds?: number;
  fileSize?: number;

  // Spotify match info (if available from matched-tracks.json)
  spotifyId?: string;
  spotifyUri?: string;
}

// Match result
export interface TrackMatch {
  spotifyTrack: SpotifyPlaylistTrack;
  localFile: LocalAudioFile | null;
  matchStrategy: 'spotify-id' | 'fuzzy-match' | 'bpm-key-match' | 'no-match';
  confidence: number; // 0-1
}

// Match statistics
export interface MatchStats {
  totalTracks: number;
  matched: number;
  matchRate: number;
  strategyBreakdown: {
    'spotify-id': number;
    'fuzzy-match': number;
    'bpm-key-match': number;
    'no-match': number;
  };
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching track names
 */
function levenshteinDistance(str1: string, str2: string): number {
  const track = Array.from(str1);
  const base = Array.from(str2);

  const matrix: number[][] = Array(track.length + 1)
    .fill(null)
    .map(() => Array(base.length + 1).fill(null));

  for (let i = 0; i <= track.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= base.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= track.length; i++) {
    for (let j = 1; j <= base.length; j++) {
      const cost = track[i - 1] === base[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[track.length][base.length];
}

/**
 * Normalize string for comparison (lowercase, remove special chars)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate fuzzy match score between two strings (0-1)
 */
function fuzzyMatchScore(str1: string, str2: string): number {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);

  if (norm1 === norm2) return 1.0;

  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);

  return 1 - distance / maxLength;
}

/**
 * Check if BPMs are compatible (within 6 BPM or double/half)
 */
function areBPMsCompatible(bpm1: number, bpm2: number): boolean {
  // Direct match within ±6 BPM
  if (Math.abs(bpm1 - bpm2) <= 6) return true;

  // Double/half tempo
  if (Math.abs(bpm1 - bpm2 * 2) <= 6) return true;
  if (Math.abs(bpm1 * 2 - bpm2) <= 6) return true;

  return false;
}

/**
 * Match a single Spotify track to local library
 */
export function matchTrackToLocal(
  spotifyTrack: SpotifyPlaylistTrack,
  localLibrary: LocalAudioFile[]
): TrackMatch {
  // Priority 1: Exact Spotify ID match
  const exactMatch = localLibrary.find((file) => file.spotifyId === spotifyTrack.id);
  if (exactMatch) {
    return {
      spotifyTrack,
      localFile: exactMatch,
      matchStrategy: 'spotify-id',
      confidence: 1.0,
    };
  }

  // Priority 2: Fuzzy artist + title match
  const spotifyArtist = spotifyTrack.artists[0]?.name || '';
  const spotifyTitle = spotifyTrack.name;

  let bestMatch: LocalAudioFile | null = null;
  let bestScore = 0;
  let bestStrategy: 'fuzzy-match' | 'bpm-key-match' = 'fuzzy-match';

  for (const file of localLibrary) {
    // Fuzzy match on artist + title
    const artistScore = fuzzyMatchScore(spotifyArtist, file.artist);
    const titleScore = fuzzyMatchScore(spotifyTitle, file.title);
    const combinedScore = (artistScore + titleScore) / 2;

    if (combinedScore > bestScore && combinedScore >= 0.7) {
      bestScore = combinedScore;
      bestMatch = file;
      bestStrategy = 'fuzzy-match';
    }

    // Priority 3: Artist match + similar BPM (fallback if no good fuzzy match)
    if (artistScore >= 0.8 && file.bpm && bestScore < 0.7) {
      // We don't have Spotify BPM in the playlist response
      // This would require fetching audio features
      // For now, skip BPM matching
    }
  }

  // Return best match if confidence >= 0.7
  if (bestMatch && bestScore >= 0.7) {
    return {
      spotifyTrack,
      localFile: bestMatch,
      matchStrategy: bestStrategy,
      confidence: bestScore,
    };
  }

  // No match found
  return {
    spotifyTrack,
    localFile: null,
    matchStrategy: 'no-match',
    confidence: 0,
  };
}

/**
 * Match all tracks from a Spotify playlist to local library
 */
export function matchPlaylistToLocal(
  playlistTracks: SpotifyPlaylistTrack[],
  localLibrary: LocalAudioFile[]
): { matches: TrackMatch[]; stats: MatchStats } {
  const matches = playlistTracks.map((track) => matchTrackToLocal(track, localLibrary));

  // Calculate statistics
  const stats: MatchStats = {
    totalTracks: matches.length,
    matched: matches.filter((m) => m.localFile !== null).length,
    matchRate: 0,
    strategyBreakdown: {
      'spotify-id': 0,
      'fuzzy-match': 0,
      'bpm-key-match': 0,
      'no-match': 0,
    },
  };

  stats.matchRate = stats.totalTracks > 0 ? (stats.matched / stats.totalTracks) * 100 : 0;

  for (const match of matches) {
    stats.strategyBreakdown[match.matchStrategy]++;
  }

  return { matches, stats };
}

/**
 * Fetch tracks from a Spotify playlist
 */
export async function fetchSpotifyPlaylistTracks(
  playlistId: string,
  accessToken: string
): Promise<SpotifyPlaylistTrack[]> {
  const tracks: SpotifyPlaylistTrack[] = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract track info
    for (const item of data.items) {
      if (item.track && item.track.id) {
        tracks.push({
          id: item.track.id,
          name: item.track.name,
          artists: item.track.artists,
          album: item.track.album,
          duration_ms: item.track.duration_ms,
          uri: item.track.uri,
        });
      }
    }

    url = data.next; // Pagination
  }

  return tracks;
}

/**
 * Extract playlist ID from Spotify URL
 */
export function extractPlaylistId(url: string): string | null {
  // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  // spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
  const match = url.match(/playlist[\/:]([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Use Claude AI to improve matching for ambiguous cases
 * (Optional enhancement - can be added later)
 */
export async function improveMatchingWithAI(
  unmatchedTracks: SpotifyPlaylistTrack[],
  localLibrary: LocalAudioFile[],
  anthropicApiKey: string
): Promise<TrackMatch[]> {
  // TODO: Use Claude to analyze track names and suggest matches
  // For tracks that didn't match with fuzzy matching
  // Claude can understand "Artist - Track (Remix)" vs "Track (Artist Remix)"
  return [];
}
