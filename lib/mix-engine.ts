import type { MixTrack, MixPlan, Transition, TransitionType } from "./mix-types";
import { isHarmonicMatch, keyDistance } from "./camelot";

/**
 * Scores compatibility between two tracks (higher = better pair).
 * Factors: key compatibility, BPM proximity, energy flow.
 */
function pairScore(a: MixTrack, b: MixTrack): number {
  let score = 0;

  // Key compatibility (0-40 points)
  if (a.camelotKey && b.camelotKey) {
    const dist = keyDistance(a.camelotKey, b.camelotKey);
    if (dist === 0) score += 40;      // Same key — perfect
    else if (dist === 1) score += 30;  // Compatible neighbor
    else if (dist === 2) score += 10;  // Tolerable
    // dist > 2 = 0 points (clash)
  }

  // BPM proximity (0-35 points)
  if (a.bpm && b.bpm) {
    const bpmDiff = Math.abs(a.bpm - b.bpm);
    if (bpmDiff <= 2) score += 35;
    else if (bpmDiff <= 5) score += 28;
    else if (bpmDiff <= 10) score += 18;
    else if (bpmDiff <= 15) score += 8;
    // > 15 BPM gap = 0 points
  }

  // Smooth energy flow (0-25 points) — small step up preferred
  if (a.energy !== undefined && b.energy !== undefined) {
    const diff = b.energy - a.energy;
    if (diff >= 0 && diff <= 0.15) score += 25;       // Gentle build
    else if (diff >= -0.1 && diff <= 0.25) score += 18; // Moderate change
    else if (Math.abs(diff) <= 0.35) score += 8;        // Noticeable jump
    // > 0.35 gap = 0 points
  }

  return score;
}

/**
 * Orders tracks for optimal DJ flow.
 *
 * 1. Build weighted compatibility graph
 * 2. Start from lowest-energy track (warm-up)
 * 3. Nearest-neighbor greedy traversal
 * 4. 2-opt local optimization for smoother arc
 * 5. Enforce no adjacent same-artist
 */
export function orderTracks(tracks: MixTrack[]): MixTrack[] {
  if (tracks.length <= 2) return [...tracks];

  // Start with the lowest-energy track
  const sorted = [...tracks];
  let startIdx = 0;
  let lowestEnergy = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i].energy ?? 0.5;
    if (e < lowestEnergy) {
      lowestEnergy = e;
      startIdx = i;
    }
  }

  // Nearest-neighbor traversal
  const ordered: MixTrack[] = [sorted[startIdx]];
  const remaining = new Set(sorted.filter((_, i) => i !== startIdx));

  while (remaining.size > 0) {
    const current = ordered[ordered.length - 1];
    let bestTrack: MixTrack | null = null;
    let bestScore = -1;

    for (const candidate of remaining) {
      // Penalize same artist adjacency
      const artistPenalty =
        candidate.artists[0] === current.artists[0] ? 50 : 0;
      const score = pairScore(current, candidate) - artistPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestTrack = candidate;
      }
    }

    if (bestTrack) {
      ordered.push(bestTrack);
      remaining.delete(bestTrack);
    }
  }

  // 2-opt local optimization — swap pairs to improve total score
  let improved = true;
  const maxPasses = 50;
  let passes = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;

    for (let i = 1; i < ordered.length - 2; i++) {
      for (let j = i + 1; j < ordered.length - 1; j++) {
        const currentScore =
          pairScore(ordered[i - 1], ordered[i]) +
          pairScore(ordered[j], ordered[j + 1]);
        const swapScore =
          pairScore(ordered[i - 1], ordered[j]) +
          pairScore(ordered[i], ordered[j + 1]);

        if (swapScore > currentScore) {
          // Reverse the segment between i and j
          const segment = ordered.slice(i, j + 1).reverse();
          for (let k = 0; k < segment.length; k++) {
            ordered[i + k] = segment[k];
          }
          improved = true;
        }
      }
    }
  }

  // Final pass: fix any same-artist adjacency
  for (let i = 0; i < ordered.length - 1; i++) {
    if (ordered[i].artists[0] === ordered[i + 1].artists[0]) {
      // Find nearest non-same-artist track to swap with
      for (let j = i + 2; j < ordered.length; j++) {
        if (
          ordered[j].artists[0] !== ordered[i].artists[0] &&
          (i === 0 || ordered[j].artists[0] !== ordered[i - 1].artists[0])
        ) {
          [ordered[i + 1], ordered[j]] = [ordered[j], ordered[i + 1]];
          break;
        }
      }
    }
  }

  return ordered;
}

/**
 * Selects the best transition technique for a track pair based on
 * key compatibility, BPM gap, energy difference, and genre similarity.
 */
export function selectTransition(
  from: MixTrack,
  to: MixTrack
): TransitionType {
  const keyMatch =
    from.camelotKey && to.camelotKey
      ? isHarmonicMatch(from.camelotKey, to.camelotKey)
      : false;
  const bpmGap =
    from.bpm && to.bpm ? Math.abs(from.bpm - to.bpm) : 0;
  const energyGap =
    from.energy !== undefined && to.energy !== undefined
      ? Math.abs(from.energy - to.energy)
      : 0;

  // Key match + similar BPM → harmonic blend (highest quality)
  if (keyMatch && bpmGap <= 5) return "harmonic_blend";

  // Key match + moderate BPM gap → EQ swap (bass swap masks tempo shift)
  if (keyMatch && bpmGap > 5 && bpmGap <= 15) return "eq_swap";

  // Big energy jump → drop (dramatic, works with contrast)
  if (energyGap > 0.3) return "drop";

  // Large BPM gap → echo out (echo fadeout masks tempo change)
  if (bpmGap > 15) return "echo_out";

  // Moderate mismatch → filter sweep (smooth bridge)
  if (!keyMatch && bpmGap > 5) return "filter_sweep";

  // Default → crossfade
  return "crossfade";
}

/**
 * Calculates mix-in and mix-out points for a transition.
 * Uses bar-based timing (4 beats per bar).
 */
export function calculateMixPoints(
  from: MixTrack,
  to: MixTrack,
  transitionType: TransitionType
): { mixOutPoint: number; mixInPoint: number; duration: number } {
  const fromBpm = from.bpm || 120;
  const toBpm = to.bpm || 120;

  // Seconds per bar (4 beats / BPM * 60)
  const fromBarLength = (4 / fromBpm) * 60;
  const toBarLength = (4 / toBpm) * 60;

  const fromDurationSec = from.duration_ms / 1000;

  // Determine transition length in bars based on energy and type
  const avgEnergy = ((from.energy ?? 0.5) + (to.energy ?? 0.5)) / 2;
  let outBars: number;
  let inBars: number;

  if (transitionType === "drop") {
    // Drops are short and sharp
    outBars = 4;
    inBars = 1;
  } else if (avgEnergy > 0.75) {
    // High energy = shorter transitions
    outBars = 8;
    inBars = 4;
  } else if (avgEnergy < 0.35) {
    // Low energy = longer, smoother transitions
    outBars = 32;
    inBars = 16;
  } else {
    // Default: 16 bars out, 8 bars in
    outBars = 16;
    inBars = 8;
  }

  const duration = outBars * fromBarLength;
  const mixOutPoint = Math.max(0, fromDurationSec - outBars * fromBarLength);
  const mixInPoint = inBars * toBarLength;

  return { mixOutPoint, duration, mixInPoint };
}

/**
 * Builds a complete MixPlan from an array of tracks.
 * Handles ordering, transition selection, and mix point calculation.
 */
export function buildMixPlan(rawTracks: MixTrack[]): MixPlan {
  if (rawTracks.length === 0) {
    return {
      id: generateId(),
      tracks: [],
      transitions: [],
      totalDuration: 0,
      energyArc: [],
    };
  }

  const tracks = orderTracks(rawTracks);
  const transitions: Transition[] = [];

  for (let i = 0; i < tracks.length - 1; i++) {
    const from = tracks[i];
    const to = tracks[i + 1];

    const type = selectTransition(from, to);
    const { mixOutPoint, mixInPoint, duration } = calculateMixPoints(
      from,
      to,
      type
    );

    const bpmAdjustment =
      from.bpm && to.bpm ? to.bpm - from.bpm : 0;

    const notes = buildTransitionNotes(from, to, type);

    transitions.push({
      fromTrackId: from.id,
      toTrackId: to.id,
      type,
      duration,
      mixOutPoint,
      mixInPoint,
      bpmAdjustment,
      notes,
    });
  }

  // Calculate total duration (sum of track durations minus overlap)
  let totalDuration = 0;
  for (let i = 0; i < tracks.length; i++) {
    totalDuration += tracks[i].duration_ms / 1000;
    if (i < transitions.length) {
      totalDuration -= transitions[i].duration;
    }
  }

  const energyArc = tracks.map((t) => t.energy ?? 0.5);

  return {
    id: generateId(),
    tracks,
    transitions,
    totalDuration: Math.max(0, totalDuration),
    energyArc,
  };
}

/** Recalculates transitions for an already-ordered track list (after drag-and-drop). */
export function recalcTransitions(tracks: MixTrack[]): {
  transitions: Transition[];
  totalDuration: number;
  energyArc: number[];
} {
  const transitions: Transition[] = [];

  for (let i = 0; i < tracks.length - 1; i++) {
    const from = tracks[i];
    const to = tracks[i + 1];
    const type = selectTransition(from, to);
    const { mixOutPoint, mixInPoint, duration } = calculateMixPoints(from, to, type);

    transitions.push({
      fromTrackId: from.id,
      toTrackId: to.id,
      type,
      duration,
      mixOutPoint,
      mixInPoint,
      bpmAdjustment: from.bpm && to.bpm ? to.bpm - from.bpm : 0,
      notes: buildTransitionNotes(from, to, type),
    });
  }

  let totalDuration = 0;
  for (let i = 0; i < tracks.length; i++) {
    totalDuration += tracks[i].duration_ms / 1000;
    if (i < transitions.length) {
      totalDuration -= transitions[i].duration;
    }
  }

  return {
    transitions,
    totalDuration: Math.max(0, totalDuration),
    energyArc: tracks.map((t) => t.energy ?? 0.5),
  };
}

function buildTransitionNotes(
  from: MixTrack,
  to: MixTrack,
  type: TransitionType
): string {
  const parts: string[] = [];

  if (from.camelotKey && to.camelotKey) {
    if (from.camelotKey === to.camelotKey) {
      parts.push(`Same key (${from.camelotKey})`);
    } else if (isHarmonicMatch(from.camelotKey, to.camelotKey)) {
      parts.push(`Harmonic: ${from.camelotKey} → ${to.camelotKey}`);
    } else {
      parts.push(`Key clash: ${from.camelotKey} → ${to.camelotKey}`);
    }
  }

  if (from.bpm && to.bpm) {
    const diff = to.bpm - from.bpm;
    if (diff !== 0) {
      parts.push(`BPM ${diff > 0 ? "+" : ""}${diff}`);
    }
  }

  const typeLabels: Record<TransitionType, string> = {
    crossfade: "Standard crossfade",
    eq_swap: "EQ bass swap — cut lows on outgoing, boost on incoming",
    filter_sweep: "Filter sweep — lowpass out, highpass in",
    echo_out: "Echo fadeout — masks tempo change",
    drop: "Hard drop — dramatic energy shift",
    harmonic_blend: "Long harmonic blend — smooth key-matched transition",
  };
  parts.push(typeLabels[type]);

  return parts.join(". ");
}

function generateId(): string {
  return `mix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
