// Parse Spotify/Apple Music playlist URLs and use as seeds
import { SpotifyTrackWithFeatures } from './types';

/**
 * Extract playlist ID from various Spotify URL formats
 */
export function extractSpotifyPlaylistId(url: string): string | null {
  // Handle various Spotify URL formats:
  // https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  // spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
  const patterns = [
    /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
    /spotify:playlist:([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Fetch tracks from a Spotify playlist
 */
export async function fetchSpotifyPlaylist(
  playlistId: string,
  accessToken: string
): Promise<{ name: string; tracks: any[] }> {
  // Get playlist metadata
  const playlistResponse = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!playlistResponse.ok) {
    throw new Error('Failed to fetch playlist');
  }

  const playlistData = await playlistResponse.json();

  // Get all tracks (handle pagination)
  let allTracks: any[] = [];
  let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) break;

    const data = await response.json();
    allTracks = allTracks.concat(data.items.map((item: any) => item.track));
    nextUrl = data.next;
  }

  return {
    name: playlistData.name,
    tracks: allTracks.filter(Boolean), // Remove null tracks
  };
}

/**
 * Analyze a seed playlist to extract common characteristics
 */
export function analyzePlaylistCharacteristics(tracks: any[]): {
  commonArtists: string[];
  avgBPM: number;
  avgEnergy: number;
  genres: string[];
  bpmRange: { min: number; max: number };
  energyRange: { min: number; max: number };
} {
  // Extract artists with multiple appearances
  const artistCounts: Record<string, number> = {};
  tracks.forEach(track => {
    track.artists?.forEach((artist: any) => {
      artistCounts[artist.name] = (artistCounts[artist.name] || 0) + 1;
    });
  });

  // Get artists that appear more than once
  const commonArtists = Object.entries(artistCounts)
    .filter(([_, count]) => count > 1)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 10)
    .map(([artist]) => artist);

  // Calculate BPM stats (if available)
  const bpms = tracks
    .map(t => t.tempo || t.mikData?.bpm)
    .filter(Boolean);
  const avgBPM = bpms.length > 0
    ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length)
    : 120;
  const bpmRange = {
    min: bpms.length > 0 ? Math.floor(Math.min(...bpms)) : 100,
    max: bpms.length > 0 ? Math.ceil(Math.max(...bpms)) : 140,
  };

  // Calculate energy stats (if available)
  const energies = tracks
    .map(t => t.energy || t.mikData?.energy)
    .filter(e => e !== null && e !== undefined);
  const avgEnergy = energies.length > 0
    ? energies.reduce((a, b) => a + b, 0) / energies.length
    : 0.5;
  const energyRange = {
    min: energies.length > 0 ? Math.min(...energies) : 0.3,
    max: energies.length > 0 ? Math.max(...energies) : 0.8,
  };

  // Extract genres (if available)
  const genreSet = new Set<string>();
  tracks.forEach(track => {
    if (track.mikData?.genre) genreSet.add(track.mikData.genre);
  });

  return {
    commonArtists,
    avgBPM,
    avgEnergy,
    genres: Array.from(genreSet).slice(0, 5),
    bpmRange,
    energyRange,
  };
}

/**
 * Check if input contains a Spotify playlist URL
 */
export function containsSpotifyPlaylistUrl(text: string): boolean {
  return /spotify\.com\/playlist\/|spotify:playlist:/.test(text);
}

/**
 * Generate a natural language description from playlist analysis
 */
export function describePlaylist(analysis: ReturnType<typeof analyzePlaylistCharacteristics>, playlistName: string): string {
  const parts: string[] = [`Similar to "${playlistName}"`];

  if (analysis.commonArtists.length > 0) {
    parts.push(`featuring ${analysis.commonArtists.slice(0, 3).join(', ')}`);
  }

  if (analysis.avgBPM > 0) {
    parts.push(`${analysis.avgBPM} BPM average`);
  }

  if (analysis.genres.length > 0) {
    parts.push(`genres: ${analysis.genres.join(', ')}`);
  }

  const energyLevel = analysis.avgEnergy > 0.7 ? 'high energy'
    : analysis.avgEnergy > 0.4 ? 'medium energy'
    : 'low energy';
  parts.push(energyLevel);

  return parts.join(' • ');
}
