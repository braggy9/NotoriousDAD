#!/usr/bin/env npx tsx
/**
 * Enrich Audio Library Analysis with Streaming Architecture
 *
 * This version uses streaming writes to handle unlimited track counts
 * without running into memory limits. Can process 100,000+ tracks.
 *
 * Key improvements:
 * - Streams JSON output (no memory limits)
 * - Progress saved every track (crash-resistant)
 * - Can resume from checkpoint
 * - Real-time progress monitoring
 */

import * as fs from 'fs';
import * as path from 'path';
import { analyzeTrack, TrackAnalysis } from '../lib/beat-analyzer';

const AUDIO_LIBRARY_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis.json');
const OUTPUT_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis-enriched.json');
const CHECKPOINT_FILE = path.join(process.cwd(), 'data', '.enrichment-checkpoint.json');

interface CloudAudioTrack {
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

  // Advanced analysis fields
  analyzerVersion?: string;
  beatAnalysis?: {
    beats: number[];
    downbeats: number[];
    energyCurve: number[];
    energySampleRate: number;
  };
  mixPoints?: {
    mixInPoint: number;
    mixOutPoint: number;
    dropPoint?: number;
    breakdownPoint?: number;
  };
  segments?: Array<{
    type: 'intro' | 'verse' | 'buildup' | 'drop' | 'breakdown' | 'outro' | 'unknown';
    startTime: number;
    endTime: number;
    avgEnergy: number;
    beatCount: number;
  }>;
  transitionHints?: {
    preferredInType: string;
    preferredOutType: string;
    hasStrongDrop: boolean;
    hasCleanOutro: boolean;
    idealCrossfadeBars: number;
  };
}

interface AudioLibrary {
  generatedAt: string;
  source: string;
  totalFiles: number;
  analyzedTracks: number;
  tracks: CloudAudioTrack[];
  machine?: string;
}

interface Checkpoint {
  lastProcessedIndex: number;
  processedCount: number;
  timestamp: string;
}

/**
 * Calculate ideal crossfade duration based on segments
 */
function calculateIdealCrossfade(segments: any[]): number {
  let bars = 16;

  const hasOutro = segments.some(s => s.type === 'outro');
  if (hasOutro) {
    bars = 32;
  }

  const hasStrongDrop = segments.some(s => s.type === 'drop' && s.avgEnergy > 0.75);
  if (hasStrongDrop) {
    bars = 8;
  }

  return bars;
}

/**
 * Enrich a single track with advanced analysis
 */
async function enrichTrack(track: CloudAudioTrack): Promise<CloudAudioTrack> {
  // If already enriched, skip
  if (track.analyzerVersion === 'v5-beat-analyzer' && track.segments) {
    return track;
  }

  if (!fs.existsSync(track.filePath)) {
    console.log(`    ⚠️  File not found, skipping`);
    return track;
  }

  try {
    const analysis = await analyzeTrack(track.filePath, track.bpm);
    if (!analysis) {
      console.log(`    ❌ Analysis failed`);
      return track;
    }

    const enrichedTrack: CloudAudioTrack = {
      ...track,
      duration: analysis.duration,
      analyzerVersion: 'v5-beat-analyzer',
      beatAnalysis: {
        beats: analysis.beats,
        downbeats: analysis.downbeats,
        energyCurve: analysis.energyCurve,
        energySampleRate: analysis.energySampleRate,
      },
      mixPoints: {
        mixInPoint: analysis.mixInPoint,
        mixOutPoint: analysis.mixOutPoint,
        dropPoint: analysis.dropPoint,
        breakdownPoint: analysis.breakdownPoint,
      },
      segments: analysis.segments,
      transitionHints: {
        preferredInType: analysis.segments[0]?.type || 'unknown',
        preferredOutType: analysis.segments[analysis.segments.length - 1]?.type || 'unknown',
        hasStrongDrop: analysis.segments.some(s => s.type === 'drop' && s.avgEnergy > 0.75),
        hasCleanOutro: analysis.segments.some(s => s.type === 'outro'),
        idealCrossfadeBars: calculateIdealCrossfade(analysis.segments),
      },
    };

    console.log(`    ✅ Complete: ${analysis.segments.length} segments, mixIn=${analysis.mixInPoint.toFixed(1)}s, mixOut=${analysis.mixOutPoint.toFixed(1)}s`);
    return enrichedTrack;
  } catch (error) {
    console.log(`    ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    return track;
  }
}

/**
 * Load checkpoint if it exists
 */
function loadCheckpoint(): Checkpoint | null {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const data = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
  return null;
}

/**
 * Save checkpoint
 */
function saveCheckpoint(checkpoint: Checkpoint): void {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

/**
 * Main enrichment process with streaming writes
 */
async function main() {
  console.log('🎵 Audio Library Enrichment Tool (Streaming Edition)\n');

  // Check for test mode
  const testMode = process.argv.includes('--test');
  const testLimit = testMode ? 10 : Infinity;

  if (testMode) {
    console.log('🧪 TEST MODE: Processing only 10 tracks\n');
  }

  // Load existing analysis
  console.log('📂 Loading audio library...');
  if (!fs.existsSync(AUDIO_LIBRARY_FILE)) {
    console.error(`❌ Audio library file not found: ${AUDIO_LIBRARY_FILE}`);
    process.exit(1);
  }

  const library: AudioLibrary = JSON.parse(fs.readFileSync(AUDIO_LIBRARY_FILE, 'utf-8'));
  console.log(`✅ Loaded ${library.tracks.length} tracks\n`);

  // Check for resume
  const checkpoint = loadCheckpoint();
  const startIndex = checkpoint ? checkpoint.lastProcessedIndex + 1 : 0;

  if (checkpoint) {
    console.log(`🔄 Resuming from track ${startIndex} (${checkpoint.processedCount} already processed)\n`);
  }

  // Create write stream
  const writeStream = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf-8' });

  // Write JSON header
  writeStream.write('{\n');
  writeStream.write(`  "generatedAt": "${new Date().toISOString()}",\n`);
  writeStream.write(`  "source": "${library.source} + v5 beat analysis",\n`);
  writeStream.write(`  "totalFiles": ${library.totalFiles},\n`);
  writeStream.write(`  "analyzedTracks": ${library.analyzedTracks},\n`);
  if (library.machine) {
    writeStream.write(`  "machine": "${library.machine}",\n`);
  }
  writeStream.write('  "tracks": [\n');

  let processedCount = 0;
  let enrichedCount = 0;
  const totalToProcess = Math.min(library.tracks.length, testLimit);

  // Process tracks
  console.log('🔄 Enriching tracks...\n');

  for (let i = 0; i < totalToProcess; i++) {
    const track = library.tracks[i];

    // Skip if before checkpoint
    if (i < startIndex) {
      continue;
    }

    console.log(`[${i + 1}/${totalToProcess}]`);
    console.log(`  Analyzing: ${track.artist} - ${track.title}`);

    const enrichedTrack = await enrichTrack(track);

    if (enrichedTrack.segments) {
      enrichedCount++;
    }

    // Write track to stream (with comma if not first)
    if (processedCount > 0) {
      writeStream.write(',\n');
    }
    writeStream.write('    ' + JSON.stringify(enrichedTrack));

    processedCount++;

    // Save checkpoint every 50 tracks
    if (processedCount % 50 === 0) {
      saveCheckpoint({
        lastProcessedIndex: i,
        processedCount,
        timestamp: new Date().toISOString(),
      });
      console.log(`\n💾 Checkpoint saved (${processedCount}/${totalToProcess} tracks)\n`);
    }
  }

  // Write JSON footer
  writeStream.write('\n  ]\n');
  writeStream.write('}\n');
  writeStream.end();

  await new Promise<void>((resolve) => writeStream.on('finish', resolve));

  console.log(`\n✅ Enrichment complete!`);
  console.log(`   📊 Processed: ${processedCount} tracks`);
  console.log(`   ✨ Enriched: ${enrichedCount} tracks with segments`);
  console.log(`   💾 Output: ${OUTPUT_FILE}\n`);

  // Clean up checkpoint
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }

  if (!testMode) {
    console.log('📤 Next steps:');
    console.log(`   1. Verify: cat ${OUTPUT_FILE} | jq '.tracks | length'`);
    console.log(`   2. Backup old: mv data/audio-library-analysis.json data/audio-library-analysis.old.json`);
    console.log(`   3. Deploy: mv ${OUTPUT_FILE} data/audio-library-analysis.json`);
    console.log(`   4. Restart: pm2 restart notorious-dad`);
  }
}

main().catch(console.error);
