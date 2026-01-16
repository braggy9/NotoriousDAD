#!/usr/bin/env tsx

import {
  findMashupPairs,
  type MashupableTrack
} from '../lib/mashup-generator';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('\n🎭 Finding Mashup Opportunities in Full Library\n');

  const dbPath = path.join(process.cwd(), 'data', 'enhanced-track-database.json');
  const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

  const allTracks: MashupableTrack[] = dbData.tracks
    .filter((t: any) => t.bpm && t.camelotKey && t.energy !== undefined)
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      artist: t.artist,
      bpm: t.bpm,
      camelotKey: t.camelotKey,
      energy: t.energy
    }));

  console.log(`📚 Loaded ${allTracks.length} tracks\n`);
  console.log('🔍 Finding mashup pairs (this may take a moment)...\n');

  const startTime = Date.now();
  const pairs = findMashupPairs(allTracks, {
    minCompatibilityScore: 80  // Only show high-quality mashups
  });
  const elapsed = Date.now() - startTime;

  console.log(`⏱️  Found ${pairs.length} high-quality pairs in ${(elapsed/1000).toFixed(1)}s\n`);

  // Filter out duplicate artist pairs and show diverse examples
  const diversePairs = pairs.filter((pair, index, self) => {
    // Skip if same artist
    if (pair.track1.artist === pair.track2.artist) return false;
    
    // Skip if we've already seen this artist combination
    return index === self.findIndex(p => 
      (p.track1.artist === pair.track1.artist && p.track2.artist === pair.track2.artist) ||
      (p.track1.artist === pair.track2.artist && p.track2.artist === pair.track1.artist)
    );
  });

  console.log('🏆 TOP 20 DIVERSE MASHUP OPPORTUNITIES:\n');

  diversePairs.slice(0, 20).forEach((pair, i) => {
    console.log(`${i + 1}. ${pair.track1.artist} - "${pair.track1.name}"`);
    console.log(`   × ${pair.track2.artist} - "${pair.track2.name}"`);
    console.log(`   Score: ${pair.compatibility.overallScore}/100 | ${pair.track1.camelotKey} | ${pair.track1.bpm.toFixed(1)} BPM × ${pair.track2.bpm.toFixed(1)} BPM\n`);
  });

  // Show some Fred again mashups if available
  const fredPairs = pairs.filter(p => 
    (p.track1.artist.toLowerCase().includes('fred') || p.track2.artist.toLowerCase().includes('fred')) &&
    p.track1.artist !== p.track2.artist
  );

  if (fredPairs.length > 0) {
    console.log(`\n🎹 FRED AGAIN MASHUP OPPORTUNITIES (${fredPairs.length} found):\n`);
    fredPairs.slice(0, 10).forEach((pair, i) => {
      const fredTrack = pair.track1.artist.toLowerCase().includes('fred') ? pair.track1 : pair.track2;
      const otherTrack = pair.track1.artist.toLowerCase().includes('fred') ? pair.track2 : pair.track1;
      
      console.log(`${i + 1}. "${fredTrack.name}" × ${otherTrack.artist} - "${otherTrack.name}"`);
      console.log(`   ${pair.compatibility.overallScore}/100 | ${fredTrack.bpm.toFixed(1)} BPM | ${fredTrack.camelotKey}\n`);
    });
  }

  // Statistics
  console.log('\n📊 LIBRARY STATISTICS:\n');
  console.log(`   Total compatible pairs: ${pairs.length} (score ≥80)`);
  console.log(`   Diverse artist pairs: ${diversePairs.length}`);
  console.log(`   Average score: ${(pairs.reduce((s, p) => s + p.compatibility.overallScore, 0) / pairs.length).toFixed(1)}/100`);
  
  const perfectMatches = pairs.filter(p => p.compatibility.overallScore >= 85).length;
  console.log(`   Perfect matches (≥85): ${perfectMatches}`);
}

main().catch(console.error);
