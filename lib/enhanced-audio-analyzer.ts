/**
 * Enhanced Audio Analyzer (v3)
 *
 * Combines basic audio analysis (BPM, key, energy) with advanced
 * structural analysis (mix points, segments, drops, breakdowns).
 *
 * This enables intelligent mixing by pre-computing:
 * - Optimal mix-in and mix-out points
 * - Track structure (intro, buildup, drop, breakdown, outro)
 * - Energy curves for transition matching
 * - Phrase markers for beat-locked mixing
 *
 * Designed to run once during file upload, storing all data
 * needed for intelligent mix generation without re-analysis.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { TrackAnalysis, TrackSegment, PhraseMarker } from './beat-analyzer';

// Enhanced analysis result including mix points
export interface EnhancedAudioAnalysis {
  // Basic metadata
  id: string;
  filePath: string;
  fileName: string;
  artist: string;
  title: string;

  // Core analysis (MIK-compatible)
  bpm: number;
  bpmConfidence: number;
  key: string;
  camelotKey: string;
  energy: number; // 1-10 scale
  duration: number;
  fileSize: number;

  // v3 Enhanced: Mix points (in seconds)
  mixPoints: {
    mixInPoint: number;      // Best point to start fading in this track
    mixOutPoint: number;     // Best point to start fading out this track
    dropPoint?: number;      // Main drop position (if detected)
    breakdownPoint?: number; // Main breakdown position (if detected)
    outroStart?: number;     // Where outro begins
    introEnd?: number;       // Where intro ends
  };

  // v3 Enhanced: Track structure segments
  segments: Array<{
    type: 'intro' | 'verse' | 'buildup' | 'drop' | 'breakdown' | 'outro' | 'unknown';
    startTime: number;
    endTime: number;
    avgEnergy: number;
    beatCount: number;
  }>;

  // v3 Enhanced: Energy curve (sampled)
  energyCurve: {
    samples: number[];      // Energy values (0-1 normalized)
    sampleRate: number;     // Samples per second (e.g., 10 = one sample every 100ms)
  };

  // v3 Enhanced: Phrase markers
  phrases: Array<{
    bar: number;
    time: number;
    type: string;
    energy: number;
  }>;

  // v3 Enhanced: Recommended transition settings
  transitionHints: {
    preferredInType: 'long-blend' | 'short-blend' | 'cut' | 'filter-sweep';
    preferredOutType: 'long-blend' | 'short-blend' | 'cut' | 'filter-sweep' | 'echo-out';
    hasStrongDrop: boolean;
    hasCleanOutro: boolean;
    idealCrossfadeBars: number;
  };

  // Analysis metadata
  analyzedAt: string;
  analyzerVersion: string;
}

// Key to Camelot mapping
const KEY_TO_CAMELOT: { [key: string]: string } = {
  'C major': '8B', 'A minor': '8A',
  'G major': '9B', 'E minor': '9A',
  'D major': '10B', 'B minor': '10A',
  'A major': '11B', 'F# minor': '11A',
  'E major': '12B', 'C# minor': '12A',
  'B major': '1B', 'G# minor': '1A',
  'F# major': '2B', 'D# minor': '2A',
  'Db major': '3B', 'Bb minor': '3A',
  'Ab major': '4B', 'F minor': '4A',
  'Eb major': '5B', 'C minor': '5A',
  'Bb major': '6B', 'G minor': '6A',
  'F major': '7B', 'D minor': '7A',
};

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Check if required tools are available
 */
export function checkDependencies(): { aubio: boolean; ffmpeg: boolean; keyfinder: boolean } {
  let aubio = false;
  let ffmpeg = false;
  let keyfinder = false;

  try {
    execSync('which aubio', { stdio: 'pipe' });
    aubio = true;
  } catch {
    try {
      execSync('aubio tempo --help 2>/dev/null', { stdio: 'pipe' });
      aubio = true;
    } catch {}
  }

  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    ffmpeg = true;
  } catch {}

  try {
    execSync('which keyfinder-cli', { stdio: 'pipe' });
    keyfinder = true;
  } catch {}

  return { aubio, ffmpeg, keyfinder };
}

/**
 * Detect BPM using aubio
 */
function detectBPM(filePath: string): { bpm: number; confidence: number } {
  try {
    const result = execSync(`aubio tempo -i "${filePath}" 2>/dev/null`, { encoding: 'utf-8' });
    const lines = result.trim().split('\n');

    const tempos: number[] = [];
    for (const line of lines) {
      const bpm = parseFloat(line);
      if (!isNaN(bpm) && bpm > 40 && bpm < 220) {
        tempos.push(bpm);
      }
    }

    if (tempos.length === 0) {
      return { bpm: 120, confidence: 0 };
    }

    tempos.sort((a, b) => a - b);
    let median = tempos[Math.floor(tempos.length / 2)];

    // Normalize to DJ range (85-175)
    while (median < 85 && median > 0) median *= 2;
    while (median > 175) median /= 2;

    const variance = tempos.reduce((sum, t) => sum + Math.pow(t - median, 2), 0) / tempos.length;
    const confidence = Math.max(0, 1 - variance / 100);

    return { bpm: Math.round(median * 10) / 10, confidence };
  } catch {
    return { bpm: 120, confidence: 0 };
  }
}

/**
 * Detect key using keyfinder-cli or FFmpeg fallback
 */
function detectKey(filePath: string, hasKeyfinder: boolean): { key: string; camelotKey: string } {
  // Try keyfinder-cli first (more accurate)
  if (hasKeyfinder) {
    try {
      const result = execSync(`keyfinder-cli "${filePath}" 2>/dev/null`, { encoding: 'utf-8' });
      const key = result.trim();
      const camelotKey = KEY_TO_CAMELOT[key] || '8A';
      return { key, camelotKey };
    } catch {}
  }

  // Fallback to FFmpeg-based detection
  try {
    const tempFile = `/tmp/key_analysis_${Date.now()}.raw`;
    const durationResult = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' }
    );
    const duration = parseFloat(durationResult.trim());
    const startTime = Math.max(0, duration / 2 - 15);

    execSync(
      `ffmpeg -y -ss ${startTime} -t 30 -i "${filePath}" -ac 1 -ar 22050 -f f32le "${tempFile}" 2>/dev/null`,
      { stdio: 'pipe' }
    );

    const buffer = fs.readFileSync(tempFile);
    const samples = new Float32Array(buffer.buffer);
    fs.unlinkSync(tempFile);

    // Simplified chroma-based key detection
    const chromaEnergy = new Array(12).fill(0);
    const sampleRate = 22050;

    for (let note = 0; note < 12; note++) {
      for (let octave = 2; octave <= 5; octave++) {
        const freq = 440 * Math.pow(2, (note - 9 + (octave - 4) * 12) / 12);
        const period = sampleRate / freq;

        let s0 = 0, s1 = 0, s2 = 0;
        const coeff = 2 * Math.cos(2 * Math.PI / period);
        const windowSize = Math.min(samples.length, sampleRate);

        for (let i = 0; i < windowSize; i++) {
          s0 = samples[i] + coeff * s1 - s2;
          s2 = s1;
          s1 = s0;
        }

        chromaEnergy[note] += s1 * s1 + s2 * s2 - coeff * s1 * s2;
      }
    }

    const maxEnergy = Math.max(...chromaEnergy);
    const normalized = chromaEnergy.map(e => e / maxEnergy);

    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    let bestKey = 'C major';
    let bestCorrelation = -1;

    for (let root = 0; root < 12; root++) {
      const rotated = [...normalized.slice(root), ...normalized.slice(0, root)];

      let majorCorr = 0, minorCorr = 0;
      for (let i = 0; i < 12; i++) {
        majorCorr += rotated[i] * majorProfile[i];
        minorCorr += rotated[i] * minorProfile[i];
      }

      if (majorCorr > bestCorrelation) {
        bestCorrelation = majorCorr;
        bestKey = `${NOTES[root]} major`;
      }
      if (minorCorr > bestCorrelation) {
        bestCorrelation = minorCorr;
        bestKey = `${NOTES[root]} minor`;
      }
    }

    const camelotKey = KEY_TO_CAMELOT[bestKey] || '8A';
    return { key: bestKey, camelotKey };
  } catch {
    return { key: 'Unknown', camelotKey: '8A' };
  }
}

/**
 * Extract energy envelope for the entire track
 */
function extractEnergyEnvelope(filePath: string, sampleRate: number = 10): number[] {
  const energyValues: number[] = [];

  try {
    const tempFile = `/tmp/audio_energy_${Date.now()}.raw`;

    execSync(
      `ffmpeg -i "${filePath}" -ac 1 -ar 22050 -f f32le -y "${tempFile}" 2>/dev/null`
    );

    const buffer = fs.readFileSync(tempFile);
    const floats = new Float32Array(buffer.buffer);
    fs.unlinkSync(tempFile);

    const samplesPerWindow = Math.floor(22050 / sampleRate);

    for (let i = 0; i < floats.length; i += samplesPerWindow) {
      const window = floats.slice(i, i + samplesPerWindow);
      if (window.length === 0) break;

      let sum = 0;
      for (const sample of window) {
        sum += sample * sample;
      }
      energyValues.push(Math.sqrt(sum / window.length));
    }

    // Normalize to 0-1
    const maxEnergy = Math.max(...energyValues);
    if (maxEnergy > 0) {
      return energyValues.map(e => e / maxEnergy);
    }
  } catch {}

  return energyValues;
}

/**
 * Detect segments based on energy changes
 */
function detectSegments(
  energyCurve: number[],
  sampleRate: number,
  duration: number,
  bpm: number
): EnhancedAudioAnalysis['segments'] {
  const segments: EnhancedAudioAnalysis['segments'] = [];

  if (energyCurve.length < 10) return segments;

  const windowSize = 8; // 8 seconds per window
  const windowSamples = windowSize * sampleRate;

  const windowEnergies: { time: number; energy: number }[] = [];
  for (let i = 0; i < energyCurve.length; i += windowSamples) {
    const window = energyCurve.slice(i, i + windowSamples);
    const avgEnergy = window.reduce((a, b) => a + b, 0) / window.length;
    windowEnergies.push({ time: i / sampleRate, energy: avgEnergy });
  }

  if (windowEnergies.length < 3) return segments;

  const avgEnergy = windowEnergies.reduce((a, b) => a + b.energy, 0) / windowEnergies.length;

  for (let i = 0; i < windowEnergies.length; i++) {
    const w = windowEnergies[i];
    const nextW = windowEnergies[i + 1];
    const endTime = nextW ? nextW.time : duration;

    let type: EnhancedAudioAnalysis['segments'][0]['type'] = 'unknown';
    const relPosition = w.time / duration;
    const relEnergy = w.energy / avgEnergy;

    if (relPosition < 0.1) {
      type = 'intro';
    } else if (relPosition > 0.9) {
      type = 'outro';
    } else if (relEnergy > 1.3) {
      type = 'drop';
    } else if (relEnergy < 0.5) {
      type = 'breakdown';
    } else if (i > 0 && windowEnergies[i - 1].energy < w.energy * 0.7) {
      type = 'buildup';
    } else {
      type = 'verse';
    }

    // Estimate beat count based on BPM and segment duration
    const segmentDuration = endTime - w.time;
    const beatCount = Math.round((segmentDuration / 60) * bpm);

    segments.push({
      type,
      startTime: w.time,
      endTime,
      avgEnergy: w.energy,
      beatCount,
    });
  }

  return segments;
}

/**
 * Find optimal mix points based on track structure
 */
function findMixPoints(
  segments: EnhancedAudioAnalysis['segments'],
  duration: number
): EnhancedAudioAnalysis['mixPoints'] {
  const result: EnhancedAudioAnalysis['mixPoints'] = {
    mixInPoint: 0,
    mixOutPoint: duration * 0.85,
  };

  // Find intro end
  const intro = segments.find(s => s.type === 'intro');
  if (intro) {
    result.introEnd = intro.endTime;
    result.mixInPoint = intro.endTime;
  }

  // Find drop
  const drops = segments.filter(s => s.type === 'drop');
  if (drops.length > 0) {
    // First drop is usually the main one
    result.dropPoint = drops[0].startTime;
  }

  // Find breakdown
  const breakdowns = segments.filter(s => s.type === 'breakdown');
  if (breakdowns.length > 0) {
    // Prefer breakdown that's not at the start
    const mainBreakdown = breakdowns.find(b => b.startTime > duration * 0.3) || breakdowns[0];
    result.breakdownPoint = mainBreakdown.startTime;
    // Breakdown is a great mix-out point
    result.mixOutPoint = mainBreakdown.startTime;
  }

  // Find outro
  const outro = segments.find(s => s.type === 'outro');
  if (outro) {
    result.outroStart = outro.startTime;
    // If no breakdown, use outro start as mix-out
    if (!result.breakdownPoint) {
      result.mixOutPoint = outro.startTime;
    }
  }

  return result;
}

/**
 * Generate transition hints based on track structure
 */
function generateTransitionHints(
  segments: EnhancedAudioAnalysis['segments'],
  bpm: number
): EnhancedAudioAnalysis['transitionHints'] {
  const hasStrongDrop = segments.some(s => s.type === 'drop' && s.avgEnergy > 0.7);
  const hasCleanOutro = segments.some(s => s.type === 'outro');
  const hasBreakdown = segments.some(s => s.type === 'breakdown');

  // Calculate ideal crossfade duration in bars
  let idealCrossfadeBars = 16; // Default

  if (hasStrongDrop) {
    idealCrossfadeBars = 8; // Shorter for high-energy tracks
  } else if (hasCleanOutro && hasBreakdown) {
    idealCrossfadeBars = 32; // Longer for well-structured tracks
  }

  return {
    preferredInType: hasStrongDrop ? 'short-blend' : 'long-blend',
    preferredOutType: hasBreakdown ? 'filter-sweep' : hasCleanOutro ? 'long-blend' : 'echo-out',
    hasStrongDrop,
    hasCleanOutro,
    idealCrossfadeBars,
  };
}

/**
 * Calculate overall energy level (1-10)
 */
function calculateOverallEnergy(energyCurve: number[]): number {
  if (energyCurve.length === 0) return 5;

  const avg = energyCurve.reduce((a, b) => a + b, 0) / energyCurve.length;
  const max = Math.max(...energyCurve);

  // Combine average and peak for final energy
  const combined = avg * 0.6 + max * 0.4;
  return Math.max(1, Math.min(10, Math.round(combined * 10)));
}

/**
 * Parse artist and title from filename
 */
function parseFilename(fileName: string): { artist: string; title: string } {
  const ext = path.extname(fileName);
  let base = path.basename(fileName, ext);

  // Remove leading track numbers
  base = base.replace(/^\d+[\s\-_.]+/, '');

  // Try "Artist - Title" format
  const dashMatch = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    return { artist: dashMatch[1].trim(), title: dashMatch[2].trim() };
  }

  return { artist: 'Unknown', title: base.trim() };
}

/**
 * Get audio duration
 */
function getDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8' }
    );
    return parseFloat(result.trim());
  } catch {
    return 0;
  }
}

/**
 * Get file size in bytes
 */
function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Generate unique track ID
 */
function generateTrackId(): string {
  return `track_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Perform enhanced audio analysis (v3)
 *
 * This is the main entry point for analyzing a single audio file.
 * Returns all data needed for intelligent mix generation.
 */
export async function analyzeAudioEnhanced(filePath: string): Promise<EnhancedAudioAnalysis | null> {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }

  const deps = checkDependencies();
  if (!deps.ffmpeg) {
    console.error('FFmpeg is required for analysis');
    return null;
  }

  const fileName = path.basename(filePath);
  const { artist, title } = parseFilename(fileName);

  console.log(`  🎵 Enhanced analysis: ${fileName}`);

  // Basic analysis
  const duration = getDuration(filePath);
  if (duration === 0) {
    console.error('Could not get duration');
    return null;
  }

  const { bpm, confidence: bpmConfidence } = detectBPM(filePath);
  const { key, camelotKey } = detectKey(filePath, deps.keyfinder);
  const fileSize = getFileSize(filePath);

  // Energy curve extraction (10 samples per second)
  const energySampleRate = 10;
  const energyCurve = extractEnergyEnvelope(filePath, energySampleRate);
  const energy = calculateOverallEnergy(energyCurve);

  // Segment detection
  const segments = detectSegments(energyCurve, energySampleRate, duration, bpm);

  // Find optimal mix points
  const mixPoints = findMixPoints(segments, duration);

  // Generate transition hints
  const transitionHints = generateTransitionHints(segments, bpm);

  // Generate phrase markers from segments
  const phrases = segments.map((s, i) => ({
    bar: Math.floor((s.startTime / 60) * bpm / 4),
    time: s.startTime,
    type: s.type,
    energy: s.avgEnergy,
  }));

  console.log(`    ✓ ${bpm} BPM | ${camelotKey} | Energy ${energy}/10`);
  console.log(`    ✓ Segments: ${segments.map(s => s.type).join(' → ')}`);
  console.log(`    ✓ Mix points: in=${mixPoints.mixInPoint.toFixed(1)}s, out=${mixPoints.mixOutPoint.toFixed(1)}s`);

  return {
    id: generateTrackId(),
    filePath,
    fileName,
    artist,
    title,
    bpm,
    bpmConfidence,
    key,
    camelotKey,
    energy,
    duration,
    fileSize,
    mixPoints,
    segments,
    energyCurve: {
      samples: energyCurve,
      sampleRate: energySampleRate,
    },
    phrases,
    transitionHints,
    analyzedAt: new Date().toISOString(),
    analyzerVersion: '3.0.0',
  };
}

/**
 * Batch analyze a folder of audio files
 */
export async function analyzeFolder(
  folderPath: string,
  outputFile?: string,
  onProgress?: (current: number, total: number, file: string) => void
): Promise<EnhancedAudioAnalysis[]> {
  const results: EnhancedAudioAnalysis[] = [];
  const audioExtensions = ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.aiff'];

  if (!fs.existsSync(folderPath)) {
    console.error(`Folder not found: ${folderPath}`);
    return results;
  }

  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const audioFiles = entries
    .filter(e => e.isFile() && audioExtensions.includes(path.extname(e.name).toLowerCase()))
    .map(e => path.join(folderPath, e.name));

  console.log(`\n🎵 Enhanced analysis (v3) for ${audioFiles.length} files...`);

  for (let i = 0; i < audioFiles.length; i++) {
    onProgress?.(i + 1, audioFiles.length, path.basename(audioFiles[i]));

    const analysis = await analyzeAudioEnhanced(audioFiles[i]);
    if (analysis) {
      results.push(analysis);
    }
  }

  if (outputFile) {
    const output = {
      version: '3.0.0',
      analyzedAt: new Date().toISOString(),
      trackCount: results.length,
      tracks: results,
    };
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`\n✓ Results saved to: ${outputFile}`);
  }

  return results;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npx tsx lib/enhanced-audio-analyzer.ts <file.mp3>');
    console.log('  npx tsx lib/enhanced-audio-analyzer.ts --folder /path/to/folder [output.json]');
    process.exit(1);
  }

  if (args[0] === '--folder') {
    const folder = args[1];
    const outputFile = args[2] || `/tmp/enhanced-analysis-${Date.now()}.json`;
    analyzeFolder(folder, outputFile).then(results => {
      console.log(`\n✓ Enhanced analysis complete: ${results.length} files`);
    });
  } else {
    analyzeAudioEnhanced(args[0]).then(result => {
      if (result) {
        console.log('\n📊 Enhanced Analysis Result:');
        console.log(JSON.stringify(result, null, 2));
      }
    });
  }
}
