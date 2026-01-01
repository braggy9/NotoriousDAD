// Optimize track ordering for automix (djay Pro)

import { SpotifyTrackWithFeatures, PlaylistTrack } from './types';
import { scoreTransition, spotifyToCamelot } from './camelot-wheel';

// Build energy curve for playlist
type EnergyCurve = 'build' | 'decline' | 'wave' | 'steady';

const getEnergyTarget = (
  position: number,
  totalTracks: number,
  curve: EnergyCurve
): number => {
  const progress = position / (totalTracks - 1); // 0 to 1

  switch (curve) {
    case 'build':
      // Start low, end high
      return 0.3 + (progress * 0.6); // 0.3 → 0.9

    case 'decline':
      // Start high, end low
      return 0.9 - (progress * 0.6); // 0.9 → 0.3

    case 'wave':
      // Peak in the middle
      return 0.4 + (Math.sin(progress * Math.PI) * 0.5); // 0.4 → 0.9 → 0.4

    case 'steady':
    default:
      // Maintain consistent energy
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

      // Transition quality (key + BPM compatibility)
      const transitionScore = scoreTransition(
        {
          camelotKey: currentTrack.camelotKey || '0A',
          bpm: currentTrack.tempo || currentTrack.mikData?.bpm || 120,
          energy: currentTrack.energy,
        },
        {
          camelotKey: candidate.camelotKey || '0A',
          bpm: candidate.tempo || candidate.mikData?.bpm || 120,
          energy: candidate.energy,
        }
      );

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
