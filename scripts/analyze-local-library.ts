#!/usr/bin/env tsx
/**
 * Portable Audio Library Analyzer
 * Runs on any Mac with access to iCloud Drive
 *
 * This script:
 * 1. Scans ~/Library/Mobile Documents/.../DJ Music/2-MIK-Analyzed/
 * 2. Extracts metadata from each file (genre, duration, artist, title, BPM from tags)
 * 3. Generates analysis JSON file
 * 4. Can be uploaded to server with: rsync analysis.json root@server:/path/
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Configuration
const ICLOUD_DJ_MUSIC = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed'
);
const OUTPUT_FILE = path.join(os.homedir(), 'Desktop/audio-library-analysis.json');

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

interface AnalysisData {
  generatedAt: string;
  source: string;
  totalFiles: number;
  analyzedTracks: number;
  tracks: Track[];
  machine: string;
}

/**
 * Extract metadata from audio file using ffprobe
 */
function extractMetadata(filePath: string): Partial<Track> | null {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}" 2>/dev/null`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    const data = JSON.parse(result);
    const format = data.format || {};
    const tags = format.tags || {};

    // Get duration
    const duration = parseFloat(format.duration) || 0;

    // Get genre
    const genre = tags.genre || tags.GENRE || tags['©gen'] || null;

    // Get artist/title from tags or filename
    let artist = tags.artist || tags.ARTIST || tags['©ART'] || 'Unknown Artist';
    let title = tags.title || tags.TITLE || tags['©nam'] || path.basename(filePath, path.extname(filePath));

    // Parse filename if tags are missing
    if (artist === 'Unknown Artist' || title === path.basename(filePath, path.extname(filePath))) {
      const parsed = parseFilename(path.basename(filePath));
      if (parsed.artist !== 'Unknown Artist') artist = parsed.artist;
      if (parsed.title) title = parsed.title;
    }

    // Try to get BPM from tags (MIK or other tagger)
    const bpm = parseFloat(tags.bpm || tags.BPM || tags.TBPM || '0') || 0;

    // Try to get key from tags
    const key = tags.key || tags.KEY || tags.initialkey || tags.INITIALKEY || 'Unknown';

    // Try to get energy (MIK stores this)
    const energy = parseInt(tags.energy || tags.ENERGY || '5') || 5;

    return {
      artist,
      title,
      duration,
      genre: genre || undefined,
      bpm: bpm || 0,
      key,
      energy,
    };
  } catch (error) {
    console.error(`  ❌ Failed to extract metadata from ${path.basename(filePath)}: ${error}`);
    return null;
  }
}

/**
 * Parse filename to extract artist and title
 */
function parseFilename(filename: string): { artist: string; title: string } {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(mp3|m4a|flac|wav|aiff)$/i, '');

  // Remove track numbers like "01 " or "01. "
  const withoutTrackNum = nameWithoutExt.replace(/^\d+[\s.-]+/, '');

  // Try "Artist - Title" format
  if (withoutTrackNum.includes(' - ')) {
    const parts = withoutTrackNum.split(' - ');
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
    };
  }

  // Try "Artist - Title" with em dash
  if (withoutTrackNum.includes('—')) {
    const parts = withoutTrackNum.split('—');
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join('—').trim(),
    };
  }

  // Default: use whole name as title
  return {
    artist: 'Unknown Artist',
    title: withoutTrackNum.trim(),
  };
}

/**
 * Scan directory for audio files
 */
function scanDirectory(dir: string): string[] {
  const files: string[] = [];

  function scan(currentDir: string) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        // Skip hidden files and system files
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.mp3', '.m4a', '.flac', '.wav', '.aiff'].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`  ⚠️  Error scanning ${currentDir}: ${error}`);
    }
  }

  scan(dir);
  return files;
}

/**
 * Generate unique track ID
 */
function generateTrackId(): string {
  return `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function main() {
  console.log('🎵 Portable Audio Library Analyzer');
  console.log('='.repeat(60));
  console.log(`Machine: ${os.hostname()}`);
  console.log(`User: ${os.userInfo().username}`);
  console.log('');

  // Check if iCloud Drive folder exists
  if (!fs.existsSync(ICLOUD_DJ_MUSIC)) {
    console.error(`❌ iCloud DJ Music folder not found: ${ICLOUD_DJ_MUSIC}`);
    console.error('   Make sure iCloud Drive is synced and files are downloaded.');
    process.exit(1);
  }

  console.log(`📂 Scanning: ${ICLOUD_DJ_MUSIC}`);
  console.log('   This may take a few minutes...\n');

  const audioFiles = scanDirectory(ICLOUD_DJ_MUSIC);
  console.log(`✅ Found ${audioFiles.length} audio files\n`);

  if (audioFiles.length === 0) {
    console.error('❌ No audio files found. Check your iCloud sync status.');
    process.exit(1);
  }

  // Analyze tracks
  console.log('🔍 Analyzing tracks...');
  console.log('   This will take a while. Progress updates every 100 files.\n');

  const tracks: Track[] = [];
  let analyzed = 0;
  let failed = 0;

  const startTime = Date.now();

  for (let i = 0; i < audioFiles.length; i++) {
    const filePath = audioFiles[i];

    // Progress updates
    if (i % 100 === 0 && i > 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = i / elapsed;
      const remaining = (audioFiles.length - i) / rate;
      console.log(`   Progress: ${i}/${audioFiles.length} (${Math.round(i/audioFiles.length*100)}%) - ETA: ${Math.round(remaining/60)}m`);
    }

    try {
      const stat = fs.statSync(filePath);
      const metadata = extractMetadata(filePath);

      if (!metadata) {
        failed++;
        continue;
      }

      const track: Track = {
        id: generateTrackId(),
        filePath: filePath,
        fileName: path.basename(filePath),
        artist: metadata.artist || 'Unknown Artist',
        title: metadata.title || 'Unknown Title',
        bpm: metadata.bpm || 0,
        bpmConfidence: metadata.bpm ? 0.8 : 0,
        key: metadata.key || 'Unknown',
        camelotKey: metadata.key || '8A',
        energy: metadata.energy || 5,
        duration: metadata.duration || 0,
        fileSize: stat.size,
        analyzedAt: new Date().toISOString(),
        genre: metadata.genre,
      };

      tracks.push(track);
      analyzed++;
    } catch (error) {
      console.error(`  ❌ Failed: ${path.basename(filePath)}`);
      failed++;
    }
  }

  console.log(`\n✅ Analysis complete!`);
  console.log(`   Total files: ${audioFiles.length}`);
  console.log(`   Analyzed: ${analyzed}`);
  console.log(`   Failed: ${failed}`);

  // Generate statistics
  const withGenre = tracks.filter(t => t.genre).length;
  const withBPM = tracks.filter(t => t.bpm > 0).length;

  console.log(`\n📊 Statistics:`);
  console.log(`   With genre tags: ${withGenre} (${Math.round(withGenre/analyzed*100)}%)`);
  console.log(`   With BPM tags: ${withBPM} (${Math.round(withBPM/analyzed*100)}%)`);

  // Genre distribution
  const genreCounts: Record<string, number> = {};
  tracks.forEach(track => {
    if (track.genre) {
      genreCounts[track.genre] = (genreCounts[track.genre] || 0) + 1;
    }
  });

  console.log(`\n🎵 Top Genres:`);
  Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([genre, count]) => {
      console.log(`   ${genre}: ${count} tracks`);
    });

  // Save to file
  console.log(`\n💾 Saving to: ${OUTPUT_FILE}`);

  const analysisData: AnalysisData = {
    generatedAt: new Date().toISOString(),
    source: 'Portable analyzer (local Mac)',
    totalFiles: audioFiles.length,
    analyzedTracks: analyzed,
    tracks: tracks,
    machine: `${os.hostname()} (${os.userInfo().username})`,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(analysisData, null, 2));
  console.log('✅ Saved!\n');

  // Upload instructions
  console.log('📤 To upload to Hetzner server:');
  console.log(`   rsync -avz "${OUTPUT_FILE}" root@178.156.214.56:/var/www/notorious-dad/data/audio-library-analysis.json`);
  console.log('');
  console.log('   Then restart the server:');
  console.log('   ssh root@178.156.214.56 "cd /var/www/notorious-dad && pm2 restart notorious-dad"');
  console.log('');
  console.log('🎉 Done!');
}

main().catch(console.error);
