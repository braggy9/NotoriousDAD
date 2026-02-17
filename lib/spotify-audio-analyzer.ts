/**
 * Spotify Audio Analysis Integration
 *
 * Fetches detailed audio analysis from Spotify API including:
 * - Bars: Precise bar boundaries with timing
 * - Beats: Beat-level timing with confidence scores
 * - Sections: Structural analysis (intro, verse, chorus, outro)
 * - Segments: Detailed timbre/pitch data (500ms resolution)
 * - Tatums: Smallest rhythmic units
 *
 * Used for intelligent mix point detection and professional transitions.
 */

import SpotifyWebApi from 'spotify-web-api-node';

// Spotify analysis types
export interface SpotifyAudioAnalysis {
  bars: Bar[];
  beats: Beat[];
  sections: Section[];
  segments: Segment[];
  tatums: Tatum[];
  track: {
    duration: number;
    tempo: number;
    key: number;
    mode: number;
    time_signature: number;
  };
}

export interface Bar {
  start: number;
  duration: number;
  confidence: number;
}

export interface Beat {
  start: number;
  duration: number;
  confidence: number;
}

export interface Section {
  start: number;
  duration: number;
  confidence: number;
  loudness: number;
  tempo: number;
  tempo_confidence: number;
  key: number;
  key_confidence: number;
  mode: number;
  mode_confidence: number;
  time_signature: number;
  time_signature_confidence: number;
}

export interface Segment {
  start: number;
  duration: number;
  confidence: number;
  loudness_start: number;
  loudness_max: number;
  loudness_max_time: number;
  loudness_end: number;
  pitches: number[];
  timbre: number[];
}

export interface Tatum {
  start: number;
  duration: number;
  confidence: number;
}

// Enhanced segment types for DJ mixing
export type SegmentType = 'intro' | 'verse' | 'chorus' | 'bridge' | 'buildup' | 'drop' | 'breakdown' | 'outro' | 'unknown';

export interface EnhancedSection extends Section {
  type: SegmentType;
  energy: number; // Derived from loudness
  endTime: number; // start + duration
}

// Cache structure
interface CachedAnalysis {
  trackId: string;
  analysis: SpotifyAudioAnalysis;
  fetchedAt: number; // timestamp
  expiresAt: number; // timestamp
}

// In-memory cache (30-day TTL)
const analysisCache = new Map<string, CachedAnalysis>();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

/**
 * Initialize Spotify API client with credentials
 */
export function createSpotifyClient(accessToken: string): SpotifyWebApi {
  const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  });

  spotifyApi.setAccessToken(accessToken);
  return spotifyApi;
}

/**
 * Fetch audio analysis from Spotify with caching
 */
export async function getAudioAnalysis(
  spotifyApi: SpotifyWebApi,
  trackId: string
): Promise<SpotifyAudioAnalysis | null> {
  // Check cache first
  const cached = analysisCache.get(trackId);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`  📦 Using cached analysis for ${trackId}`);
    return cached.analysis;
  }

  try {
    console.log(`  🎵 Fetching Spotify analysis for ${trackId}...`);
    const response = await spotifyApi.getAudioAnalysisForTrack(trackId);
    const analysis = response.body as SpotifyAudioAnalysis;

    // Cache the result
    const now = Date.now();
    analysisCache.set(trackId, {
      trackId,
      analysis,
      fetchedAt: now,
      expiresAt: now + CACHE_TTL,
    });

    console.log(`  ✅ Fetched analysis: ${analysis.bars.length} bars, ${analysis.sections.length} sections`);
    return analysis;
  } catch (error: any) {
    console.error(`  ❌ Failed to fetch analysis for ${trackId}:`, error.message);
    return null;
  }
}

/**
 * Classify sections into DJ-friendly segment types
 * Uses loudness, tempo, and structural patterns to identify:
 * - Intro: Low energy at start
 * - Buildup: Rising energy/tempo
 * - Drop: Sudden loudness increase
 * - Breakdown: Energy drop mid-track
 * - Outro: Declining energy at end
 */
export function classifySections(analysis: SpotifyAudioAnalysis): EnhancedSection[] {
  const sections = analysis.sections;
  const duration = analysis.track.duration;

  return sections.map((section, index) => {
    const isFirst = index === 0;
    const isLast = index === sections.length - 1;
    const position = section.start / duration; // 0-1

    // Calculate relative energy (normalized loudness)
    const energy = Math.max(0, Math.min(1, (section.loudness + 60) / 60));

    let type: SegmentType = 'unknown';

    // Intro detection: First 20% of track with low-medium energy
    if (isFirst || (position < 0.2 && energy < 0.5)) {
      type = 'intro';
    }
    // Outro detection: Last 20% of track with declining energy
    else if (isLast || (position > 0.8 && energy < 0.6)) {
      type = 'outro';
    }
    // Drop detection: High energy (loudness > -10dB)
    else if (section.loudness > -10 && energy > 0.75) {
      type = 'drop';
    }
    // Breakdown detection: Mid-track energy dip
    else if (position > 0.3 && position < 0.8 && energy < 0.4) {
      type = 'breakdown';
    }
    // Buildup detection: Tempo increase or rising energy before drop
    else if (index < sections.length - 1) {
      const nextSection = sections[index + 1];
      if (nextSection.loudness > section.loudness + 3) {
        type = 'buildup';
      }
    }
    // Default: Classify by energy level
    else if (energy > 0.6) {
      type = 'chorus';
    } else if (energy > 0.4) {
      type = 'verse';
    } else {
      type = 'bridge';
    }

    return {
      ...section,
      type,
      energy,
      endTime: section.start + section.duration,
    };
  });
}

/**
 * Find optimal mix-out point using Spotify analysis
 * Prioritizes: outro > breakdown > end of drop
 */
export function findOptimalMixOutPoint(
  analysis: SpotifyAudioAnalysis,
  minFromEnd: number = 30
): { time: number; segment: SegmentType; barAligned: boolean } {
  const sections = classifySections(analysis);
  const duration = analysis.track.duration;
  const maxMixOut = duration - minFromEnd;

  // Priority 1: Outro section
  const outro = sections.find(s => s.type === 'outro' && s.start <= maxMixOut);
  if (outro) {
    const mixOutTime = alignToBar(outro.start, analysis.bars);
    console.log(`  🎵 Mix out: Outro at ${mixOutTime.toFixed(1)}s`);
    return { time: mixOutTime, segment: 'outro', barAligned: true };
  }

  // Priority 2: Last breakdown
  const breakdowns = sections.filter(s => s.type === 'breakdown' && s.start <= maxMixOut);
  if (breakdowns.length > 0) {
    const breakdown = breakdowns[breakdowns.length - 1];
    const mixOutTime = alignToBar(breakdown.start, analysis.bars);
    console.log(`  🎵 Mix out: Breakdown at ${mixOutTime.toFixed(1)}s`);
    return { time: mixOutTime, segment: 'breakdown', barAligned: true };
  }

  // Priority 3: End of last drop
  const drops = sections.filter(s => s.type === 'drop' && s.endTime <= maxMixOut);
  if (drops.length > 0) {
    const lastDrop = drops[drops.length - 1];
    const mixOutTime = alignToBar(lastDrop.endTime, analysis.bars);
    console.log(`  🎵 Mix out: End of drop at ${mixOutTime.toFixed(1)}s`);
    return { time: mixOutTime, segment: 'drop', barAligned: true };
  }

  // Fallback: Last bar before maxMixOut
  const lastBar = findLastBarBefore(maxMixOut, analysis.bars);
  console.log(`  ⚠️ Mix out: Fallback to ${lastBar.toFixed(1)}s`);
  return { time: lastBar, segment: 'unknown', barAligned: true };
}

/**
 * Find optimal mix-in point using Spotify analysis
 * Prioritizes: after intro > buildup > first chorus
 */
export function findOptimalMixInPoint(
  analysis: SpotifyAudioAnalysis
): { time: number; segment: SegmentType; barAligned: boolean } {
  const sections = classifySections(analysis);

  // Priority 1: First buildup (skip intro)
  const buildup = sections.find(s => s.type === 'buildup');
  if (buildup && buildup.start < analysis.track.duration * 0.3) {
    const mixInTime = alignToBar(buildup.start, analysis.bars);
    console.log(`  🎵 Mix in: Buildup at ${mixInTime.toFixed(1)}s`);
    return { time: mixInTime, segment: 'buildup', barAligned: true };
  }

  // Priority 2: End of intro
  const intro = sections.find(s => s.type === 'intro');
  if (intro) {
    const mixInTime = alignToBar(intro.endTime, analysis.bars);
    console.log(`  🎵 Mix in: After intro at ${mixInTime.toFixed(1)}s`);
    return { time: mixInTime, segment: 'intro', barAligned: true };
  }

  // Priority 3: First chorus
  const chorus = sections.find(s => s.type === 'chorus');
  if (chorus && chorus.start < analysis.track.duration * 0.4) {
    const mixInTime = alignToBar(chorus.start, analysis.bars);
    console.log(`  🎵 Mix in: First chorus at ${mixInTime.toFixed(1)}s`);
    return { time: mixInTime, segment: 'chorus', barAligned: true };
  }

  // Fallback: Start of track
  console.log(`  ⚠️ Mix in: Fallback to track start`);
  return { time: 0, segment: 'intro', barAligned: false };
}

/**
 * Align time to nearest bar boundary
 */
function alignToBar(targetTime: number, bars: Bar[]): number {
  if (!bars || bars.length === 0) return targetTime;

  let nearest = bars[0].start;
  let minDiff = Math.abs(targetTime - nearest);

  for (const bar of bars) {
    const diff = Math.abs(targetTime - bar.start);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = bar.start;
    }
  }

  return nearest;
}

/**
 * Find last bar before a given time
 */
function findLastBarBefore(time: number, bars: Bar[]): number {
  if (!bars || bars.length === 0) return time;

  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].start <= time) {
      return bars[i].start;
    }
  }

  return bars[0].start;
}

/**
 * Calculate optimal crossfade duration based on sections
 */
export function calculateCrossfadeDuration(
  outSegment: SegmentType,
  inSegment: SegmentType,
  bpm: number
): number {
  const barsToSeconds = (bars: number) => (bars * 4 * 60) / bpm;

  // Outro → Intro: Long smooth blend
  if (outSegment === 'outro' && inSegment === 'intro') {
    return Math.min(barsToSeconds(32), 55); // Cap at 55s
  }

  // Breakdown → Buildup: Filter sweep territory
  if (outSegment === 'breakdown' && inSegment === 'buildup') {
    return Math.min(barsToSeconds(16), 55);
  }

  // Drop → Drop: Quick hit
  if (outSegment === 'drop' && inSegment === 'drop') {
    return Math.min(barsToSeconds(8), 55);
  }

  // Default: 16 bars
  return Math.min(barsToSeconds(16), 55);
}

/**
 * Clear expired cache entries
 */
export function cleanExpiredCache(): void {
  const now = Date.now();
  let removed = 0;

  for (const [trackId, cached] of analysisCache.entries()) {
    if (now >= cached.expiresAt) {
      analysisCache.delete(trackId);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`  🧹 Cleaned ${removed} expired analysis entries from cache`);
  }
}
