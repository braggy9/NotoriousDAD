#!/usr/bin/env tsx

/**
 * Test Mashup Generator - Quick validation script
 *
 * Usage:
 *   npx tsx scripts/test-mashup-generator.ts
 */

import {
  findMashupPairs,
  findBestMashupPartner,
  type MashupableTrack
} from '../lib/mashup-generator';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('\n🎭 Testing Mashup Generator\n');

  // Load enhanced track database
  const dbPath = path.join(process.cwd(), 'data', 'enhanced-track-database.json');

  if (!fs.existsSync(dbPath)) {
    console.error('❌ Enhanced track database not found!');
    console.error('   Run: cd ~/spotify-library-downloader && npm run create-enhanced-db');
    process.exit(1);
  }

  console.log('📂 Loading enhanced track database...');
  const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

  // Filter to tracks with full metadata
  const allTracks: MashupableTrack[] = dbData.tracks
    .filter((t: any) => t.bpm && t.camelotKey && t.energy !== undefined)
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      artist: t.artist,
      bpm: t.bpm,
      camelotKey: t.camelotKey,
      energy: t.energy,
      acousticness: t.acousticness,
      instrumentalness: t.instrumentalness,
      speechiness: t.speechiness,
      danceability: t.danceability,
      valence: t.valence
    }));

  console.log(`✅ Loaded ${allTracks.length} mashup-compatible tracks\n`);

  // Test 1: Find top mashup pairs
  console.log('🔍 TEST 1: Finding top mashup pairs from library...\n');

  // Take a sample for faster testing (or use full library)
  const sampleSize = 100;
  const sampleTracks = allTracks.slice(0, sampleSize);

  console.log(`   Using sample of ${sampleSize} tracks for testing`);
  console.log(`   (Remove .slice() to test full library)\n`);

  const startTime = Date.now();
  const pairs = findMashupPairs(sampleTracks, {
    minCompatibilityScore: 70,
    maxBPMDifference: 0.06
  });
  const elapsed = Date.now() - startTime;

  console.log(`⏱️  Found ${pairs.length} compatible pairs in ${elapsed}ms\n`);

  // Show top 5 pairs
  console.log('🏆 TOP 5 MASHUP PAIRS:\n');

  pairs.slice(0, 5).forEach((pair, i) => {
    console.log(`${i + 1}. ${pair.track1.artist} - ${pair.track1.name}`);
    console.log(`   × ${pair.track2.artist} - ${pair.track2.name}`);
    console.log(`   ├─ Score: ${pair.compatibility.overallScore}/100 (${pair.compatibility.difficulty})`);
    console.log(`   ├─ Harmonic: ${pair.compatibility.harmonicScore}/40 (${pair.track1.camelotKey} ↔ ${pair.track2.camelotKey})`);
    console.log(`   ├─ BPM: ${pair.compatibility.bpmScore}/30 (${pair.track1.bpm} ↔ ${pair.track2.bpm})`);
    console.log(`   ├─ Energy: ${pair.compatibility.energyScore}/15`);
    console.log(`   └─ Spectrum: ${pair.compatibility.spectrumScore}/15`);

    if (pair.mixingNotes.length > 0) {
      console.log(`   \n   💡 Mixing Notes:`);
      pair.mixingNotes.forEach(note => console.log(`      • ${note}`));
    }
    console.log('');
  });

  // Test 2: Find best partner for a specific track
  console.log('\n🎯 TEST 2: Finding best mashup partner for a specific track...\n');

  const testTrack = sampleTracks.find(t =>
    t.artist.toLowerCase().includes('fred') ||
    t.artist.toLowerCase().includes('rufus') ||
    t.artist.toLowerCase().includes('disclosure')
  ) || sampleTracks[0];

  console.log(`   Target: ${testTrack.artist} - ${testTrack.name}`);
  console.log(`   BPM: ${testTrack.bpm}, Key: ${testTrack.camelotKey}, Energy: ${testTrack.energy.toFixed(2)}\n`);

  const candidates = sampleTracks.filter(t => t.id !== testTrack.id);
  const bestPartner = findBestMashupPartner(testTrack, candidates);

  if (bestPartner) {
    console.log(`✅ BEST PARTNER FOUND:\n`);
    console.log(`   ${bestPartner.track2.artist} - ${bestPartner.track2.name}`);
    console.log(`   BPM: ${bestPartner.track2.bpm}, Key: ${bestPartner.track2.camelotKey}, Energy: ${bestPartner.track2.energy.toFixed(2)}`);
    console.log(`   \n   Compatibility: ${bestPartner.compatibility.overallScore}/100 (${bestPartner.compatibility.difficulty})`);

    if (bestPartner.mixingNotes.length > 0) {
      console.log(`   \n   💡 Mixing Notes:`);
      bestPartner.mixingNotes.forEach(note => console.log(`      • ${note}`));
    }
  } else {
    console.log('❌ No compatible partner found with current criteria');
  }

  // Summary statistics
  console.log('\n\n📊 SUMMARY STATISTICS:\n');

  const easyPairs = pairs.filter(p => p.compatibility.difficulty === 'easy').length;
  const mediumPairs = pairs.filter(p => p.compatibility.difficulty === 'medium').length;
  const hardPairs = pairs.filter(p => p.compatibility.difficulty === 'hard').length;

  const avgScore = pairs.reduce((sum, p) => sum + p.compatibility.overallScore, 0) / pairs.length;

  const perfectHarmonic = pairs.filter(p => p.compatibility.harmonicScore === 40).length;
  const compatibleHarmonic = pairs.filter(p => p.compatibility.harmonicScore === 30).length;

  console.log(`   Total tracks analyzed: ${sampleTracks.length}`);
  console.log(`   Compatible pairs found: ${pairs.length}`);
  console.log(`   Average compatibility: ${avgScore.toFixed(1)}/100`);
  console.log(`   \n   Difficulty breakdown:`);
  console.log(`   ├─ Easy: ${easyPairs} (${(easyPairs/pairs.length*100).toFixed(1)}%)`);
  console.log(`   ├─ Medium: ${mediumPairs} (${(mediumPairs/pairs.length*100).toFixed(1)}%)`);
  console.log(`   └─ Hard: ${hardPairs} (${(hardPairs/pairs.length*100).toFixed(1)}%)`);
  console.log(`   \n   Harmonic compatibility:`);
  console.log(`   ├─ Perfect match (same key): ${perfectHarmonic}`);
  console.log(`   └─ Compatible keys: ${compatibleHarmonic}`);

  console.log('\n✅ Testing complete!\n');
}

main().catch(console.error);
