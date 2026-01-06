/**
 * AI-Powered Transition Optimizer
 *
 * Uses AI to analyze tracks and find optimal mix points by:
 * 1. Detecting song structure (intro, verse, buildup, drop, breakdown, outro)
 * 2. Finding the best transition points based on energy matching
 * 3. Recommending transition types (long blend, cut, filter sweep, etc.)
 * 4. Calculating optimal crossfade duration
 *
 * Works with the beat-analyzer for low-level audio analysis.
 */

import * as fs from 'fs';
import * as path from 'path';
import { TrackAnalysis, TrackSegment, analyzeTrack } from './beat-analyzer';
import { MixTrack } from './mix-engine';
import Anthropic from '@anthropic-ai/sdk';

export interface TransitionRecommendation {
  // Timing
  track1MixOut: number; // Seconds into track1 to start mixing out
  track2MixIn: number; // Seconds into track2 to start (usually 0 or after intro)
  crossfadeDuration: number; // Seconds for crossfade

  // Type
  transitionType: 'long-blend' | 'short-blend' | 'cut' | 'filter-sweep' | 'echo-out' | 'breakdown-drop';

  // Quality
  score: number; // 0-100 compatibility score
  reason: string; // Human-readable explanation

  // Effects
  useEQSwap: boolean; // Swap bass frequencies during transition
  useLowPassSweep: boolean; // Apply filter sweep on outgoing track
}

export interface OptimizedMixPlan {
  tracks: MixTrack[];
  transitions: TransitionRecommendation[];
  totalDuration: number;
  avgTransitionScore: number;
  harmonicPercentage: number;
}

/**
 * Analyze energy difference between track end and track start
 */
function calculateEnergyMatch(
  track1Analysis: TrackAnalysis,
  track2Analysis: TrackAnalysis,
  track1MixOut: number,
  track2MixIn: number
): number {
  // Sample energy at mix points
  const track1Index = Math.floor(track1MixOut * track1Analysis.energySampleRate);
  const track2Index = Math.floor(track2MixIn * track2Analysis.energySampleRate);

  const energy1 = track1Analysis.energyCurve[track1Index] || 0.5;
  const energy2 = track2Analysis.energyCurve[track2Index] || 0.5;

  // Perfect match = 100, opposite = 0
  const diff = Math.abs(energy1 - energy2);
  return Math.round((1 - diff) * 100);
}

/**
 * Find the best segment to mix out from track1
 */
function findBestMixOutPoint(analysis: TrackAnalysis): { time: number; segment: TrackSegment | null } {
  // Priority: breakdown > outro > last drop end
  const breakdown = analysis.segments.find((s) => s.type === 'breakdown');
  if (breakdown) {
    return { time: breakdown.startTime, segment: breakdown };
  }

  const outro = analysis.segments.find((s) => s.type === 'outro');
  if (outro) {
    return { time: outro.startTime, segment: outro };
  }

  // Fall back to 85% through the track
  return { time: analysis.duration * 0.85, segment: null };
}

/**
 * Find the best segment to mix into track2
 */
function findBestMixInPoint(analysis: TrackAnalysis): { time: number; segment: TrackSegment | null } {
  // Priority: after intro, at first buildup
  const intro = analysis.segments.find((s) => s.type === 'intro');
  if (intro) {
    return { time: intro.endTime, segment: intro };
  }

  const buildup = analysis.segments.find((s) => s.type === 'buildup');
  if (buildup) {
    return { time: buildup.startTime, segment: buildup };
  }

  // Start from beginning
  return { time: 0, segment: null };
}

/**
 * Calculate optimal crossfade duration based on BPM and segment type
 */
function calculateCrossfadeDuration(
  bpm: number,
  outSegment: TrackSegment | null,
  inSegment: TrackSegment | null
): number {
  const beatsPerBar = 4;
  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = beatsPerBar * secondsPerBeat;

  // Default: 16 bars
  let bars = 16;

  // Adjust based on segment types
  if (outSegment?.type === 'breakdown' && inSegment?.type === 'buildup') {
    // Perfect match: long blend
    bars = 32;
  } else if (outSegment?.type === 'drop' || inSegment?.type === 'drop') {
    // Quick transition for drops
    bars = 8;
  } else if (outSegment?.type === 'outro' && inSegment?.type === 'intro') {
    // Standard outro-intro blend
    bars = 16;
  }

  // Cap at 55 seconds (FFmpeg limit is 60)
  return Math.min(bars * secondsPerBar, 55);
}

/**
 * Determine transition type based on segment analysis
 */
function determineTransitionType(
  outSegment: TrackSegment | null,
  inSegment: TrackSegment | null,
  energyMatch: number
): TransitionRecommendation['transitionType'] {
  // Breakdown to buildup = filter sweep
  if (outSegment?.type === 'breakdown' && inSegment?.type === 'buildup') {
    return 'filter-sweep';
  }

  // High energy difference = short blend or cut
  if (energyMatch < 50) {
    return 'short-blend';
  }

  // Outro to intro = long blend
  if (outSegment?.type === 'outro' && inSegment?.type === 'intro') {
    return 'long-blend';
  }

  // Drop transitions
  if (inSegment?.type === 'drop') {
    return 'breakdown-drop';
  }

  // Default
  return 'long-blend';
}

/**
 * Check Camelot key compatibility
 */
function checkKeyCompatibility(key1: string, key2: string): boolean {
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
 * Generate AI-powered transition recommendation between two tracks
 */
export async function optimizeTransition(
  track1: MixTrack,
  track2: MixTrack,
  track1Analysis?: TrackAnalysis | null,
  track2Analysis?: TrackAnalysis | null
): Promise<TransitionRecommendation> {
  // Analyze tracks if not already done
  if (!track1Analysis) {
    track1Analysis = await analyzeTrack(track1.filePath, track1.bpm);
  }
  if (!track2Analysis) {
    track2Analysis = await analyzeTrack(track2.filePath, track2.bpm);
  }

  // Find optimal mix points
  const mixOut = findBestMixOutPoint(track1Analysis!);
  const mixIn = findBestMixInPoint(track2Analysis!);

  // Calculate energy match
  const energyMatch = calculateEnergyMatch(
    track1Analysis!,
    track2Analysis!,
    mixOut.time,
    mixIn.time
  );

  // Average BPM for crossfade calculation
  const avgBPM = (track1.bpm + track2.bpm) / 2;

  // Calculate crossfade duration
  const crossfadeDuration = calculateCrossfadeDuration(avgBPM, mixOut.segment, mixIn.segment);

  // Determine transition type
  const transitionType = determineTransitionType(mixOut.segment, mixIn.segment, energyMatch);

  // Check harmonic compatibility
  const isHarmonic = checkKeyCompatibility(track1.camelotKey, track2.camelotKey);

  // Calculate overall score
  let score = energyMatch;
  if (isHarmonic) score += 20;
  if (Math.abs(track1.bpm - track2.bpm) <= 3) score += 10;
  score = Math.min(100, score);

  // Build reason
  const reasons: string[] = [];
  if (isHarmonic) reasons.push(`Harmonic: ${track1.camelotKey} -> ${track2.camelotKey}`);
  if (mixOut.segment) reasons.push(`Mix out at ${mixOut.segment.type}`);
  if (mixIn.segment) reasons.push(`Mix in at ${mixIn.segment.type}`);
  reasons.push(`Energy match: ${energyMatch}%`);

  return {
    track1MixOut: mixOut.time,
    track2MixIn: mixIn.time,
    crossfadeDuration,
    transitionType,
    score,
    reason: reasons.join('. '),
    useEQSwap: transitionType === 'long-blend',
    useLowPassSweep: transitionType === 'filter-sweep',
  };
}

/**
 * Optimize an entire mix plan with AI
 */
export async function optimizeMixPlan(tracks: MixTrack[]): Promise<OptimizedMixPlan> {
  console.log('🧠 AI Transition Optimizer');
  console.log('='.repeat(50));

  // Analyze all tracks
  console.log('\n📊 Analyzing tracks for structure...');
  const analyses: (TrackAnalysis | null)[] = [];
  for (const track of tracks) {
    const analysis = await analyzeTrack(track.filePath, track.bpm);
    analyses.push(analysis);
    if (analysis) {
      const segments = analysis.segments.map((s) => s.type).join(' -> ');
      console.log(`  ${track.title}: ${segments || 'No segments detected'}`);
    }
  }

  // Generate transition recommendations
  console.log('\n🔗 Optimizing transitions...');
  const transitions: TransitionRecommendation[] = [];
  let totalScore = 0;
  let harmonicCount = 0;

  for (let i = 0; i < tracks.length - 1; i++) {
    const recommendation = await optimizeTransition(
      tracks[i],
      tracks[i + 1],
      analyses[i],
      analyses[i + 1]
    );
    transitions.push(recommendation);
    totalScore += recommendation.score;

    if (checkKeyCompatibility(tracks[i].camelotKey, tracks[i + 1].camelotKey)) {
      harmonicCount++;
    }

    console.log(
      `  ${i + 1}. ${tracks[i].title} -> ${tracks[i + 1].title}`
    );
    console.log(
      `     Type: ${recommendation.transitionType}, Score: ${recommendation.score}/100`
    );
    console.log(`     ${recommendation.reason}`);
  }

  // Calculate total duration (approximate)
  let totalDuration = 0;
  for (let i = 0; i < tracks.length; i++) {
    const analysis = analyses[i];
    if (analysis) {
      if (i === 0) {
        // First track: from start to mix out
        totalDuration += transitions[0]?.track1MixOut || analysis.duration * 0.85;
      } else if (i === tracks.length - 1) {
        // Last track: from mix in to end
        const lastTransition = transitions[transitions.length - 1];
        totalDuration += analysis.duration - (lastTransition?.track2MixIn || 0);
      } else {
        // Middle tracks: mix in to mix out (minus crossfade overlap)
        const prevTransition = transitions[i - 1];
        const currTransition = transitions[i];
        const playTime =
          (currTransition?.track1MixOut || analysis.duration * 0.85) -
          (prevTransition?.track2MixIn || 0);
        totalDuration += playTime - (prevTransition?.crossfadeDuration || 0);
      }
    }
  }

  const avgScore = transitions.length > 0 ? totalScore / transitions.length : 0;
  const harmonicPercentage =
    transitions.length > 0 ? Math.round((harmonicCount / transitions.length) * 100) : 0;

  console.log('\n' + '='.repeat(50));
  console.log('📊 MIX PLAN SUMMARY');
  console.log('='.repeat(50));
  console.log(`  Tracks: ${tracks.length}`);
  console.log(`  Transitions: ${transitions.length}`);
  console.log(`  Avg Transition Score: ${avgScore.toFixed(0)}/100`);
  console.log(`  Harmonic Transitions: ${harmonicPercentage}%`);
  console.log(`  Est. Duration: ${Math.round(totalDuration / 60)} minutes`);

  return {
    tracks,
    transitions,
    totalDuration,
    avgTransitionScore: avgScore,
    harmonicPercentage,
  };
}

/**
 * CLI for testing
 */
if (require.main === module) {
  const testTracks: MixTrack[] = [
    {
      filePath:
        '/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed/01 Always.m4a',
      artist: 'Disko Junkie',
      title: 'Always',
      bpm: 121,
      camelotKey: '8A',
      energy: 7,
    },
    {
      filePath:
        '/Users/tombragg/Library/Mobile Documents/com~apple~CloudDocs/DJ Music/2-MIK-Analyzed/02 My People.m4a',
      artist: 'Basement Birds',
      title: 'My People',
      bpm: 120.6,
      camelotKey: '9A',
      energy: 6,
    },
  ];

  optimizeMixPlan(testTracks).then((plan) => {
    console.log('\n✅ Mix plan optimized!');
  });
}
