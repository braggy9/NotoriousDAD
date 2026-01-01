// Process full MIK library and match to Spotify
// Run with: npx tsx scripts/process-mik-library.ts

import { promises as fs } from 'fs';
import path from 'path';
import { parseMIKCSV, deduplicateMIKTracks, getMIKLibraryStats } from '../lib/mik-csv-parser';
import { batchMatchTracks } from '../lib/track-matcher';

const MIK_CSV_PATH = path.join(process.cwd(), 'MIKAll Playlists v1.csv');
const OUTPUT_PATH = path.join(process.cwd(), 'data', 'matched-tracks.json');

async function main() {
  console.log('🎵 Processing MIK Library...\n');

  // Check for Spotify access token
  const accessToken = process.env.SPOTIFY_ACCESS_TOKEN;

  if (!accessToken) {
    console.error('❌ Error: SPOTIFY_ACCESS_TOKEN environment variable not set');
    console.error('\nTo get a token:');
    console.error('1. Log in via the web app (http://127.0.0.1:3000)');
    console.error('2. Open browser DevTools → Application → Cookies');
    console.error('3. Copy the "spotify_access_token" cookie value');
    console.error('4. Run: export SPOTIFY_ACCESS_TOKEN="your_token_here"');
    process.exit(1);
  }

  // Read MIK CSV
  console.log(`📂 Reading ${MIK_CSV_PATH}...`);
  const csvContent = await fs.readFile(MIK_CSV_PATH, 'utf-8');

  // Parse and deduplicate
  console.log('🔍 Parsing CSV...');
  const mikTracks = parseMIKCSV(csvContent);
  const uniqueTracks = deduplicateMIKTracks(mikTracks);

  console.log(`\n✓ Found ${mikTracks.length} tracks (${uniqueTracks.length} unique)\n`);

  // Get stats
  const stats = getMIKLibraryStats(uniqueTracks);
  console.log('📊 Library Statistics:');
  console.log(`   Total: ${stats.totalTracks} tracks`);
  console.log(`   Avg BPM: ${stats.avgBPM}`);
  console.log(`   Avg Energy: ${stats.avgEnergy}/1.0`);
  console.log(`   BPM Distribution:`);
  console.log(`     < 100 BPM: ${stats.bpmRanges.slow} tracks`);
  console.log(`     100-130 BPM: ${stats.bpmRanges.medium} tracks`);
  console.log(`     > 130 BPM: ${stats.bpmRanges.fast} tracks`);
  console.log('');

  // Match to Spotify
  console.log(`🔗 Matching ${uniqueTracks.length} tracks to Spotify...`);
  console.log('   (This will take ~20 minutes for 10k tracks)\n');

  const matchedTracks = await batchMatchTracks(
    uniqueTracks,
    accessToken,
    (current, total) => {
      if (current % 50 === 0 || current === total) {
        const percent = Math.round((current / total) * 100);
        console.log(`   Progress: ${current}/${total} (${percent}%)`);
      }
    }
  );

  console.log(`\n✓ Matched ${matchedTracks.length} tracks (${Math.round((matchedTracks.length / uniqueTracks.length) * 100)}% success rate)\n`);

  // Ensure data directory exists
  const dataDir = path.dirname(OUTPUT_PATH);
  await fs.mkdir(dataDir, { recursive: true });

  // Save results
  console.log(`💾 Saving to ${OUTPUT_PATH}...`);

  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify({
      uploadedAt: new Date().toISOString(),
      totalMIKTracks: uniqueTracks.length,
      matchedCount: matchedTracks.length,
      matchRate: Math.round((matchedTracks.length / uniqueTracks.length) * 100),
      stats,
      tracks: matchedTracks,
    }, null, 2)
  );

  console.log('\n✅ Done! Your MIK library is ready for playlist generation.\n');
}

main().catch(console.error);
