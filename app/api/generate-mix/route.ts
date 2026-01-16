import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Import the AI DJ service modules
import {
  loadAudioLibraryIndex,
  buildAudioLibraryIndex,
  getMixableFiles,
  IndexedAudioFile,
} from '@/lib/audio-library-indexer';
import { mixPlaylist, MixJob } from '@/lib/mix-engine';
import { optimizeTrackOrder } from '@/lib/automix-optimizer';
import { createJob, updateJob, completeJob, failJob } from '@/lib/mix-job-manager';
import Anthropic from '@anthropic-ai/sdk';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const CLOUD_LIBRARY_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis.json');

// Mix constraints extracted from prompt
interface MixConstraints {
  trackCount: number;
  bpmRange: { min: number; max: number };
  energyRange: { min: number; max: number };
  genres: string[];
  moods: string[];
  energyCurve: 'build' | 'peak' | 'chill' | 'steady';
}

// Cloud audio track type (v3 enhanced with mix points)
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

  // v3 Enhanced fields
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
  transitionHints?: {
    preferredInType: string;
    preferredOutType: string;
    hasStrongDrop: boolean;
    hasCleanOutro: boolean;
    idealCrossfadeBars: number;
  };
}

/**
 * Load cloud audio library (uploaded files)
 */
function loadCloudLibrary(): CloudAudioTrack[] {
  try {
    if (fs.existsSync(CLOUD_LIBRARY_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLOUD_LIBRARY_FILE, 'utf-8'));
      // Verify files still exist
      return (data.tracks || []).filter((track: CloudAudioTrack) =>
        fs.existsSync(track.filePath)
      );
    }
  } catch (err) {
    console.log('  ⚠️ Could not load cloud library:', err);
  }
  return [];
}

/**
 * Convert cloud track to IndexedAudioFile format (v3 enhanced)
 */
function cloudTrackToIndexed(track: CloudAudioTrack): IndexedAudioFile {
  const ext = track.fileName.split('.').pop()?.toLowerCase() || 'mp3';
  const indexed: IndexedAudioFile = {
    filePath: track.filePath,
    fileName: track.fileName,
    fileSize: track.fileSize,
    fileExtension: ext,
    artist: track.artist,
    title: track.title,
    durationSeconds: track.duration,
    isAnalyzed: true,
    mikData: {
      bpm: track.bpm,
      key: track.camelotKey,
      camelotKey: track.camelotKey,
      energy: track.energy,
    },
  };

  // Pass through v3 enhanced data if available
  if (track.mixPoints) {
    indexed.mixPoints = track.mixPoints;
  }
  if (track.segments) {
    indexed.segments = track.segments;
  }
  if (track.transitionHints) {
    indexed.transitionHints = track.transitionHints;
  }

  return indexed;
}

/**
 * POST /api/generate-mix
 *
 * Generate an audio mix from a natural language prompt.
 * Returns immediately with a job ID - poll /api/mix-status/[jobId] for progress.
 *
 * Request body:
 * - prompt: string - Natural language description of the mix
 * - trackCount?: number - Number of tracks (default: 6)
 *
 * Response:
 * - jobId: string - Poll /api/mix-status/[jobId] for progress
 * - status: string - Current status (pending)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, trackCount = 6 } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid prompt' },
        { status: 400 }
      );
    }

    console.log(`🎧 Generate Mix API - Prompt: "${prompt}", trackCount: ${trackCount}`);

    // Create job immediately
    const job = createJob(prompt, trackCount);
    console.log(`  📋 Created job: ${job.id}`);

    // Start processing in the background (fire and forget)
    // This works on self-hosted server but not serverless
    processMixJob(job.id, prompt, trackCount).catch(err => {
      console.error(`  ❌ Job ${job.id} failed:`, err);
      failJob(job.id, err instanceof Error ? err.message : String(err));
    });

    // Return immediately with job ID
    return NextResponse.json({
      jobId: job.id,
      status: 'pending',
      message: 'Mix generation started. Poll /api/mix-status/{jobId} for progress.',
      statusUrl: `/api/mix-status/${job.id}`,
    });
  } catch (error) {
    console.error('Mix generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Process mix job in the background
 */
async function processMixJob(jobId: string, prompt: string, trackCount: number): Promise<void> {
  console.log(`  🎬 Starting job ${jobId}...`);

  try {
    // Step 1: Parse the prompt to extract constraints
    updateJob(jobId, {
      status: 'processing',
      progress: 5,
      progressMessage: 'Parsing prompt...',
    });

    const constraints = await parsePrompt(prompt, trackCount);
    console.log('  📝 Constraints:', JSON.stringify(constraints, null, 2));

    updateJob(jobId, {
      progress: 10,
      progressMessage: 'Loading audio library...',
    });

    // Step 2: Load the audio library
    let mixableFiles: IndexedAudioFile[] = [];

    const cloudTracks = loadCloudLibrary();
    if (cloudTracks.length > 0) {
      console.log(`  ☁️ Using cloud library: ${cloudTracks.length} tracks`);
      mixableFiles = cloudTracks.map(cloudTrackToIndexed);
    } else {
      let audioIndex = loadAudioLibraryIndex();
      if (!audioIndex) {
        console.log('  📚 Building local audio library index...');
        audioIndex = buildAudioLibraryIndex();
      }
      mixableFiles = getMixableFiles(audioIndex);
      console.log(`  📚 Using local library: ${mixableFiles.length} mixable tracks`);
    }

    if (mixableFiles.length < constraints.trackCount) {
      throw new Error(`Not enough analyzed tracks. Have ${mixableFiles.length}, need ${constraints.trackCount}`);
    }

    updateJob(jobId, {
      progress: 20,
      progressMessage: 'Selecting tracks...',
    });

    // Step 3: Select tracks based on constraints
    const selectedTracks = await selectTracks(mixableFiles, constraints);
    console.log(`  🎵 Selected ${selectedTracks.length} tracks`);

    updateJob(jobId, {
      progress: 30,
      progressMessage: 'Optimizing track order...',
    });

    // Step 4: Optimize track order for harmonic mixing
    const orderedTracks = optimizeTrackOrderForMix(selectedTracks);
    console.log('  🔀 Optimized track order');

    // Step 5: Generate the mix
    const mixName = generateMixName(constraints);
    const outputPath = path.join(OUTPUT_DIR, `${sanitizeFilename(mixName)}.mp3`);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const mixJob: MixJob = {
      id: jobId,
      name: mixName,
      tracks: orderedTracks.map(file => {
        const track: any = {
          filePath: file.filePath,
          artist: file.artist,
          title: file.title,
          bpm: file.mikData?.bpm || 120,
          camelotKey: file.mikData?.camelotKey || '8A',
          energy: file.mikData?.energy || 5,
          analysis: {
            duration: file.durationSeconds || 0,
          },
        };

        // Pass through v3 enhanced mix points if available
        if (file.mixPoints) {
          track.mixInPoint = file.mixPoints.mixInPoint;
          track.mixOutPoint = file.mixPoints.mixOutPoint;
          console.log(`    ✓ v3 mix points for ${file.title}: in=${file.mixPoints.mixInPoint.toFixed(1)}s, out=${file.mixPoints.mixOutPoint.toFixed(1)}s`);
        }

        // Pass through transition hints for intelligent crossfade
        if (file.transitionHints) {
          track.transitionHints = file.transitionHints;
        }

        return track;
      }),
      outputPath,
      format: 'mp3',
      quality: 'high',
    };

    console.log('  🎛️ Generating mix...');

    const result = await mixPlaylist(mixJob, (stage, progress, message) => {
      // Map stage to overall progress (30-90%)
      const overallProgress = 30 + (progress * 0.6);
      updateJob(jobId, {
        progress: Math.round(overallProgress),
        progressMessage: message,
      });
      console.log(`    [${stage}] ${progress}% - ${message}`);
    });

    if (!result.success) {
      throw new Error(result.errorMessage || 'Mix generation failed');
    }

    // Build tracklist for response
    const tracklist = orderedTracks.map((track, index) => ({
      position: index + 1,
      artist: track.artist,
      title: track.title,
      bpm: track.mikData?.bpm,
      key: track.mikData?.camelotKey,
      energy: track.mikData?.energy,
    }));

    console.log(`  ✅ Mix complete: ${result.outputPath}`);

    // Mark job as complete
    completeJob(jobId, {
      mixName,
      mixUrl: `/api/download-mix?file=${encodeURIComponent(path.basename(outputPath))}`,
      tracklist,
      duration: result.duration || 0,
      transitionCount: result.transitionCount || 0,
      harmonicPercentage: result.harmonicMixPercentage || 0,
    });

  } catch (err) {
    console.error(`  ❌ Job ${jobId} error:`, err);
    failJob(jobId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Parse prompt to extract mix constraints
 */
async function parsePrompt(prompt: string, defaultTrackCount: number): Promise<MixConstraints> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Default constraints
  const defaults: MixConstraints = {
    trackCount: defaultTrackCount,
    bpmRange: { min: 115, max: 135 },
    energyRange: { min: 3, max: 8 },
    genres: [],
    moods: [],
    energyCurve: 'steady',
  };

  // Check if prompt explicitly mentions track count
  const hasExplicitTrackCount = /\d+\s*tracks?/i.test(prompt);

  if (!apiKey) {
    return parsePromptBasic(prompt, defaults, hasExplicitTrackCount);
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Parse this DJ mix request and extract constraints as JSON:
"${prompt}"

Return ONLY valid JSON with these fields:
- trackCount (number, ONLY include if explicitly mentioned in prompt, otherwise omit)
- bpmRange: { min, max } (reasonable DJ range)
- energyRange: { min, max } (1-10 scale)
- genres: string[] (detected genres)
- moods: string[] (mood descriptors)
- energyCurve: "build" | "peak" | "chill" | "steady"

IMPORTANT: Only include trackCount field if the user explicitly specified a number of tracks. If not mentioned, omit this field entirely.`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Only use Claude's trackCount if prompt explicitly mentioned it
        if (!hasExplicitTrackCount && parsed.trackCount !== undefined) {
          console.log(`  ⚠️ Ignoring Claude's trackCount (${parsed.trackCount}), using app's (${defaultTrackCount})`);
          delete parsed.trackCount;
        }
        return { ...defaults, ...parsed };
      }
    }
  } catch (err) {
    console.log('  ⚠️ Claude parsing failed, using basic parser');
  }

  return parsePromptBasic(prompt, defaults, hasExplicitTrackCount);
}

/**
 * Basic regex-based prompt parsing fallback
 */
function parsePromptBasic(prompt: string, defaults: MixConstraints, hasExplicitTrackCount: boolean): MixConstraints {
  const lower = prompt.toLowerCase();

  // Extract track count ONLY if explicitly mentioned
  if (hasExplicitTrackCount) {
    const trackMatch = lower.match(/(\d+)\s*tracks?/);
    if (trackMatch) {
      defaults.trackCount = parseInt(trackMatch[1]);
      console.log(`  📊 Using explicit trackCount from prompt: ${defaults.trackCount}`);
    }
  } else {
    console.log(`  📊 Using app's trackCount: ${defaults.trackCount}`);
  }

  // Extract BPM
  const bpmMatch = lower.match(/(\d+)\s*bpm/);
  if (bpmMatch) {
    const bpm = parseInt(bpmMatch[1]);
    defaults.bpmRange = { min: bpm - 5, max: bpm + 5 };
  }

  // Detect energy curve
  if (lower.includes('build') || lower.includes('warm up') || lower.includes('warmup')) {
    defaults.energyCurve = 'build';
  } else if (lower.includes('peak') || lower.includes('high energy')) {
    defaults.energyCurve = 'peak';
  } else if (lower.includes('chill') || lower.includes('downtempo') || lower.includes('ambient')) {
    defaults.energyCurve = 'chill';
  }

  // Detect genres
  const genrePatterns = [
    'tech house', 'deep house', 'house', 'techno', 'trance',
    'drum and bass', 'dnb', 'hip hop', 'hip-hop', 'breaks',
    'disco', 'nu-disco', 'nu disco', 'nudisco', 'funk', 'soul', 'r&b',
    'ambient', 'downtempo', 'chill', 'lounge', 'indie dance', 'electronica',
  ];
  for (const genre of genrePatterns) {
    if (lower.includes(genre)) {
      defaults.genres.push(genre);
    }
  }

  return defaults;
}

/**
 * Select tracks based on constraints (with genre filtering)
 */
async function selectTracks(
  pool: IndexedAudioFile[],
  constraints: MixConstraints
): Promise<IndexedAudioFile[]> {
  // Filter by BPM range
  let filtered = pool.filter((track) => {
    const bpm = track.mikData?.bpm;
    if (!bpm) return false;
    return bpm >= constraints.bpmRange.min && bpm <= constraints.bpmRange.max;
  });

  // Filter by energy range
  filtered = filtered.filter((track) => {
    const energy = track.mikData?.energy || 5;
    return energy >= constraints.energyRange.min && energy <= constraints.energyRange.max;
  });

  // Filter by genre using Claude AI if genres specified
  if (constraints.genres?.length > 0 && filtered.length > 0) {
    console.log(`  🎵 Filtering by genre: ${constraints.genres.join(', ')}`);
    filtered = await filterByGenre(filtered, constraints.genres);
    console.log(`  ✓ ${filtered.length} tracks match genre filter`);
  }

  // If not enough tracks, expand the BPM range
  if (filtered.length < constraints.trackCount) {
    console.log('  ⚠️ Expanding BPM range to find more tracks');
    let expanded = pool.filter((track) => {
      const bpm = track.mikData?.bpm;
      if (!bpm) return false;
      return bpm >= constraints.bpmRange.min - 15 && bpm <= constraints.bpmRange.max + 15;
    });
    // Re-apply genre filter to expanded pool
    if (constraints.genres?.length > 0) {
      expanded = await filterByGenre(expanded, constraints.genres);
    }
    filtered = expanded;
  }

  // If still not enough, use all tracks (without genre filter as fallback)
  if (filtered.length < constraints.trackCount) {
    console.log('  ⚠️ Using all available tracks (genre filter relaxed)');
    filtered = pool.filter(track => track.mikData?.bpm);
  }

  // Shuffle and take the requested number
  const shuffled = filtered.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, constraints.trackCount);
}

/**
 * Filter tracks by genre using Claude AI
 */
async function filterByGenre(
  tracks: IndexedAudioFile[],
  genres: string[]
): Promise<IndexedAudioFile[]> {
  if (tracks.length === 0) return tracks;

  // Batch tracks for efficient API usage
  const trackList = tracks.map((t, i) => `${i}. ${t.artist} - ${t.title}`).join('\n');
  const genreStr = genres.join(', ');

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a DJ music expert. From this list of tracks, identify which ones fit the genre(s): ${genreStr}

For house music, include: house, deep house, tech house, progressive house, nu disco, disco, funky house, vocal house, french house.
For nudisco, include: nu disco, disco, indie dance, funky, boogie.
Exclude: ambient, experimental, indie rock, folk, classical, hip-hop (unless specifically house remixes).

Tracks:
${trackList}

Return ONLY a JSON array of the track numbers (0-indexed) that match. Example: [0, 3, 7, 12]
If no tracks match, return an empty array: []`
      }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      // Extract JSON array from response
      const match = content.text.match(/\[[\d,\s]*\]/);
      if (match) {
        const indices: number[] = JSON.parse(match[0]);
        return indices.map(i => tracks[i]).filter(Boolean);
      }
    }
  } catch (err) {
    console.log('  ⚠️ Genre filter failed, using all tracks:', err);
  }

  return tracks; // Return all tracks if filtering fails
}

/**
 * Optimize track order for harmonic mixing
 */
function optimizeTrackOrderForMix(tracks: IndexedAudioFile[]): IndexedAudioFile[] {
  // Convert to the format expected by automix-optimizer
  const spotifyFormat = tracks.map((track) => ({
    id: track.filePath,
    name: track.title,
    artists: [{ name: track.artist }],
    album: { name: 'Unknown' },
    duration_ms: (track.durationSeconds || 180) * 1000,
    uri: '',
    external_urls: { spotify: '' },
    // MIK data mapped to Spotify features format
    key: parseCamelotToSpotifyKey(track.mikData?.camelotKey || '8A'),
    mode: track.mikData?.camelotKey?.endsWith('A') ? 0 : 1,
    tempo: track.mikData?.bpm || 120,
    energy: (track.mikData?.energy || 5) / 10,
    danceability: 0.7,
    valence: 0.5,
    mikData: track.mikData,
    camelotKey: track.mikData?.camelotKey,
  }));

  const ordered = optimizeTrackOrder(spotifyFormat as any, { prioritizeHarmonic: true });

  // Map back to IndexedAudioFile
  return ordered.map((track: any) => {
    return tracks.find((t) => t.filePath === track.id)!;
  });
}

/**
 * Convert Camelot key to Spotify key number (0-11)
 */
function parseCamelotToSpotifyKey(camelot: string): number {
  const camelotToKey: Record<string, number> = {
    '1A': 8, '1B': 3,
    '2A': 3, '2B': 10,
    '3A': 10, '3B': 5,
    '4A': 5, '4B': 0,
    '5A': 0, '5B': 7,
    '6A': 7, '6B': 2,
    '7A': 2, '7B': 9,
    '8A': 9, '8B': 4,
    '9A': 4, '9B': 11,
    '10A': 11, '10B': 6,
    '11A': 6, '11B': 1,
    '12A': 1, '12B': 8,
  };
  return camelotToKey[camelot] || 0;
}

/**
 * Generate a mix name based on constraints
 */
function generateMixName(constraints: MixConstraints): string {
  const parts: string[] = [];

  if (constraints.genres?.length) {
    parts.push(constraints.genres[0].replace(/\b\w/g, (c: string) => c.toUpperCase()));
  }

  if (constraints.energyCurve === 'build') {
    parts.push('Warm Up');
  } else if (constraints.energyCurve === 'peak') {
    parts.push('Peak Time');
  } else if (constraints.energyCurve === 'chill') {
    parts.push('Sunset');
  }

  if (parts.length === 0) {
    parts.push('Session');
  }

  parts.push('Mix');

  return parts.join(' ');
}

/**
 * Sanitize filename
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
}
