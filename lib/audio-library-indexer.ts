/**
 * Audio Library Indexer
 *
 * Indexes local audio files and matches them with MIK analysis data.
 * Creates a unified database of tracks with:
 * - File path for audio processing
 * - MIK data (key, BPM, energy)
 * - Spotify metadata (if matched)
 *
 * This is the foundation for the AI mixing engine.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Paths to data sources
const ICLOUD_DJ_FOLDER = '/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music';
const MIK_ANALYZED_FOLDER = path.join(ICLOUD_DJ_FOLDER, '2-MIK-Analyzed');
const NEW_TRACKS_FOLDER = path.join(ICLOUD_DJ_FOLDER, '5-New-To-Analyze');
const MIK_DATABASE_FILE = '/Users/tombragg/Library/Application Support/Mixedinkey/Collection11.mikdb';
const AUDIO_INDEX_FILE = '/Users/tombragg/dj-mix-generator/data/audio-library-index.json';

// Audio extensions
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.aiff'];

// Indexed audio file with full metadata
export interface IndexedAudioFile {
  // File info
  filePath: string;
  fileName: string;
  fileSize: number;
  fileExtension: string;

  // Parsed from filename or metadata
  artist: string;
  title: string;
  genre?: string; // v4: Genre from ID3 tags (populated by analysis scripts)

  // MIK analysis data (if available)
  mikData?: {
    bpm: number;
    key: string; // e.g., "5A", "11B"
    energy: number; // 1-10
    camelotKey: string;
  };

  // Spotify match (if available)
  spotifyId?: string;
  spotifyUri?: string;

  // Derived/computed
  durationSeconds?: number;
  isAnalyzed: boolean;

  // v3 Enhanced: Mix points (optional, populated by enhanced analyzer)
  mixPoints?: {
    mixInPoint: number;      // Best point to start fading in (seconds)
    mixOutPoint: number;     // Best point to start fading out (seconds)
    dropPoint?: number;      // Main drop position
    breakdownPoint?: number; // Main breakdown position
    outroStart?: number;     // Where outro begins
    introEnd?: number;       // Where intro ends
  };

  // v3 Enhanced: Track structure segments
  segments?: Array<{
    type: 'intro' | 'verse' | 'buildup' | 'drop' | 'breakdown' | 'outro' | 'unknown';
    startTime: number;
    endTime: number;
    avgEnergy: number;
    beatCount: number;
  }>;

  // v3 Enhanced: Transition hints
  transitionHints?: {
    preferredInType: string;
    preferredOutType: string;
    hasStrongDrop: boolean;
    hasCleanOutro: boolean;
    idealCrossfadeBars: number;
  };
}

// Full audio library index
export interface AudioLibraryIndex {
  version: string;
  indexedAt: string;
  totalFiles: number;
  analyzedFiles: number;
  totalSizeBytes: number;
  files: IndexedAudioFile[];
}

/**
 * Parse artist and title from filename
 * Common formats:
 * - "Artist - Title.mp3"
 * - "01 Artist - Title.mp3"
 * - "Artist_-_Title.mp3"
 */
function parseFilename(filename: string): { artist: string; title: string } {
  const ext = path.extname(filename);
  let base = path.basename(filename, ext);

  // Remove leading track numbers
  base = base.replace(/^\d+[\s\-_.]+/, '');

  // Try "Artist - Title" format
  const dashMatch = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    return {
      artist: dashMatch[1].trim(),
      title: dashMatch[2].trim(),
    };
  }

  // Try "_-_" format
  const underscoreMatch = base.match(/^(.+?)_-_(.+)$/);
  if (underscoreMatch) {
    return {
      artist: underscoreMatch[1].replace(/_/g, ' ').trim(),
      title: underscoreMatch[2].replace(/_/g, ' ').trim(),
    };
  }

  // Fallback: whole thing is title
  return {
    artist: 'Unknown',
    title: base.trim(),
  };
}

/**
 * Normalize a string for fuzzy matching
 */
function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40);
}

/**
 * MIK database entry
 */
interface MIKEntry {
  artist: string;
  name: string;
  bpm: number;
  key: string; // Camelot key like "5A", "9B"
  energy: number;
}

/**
 * Load auto-analysis results from our analyzer JSON files
 */
function loadAutoAnalysisData(): Map<string, MIKEntry> {
  const autoMap = new Map<string, MIKEntry>();
  const dataDir = '/Users/tombragg/dj-mix-generator/data';

  if (!fs.existsSync(dataDir)) {
    return autoMap;
  }

  // Find all auto-analysis JSON files
  const files = fs.readdirSync(dataDir).filter(f => f.startsWith('auto-analysis-') && f.endsWith('.json'));

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));

      for (const track of data) {
        if (!track.camelotKey || !track.bpm) continue;

        const entry: MIKEntry = {
          artist: track.artist || 'Unknown',
          name: track.title || track.fileName,
          bpm: track.bpm,
          key: track.camelotKey,
          energy: track.energy || 5,
        };

        // Create lookup keys
        const fileNameKey = normalizeForMatch(path.basename(track.fileName, path.extname(track.fileName)));
        autoMap.set(fileNameKey, entry);

        if (track.artist && track.title) {
          const artistTitleKey = normalizeForMatch(`${track.artist}${track.title}`);
          if (!autoMap.has(artistTitleKey)) {
            autoMap.set(artistTitleKey, entry);
          }
        }
      }
    } catch (err) {
      // Skip invalid files
    }
  }

  if (autoMap.size > 0) {
    console.log(`  ✓ Loaded ${autoMap.size} entries from auto-analysis files`);
  }

  return autoMap;
}

/**
 * Load MIK analysis data directly from Mixed In Key SQLite database
 */
function loadMIKData(): Map<string, MIKEntry> {
  const mikMap = new Map<string, MIKEntry>();

  if (!fs.existsSync(MIK_DATABASE_FILE)) {
    console.log('  ⚠️  MIK database not found');
    return mikMap;
  }

  try {
    // Query the MIK SQLite database directly
    const query = `SELECT ZARTIST, ZNAME, ZTEMPO, ZKEY, ZENERGY FROM ZSONG WHERE ZNAME IS NOT NULL`;
    const result = execSync(
      `sqlite3 "${MIK_DATABASE_FILE}" "${query}"`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );

    const lines = result.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 5) continue;

      const [artist, name, tempoStr, key, energyStr] = parts;
      const bpm = parseFloat(tempoStr) || 0;
      const energy = parseFloat(energyStr) || 0;

      if (!name || !key) continue;

      const entry: MIKEntry = {
        artist: artist || 'Unknown',
        name,
        bpm: Math.round(bpm * 10) / 10, // Round to 1 decimal
        key,
        energy,
      };

      // Create multiple lookup keys for matching
      // Key 1: normalized "artistname"
      if (artist && name) {
        const artistTitleKey = normalizeForMatch(`${artist}${name}`);
        mikMap.set(artistTitleKey, entry);
      }

      // Key 2: normalized track name only
      const titleKey = normalizeForMatch(name);
      if (!mikMap.has(titleKey)) {
        mikMap.set(titleKey, entry);
      }

      // Key 3: artist + first part of title (before " - " or " (" or " [")
      const titleBase = name.split(/\s*[-(\[]/)[0].trim();
      if (titleBase && artist) {
        const baseKey = normalizeForMatch(`${artist}${titleBase}`);
        if (!mikMap.has(baseKey)) {
          mikMap.set(baseKey, entry);
        }
      }
    }

    console.log(`  ✓ Loaded ${mikMap.size} MIK entries from database`);
  } catch (error) {
    console.error(`  ❌ Error loading MIK database: ${error}`);
  }

  return mikMap;
}

/**
 * Scan a folder for audio files
 */
function scanFolder(folderPath: string): { path: string; size: number }[] {
  const files: { path: string; size: number }[] = [];

  if (!fs.existsSync(folderPath)) {
    return files;
  }

  function scan(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (AUDIO_EXTENSIONS.includes(ext)) {
            const stats = fs.statSync(fullPath);
            files.push({ path: fullPath, size: stats.size });
          }
        }
      }
    } catch (error) {
      // Skip permission errors
    }
  }

  scan(folderPath);
  return files;
}

/**
 * Build the complete audio library index
 */
export function buildAudioLibraryIndex(): AudioLibraryIndex {
  console.log('🎵 Building Audio Library Index');
  console.log('='.repeat(50));

  // Load analysis data for matching (MIK + auto-analysis)
  console.log('\n📊 Loading analysis data...');
  const mikData = loadMIKData();
  const autoData = loadAutoAnalysisData();

  // Merge auto-analysis data (doesn't overwrite MIK data)
  for (const [key, value] of autoData) {
    if (!mikData.has(key)) {
      mikData.set(key, value);
    }
  }
  console.log(`  📊 Total analysis entries: ${mikData.size}`);

  // Scan audio folders
  console.log('\n📂 Scanning audio folders...');

  const allFiles: { path: string; size: number }[] = [];

  // Scan MIK-Analyzed folder
  console.log(`  Scanning: ${MIK_ANALYZED_FOLDER}`);
  const mikFiles = scanFolder(MIK_ANALYZED_FOLDER);
  console.log(`    Found ${mikFiles.length} files`);
  allFiles.push(...mikFiles);

  // Scan New-To-Analyze folder
  console.log(`  Scanning: ${NEW_TRACKS_FOLDER}`);
  const newFiles = scanFolder(NEW_TRACKS_FOLDER);
  console.log(`    Found ${newFiles.length} files`);
  allFiles.push(...newFiles);

  console.log(`\n  Total audio files: ${allFiles.length}`);

  // Build index entries
  console.log('\n🔗 Matching files with analysis data...');
  const indexedFiles: IndexedAudioFile[] = [];
  let matchedCount = 0;

  for (const file of allFiles) {
    const fileName = path.basename(file.path);
    const { artist, title } = parseFilename(fileName);

    // Try to match with MIK data
    const artistTitleKey = normalizeForMatch(`${artist}${title}`);
    const titleKey = normalizeForMatch(title);

    let mikMatch = mikData.get(artistTitleKey) || mikData.get(titleKey);

    // Also try matching by filename directly (without extension)
    if (!mikMatch) {
      const baseFileName = path.basename(fileName, path.extname(fileName));
      const fileNameKey = normalizeForMatch(baseFileName);
      mikMatch = mikData.get(fileNameKey);
    }

    // Try matching with just track title
    if (!mikMatch) {
      mikMatch = mikData.get(normalizeForMatch(title));
    }

    const isAnalyzed = !!mikMatch || file.path.includes('MIK-Analyzed');

    if (mikMatch) matchedCount++;

    indexedFiles.push({
      filePath: file.path,
      fileName,
      fileSize: file.size,
      fileExtension: path.extname(fileName).toLowerCase(),
      artist: mikMatch?.artist || artist,
      title: mikMatch?.name || title,
      mikData: mikMatch
        ? {
            bpm: mikMatch.bpm,
            key: mikMatch.key,
            energy: mikMatch.energy,
            camelotKey: mikMatch.key, // MIK stores Camelot key directly
          }
        : undefined,
      spotifyId: undefined, // Will be matched later if needed
      spotifyUri: undefined,
      isAnalyzed,
    });
  }

  console.log(`  ✓ Matched ${matchedCount} files with MIK data`);

  // Calculate totals
  const totalSize = allFiles.reduce((sum, f) => sum + f.size, 0);
  const analyzedCount = indexedFiles.filter((f) => f.isAnalyzed).length;

  const index: AudioLibraryIndex = {
    version: '1.0',
    indexedAt: new Date().toISOString(),
    totalFiles: indexedFiles.length,
    analyzedFiles: analyzedCount,
    totalSizeBytes: totalSize,
    files: indexedFiles,
  };

  // Save index
  console.log(`\n💾 Saving index to: ${AUDIO_INDEX_FILE}`);
  fs.writeFileSync(AUDIO_INDEX_FILE, JSON.stringify(index, null, 2));

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 INDEX SUMMARY');
  console.log('='.repeat(50));
  console.log(`  Total files:       ${index.totalFiles}`);
  console.log(`  With MIK data:     ${matchedCount}`);
  console.log(`  Analyzed:          ${analyzedCount}`);
  console.log(`  Total size:        ${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log('='.repeat(50));

  return index;
}

/**
 * Load existing index from file
 */
export function loadAudioLibraryIndex(): AudioLibraryIndex | null {
  if (!fs.existsSync(AUDIO_INDEX_FILE)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(AUDIO_INDEX_FILE, 'utf-8'));
  } catch (error) {
    console.error('Error loading audio index:', error);
    return null;
  }
}

/**
 * Get files suitable for mixing (have MIK data)
 */
export function getMixableFiles(index: AudioLibraryIndex): IndexedAudioFile[] {
  return index.files.filter((f) => f.mikData?.bpm && f.mikData?.camelotKey);
}

/**
 * Find files by BPM range
 */
export function findByBPMRange(
  index: AudioLibraryIndex,
  minBPM: number,
  maxBPM: number
): IndexedAudioFile[] {
  return index.files.filter((f) => {
    const bpm = f.mikData?.bpm;
    if (!bpm) return false;
    return bpm >= minBPM && bpm <= maxBPM;
  });
}

/**
 * Find files by Camelot key (compatible keys)
 */
export function findByKey(
  index: AudioLibraryIndex,
  camelotKey: string,
  includeCompatible: boolean = true
): IndexedAudioFile[] {
  const compatibleKeys = new Set<string>([camelotKey]);

  if (includeCompatible) {
    // Add Camelot-compatible keys
    const num = parseInt(camelotKey);
    const letter = camelotKey.slice(-1);

    // Same number, different letter (relative major/minor)
    compatibleKeys.add(`${num}${letter === 'A' ? 'B' : 'A'}`);

    // Adjacent numbers (same letter)
    compatibleKeys.add(`${num === 1 ? 12 : num - 1}${letter}`);
    compatibleKeys.add(`${num === 12 ? 1 : num + 1}${letter}`);
  }

  return index.files.filter((f) => {
    const key = f.mikData?.camelotKey;
    return key && compatibleKeys.has(key);
  });
}

// CLI execution
if (require.main === module) {
  buildAudioLibraryIndex();
}
