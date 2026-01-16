/**
 * Mashup Generator - Find compatible track pairs for simultaneous playback
 *
 * Unlike sequential mixing (transitions), mashups play 2+ tracks simultaneously.
 * Requirements:
 * 1. Harmonic compatibility (Camelot wheel)
 * 2. BPM within ±6% (or exactly matching after tempo adjustment)
 * 3. Complementary frequency content (vocals vs instrumental)
 * 4. Similar energy levels
 */

import { areKeysCompatible, getCompatibleKeys } from './camelot-wheel';

export type CamelotKey = string; // e.g., "8A", "12B"

export interface MashupableTrack {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  camelotKey: CamelotKey;
  energy: number;

  // Spotify audio features (for frequency/tonality analysis)
  acousticness?: number;
  instrumentalness?: number; // High = instrumental, Low = vocal-heavy
  speechiness?: number;
  danceability?: number;
  valence?: number;
}

export interface MashupPair {
  track1: MashupableTrack;
  track2: MashupableTrack;
  compatibility: MashupCompatibility;
  mixingNotes: string[];
}

export interface MashupCompatibility {
  overallScore: number; // 0-100
  harmonicScore: number; // 0-40 (based on Camelot wheel)
  bpmScore: number; // 0-30 (BPM proximity)
  energyScore: number; // 0-15 (energy matching)
  spectrumScore: number; // 0-15 (complementary frequencies)
  difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * Find mashup-compatible pairs from a track pool
 */
export function findMashupPairs(
  tracks: MashupableTrack[],
  options: {
    minCompatibilityScore?: number; // Default: 70
    maxBPMDifference?: number; // Default: 6% (~8 BPM at 128)
    requireComplementarySpectrum?: boolean; // Default: true
  } = {}
): MashupPair[] {
  const {
    minCompatibilityScore = 70,
    maxBPMDifference = 0.06, // 6%
    requireComplementarySpectrum = true
  } = options;

  const pairs: MashupPair[] = [];

  // Compare each track with every other track
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const track1 = tracks[i];
      const track2 = tracks[j];

      const compatibility = calculateMashupCompatibility(track1, track2, {
        maxBPMDifference,
        requireComplementarySpectrum
      });

      if (compatibility.overallScore >= minCompatibilityScore) {
        const mixingNotes = generateMixingNotes(track1, track2, compatibility);

        pairs.push({
          track1,
          track2,
          compatibility,
          mixingNotes
        });
      }
    }
  }

  // Sort by compatibility score (highest first)
  return pairs.sort((a, b) => b.compatibility.overallScore - a.compatibility.overallScore);
}

/**
 * Calculate mashup compatibility between two tracks
 */
function calculateMashupCompatibility(
  track1: MashupableTrack,
  track2: MashupableTrack,
  options: {
    maxBPMDifference: number;
    requireComplementarySpectrum: boolean;
  }
): MashupCompatibility {
  // 1. Harmonic Score (0-40 points)
  const harmonicScore = calculateHarmonicScore(track1.camelotKey, track2.camelotKey);

  // 2. BPM Score (0-30 points)
  const bpmScore = calculateBPMScore(track1.bpm, track2.bpm, options.maxBPMDifference);

  // 3. Energy Score (0-15 points)
  const energyScore = calculateEnergyScore(track1.energy, track2.energy);

  // 4. Spectrum Score (0-15 points) - Are the tracks complementary?
  const spectrumScore = calculateSpectrumScore(track1, track2, options.requireComplementarySpectrum);

  const overallScore = harmonicScore + bpmScore + energyScore + spectrumScore;

  // Determine difficulty
  let difficulty: 'easy' | 'medium' | 'hard';
  if (overallScore >= 85) difficulty = 'easy';
  else if (overallScore >= 70) difficulty = 'medium';
  else difficulty = 'hard';

  return {
    overallScore,
    harmonicScore,
    bpmScore,
    energyScore,
    spectrumScore,
    difficulty
  };
}

/**
 * Harmonic compatibility using Camelot wheel (same logic as transitions)
 */
function calculateHarmonicScore(key1: CamelotKey, key2: CamelotKey): number {
  if (!key1 || !key2 || key1 === '0A' || key2 === '0A') return 0;

  // Perfect match (same key)
  if (key1 === key2) return 40;

  // Check if keys are compatible using existing function
  if (areKeysCompatible(key1, key2)) return 30;

  // Energy boost (+7 move) - valid but jarring for mashups
  const fromNum = parseInt(key1.slice(0, -1));
  const toNum = parseInt(key2.slice(0, -1));
  const fromLetter = key1.slice(-1);
  const toLetter = key2.slice(-1);

  if (fromLetter === toLetter && Math.abs(fromNum - toNum) === 7) {
    return 20; // Possible but challenging
  }

  // Not harmonically compatible
  return 0;
}

/**
 * BPM compatibility - must be within acceptable range or exactly matching
 */
function calculateBPMScore(bpm1: number, bpm2: number, maxDiff: number): number {
  const diff = Math.abs(bpm1 - bpm2);
  const maxAbsoluteDiff = Math.max(bpm1, bpm2) * maxDiff;

  // Perfect BPM match
  if (diff < 0.5) return 30;

  // Within 2 BPM
  if (diff <= 2) return 28;

  // Within 4 BPM
  if (diff <= 4) return 25;

  // Within acceptable percentage
  if (diff <= maxAbsoluteDiff) return 20;

  // Half/double time relationship
  if (Math.abs(bpm1 - bpm2 * 2) < 1 || Math.abs(bpm2 - bpm1 * 2) < 1) {
    return 25; // Half-time mashups are cool
  }

  // Too far apart
  return 0;
}

/**
 * Energy matching - should be similar for cohesive mashups
 */
function calculateEnergyScore(energy1: number, energy2: number): number {
  const diff = Math.abs(energy1 - energy2);

  if (diff < 0.1) return 15; // Very similar energy
  if (diff < 0.2) return 12; // Close energy
  if (diff < 0.3) return 8;  // Moderate difference
  return 0; // Too different
}

/**
 * Spectrum compatibility - one track should be vocal-heavy, other instrumental
 * This prevents frequency masking and creates space for both tracks
 */
function calculateSpectrumScore(
  track1: MashupableTrack,
  track2: MashupableTrack,
  requireComplementary: boolean
): number {
  // If we don't have Spotify features, skip this check
  if (!track1.instrumentalness || !track2.instrumentalness) {
    return requireComplementary ? 0 : 10; // Neutral score if data missing
  }

  const inst1 = track1.instrumentalness;
  const inst2 = track2.instrumentalness;

  // Perfect mashup: one instrumental (>0.7), one vocal (<0.3)
  if ((inst1 > 0.7 && inst2 < 0.3) || (inst2 > 0.7 && inst1 < 0.3)) {
    return 15; // Ideal complementary spectrum
  }

  // Good mashup: one instrumental (>0.5), one vocal (<0.4)
  if ((inst1 > 0.5 && inst2 < 0.4) || (inst2 > 0.5 && inst1 < 0.4)) {
    return 12;
  }

  // Moderate: some difference in instrumentalness
  if (Math.abs(inst1 - inst2) > 0.3) {
    return 8;
  }

  // Poor: both tracks are similar (both vocal or both instrumental)
  // This can work but requires careful EQ mixing
  if (requireComplementary) {
    return 0;
  } else {
    return 5; // Possible but challenging
  }
}

/**
 * Generate mixing notes for a mashup pair
 */
function generateMixingNotes(
  track1: MashupableTrack,
  track2: MashupableTrack,
  compatibility: MashupCompatibility
): string[] {
  const notes: string[] = [];

  // BPM adjustment needed?
  const bpmDiff = Math.abs(track1.bpm - track2.bpm);
  if (bpmDiff > 0.5) {
    const slower = track1.bpm < track2.bpm ? track1 : track2;
    const faster = track1.bpm < track2.bpm ? track2 : track1;
    const adjustment = ((faster.bpm - slower.bpm) / slower.bpm * 100).toFixed(1);
    notes.push(`Adjust ${slower.name} tempo by +${adjustment}% to match ${faster.name}`);
  }

  // Harmonic considerations
  if (compatibility.harmonicScore === 40) {
    notes.push(`Perfect harmonic match (${track1.camelotKey}) - play throughout entire tracks`);
  } else if (compatibility.harmonicScore === 30) {
    notes.push(`Harmonically compatible (${track1.camelotKey} → ${track2.camelotKey}) - smooth blend`);
  } else if (compatibility.harmonicScore === 20) {
    notes.push(`Energy boost mashup - use during peak moments for dramatic effect`);
  }

  // Spectrum/frequency advice
  if (track1.instrumentalness && track2.instrumentalness) {
    const instrumental = track1.instrumentalness > track2.instrumentalness ? track1 : track2;
    const vocal = track1.instrumentalness > track2.instrumentalness ? track2 : track1;

    if (instrumental.instrumentalness > 0.7) {
      notes.push(`Layer ${vocal.name} vocals over ${instrumental.name} instrumental`);
      notes.push(`Use high-pass filter on ${vocal.name} (cut bass below 250Hz)`);
      notes.push(`Keep ${instrumental.name} at full frequency range for foundation`);
    }
  }

  // Energy considerations
  const energyDiff = Math.abs(track1.energy - track2.energy);
  if (energyDiff < 0.1) {
    notes.push(`Matched energy levels - blend at equal volumes`);
  } else if (energyDiff < 0.2) {
    const higher = track1.energy > track2.energy ? track1 : track2;
    notes.push(`${higher.name} has higher energy - use as primary track, blend other for texture`);
  }

  // Difficulty warnings
  if (compatibility.difficulty === 'hard') {
    notes.push(`⚠️ ADVANCED: This mashup is challenging - requires careful EQ and volume balancing`);
  }

  return notes;
}

/**
 * Filter tracks to find the best mashup partner for a specific track
 */
export function findBestMashupPartner(
  track: MashupableTrack,
  candidates: MashupableTrack[],
  options: {
    minCompatibilityScore?: number;
    maxBPMDifference?: number;
  } = {}
): MashupPair | null {
  const pairs = findMashupPairs([track, ...candidates], options);

  // Find the best pair that includes our target track
  const matchingPairs = pairs.filter(
    p => p.track1.id === track.id || p.track2.id === track.id
  );

  return matchingPairs.length > 0 ? matchingPairs[0] : null;
}

/**
 * Generate mashup sets for a playlist (groups of 2-3 compatible tracks)
 */
export function generateMashupSets(
  tracks: MashupableTrack[],
  options: {
    setSize?: 2 | 3; // Number of tracks per mashup
    minCompatibilityScore?: number;
  } = {}
): MashupPair[][] {
  const { setSize = 2, minCompatibilityScore = 75 } = options;

  const sets: MashupPair[][] = [];
  const usedTracks = new Set<string>();

  const pairs = findMashupPairs(tracks, { minCompatibilityScore });

  for (const pair of pairs) {
    // Skip if either track is already used
    if (usedTracks.has(pair.track1.id) || usedTracks.has(pair.track2.id)) {
      continue;
    }

    if (setSize === 2) {
      sets.push([pair]);
      usedTracks.add(pair.track1.id);
      usedTracks.add(pair.track2.id);
    } else {
      // For 3-track mashups, find a third compatible track
      // (This is more complex - would need to check triple compatibility)
      // For now, just do pairs
      sets.push([pair]);
      usedTracks.add(pair.track1.id);
      usedTracks.add(pair.track2.id);
    }
  }

  return sets;
}
