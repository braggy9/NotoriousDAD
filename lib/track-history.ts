/**
 * Track History - Playlist Deduplication System
 *
 * Tracks recently used tracks to avoid repetition across playlists.
 * Uses Vercel Postgres for persistent storage.
 */

import { sql } from '@vercel/postgres';

// How long to remember tracks (in days)
const TRACK_MEMORY_DAYS = 7;

// How much to penalize recently used tracks in selection scoring
const RECENT_TRACK_PENALTY = 25; // Subtract from selection score

/**
 * Initialize the track history table
 */
export async function initTrackHistoryTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS track_history (
      id SERIAL PRIMARY KEY,
      track_id VARCHAR(255) NOT NULL,
      playlist_id VARCHAR(255),
      user_hash VARCHAR(64),
      used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(track_id, user_hash, playlist_id)
    )
  `;

  // Create index for faster lookups
  await sql`
    CREATE INDEX IF NOT EXISTS idx_track_history_user_date
    ON track_history(user_hash, used_at DESC)
  `;

  console.log('✓ Track history table initialized');
}

/**
 * Record tracks used in a playlist
 */
export async function recordUsedTracks(
  trackIds: string[],
  playlistId: string,
  userHash: string
): Promise<void> {
  if (trackIds.length === 0) return;

  try {
    // Insert tracks in batches
    const batchSize = 50;
    for (let i = 0; i < trackIds.length; i += batchSize) {
      const batch = trackIds.slice(i, i + batchSize);

      // Use a transaction for batch insert
      for (const trackId of batch) {
        await sql`
          INSERT INTO track_history (track_id, playlist_id, user_hash)
          VALUES (${trackId}, ${playlistId}, ${userHash})
          ON CONFLICT (track_id, user_hash, playlist_id) DO NOTHING
        `;
      }
    }

    console.log(`📝 Recorded ${trackIds.length} tracks in history`);
  } catch (error) {
    console.error('Failed to record track history:', error);
    // Don't throw - this is non-critical
  }
}

/**
 * Get recently used track IDs for a user
 */
export async function getRecentlyUsedTracks(
  userHash: string,
  daysBack: number = TRACK_MEMORY_DAYS
): Promise<Set<string>> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const result = await sql`
      SELECT DISTINCT track_id
      FROM track_history
      WHERE user_hash = ${userHash}
        AND used_at > ${cutoffDate.toISOString()}
    `;

    const trackIds = new Set(result.rows.map(row => row.track_id));
    console.log(`📚 Found ${trackIds.size} recently used tracks (last ${daysBack} days)`);

    return trackIds;
  } catch (error) {
    console.error('Failed to get track history:', error);
    return new Set(); // Return empty set on error - don't block generation
  }
}

/**
 * Clean up old track history entries
 */
export async function cleanupOldTrackHistory(
  daysToKeep: number = TRACK_MEMORY_DAYS * 2
): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await sql`
      DELETE FROM track_history
      WHERE used_at < ${cutoffDate.toISOString()}
      RETURNING id
    `;

    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} old track history entries`);
    }

    return deletedCount;
  } catch (error) {
    console.error('Failed to cleanup track history:', error);
    return 0;
  }
}

/**
 * Get track history stats for a user
 */
export async function getTrackHistoryStats(userHash: string): Promise<{
  totalTracks: number;
  playlistCount: number;
  oldestEntry: Date | null;
}> {
  try {
    const result = await sql`
      SELECT
        COUNT(DISTINCT track_id) as total_tracks,
        COUNT(DISTINCT playlist_id) as playlist_count,
        MIN(used_at) as oldest_entry
      FROM track_history
      WHERE user_hash = ${userHash}
    `;

    const row = result.rows[0];
    return {
      totalTracks: parseInt(row.total_tracks) || 0,
      playlistCount: parseInt(row.playlist_count) || 0,
      oldestEntry: row.oldest_entry ? new Date(row.oldest_entry) : null,
    };
  } catch (error) {
    console.error('Failed to get track history stats:', error);
    return { totalTracks: 0, playlistCount: 0, oldestEntry: null };
  }
}

/**
 * Calculate deduplication penalty for a track
 * Returns a negative score adjustment if track was recently used
 */
export function getDeduplicationPenalty(
  trackId: string,
  recentlyUsedTracks: Set<string>
): number {
  if (recentlyUsedTracks.has(trackId)) {
    return -RECENT_TRACK_PENALTY;
  }
  return 0;
}

/**
 * Generate a user hash from refresh token (for privacy)
 */
export function generateUserHash(refreshToken: string): string {
  // Simple hash - in production you might use crypto
  let hash = 0;
  for (let i = 0; i < refreshToken.length; i++) {
    const char = refreshToken.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
