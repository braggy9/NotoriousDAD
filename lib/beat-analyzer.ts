/**
 * Beat & Segment Analyzer
 *
 * Analyzes audio files to detect:
 * - Beats and downbeats (for phrase-locked mixing)
 * - Drops and breakdowns (for transition points)
 * - Energy curve (for mix planning)
 *
 * Uses FFmpeg for audio analysis and custom algorithms for beat detection.
 * For production, consider integrating with librosa (Python) via subprocess.
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Analysis result for a single track
export interface TrackAnalysis {
  filePath: string;
  duration: number; // seconds

  // Tempo/rhythm
  bpm: number;
  bpmConfidence: number;
  timeSignature: number; // Usually 4

  // Beat positions (seconds)
  beats: number[];
  downbeats: number[]; // Every 4th beat for 4/4

  // Phrase markers (bar numbers)
  phrases: PhraseMarker[];

  // Energy curve (normalized 0-1)
  energyCurve: number[];
  energySampleRate: number; // Samples per second

  // Key transition points
  segments: TrackSegment[];

  // Mix points (recommended)
  mixInPoint: number; // Best point to start fading in (seconds)
  mixOutPoint: number; // Best point to start fading out (seconds)
  dropPoint?: number; // Main drop (if detected)
  breakdownPoint?: number; // Main breakdown (if detected)
}

export interface PhraseMarker {
  bar: number;
  time: number; // seconds
  type: 'intro' | 'verse' | 'buildup' | 'drop' | 'breakdown' | 'outro';
  energy: number; // 0-1
}

export interface TrackSegment {
  startTime: number;
  endTime: number;
  type: 'intro' | 'verse' | 'buildup' | 'drop' | 'breakdown' | 'outro' | 'unknown';
  avgEnergy: number;
  beatCount: number;
}

/**
 * Check if FFmpeg is available
 */
export function checkFFmpeg(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get audio file duration using FFprobe
 */
export function getAudioDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' }
    );
    return parseFloat(result.trim());
  } catch (error) {
    console.error(`Error getting duration for ${filePath}:`, error);
    return 0;
  }
}

/**
 * Extract audio energy envelope using FFmpeg
 * Returns array of RMS energy values
 */
export function extractEnergyEnvelope(
  filePath: string,
  sampleRate: number = 10 // samples per second
): number[] {
  const energyValues: number[] = [];

  try {
    // Use FFmpeg to get audio stats
    // This extracts RMS levels at regular intervals
    const windowSize = 1 / sampleRate;

    // Get raw audio data as floats
    const tempFile = `/tmp/audio_energy_${Date.now()}.raw`;

    execSync(
      `ffmpeg -i "${filePath}" -ac 1 -ar 22050 -f f32le -y "${tempFile}" 2>/dev/null`
    );

    // Read and process the raw audio
    const buffer = fs.readFileSync(tempFile);
    const floats = new Float32Array(buffer.buffer);

    const samplesPerWindow = Math.floor(22050 / sampleRate);

    for (let i = 0; i < floats.length; i += samplesPerWindow) {
      const window = floats.slice(i, i + samplesPerWindow);
      if (window.length === 0) break;

      // Calculate RMS
      let sum = 0;
      for (const sample of window) {
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / window.length);
      energyValues.push(rms);
    }

    // Clean up
    fs.unlinkSync(tempFile);

    // Normalize to 0-1
    const maxEnergy = Math.max(...energyValues);
    if (maxEnergy > 0) {
      return energyValues.map((e) => e / maxEnergy);
    }
  } catch (error) {
    console.error(`Error extracting energy envelope:`, error);
  }

  return energyValues;
}

/**
 * Estimate BPM from energy envelope
 * Simple autocorrelation-based approach
 */
export function estimateBPM(energyCurve: number[], sampleRate: number): { bpm: number; confidence: number } {
  if (energyCurve.length < sampleRate * 10) {
    return { bpm: 120, confidence: 0 };
  }

  // Look for periodicities between 60-180 BPM
  const minPeriod = Math.floor((sampleRate * 60) / 180); // 180 BPM
  const maxPeriod = Math.floor((sampleRate * 60) / 60); // 60 BPM

  let bestPeriod = minPeriod;
  let bestCorrelation = 0;

  // Use a section from the middle of the track (more stable tempo)
  const startIdx = Math.floor(energyCurve.length * 0.3);
  const endIdx = Math.floor(energyCurve.length * 0.7);
  const section = energyCurve.slice(startIdx, endIdx);

  for (let period = minPeriod; period <= maxPeriod; period++) {
    let correlation = 0;
    let count = 0;

    for (let i = 0; i < section.length - period; i++) {
      correlation += section[i] * section[i + period];
      count++;
    }

    correlation /= count;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestPeriod = period;
    }
  }

  const bpm = (sampleRate * 60) / bestPeriod;
  const confidence = Math.min(bestCorrelation * 2, 1); // Normalize confidence

  return { bpm: Math.round(bpm), confidence };
}

/**
 * Detect beats from energy curve
 * Uses onset detection (energy increases)
 */
export function detectBeats(
  energyCurve: number[],
  sampleRate: number,
  bpm: number
): number[] {
  const beats: number[] = [];

  // Expected samples between beats
  const expectedPeriod = (sampleRate * 60) / bpm;
  const tolerance = expectedPeriod * 0.2; // 20% tolerance

  // Calculate derivative (onset detection)
  const derivative: number[] = [];
  for (let i = 1; i < energyCurve.length; i++) {
    derivative.push(Math.max(0, energyCurve[i] - energyCurve[i - 1]));
  }

  // Find peaks in derivative
  const threshold = Math.max(...derivative) * 0.3;
  let lastBeatIdx = -expectedPeriod;

  for (let i = 1; i < derivative.length - 1; i++) {
    if (
      derivative[i] > threshold &&
      derivative[i] > derivative[i - 1] &&
      derivative[i] >= derivative[i + 1] &&
      i - lastBeatIdx >= expectedPeriod - tolerance
    ) {
      beats.push(i / sampleRate);
      lastBeatIdx = i;
    }
  }

  // If we didn't get enough beats, generate them based on BPM
  if (beats.length < 10 && energyCurve.length > 0) {
    const duration = energyCurve.length / sampleRate;
    const beatInterval = 60 / bpm;
    for (let t = 0; t < duration; t += beatInterval) {
      beats.push(t);
    }
  }

  return beats;
}

/**
 * Detect track segments based on energy changes
 */
export function detectSegments(
  energyCurve: number[],
  sampleRate: number,
  beats: number[]
): TrackSegment[] {
  const segments: TrackSegment[] = [];
  const duration = energyCurve.length / sampleRate;

  if (duration === 0) return segments;

  // Calculate average energy in windows (ENHANCED: 2-second windows for finer resolution)
  const windowSize = 2; // 2 seconds (down from 8s for better drop detection)
  const windowSamples = windowSize * sampleRate;

  const windowEnergies: { time: number; energy: number; energyDelta: number }[] = [];
  for (let i = 0; i < energyCurve.length; i += windowSamples) {
    const window = energyCurve.slice(i, i + windowSamples);
    const avgEnergy = window.reduce((a, b) => a + b, 0) / window.length;

    // Calculate energy delta (rate of change) for buildup/drop detection
    const prevWindow = i > 0 ? energyCurve.slice(i - windowSamples, i) : window;
    const prevEnergy = prevWindow.reduce((a, b) => a + b, 0) / prevWindow.length;
    const energyDelta = avgEnergy - prevEnergy;

    windowEnergies.push({ time: i / sampleRate, energy: avgEnergy, energyDelta });
  }

  if (windowEnergies.length < 3) {
    // Too short, just return one segment
    return [
      {
        startTime: 0,
        endTime: duration,
        type: 'unknown',
        avgEnergy: energyCurve.reduce((a, b) => a + b, 0) / energyCurve.length,
        beatCount: beats.length,
      },
    ];
  }

  // Classify segments based on relative energy (ENHANCED: pre-drop/post-drop detection)
  const avgEnergy = windowEnergies.reduce((a, b) => a + b.energy, 0) / windowEnergies.length;
  const maxEnergy = Math.max(...windowEnergies.map((w) => w.energy));

  // Find major drops (sharp energy increases)
  const dropThreshold = maxEnergy * 0.85;
  const dropIndices: number[] = [];

  for (let i = 1; i < windowEnergies.length - 1; i++) {
    const w = windowEnergies[i];
    const prevW = windowEnergies[i - 1];

    // Drop detection: high energy AND significant increase from previous
    if (w.energy >= dropThreshold && w.energyDelta > avgEnergy * 0.15) {
      dropIndices.push(i);
    }
  }

  for (let i = 0; i < windowEnergies.length; i++) {
    const w = windowEnergies[i];
    const prevW = windowEnergies[i - 1];
    const nextW = windowEnergies[i + 1];
    const endTime = nextW ? nextW.time : duration;

    let type: TrackSegment['type'] = 'unknown';

    // Classify based on position, energy, and energy delta
    const relPosition = w.time / duration;
    const relEnergy = w.energy / avgEnergy;

    // Position-based classification
    if (relPosition < 0.1) {
      type = 'intro';
    } else if (relPosition > 0.9) {
      type = 'outro';
    }
    // Drop-aware classification (NEW)
    else {
      const isNearDrop = dropIndices.some((dropIdx) => Math.abs(dropIdx - i) <= 1);
      const isPreDrop = dropIndices.some((dropIdx) => dropIdx - i === 1);
      const isPostDrop = dropIndices.some((dropIdx) => dropIdx - i === -1);
      const isDrop = dropIndices.includes(i);

      if (isDrop) {
        type = 'drop'; // Main drop
      } else if (isPreDrop && w.energyDelta > avgEnergy * 0.05) {
        type = 'buildup'; // Rising energy before drop
      } else if (isPostDrop && w.energyDelta < -avgEnergy * 0.05) {
        type = 'breakdown'; // Falling energy after drop
      } else if (relEnergy > 1.2) {
        type = 'drop'; // High energy section
      } else if (relEnergy < 0.6) {
        type = 'breakdown'; // Low energy section
      } else if (w.energyDelta > avgEnergy * 0.1) {
        type = 'buildup'; // Rising energy
      } else {
        type = 'verse'; // Normal energy section
      }
    }

    const beatsInSegment = beats.filter((b) => b >= w.time && b < endTime).length;

    segments.push({
      startTime: w.time,
      endTime,
      type,
      avgEnergy: w.energy,
      beatCount: beatsInSegment,
    });
  }

  return segments;
}

/**
 * Find the best mix points for a track
 */
export function findMixPoints(
  analysis: Partial<TrackAnalysis>
): { mixIn: number; mixOut: number; drop?: number; breakdown?: number } {
  const duration = analysis.duration || 0;
  const segments = analysis.segments || [];

  // Default mix points (percentage-based)
  let mixIn = 0;
  let mixOut = duration * 0.9;
  let drop: number | undefined;
  let breakdown: number | undefined;

  // Find drop (highest energy segment not at start/end)
  const middleSegments = segments.filter(
    (s) => s.startTime > duration * 0.15 && s.endTime < duration * 0.85
  );

  const dropSegment = middleSegments
    .filter((s) => s.type === 'drop')
    .sort((a, b) => b.avgEnergy - a.avgEnergy)[0];

  if (dropSegment) {
    drop = dropSegment.startTime;
  }

  // Find breakdown
  const breakdownSegment = middleSegments.find((s) => s.type === 'breakdown');
  if (breakdownSegment) {
    breakdown = breakdownSegment.startTime;
    mixOut = breakdownSegment.startTime; // Good place to start mixing out
  }

  // Find intro end for mix-in point
  const introSegment = segments.find((s) => s.type === 'intro');
  if (introSegment) {
    mixIn = introSegment.endTime;
  }

  // Find outro for mix-out
  const outroSegment = segments.find((s) => s.type === 'outro');
  if (outroSegment && !breakdown) {
    mixOut = outroSegment.startTime;
  }

  return { mixIn, mixOut, drop, breakdown };
}

/**
 * Full analysis of a single audio file
 */
export async function analyzeTrack(filePath: string, mikBPM?: number): Promise<TrackAnalysis | null> {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }

  if (!checkFFmpeg()) {
    console.error('FFmpeg not found. Please install FFmpeg.');
    return null;
  }

  console.log(`Analyzing: ${path.basename(filePath)}`);

  // Get duration
  const duration = getAudioDuration(filePath);
  if (duration === 0) {
    console.error('Could not get duration');
    return null;
  }

  // Extract energy envelope
  const sampleRate = 20; // 20 samples per second
  const energyCurve = extractEnergyEnvelope(filePath, sampleRate);

  if (energyCurve.length === 0) {
    console.error('Could not extract energy envelope');
    return null;
  }

  // Estimate BPM (or use MIK data if available)
  let bpm = mikBPM || 120;
  let bpmConfidence = mikBPM ? 1 : 0;

  if (!mikBPM) {
    const bpmResult = estimateBPM(energyCurve, sampleRate);
    bpm = bpmResult.bpm;
    bpmConfidence = bpmResult.confidence;
  }

  // Detect beats
  const beats = detectBeats(energyCurve, sampleRate, bpm);
  const downbeats = beats.filter((_, i) => i % 4 === 0);

  // Detect segments
  const segments = detectSegments(energyCurve, sampleRate, beats);

  // Find mix points
  const mixPoints = findMixPoints({ duration, segments });

  // Build phrase markers from segments
  const phrases: PhraseMarker[] = segments.map((s, i) => ({
    bar: Math.floor((s.startTime / 60) * bpm / 4),
    time: s.startTime,
    type: s.type as PhraseMarker['type'],
    energy: s.avgEnergy,
  }));

  return {
    filePath,
    duration,
    bpm,
    bpmConfidence,
    timeSignature: 4,
    beats,
    downbeats,
    phrases,
    energyCurve,
    energySampleRate: sampleRate,
    segments,
    mixInPoint: mixPoints.mixIn,
    mixOutPoint: mixPoints.mixOut,
    dropPoint: mixPoints.drop,
    breakdownPoint: mixPoints.breakdown,
  };
}

/**
 * CLI for testing
 */
if (require.main === module) {
  const testFile = process.argv[2];
  if (!testFile) {
    console.log('Usage: npx tsx lib/beat-analyzer.ts <audio-file>');
    process.exit(1);
  }

  analyzeTrack(testFile).then((analysis) => {
    if (analysis) {
      console.log('\n📊 Analysis Results:');
      console.log(`  Duration: ${analysis.duration.toFixed(1)}s`);
      console.log(`  BPM: ${analysis.bpm} (confidence: ${(analysis.bpmConfidence * 100).toFixed(0)}%)`);
      console.log(`  Beats detected: ${analysis.beats.length}`);
      console.log(`  Segments: ${analysis.segments.length}`);
      console.log(`  Mix In: ${analysis.mixInPoint.toFixed(1)}s`);
      console.log(`  Mix Out: ${analysis.mixOutPoint.toFixed(1)}s`);
      if (analysis.dropPoint) console.log(`  Drop: ${analysis.dropPoint.toFixed(1)}s`);
      if (analysis.breakdownPoint) console.log(`  Breakdown: ${analysis.breakdownPoint.toFixed(1)}s`);
    }
  });
}
