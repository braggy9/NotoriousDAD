#!/usr/bin/env npx tsx
/**
 * Enrich Audio Library Analysis with Advanced Beat Detection
 *
 * This script takes the existing audio-library-analysis.json file
 * and enriches each track with:
 * - Segment detection (intro/verse/buildup/drop/breakdown/outro)
 * - Mix points (optimal in/out points)
 * - Energy curve (detailed RMS analysis)
 * - Beat/downbeat positions
 * - Drop/breakdown detection
 *
 * This gives us the same capabilities as Spotify Audio Analysis
 * but works for ALL tracks, even those without Spotify IDs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { analyzeTrack, TrackAnalysis } from '../lib/beat-analyzer';

const AUDIO_LIBRARY_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis.json');
const BACKUP_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis.backup.json');

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
  genre?: string;

  // NEW: Advanced analysis fields
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
}

/**
 * Calculate ideal crossfade duration based on segments
 */
function calculateIdealCrossfade(segments: any[]): number {
  // Default to 16 bars
  let bars = 16;

  // If track has clean outro, allow longer fade
  const hasOutro = segments.some(s => s.type === 'outro');
  if (hasOutro) {
    bars = 32;
  }

  // If track has strong drop, use shorter fade for impact
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
  console.log(`  Analyzing: ${track.artist} - ${track.title}`);

  // Check if file exists
  if (!fs.existsSync(track.filePath)) {
    console.log(`    ⚠️  File not found, skipping`);
    return track;
  }

  try {
    // Run our beat analyzer (use MIK BPM for accuracy)
    const analysis = await analyzeTrack(track.filePath, track.bpm);

    if (!analysis) {
      console.log(`    ❌ Analysis failed`);
      return track;
    }

    // Extract relevant data
    const enrichedTrack: CloudAudioTrack = {
      ...track,
      duration: analysis.duration, // Fix duration (was 0 in many tracks)
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
 * Main function
 */
async function main() {
  console.log('🎵 Audio Library Enrichment Tool\n');

  // Check if FFmpeg is available
  const { execSync } = await import('child_process');
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('✅ FFmpeg detected\n');
  } catch {
    console.error('❌ FFmpeg not found. Please install FFmpeg first.');
    process.exit(1);
  }

  // Load existing library
  if (!fs.existsSync(AUDIO_LIBRARY_FILE)) {
    console.error(`❌ Audio library file not found: ${AUDIO_LIBRARY_FILE}`);
    process.exit(1);
  }

  console.log('📂 Loading audio library...');
  const library: AudioLibrary = JSON.parse(fs.readFileSync(AUDIO_LIBRARY_FILE, 'utf-8'));
  console.log(`✅ Loaded ${library.tracks.length} tracks\n`);

  // Create backup
  console.log('💾 Creating backup...');
  fs.copyFileSync(AUDIO_LIBRARY_FILE, BACKUP_FILE);
  console.log(`✅ Backup saved: ${BACKUP_FILE}\n`);

  // Process tracks
  const startTime = Date.now();
  let enrichedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // Option to process subset for testing
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const maxTracks = testMode ? 10 : library.tracks.length;

  if (testMode) {
    console.log('🧪 TEST MODE: Processing first 10 tracks only\n');
  }

  const tracksToProcess = library.tracks.slice(0, maxTracks);

  for (let i = 0; i < tracksToProcess.length; i++) {
    const track = tracksToProcess[i];
    console.log(`[${i + 1}/${tracksToProcess.length}]`);

    // Skip if already enriched (has segments)
    if (track.segments && track.segments.length > 0) {
      console.log(`  ⏭️  Already enriched: ${track.artist} - ${track.title}`);
      skippedCount++;
      continue;
    }

    const enriched = await enrichTrack(track);

    if (enriched.segments && enriched.segments.length > 0) {
      library.tracks[i] = enriched;
      enrichedCount++;
    } else {
      failedCount++;
    }

    // Save progress every 50 tracks
    if ((i + 1) % 50 === 0) {
      console.log(`\n💾 Saving progress (${i + 1} tracks processed)...`);
      fs.writeFileSync(
        AUDIO_LIBRARY_FILE,
        JSON.stringify(library, null, 2)
      );
      console.log('✅ Progress saved\n');
    }
  }

  // Final save
  console.log('\n💾 Saving final results...');
  library.generatedAt = new Date().toISOString();
  library.source = 'Mixed In Key + Beat Analyzer (v5)';
  fs.writeFileSync(
    AUDIO_LIBRARY_FILE,
    JSON.stringify(library, null, 2)
  );
  console.log('✅ Complete!\n');

  // Stats
  const elapsed = (Date.now() - startTime) / 1000;
  console.log('📊 Summary:');
  console.log(`   Enriched: ${enrichedCount} tracks`);
  console.log(`   Skipped: ${skippedCount} tracks (already enriched)`);
  console.log(`   Failed: ${failedCount} tracks`);
  console.log(`   Time: ${elapsed.toFixed(1)}s (${(elapsed / tracksToProcess.length).toFixed(1)}s per track)`);
  console.log(`\n✨ Enhanced audio library saved to: ${AUDIO_LIBRARY_FILE}`);
  console.log(`📦 Backup available at: ${BACKUP_FILE}`);

  if (!testMode && enrichedCount > 0) {
    console.log(`\n🚀 Next steps:`);
    console.log(`   1. Review the enriched data`);
    console.log(`   2. Deploy to server: rsync data/audio-library-analysis.json root@178.156.214.56:/var/www/notorious-dad/data/`);
    console.log(`   3. Restart server: ssh root@178.156.214.56 'cd /var/www/notorious-dad && pm2 restart notorious-dad'`);
    console.log(`   4. Test mix generation with enhanced transitions!`);
  }
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
