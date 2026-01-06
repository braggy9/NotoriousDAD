#!/usr/bin/env npx tsx
/**
 * DJ Library Consolidation Script v2
 *
 * Scans your Apple Music purchases folder and copies DRM-free tracks
 * to the iCloud DJ Music folder for MIK analysis and mixing.
 *
 * Usage: npx tsx scripts/consolidate-dj-library.ts [--dry-run] [--verbose]
 */

import * as fs from 'fs';
import * as path from 'path';

// Source and destination paths
const SOURCE_MUSIC_FOLDER = '/Users/tombragg/Music/Music/Media.localized/Music';
const ICLOUD_DJ_FOLDER = '/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music';
const MIK_ANALYZED_FOLDER = path.join(ICLOUD_DJ_FOLDER, '2-MIK-Analyzed');
const NEW_TRACKS_FOLDER = path.join(ICLOUD_DJ_FOLDER, '5-New-To-Analyze');

// Audio extensions we care about
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.aiff', '.alac'];

// Parse options
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

interface AudioFile {
  path: string;
  artist: string;
  album: string;
  filename: string;
  size: number;
}

/**
 * Recursively find all audio files in a directory
 */
function findAudioFiles(dir: string): AudioFile[] {
  const files: AudioFile[] = [];

  function scan(currentDir: string, artist: string = '', album: string = '') {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          // Determine artist/album from folder structure
          const depth = fullPath.replace(SOURCE_MUSIC_FOLDER, '').split('/').filter(Boolean).length;

          if (depth === 1) {
            // Artist folder
            scan(fullPath, entry.name, '');
          } else if (depth === 2) {
            // Album folder
            scan(fullPath, artist, entry.name);
          } else {
            scan(fullPath, artist, album);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (AUDIO_EXTENSIONS.includes(ext)) {
            const stats = fs.statSync(fullPath);
            files.push({
              path: fullPath,
              artist: artist || 'Unknown Artist',
              album: album || 'Unknown Album',
              filename: entry.name,
              size: stats.size,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning ${currentDir}: ${error}`);
    }
  }

  scan(dir);
  return files;
}

/**
 * Get normalized filenames from MIK folder for duplicate detection
 */
function getExistingMIKFiles(): Set<string> {
  const existing = new Set<string>();

  if (!fs.existsSync(MIK_ANALYZED_FOLDER)) {
    return existing;
  }

  const files = fs.readdirSync(MIK_ANALYZED_FOLDER);
  for (const file of files) {
    // Normalize: lowercase, remove track numbers and special chars
    const normalized = normalizeForComparison(file);
    existing.add(normalized);
  }

  return existing;
}

/**
 * Normalize a filename for comparison
 */
function normalizeForComparison(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/^\d+[\s\-_.]+/, '') // Remove leading track numbers
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .slice(0, 50); // Limit length for comparison
}

/**
 * Generate a clean destination filename
 */
function generateDestFilename(file: AudioFile): string {
  const ext = path.extname(file.filename);
  const trackName = path.basename(file.filename, ext)
    .replace(/^\d+[\s\-_.]+/, '') // Remove leading track numbers
    .trim();

  const destName = `${file.artist} - ${trackName}`
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

  return `${destName}${ext}`;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Main consolidation function
 */
async function consolidate(): Promise<void> {
  console.log('🎧 DJ Library Consolidation Tool v2');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be copied\n');
  }

  // Step 1: Scan source folder
  console.log(`📂 Scanning source: ${SOURCE_MUSIC_FOLDER}`);
  const sourceFiles = findAudioFiles(SOURCE_MUSIC_FOLDER);
  console.log(`   Found ${sourceFiles.length} audio files`);

  const totalSize = sourceFiles.reduce((sum, f) => sum + f.size, 0);
  console.log(`   Total size: ${formatBytes(totalSize)}`);

  // Step 2: Get existing MIK files
  console.log(`\n📂 Scanning MIK folder: ${MIK_ANALYZED_FOLDER}`);
  const existingMIK = getExistingMIKFiles();
  console.log(`   Found ${existingMIK.size} already analyzed`);

  // Step 3: Find files to copy
  console.log('\n🔍 Finding new tracks to copy...');
  const toCopy: AudioFile[] = [];
  const alreadyExists: AudioFile[] = [];

  for (const file of sourceFiles) {
    const destName = generateDestFilename(file);
    const normalized = normalizeForComparison(destName);

    // Check if already in MIK folder
    if (existingMIK.has(normalized)) {
      alreadyExists.push(file);
      continue;
    }

    // Check by original filename too
    const origNormalized = normalizeForComparison(file.filename);
    if (existingMIK.has(origNormalized)) {
      alreadyExists.push(file);
      continue;
    }

    toCopy.push(file);
  }

  console.log(`   Already in MIK folder: ${alreadyExists.length}`);
  console.log(`   New tracks to copy: ${toCopy.length}`);

  const copySize = toCopy.reduce((sum, f) => sum + f.size, 0);
  console.log(`   Size to copy: ${formatBytes(copySize)}`);

  // Step 4: Create destination folder
  if (!fs.existsSync(NEW_TRACKS_FOLDER)) {
    if (!DRY_RUN) {
      fs.mkdirSync(NEW_TRACKS_FOLDER, { recursive: true });
    }
    console.log(`\n📁 Created: ${NEW_TRACKS_FOLDER}`);
  }

  // Step 5: Copy files
  console.log('\n🚀 Copying tracks...\n');

  let copied = 0;
  let skipped = 0;
  let errors = 0;
  let copiedSize = 0;

  for (let i = 0; i < toCopy.length; i++) {
    const file = toCopy[i];
    const destName = generateDestFilename(file);
    const destPath = path.join(NEW_TRACKS_FOLDER, destName);

    // Skip if already copied
    if (fs.existsSync(destPath)) {
      skipped++;
      if (VERBOSE) console.log(`  ⏭️  Already copied: ${destName}`);
      continue;
    }

    try {
      if (DRY_RUN) {
        if (VERBOSE || copied < 20) {
          console.log(`  [DRY] ${file.artist} - ${path.basename(file.filename, path.extname(file.filename))}`);
        }
      } else {
        fs.copyFileSync(file.path, destPath);
        copiedSize += file.size;

        if (VERBOSE || copied % 100 === 0) {
          console.log(`  ✅ ${copied + 1}/${toCopy.length} ${file.artist} - ${path.basename(file.filename, path.extname(file.filename))}`);
        }
      }
      copied++;
    } catch (error) {
      errors++;
      if (VERBOSE) console.log(`  ❌ Error: ${file.filename} - ${error}`);
    }

    // Progress every 500 files
    if (i > 0 && i % 500 === 0) {
      const percent = Math.round((i / toCopy.length) * 100);
      console.log(`  ... ${percent}% complete (${copied} copied, ${skipped} skipped)`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 CONSOLIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Source folder:      ${SOURCE_MUSIC_FOLDER}`);
  console.log(`  Total source files: ${sourceFiles.length}`);
  console.log(`  Already in MIK:     ${alreadyExists.length}`);
  console.log(`  ✅ Copied:          ${copied} (${formatBytes(copiedSize)})`);
  console.log(`  ⏭️  Skipped:         ${skipped}`);
  console.log(`  ❌ Errors:          ${errors}`);
  console.log(`  📁 Destination:     ${NEW_TRACKS_FOLDER}`);
  console.log('='.repeat(60));

  if (copied > 0 && !DRY_RUN) {
    console.log('\n🎹 NEXT STEPS:');
    console.log('   1. Open Mixed In Key');
    console.log('   2. Drag the folder to analyze:');
    console.log(`      ${NEW_TRACKS_FOLDER}`);
    console.log('   3. After analysis, move files to 2-MIK-Analyzed folder');
  }

  // Generate genre breakdown
  console.log('\n📊 Artist breakdown (top 20):');
  const byArtist: Record<string, number> = {};
  for (const file of sourceFiles) {
    byArtist[file.artist] = (byArtist[file.artist] || 0) + 1;
  }
  Object.entries(byArtist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([artist, count]) => {
      console.log(`   ${artist}: ${count} tracks`);
    });
}

// Run
consolidate().catch(console.error);
