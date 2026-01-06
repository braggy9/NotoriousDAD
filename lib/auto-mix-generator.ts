/**
 * Auto Mix Generator
 *
 * End-to-end automated mix generation from prompt to mixed audio file.
 *
 * Flow:
 * 1. Load audio library index with MIK data
 * 2. Filter tracks by BPM, key, energy constraints
 * 3. Order tracks for optimal harmonic transitions
 * 4. Generate mixed audio file using FFmpeg
 *
 * This is the "AI DJ" that creates real mixed audio from your library.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadAudioLibraryIndex, getMixableFiles, AudioLibraryIndex, IndexedAudioFile } from './audio-library-indexer';
import { mixPlaylist, MixJob, MixTrack, ProgressCallback, MixResult } from './mix-engine';

// Mix generation constraints
export interface MixConstraints {
  // BPM range
  minBPM?: number;
  maxBPM?: number;

  // Key constraints (Camelot notation)
  preferredKeys?: string[];

  // Energy level (1-10)
  minEnergy?: number;
  maxEnergy?: number;

  // Energy curve: 'build', 'peak', 'chill', 'maintain'
  energyCurve?: 'build' | 'peak' | 'chill' | 'maintain';

  // Track count
  trackCount?: number;

  // Duration in minutes (approximate)
  durationMinutes?: number;
}

// Mix generation result
export interface AutoMixResult {
  success: boolean;
  outputPath?: string;
  duration?: number;
  trackCount?: number;
  tracks?: { artist: string; title: string; bpm: number; key: string }[];
  errorMessage?: string;
}

/**
 * Check if two Camelot keys are compatible for mixing
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
    if (diff === 1 || diff === 11) return true; // 11 for 12->1 wrap
  }

  return false;
}

/**
 * Score a transition between two tracks (higher = better)
 */
function scoreTransition(track1: IndexedAudioFile, track2: IndexedAudioFile): number {
  let score = 0;

  const mik1 = track1.mikData;
  const mik2 = track2.mikData;

  if (!mik1 || !mik2) return 0;

  // Key compatibility (0-40 points)
  if (mik1.key === mik2.key) {
    score += 40; // Same key = perfect
  } else if (areKeysCompatible(mik1.key, mik2.key)) {
    score += 30; // Compatible key = great
  } else {
    score += 5; // Non-compatible = poor
  }

  // BPM compatibility (0-30 points)
  const bpmDiff = Math.abs(mik1.bpm - mik2.bpm);
  if (bpmDiff <= 2) {
    score += 30; // Nearly identical
  } else if (bpmDiff <= 5) {
    score += 25; // Easy transition
  } else if (bpmDiff <= 10) {
    score += 15; // Moderate adjustment
  } else {
    score += 5; // Difficult transition
  }

  // Energy flow (0-20 points)
  const energyDiff = mik2.energy - mik1.energy;
  if (energyDiff >= 0 && energyDiff <= 1) {
    score += 20; // Maintaining or slight build
  } else if (energyDiff > 1 && energyDiff <= 2) {
    score += 15; // Good energy boost
  } else if (energyDiff < 0 && energyDiff >= -1) {
    score += 12; // Slight drop (can be intentional)
  } else {
    score += 5; // Big energy change
  }

  // Artist variety (0-10 points)
  if (track1.artist !== track2.artist) {
    score += 10; // Different artist
  }

  return score;
}

/**
 * Order tracks for optimal harmonic mixing using a greedy algorithm
 */
function orderTracksForMixing(tracks: IndexedAudioFile[]): IndexedAudioFile[] {
  if (tracks.length <= 2) return tracks;

  const ordered: IndexedAudioFile[] = [];
  const remaining = [...tracks];

  // Start with the track that has the most compatible options
  const startScores = remaining.map(track => {
    const compatibleCount = remaining.filter(
      t => t !== track && areKeysCompatible(track.mikData?.key || '', t.mikData?.key || '')
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

    // Score all remaining tracks
    const scored = remaining.map(track => ({
      track,
      score: scoreTransition(current, track)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Pick the best
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
  // Get all tracks with MIK data
  let tracks = getMixableFiles(index);

  console.log(`  📚 Pool: ${tracks.length} tracks with MIK data`);

  // Filter by BPM
  if (constraints.minBPM || constraints.maxBPM) {
    const minBPM = constraints.minBPM || 0;
    const maxBPM = constraints.maxBPM || 999;
    tracks = tracks.filter(t => {
      const bpm = t.mikData?.bpm || 0;
      return bpm >= minBPM && bpm <= maxBPM;
    });
    console.log(`  🎵 After BPM filter (${minBPM}-${maxBPM}): ${tracks.length} tracks`);
  }

  // Filter by key
  if (constraints.preferredKeys && constraints.preferredKeys.length > 0) {
    const keySet = new Set(constraints.preferredKeys);
    // Also add compatible keys
    for (const key of constraints.preferredKeys) {
      const num = parseInt(key);
      const letter = key.slice(-1);
      // Add relative major/minor
      keySet.add(`${num}${letter === 'A' ? 'B' : 'A'}`);
      // Add adjacent keys
      keySet.add(`${num === 1 ? 12 : num - 1}${letter}`);
      keySet.add(`${num === 12 ? 1 : num + 1}${letter}`);
    }
    tracks = tracks.filter(t => keySet.has(t.mikData?.key || ''));
    console.log(`  🔑 After key filter: ${tracks.length} tracks`);
  }

  // Filter by energy
  if (constraints.minEnergy || constraints.maxEnergy) {
    const minEnergy = constraints.minEnergy || 0;
    const maxEnergy = constraints.maxEnergy || 10;
    tracks = tracks.filter(t => {
      const energy = t.mikData?.energy || 0;
      return energy >= minEnergy && energy <= maxEnergy;
    });
    console.log(`  ⚡ After energy filter: ${tracks.length} tracks`);
  }

  // Shuffle for variety
  tracks = tracks.sort(() => Math.random() - 0.5);

  // Determine track count
  let targetCount = constraints.trackCount || 10;
  if (constraints.durationMinutes) {
    // Assume average track is ~4 mins, with 1.5 min overlap per transition
    const avgTrackContribution = 4 - 1.5;
    targetCount = Math.ceil(constraints.durationMinutes / avgTrackContribution);
  }

  // Take tracks up to target count (ensuring minimum variety)
  const selectedArtists = new Set<string>();
  const selected: IndexedAudioFile[] = [];
  const maxPerArtist = 2;

  for (const track of tracks) {
    const artistCount = [...selectedArtists].filter(a => a === track.artist).length;
    if (artistCount < maxPerArtist) {
      selected.push(track);
      selectedArtists.add(track.artist);
      if (selected.length >= targetCount) break;
    }
  }

  console.log(`  🎯 Selected: ${selected.length} tracks`);

  return selected;
}

/**
 * Generate a complete mix from constraints
 */
export async function generateAutoMix(
  constraints: MixConstraints,
  outputPath: string,
  onProgress?: ProgressCallback
): Promise<AutoMixResult> {
  console.log('🎧 Auto Mix Generator');
  console.log('='.repeat(50));

  // Step 1: Load audio library
  onProgress?.('analyzing', 0, 'Loading audio library...');
  console.log('\n📂 Loading audio library...');

  const index = loadAudioLibraryIndex();
  if (!index) {
    // Try building the index
    console.log('  Index not found, building...');
    const { buildAudioLibraryIndex } = await import('./audio-library-indexer');
    buildAudioLibraryIndex();
    const freshIndex = loadAudioLibraryIndex();
    if (!freshIndex) {
      return { success: false, errorMessage: 'Could not load audio library index' };
    }
  }

  const loadedIndex = loadAudioLibraryIndex()!;
  console.log(`  ✓ ${loadedIndex.totalFiles} files indexed`);

  // Step 2: Select tracks based on constraints
  onProgress?.('analyzing', 20, 'Selecting tracks...');
  console.log('\n🎵 Selecting tracks...');

  const selectedTracks = selectTracks(loadedIndex, constraints);

  if (selectedTracks.length < 2) {
    return {
      success: false,
      errorMessage: `Not enough tracks found (${selectedTracks.length}). Try relaxing constraints.`
    };
  }

  // Step 3: Order for optimal transitions
  onProgress?.('analyzing', 30, 'Optimizing track order...');
  console.log('\n🔀 Optimizing track order...');

  const orderedTracks = orderTracksForMixing(selectedTracks);

  console.log('\n📋 Tracklist:');
  orderedTracks.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.artist} - ${t.title} (${t.mikData?.bpm} BPM, ${t.mikData?.key})`);
  });

  // Step 4: Create mix job
  const mixTracks: MixTrack[] = orderedTracks.map(t => ({
    filePath: t.filePath,
    artist: t.artist,
    title: t.title,
    bpm: t.mikData?.bpm || 120,
    camelotKey: t.mikData?.key || '8A',
    energy: t.mikData?.energy || 5,
  }));

  const mixJob: MixJob = {
    id: `auto-mix-${Date.now()}`,
    name: 'Auto Generated Mix',
    tracks: mixTracks,
    outputPath,
    format: path.extname(outputPath).slice(1) as 'mp3' | 'wav' | 'flac',
    quality: 'high',
  };

  // Step 5: Generate mix
  console.log('\n🎛️  Generating mix...');

  const mixResult = await mixPlaylist(mixJob, onProgress);

  if (!mixResult.success) {
    return {
      success: false,
      errorMessage: mixResult.errorMessage,
    };
  }

  // Step 6: Return result
  console.log('\n' + '='.repeat(50));
  console.log('✅ MIX COMPLETE');
  console.log('='.repeat(50));
  console.log(`  Output: ${outputPath}`);
  console.log(`  Duration: ${Math.round((mixResult.duration || 0) / 60)} minutes`);
  console.log(`  Tracks: ${orderedTracks.length}`);
  console.log(`  Transitions: ${mixResult.transitionCount}`);
  console.log(`  Harmonic: ${mixResult.harmonicMixPercentage}%`);

  return {
    success: true,
    outputPath,
    duration: mixResult.duration,
    trackCount: orderedTracks.length,
    tracks: orderedTracks.map(t => ({
      artist: t.artist,
      title: t.title,
      bpm: t.mikData?.bpm || 0,
      key: t.mikData?.key || '',
    })),
  };
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse CLI args
  const constraints: MixConstraints = {
    minBPM: 115,
    maxBPM: 130,
    trackCount: 6,
    minEnergy: 5,
    maxEnergy: 8,
  };

  const outputPath = args[0] || '/Users/tombragg/dj-mix-generator/output/auto-mix.mp3';

  // Parse additional args
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    if (key === '--bpm-min') constraints.minBPM = parseInt(value);
    if (key === '--bpm-max') constraints.maxBPM = parseInt(value);
    if (key === '--tracks') constraints.trackCount = parseInt(value);
    if (key === '--energy-min') constraints.minEnergy = parseInt(value);
    if (key === '--energy-max') constraints.maxEnergy = parseInt(value);
    if (key === '--keys') constraints.preferredKeys = value.split(',');
  }

  console.log('Constraints:', constraints);
  console.log('Output:', outputPath);
  console.log('');

  generateAutoMix(constraints, outputPath).then(result => {
    if (result.success) {
      console.log('\n🎉 Mix generated successfully!');
      process.exit(0);
    } else {
      console.error('\n❌ Mix generation failed:', result.errorMessage);
      process.exit(1);
    }
  });
}
