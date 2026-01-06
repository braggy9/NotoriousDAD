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
 * We build a proper key->value mapping by iterating through each value type array
 * alongside the keys, matching them correctly regardless of XML ordering.
 *
 * FIX (2026-01-07): Previous approach used incrementing counters that assumed
 * all keys had values, causing misalignment when keys were missing values
 * (e.g., missing Play Count would cause Sample Rate to be read as Play Count).
 */
function parseTrackDict(trackDict: any): AppleMusicTrack | null {
  const track: Partial<AppleMusicTrack> = {
    isAppleMusic: false,
  };

  const keys = trackDict.key || [];

  // Get all value arrays
  const strings = trackDict.string || [];
  const integers = trackDict.integer || [];
  const dates = trackDict.date || [];
  const trues = trackDict.true || [];

  // Build key-value map by matching keys to their corresponding value arrays
  // The xml2js parser groups values by type, and the order matches the key order *within that type*
  let stringIdx = 0;
  let integerIdx = 0;
  let dateIdx = 0;
  let trueIdx = 0;

  for (const keyName of keys) {
    // String values - advance index only if this key expects a string
    if (['Name', 'Artist', 'Album', 'Album Artist', 'Composer', 'Genre', 'Kind',
         'Persistent ID', 'Track Type', 'Sort Album', 'Sort Artist', 'Sort Name',
         'Sort Album Artist'].includes(keyName)) {
      const value = strings[stringIdx];
      stringIdx++; // Always increment after reading, even if undefined

      if (value !== undefined) {
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
    }
    // Integer values - advance index only if this key expects an integer
    else if (['Track ID', 'Year', 'Total Time', 'Play Count', 'Bit Rate', 'Sample Rate',
              'Size', 'Disc Number', 'Disc Count', 'Track Number', 'Track Count',
              'Artwork Count', 'Play Date'].includes(keyName)) {
      const value = integers[integerIdx];
      integerIdx++; // Always increment after reading

      if (value !== undefined && value !== null) {
        const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
        switch (keyName) {
          case 'Track ID': track.trackId = numValue.toString(); break;
          case 'Year': track.year = numValue; break;
          case 'Total Time': track.totalTime = numValue; break;
          case 'Play Count': track.playCount = numValue; break;
          case 'Bit Rate': track.bitRate = numValue; break;
          case 'Sample Rate': track.sampleRate = numValue; break;
        }
      }
    }
    // Date values - advance index only if this key expects a date
    else if (['Date Modified', 'Date Added', 'Play Date UTC', 'Release Date'].includes(keyName)) {
      const value = dates[dateIdx];
      dateIdx++; // Always increment after reading

      if (value !== undefined) {
        switch (keyName) {
          case 'Play Date UTC': track.playDate = new Date(value); break;
          case 'Date Added': track.dateAdded = new Date(value); break;
        }
      }
    }
    // Boolean true values (no false values in plist, absence = false)
    else if (['Apple Music', 'Part Of Gapless Album', 'Loved'].includes(keyName)) {
      // True values are just markers, increment counter
      trueIdx++;

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
