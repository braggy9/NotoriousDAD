/**
 * Transition Analyzer
 *
 * Analyzes track pairs and generates transition metadata including:
 * - Recommended transition type (blend, cut, echo-out, etc.)
 * - Mix-in/mix-out points (based on track structure)
 * - Effect suggestions
 * - Transition difficulty rating
 */

import { SpotifyTrackWithFeatures, PlaylistTrack } from './types';
import { areKeysCompatible, areBPMsCompatible, scoreTransition } from './camelot-wheel';

// Transition types that can be recommended
export type TransitionType =
  | 'long-blend'      // 16-32 bar smooth crossfade (matching keys/BPMs)
  | 'short-blend'     // 4-8 bar crossfade (slight mismatch)
  | 'cut'             // Hard cut on the one (energy change or key clash)
  | 'echo-out'        // Echo/delay fadeout into next track
  | 'filter-sweep'    // High-pass filter sweep transition
  | 'breakdown-drop'  // Mix during breakdown, drop next track
  | 'backspin'        // DJ backspin effect for energy reset
  | 'double-drop'     // Both tracks hit drop simultaneously
  | 'acapella-intro'; // Vocal over instrumental intro

// Effect suggestions for transitions
export type TransitionEffect =
  | 'reverb-tail'     // Add reverb on outgoing track
  | 'high-pass'       // High-pass filter sweep
  | 'low-pass'        // Low-pass filter sweep
  | 'delay'           // Delay/echo effect
  | 'flanger'         // Flanger sweep
  | 'beat-repeat'     // Beat repeat/stutter
  | 'none';           // Clean transition

// Transition metadata for a track pair
export interface TransitionMetadata {
  fromTrackId: string;
  toTrackId: string;

  // Core recommendations
  transitionType: TransitionType;
  transitionLength: number; // bars (4, 8, 16, 32)
  difficulty: 'easy' | 'medium' | 'hard';

  // Mix points (percentage of track duration, 0-100)
  mixOutPoint: number; // When to start fading out track 1
  mixInPoint: number;  // When track 2 should be audible

  // Effects
  outgoingEffect: TransitionEffect;
  incomingEffect: TransitionEffect;

  // Technical details
  bpmAdjustment: number; // % to adjust incoming track BPM
  keyCompatibility: 'perfect' | 'compatible' | 'clash';

  // Human-readable notes
  notes: string;
  warnings: string[];
}

// Track structure estimates based on genre/energy
interface TrackStructure {
  introLength: number;     // bars
  buildupStart: number;    // % into track
  dropPoint: number;       // % into track
  breakdownStart: number;  // % into track
  outroStart: number;      // % into track
}

/**
 * Estimate track structure based on available metadata
 */
function estimateTrackStructure(track: SpotifyTrackWithFeatures): TrackStructure {
  const energy = track.energy || 0.5;
  const danceability = track.danceability || 0.5;
  const duration = track.duration_ms || 210000; // default 3:30
  const durationMin = duration / 60000;

  // Higher energy tracks tend to have shorter intros
  const introLength = energy > 0.7 ? 8 : energy > 0.5 ? 16 : 32;

  // Electronic/dance tracks have predictable structures
  if (danceability > 0.7) {
    return {
      introLength,
      buildupStart: 15,    // 15% in
      dropPoint: 25,       // 25% in (first drop)
      breakdownStart: 50,  // 50% in (middle breakdown)
      outroStart: 85,      // 85% in
    };
  }

  // More organic/acoustic tracks
  if (energy < 0.4) {
    return {
      introLength: introLength * 2,
      buildupStart: 20,
      dropPoint: 35,
      breakdownStart: 60,
      outroStart: 90,
    };
  }

  // Default structure
  return {
    introLength,
    buildupStart: 18,
    dropPoint: 30,
    breakdownStart: 55,
    outroStart: 87,
  };
}

/**
 * Analyze a transition between two tracks
 */
export function analyzeTransition(
  track1: SpotifyTrackWithFeatures,
  track2: SpotifyTrackWithFeatures
): TransitionMetadata {
  const warnings: string[] = [];

  // Get track data
  const key1 = track1.camelotKey || track1.mikData?.camelotKey || '0A';
  const key2 = track2.camelotKey || track2.mikData?.camelotKey || '0A';
  const bpm1 = track1.tempo || track1.mikData?.bpm || 120;
  const bpm2 = track2.tempo || track2.mikData?.bpm || 120;
  const energy1 = track1.energy || 0.5;
  const energy2 = track2.energy || 0.5;

  // Calculate compatibility
  const keyCompatible = areKeysCompatible(key1, key2);
  const bpmCompatible = areBPMsCompatible(bpm1, bpm2);
  const bpmDiff = Math.abs(bpm1 - bpm2);
  const energyDiff = Math.abs(energy1 - energy2);

  // Determine key compatibility level
  let keyCompatibility: 'perfect' | 'compatible' | 'clash';
  if (key1 === key2) {
    keyCompatibility = 'perfect';
  } else if (keyCompatible) {
    keyCompatibility = 'compatible';
  } else {
    keyCompatibility = 'clash';
    warnings.push(`Key clash: ${key1} → ${key2}`);
  }

  // Calculate BPM adjustment needed
  let bpmAdjustment = 0;
  if (bpm1 !== bpm2 && bpmCompatible) {
    bpmAdjustment = ((bpm2 - bpm1) / bpm1) * 100;
  }
  if (Math.abs(bpmAdjustment) > 4) {
    warnings.push(`BPM adjustment: ${bpmAdjustment.toFixed(1)}%`);
  }

  // Get track structures
  const structure1 = estimateTrackStructure(track1);
  const structure2 = estimateTrackStructure(track2);

  // Determine transition type based on compatibility and energy
  let transitionType: TransitionType;
  let transitionLength: number;
  let difficulty: 'easy' | 'medium' | 'hard';
  let outgoingEffect: TransitionEffect = 'none';
  let incomingEffect: TransitionEffect = 'none';
  let notes = '';

  if (keyCompatibility === 'perfect' && bpmDiff < 2) {
    // Perfect match - long blend
    transitionType = 'long-blend';
    transitionLength = 32;
    difficulty = 'easy';
    notes = 'Perfect harmonic match - use long blend for seamless transition';
  } else if (keyCompatibility !== 'clash' && bpmDiff < 4) {
    // Good match - standard blend
    transitionType = 'long-blend';
    transitionLength = 16;
    difficulty = 'easy';
    outgoingEffect = 'reverb-tail';
    notes = 'Good harmonic compatibility - 16-bar blend recommended';
  } else if (keyCompatibility !== 'clash' && bpmDiff < 8) {
    // Decent match - shorter blend with effects
    transitionType = 'short-blend';
    transitionLength = 8;
    difficulty = 'medium';
    outgoingEffect = 'high-pass';
    incomingEffect = 'low-pass';
    notes = 'Use filter sweep to mask BPM adjustment';
  } else if (energyDiff > 0.3) {
    // Big energy change - cut or breakdown
    if (energy2 > energy1) {
      // Energy increase - breakdown to drop
      transitionType = 'breakdown-drop';
      transitionLength = 8;
      difficulty = 'medium';
      notes = 'Energy increase - mix during breakdown, drop new track';
    } else {
      // Energy decrease - echo out
      transitionType = 'echo-out';
      transitionLength = 4;
      difficulty = 'easy';
      outgoingEffect = 'delay';
      notes = 'Energy decrease - echo out of current track';
    }
  } else if (keyCompatibility === 'clash') {
    // Key clash - quick transition needed
    if (bpmDiff < 3) {
      transitionType = 'filter-sweep';
      transitionLength = 4;
      difficulty = 'medium';
      outgoingEffect = 'high-pass';
      notes = 'Key clash - use filter sweep to disguise';
    } else {
      transitionType = 'cut';
      transitionLength = 1;
      difficulty = 'hard';
      notes = 'Key and BPM clash - hard cut recommended';
      warnings.push('Difficult transition - practice this one');
    }
  } else {
    // Default - short blend
    transitionType = 'short-blend';
    transitionLength = 8;
    difficulty = 'medium';
    notes = 'Standard transition';
  }

  // Calculate mix points
  let mixOutPoint = structure1.outroStart;
  let mixInPoint = 0; // Start of track 2

  // Adjust based on transition type
  if (transitionType === 'breakdown-drop') {
    mixOutPoint = structure1.breakdownStart;
    mixInPoint = structure2.dropPoint - 5; // Just before the drop
  } else if (transitionType === 'long-blend') {
    mixOutPoint = structure1.outroStart - 10;
    mixInPoint = 0;
  } else if (transitionType === 'cut') {
    mixOutPoint = 95;
    mixInPoint = structure2.dropPoint;
  }

  return {
    fromTrackId: track1.id,
    toTrackId: track2.id,
    transitionType,
    transitionLength,
    difficulty,
    mixOutPoint: Math.round(mixOutPoint),
    mixInPoint: Math.round(mixInPoint),
    outgoingEffect,
    incomingEffect,
    bpmAdjustment: Math.round(bpmAdjustment * 10) / 10,
    keyCompatibility,
    notes,
    warnings,
  };
}

/**
 * Generate transition metadata for an entire playlist
 */
export function generatePlaylistTransitions(
  tracks: PlaylistTrack[]
): TransitionMetadata[] {
  const transitions: TransitionMetadata[] = [];

  for (let i = 0; i < tracks.length - 1; i++) {
    const transition = analyzeTransition(tracks[i], tracks[i + 1]);
    transitions.push(transition);
  }

  return transitions;
}

/**
 * Calculate overall mix difficulty
 */
export function calculateMixDifficulty(
  transitions: TransitionMetadata[]
): {
  overall: 'easy' | 'medium' | 'hard';
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  problemTransitions: number[];
} {
  let easyCount = 0;
  let mediumCount = 0;
  let hardCount = 0;
  const problemTransitions: number[] = [];

  transitions.forEach((t, index) => {
    switch (t.difficulty) {
      case 'easy':
        easyCount++;
        break;
      case 'medium':
        mediumCount++;
        break;
      case 'hard':
        hardCount++;
        problemTransitions.push(index);
        break;
    }
  });

  let overall: 'easy' | 'medium' | 'hard';
  if (hardCount > transitions.length * 0.2) {
    overall = 'hard';
  } else if (hardCount + mediumCount > transitions.length * 0.5) {
    overall = 'medium';
  } else {
    overall = 'easy';
  }

  return {
    overall,
    easyCount,
    mediumCount,
    hardCount,
    problemTransitions,
  };
}

/**
 * Generate human-readable mix notes
 */
export function generateMixNotes(
  tracks: PlaylistTrack[],
  transitions: TransitionMetadata[]
): string {
  const lines: string[] = [];
  const difficulty = calculateMixDifficulty(transitions);

  lines.push(`# Mix Recipe`);
  lines.push(`Total tracks: ${tracks.length}`);
  lines.push(`Overall difficulty: ${difficulty.overall.toUpperCase()}`);
  lines.push(`Easy transitions: ${difficulty.easyCount} | Medium: ${difficulty.mediumCount} | Hard: ${difficulty.hardCount}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const artistName = track.artists?.[0]?.name || 'Unknown';
    const bpm = track.tempo || track.mikData?.bpm || '?';
    const key = track.camelotKey || track.mikData?.camelotKey || '?';

    lines.push(`## ${i + 1}. ${track.name}`);
    lines.push(`**${artistName}** | ${bpm} BPM | Key: ${key}`);

    if (i < transitions.length) {
      const t = transitions[i];
      lines.push('');
      lines.push(`### → Transition to next track`);
      lines.push(`- **Type:** ${t.transitionType.replace('-', ' ')}`);
      lines.push(`- **Length:** ${t.transitionLength} bars`);
      lines.push(`- **Difficulty:** ${t.difficulty}`);
      lines.push(`- **Mix out at:** ${t.mixOutPoint}% of track`);

      if (t.outgoingEffect !== 'none') {
        lines.push(`- **Outgoing effect:** ${t.outgoingEffect.replace('-', ' ')}`);
      }
      if (t.incomingEffect !== 'none') {
        lines.push(`- **Incoming effect:** ${t.incomingEffect.replace('-', ' ')}`);
      }
      if (t.bpmAdjustment !== 0) {
        lines.push(`- **BPM adjustment:** ${t.bpmAdjustment > 0 ? '+' : ''}${t.bpmAdjustment}%`);
      }

      lines.push(`- **Notes:** ${t.notes}`);

      if (t.warnings.length > 0) {
        lines.push(`- **⚠️ Warnings:** ${t.warnings.join(', ')}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
