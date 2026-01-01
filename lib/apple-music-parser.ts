import { parseStringPromise } from 'xml2js';
import { readFileSync } from 'fs';

export interface AppleMusicTrack {
  trackId: string;
  name: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  composer?: string;
  genre?: string;
  year?: number;
  totalTime?: number; // milliseconds
  playCount?: number;
  playDate?: Date;
  dateAdded?: Date;
  bitRate?: number;
  sampleRate?: number;
  persistentId: string;
  isAppleMusic: boolean;
}

/**
 * Parse iTunes Library XML format and extract track metadata
 *
 * @param xmlPath Path to the Apple Music library XML file
 * @returns Array of AppleMusicTrack objects
 */
export async function parseAppleMusicLibrary(xmlPath: string): Promise<AppleMusicTrack[]> {
  console.log(`📂 Reading ${xmlPath}...`);
  const xmlContent = readFileSync(xmlPath, 'utf-8');

  console.log('🔍 Parsing XML...');
  const parsed = await parseStringPromise(xmlContent);

  // iTunes Library format: plist > dict > key "Tracks" > dict > [track dicts]
  const rootDict = parsed.plist.dict[0];

  // The Tracks dictionary is the first dict element in the root
  const tracksDict = rootDict.dict ? rootDict.dict[0] : null;

  if (!tracksDict) {
    throw new Error('No Tracks found in library XML');
  }

  const tracks: AppleMusicTrack[] = [];

  // Each track is a dict element
  for (let i = 0; i < tracksDict.dict.length; i++) {
    const trackDict = tracksDict.dict[i];
    const track = parseTrackDict(trackDict);
    if (track) {
      tracks.push(track);
    }
  }

  console.log(`\n✓ Parsed ${tracks.length} tracks from Apple Music library`);
  return tracks;
}

/**
 * Parse a single track dictionary from the XML
 *
 * In plist XML, keys and values are siblings grouped by type.
 * We need to iterate through keys and match them to their corresponding values
 * by tracking which type each value is and maintaining separate counters.
 */
function parseTrackDict(trackDict: any): AppleMusicTrack | null {
  const track: Partial<AppleMusicTrack> = {
    isAppleMusic: false,
  };

  // Counters for each value type
  let stringIndex = 0;
  let integerIndex = 0;
  let dateIndex = 0;
  let trueIndex = 0;

  // Build a map of key -> [type, index]
  const keys = trackDict.key || [];

  for (let i = 0; i < keys.length; i++) {
    const keyName = keys[i];

    // Determine value type based on key name
    let valueType: string;
    let valueIndex: number;

    // String values
    if (['Name', 'Artist', 'Album', 'Album Artist', 'Composer', 'Genre', 'Kind',
         'Persistent ID', 'Track Type', 'Sort Album', 'Sort Artist', 'Sort Name',
         'Sort Album Artist'].includes(keyName)) {
      valueType = 'string';
      valueIndex = stringIndex++;
      const value = trackDict.string?.[valueIndex];

      switch (keyName) {
        case 'Name': track.name = value; break;
        case 'Artist': track.artist = value; break;
        case 'Album': track.album = value; break;
        case 'Album Artist': track.albumArtist = value; break;
        case 'Composer': track.composer = value; break;
        case 'Genre': track.genre = value; break;
        case 'Persistent ID': track.persistentId = value; break;
      }
    }
    // Integer values
    else if (['Track ID', 'Year', 'Total Time', 'Play Count', 'Bit Rate', 'Sample Rate',
              'Size', 'Disc Number', 'Disc Count', 'Track Number', 'Track Count',
              'Artwork Count', 'Play Date'].includes(keyName)) {
      valueType = 'integer';
      valueIndex = integerIndex++;
      const value = trackDict.integer?.[valueIndex];

      switch (keyName) {
        case 'Track ID': track.trackId = value?.toString(); break;
        case 'Year': track.year = value; break;
        case 'Total Time': track.totalTime = value; break;
        case 'Play Count': track.playCount = value; break;
        case 'Bit Rate': track.bitRate = value; break;
        case 'Sample Rate': track.sampleRate = value; break;
      }
    }
    // Date values
    else if (['Date Modified', 'Date Added', 'Play Date UTC', 'Release Date'].includes(keyName)) {
      valueType = 'date';
      valueIndex = dateIndex++;
      const value = trackDict.date?.[valueIndex];

      switch (keyName) {
        case 'Play Date UTC': track.playDate = value ? new Date(value) : undefined; break;
        case 'Date Added': track.dateAdded = value ? new Date(value) : undefined; break;
      }
    }
    // Boolean true values
    else if (['Apple Music', 'Part Of Gapless Album', 'Loved'].includes(keyName)) {
      valueType = 'true';
      valueIndex = trueIndex++;

      if (keyName === 'Apple Music') {
        track.isAppleMusic = true;
      }
    }
  }

  // Validate required fields
  if (!track.name || !track.artist || !track.persistentId) {
    return null;
  }

  return track as AppleMusicTrack;
}

/**
 * Get library statistics
 */
export function getAppleMusicStats(tracks: AppleMusicTrack[]) {
  const totalTracks = tracks.length;
  const appleMusicTracks = tracks.filter(t => t.isAppleMusic).length;
  const localTracks = totalTracks - appleMusicTracks;
  const tracksWithPlayCount = tracks.filter(t => t.playCount && t.playCount > 0).length;

  const avgPlayCount = tracksWithPlayCount > 0
    ? tracks
        .filter(t => t.playCount)
        .reduce((sum, t) => sum + (t.playCount || 0), 0) / tracksWithPlayCount
    : 0;

  const genreCounts = tracks.reduce((acc, t) => {
    if (t.genre) {
      acc[t.genre] = (acc[t.genre] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const topGenres = Object.entries(genreCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return {
    totalTracks,
    appleMusicTracks,
    localTracks,
    tracksWithPlayCount,
    avgPlayCount: avgPlayCount.toFixed(1),
    topGenres,
  };
}
