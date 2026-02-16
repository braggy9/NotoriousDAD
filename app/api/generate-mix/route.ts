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
import SpotifyWebApi from 'spotify-web-api-node';
import {
  createSpotifyClient,
  getAudioAnalysis,
  SpotifyAudioAnalysis,
} from '@/lib/spotify-audio-analyzer';

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
  genre?: string; // v4: Genre tag from audio file metadata
  spotifyId?: string; // v5: Spotify track ID (for audio analysis)

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
 * Convert cloud track to IndexedAudioFile format (v4 with genre)
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

  // Pass through v4 genre tag if available
  if (track.genre) {
    indexed.genre = track.genre;
  }

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
 * Fetch Spotify Audio Analysis for tracks that have Spotify IDs
 * Returns a map of filePath -> SpotifyAudioAnalysis
 */
async function fetchSpotifyAnalysisForTracks(
  tracks: IndexedAudioFile[]
): Promise<Map<string, SpotifyAudioAnalysis>> {
  const analysisMap = new Map<string, SpotifyAudioAnalysis>();

  // Check if we have Spotify credentials
  const spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
  const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!spotifyClientId || !spotifyClientSecret) {
    console.log('  ⚠️ Spotify credentials not configured - skipping audio analysis');
    return analysisMap;
  }

  try {
    // Create Spotify client with client credentials flow
    const spotifyApi = new SpotifyWebApi({
      clientId: spotifyClientId,
      clientSecret: spotifyClientSecret,
    });

    // Get access token using client credentials
    const tokenResponse = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(tokenResponse.body.access_token);

    console.log('  🎵 Fetching Spotify Audio Analysis for tracks with Spotify IDs...');

    // Filter tracks that have Spotify IDs
    const tracksWithSpotifyIds = tracks.filter((track: any) => track.spotifyId);

    if (tracksWithSpotifyIds.length === 0) {
      console.log('  ⚠️ No tracks have Spotify IDs - skipping audio analysis');
      return analysisMap;
    }

    console.log(`  📊 Found ${tracksWithSpotifyIds.length} tracks with Spotify IDs`);

    // Fetch analysis for each track (with rate limiting)
    for (const track of tracksWithSpotifyIds) {
      try {
        const analysis = await getAudioAnalysis(spotifyApi, (track as any).spotifyId);
        if (analysis) {
          analysisMap.set(track.filePath, analysis);
        }
      } catch (error) {
        console.log(`  ⚠️ Failed to fetch analysis for ${track.artist} - ${track.title}:`, error instanceof Error ? error.message : String(error));
      }
    }

    console.log(`  ✅ Fetched Spotify analysis for ${analysisMap.size} tracks`);
  } catch (error) {
    console.log('  ⚠️ Spotify analysis fetching failed:', error instanceof Error ? error.message : String(error));
  }

  return analysisMap;
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
    const { prompt, trackCount = 6, playlistURL } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid prompt' },
        { status: 400 }
      );
    }

    // If playlistURL provided, route to playlist-to-mix logic
    if (playlistURL && typeof playlistURL === 'string' && playlistURL.trim().length > 0) {
      console.log(`🎧 Generate Mix API (Playlist Mode) - URL: "${playlistURL}", trackCount: ${trackCount}`);

      // Import playlist-to-mix logic
      const playlistToMixModule = await import('../playlist-to-mix/route');

      // Create new request with playlist data
      const playlistRequest = new NextRequest(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({
          playlistUrl: playlistURL,
          trackCount,
        }),
      });

      // Delegate to playlist-to-mix endpoint
      return await playlistToMixModule.POST(playlistRequest);
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

    updateJob(jobId, {
      progress: 35,
      progressMessage: 'Fetching Spotify audio analysis...',
    });

    // Step 4.5: Fetch Spotify Audio Analysis for quality improvements
    const spotifyAnalysisMap = await fetchSpotifyAnalysisForTracks(orderedTracks);
    console.log(`  🎵 Spotify analysis ready for ${spotifyAnalysisMap.size} tracks`);

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

        // Add Spotify ID if available (v5)
        if ((file as any).spotifyId) {
          track.spotifyId = (file as any).spotifyId;
        }

        // Add Spotify Audio Analysis if available (v5)
        const spotifyAnalysis = spotifyAnalysisMap.get(file.filePath);
        if (spotifyAnalysis) {
          track.spotifyAnalysis = spotifyAnalysis;
          console.log(`    ✓ Spotify analysis for ${file.title}: ${spotifyAnalysis.bars.length} bars, ${spotifyAnalysis.sections.length} sections`);
        }

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
      model: 'claude-sonnet-4-5-20250929',
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
 * Calculate selection score for a track based on quality and constraints
 */
function calculateMixTrackScore(
  track: IndexedAudioFile,
  constraints: MixConstraints,
  artistCounts: Map<string, number>
): number {
  let score = 0;

  // 1. Base quality (all tracks are from uploaded library)
  score += 30;

  // 2. MIK data present (BPM/key analyzed)
  if (track.mikData?.bpm && track.mikData?.camelotKey) {
    score += 20;
  }

  // 3. Genre match (v4 genre tags)
  if (constraints.genres?.length > 0 && track.genre) {
    const trackGenre = track.genre.toLowerCase();
    const hasMatch = constraints.genres.some(g =>
      trackGenre.includes(g.toLowerCase()) || g.toLowerCase().includes(trackGenre)
    );
    if (hasMatch) score += 20;
  }

  // 4. BPM constraint (strict penalty for out-of-range)
  const bpm = track.mikData?.bpm;
  if (bpm) {
    if (bpm >= constraints.bpmRange.min && bpm <= constraints.bpmRange.max) {
      score += 15;
    } else {
      score -= 50; // Major penalty
    }
  }

  // 5. Energy constraint
  const energy = track.mikData?.energy || 5;
  if (energy >= constraints.energyRange.min && energy <= constraints.energyRange.max) {
    score += 10;
  } else {
    score -= 30;
  }

  // 6. Artist variety bonus (penalize overused artists)
  const artistCount = artistCounts.get(track.artist) || 0;
  if (artistCount === 0) {
    score += 15; // Bonus for new artist
  } else if (artistCount >= 2) {
    score -= (artistCount * 10); // Progressive penalty
  }

  // 7. Randomness for natural variety
  score += Math.random() * 10;

  return score;
}

/**
 * Select tracks based on constraints (with genre filtering and variety enforcement)
 */
async function selectTracks(
  pool: IndexedAudioFile[],
  constraints: MixConstraints
): Promise<IndexedAudioFile[]> {
  console.log(`  🎯 Selecting ${constraints.trackCount} tracks from pool of ${pool.length}`);

  // Step 1: Apply hard filters (BPM, energy, genre)
  let filtered = pool;

  // Filter by BPM range (with tolerance for expansion)
  const bpmFiltered = filtered.filter((track) => {
    const bpm = track.mikData?.bpm;
    if (!bpm) return false;
    return bpm >= constraints.bpmRange.min - 10 && bpm <= constraints.bpmRange.max + 10;
  });

  // If enough tracks, use strict BPM filter
  if (bpmFiltered.length >= constraints.trackCount * 2) {
    filtered = bpmFiltered;
    console.log(`  ✓ BPM filter: ${filtered.length} tracks in range ${constraints.bpmRange.min}-${constraints.bpmRange.max}`);
  } else {
    console.log(`  ⚠️ BPM filter too strict, using expanded range`);
  }

  // Filter by genre using actual genre tags (v4)
  if (constraints.genres?.length > 0) {
    console.log(`  🎵 Filtering by genre: ${constraints.genres.join(', ')}`);
    const genreFiltered = await filterByGenre(filtered, constraints.genres);

    if (genreFiltered.length >= constraints.trackCount) {
      filtered = genreFiltered;
      console.log(`  ✓ Genre filter: ${filtered.length} tracks match`);
    } else {
      console.log(`  ⚠️ Genre filter too strict (${genreFiltered.length} matches), using all tracks`);
    }
  }

  // Step 2: Score all filtered tracks
  const artistCounts = new Map<string, number>();
  const scoredTracks = filtered.map(track => ({
    track,
    score: calculateMixTrackScore(track, constraints, artistCounts)
  }));

  // Sort by score (highest first)
  scoredTracks.sort((a, b) => b.score - a.score);

  console.log(`  📊 Top 5 scored tracks:`);
  scoredTracks.slice(0, 5).forEach((item, i) => {
    console.log(`    ${i + 1}. ${item.track.artist} - ${item.track.title} (score: ${item.score.toFixed(1)})`);
  });

  // Step 3: Select tracks with variety enforcement
  const maxPerArtist = Math.max(2, Math.ceil(constraints.trackCount / 15));
  console.log(`  🎨 Variety enforcement: max ${maxPerArtist} tracks per artist (guarantees 15+ artists)`);

  const selected: IndexedAudioFile[] = [];
  const selectedArtists = new Map<string, number>();
  const selectedIds = new Set<string>();

  for (const { track, score } of scoredTracks) {
    if (selected.length >= constraints.trackCount) break;

    // Skip if score is too low (failed hard constraints)
    if (score < 0) continue;

    // Skip duplicates
    const trackId = track.filePath;
    if (selectedIds.has(trackId)) continue;

    // Check artist variety
    const artistCount = selectedArtists.get(track.artist) || 0;
    if (artistCount >= maxPerArtist) {
      console.log(`    ⏭️ Skipping ${track.artist} - ${track.title} (artist quota reached: ${artistCount}/${maxPerArtist})`);
      continue;
    }

    // Add track
    selected.push(track);
    selectedIds.add(trackId);
    selectedArtists.set(track.artist, artistCount + 1);
  }

  console.log(`  ✅ Selected ${selected.length} tracks from ${selectedArtists.size} different artists`);
  console.log(`  🎨 Artist distribution:`);
  const sortedArtists = Array.from(selectedArtists.entries()).sort((a, b) => b[1] - a[1]);
  sortedArtists.slice(0, 10).forEach(([artist, count]) => {
    console.log(`    - ${artist}: ${count} track${count > 1 ? 's' : ''}`);
  });

  return selected;
}

/**
 * Filter tracks by genre using actual genre tags from audio files
 */
async function filterByGenre(
  tracks: IndexedAudioFile[],
  genres: string[]
): Promise<IndexedAudioFile[]> {
  if (tracks.length === 0 || genres.length === 0) return tracks;

  console.log(`  🎵 Filtering by genre: ${genres.join(', ')}`);

  // First, try exact genre tag matching
  const lowerGenres = genres.map(g => g.toLowerCase());

  // Build genre mapping for requested genres
  const genreAliases: Record<string, string[]> = {
    'house': ['house', 'deep house', 'tech house', 'progressive house', 'funky house', 'vocal house', 'french house', 'tribal house', 'electro house'],
    'disco': ['disco', 'nu disco', 'nu-disco', 'nudisco', 'funky', 'funk', 'boogie'],
    'techno': ['techno', 'tech house', 'minimal', 'dub techno'],
    'electronic': ['electronic', 'electronica', 'dance', 'edm', 'electro'],
    'indie': ['indie', 'indie rock', 'indie dance', 'indie pop'],
    'hip-hop': ['hip-hop', 'hip hop', 'rap', 'hip hop/rap'],
    'rock': ['rock', 'alt. rock', 'alternative rock', 'indie rock'],
  };

  // Expand requested genres with aliases
  const expandedGenres = new Set<string>();
  lowerGenres.forEach(genre => {
    expandedGenres.add(genre);
    if (genreAliases[genre]) {
      genreAliases[genre].forEach(alias => expandedGenres.add(alias));
    }
  });

  // Filter tracks that have matching genre tags
  const withGenreTags = tracks.filter(track => {
    const trackGenre = (track as any).genre?.toLowerCase();
    if (!trackGenre) return false;

    // Check if track genre matches any expanded genre
    return Array.from(expandedGenres).some(g =>
      trackGenre.includes(g) || g.includes(trackGenre)
    );
  });

  console.log(`  ✓ ${withGenreTags.length} tracks match genre tags`);

  // If we found enough matches, use them
  if (withGenreTags.length > 0) {
    return withGenreTags;
  }

  // Fallback: Use Claude AI for tracks without genre tags
  console.log(`  ⚠️ No tracks with matching genre tags, falling back to AI filter`);

  const tracksWithoutGenre = tracks.filter(track => !(track as any).genre);
  if (tracksWithoutGenre.length === 0) return [];

  const trackList = tracksWithoutGenre.map((t, i) => `${i}. ${t.artist} - ${t.title}`).join('\n');
  const genreStr = genres.join(', ');

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a DJ music expert. From this list of tracks, identify which ones fit the genre(s): ${genreStr}

For house music, include: house, deep house, tech house, progressive house, nu disco, disco, funky house, vocal house, french house.
For disco, include: nu disco, disco, indie dance, funky, boogie.
Exclude: ambient, experimental, indie rock, folk, classical, hip-hop (unless specifically house remixes).

Tracks:
${trackList}

Return ONLY a JSON array of the track numbers (0-indexed) that match. Example: [0, 3, 7, 12]
If no tracks match, return an empty array: []`
      }]
    });

    const content = response.content[0];
    if (content.type === 'text') {
      const match = content.text.match(/\[[\d,\s]*\]/);
      if (match) {
        const indices: number[] = JSON.parse(match[0]);
        const aiFiltered = indices.map(i => tracksWithoutGenre[i]).filter(Boolean);
        console.log(`  ✓ AI matched ${aiFiltered.length} additional tracks`);
        return aiFiltered;
      }
    }
  } catch (err) {
    console.log('  ⚠️ AI genre filter failed:', err);
  }

  return []; // Return empty if no matches found
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
  const parts: string[] = ['DAD']; // Notorious DAD prefix

  // Creative descriptors based on energy curve
  const energyDescriptors: Record<string, string[]> = {
    build: ['Warm-Up', 'Rising', 'Ascending', 'Building', 'Elevating'],
    peak: ['Peak-Time', 'Prime', 'Apex', 'Zenith', 'High-Energy'],
    chill: ['Sunset', 'Wind-Down', 'Mellow', 'Smooth', 'Easy'],
    steady: ['Groove', 'Flow', 'Cruise', 'Ride', 'Vibe'],
  };

  // Add energy descriptor
  if (constraints.energyCurve && energyDescriptors[constraints.energyCurve]) {
    const descriptors = energyDescriptors[constraints.energyCurve];
    parts.push(descriptors[Math.floor(Math.random() * descriptors.length)]);
  }

  // Add genre if specified
  if (constraints.genres?.length) {
    const genre = constraints.genres[0].replace(/\b\w/g, (c: string) => c.toUpperCase());
    parts.push(genre);
  }

  // Add time-based descriptor
  const hour = new Date().getHours();
  let timeDescriptor = 'Session';
  if (hour >= 5 && hour < 12) timeDescriptor = 'Morning';
  else if (hour >= 12 && hour < 17) timeDescriptor = 'Afternoon';
  else if (hour >= 17 && hour < 21) timeDescriptor = 'Evening';
  else if (hour >= 21 || hour < 2) timeDescriptor = 'Night';
  else timeDescriptor = 'Late-Night';

  parts.push(timeDescriptor);

  // Add date for uniqueness (YYYY-MM-DD format)
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // 2026-02-12
  parts.push(dateStr);

  return parts.join('-');
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
