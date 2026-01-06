import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { analyzeAudioEnhanced, EnhancedAudioAnalysis } from '@/lib/enhanced-audio-analyzer';

// Storage paths
const AUDIO_DIR = path.join(process.cwd(), 'audio-library');
const ANALYSIS_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis.json');

// Audio analysis result (v3 enhanced - backwards compatible with v2)
interface AudioAnalysis {
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
  uploadedAt: string;
  analyzedAt: string;

  // v3 Enhanced fields (optional for backwards compatibility)
  analyzerVersion?: string;
  mixPoints?: {
    mixInPoint: number;
    mixOutPoint: number;
    dropPoint?: number;
    breakdownPoint?: number;
    outroStart?: number;
    introEnd?: number;
  };
  segments?: Array<{
    type: 'intro' | 'verse' | 'buildup' | 'drop' | 'breakdown' | 'outro' | 'unknown';
    startTime: number;
    endTime: number;
    avgEnergy: number;
    beatCount: number;
  }>;
  energyCurve?: {
    samples: number[];
    sampleRate: number;
  };
  transitionHints?: {
    preferredInType: string;
    preferredOutType: string;
    hasStrongDrop: boolean;
    hasCleanOutro: boolean;
    idealCrossfadeBars: number;
  };
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
 * Load existing analysis data
 */
async function loadAnalysisData(): Promise<{ tracks: AudioAnalysis[] }> {
  try {
    const data = await fs.readFile(ANALYSIS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { tracks: [] };
  }
}

/**
 * Save analysis data
 */
async function saveAnalysisData(data: { tracks: AudioAnalysis[] }): Promise<void> {
  await fs.mkdir(path.dirname(ANALYSIS_FILE), { recursive: true });
  await fs.writeFile(ANALYSIS_FILE, JSON.stringify(data, null, 2));
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
 * Detect BPM using aubio
 */
function detectBPM(filePath: string): { bpm: number; confidence: number } {
  try {
    const result = execSync(`aubio tempo -i "${filePath}" 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 60000
    });
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

    // Normalize to DJ range
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
 * Detect key using FFmpeg spectral analysis
 */
function detectKey(filePath: string): { key: string; camelotKey: string } {
  try {
    const tempFile = `/tmp/key_analysis_${Date.now()}.raw`;

    // Get duration
    const durationResult = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    const duration = parseFloat(durationResult.trim());
    const startTime = Math.max(0, duration / 2 - 15);

    // Extract audio as raw PCM
    execSync(
      `ffmpeg -y -ss ${startTime} -t 30 -i "${filePath}" -ac 1 -ar 22050 -f f32le "${tempFile}" 2>/dev/null`,
      { encoding: 'utf-8', stdio: 'pipe', timeout: 60000 }
    );

    const buffer = require('fs').readFileSync(tempFile);
    const samples = new Float32Array(buffer.buffer);
    require('fs').unlinkSync(tempFile);

    // Chroma energy analysis
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

        const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        chromaEnergy[note] += power;
      }
    }

    const maxEnergy = Math.max(...chromaEnergy);
    const normalized = chromaEnergy.map(e => e / maxEnergy);

    // Key profiles (Krumhansl-Schmuckler)
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
 * Detect energy level
 */
function detectEnergy(filePath: string): number {
  try {
    const result = execSync(
      `ffmpeg -i "${filePath}" -af "volumedetect" -f null - 2>&1 | grep -E "mean_volume|max_volume"`,
      { encoding: 'utf-8', timeout: 60000 }
    );

    const meanMatch = result.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const maxMatch = result.match(/max_volume:\s*([-\d.]+)\s*dB/);

    const meanVolume = meanMatch ? parseFloat(meanMatch[1]) : -15;
    const maxVolume = maxMatch ? parseFloat(maxMatch[1]) : -3;

    const normalizedMean = Math.max(0, Math.min(1, (meanVolume + 25) / 20));
    const normalizedMax = Math.max(0, Math.min(1, (maxVolume + 10) / 10));

    return Math.max(1, Math.min(10, Math.round((normalizedMean * 0.7 + normalizedMax * 0.3) * 9 + 1)));
  } catch {
    return 5;
  }
}

/**
 * Get audio duration
 */
function getDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    return parseFloat(result.trim());
  } catch {
    return 0;
  }
}

/**
 * Full analysis of a track (v3 enhanced with mix points)
 */
async function analyzeTrack(filePath: string, fileName: string, fileSize: number): Promise<AudioAnalysis> {
  console.log(`  🎵 Analyzing (v3 enhanced): ${fileName}`);

  // Try v3 enhanced analysis first
  try {
    const enhanced = await analyzeAudioEnhanced(filePath);
    if (enhanced) {
      console.log(`    ✓ v3 analysis complete: ${enhanced.bpm} BPM, ${enhanced.camelotKey}, Energy ${enhanced.energy}`);
      console.log(`    ✓ Mix points: in=${enhanced.mixPoints.mixInPoint.toFixed(1)}s, out=${enhanced.mixPoints.mixOutPoint.toFixed(1)}s`);
      console.log(`    ✓ Segments: ${enhanced.segments.map(s => s.type).join(' → ')}`);

      return {
        id: enhanced.id,
        filePath: enhanced.filePath,
        fileName: enhanced.fileName,
        artist: enhanced.artist,
        title: enhanced.title,
        bpm: enhanced.bpm,
        bpmConfidence: enhanced.bpmConfidence,
        key: enhanced.key,
        camelotKey: enhanced.camelotKey,
        energy: enhanced.energy,
        duration: enhanced.duration,
        fileSize: enhanced.fileSize,
        uploadedAt: new Date().toISOString(),
        analyzedAt: enhanced.analyzedAt,
        analyzerVersion: enhanced.analyzerVersion,
        mixPoints: enhanced.mixPoints,
        segments: enhanced.segments,
        energyCurve: enhanced.energyCurve,
        transitionHints: enhanced.transitionHints,
      };
    }
  } catch (err) {
    console.log(`    ⚠️ v3 analysis failed, falling back to v2: ${err}`);
  }

  // Fallback to basic v2 analysis
  const { artist, title } = parseFilename(fileName);
  const { bpm, confidence: bpmConfidence } = detectBPM(filePath);
  const { key, camelotKey } = detectKey(filePath);
  const energy = detectEnergy(filePath);
  const duration = getDuration(filePath);

  console.log(`    → v2 fallback: ${bpm} BPM, ${camelotKey}, Energy ${energy}`);

  return {
    id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
    uploadedAt: new Date().toISOString(),
    analyzedAt: new Date().toISOString(),
    analyzerVersion: '2.0.0',
  };
}

/**
 * GET - List all tracks in the library
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bpmMin = searchParams.get('bpmMin');
    const bpmMax = searchParams.get('bpmMax');
    const energy = searchParams.get('energy');
    const key = searchParams.get('key');

    const data = await loadAnalysisData();
    let tracks = data.tracks;

    // Apply filters
    if (bpmMin) tracks = tracks.filter(t => t.bpm >= parseFloat(bpmMin));
    if (bpmMax) tracks = tracks.filter(t => t.bpm <= parseFloat(bpmMax));
    if (energy) tracks = tracks.filter(t => t.energy === parseInt(energy));
    if (key) tracks = tracks.filter(t => t.camelotKey === key);

    // Calculate stats
    const stats = {
      totalTracks: data.tracks.length,
      filteredTracks: tracks.length,
      totalDuration: Math.round(tracks.reduce((sum, t) => sum + t.duration, 0)),
      totalSize: tracks.reduce((sum, t) => sum + t.fileSize, 0),
      bpmRange: tracks.length > 0 ? {
        min: Math.min(...tracks.map(t => t.bpm)),
        max: Math.max(...tracks.map(t => t.bpm)),
      } : null,
      keyDistribution: tracks.reduce((acc, t) => {
        acc[t.camelotKey] = (acc[t.camelotKey] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    return NextResponse.json({
      success: true,
      stats,
      tracks: tracks.map(t => ({
        id: t.id,
        artist: t.artist,
        title: t.title,
        bpm: t.bpm,
        key: t.key,
        camelotKey: t.camelotKey,
        energy: t.energy,
        duration: t.duration,
        uploadedAt: t.uploadedAt,
      })),
    });
  } catch (error) {
    console.error('Error listing audio library:', error);
    return NextResponse.json(
      { error: 'Failed to list audio library' },
      { status: 500 }
    );
  }
}

/**
 * POST - Upload and analyze audio files
 */
export async function POST(request: NextRequest) {
  try {
    // Ensure directories exist
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    await fs.mkdir(path.dirname(ANALYSIS_FILE), { recursive: true });

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    console.log(`📤 Uploading ${files.length} audio file(s)...`);

    const data = await loadAnalysisData();
    const results: { success: AudioAnalysis[]; failed: string[] } = {
      success: [],
      failed: [],
    };

    for (const file of files) {
      try {
        const fileName = file.name;
        const ext = path.extname(fileName).toLowerCase();

        // Validate file type
        if (!['.mp3', '.m4a', '.aac', '.flac', '.wav', '.aiff'].includes(ext)) {
          results.failed.push(`${fileName}: Unsupported format`);
          continue;
        }

        // Check for duplicate
        const existingTrack = data.tracks.find(t => t.fileName === fileName);
        if (existingTrack) {
          results.failed.push(`${fileName}: Already exists`);
          continue;
        }

        // Save file
        const filePath = path.join(AUDIO_DIR, fileName);
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.writeFile(filePath, buffer);

        // Analyze (v3 enhanced with mix points)
        const analysis = await analyzeTrack(filePath, fileName, buffer.length);
        data.tracks.push(analysis);
        results.success.push(analysis);

      } catch (err) {
        results.failed.push(`${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Save updated analysis data
    await saveAnalysisData(data);

    console.log(`✅ Upload complete: ${results.success.length} succeeded, ${results.failed.length} failed`);

    return NextResponse.json({
      success: true,
      uploaded: results.success.length,
      failed: results.failed.length,
      results: {
        success: results.success.map(t => ({
          id: t.id,
          fileName: t.fileName,
          artist: t.artist,
          title: t.title,
          bpm: t.bpm,
          camelotKey: t.camelotKey,
          energy: t.energy,
        })),
        failed: results.failed,
      },
      totalLibrarySize: data.tracks.length,
    });

  } catch (error) {
    console.error('Error uploading audio:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload audio' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove a track from the library
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const trackId = searchParams.get('id');

    if (!trackId) {
      return NextResponse.json({ error: 'Track ID required' }, { status: 400 });
    }

    const data = await loadAnalysisData();
    const trackIndex = data.tracks.findIndex(t => t.id === trackId);

    if (trackIndex === -1) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    const track = data.tracks[trackIndex];

    // Delete file
    try {
      await fs.unlink(track.filePath);
    } catch {
      // File might not exist
    }

    // Remove from analysis
    data.tracks.splice(trackIndex, 1);
    await saveAnalysisData(data);

    return NextResponse.json({
      success: true,
      message: `Deleted: ${track.fileName}`,
    });

  } catch (error) {
    console.error('Error deleting track:', error);
    return NextResponse.json(
      { error: 'Failed to delete track' },
      { status: 500 }
    );
  }
}
