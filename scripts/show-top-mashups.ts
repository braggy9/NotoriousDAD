#!/usr/bin/env tsx
import {
  findMashupPairs,
  type MashupableTrack
} from '../lib/mashup-generator';
import fs from 'fs';
import path from 'path';

async function main() {
  console.log('\n🎭 Top Mashup Opportunities from Your Library\n');

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

  console.log(`📚 Library: ${allTracks.length} tracks\n`);
  console.log('🔍 Finding high-quality mashup pairs (score ≥80)...\n');

  const startTime = Date.now();
  const pairs = findMashupPairs(allTracks, {
    minCompatibilityScore: 80
  });
  const elapsed = Date.now() - startTime;

  console.log(`✅ Found ${pairs.length} pairs in ${(elapsed/1000).toFixed(1)}s\n`);

  // Show top 15 diverse pairs (different artists)
  const seen = new Set<string>();
  const diverse = pairs.filter(p => {
    if (p.track1.artist === p.track2.artist) return false;
    const key = [p.track1.artist, p.track2.artist].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log('🏆 TOP 15 MASHUP OPPORTUNITIES:\n');
  diverse.slice(0, 15).forEach((pair, i) => {
    console.log(`${i + 1}. ${pair.track1.artist} - "${pair.track1.name}"`);
    console.log(`   × ${pair.track2.artist} - "${pair.track2.name}"`);
    console.log(`   💯 ${pair.compatibility.overallScore}/100 | ${pair.track1.camelotKey} | ${pair.track1.bpm.toFixed(0)} × ${pair.track2.bpm.toFixed(0)} BPM\n`);
  });

  // Fred again mashups
  const fredSeen = new Set<string>();
  const fred = pairs.filter(p => {
    const hasFred = p.track1.artist.toLowerCase().includes('fred') || p.track2.artist.toLowerCase().includes('fred');
    if (!hasFred || p.track1.artist === p.track2.artist) return false;
    const otherArtist = p.track1.artist.toLowerCase().includes('fred') ? p.track2.artist : p.track1.artist;
    if (fredSeen.has(otherArtist)) return false;
    fredSeen.add(otherArtist);
    return true;
  });

  if (fred.length > 0) {
    console.log(`\n🎹 FRED AGAIN MASHUPS (${fred.length} unique partners):\n`);
    fred.slice(0, 10).forEach((pair, i) => {
      const fredTrack = pair.track1.artist.toLowerCase().includes('fred') ? pair.track1 : pair.track2;
      const other = pair.track1.artist.toLowerCase().includes('fred') ? pair.track2 : pair.track1;
      console.log(`${i + 1}. "${fredTrack.name}" × ${other.artist}`);
      console.log(`   💯 ${pair.compatibility.overallScore} | ${fredTrack.bpm.toFixed(0)} BPM | ${fredTrack.camelotKey}\n`);
    });
  }

  console.log('📊 STATS:\n');
  console.log(`   High-quality pairs: ${pairs.length}`);
  console.log(`   Perfect (≥85): ${pairs.filter(p => p.compatibility.overallScore >= 85).length}`);
  console.log(`   Avg score: ${(pairs.reduce((s, p) => s + p.compatibility.overallScore, 0) / pairs.length).toFixed(1)}/100\n`);
}

main().catch(console.error);
