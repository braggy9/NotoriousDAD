#!/usr/bin/env npx tsx
/**
 * DJ Import Workflow
 *
 * Unified script for importing new music into the DJ mixing system.
 *
 * Usage:
 *   npx tsx scripts/dj-import-workflow.ts                    # Full workflow
 *   npx tsx scripts/dj-import-workflow.ts --analyze-pending  # Analyze pending tracks
 *   npx tsx scripts/dj-import-workflow.ts --rebuild-index    # Rebuild library index
 *   npx tsx scripts/dj-import-workflow.ts --import /path/to/folder  # Import folder
 *
 * This script:
 * 1. Checks for new tracks in import folders
 * 2. Analyzes them (using our FFmpeg analyzer OR triggers MIK)
 * 3. Moves them to the analyzed folder
 * 4. Updates the audio library index
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec } from 'child_process';
import { buildAudioLibraryIndex } from '../lib/audio-library-indexer';
import { analyzeFolder, checkDependencies } from '../lib/auto-audio-analyzer';

// Folder structure
const ICLOUD_DJ_FOLDER = '/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music';
const FOLDERS = {
  downloads: path.join(ICLOUD_DJ_FOLDER, '1-Downloads'),
  youtubeDownloads: path.join(ICLOUD_DJ_FOLDER, '1-YouTube-Downloads'),
  mikAnalyzed: path.join(ICLOUD_DJ_FOLDER, '2-MIK-Analyzed'),
  newToAnalyze: path.join(ICLOUD_DJ_FOLDER, '5-New-To-Analyze'),
};

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.aiff'];
const MIK_DATABASE = '/Users/tombragg/Library/Application Support/Mixedinkey/Collection11.mikdb';

/**
 * Count audio files in a folder
 */
function countAudioFiles(folder: string): number {
  if (!fs.existsSync(folder)) return 0;

  let count = 0;
  const entries = fs.readdirSync(folder, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.includes(ext)) count++;
    }
  }

  return count;
}

/**
 * Get audio files from a folder
 */
function getAudioFiles(folder: string): string[] {
  if (!fs.existsSync(folder)) return [];

  const files: string[] = [];
  const entries = fs.readdirSync(folder, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (AUDIO_EXTENSIONS.includes(ext)) {
        files.push(path.join(folder, entry.name));
      }
    }
  }

  return files;
}

/**
 * Check if a track is already in MIK database
 */
function isInMIKDatabase(trackName: string): boolean {
  try {
    const normalized = trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const query = `SELECT COUNT(*) FROM ZSONG WHERE LOWER(REPLACE(ZNAME, ' ', '')) LIKE '%${normalized.slice(0, 20)}%'`;
    const result = execSync(`sqlite3 "${MIK_DATABASE}" "${query}"`, { encoding: 'utf-8' });
    return parseInt(result.trim()) > 0;
  } catch {
    return false;
  }
}

/**
 * Get MIK analysis count
 */
function getMIKTrackCount(): number {
  try {
    const result = execSync(`sqlite3 "${MIK_DATABASE}" "SELECT COUNT(*) FROM ZSONG"`, { encoding: 'utf-8' });
    return parseInt(result.trim());
  } catch {
    return 0;
  }
}

/**
 * Show status of all folders
 */
function showStatus() {
  console.log('');
  console.log('🎵 DJ Library Status');
  console.log('═'.repeat(60));

  const mikCount = getMIKTrackCount();
  console.log(`📊 MIK Database: ${mikCount.toLocaleString()} analyzed tracks`);
  console.log('');

  console.log('📁 Folder Status:');
  for (const [name, folder] of Object.entries(FOLDERS)) {
    const count = countAudioFiles(folder);
    const exists = fs.existsSync(folder) ? '✓' : '✗';
    console.log(`   ${exists} ${name}: ${count.toLocaleString()} tracks`);
  }

  // Check iCloud optimization status
  console.log('');
  console.log('☁️  iCloud Status:');
  try {
    const brctlOutput = execSync('brctl status 2>/dev/null | head -5', { encoding: 'utf-8' });
    console.log('   iCloud Drive: Active');
  } catch {
    console.log('   iCloud Drive: Unknown');
  }

  console.log('═'.repeat(60));
}

/**
 * Move analyzed tracks from New-To-Analyze to MIK-Analyzed
 * (For tracks that MIK has already analyzed)
 */
function moveAnalyzedTracks() {
  console.log('');
  console.log('🔄 Checking for newly analyzed tracks...');

  const pendingFiles = getAudioFiles(FOLDERS.newToAnalyze);
  let movedCount = 0;

  for (const file of pendingFiles) {
    const fileName = path.basename(file, path.extname(file));

    if (isInMIKDatabase(fileName)) {
      // This track is in MIK database, move it
      const destPath = path.join(FOLDERS.mikAnalyzed, path.basename(file));

      if (!fs.existsSync(destPath)) {
        try {
          fs.renameSync(file, destPath);
          movedCount++;
          if (movedCount <= 10) {
            console.log(`   ✓ Moved: ${path.basename(file)}`);
          }
        } catch (err) {
          // File might be in use or iCloud sync issue
        }
      }
    }
  }

  if (movedCount > 10) {
    console.log(`   ... and ${movedCount - 10} more`);
  }

  console.log(`\n   Total moved: ${movedCount} tracks`);
}

/**
 * Trigger MIK analysis by opening app with folder
 */
function triggerMIKAnalysis() {
  console.log('');
  console.log('🎹 Triggering Mixed In Key...');

  const pendingCount = countAudioFiles(FOLDERS.newToAnalyze);

  if (pendingCount === 0) {
    console.log('   No pending tracks to analyze');
    return;
  }

  console.log(`   ${pendingCount} tracks pending analysis`);
  console.log('');
  console.log('   Opening Mixed In Key...');

  try {
    execSync('open -a "Mixed In Key"', { stdio: 'pipe' });
    console.log('   ✓ MIK opened');
    console.log('');
    console.log('   📋 Manual Step Required:');
    console.log('   1. Drag this folder into Mixed In Key:');
    console.log(`      ${FOLDERS.newToAnalyze}`);
    console.log('   2. Wait for analysis to complete');
    console.log('   3. Run this script again with --move-analyzed');
  } catch (err) {
    console.log('   ✗ Could not open Mixed In Key');
    console.log('   Install MIK or use our built-in analyzer');
  }
}

/**
 * Import a folder of music files
 */
function importFolder(sourcePath: string) {
  console.log('');
  console.log(`📥 Importing from: ${sourcePath}`);

  if (!fs.existsSync(sourcePath)) {
    console.log('   ✗ Folder not found');
    return;
  }

  const files = getAudioFiles(sourcePath);
  console.log(`   Found ${files.length} audio files`);

  let copiedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const fileName = path.basename(file);
    const destPath = path.join(FOLDERS.newToAnalyze, fileName);

    if (fs.existsSync(destPath)) {
      skippedCount++;
      continue;
    }

    try {
      fs.copyFileSync(file, destPath);
      copiedCount++;

      if (copiedCount <= 10) {
        console.log(`   ✓ ${fileName}`);
      }
    } catch (err) {
      console.log(`   ✗ Failed: ${fileName}`);
    }
  }

  if (copiedCount > 10) {
    console.log(`   ... and ${copiedCount - 10} more`);
  }

  console.log('');
  console.log(`   Copied: ${copiedCount}`);
  console.log(`   Skipped (duplicates): ${skippedCount}`);
}

/**
 * Auto-analyze pending tracks using our open-source analyzer
 * (Replaces MIK dependency with aubio + FFmpeg)
 */
async function autoAnalyzePending() {
  console.log('');
  console.log('🔬 Auto-Analyzing Tracks (Open Source)');
  console.log('='.repeat(50));

  // Check dependencies
  const deps = checkDependencies();
  if (!deps.aubio) {
    console.log('❌ aubio not found. Install with: brew install aubio');
    return;
  }
  if (!deps.ffmpeg) {
    console.log('❌ ffmpeg not found. Install with: brew install ffmpeg');
    return;
  }

  console.log('✓ Dependencies: aubio + ffmpeg');

  const pendingCount = countAudioFiles(FOLDERS.newToAnalyze);
  if (pendingCount === 0) {
    console.log('   No pending tracks to analyze');
    return;
  }

  console.log(`\n📂 Analyzing ${pendingCount} tracks in New-To-Analyze folder...`);
  console.log('   This may take several minutes.\n');

  // Run analysis
  const outputFile = `/Users/tombragg/dj-mix-generator/data/auto-analysis-${Date.now()}.json`;
  const results = await analyzeFolder(FOLDERS.newToAnalyze, outputFile);

  console.log(`\n✓ Analyzed ${results.length} tracks`);
  console.log(`   Results saved to: ${outputFile}`);

  // Move analyzed files to the MIK-Analyzed folder
  if (results.length > 0) {
    console.log('\n📦 Moving analyzed tracks to MIK-Analyzed folder...');
    let movedCount = 0;

    for (const result of results) {
      const destPath = path.join(FOLDERS.mikAnalyzed, result.fileName);
      if (!fs.existsSync(destPath)) {
        try {
          fs.renameSync(result.filePath, destPath);
          movedCount++;
        } catch (err) {
          // File might be in use
        }
      }
    }

    console.log(`   ✓ Moved ${movedCount} tracks`);
  }
}

/**
 * Optimize iCloud storage (evict local copies)
 */
function optimizeStorage() {
  console.log('');
  console.log('☁️  Optimizing iCloud Storage...');
  console.log('');
  console.log('   This will evict local copies of tracks and keep them in iCloud.');
  console.log('   Files will download automatically when needed.');
  console.log('');

  // Use brctl to evict files
  try {
    console.log('   Evicting local copies in MIK-Analyzed folder...');
    execSync(`find "${FOLDERS.mikAnalyzed}" -type f \\( -name "*.mp3" -o -name "*.m4a" \\) -exec brctl evict {} \\; 2>/dev/null`, { stdio: 'pipe' });
    console.log('   ✓ Done');

    // Get disk usage
    const dfOutput = execSync('df -h / | tail -1', { encoding: 'utf-8' });
    const parts = dfOutput.trim().split(/\s+/);
    console.log(`\n   Current disk: ${parts[4]} used (${parts[3]} available)`);
  } catch (err) {
    console.log('   Note: Run "brctl evict" manually or enable:');
    console.log('   System Settings → iCloud → iCloud Drive → Optimize Mac Storage');
  }
}

/**
 * Main workflow
 */
async function main() {
  const args = process.argv.slice(2);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           🎧 DJ Import Workflow                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Parse arguments
  if (args.includes('--status')) {
    showStatus();
    return;
  }

  if (args.includes('--rebuild-index')) {
    console.log('\n📊 Rebuilding audio library index...');
    buildAudioLibraryIndex();
    return;
  }

  if (args.includes('--move-analyzed')) {
    moveAnalyzedTracks();
    console.log('\n📊 Rebuilding index...');
    buildAudioLibraryIndex();
    return;
  }

  if (args.includes('--trigger-mik')) {
    triggerMIKAnalysis();
    return;
  }

  if (args.includes('--auto-analyze')) {
    await autoAnalyzePending();
    console.log('\n📊 Rebuilding index...');
    buildAudioLibraryIndex();
    return;
  }

  if (args.includes('--optimize-storage')) {
    optimizeStorage();
    return;
  }

  const importIdx = args.indexOf('--import');
  if (importIdx !== -1 && args[importIdx + 1]) {
    importFolder(args[importIdx + 1]);
    console.log('\n📊 Rebuilding index...');
    buildAudioLibraryIndex();
    return;
  }

  // Default: full status and recommendations
  showStatus();

  const pendingCount = countAudioFiles(FOLDERS.newToAnalyze);

  console.log('\n📋 Recommended Actions:');

  if (pendingCount > 0) {
    console.log(`\n   ${pendingCount} pending tracks to analyze. Choose method:`);
    console.log('');
    console.log('   Option A - Auto-Analyze (No MIK Required):');
    console.log('      npx tsx scripts/dj-import-workflow.ts --auto-analyze');
    console.log('      Uses open-source aubio + FFmpeg (95% BPM accuracy, 80% key)');
    console.log('');
    console.log('   Option B - Mixed In Key (Higher Accuracy):');
    console.log('      npx tsx scripts/dj-import-workflow.ts --trigger-mik');
    console.log('      After MIK finishes: --move-analyzed');
  }

  console.log('\n   All Commands:');
  console.log('   --auto-analyze            Analyze with aubio+FFmpeg (fast)');
  console.log('   --trigger-mik             Open MIK for manual analysis');
  console.log('   --move-analyzed           Move MIK-analyzed tracks');
  console.log('   --import /path/to/folder  Import new music');
  console.log('   --rebuild-index           Rebuild library index');
  console.log('   --optimize-storage        Free up disk space');
  console.log('   --status                  Show status only');
}

main().catch(console.error);
