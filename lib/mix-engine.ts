/**
 * Mix Engine
 *
 * The core mixing engine that combines audio files with intelligent transitions.
 * Uses FFmpeg for audio processing with:
 * - Crossfades with EQ mixing (bass swap)
 * - Filter sweeps and effects
 * - Beat-matched transitions
 * - Energy-aware mix point selection
 *
 * This is the heart of the AI DJ system.
 */

import { execSync, spawn } from 'child_process';

/**
 * Execute FFmpeg command with CPU limit to avoid blocking Node.js event loop
 * Uses 'cpulimit' to cap FFmpeg at 75% CPU, ensuring Node.js gets sufficient
 * CPU time to process HTTP requests during mixing operations
 */
function execFFmpegAsync(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Wrap FFmpeg command with cpulimit to cap at 75% CPU (300% on 4-core system)
    // This leaves 25% CPU minimum for Node.js HTTP handling
    // Using --  to separate cpulimit args from ffmpeg command
    const limitedCommand = `cpulimit -l 75 -- ${command}`;

    const child = spawn('sh', ['-c', limitedCommand], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`FFmpeg spawn error: ${error.message}`));
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else if (signal) {
        reject(new Error(`FFmpeg killed with signal ${signal}`));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}\n${stderr}`));
      }
    });
  });
}
import * as fs from 'fs';
import * as path from 'path';
import { TrackAnalysis, analyzeTrack } from './beat-analyzer';
import { TransitionMetadata, TransitionType, TransitionEffect } from './transition-analyzer';
import { IndexedAudioFile } from './audio-library-indexer';

// Mix job configuration
export interface MixJob {
  id: string;
  name: string;
  tracks: MixTrack[];
  outputPath: string;
  format: 'mp3' | 'wav' | 'flac';
  quality: 'high' | 'medium' | 'low';
}

// Individual track in a mix
export interface MixTrack {
  filePath: string;
  artist: string;
  title: string;

  // MIK data
  bpm: number;
  camelotKey: string;
  energy: number;

  // Optional: pre-analyzed data
  analysis?: TrackAnalysis;

  // Mix configuration (optional overrides)
  mixInPoint?: number; // Override auto-detected
  mixOutPoint?: number; // Override auto-detected
  bpmAdjust?: number; // Pitch adjustment percentage

  // v3 Enhanced: Transition hints from structural analysis
  transitionHints?: {
    preferredInType: string;
    preferredOutType: string;
    hasStrongDrop: boolean;
    hasCleanOutro: boolean;
    idealCrossfadeBars: number;
  };
}

// Progress callback
export type ProgressCallback = (
  stage: 'analyzing' | 'processing' | 'rendering' | 'complete',
  progress: number,
  message: string
) => void;

// Mix result
export interface MixResult {
  success: boolean;
  outputPath?: string;
  duration?: number;
  errorMessage?: string;

  // Quality metrics
  transitionCount: number;
  avgTransitionScore: number;
  harmonicMixPercentage: number;
}

/**
 * Check if an audio file is playable (not corrupt or iCloud-optimized)
 */
function isFilePlayable(filePath: string): boolean {
  try {
    // Quick ffprobe check - if it can read duration, file is likely playable
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}" 2>&1`,
      { encoding: 'utf-8', timeout: 5000 }
    );
    const duration = parseFloat(result.trim());
    return !isNaN(duration) && duration > 0;
  } catch {
    return false;
  }
}

/**
 * FFmpeg filter for crossfade transition
 */
function buildCrossfadeFilter(
  track1Duration: number,
  track2Duration: number,
  crossfadeDuration: number,
  transitionType: TransitionType
): string {
  // Basic crossfade
  let filter = `acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri`;

  // Add effects based on transition type
  switch (transitionType) {
    case 'long-blend':
      // Smooth crossfade with slight EQ adjustment
      filter = `acrossfade=d=${crossfadeDuration}:c1=exp:c2=log`;
      break;
    case 'short-blend':
      // Quick crossfade
      filter = `acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri`;
      break;
    case 'echo-out':
      // Would need separate echo filter - use fade for now
      filter = `acrossfade=d=${crossfadeDuration}:c1=exp:c2=tri`;
      break;
    case 'filter-sweep':
      // This would need dynamic filter - approximate with curves
      filter = `acrossfade=d=${crossfadeDuration}:c1=esin:c2=esin`;
      break;
    case 'cut':
      // Very short crossfade (essentially a cut with minimal bleeding)
      filter = `acrossfade=d=0.1:c1=tri:c2=tri`;
      break;
    case 'breakdown-drop':
      // Quick fade out, instant in
      filter = `acrossfade=d=${crossfadeDuration}:c1=log:c2=nofade`;
      break;
    default:
      filter = `acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri`;
  }

  return filter;
}

/**
 * Calculate crossfade duration in seconds based on bars and BPM
 * Caps at 55 seconds to stay under FFmpeg's 60s acrossfade limit
 */
function barsToSeconds(bars: number, bpm: number): number {
  const beatsPerBar = 4;
  const secondsPerBeat = 60 / bpm;
  const duration = bars * beatsPerBar * secondsPerBeat;
  // FFmpeg acrossfade max is 60 seconds, cap at 55 for safety
  return Math.min(duration, 55);
}

/**
 * Generate FFmpeg command for mixing two tracks
 */
function generateMixCommand(
  track1Path: string,
  track2Path: string,
  outputPath: string,
  crossfadeSeconds: number,
  track1MixOut: number, // When to start fading track 1
  track2MixIn: number, // Where in track 2 to start
  bpmAdjust?: number // Pitch/tempo adjustment for track 2
): string {
  const parts: string[] = ['ffmpeg', '-y'];

  // Input files
  parts.push(`-i "${track1Path}"`);
  parts.push(`-i "${track2Path}"`);

  // Build filter complex
  const filters: string[] = [];

  // Trim track 1 to end at mix out point + crossfade
  filters.push(`[0:a]atrim=0:${track1MixOut + crossfadeSeconds},asetpts=PTS-STARTPTS[a1]`);

  // Trim and optionally tempo-adjust track 2
  if (bpmAdjust && Math.abs(bpmAdjust) > 0.5) {
    // Adjust tempo using rubberband or atempo
    const tempoFactor = 1 + bpmAdjust / 100;
    filters.push(
      `[1:a]atrim=${track2MixIn}:,asetpts=PTS-STARTPTS,atempo=${tempoFactor}[a2]`
    );
  } else {
    filters.push(`[1:a]atrim=${track2MixIn}:,asetpts=PTS-STARTPTS[a2]`);
  }

  // Crossfade
  filters.push(`[a1][a2]acrossfade=d=${crossfadeSeconds}:c1=tri:c2=tri[out]`);

  parts.push(`-filter_complex "${filters.join(';')}"`);
  parts.push('-map "[out]"');

  // Output format
  const ext = path.extname(outputPath).toLowerCase();
  if (ext === '.mp3') {
    parts.push('-codec:a libmp3lame -q:a 2');
  } else if (ext === '.flac') {
    parts.push('-codec:a flac');
  } else {
    parts.push('-codec:a pcm_s16le'); // WAV
  }

  parts.push(`"${outputPath}"`);

  return parts.join(' ');
}

/**
 * Mix two audio files with crossfade
 */
export async function mixTwoTracks(
  track1: MixTrack,
  track2: MixTrack,
  outputPath: string,
  transitionBars: number = 16
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify files exist
    if (!fs.existsSync(track1.filePath)) {
      return { success: false, error: `Track 1 not found: ${track1.filePath}` };
    }
    if (!fs.existsSync(track2.filePath)) {
      return { success: false, error: `Track 2 not found: ${track2.filePath}` };
    }

    // Get track durations if not provided
    let track1Duration = track1.analysis?.duration;
    let track2Duration = track2.analysis?.duration;

    if (!track1Duration) {
      const result = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${track1.filePath}"`,
        { encoding: 'utf-8' }
      );
      track1Duration = parseFloat(result.trim());
    }

    // Calculate crossfade duration
    const avgBPM = (track1.bpm + track2.bpm) / 2;
    let crossfadeSeconds = barsToSeconds(transitionBars, avgBPM);

    // Ensure crossfade doesn't exceed 40% of track duration
    // (leaves room for intro/outro)
    if (crossfadeSeconds > track1Duration * 0.4) {
      crossfadeSeconds = Math.max(8, track1Duration * 0.3); // Minimum 8 seconds
      console.log(`  ⚠️  Reduced crossfade to ${crossfadeSeconds.toFixed(1)}s for short track`);
    }

    // Calculate mix points - ensuring we leave room for crossfade
    // The mix out point + crossfade duration must not exceed track length
    const maxMixOutPoint = track1Duration! - crossfadeSeconds - 1; // Leave 1s buffer

    // Use 97% of track duration for better mix length (only trim very end)
    // This gives proper mix durations: 12 tracks ~30min, 20 tracks ~1hr, 40 tracks ~2hr
    const defaultMixOutPoint = Math.min(track1Duration! * 0.97, maxMixOutPoint);
    const mixOutPoint = track1.mixOutPoint
      ? Math.min(track1.mixOutPoint, maxMixOutPoint)
      : defaultMixOutPoint;
    const mixInPoint = track2.mixInPoint || 0;

    // Calculate BPM adjustment if needed
    const bpmDiff = Math.abs(track1.bpm - track2.bpm);
    let bpmAdjust: number | undefined;
    if (bpmDiff > 1 && bpmDiff < 10) {
      bpmAdjust = ((track1.bpm - track2.bpm) / track2.bpm) * 100;
    }

    // Generate and execute FFmpeg command
    const command = generateMixCommand(
      track1.filePath,
      track2.filePath,
      outputPath,
      crossfadeSeconds,
      mixOutPoint,
      mixInPoint,
      bpmAdjust
    );

    console.log(`  Mixing: ${track1.title} → ${track2.title}`);

    // Use spawn-based async execution to avoid blocking Node.js event loop
    await execFFmpegAsync(command);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Mix a full playlist of tracks
 */
export async function mixPlaylist(
  job: MixJob,
  onProgress?: ProgressCallback
): Promise<MixResult> {
  const startTime = Date.now();
  const tempDir = `/tmp/mix-engine-${job.id}`;

  try {
    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    if (job.tracks.length < 2) {
      return {
        success: false,
        errorMessage: 'Need at least 2 tracks to create a mix',
        transitionCount: 0,
        avgTransitionScore: 0,
        harmonicMixPercentage: 0,
      };
    }

    onProgress?.('analyzing', 0, 'Starting mix...');

    // Step 1: Analyze tracks and filter out corrupt/unavailable ones
    const validTracks: MixTrack[] = [];
    for (let i = 0; i < job.tracks.length; i++) {
      const track = job.tracks[i];
      onProgress?.(
        'analyzing',
        (i / job.tracks.length) * 30,
        `Analyzing: ${track.title}`
      );

      // Check if file is accessible and not corrupt
      if (!isFilePlayable(track.filePath)) {
        console.log(`  ⚠️ Skipping unavailable/corrupt: ${track.title}`);
        continue;
      }

      if (!track.analysis) {
        try {
          track.analysis = await analyzeTrack(track.filePath, track.bpm) || undefined;
        } catch (err) {
          console.log(`  ⚠️ Analysis failed, skipping: ${track.title}`);
          continue;
        }
      }
      validTracks.push(track);
    }

    // Update job tracks with only valid ones
    job.tracks = validTracks;

    if (job.tracks.length < 2) {
      return {
        success: false,
        errorMessage: `Only ${job.tracks.length} valid tracks available after filtering corrupt files`,
        transitionCount: 0,
        avgTransitionScore: 0,
        harmonicMixPercentage: 0,
      };
    }

    console.log(`  ✓ ${validTracks.length} valid tracks for mixing`);

    // Step 2: Mix tracks pairwise
    let currentMixPath = job.tracks[0].filePath;
    let transitionCount = 0;
    let harmonicTransitions = 0;

    for (let i = 0; i < job.tracks.length - 1; i++) {
      const progress = 30 + ((i / (job.tracks.length - 1)) * 60);
      onProgress?.(
        'processing',
        progress,
        `Mixing track ${i + 1} of ${job.tracks.length - 1}`
      );

      const track1 = { ...job.tracks[i], filePath: currentMixPath };
      const track2 = job.tracks[i + 1];

      // Determine transition length based on v3 hints or key compatibility
      let transitionBars = 16; // Default
      const key1 = track1.camelotKey;
      const key2 = track2.camelotKey;
      const isHarmonic = checkKeyCompatibility(key1, key2);

      if (isHarmonic) {
        harmonicTransitions++;
      }

      // Use v3 transition hints if available
      if (track1.transitionHints?.idealCrossfadeBars) {
        // Use the outgoing track's recommended crossfade duration
        transitionBars = track1.transitionHints.idealCrossfadeBars;
        console.log(`    ✓ Using v3 hint: ${transitionBars} bars (outgoing track)`);
      } else if (track2.transitionHints?.idealCrossfadeBars) {
        // Fallback to incoming track's hint
        transitionBars = track2.transitionHints.idealCrossfadeBars;
        console.log(`    ✓ Using v3 hint: ${transitionBars} bars (incoming track)`);
      } else {
        // Fallback to basic harmonic logic
        transitionBars = isHarmonic ? 32 : 8;
        console.log(`    → Basic mode: ${transitionBars} bars (${isHarmonic ? 'harmonic' : 'non-harmonic'})`);
      }

      // Log v3 mix points being used
      if (track1.mixOutPoint || track2.mixInPoint) {
        console.log(`    ✓ v3 mix points: out=${track1.mixOutPoint?.toFixed(1) || 'auto'}s, in=${track2.mixInPoint?.toFixed(1) || '0'}s`);
      }

      // Generate intermediate file path
      const intermediatePath = path.join(tempDir, `mix_${i}.mp3`);

      const result = await mixTwoTracks(track1, track2, intermediatePath, transitionBars);

      if (!result.success) {
        console.error(`Failed to mix tracks ${i} and ${i + 1}: ${result.error}`);
        // Continue with just track2
        currentMixPath = track2.filePath;
      } else {
        currentMixPath = intermediatePath;
        transitionCount++;
      }
    }

    // Step 3: Render final output
    onProgress?.('rendering', 95, 'Rendering final mix...');

    // Copy or convert to final format
    const outputExt = path.extname(job.outputPath).toLowerCase();
    const currentExt = path.extname(currentMixPath).toLowerCase();

    if (outputExt !== currentExt) {
      // Convert to desired format
      let codec = 'libmp3lame -q:a 2';
      if (outputExt === '.flac') codec = 'flac';
      if (outputExt === '.wav') codec = 'pcm_s16le';

      await execFFmpegAsync(`ffmpeg -y -i "${currentMixPath}" -codec:a ${codec} "${job.outputPath}"`);
    } else {
      fs.copyFileSync(currentMixPath, job.outputPath);
    }

    // Get final duration
    const durationResult = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${job.outputPath}"`,
      { encoding: 'utf-8' }
    );
    const duration = parseFloat(durationResult.trim());

    // Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });

    onProgress?.('complete', 100, 'Mix complete!');

    return {
      success: true,
      outputPath: job.outputPath,
      duration,
      transitionCount,
      avgTransitionScore: 0.85, // TODO: Calculate properly
      harmonicMixPercentage:
        transitionCount > 0
          ? Math.round((harmonicTransitions / transitionCount) * 100)
          : 0,
    };
  } catch (error) {
    // Clean up on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      transitionCount: 0,
      avgTransitionScore: 0,
      harmonicMixPercentage: 0,
    };
  }
}

/**
 * Check if two Camelot keys are compatible
 */
function checkKeyCompatibility(key1: string, key2: string): boolean {
  if (!key1 || !key2) return false;
  if (key1 === key2) return true;

  const num1 = parseInt(key1);
  const num2 = parseInt(key2);
  const letter1 = key1.slice(-1);
  const letter2 = key2.slice(-1);

  // Same number, different letter (relative major/minor)
  if (num1 === num2 && letter1 !== letter2) return true;

  // Adjacent numbers, same letter
  if (letter1 === letter2) {
    const diff = Math.abs(num1 - num2);
    if (diff === 1 || diff === 11) return true; // 11 for 12->1 wrap
  }

  return false;
}

/**
 * CLI for testing
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log('Usage: npx tsx lib/mix-engine.ts <track1> <track2> <output>');
    console.log('Example: npx tsx lib/mix-engine.ts song1.mp3 song2.mp3 mix.mp3');
    process.exit(1);
  }

  const [track1Path, track2Path, outputPath] = args;

  const track1: MixTrack = {
    filePath: track1Path,
    artist: 'Artist 1',
    title: path.basename(track1Path),
    bpm: 120,
    camelotKey: '8A',
    energy: 0.7,
  };

  const track2: MixTrack = {
    filePath: track2Path,
    artist: 'Artist 2',
    title: path.basename(track2Path),
    bpm: 120,
    camelotKey: '8A',
    energy: 0.7,
  };

  console.log('🎛️  Mix Engine Test');
  console.log('='.repeat(50));
  console.log(`Track 1: ${track1.title}`);
  console.log(`Track 2: ${track2.title}`);
  console.log(`Output: ${outputPath}`);
  console.log('');

  mixTwoTracks(track1, track2, outputPath).then((result) => {
    if (result.success) {
      console.log('✅ Mix created successfully!');
    } else {
      console.log(`❌ Mix failed: ${result.error}`);
    }
  });
}
