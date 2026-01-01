// djay Pro playlist export formats
import { SpotifyTrackWithFeatures } from './types';

/**
 * Generate M3U8 playlist with rich metadata for djay Pro
 */
export function generateM3U8Playlist(
  tracks: SpotifyTrackWithFeatures[],
  playlistName: string,
  metadata?: {
    description?: string;
    harmonicMixPercentage?: number;
    avgTransitionScore?: number;
    constraints?: string;
  }
): string {
  const lines: string[] = [];

  // Extended M3U header
  lines.push('#EXTM3U');

  // Playlist metadata
  lines.push(`#PLAYLIST:${playlistName}`);

  if (metadata?.description) {
    lines.push(`#EXTALB:${metadata.description}`);
  }

  if (metadata?.harmonicMixPercentage) {
    lines.push(`#EXTGENRE:Harmonic Mix ${metadata.harmonicMixPercentage}%`);
  }

  // Add each track with rich metadata
  tracks.forEach((track, index) => {
    const duration = Math.round((track.duration_ms || 0) / 1000);
    const artist = track.artists.map(a => a.name).join(', ');
    const name = track.name;

    // Get track metadata
    const bpm = Math.round(track.tempo || track.mikData?.bpm || 0);
    const key = track.camelotKey || track.mikData?.camelotKey || '';
    const energy = track.energy
      ? Math.round(track.energy * 10)
      : track.mikData?.energy
      ? Math.round(track.mikData.energy * 10)
      : 0;

    // Extended info with metadata
    const metadata = [];
    if (bpm > 0) metadata.push(`${bpm} BPM`);
    if (key) metadata.push(`Key: ${key}`);
    if (energy > 0) metadata.push(`Energy: ${energy}/10`);

    const metadataStr = metadata.length > 0 ? ` (${metadata.join(', ')})` : '';

    // EXTINF format: duration, artist - title (metadata)
    lines.push(`#EXTINF:${duration},${artist} - ${name}${metadataStr}`);

    // Add custom tags for djay Pro
    if (bpm > 0) lines.push(`#EXTBPM:${bpm}`);
    if (key) lines.push(`#EXTKEY:${key}`);
    if (energy > 0) lines.push(`#EXTENERGY:${energy}`);

    // Add track number
    lines.push(`#EXTTRACK:${index + 1}`);

    // Spotify URI
    lines.push(`spotify:track:${track.id}`);

    // Add blank line between tracks for readability
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Generate JSON format for potential djay Pro import
 */
export function generateDjayProJSON(
  tracks: SpotifyTrackWithFeatures[],
  playlistName: string,
  metadata?: {
    harmonicMixPercentage?: number;
    avgTransitionScore?: number;
    constraints?: string;
  }
): string {
  const playlist = {
    name: playlistName,
    version: '1.0',
    generator: 'AI DJ Mix Generator',
    metadata: {
      harmonicMixPercentage: metadata?.harmonicMixPercentage,
      avgTransitionScore: metadata?.avgTransitionScore,
      constraints: metadata?.constraints,
      trackCount: tracks.length,
      totalDuration: tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0),
    },
    tracks: tracks.map((track, index) => ({
      position: index + 1,
      id: track.id,
      uri: `spotify:track:${track.id}`,
      name: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album?.name,
      duration_ms: track.duration_ms,

      // DJ metadata
      bpm: Math.round(track.tempo || track.mikData?.bpm || 0),
      key: track.camelotKey || track.mikData?.camelotKey || '',
      camelotKey: track.camelotKey || track.mikData?.camelotKey || '',
      energy: track.energy || track.mikData?.energy || 0,

      // Spotify features
      danceability: track.danceability,
      valence: track.valence,
      acousticness: track.acousticness,

      // MIK data if available
      mikData: track.mikData ? {
        bpm: track.mikData.bpm,
        camelotKey: track.mikData.camelotKey,
        energy: track.mikData.energy,
      } : undefined,
    })),
  };

  return JSON.stringify(playlist, null, 2);
}

/**
 * Generate simple CSV for import to other DJ software
 */
export function generateCSVPlaylist(
  tracks: SpotifyTrackWithFeatures[]
): string {
  const lines: string[] = [];

  // Header
  lines.push('Position,Title,Artist,Album,BPM,Key,Energy,Duration,Spotify URI');

  // Tracks
  tracks.forEach((track, index) => {
    const position = index + 1;
    const title = escapeCSV(track.name);
    const artist = escapeCSV(track.artists.map(a => a.name).join(', '));
    const album = escapeCSV(track.album?.name || '');
    const bpm = Math.round(track.tempo || track.mikData?.bpm || 0);
    const key = track.camelotKey || track.mikData?.camelotKey || '';
    const energy = track.energy
      ? Math.round(track.energy * 10)
      : track.mikData?.energy
      ? Math.round(track.mikData.energy * 10)
      : 0;
    const duration = formatDuration(track.duration_ms || 0);
    const uri = `spotify:track:${track.id}`;

    lines.push(`${position},${title},${artist},${album},${bpm},${key},${energy},${duration},${uri}`);
  });

  return lines.join('\n');
}

/**
 * Escape CSV field
 */
function escapeCSV(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Format duration as MM:SS
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Get suggested filename for download
 */
export function getPlaylistFilename(playlistName: string, format: 'm3u8' | 'json' | 'csv'): string {
  // Sanitize playlist name for filename
  const sanitized = playlistName
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 50);

  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return `${sanitized}-${timestamp}.${format}`;
}

/**
 * Generate import instructions for djay Pro
 */
export function getImportInstructions(): string {
  return `
📖 How to Import to djay Pro:

M3U8 Method (Recommended):
1. Download the .m3u8 file
2. Open djay Pro
3. File → Import Playlist → Select the .m3u8 file
4. All tracks will be imported with metadata (BPM, Key, Energy)
5. Enable Automix and enjoy!

Alternative Methods:
- JSON: Use for backup or custom integrations
- CSV: Import to Rekordbox, Serato, or spreadsheet

Automix Tips:
✓ Enable "Match Tempo" for smooth transitions
✓ Use "Smart Mix" for automatic harmonic mixing
✓ Adjust transition length based on energy curve
✓ Enable "Crossfade" for seamless blending

Enjoy your AI-curated mix! 🎵
  `.trim();
}
