/**
 * AI DJ Service
 *
 * The unified orchestrator that brings everything together:
 * 1. Natural language prompt → structured constraints
 * 2. Local library search → track selection
 * 3. Harmonic ordering → optimal mix sequence
 * 4. Mix engine → actual mixed audio file
 *
 * This is the "AI DJ" that creates real mixed audio from prompts.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import Anthropic from '@anthropic-ai/sdk';
import {
  loadAudioLibraryIndex,
  getMixableFiles,
  AudioLibraryIndex,
  IndexedAudioFile,
} from './audio-library-indexer';
import { mixPlaylist, MixJob, MixTrack, ProgressCallback } from './mix-engine';

// Initialize Anthropic client (may be undefined if no API key)
let anthropic: Anthropic | null = null;
try {
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch {
  console.log('Note: Anthropic API not configured, using basic parsing');
}

// Mix request from user
export interface MixRequest {
  prompt: string;
  outputPath?: string;
  outputFormat?: 'mp3' | 'wav' | 'flac';
}

// Parsed constraints from prompt
export interface MixConstraints {
  artists: string[];
  genres: string[];
  bpmRange: { min: number; max: number };
  energyRange: { min: number; max: number };
  keyPreferences: string[];
  trackCount: number;
  energyCurve: 'build' | 'peak' | 'chill' | 'maintain' | 'wave';
  moods: string[];
  duration?: number; // minutes
}

// Mix generation result
export interface MixGenerationResult {
  success: boolean;
  outputPath?: string;
  duration?: number;
  trackCount?: number;
  tracklist?: { artist: string; title: string; bpm: number; key: string }[];
  constraints?: MixConstraints;
  errorMessage?: string;
}

/**
 * Basic regex parsing fallback when Claude API not available
 */
function parsePromptBasic(prompt: string): MixConstraints {
  const lower = prompt.toLowerCase();

  // Extract BPM range
  let bpmRange = { min: 120, max: 130 };
  const bpmMatch = lower.match(/(\d{2,3})\s*[-–]\s*(\d{2,3})\s*bpm/);
  const singleBpmMatch = lower.match(/(\d{2,3})\s*bpm|around\s*(\d{2,3})/);
  if (bpmMatch) {
    bpmRange = { min: parseInt(bpmMatch[1]), max: parseInt(bpmMatch[2]) };
  } else if (singleBpmMatch) {
    const bpm = parseInt(singleBpmMatch[1] || singleBpmMatch[2]);
    bpmRange = { min: bpm - 5, max: bpm + 5 };
  }

  // Genre detection with BPM defaults
  if (lower.includes('techno') && !bpmMatch && !singleBpmMatch) {
    bpmRange = { min: 130, max: 145 };
  } else if (lower.includes('tech house') && !bpmMatch && !singleBpmMatch) {
    bpmRange = { min: 124, max: 130 };
  } else if (lower.includes('deep house') && !bpmMatch && !singleBpmMatch) {
    bpmRange = { min: 118, max: 124 };
  } else if (lower.includes('house') && !bpmMatch && !singleBpmMatch) {
    bpmRange = { min: 118, max: 128 };
  }

  // Extract track count
  let trackCount = 8;
  const trackMatch = lower.match(/(\d+)\s*tracks?/);
  if (trackMatch) {
    trackCount = parseInt(trackMatch[1]);
  }

  // Extract energy curve
  let energyCurve: MixConstraints['energyCurve'] = 'maintain';
  let energyRange = { min: 5, max: 8 };
  if (lower.includes('warm up') || lower.includes('opening') || lower.includes('building')) {
    energyCurve = 'build';
    energyRange = { min: 4, max: 7 };
  } else if (lower.includes('peak') || lower.includes('main room') || lower.includes('prime time')) {
    energyCurve = 'peak';
    energyRange = { min: 8, max: 10 };
  } else if (lower.includes('chill') || lower.includes('closing') || lower.includes('cool down')) {
    energyCurve = 'chill';
    energyRange = { min: 3, max: 6 };
  }

  // Extract genres
  const genres: string[] = [];
  if (lower.includes('techno')) genres.push('techno');
  if (lower.includes('tech house')) genres.push('tech-house');
  if (lower.includes('house')) genres.push('house');
  if (lower.includes('deep')) genres.push('deep');
  if (lower.includes('progressive')) genres.push('progressive');

  // Extract moods
  const moods: string[] = [];
  if (lower.includes('energetic') || lower.includes('driving')) moods.push('energetic');
  if (lower.includes('dark') || lower.includes('warehouse')) moods.push('dark');
  if (lower.includes('melodic')) moods.push('melodic');
  if (lower.includes('hypnotic')) moods.push('hypnotic');

  return {
    artists: [],
    genres,
    bpmRange,
    energyRange,
    keyPreferences: [],
    trackCount,
    energyCurve,
    moods,
  };
}

/**
 * Parse natural language prompt into structured constraints using Claude
 */
async function parsePromptToConstraints(prompt: string): Promise<MixConstraints> {
  // Fallback to basic parsing if no API
  if (!anthropic) {
    console.log('  (Using basic parsing - no Claude API)');
    return parsePromptBasic(prompt);
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an expert DJ. Parse this mix request into structured constraints.

DJ TERMINOLOGY:
- "peak time" / "prime time" → energy 8-10, high BPM
- "warm up" / "opening" → energy 4-6, building
- "closing" / "cool down" → energy descending
- "sunrise" / "after hours" → hypnotic, deep
- "festival" / "mainstage" → energy 9-10, anthemic

GENRE BPM DEFAULTS:
- techno: 130-145
- tech-house: 124-130
- house: 118-128
- deep house: 118-124
- progressive: 126-132
- drum & bass: 170-180

Request: "${prompt}"

Respond ONLY with valid JSON (no markdown):
{
  "artists": ["artist names to include or similar to"],
  "genres": ["genre preferences"],
  "bpmRange": {"min": 120, "max": 130},
  "energyRange": {"min": 5, "max": 8},
  "keyPreferences": ["8A", "8B", "9A"],
  "trackCount": 8,
  "energyCurve": "build",
  "moods": ["energetic", "driving"],
  "duration": 60
}

If not specified, use sensible defaults for a DJ mix.`,
      },
    ],
  });

  try {
    const content = message.content[0];
    if (content.type === 'text') {
      // Parse JSON, handling potential markdown code blocks
      let jsonText = content.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }
      return JSON.parse(jsonText);
    }
  } catch (error) {
    console.error('Failed to parse constraints:', error);
  }

  // Return defaults if parsing fails
  return {
    artists: [],
    genres: [],
    bpmRange: { min: 120, max: 130 },
    energyRange: { min: 5, max: 8 },
    keyPreferences: [],
    trackCount: 8,
    energyCurve: 'build',
    moods: [],
    duration: 60,
  };
}

/**
 * Check if two Camelot keys are compatible for harmonic mixing
 */
function areKeysCompatible(key1: string, key2: string): boolean {
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
    if (diff === 1 || diff === 11) return true;
  }

  return false;
}

/**
 * Score how well a track matches the constraints
 */
function scoreTrackMatch(track: IndexedAudioFile, constraints: MixConstraints): number {
  let score = 0;
  const mik = track.mikData;

  if (!mik) return 0;

  // BPM match (0-30 points)
  if (mik.bpm >= constraints.bpmRange.min && mik.bpm <= constraints.bpmRange.max) {
    score += 30;
  } else {
    const bpmDiff = Math.min(
      Math.abs(mik.bpm - constraints.bpmRange.min),
      Math.abs(mik.bpm - constraints.bpmRange.max)
    );
    score += Math.max(0, 20 - bpmDiff);
  }

  // Energy match (0-25 points)
  if (mik.energy >= constraints.energyRange.min && mik.energy <= constraints.energyRange.max) {
    score += 25;
  } else {
    const energyDiff = Math.min(
      Math.abs(mik.energy - constraints.energyRange.min),
      Math.abs(mik.energy - constraints.energyRange.max)
    );
    score += Math.max(0, 15 - energyDiff * 3);
  }

  // Key preference match (0-20 points)
  if (constraints.keyPreferences.length > 0) {
    if (constraints.keyPreferences.includes(mik.key)) {
      score += 20;
    } else if (constraints.keyPreferences.some((k) => areKeysCompatible(k, mik.key))) {
      score += 10;
    }
  } else {
    score += 10; // Neutral if no preference
  }

  // Artist match (0-25 points)
  if (constraints.artists.length > 0) {
    const artistLower = track.artist.toLowerCase();
    for (const targetArtist of constraints.artists) {
      if (artistLower.includes(targetArtist.toLowerCase())) {
        score += 25;
        break;
      }
    }
  }

  return score;
}

/**
 * Score a transition between two tracks
 */
function scoreTransition(track1: IndexedAudioFile, track2: IndexedAudioFile): number {
  let score = 0;
  const mik1 = track1.mikData;
  const mik2 = track2.mikData;

  if (!mik1 || !mik2) return 0;

  // Key compatibility (0-40 points)
  if (mik1.key === mik2.key) {
    score += 40;
  } else if (areKeysCompatible(mik1.key, mik2.key)) {
    score += 30;
  } else {
    score += 5;
  }

  // BPM compatibility (0-30 points)
  const bpmDiff = Math.abs(mik1.bpm - mik2.bpm);
  if (bpmDiff <= 2) {
    score += 30;
  } else if (bpmDiff <= 5) {
    score += 25;
  } else if (bpmDiff <= 10) {
    score += 15;
  } else {
    score += 5;
  }

  // Energy flow (0-20 points)
  const energyDiff = mik2.energy - mik1.energy;
  if (energyDiff >= 0 && energyDiff <= 1) {
    score += 20;
  } else if (energyDiff > 1 && energyDiff <= 2) {
    score += 15;
  } else if (energyDiff < 0 && energyDiff >= -1) {
    score += 12;
  } else {
    score += 5;
  }

  // Artist variety (0-10 points)
  if (track1.artist !== track2.artist) {
    score += 10;
  }

  return score;
}

/**
 * Order tracks for optimal harmonic mixing using greedy algorithm
 */
function orderTracksForMixing(tracks: IndexedAudioFile[]): IndexedAudioFile[] {
  if (tracks.length <= 2) return tracks;

  const ordered: IndexedAudioFile[] = [];
  const remaining = [...tracks];

  // Start with track that has most compatible options
  const startScores = remaining.map((track) => {
    const compatibleCount = remaining.filter(
      (t) => t !== track && areKeysCompatible(track.mikData?.key || '', t.mikData?.key || '')
    ).length;
    return { track, compatibleCount };
  });

  startScores.sort((a, b) => b.compatibleCount - a.compatibleCount);
  const startTrack = startScores[0].track;
  ordered.push(startTrack);
  remaining.splice(remaining.indexOf(startTrack), 1);

  // Greedily select next track based on transition score
  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];

    const scored = remaining.map((track) => ({
      track,
      score: scoreTransition(current, track),
    }));

    scored.sort((a, b) => b.score - a.score);
    const next = scored[0].track;
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }

  return ordered;
}

/**
 * Select tracks from library based on constraints
 */
function selectTracks(
  index: AudioLibraryIndex,
  constraints: MixConstraints
): IndexedAudioFile[] {
  // Get all mixable tracks
  let tracks = getMixableFiles(index);

  console.log(`  📚 Pool: ${tracks.length} tracks with analysis data`);

  // Score and sort by match quality
  const scored = tracks.map((t) => ({
    track: t,
    score: scoreTrackMatch(t, constraints),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Take top tracks with variety
  const selected: IndexedAudioFile[] = [];
  const usedArtists = new Map<string, number>();
  const maxPerArtist = 2;
  const targetCount = constraints.trackCount || 8;

  for (const { track, score } of scored) {
    if (selected.length >= targetCount) break;

    const artistCount = usedArtists.get(track.artist) || 0;
    if (artistCount < maxPerArtist) {
      selected.push(track);
      usedArtists.set(track.artist, artistCount + 1);
    }
  }

  console.log(`  🎯 Selected: ${selected.length} tracks`);

  return selected;
}

/**
 * Generate a creative name for the mix using Claude
 */
async function generateMixName(constraints: MixConstraints): Promise<string> {
  // Fallback if no API
  if (!anthropic) {
    const genre = constraints.genres[0] || 'Electronic';
    const curve = constraints.energyCurve || 'Mix';
    return `${genre.charAt(0).toUpperCase() + genre.slice(1)} ${curve.charAt(0).toUpperCase() + curve.slice(1)} Session`;
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: `Generate a short, creative DJ mix name (2-4 words) for a mix with:
- Artists: ${constraints.artists.join(', ') || 'various'}
- Genres: ${constraints.genres.join(', ') || 'electronic'}
- Moods: ${constraints.moods.join(', ') || 'energetic'}
- Energy: ${constraints.energyCurve}

Respond with ONLY the mix name, no quotes or punctuation.`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type === 'text') {
      return content.text.trim().replace(/["']/g, '');
    }
  } catch {
    // Fallback
  }

  return `AI Mix ${new Date().toLocaleDateString()}`;
}

/**
 * Main function: Generate a complete DJ mix from a natural language prompt
 */
export async function generateMixFromPrompt(
  request: MixRequest,
  onProgress?: ProgressCallback
): Promise<MixGenerationResult> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           🤖 AI DJ Service                               ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📝 Prompt: "${request.prompt}"`);

  try {
    // Step 1: Parse prompt into constraints
    onProgress?.('analyzing', 5, 'Understanding your request...');
    console.log('\n🧠 Step 1: Parsing prompt...');

    const constraints = await parsePromptToConstraints(request.prompt);
    console.log('  Constraints:', JSON.stringify(constraints, null, 2));

    // Step 2: Load audio library
    onProgress?.('analyzing', 15, 'Loading audio library...');
    console.log('\n📚 Step 2: Loading audio library...');

    const index = loadAudioLibraryIndex();
    if (!index) {
      return {
        success: false,
        errorMessage: 'Audio library index not found. Run: npx tsx lib/audio-library-indexer.ts',
      };
    }
    console.log(`  ✓ ${index.totalFiles} files indexed, ${index.analyzedFiles} analyzed`);

    // Step 3: Select tracks
    onProgress?.('analyzing', 30, 'Selecting tracks...');
    console.log('\n🎵 Step 3: Selecting tracks...');

    const selectedTracks = selectTracks(index, constraints);

    if (selectedTracks.length < 2) {
      return {
        success: false,
        errorMessage: `Not enough tracks found (${selectedTracks.length}). Try relaxing constraints.`,
        constraints,
      };
    }

    // Step 4: Order for harmonic mixing
    onProgress?.('analyzing', 40, 'Optimizing track order...');
    console.log('\n🔀 Step 4: Optimizing track order for harmonic mixing...');

    const orderedTracks = orderTracksForMixing(selectedTracks);

    console.log('\n📋 Tracklist:');
    orderedTracks.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.artist} - ${t.title} (${t.mikData?.bpm} BPM, ${t.mikData?.key})`);
    });

    // Step 5: Generate mix name
    const mixName = await generateMixName(constraints);
    console.log(`\n🏷️  Mix Name: ${mixName}`);

    // Step 6: Prepare output path
    const outputFormat = request.outputFormat || 'mp3';
    const outputPath =
      request.outputPath ||
      `/Users/tombragg/dj-mix-generator/output/${mixName.replace(/[^a-zA-Z0-9]/g, '-')}.${outputFormat}`;

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Step 7: Create mix job
    const mixTracks: MixTrack[] = orderedTracks.map((t) => ({
      filePath: t.filePath,
      artist: t.artist,
      title: t.title,
      bpm: t.mikData?.bpm || 120,
      camelotKey: t.mikData?.key || '8A',
      energy: t.mikData?.energy || 5,
    }));

    const mixJob: MixJob = {
      id: `ai-dj-${Date.now()}`,
      name: mixName,
      tracks: mixTracks,
      outputPath,
      format: outputFormat,
      quality: 'high',
    };

    // Step 8: Generate the mix
    console.log('\n🎛️  Step 5: Generating mix...');
    onProgress?.('processing', 50, 'Mixing tracks...');

    const mixResult = await mixPlaylist(mixJob, onProgress);

    if (!mixResult.success) {
      return {
        success: false,
        errorMessage: mixResult.errorMessage,
        constraints,
      };
    }

    // Success!
    console.log('\n' + '═'.repeat(60));
    console.log('✅ MIX COMPLETE');
    console.log('═'.repeat(60));
    console.log(`  📁 Output: ${outputPath}`);
    console.log(`  ⏱️  Duration: ${Math.round((mixResult.duration || 0) / 60)} minutes`);
    console.log(`  🎵 Tracks: ${orderedTracks.length}`);
    console.log(`  🔗 Transitions: ${mixResult.transitionCount}`);
    console.log(`  🎹 Harmonic: ${mixResult.harmonicMixPercentage}%`);

    return {
      success: true,
      outputPath,
      duration: mixResult.duration,
      trackCount: orderedTracks.length,
      tracklist: orderedTracks.map((t) => ({
        artist: t.artist,
        title: t.title,
        bpm: t.mikData?.bpm || 0,
        key: t.mikData?.key || '',
      })),
      constraints,
    };
  } catch (error) {
    console.error('Error generating mix:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const prompt = args.join(' ') || 'Create a 30-minute tech house mix for warm up, energy building';

  console.log('🎧 AI DJ Service - CLI Mode');
  console.log('');

  generateMixFromPrompt({ prompt }).then((result) => {
    if (result.success) {
      console.log('\n🎉 Mix generated successfully!');
      console.log(`   Play it: open "${result.outputPath}"`);
    } else {
      console.error('\n❌ Mix generation failed:', result.errorMessage);
      process.exit(1);
    }
  });
}
