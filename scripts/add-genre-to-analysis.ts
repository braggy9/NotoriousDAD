#!/usr/bin/env tsx
/**
 * Add genre tags to existing audio library analysis
 * Extracts genre from audio file metadata using ffprobe
 */

import { execSync } from 'child_process';
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
  genre?: string; // New field
}

interface AnalysisData {
  generatedAt: string;
  source: string;
  totalFiles: number;
  analyzedTracks: number;
  tracks: Track[];
}

const ANALYSIS_FILE = '/var/www/notorious-dad/data/audio-library-analysis.json';

/**
 * Extract genre tag from audio file using ffprobe
 */
function extractGenre(filePath: string): string | null {
  try {
    const result = execSync(
      `ffprobe -v quiet -show_entries format_tags=genre "${filePath}" 2>/dev/null | grep "TAG:genre=" | cut -d= -f2`,
      { encoding: 'utf-8' }
    );
    const genre = result.trim();
    return genre.length > 0 ? genre : null;
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('🎵 Adding genre tags to audio library analysis...\n');

  // Load existing analysis
  console.log('📖 Loading existing analysis...');
  const data: AnalysisData = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'));
  console.log(`   Found ${data.tracks.length} tracks\n`);

  // Backup original
  const backupFile = ANALYSIS_FILE.replace('.json', `.backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`💾 Backup saved to: ${backupFile}\n`);

  // Process tracks
  let updated = 0;
  let withGenre = 0;
  let noGenre = 0;

  console.log('🔍 Extracting genres from audio files...');
  for (let i = 0; i < data.tracks.length; i++) {
    const track = data.tracks[i];

    if (i % 100 === 0) {
      console.log(`   Progress: ${i}/${data.tracks.length} (${Math.round(i/data.tracks.length*100)}%)`);
    }

    // Skip if file doesn't exist
    if (!fs.existsSync(track.filePath)) {
      continue;
    }

    // Extract genre
    const genre = extractGenre(track.filePath);
    if (genre) {
      track.genre = genre;
      withGenre++;
    } else {
      noGenre++;
    }
    updated++;
  }

  console.log(`\n✅ Processing complete!`);
  console.log(`   Total tracks: ${data.tracks.length}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   With genre: ${withGenre} (${Math.round(withGenre/updated*100)}%)`);
  console.log(`   No genre: ${noGenre} (${Math.round(noGenre/updated*100)}%)`);

  // Save updated analysis
  console.log(`\n💾 Saving updated analysis...`);
  data.generatedAt = new Date().toISOString();
  fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(data, null, 2));
  console.log(`   ✅ Saved to: ${ANALYSIS_FILE}`);

  // Show genre distribution
  console.log(`\n📊 Genre Distribution (top 20):`);
  const genreCounts: Record<string, number> = {};
  data.tracks.forEach(track => {
    if (track.genre) {
      genreCounts[track.genre] = (genreCounts[track.genre] || 0) + 1;
    }
  });
  const sorted = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  sorted.forEach(([genre, count]) => {
    console.log(`   ${genre}: ${count} tracks`);
  });
}

main().catch(console.error);
