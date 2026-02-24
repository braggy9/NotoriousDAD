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
 * Execute FFmpeg command without blocking Node.js event loop
 * Uses spawn with proper async handling to allow HTTP requests during mixing
 */
function execFFmpegAsync(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
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
import {
  SpotifyAudioAnalysis,
  findOptimalMixOutPoint as spotifyFindMixOut,
  findOptimalMixInPoint as spotifyFindMixIn,
  calculateCrossfadeDuration as spotifyCalculateCrossfade,
  classifySections,
  SegmentType,
} from './spotify-audio-analyzer';

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

  // NEW: Spotify analysis integration
  spotifyId?: string; // Spotify track ID (if available)
  spotifyAnalysis?: SpotifyAudioAnalysis; // Spotify Audio Analysis data

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
 * Build animated filter sweep for professional transitions
 *
 * Simulates a DJ progressively turning the high-pass filter knob:
 * - Splits outgoing track into clean (dry) and heavily filtered (wet) paths
 * - Uses time-varying volume expressions to crossfade dry→wet during transition
 * - The sweep activates only during the crossfade zone (last N seconds of track 1)
 * - Combined with acrossfade volume curves for a natural-sounding transition
 */
function buildFilterSweepFilter(crossfadeDuration: number, track1TrimmedDuration?: number): string {
  // If we know the trimmed duration, animate the sweep precisely over the crossfade zone
  if (track1TrimmedDuration && track1TrimmedDuration > crossfadeDuration) {
    const sweepStart = (track1TrimmedDuration - crossfadeDuration).toFixed(3);
    const cd = crossfadeDuration.toFixed(3);

    // Ramp expression: 0 before sweep, linearly 0→1 during sweep, 1 after
    const rampUp = `clip((t-${sweepStart})/${cd},0,1)`;
    const rampDown = `1-clip((t-${sweepStart})/${cd},0,1)`;

    return [
      // Split outgoing into clean and filtered paths
      `[a1]asplit=2[a1_dry][a1_wet]`,
      // Steep high-pass at 2.5kHz (two cascaded filters for -24dB/oct rolloff)
      `[a1_wet]highpass=f=2500:p=2,highpass=f=2500:p=2[a1_hpf]`,
      // Clean signal: full volume before sweep, fades to 0 during crossfade
      `[a1_dry]volume='${rampDown}':eval=frame[a1_d]`,
      // Filtered signal: silent before sweep, fades to 1 during crossfade
      `[a1_hpf]volume='${rampUp}':eval=frame[a1_w]`,
      // Combine — normalize=0 preserves original levels
      `[a1_d][a1_w]amix=inputs=2:normalize=0:duration=shortest[a1_final]`,
      // Fade in incoming track
      `[a2]afade=t=in:st=0:d=${crossfadeDuration}[a2_final]`,
      // Crossfade the swept outgoing with incoming
      `[a1_final][a2_final]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri`,
    ].join(';');
  }

  // Fallback: simple crossfade with high-pass on outgoing (when duration unknown)
  return [
    `[a1]highpass=f=200:p=1[a1_final]`,
    `[a2]afade=t=in:st=0:d=${crossfadeDuration}[a2_final]`,
    `[a1_final][a2_final]acrossfade=d=${crossfadeDuration}:c1=exp:c2=log`,
  ].join(';');
}

/**
 * Build EQ swap filter for smooth bass transitions
 */
function buildEQSwapFilter(crossfadeDuration: number): string {
  // Reduce bass from outgoing, enhance bass on incoming
  return `
    [a1]asplit=2[a1_dry][a1_eq];
    [a1_eq]bass=g=-6:f=100:w=0.5[a1_nobass];
    [a1_dry][a1_nobass]amix=inputs=2:weights=0.3 0.7:duration=longest[a1_final];
    [a2]asplit=2[a2_dry][a2_eq];
    [a2_eq]bass=g=3:f=100:w=0.5[a2_withbass];
    [a2_dry][a2_withbass]amix=inputs=2:weights=0.6 0.4:duration=longest[a2_final];
    [a1_final][a2_final]acrossfade=d=${crossfadeDuration}:c1=exp:c2=log
  `.trim().replace(/\s+/g, '');
}

/**
 * FFmpeg filter for crossfade transition with advanced effects
 */
function buildCrossfadeFilter(
  outSegment: string,
  inSegment: string,
  crossfadeDuration: number,
  harmonicMatch: boolean,
  track1TrimmedDuration?: number
): string {
  // ENHANCEMENT: Use advanced filters for specific segment combinations

  // Breakdown → Buildup: Filter sweep (professional DJ transition)
  if (outSegment === 'breakdown' && inSegment === 'buildup') {
    console.log(`    🎛️ Using filter sweep transition`);
    return buildFilterSweepFilter(crossfadeDuration, track1TrimmedDuration);
  }

  // Outro → Intro: EQ swap for smooth bass transition
  if (outSegment === 'outro' || inSegment === 'intro') {
    console.log(`    🎛️ Using EQ swap transition`);
    return buildEQSwapFilter(crossfadeDuration);
  }

  // Drop → Drop: Quick cut with minimal bleed
  if (outSegment === 'drop' && inSegment === 'drop') {
    return `acrossfade=d=${Math.min(crossfadeDuration, 2)}:c1=tri:c2=tri`;
  }

  // Harmonic matches: Smooth exponential blend
  if (harmonicMatch) {
    return `acrossfade=d=${crossfadeDuration}:c1=exp:c2=log`;
  }

  // Non-harmonic: Quick linear blend to minimize clash
  return `acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri`;
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
 * Genre-aware crossfade duration calculation
 * Different genres have different phrase lengths and mixing traditions
 */
function calculateGenreAwareCrossfade(
  genre1: string | undefined,
  genre2: string | undefined,
  bpm1: number,
  bpm2: number,
  defaultBars: number = 16
): { bars: number; seconds: number } {
  const genre = genre1 || genre2 || 'unknown';
  const avgBPM = (bpm1 + bpm2) / 2;
  const genreLower = genre.toLowerCase();

  let bars = defaultBars;

  // Genre-specific crossfade preferences
  if (genreLower.includes('house') || genreLower.includes('techno')) {
    bars = 32; // House/Techno: long blends (32 bars = 8 phrases)
  } else if (genreLower.includes('trance')) {
    bars = 32; // Trance: long atmospheric blends
  } else if (genreLower.includes('drum and bass') || genreLower.includes('dnb')) {
    bars = 16; // D&B: medium blends (fast tempo makes this ~20s)
  } else if (genreLower.includes('dubstep')) {
    bars = 8; // Dubstep: shorter blends (emphasize drops)
  } else if (genreLower.includes('hip-hop') || genreLower.includes('rap')) {
    bars = 8; // Hip-Hop: quick transitions (respect verses)
  } else if (genreLower.includes('disco') || genreLower.includes('funk')) {
    bars = 16; // Disco: classic DJ blends
  } else if (genreLower.includes('pop') || genreLower.includes('indie')) {
    bars = 8; // Pop: shorter blends (preserve song structure)
  }

  // Calculate time in seconds
  const seconds = barsToSeconds(bars, avgBPM);

  return { bars, seconds };
}

/**
 * Enforce phrase boundaries (4/8/16/32-bar boundaries)
 * Professional DJs mix on phrase boundaries to maintain musical structure
 */
function enforcePhraseBoundary(
  mixPoint: number,
  bpm: number,
  downbeats: number[],
  phraseLengthBars: number = 8
): number {
  if (!downbeats || downbeats.length === 0) {
    return mixPoint; // No beat data, can't enforce boundaries
  }

  // Calculate seconds per phrase
  const beatsPerBar = 4;
  const secondsPerBeat = 60 / bpm;
  const secondsPerPhrase = phraseLengthBars * beatsPerBar * secondsPerBeat;

  // Find the nearest downbeat to mix point
  const nearestDownbeat = findNearestDownbeat(downbeats, mixPoint);

  // Find which phrase number this downbeat represents
  // (assuming first downbeat is at phrase boundary)
  const firstDownbeat = downbeats[0];
  const timeSinceFirst = nearestDownbeat - firstDownbeat;
  const phrasesElapsed = timeSinceFirst / secondsPerPhrase;

  // Round to nearest phrase boundary
  const alignedPhraseCount = Math.round(phrasesElapsed);
  const alignedTime = firstDownbeat + (alignedPhraseCount * secondsPerPhrase);

  // Find closest downbeat to aligned time
  const alignedDownbeat = findNearestDownbeat(downbeats, alignedTime);

  console.log(
    `  📐 Phrase-aligned mixPoint: ${mixPoint.toFixed(1)}s → ${alignedDownbeat.toFixed(1)}s ` +
    `(${alignedPhraseCount} × ${phraseLengthBars}-bar phrases)`
  );

  return alignedDownbeat;
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
  outSegment: string, // Outgoing segment type
  inSegment: string, // Incoming segment type
  harmonicMatch: boolean, // Key compatibility
  bpmAdjust?: number // Pitch/tempo adjustment for track 2
): string {
  const parts: string[] = ['ffmpeg', '-y'];

  // Input files
  parts.push(`-i "${track1Path}"`);
  parts.push(`-i "${track2Path}"`);

  // Build filter complex
  const filters: string[] = [];

  // EBU R128 loudness normalization — ensures consistent volume across tracks
  // I=-14 = integrated loudness target (Spotify/YouTube standard)
  // TP=-1 = true peak limit (prevents clipping)
  // LRA=11 = loudness range target (preserves dynamics)
  const loudnorm = 'loudnorm=I=-14:TP=-1:LRA=11';

  // Trim track 1 to end at mix out point + crossfade, then normalize
  filters.push(`[0:a]atrim=0:${track1MixOut + crossfadeSeconds},asetpts=PTS-STARTPTS,${loudnorm}[a1]`);

  // Track 1 trimmed duration (needed for animated filter sweep timing)
  const track1TrimmedDuration = track1MixOut + crossfadeSeconds;

  // Trim, optionally tempo-adjust, and normalize track 2
  if (bpmAdjust && Math.abs(bpmAdjust) > 0.5) {
    // Adjust tempo using atempo
    const tempoFactor = 1 + bpmAdjust / 100;
    filters.push(
      `[1:a]atrim=${track2MixIn}:,asetpts=PTS-STARTPTS,atempo=${tempoFactor},${loudnorm}[a2]`
    );
  } else {
    filters.push(`[1:a]atrim=${track2MixIn}:,asetpts=PTS-STARTPTS,${loudnorm}[a2]`);
  }

  // ENHANCEMENT: Advanced crossfade with filter effects
  const crossfadeFilter = buildCrossfadeFilter(outSegment, inSegment, crossfadeSeconds, harmonicMatch, track1TrimmedDuration);
  filters.push(`[a1][a2]${crossfadeFilter}[out]`);

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
  transitionBars: number = 16,
  outSegment: string = 'unknown',
  inSegment: string = 'unknown',
  harmonicMatch: boolean = false
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

    // Calculate crossfade duration (genre-aware)
    const genre1 = (track1 as any).genre;
    const genre2 = (track2 as any).genre;
    const genreCrossfade = calculateGenreAwareCrossfade(
      genre1,
      genre2,
      track1.bpm,
      track2.bpm,
      transitionBars
    );

    let crossfadeSeconds = genreCrossfade.seconds;
    console.log(
      `  ⏱️  Genre-aware crossfade: ${genreCrossfade.bars} bars = ${crossfadeSeconds.toFixed(1)}s ` +
      `@ ${((track1.bpm + track2.bpm) / 2).toFixed(1)} BPM`
    );

    // Ensure crossfade doesn't exceed 40% of track duration
    // (leaves room for intro/outro)
    if (crossfadeSeconds > track1Duration * 0.4) {
      crossfadeSeconds = Math.max(8, track1Duration * 0.3); // Minimum 8 seconds
      console.log(`  ⚠️  Reduced crossfade to ${crossfadeSeconds.toFixed(1)}s for short track`);
    }

    // Calculate mix points - ensuring we leave room for crossfade
    // The mix out point + crossfade duration must not exceed track length
    const maxMixOutPoint = track1Duration! - crossfadeSeconds - 1; // Leave 1s buffer

    // ENHANCEMENT: Segment-aware mix point selection (Spotify analysis preferred)
    const defaultMixOutPoint = track1.mixOutPoint
      ? Math.min(track1.mixOutPoint, maxMixOutPoint)
      : findOptimalMixOut(track1.analysis, track1.spotifyAnalysis, track1Duration!, maxMixOutPoint);

    const defaultMixInPoint = track2.mixInPoint !== undefined
      ? track2.mixInPoint
      : findOptimalMixIn(track2.analysis, track2.spotifyAnalysis);

    let mixOutPoint = defaultMixOutPoint;
    let mixInPoint = defaultMixInPoint;

    // ENHANCEMENT: Phrase-boundary enforcement for professional mixing
    if (track1.analysis?.downbeats && track1.analysis.downbeats.length > 0) {
      // Enforce 8-bar phrase boundaries (or 16-bar for house/techno)
      const phraseLengthBars = (genre1 && (genre1.toLowerCase().includes('house') || genre1.toLowerCase().includes('techno')))
        ? 16 // House/Techno: 16-bar phrases
        : 8; // Most genres: 8-bar phrases

      const phraseAligned = enforcePhraseBoundary(
        mixOutPoint,
        track1.bpm,
        track1.analysis.downbeats,
        phraseLengthBars
      );

      if (phraseAligned <= maxMixOutPoint) {
        mixOutPoint = phraseAligned;
      } else {
        // Fallback to simple downbeat alignment if phrase boundary exceeds max
        const aligned = findNearestDownbeat(track1.analysis.downbeats, mixOutPoint);
        if (aligned <= maxMixOutPoint) {
          console.log(`  🎯 Beat-aligned mixOut: ${mixOutPoint.toFixed(1)}s → ${aligned.toFixed(1)}s`);
          mixOutPoint = aligned;
        }
      }
    }

    // ENHANCEMENT: Phrase-boundary enforcement for mix in point
    if (track2.analysis?.downbeats && track2.analysis.downbeats.length > 0) {
      const phraseLengthBars = (genre2 && (genre2.toLowerCase().includes('house') || genre2.toLowerCase().includes('techno')))
        ? 16
        : 8;

      mixInPoint = enforcePhraseBoundary(
        mixInPoint,
        track2.bpm,
        track2.analysis.downbeats,
        phraseLengthBars
      );
    }

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
      outSegment,
      inSegment,
      harmonicMatch,
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
 * Find segment type at a specific time in the track
 */
function getSegmentAtTime(analysis: TrackAnalysis | undefined, time: number): string {
  if (!analysis?.segments || analysis.segments.length === 0) {
    return 'unknown';
  }

  for (const segment of analysis.segments) {
    if (time >= segment.startTime && time <= segment.endTime) {
      return segment.type;
    }
  }

  return 'unknown';
}

/**
 * Find optimal mix-out point based on track structure and energy
 * Prioritizes: Spotify analysis > our analysis > fallback
 */
function findOptimalMixOut(
  analysis: TrackAnalysis | undefined,
  spotifyAnalysis: SpotifyAudioAnalysis | undefined,
  duration: number,
  maxMixOut: number
): number {
  // PRIORITY 1: Use Spotify Audio Analysis if available
  if (spotifyAnalysis) {
    const minFromEnd = duration - maxMixOut;
    const spotifyResult = spotifyFindMixOut(spotifyAnalysis, minFromEnd);
    console.log(`  🎵 Spotify analysis: ${spotifyResult.segment} at ${spotifyResult.time.toFixed(1)}s (bar-aligned: ${spotifyResult.barAligned})`);
    return Math.min(spotifyResult.time, maxMixOut);
  }

  // PRIORITY 2: Use our own analysis
  if (!analysis?.segments || analysis.segments.length === 0) {
    // ENHANCEMENT: Use energy-aware detection as fallback
    if (analysis?.energyCurve && analysis.energyCurve.length > 0) {
      const searchStart = duration * 0.75;
      const searchEnd = Math.min(duration, maxMixOut);
      const lowestEnergy = findLowestEnergyPoint(analysis, searchStart, searchEnd);
      console.log(`  ⚡ Found low-energy point at ${lowestEnergy.toFixed(1)}s`);
      return lowestEnergy;
    }
    return Math.min(duration * 0.97, maxMixOut);
  }

  // Look for outro segment
  const outro = analysis.segments.find(s => s.type === 'outro');
  if (outro && outro.startTime <= maxMixOut) {
    // ENHANCEMENT: Find lowest energy within outro
    const outroLowest = findLowestEnergyPoint(analysis, outro.startTime, Math.min(outro.endTime, maxMixOut));
    console.log(`  🎵 Found outro at ${outro.startTime.toFixed(1)}s, low energy at ${outroLowest.toFixed(1)}s`);
    return outroLowest;
  }

  // Look for breakdown in final 30%
  const breakdown = analysis.segments
    .filter(s => s.type === 'breakdown' && s.startTime > duration * 0.7)
    .sort((a, b) => b.startTime - a.startTime)[0];

  if (breakdown && breakdown.startTime <= maxMixOut) {
    console.log(`  🎵 Found breakdown at ${breakdown.startTime.toFixed(1)}s`);
    return Math.min(breakdown.startTime, maxMixOut);
  }

  // Fall back to energy-aware detection
  const searchStart = duration * 0.75;
  const searchEnd = Math.min(duration, maxMixOut);
  const lowestEnergy = findLowestEnergyPoint(analysis, searchStart, searchEnd);
  console.log(`  ⚡ Using low-energy point at ${lowestEnergy.toFixed(1)}s`);
  return lowestEnergy;
}

/**
 * Find optimal mix-in point based on track structure and energy
 * Prioritizes: Spotify analysis > our analysis > fallback
 */
function findOptimalMixIn(
  analysis: TrackAnalysis | undefined,
  spotifyAnalysis: SpotifyAudioAnalysis | undefined
): number {
  // PRIORITY 1: Use Spotify Audio Analysis if available
  if (spotifyAnalysis) {
    const spotifyResult = spotifyFindMixIn(spotifyAnalysis);
    console.log(`  🎵 Spotify analysis: ${spotifyResult.segment} at ${spotifyResult.time.toFixed(1)}s (bar-aligned: ${spotifyResult.barAligned})`);
    return spotifyResult.time;
  }

  // PRIORITY 2: Use our own analysis
  if (!analysis?.segments || analysis.segments.length === 0) {
    // ENHANCEMENT: Use energy-aware detection as fallback
    if (analysis?.energyCurve && analysis.energyCurve.length > 0 && analysis.duration > 30) {
      // Search first 30% for highest energy (skip intro, find buildup)
      const searchStart = Math.min(10, analysis.duration * 0.1); // Skip first 10s
      const searchEnd = Math.min(analysis.duration * 0.4, analysis.duration - 10);
      const highestEnergy = findHighestEnergyPoint(analysis, searchStart, searchEnd);
      console.log(`  ⚡ Found high-energy point at ${highestEnergy.toFixed(1)}s`);
      return highestEnergy;
    }
    return 0;
  }

  // Find intro segment
  const intro = analysis.segments.find(s => s.type === 'intro');

  // If intro exists, start after it (but find energy peak after intro)
  if (intro && analysis.energyCurve) {
    const searchStart = intro.endTime;
    const searchEnd = Math.min(intro.endTime + 30, analysis.duration * 0.4);
    const highestAfterIntro = findHighestEnergyPoint(analysis, searchStart, searchEnd);
    console.log(`  🎵 Skipping intro, high energy at ${highestAfterIntro.toFixed(1)}s`);
    return highestAfterIntro;
  } else if (intro) {
    console.log(`  🎵 Skipping intro, starting at ${intro.endTime.toFixed(1)}s`);
    return intro.endTime;
  }

  // Look for first buildup
  const buildup = analysis.segments.find(s => s.type === 'buildup');
  if (buildup && buildup.startTime < analysis.duration * 0.3) {
    console.log(`  🎵 Found buildup at ${buildup.startTime.toFixed(1)}s`);
    return buildup.startTime;
  }

  return 0;
}

/**
 * Find nearest downbeat to a given time position
 */
function findNearestDownbeat(downbeats: number[], targetTime: number): number {
  if (!downbeats || downbeats.length === 0) return targetTime;

  let nearest = downbeats[0];
  let minDiff = Math.abs(targetTime - nearest);

  for (const beat of downbeats) {
    const diff = Math.abs(targetTime - beat);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = beat;
    }
  }

  // Only snap if within 0.5 seconds tolerance
  return minDiff < 0.5 ? nearest : targetTime;
}

/**
 * Get energy level at a specific time in the track
 */
function getEnergyAtTime(analysis: TrackAnalysis | undefined, time: number): number {
  if (!analysis?.energyCurve || analysis.energyCurve.length === 0) {
    return 0.5; // Default mid energy
  }

  const sampleRate = 20; // Hz (from beat-analyzer)
  const index = Math.floor(time * sampleRate);
  const clampedIndex = Math.max(0, Math.min(index, analysis.energyCurve.length - 1));

  return analysis.energyCurve[clampedIndex] || 0.5;
}

/**
 * Find lowest energy point in a time range (for smooth mix-out)
 */
function findLowestEnergyPoint(
  analysis: TrackAnalysis | undefined,
  startTime: number,
  endTime: number
): number {
  if (!analysis?.energyCurve || analysis.energyCurve.length === 0) {
    return startTime;
  }

  const sampleRate = 20;
  const startIndex = Math.floor(startTime * sampleRate);
  const endIndex = Math.floor(endTime * sampleRate);

  let lowestEnergy = Infinity;
  let lowestIndex = startIndex;

  for (let i = startIndex; i <= Math.min(endIndex, analysis.energyCurve.length - 1); i++) {
    if (analysis.energyCurve[i] < lowestEnergy) {
      lowestEnergy = analysis.energyCurve[i];
      lowestIndex = i;
    }
  }

  return lowestIndex / sampleRate;
}

/**
 * Find highest energy point in a time range (for exciting mix-in)
 */
function findHighestEnergyPoint(
  analysis: TrackAnalysis | undefined,
  startTime: number,
  endTime: number
): number {
  if (!analysis?.energyCurve || analysis.energyCurve.length === 0) {
    return startTime;
  }

  const sampleRate = 20;
  const startIndex = Math.floor(startTime * sampleRate);
  const endIndex = Math.floor(endTime * sampleRate);

  let highestEnergy = -Infinity;
  let highestIndex = startIndex;

  for (let i = startIndex; i <= Math.min(endIndex, analysis.energyCurve.length - 1); i++) {
    if (analysis.energyCurve[i] > highestEnergy) {
      highestEnergy = analysis.energyCurve[i];
      highestIndex = i;
    }
  }

  return highestIndex / sampleRate;
}

/**
 * Determine optimal crossfade duration based on segment types
 * Returns number of bars (to be converted to seconds later)
 * Enhanced with Spotify Audio Analysis support
 */
function calculateDynamicCrossfade(
  outgoingSegment: string,
  incomingSegment: string,
  harmonicMatch: boolean,
  avgBpm: number,
  spotifyAnalysisOut?: SpotifyAudioAnalysis,
  spotifyAnalysisIn?: SpotifyAudioAnalysis
): number {
  // PRIORITY 1: Use Spotify's intelligent crossfade calculation
  if (spotifyAnalysisOut && spotifyAnalysisIn) {
    // Get classified sections from Spotify analysis
    const outSections = classifySections(spotifyAnalysisOut);
    const inSections = classifySections(spotifyAnalysisIn);

    // Find the segment types at the mix points
    // (This is a simplified version - in practice we'd need to know exact mix times)
    const spotifyOutSegment = (outSections[outSections.length - 1]?.type || 'unknown') as SegmentType;
    const spotifyInSegment = (inSections[0]?.type || 'unknown') as SegmentType;

    const spotifyDuration = spotifyCalculateCrossfade(spotifyOutSegment, spotifyInSegment, avgBpm);
    const bars = Math.ceil((spotifyDuration * avgBpm) / (4 * 60)); // Convert seconds to bars
    console.log(`    🎵 Spotify crossfade: ${spotifyDuration.toFixed(1)}s (${bars} bars) for ${spotifyOutSegment}→${spotifyInSegment}`);
    return bars;
  }

  // PRIORITY 2: Use our own segment analysis
  // Outro → Intro: Long smooth blend (32 bars)
  if (outgoingSegment === 'outro' && incomingSegment === 'intro') {
    return 32;
  }

  // Outro → any: Long blend (32 bars)
  if (outgoingSegment === 'outro') {
    return 32;
  }

  // Any → Intro: Long blend (32 bars)
  if (incomingSegment === 'intro') {
    return 32;
  }

  // Breakdown → Buildup: Filter sweep territory (16 bars)
  if (outgoingSegment === 'breakdown' && incomingSegment === 'buildup') {
    return 16;
  }

  // Drop → Drop: Quick hit (8 bars)
  if (outgoingSegment === 'drop' && incomingSegment === 'drop') {
    return 8;
  }

  // Verse → Verse: Medium blend (16 bars)
  if (outgoingSegment === 'verse' && incomingSegment === 'verse') {
    return 16;
  }

  // Harmonic match gets longer crossfade (sounds better)
  if (harmonicMatch) {
    return 32;
  }

  // Non-harmonic: shorter to minimize clash
  return 8;
}

/**
 * Calculate actual transition quality score
 */
function calculateTransitionScore(
  track1: MixTrack,
  track2: MixTrack,
  actualMixOut: number,
  actualMixIn: number
): number {
  let score = 0;

  // 1. Key compatibility (up to 30 points)
  const keyCompat = checkKeyCompatibility(track1.camelotKey, track2.camelotKey);
  if (track1.camelotKey === track2.camelotKey) {
    score += 30; // Perfect match
  } else if (keyCompat) {
    score += 20; // Compatible
  } else {
    score += 5; // Not compatible but not terrible
  }

  // 2. BPM compatibility (up to 25 points)
  const bpmDiff = Math.abs(track1.bpm - track2.bpm);
  if (bpmDiff < 2) {
    score += 25; // Very close
  } else if (bpmDiff < 5) {
    score += 15; // Close enough
  } else if (bpmDiff < 10) {
    score += 8; // Noticeable but acceptable
  } else {
    score += 0; // Jarring
  }

  // 3. Energy match at mix points (up to 25 points)
  const energy1 = getEnergyAtTime(track1.analysis, actualMixOut);
  const energy2 = getEnergyAtTime(track2.analysis, actualMixIn);
  const energyDiff = Math.abs(energy1 - energy2);
  const energyScore = (1 - energyDiff) * 25;
  score += energyScore;

  // 4. Beat alignment (up to 20 points)
  // If downbeats available, check if mix points are aligned
  const downbeats1 = track1.analysis?.downbeats || [];
  const downbeats2 = track2.analysis?.downbeats || [];

  let alignmentScore = 10; // Default partial score
  if (downbeats1.length > 0) {
    const nearestBeat = findNearestDownbeat(downbeats1, actualMixOut);
    const beatAligned = Math.abs(nearestBeat - actualMixOut) < 0.5;
    alignmentScore = beatAligned ? 20 : 10;
  }
  score += alignmentScore;

  return Math.min(100, Math.round(score));
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
    let totalTransitionScore = 0;

    for (let i = 0; i < job.tracks.length - 1; i++) {
      const progress = 30 + ((i / (job.tracks.length - 1)) * 60);
      onProgress?.(
        'processing',
        progress,
        `Mixing track ${i + 1} of ${job.tracks.length - 1}`
      );

      const track1 = { ...job.tracks[i], filePath: currentMixPath };
      const track2 = job.tracks[i + 1];

      // Determine transition length based on v3 hints, segment analysis, or key compatibility
      const key1 = track1.camelotKey;
      const key2 = track2.camelotKey;
      const isHarmonic = checkKeyCompatibility(key1, key2);

      if (isHarmonic) {
        harmonicTransitions++;
      }

      // CRITICAL FIX: For intermediate mix files (i > 0), get actual duration from file
      // This prevents progressive shortening in multi-track mixes
      let actualDuration = track1.analysis?.duration;
      if (i > 0 && !actualDuration) {
        try {
          const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${currentMixPath}"`;
          const durationStr = execSync(durationCmd, { encoding: 'utf-8' }).trim();
          actualDuration = parseFloat(durationStr);
          console.log(`    📏 Intermediate mix duration: ${actualDuration.toFixed(1)}s (from ffprobe)`);
        } catch (error) {
          console.error(`    ⚠️ Failed to get duration for intermediate mix, using default`);
          actualDuration = 180;
        }
      }

      // Get segment types at mix points for intelligent transitions
      const mixOut = track1.mixOutPoint || (actualDuration || 180) * 0.97;
      const mixIn = track2.mixInPoint || 0;
      const outSegment = getSegmentAtTime(track1.analysis, mixOut);
      const inSegment = getSegmentAtTime(track2.analysis, mixIn);

      let transitionBars = 16; // Default

      // Use v3 transition hints if available (highest priority)
      if (track1.transitionHints?.idealCrossfadeBars) {
        transitionBars = track1.transitionHints.idealCrossfadeBars;
        console.log(`    ✓ Using v3 hint: ${transitionBars} bars (outgoing track)`);
      } else if (track2.transitionHints?.idealCrossfadeBars) {
        transitionBars = track2.transitionHints.idealCrossfadeBars;
        console.log(`    ✓ Using v3 hint: ${transitionBars} bars (incoming track)`);
      } else {
        // ENHANCEMENT: Use segment-aware dynamic crossfade (with Spotify analysis support)
        const avgBPM = (track1.bpm + track2.bpm) / 2;
        transitionBars = calculateDynamicCrossfade(
          outSegment,
          inSegment,
          isHarmonic,
          avgBPM,
          track1.spotifyAnalysis,
          track2.spotifyAnalysis
        );
        console.log(`    🎛️ Dynamic: ${transitionBars} bars (${outSegment}→${inSegment}, ${isHarmonic ? 'harmonic' : 'clash'})`);
      }

      // Log v3 mix points being used
      if (track1.mixOutPoint || track2.mixInPoint) {
        console.log(`    ✓ v3 mix points: out=${track1.mixOutPoint?.toFixed(1) || 'auto'}s, in=${track2.mixInPoint?.toFixed(1) || '0'}s`);
      }

      // Generate intermediate file path — use WAV (lossless) to prevent
      // progressive quality degradation from repeated MP3 re-encoding
      const intermediatePath = path.join(tempDir, `mix_${i}.wav`);

      // Pass segment info and harmonic match to mixing function
      const result = await mixTwoTracks(
        track1,
        track2,
        intermediatePath,
        transitionBars,
        outSegment,
        inSegment,
        isHarmonic
      );

      if (!result.success) {
        console.error(`Failed to mix tracks ${i} and ${i + 1}: ${result.error}`);
        // Continue with just track2
        currentMixPath = track2.filePath;
      } else {
        currentMixPath = intermediatePath;
        transitionCount++;

        // Calculate actual transition score
        const actualMixOut = track1.mixOutPoint || (track1.analysis?.duration || 180) * 0.97;
        const actualMixIn = track2.mixInPoint || 0;
        const transitionScore = calculateTransitionScore(track1, track2, actualMixOut, actualMixIn);
        totalTransitionScore += transitionScore;

        console.log(`    ✅ Transition score: ${transitionScore}/100`);
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

    const avgTransitionScore =
      transitionCount > 0 ? totalTransitionScore / transitionCount / 100 : 0;

    return {
      success: true,
      outputPath: job.outputPath,
      duration,
      transitionCount,
      avgTransitionScore: Math.round(avgTransitionScore * 100) / 100, // 0-1 scale, 2 decimal places
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
