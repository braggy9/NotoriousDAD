import { parseAppleMusicLibrary, getAppleMusicStats } from '../lib/apple-music-parser';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('🎵 Processing Apple Music Library...\n');

  const libraryPath = join(process.cwd(), 'apple-music-library.xml');

  try {
    // Parse the library
    const tracks = await parseAppleMusicLibrary(libraryPath);

    // Get statistics
    const stats = getAppleMusicStats(tracks);

    console.log('\n📊 Library Statistics:');
    console.log(`   Total: ${stats.totalTracks} tracks`);
    console.log(`   Apple Music: ${stats.appleMusicTracks} tracks`);
    console.log(`   Local Files: ${stats.localTracks} tracks`);
    console.log(`   Tracks with plays: ${stats.tracksWithPlayCount}`);
    console.log(`   Avg play count: ${stats.avgPlayCount}`);
    console.log('\n   Top Genres:');
    stats.topGenres.forEach(([genre, count], i) => {
      console.log(`     ${i + 1}. ${genre}: ${count} tracks`);
    });

    // Save to JSON for later processing
    const outputPath = join(process.cwd(), 'data', 'apple-music-tracks.json');
    writeFileSync(outputPath, JSON.stringify(tracks, null, 2));
    console.log(`\n✓ Saved ${tracks.length} tracks to ${outputPath}`);

    // Show sample tracks
    console.log('\n📀 Sample Tracks:');
    tracks.slice(0, 5).forEach((t, i) => {
      console.log(`   ${i + 1}. "${t.name}" by ${t.artist}`);
      console.log(`      Album: ${t.album || 'Unknown'}`);
      console.log(`      Genre: ${t.genre || 'Unknown'} | Plays: ${t.playCount || 0}`);
    });

  } catch (error) {
    console.error('❌ Error processing library:', error);
    process.exit(1);
  }
}

main();
