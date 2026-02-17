// Optimize track ordering for automix (djay Pro)

import { SpotifyTrackWithFeatures, PlaylistTrack } from './types';
import { scoreTransition, spotifyToCamelot } from './camelot-wheel';

// Build energy curve for playlist (enhanced with multi-peak curves)
type EnergyCurve =
  | 'build'
  | 'decline'
  | 'wave'
  | 'steady'
  | 'double-peak'      // Valley in middle, peaks at 30% and 80%
  | 'late-peak'        // Build to climax at 85%
  | 'rollercoaster'    // Multiple ups/downs
  | 'plateau-peak';    // Flat warm-up, sustained peak

// Gaussian peak function for smooth curves
const gaussianPeak = (x: number, center: number, width: number): number => {
  return Math.exp(-Math.pow(x - center, 2) / (2 * Math.pow(width, 2)));
};

const getEnergyTarget = (
  position: number,
  totalTracks: number,
  curve: EnergyCurve
): number => {
  const progress = position / (totalTracks - 1); // 0 to 1

  switch (curve) {
    case 'build':
      // Start low, end high (classic warmup set)
      return 0.3 + (progress * 0.6); // 0.3 → 0.9

    case 'decline':
      // Start high, end low (cool-down set)
      return 0.9 - (progress * 0.6); // 0.9 → 0.3

    case 'wave':
      // Single peak in the middle (classic wave)
      return 0.4 + (Math.sin(progress * Math.PI) * 0.5); // 0.4 → 0.9 → 0.4

    case 'double-peak':
      // Two peaks with valley in between (dramatic set structure)
      const peak1 = gaussianPeak(progress, 0.25, 0.10) * 0.4; // Peak at 25%
      const peak2 = gaussianPeak(progress, 0.75, 0.10) * 0.6; // Bigger peak at 75%
      const baseline = 0.3 + (progress * 0.1); // Slight upward baseline
      return baseline + peak1 + peak2; // Result: 0.3 → 0.7 → 0.4 → 0.9 → 0.5

    case 'late-peak':
      // Steady build to climax near the end (festival closing set)
      if (progress < 0.7) {
        // Gradual build for first 70%
        return 0.4 + (progress * 0.3); // 0.4 → 0.61
      } else {
        // Exponential rise to peak at 85%
        const peakProgress = (progress - 0.7) / 0.3; // 0 → 1 over last 30%
        const peakValue = 0.61 + (Math.pow(peakProgress, 1.5) * 0.29); // 0.61 → 0.9
        // Slight decline after 85%
        if (progress > 0.85) {
          const declineProgress = (progress - 0.85) / 0.15;
          return peakValue - (declineProgress * 0.15); // 0.9 → 0.75
        }
        return peakValue;
      }

    case 'rollercoaster':
      // Multiple ups and downs (keeps crowd engaged)
      const wave1 = Math.sin(progress * Math.PI * 2) * 0.15; // First wave
      const wave2 = Math.sin(progress * Math.PI * 3) * 0.10; // Second wave (faster)
      const trend = progress * 0.2; // Slight upward trend
      return 0.5 + wave1 + wave2 + trend; // Result: 0.5 → 0.8 with waves

    case 'plateau-peak':
      // Flat warm-up, then sustained peak (radio show / livestream)
      if (progress < 0.25) {
        return 0.45; // Flat intro (25%)
      } else if (progress < 0.35) {
        // Transition to peak (10%)
        const riseProgress = (progress - 0.25) / 0.10;
        return 0.45 + (riseProgress * 0.35); // 0.45 → 0.8
      } else if (progress < 0.85) {
        return 0.80; // Sustained peak (50%)
      } else {
        // Cool down (15%)
        const coolProgress = (progress - 0.85) / 0.15;
        return 0.80 - (coolProgress * 0.25); // 0.8 → 0.55
      }

    case 'steady':
    default:
      // Maintain consistent energy (background music)
      return 0.6;
  }
};

// Greedy algorithm to order tracks for optimal transitions
export const optimizeTrackOrder = (
  tracks: SpotifyTrackWithFeatures[],
  options: {
    energyCurve?: EnergyCurve;
    prioritizeHarmonic?: boolean;
    prioritizeBPM?: boolean;
  } = {}
): PlaylistTrack[] => {
  const {
    energyCurve = 'wave',
    prioritizeHarmonic = true,
    prioritizeBPM = true,
  } = options;

  if (tracks.length === 0) return [];

  // Enrich tracks with Camelot keys
  const enrichedTracks = tracks.map(track => ({
    ...track,
    camelotKey: track.camelotKey || (
      track.key !== undefined && track.mode !== undefined
        ? spotifyToCamelot(track.key, track.mode)
        : '0A'
    ),
  }));

  const ordered: PlaylistTrack[] = [];
  const remaining = [...enrichedTracks];

  // Pick starting track (closest to target energy for position 0)
  const startEnergyTarget = getEnergyTarget(0, enrichedTracks.length, energyCurve);
  let currentIndex = findClosestEnergyMatch(remaining, startEnergyTarget);
  ordered.push({ ...remaining[currentIndex], position: 0 });
  remaining.splice(currentIndex, 1);

  // Build playlist using greedy best-transition selection
  while (remaining.length > 0) {
    const currentTrack = ordered[ordered.length - 1];
    const targetPosition = ordered.length;
    const energyTarget = getEnergyTarget(targetPosition, enrichedTracks.length, energyCurve);

    let bestScore = -Infinity;
    let bestIndex = 0;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      let score = 0;

      // Transition quality (key + BPM compatibility) - genre-aware
      const transitionScoreResult = scoreTransition(
        {
          camelotKey: currentTrack.camelotKey || '0A',
          bpm: currentTrack.tempo || currentTrack.mikData?.bpm || 120,
          energy: currentTrack.energy,
          genre: (currentTrack as any).genre, // Genre field if available
        },
        {
          camelotKey: candidate.camelotKey || '0A',
          bpm: candidate.tempo || candidate.mikData?.bpm || 120,
          energy: candidate.energy,
          genre: (candidate as any).genre, // Genre field if available
        }
      );

      // Extract total score (handle both old number format and new object format)
      const transitionScore = typeof transitionScoreResult === 'number'
        ? transitionScoreResult
        : transitionScoreResult.total;

      score += transitionScore * (prioritizeHarmonic && prioritizeBPM ? 1.0 : 0.5);

      // Energy curve matching
      const energyDiff = candidate.energy
        ? Math.abs(candidate.energy - energyTarget)
        : 0.5;
      score += (1 - energyDiff) * 30; // Up to 30 points for energy match

      // Danceability bonus (keep energy up)
      if (candidate.danceability) {
        score += candidate.danceability * 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const nextTrack = remaining[bestIndex];
    ordered.push({
      ...nextTrack,
      position: targetPosition,
      transitionScore: bestScore,
    });
    remaining.splice(bestIndex, 1);
  }

  return ordered;
};

// Find track closest to target energy
const findClosestEnergyMatch = (
  tracks: SpotifyTrackWithFeatures[],
  targetEnergy: number
): number => {
  let closestIndex = 0;
  let closestDiff = Infinity;

  for (let i = 0; i < tracks.length; i++) {
    const energy = tracks[i].energy || 0.5;
    const diff = Math.abs(energy - targetEnergy);

    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = i;
    }
  }

  return closestIndex;
};

// Calculate average transition score for a playlist
export const calculatePlaylistQuality = (playlist: PlaylistTrack[]): {
  avgTransitionScore: number;
  harmonicMixPercentage: number;
  bpmCompatibilityPercentage: number;
} => {
  if (playlist.length < 2) {
    return {
      avgTransitionScore: 100,
      harmonicMixPercentage: 100,
      bpmCompatibilityPercentage: 100,
    };
  }

  let totalTransitionScore = 0;
  let harmonicMixes = 0;
  let bpmCompatible = 0;

  for (let i = 0; i < playlist.length - 1; i++) {
    const score = playlist[i + 1].transitionScore || 0;
    totalTransitionScore += score;

    if (score >= 70) harmonicMixes++;
    if (score >= 60) bpmCompatible++;
  }

  const transitions = playlist.length - 1;

  return {
    avgTransitionScore: Math.round(totalTransitionScore / transitions),
    harmonicMixPercentage: Math.round((harmonicMixes / transitions) * 100),
    bpmCompatibilityPercentage: Math.round((bpmCompatible / transitions) * 100),
  };
};
