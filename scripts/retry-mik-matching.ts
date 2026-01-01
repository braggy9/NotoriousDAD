// Retry MIK matching for previously unmatched tracks
import { promises as fs, existsSync, readFileSync } from 'fs';
import path from 'path';
import { parseMIKCSV, deduplicateMIKTracks } from '../lib/mik-csv-parser';
import { MIKTrack } from '../lib/types';
import { getValidToken } from '../lib/token-manager';

const MIK_CSV_PATH = path.join(process.cwd(), 'MIKAll Playlists v1.csv');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'matched-tracks.json');

async function main() {
  console.log('🔄 Retrying MIK matching for unmatched tracks...\n');

  // Verify token is available (will auto-refresh if needed)
  await getValidToken();
  console.log('✓ Spotify token ready (auto-refresh enabled)');

  // Load existing matched tracks
  if (!existsSync(OUTPUT_PATH)) {
    console.error('❌ No existing matched-tracks.json found. Run process-mik-library.ts first');
    process.exit(1);
  }

  const existingData = JSON.parse(await fs.readFile(OUTPUT_PATH, 'utf-8'));
  const existingMatches = existingData.tracks || [];

  console.log(`📂 Found ${existingMatches.length} previously matched tracks`);

  // Create set of already matched tracks (by trackName + artist)
  const matchedKeys = new Set(
    existingMatches.map((m: any) =>
      `${m.mikTrack.trackName.toLowerCase()}|||${m.mikTrack.artist.toLowerCase()}`
    )
  );

  // Read and parse MIK CSV
  console.log(`📂 Reading ${MIK_CSV_PATH}...`);
  const csvContent = await fs.readFile(MIK_CSV_PATH, 'utf-8');
  const mikTracks = parseMIKCSV(csvContent);
  const uniqueTracks = deduplicateMIKTracks(mikTracks);

  // Filter to only unmatched tracks
  const unmatchedTracks = uniqueTracks.filter((track: MIKTrack) => {
    const key = `${track.trackName.toLowerCase()}|||${track.artist.toLowerCase()}`;
    return !matchedKeys.has(key);
  });

  console.log(`\n✓ Found ${unmatchedTracks.length} unmatched tracks (out of ${uniqueTracks.length} total)\n`);

  if (unmatchedTracks.length === 0) {
    console.log('✅ All tracks already matched!');
    return;
  }

  // Match unmatched tracks with auto-refresh
  console.log(`🔗 Matching ${unmatchedTracks.length} tracks to Spotify...`);
  console.log(`   (This will take ~${Math.ceil(unmatchedTracks.length / 600)} hours)\n`);

  const newMatches = await batchMatchTracksWithAutoRefresh(
    unmatchedTracks,
    (current, total) => {
      if (current % 50 === 0 || current === total) {
        const percent = Math.round((current / total) * 100);
        console.log(`   Progress: ${current}/${total} (${percent}%)`);
      }
    }
  );

  console.log(`\n✓ Matched ${newMatches.length} additional tracks (${Math.round((newMatches.length / unmatchedTracks.length) * 100)}% success rate)\n`);

  // Merge with existing results
  const allMatches = [...existingMatches, ...newMatches];
  const totalMatched = allMatches.length;
  const totalTracks = uniqueTracks.length;

  console.log(`💾 Saving ${totalMatched} total matches to ${OUTPUT_PATH}...`);

  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify({
      ...existingData,
      uploadedAt: new Date().toISOString(),
      matchedCount: totalMatched,
      matchRate: Math.round((totalMatched / totalTracks) * 100),
      tracks: allMatches,
    }, null, 2)
  );

  console.log('\n✅ Done! Updated matched tracks:');
  console.log(`   Previous: ${existingMatches.length} tracks`);
  console.log(`   New: ${newMatches.length} tracks`);
  console.log(`   Total: ${totalMatched} tracks`);
  console.log(`   Success rate: ${Math.round((totalMatched / totalTracks) * 100)}%\n`);
}

// Batch match with auto-refresh token support
async function batchMatchTracksWithAutoRefresh(
  mikTracks: MIKTrack[],
  onProgress?: (current: number, total: number) => void
) {
  const { matchTrackToSpotify } = await import('../lib/track-matcher');
  const results = [];

  for (let i = 0; i < mikTracks.length; i++) {
    const mikTrack = mikTracks[i];

    if (onProgress) {
      onProgress(i + 1, mikTracks.length);
    }

    try {
      // Get fresh token (auto-refreshes if needed)
      const accessToken = await getValidToken();

      const result = await matchTrackToSpotify(mikTrack, accessToken);
      if (result) {
        results.push(result);
      }

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to match track: ${mikTrack.trackName}`, error);
    }
  }

  return results;
}

main().catch(console.error);
