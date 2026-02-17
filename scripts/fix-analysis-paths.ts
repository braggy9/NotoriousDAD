#!/usr/bin/env npx tsx
/**
 * Fix Audio Library Analysis Paths
 *
 * Converts file paths from local Mac iCloud Drive to server paths
 */

import * as fs from 'fs';
import * as path from 'path';

interface Track {
  id: string;
  filePath: string;
  fileName: string;
  artist: string;
  title: string;
  bpm: number;
  bpmConfidence: number;
  key: string;
  camelotKey: string;
  energy: number;
  duration: number;
  fileSize: number;
  analyzedAt: string;
  genre?: string;
}

interface AudioLibrary {
  generatedAt: string;
  source: string;
  totalFiles: number;
  analyzedTracks: number;
  tracks: Track[];
  machine?: string;
}

async function main() {
  console.log('🔧 Audio Library Path Fixer\n');

  // Load analysis file
  const inputFile = process.argv[2] || '/Users/tombragg/Desktop/audio-library-analysis.json';
  const outputFile = process.argv[3] || '/Users/tombragg/Desktop/audio-library-analysis-fixed.json';

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`📂 Loading: ${inputFile}`);
  const library: AudioLibrary = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
  console.log(`✅ Loaded ${library.tracks.length} tracks\n`);

  // Update paths
  console.log('🔄 Updating file paths...');
  let updated = 0;

  for (const track of library.tracks) {
    // Extract just the filename
    const filename = path.basename(track.filePath);

    // Update to server path
    track.filePath = `/var/www/notorious-dad/audio-library/${filename}`;
    updated++;
  }

  console.log(`✅ Updated ${updated} file paths\n`);

  // Update metadata
  library.source = 'Portable analyzer (local Mac) - paths fixed for server';
  library.generatedAt = new Date().toISOString();

  // Save
  console.log(`💾 Saving to: ${outputFile}`);
  fs.writeFileSync(outputFile, JSON.stringify(library, null, 2));
  console.log('✅ Done!\n');

  console.log('📤 Next steps:');
  console.log(`   1. Upload: rsync -avz "${outputFile}" root@178.156.214.56:/var/www/notorious-dad/data/audio-library-analysis.json`);
  console.log('   2. Restart: ssh root@178.156.214.56 "cd /var/www/notorious-dad && pm2 restart notorious-dad"');
  console.log('   3. Test enrichment: ssh root@178.156.214.56 "cd /var/www/notorious-dad && npx tsx scripts/enrich-audio-analysis.ts --test"');
}

main().catch(console.error);
