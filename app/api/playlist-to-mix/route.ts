import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Import matching library
import {
  fetchSpotifyPlaylistTracks,
  extractPlaylistId,
  matchPlaylistToLocal,
  LocalAudioFile,
  SpotifyPlaylistTrack,
  TrackMatch,
  MatchStats,
} from '@/lib/spotify-playlist-matcher';

// Import mix generation modules
import { IndexedAudioFile } from '@/lib/audio-library-indexer';
import { MixJob, mixPlaylist } from '@/lib/mix-engine';
import { optimizeTrackOrder } from '@/lib/automix-optimizer';
import { createJob, updateJob, completeJob, failJob } from '@/lib/mix-job-manager';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const CLOUD_LIBRARY_FILE = path.join(process.cwd(), 'data', 'audio-library-analysis.json');
const MATCHED_TRACKS_FILE = path.join(process.cwd(), 'data', 'matched-tracks.json');

// Cloud audio track type
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
  mixPoints?: {
    mixInPoint: number;
    mixOutPoint: number;
    dropPoint?: number;
    breakdownPoint?: number;
  };
  transitionHints?: {
    preferredInType: string;
    preferredOutType: string;
    hasStrongDrop: boolean;
    hasCleanOutro: boolean;
    idealCrossfadeBars: number;
  };
}

// Matched tracks type (from matched-tracks.json)
interface MatchedTrack {
  spotifyTrack: {
    id: string;
    name: string;
    artists: Array<{ name: string; id: string }>;
  };
  mikData: {
    trackName: string;
    artist: string;
    key: string;
    camelotKey: string;
    bpm: number;
    energy: number;
  };
}

/**
 * Refresh Spotify access token using refresh token
 */
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * Load cloud audio library
 */
function loadCloudLibrary(): LocalAudioFile[] {
  try {
    if (fs.existsSync(CLOUD_LIBRARY_FILE)) {
      const data = JSON.parse(fs.readFileSync(CLOUD_LIBRARY_FILE, 'utf-8'));
      const tracks = (data.tracks || []) as CloudAudioTrack[];

      // Load matched tracks for Spotify ID mapping
      let spotifyIdMap: Record<string, string> = {};
      if (fs.existsSync(MATCHED_TRACKS_FILE)) {
        const matchedData = JSON.parse(fs.readFileSync(MATCHED_TRACKS_FILE, 'utf-8'));
        const matchedTracks = matchedData.tracks as MatchedTrack[];

        // Build map of spotifyId -> artist for matching
        for (const match of matchedTracks) {
          const spotifyId = match.spotifyTrack.id;
          const trackName = match.mikData.trackName;
          // Store mapping from Spotify ID to track name
          spotifyIdMap[spotifyId] = trackName;
        }
      }

      // Convert to LocalAudioFile format
      return tracks
        .filter(track => fs.existsSync(track.filePath))
        .map(track => ({
          id: track.id,
          filePath: track.filePath,
          fileName: track.fileName,
          artist: track.artist,
          title: track.title,
          bpm: track.bpm,
          camelotKey: track.camelotKey,
          key: track.key,
          energy: track.energy,
          durationSeconds: track.duration,
          fileSize: track.fileSize,
          // Try to find Spotify ID from matched tracks
          spotifyId: Object.keys(spotifyIdMap).find(
            id => spotifyIdMap[id]?.toLowerCase().includes(track.title.toLowerCase())
          ),
        }));
    }
  } catch (err) {
    console.error('  ⚠️ Could not load cloud library:', err);
  }
  return [];
}

/**
 * POST /api/playlist-to-mix
 *
 * Generate an audio mix from a Spotify playlist.
 * Matches playlist tracks to local files on server, then generates downloadable mix.
 *
 * Request body:
 * - playlistUrl: string - Spotify playlist URL or ID
 * - trackCount?: number - Max tracks to include (default: all matched tracks)
 * - refresh_token?: string - Optional Spotify refresh token (for native apps)
 *
 * Response:
 * - jobId: string - Poll /api/mix-status/[jobId] for progress
 * - matchedTracks: number - How many tracks were found locally
 * - totalTracks: number - Total tracks in playlist
 * - matchRate: number - Percentage matched
 * - missingTracks: Array - Tracks not available locally
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playlistUrl, trackCount, refresh_token } = body;

    if (!playlistUrl || typeof playlistUrl !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid playlistUrl' },
        { status: 400 }
      );
    }

    console.log(`🎧 Playlist-to-Mix API - URL: "${playlistUrl}"`);

    // Extract playlist ID
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId) {
      return NextResponse.json(
        { error: 'Invalid Spotify playlist URL' },
        { status: 400 }
      );
    }

    console.log(`  📋 Playlist ID: ${playlistId}`);

    // Get Spotify access token (try cookies first, then refresh_token from body)
    let accessToken = request.cookies.get('spotify_access_token')?.value;
    const cookieRefreshToken = request.cookies.get('spotify_refresh_token')?.value;
    const refreshToken = refresh_token || cookieRefreshToken;

    if (!accessToken && refreshToken) {
      console.log('  🔄 Refreshing access token...');
      const tokenData = await refreshAccessToken(refreshToken);
      if (!tokenData) {
        return NextResponse.json(
          { error: 'Failed to refresh token. Please log in again.' },
          { status: 401 }
        );
      }
      accessToken = tokenData.access_token;
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Please login with Spotify.' },
        { status: 401 }
      );
    }

    // Create job immediately
    const jobId = `mix-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const job = createJob(`Spotify Playlist: ${playlistId}`, trackCount || 30);
    console.log(`  📋 Created job: ${job.id}`);

    // Start processing in the background
    processPlaylistToMix(job.id, playlistId, accessToken, trackCount).catch(err => {
      console.error(`  ❌ Job ${job.id} failed:`, err);
      failJob(job.id, err instanceof Error ? err.message : String(err));
    });

    // Return immediately with job ID
    return NextResponse.json({
      jobId: job.id,
      status: 'pending',
      message: 'Matching playlist tracks and generating mix. Poll /api/mix-status/{jobId} for progress.',
      statusUrl: `/api/mix-status/${job.id}`,
    });
  } catch (error) {
    console.error('Playlist-to-mix error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Process playlist-to-mix job in the background
 */
async function processPlaylistToMix(
  jobId: string,
  playlistId: string,
  accessToken: string,
  maxTracks?: number
): Promise<void> {
  console.log(`  🎬 Starting playlist-to-mix job ${jobId}...`);

  try {
    // Step 1: Fetch playlist tracks from Spotify
    updateJob(jobId, {
      status: 'processing',
      progress: 5,
      progressMessage: 'Fetching playlist from Spotify...',
    });

    const playlistTracks = await fetchSpotifyPlaylistTracks(playlistId, accessToken);
    console.log(`  🎵 Fetched ${playlistTracks.length} tracks from playlist`);

    updateJob(jobId, {
      progress: 15,
      progressMessage: 'Loading local audio library...',
    });

    // Step 2: Load local audio library
    const localLibrary = loadCloudLibrary();
    console.log(`  📚 Loaded ${localLibrary.length} local tracks`);

    if (localLibrary.length === 0) {
      throw new Error('No audio library found on server');
    }

    updateJob(jobId, {
      progress: 25,
      progressMessage: 'Matching tracks to local files...',
    });

    // Step 3: Match playlist tracks to local files
    const { matches, stats } = matchPlaylistToLocal(playlistTracks, localLibrary);
    console.log(`  🔍 Match stats:`, stats);

    // Filter to only matched tracks
    const matchedTracks = matches.filter(m => m.localFile !== null);

    if (matchedTracks.length === 0) {
      throw new Error('No playlist tracks found in local library');
    }

    // Limit to maxTracks if specified
    const tracksToMix = maxTracks
      ? matchedTracks.slice(0, maxTracks)
      : matchedTracks;

    console.log(`  ✓ Using ${tracksToMix.length} matched tracks for mix`);

    // Get missing tracks for reporting
    const missingTracks = matches
      .filter(m => m.localFile === null)
      .map(m => ({
        name: m.spotifyTrack.name,
        artist: m.spotifyTrack.artists[0]?.name || 'Unknown',
      }));

    updateJob(jobId, {
      progress: 35,
      progressMessage: `Optimizing track order... (${matchedTracks.length}/${playlistTracks.length} tracks matched)`,
    });

    // Step 4: Optimize track order for harmonic mixing
    const orderedTracks = optimizeTrackOrderForMix(tracksToMix);
    console.log('  🔀 Optimized track order');

    // Step 5: Generate the mix
    const mixName = `Spotify-Playlist-Mix-${Date.now()}`;
    const outputPath = path.join(OUTPUT_DIR, `${sanitizeFilename(mixName)}.mp3`);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const mixJob: MixJob = {
      id: jobId,
      name: mixName,
      tracks: orderedTracks.map(match => ({
        filePath: match.localFile!.filePath,
        artist: match.localFile!.artist,
        title: match.localFile!.title,
        bpm: match.localFile!.bpm || 120,
        camelotKey: match.localFile!.camelotKey || '8A',
        energy: match.localFile!.energy || 5,
        // analysis field is optional - will be populated during mix generation
      })),
      outputPath,
      format: 'mp3',
      quality: 'high',
    };

    console.log('  🎛️ Generating mix...');

    const result = await mixPlaylist(mixJob, (stage, progress, message) => {
      // Map stage to overall progress (35-95%)
      const overallProgress = 35 + (progress * 0.6);
      updateJob(jobId, {
        progress: Math.round(overallProgress),
        progressMessage: message,
      });
      console.log(`    [${stage}] ${progress}% - ${message}`);
    });

    if (!result.success) {
      throw new Error(result.errorMessage || 'Mix generation failed');
    }

    // Job complete
    completeJob(jobId, {
      mixName,
      mixUrl: `/output/${path.basename(outputPath)}`,
      tracklist: orderedTracks.map((match, i) => ({
        position: i + 1,
        artist: match.localFile!.artist,
        title: match.localFile!.title,
        bpm: match.localFile!.bpm,
        key: match.localFile!.camelotKey,
      })),
      duration: result.duration || 0,
      transitionCount: result.transitionCount,
      harmonicPercentage: result.harmonicMixPercentage || 0,
    });

    console.log(`  ✅ Job ${jobId} complete!`);
    console.log(`     Output: ${result.outputPath}`);
    console.log(`     Match rate: ${stats.matchRate.toFixed(1)}%`);
    console.log(`     Matched: ${matchedTracks.length}/${playlistTracks.length} tracks`);
  } catch (error) {
    console.error(`  ❌ Job ${jobId} failed:`, error);
    failJob(jobId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Optimize track order for mixing (convert TrackMatch[] to harmonic order)
 */
function optimizeTrackOrderForMix(matches: TrackMatch[]): TrackMatch[] {
  // Convert to Spotify-compatible format for the optimizer
  const spotifyTracks = matches.map((match, index) => ({
    id: match.spotifyTrack.id,
    name: match.spotifyTrack.name,
    artists: match.spotifyTrack.artists,
    album: match.spotifyTrack.album,
    uri: match.spotifyTrack.uri,
    duration_ms: match.spotifyTrack.duration_ms,
    popularity: 50, // Default popularity
    // Add MIK data from local file
    tempo: match.localFile!.bpm || 120,
    key: camelotToSpotifyKey(match.localFile!.camelotKey || '8A'),
    energy: (match.localFile!.energy || 5) / 10, // Convert 1-10 to 0-1
    danceability: 0.7,
    valence: 0.5,
    camelotKey: match.localFile!.camelotKey || '8A',
  }));

  // Optimize order
  const ordered = optimizeTrackOrder(spotifyTracks, { prioritizeHarmonic: true });

  // Map back to original TrackMatch objects
  return ordered.map(track => {
    const match = matches.find(m => m.spotifyTrack.id === track.id);
    return match!;
  });
}

/**
 * Convert Camelot key to Spotify key number (0-11)
 */
function camelotToSpotifyKey(camelotKey: string): number {
  const map: Record<string, number> = {
    '1A': 0, '1B': 3,
    '2A': 2, '2B': 5,
    '3A': 4, '3B': 7,
    '4A': 6, '4B': 9,
    '5A': 8, '5B': 11,
    '6A': 10, '6B': 1,
    '7A': 0, '7B': 3,
    '8A': 2, '8B': 5,
    '9A': 4, '9B': 7,
    '10A': 6, '10B': 9,
    '11A': 8, '11B': 11,
    '12A': 10, '12B': 1,
  };
  return map[camelotKey] || 0;
}

/**
 * Sanitize filename for filesystem
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
    .slice(0, 200);
}
