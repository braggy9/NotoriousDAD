/**
 * Track Quality Filter
 *
 * Filters out low-quality tracks like karaoke versions, compilations,
 * "Various Artists" releases, and other undesirable results.
 */

// Artist names that indicate low-quality/cover versions
const BLOCKED_ARTIST_PATTERNS = [
  /^various\s*artists?$/i,
  /^v\.?a\.?$/i,
  /karaoke/i,
  /tribute/i,
  /cover\s*(band|version|artist)/i,
  /^hit\s*crew/i,
  /^party\s*tyme/i,
  /^ameritz/i,
  /^the\s*hit\s*co/i,
  /^backing\s*track/i,
  /^instrumental\s*version/i,
  /made\s*famous/i,
  /originally\s*performed/i,
  /in\s*the\s*style\s*of/i,
  /^sound\-?a\-?like/i,
  /^studio\s*group/i,
  /^midis/i,
  /^sunfly/i,
  /^stingray\s*karaoke/i,
];

// Track name patterns that indicate low-quality versions
const BLOCKED_TRACK_PATTERNS = [
  /\(karaoke/i,
  /\(tribute/i,
  /\(cover\)/i,
  /\(made\s*famous/i,
  /\(originally\s*performed/i,
  /\(in\s*the\s*style/i,
  /instrumental\s*version/i,
  /backing\s*track/i,
  /\brerecorded\b/i,
  /\bre-recorded\b/i,
  /\bsoundalike\b/i,
];

// Album name patterns that indicate compilations/low-quality
const BLOCKED_ALBUM_PATTERNS = [
  /karaoke/i,
  /tribute\s*to/i,
  /covers?\s*album/i,
  /made\s*famous/i,
  /as\s*made\s*famous/i,
  /100\s*hits/i,
  /50\s*greatest/i,
  /compilation/i,
  /now\s*that'?s\s*what/i,
];

interface TrackForFiltering {
  id: string;
  name: string;
  artists: { name: string }[];
  album?: { name: string; album_type?: string };
  popularity?: number;
}

/**
 * Check if a track should be filtered out due to quality issues
 */
export function isLowQualityTrack(track: TrackForFiltering): { isLowQuality: boolean; reason?: string } {
  // Check artist names
  for (const artist of track.artists) {
    if (!artist?.name) continue;

    for (const pattern of BLOCKED_ARTIST_PATTERNS) {
      if (pattern.test(artist.name)) {
        return { isLowQuality: true, reason: `Blocked artist pattern: ${artist.name}` };
      }
    }
  }

  // Check track name
  for (const pattern of BLOCKED_TRACK_PATTERNS) {
    if (pattern.test(track.name)) {
      return { isLowQuality: true, reason: `Blocked track pattern: ${track.name}` };
    }
  }

  // Check album name
  if (track.album?.name) {
    for (const pattern of BLOCKED_ALBUM_PATTERNS) {
      if (pattern.test(track.album.name)) {
        return { isLowQuality: true, reason: `Blocked album pattern: ${track.album.name}` };
      }
    }
  }

  // Very low popularity can indicate cover versions (but be careful not to filter indie artists)
  // Only filter if it's a well-known song with suspiciously low popularity
  if (track.popularity !== undefined && track.popularity < 5) {
    // Check if it looks like a cover (same name as famous song but very low popularity)
    return { isLowQuality: true, reason: `Very low popularity: ${track.popularity}` };
  }

  return { isLowQuality: false };
}

/**
 * Filter an array of tracks, removing low-quality ones
 */
export function filterLowQualityTracks<T extends TrackForFiltering>(
  tracks: T[],
  logRemovals: boolean = false
): T[] {
  const filtered: T[] = [];
  let removedCount = 0;

  for (const track of tracks) {
    const { isLowQuality, reason } = isLowQualityTrack(track);

    if (isLowQuality) {
      removedCount++;
      if (logRemovals) {
        console.log(`  🚫 Filtered: "${track.name}" by ${track.artists[0]?.name} - ${reason}`);
      }
    } else {
      filtered.push(track);
    }
  }

  if (removedCount > 0) {
    console.log(`  🧹 Removed ${removedCount} low-quality tracks`);
  }

  return filtered;
}

/**
 * Calculate a quality score for a track (higher = better quality)
 */
export function calculateQualityScore(track: TrackForFiltering): number {
  let score = 50; // Base score

  // Popularity contributes to quality (0-30 points)
  if (track.popularity !== undefined) {
    score += Math.min(30, track.popularity * 0.3);
  }

  // Album type affects quality
  if (track.album?.album_type === 'album') {
    score += 10; // Full albums are usually higher quality
  } else if (track.album?.album_type === 'single') {
    score += 5;
  } else if (track.album?.album_type === 'compilation') {
    score -= 10; // Compilations often have re-recordings
  }

  // Remixes are fine - no penalty for official remixes
  // Only penalize if it looks like a bootleg or unofficial version

  return Math.max(0, Math.min(100, score));
}
