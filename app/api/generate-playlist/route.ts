import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { SpotifyTrackWithFeatures } from '@/lib/types';
import { optimizeTrackOrder, calculatePlaylistQuality } from '@/lib/automix-optimizer';
import { spotifyToCamelot } from '@/lib/camelot-wheel';
import {
  extractPlaylistConstraints,
  summarizeConstraints,
  calculateTargetTrackCount,
} from '@/lib/playlist-nlp';
import {
  generatePlaylistName,
  extractPlaylistCharacteristics,
  generateSimpleName,
} from '@/lib/playlist-namer';
import { generateAndUploadCoverArt } from '@/lib/cover-art-generator';
import {
  getRecentlyUsedTracks,
  recordUsedTracks,
  generateUserHash,
  getDeduplicationPenalty,
  cleanupOldTrackHistory,
} from '@/lib/track-history';
import {
  filterLowQualityTracks,
  isLowQualityTrack,
  calculateQualityScore,
} from '@/lib/track-quality-filter';
import {
  getTargetGenreFamilies,
  isTrackGenreCompatible,
  getArtistGenreFamily,
} from '@/lib/genre-compatibility';
import {
  generatePlaylistTransitions,
  calculateMixDifficulty,
} from '@/lib/transition-analyzer';
import {
  generateMixRecipe,
  exportCueSheet,
} from '@/lib/mix-recipe';
import {
  findMashupPairs,
  type MashupableTrack,
} from '@/lib/mashup-generator';

const MIK_DATA_PATH = path.join(process.cwd(), 'data', 'matched-tracks.json');
const APPLE_MUSIC_CHECKPOINT_PATH = path.join(process.cwd(), 'data', 'apple-music-checkpoint.json');

/**
 * Known artist BPM/genre profiles for better inference
 * When these are reference artists, use their typical BPM range
 */
const ARTIST_PROFILES: Record<string, { bpmRange: { min: number; max: number }; genres: string[] }> = {
  // Downtempo / Trip-hop / Chillout
  'nightmares on wax': { bpmRange: { min: 80, max: 110 }, genres: ['downtempo', 'trip-hop', 'chill'] },
  'bonobo': { bpmRange: { min: 85, max: 120 }, genres: ['downtempo', 'electronica', 'chill'] },
  'boards of canada': { bpmRange: { min: 80, max: 110 }, genres: ['downtempo', 'ambient', 'idm'] },
  'tycho': { bpmRange: { min: 90, max: 120 }, genres: ['downtempo', 'ambient', 'chill'] },
  'four tet': { bpmRange: { min: 100, max: 130 }, genres: ['electronica', 'house', 'experimental'] },
  'caribou': { bpmRange: { min: 100, max: 130 }, genres: ['electronica', 'psychedelic', 'house'] },

  // Hip-hop / Soul
  'jazzy jeff': { bpmRange: { min: 85, max: 105 }, genres: ['hip-hop', 'soul', 'r&b'] },
  'dj jazzy jeff': { bpmRange: { min: 85, max: 105 }, genres: ['hip-hop', 'soul', 'r&b'] },
  'de la soul': { bpmRange: { min: 85, max: 105 }, genres: ['hip-hop', 'soul'] },
  'a tribe called quest': { bpmRange: { min: 85, max: 105 }, genres: ['hip-hop', 'jazz-rap'] },
  'the roots': { bpmRange: { min: 85, max: 105 }, genres: ['hip-hop', 'soul', 'r&b'] },
  'j dilla': { bpmRange: { min: 80, max: 100 }, genres: ['hip-hop', 'soul', 'instrumental'] },
  'madlib': { bpmRange: { min: 80, max: 100 }, genres: ['hip-hop', 'experimental'] },
  'nujabes': { bpmRange: { min: 80, max: 100 }, genres: ['hip-hop', 'jazz', 'chill'] },

  // House / Electronic
  'fred again': { bpmRange: { min: 120, max: 135 }, genres: ['house', 'uk-garage', 'electronic'] },
  'disclosure': { bpmRange: { min: 118, max: 130 }, genres: ['house', 'uk-garage', 'electronic'] },
  'rufus du sol': { bpmRange: { min: 115, max: 128 }, genres: ['house', 'electronica', 'indie-dance'] },
  'fatboy slim': { bpmRange: { min: 118, max: 140 }, genres: ['big-beat', 'house', 'electronic'] },
  'chemical brothers': { bpmRange: { min: 110, max: 140 }, genres: ['big-beat', 'electronic', 'techno'] },

  // Techno
  'adam beyer': { bpmRange: { min: 128, max: 140 }, genres: ['techno'] },
  'amelie lens': { bpmRange: { min: 130, max: 145 }, genres: ['techno', 'acid'] },
  'charlotte de witte': { bpmRange: { min: 130, max: 145 }, genres: ['techno', 'acid'] },

  // Deep House / Melodic
  'lane 8': { bpmRange: { min: 118, max: 126 }, genres: ['deep-house', 'progressive'] },
  'ben böhmer': { bpmRange: { min: 118, max: 126 }, genres: ['melodic-house', 'progressive'] },
};

/**
 * Infer BPM and genre constraints from reference artists
 */
function inferConstraintsFromArtists(
  referenceArtists: string[],
  includeArtists: string[],
  existingConstraints: any
): { bpmRange?: { min: number; max: number }; genres?: string[] } {
  const allArtists = [...referenceArtists, ...includeArtists]
    .filter(a => a && typeof a === 'string')
    .map(a => a.toLowerCase());
  const matchedProfiles: (typeof ARTIST_PROFILES)[string][] = [];

  for (const artist of allArtists) {
    if (ARTIST_PROFILES[artist]) {
      matchedProfiles.push(ARTIST_PROFILES[artist]);
    }
  }

  if (matchedProfiles.length === 0) {
    return {};
  }

  // Calculate BPM range from matched profiles
  const allMinBpms = matchedProfiles.map(p => p.bpmRange.min);
  const allMaxBpms = matchedProfiles.map(p => p.bpmRange.max);

  // Use the overlap of all ranges, or fall back to average
  const inferredBpmRange = {
    min: Math.max(...allMinBpms),
    max: Math.min(...allMaxBpms),
  };

  // If ranges don't overlap, use the average
  if (inferredBpmRange.min > inferredBpmRange.max) {
    inferredBpmRange.min = Math.round(allMinBpms.reduce((a, b) => a + b, 0) / allMinBpms.length);
    inferredBpmRange.max = Math.round(allMaxBpms.reduce((a, b) => a + b, 0) / allMaxBpms.length);
  }

  // Collect all genres
  const allGenres = matchedProfiles.flatMap(p => p.genres);
  const uniqueGenres = [...new Set(allGenres)];

  console.log(`  🎯 Inferred from artists: BPM ${inferredBpmRange.min}-${inferredBpmRange.max}, Genres: ${uniqueGenres.join(', ')}`);

  return {
    bpmRange: existingConstraints.bpmRange || inferredBpmRange,
    genres: existingConstraints.genres?.length ? existingConstraints.genres : uniqueGenres,
  };
}

interface SpotifyUser {
  id: string;
  display_name: string;
}

interface AppleMusicMatch {
  appleMusicTrack: {
    name?: string;
    artist?: string;
    album?: string;
    genre?: string;
    playCount?: string;
  };
  spotifyTrack: {
    id: string;
    uri: string;
    name: string;
    artists: { name: string }[];
    album: { name: string };
    popularity?: number;
    duration_ms?: number;
  };
}

interface AppleMusicCheckpoint {
  lastIndex: number;
  matches: AppleMusicMatch[];
}

interface EnrichedTrack extends SpotifyTrackWithFeatures {
  appleMusicPlayCount: number;
  selectionScore: number;
}

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
    console.error('Error refreshing token:', error);
    return null;
  }
}

/**
 * DETERMINISTIC TRACK SELECTION - No AI, just math
 *
 * Selection Score = sum of:
 * - In library (30 points) - track exists in your Apple Music/MIK library
 * - MIK data presence (20 points) - professional analysis available
 * - Constraint match (can be NEGATIVE) - STRICT BPM/energy enforcement
 *   - BPM match: +20, BPM mismatch: -50, no BPM data: -15
 *   - Energy mismatch: -30
 * - Artist match (20 Include, 10 Reference) - matches requested artists
 * - Randomness (0-10 points) - variety
 * - Deduplication penalty (-25 points) - recently used tracks
 * - Quality bonus (0-15 points) - prefer popular/authentic tracks
 * - Familiarity preference adjustment (±20 points)
 *
 * NOTE: Playcount weighting disabled due to XML parser bug mixing up
 * sample rates with play counts. Will re-enable after parser fix.
 */
function calculateSelectionScore(
  track: SpotifyTrackWithFeatures,
  applePlayCount: number,
  constraints: any,
  includeArtists: Set<string>,
  referenceArtists: Set<string>,
  recentlyUsedTracks: Set<string> = new Set(),
  targetGenreFamilies: string[] = []
): number {
  let score = 0;

  // 1. In library (30 points) - flat bonus for being in your library
  // NOTE: Playcount weighting disabled - parser bug mixes sample rate with playcount
  if (applePlayCount > 0 || track.source === 'mik-library') {
    score += 30;
  }

  // 2. MIK data presence (20 points)
  if (track.mikData || track.camelotKey) {
    score += 20;
  }

  // 3. Constraint matching - STRICT enforcement
  // BPM and genre mismatches should heavily penalize tracks
  let constraintScore = 20; // Start with full points, subtract for mismatches

  if (constraints.bpmRange) {
    const bpm = track.tempo;
    if (bpm) {
      // Strict BPM enforcement: -50 for being outside range
      if (bpm < constraints.bpmRange.min || bpm > constraints.bpmRange.max) {
        constraintScore -= 50; // Major penalty - this track is wrong tempo
      }
    } else {
      // No BPM data but constraint specified: minor penalty (can't verify)
      constraintScore -= 15;
    }
  }

  if (constraints.energyRange) {
    const energy = track.energy;
    if (energy !== undefined) {
      const normalizedEnergy = energy <= 1 ? energy * 10 : energy; // Normalize to 0-10
      if (normalizedEnergy < constraints.energyRange.min || normalizedEnergy > constraints.energyRange.max) {
        constraintScore -= 30; // Significant penalty for wrong energy
      }
    }
  }

  score += constraintScore; // Can go negative to really penalize mismatches

  // 4. Artist match (20 points for Include, 10 for Reference)
  const trackArtists = track.artists
    .filter(a => a && a.name)
    .map(a => a.name.toLowerCase());

  for (const artist of trackArtists) {
    if (includeArtists.has(artist)) {
      score += 20;
      break;
    }
    if (referenceArtists.has(artist)) {
      score += 10;
      break;
    }
  }

  // 5. Random factor (0-10 points) for variety
  score += Math.random() * 10;

  // 6. Deduplication penalty (-25 points for recently used tracks)
  score += getDeduplicationPenalty(track.id, recentlyUsedTracks);

  // 7. Quality bonus (0-15 points) - prefer authentic, popular tracks
  // Higher popularity usually means original/authentic version
  if (track.popularity !== undefined && track.popularity >= 30) {
    score += Math.min(15, track.popularity * 0.15); // Up to 15 points for popular tracks
  }

  // 8. Familiarity preference (±20 points)
  if (constraints.familiarityPreference && track.popularity !== undefined) {
    if (constraints.familiarityPreference === 'deep-cuts') {
      // Prefer less popular tracks
      if (track.popularity < 40) {
        score += 20; // Bonus for deep cuts
      } else if (track.popularity > 70) {
        score -= 15; // Penalty for mainstream hits
      }
    } else if (constraints.familiarityPreference === 'hits') {
      // Prefer popular tracks
      if (track.popularity > 60) {
        score += 20; // Bonus for hits
      } else if (track.popularity < 30) {
        score -= 15; // Penalty for obscure tracks
      }
    }
  }

  // 9. GENRE COMPATIBILITY - massive penalty for incompatible genres
  // This is the most important filter for mix coherence
  if (targetGenreFamilies.length > 0) {
    const { compatible, artistFamily, unknownArtist } = isTrackGenreCompatible(
      track.artists,
      targetGenreFamilies
    );
    if (!compatible) {
      // Massive penalty - effectively excludes the track
      score -= 200;
    } else if (unknownArtist) {
      // Unknown artist with genre constraints - moderate penalty
      // Prefer known-compatible artists over unknown ones
      score -= 40;
    }
  }

  return score;
}

/**
 * Search Spotify for tracks from specific artists
 */
async function searchArtistTracks(
  artistName: string,
  accessToken: string,
  limit: number = 20
): Promise<SpotifyTrackWithFeatures[]> {
  try {
    const query = encodeURIComponent(`artist:${artistName}`);
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${query}&type=track&limit=${limit}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return [];

    const data = await response.json();
    return (data.tracks?.items || []).map((track: any) => ({
      ...track,
      source: 'spotify-search' as const,
    }));
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse body ONCE - extract all fields including tokens for mobile apps
    const body = await request.json();
    const { prompt, energyCurve = 'wave', access_token: bodyAccessToken, refresh_token: bodyRefreshToken } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎵 DETERMINISTIC PLAYLIST GENERATOR v2.0');
    console.log('='.repeat(60));
    console.log(`📝 Prompt: "${prompt}"`);

    // First try cookies (web app)
    let accessToken = request.cookies.get('spotify_access_token')?.value;
    let refreshToken = request.cookies.get('spotify_refresh_token')?.value;

    // Fallback: Accept tokens from request body (for iOS/macOS apps)
    if (!accessToken && !refreshToken) {
      if (bodyAccessToken || bodyRefreshToken) {
        accessToken = bodyAccessToken;
        refreshToken = bodyRefreshToken;
        console.log('📱 Using tokens from request body');
      }
    }

    // Fallback: Use hardcoded refresh token for mobile apps
    if (!accessToken && !refreshToken) {
      // This refresh token is for the DJ Mix Generator Spotify app
      refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || 'AQB1rhlNzigZavJoEM52V7ANmglze5E8i6KffPV7UcE05TAfNReaIkcu3frWseCSsiKMBIhOXMn9YINoG1ao_syFAelvnQQPKHsXvxJk12lrmfW7yqoBNUWJhsLE_sxprBo';
      console.log('🔑 Using server-side refresh token fallback');
    }

    if (!accessToken && !refreshToken) {
      return NextResponse.json({
        error: 'Not authenticated. Please log in again.',
      }, { status: 401 });
    }

    // Fetch user profile (with token refresh if needed)
    let userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok && userResponse.status === 401 && refreshToken) {
      console.log('🔄 Refreshing token...');
      const newTokenData = await refreshAccessToken(refreshToken);
      if (!newTokenData) {
        return NextResponse.json({ error: 'Failed to refresh token. Please log in again.' }, { status: 401 });
      }
      accessToken = newTokenData.access_token;
      userResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!userResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch user profile.' }, { status: 500 });
    }

    const user: SpotifyUser = await userResponse.json();
    console.log(`👤 User: ${user.display_name}`);

    // Generate user hash for deduplication (from refresh token or user ID)
    const userHash = refreshToken ? generateUserHash(refreshToken) : user.id;

    // Fetch recently used tracks for deduplication
    let recentlyUsedTracks = new Set<string>();
    try {
      recentlyUsedTracks = await getRecentlyUsedTracks(userHash);
      if (recentlyUsedTracks.size > 0) {
        console.log(`🔄 Deduplication: ${recentlyUsedTracks.size} recently used tracks will be deprioritized`);
      }
    } catch (e) {
      console.log('  ⚠️ Deduplication unavailable:', e);
    }

    // ============================================
    // STEP 1: LOAD ALL DATA SOURCES
    // ============================================
    console.log('\n📦 STEP 1: Loading data sources...');

    // Load MIK tracks
    let mikTracks: SpotifyTrackWithFeatures[] = [];
    try {
      const data = await fs.readFile(MIK_DATA_PATH, 'utf-8');
      const matchedData = JSON.parse(data);
      mikTracks = matchedData.tracks.map((t: any) => ({
        ...t.spotifyTrack,
        mikData: t.mikData,
        camelotKey: t.mikData?.camelotKey,
        tempo: t.mikData?.bpm || t.spotifyTrack?.tempo,
        energy: t.mikData?.energy || t.spotifyTrack?.energy,
        source: 'mik-library' as const,
      }));
      console.log(`  ✓ MIK Library: ${mikTracks.length} tracks with professional analysis`);
    } catch {
      console.log('  ⚠️ No MIK data found');
    }

    // Load Apple Music checkpoint (34k+ matched tracks)
    let appleMatches: AppleMusicMatch[] = [];
    const applePlayCounts = new Map<string, number>();
    try {
      const checkpointData = await fs.readFile(APPLE_MUSIC_CHECKPOINT_PATH, 'utf-8');
      const checkpoint: AppleMusicCheckpoint = JSON.parse(checkpointData);
      appleMatches = checkpoint.matches || [];

      // Build playcount map
      for (const match of appleMatches) {
        if (match.spotifyTrack?.id && match.appleMusicTrack?.playCount) {
          applePlayCounts.set(match.spotifyTrack.id, parseInt(match.appleMusicTrack.playCount) || 0);
        }
      }
      console.log(`  ✓ Apple Music: ${appleMatches.length} matched tracks (${applePlayCounts.size} with playcounts)`);
    } catch (e) {
      console.log('  ⚠️ No Apple Music checkpoint found:', e);
    }

    // Build track pool from BOTH sources
    const trackPool = new Map<string, EnrichedTrack>();

    // Source A: MIK library (DJ-ready tracks with professional analysis)
    let mikFiltered = 0;
    for (const track of mikTracks) {
      // Filter out low-quality tracks (karaoke, Various Artists, etc.)
      const { isLowQuality } = isLowQualityTrack(track);
      if (isLowQuality) {
        mikFiltered++;
        continue;
      }

      const playCount = applePlayCounts.get(track.id) || 0;
      trackPool.set(track.id, {
        ...track,
        appleMusicPlayCount: playCount,
        selectionScore: 0,
      });
    }
    console.log(`  📊 MIK pool: ${trackPool.size} tracks (filtered ${mikFiltered} low-quality)`);

    // Source B: ALL Apple Music matched tracks (34k+ from your full library)
    let addedFromApple = 0;
    let withPlaycount = 0;
    let appleFiltered = 0;

    for (const match of appleMatches) {
      const spotifyTrack = match.spotifyTrack;
      const appleTrack = match.appleMusicTrack;

      if (spotifyTrack?.id && !trackPool.has(spotifyTrack.id)) {
        // Build a track object for quality filtering
        const trackForFilter = {
          id: spotifyTrack.id,
          name: spotifyTrack.name || appleTrack?.name || 'Unknown',
          artists: spotifyTrack.artists || [{ name: appleTrack?.artist || 'Unknown' }],
          album: spotifyTrack.album || { name: appleTrack?.album || 'Unknown' },
          popularity: spotifyTrack.popularity,
        };

        // Filter out low-quality tracks (karaoke, Various Artists, etc.)
        const { isLowQuality } = isLowQualityTrack(trackForFilter);
        if (isLowQuality) {
          appleFiltered++;
          continue;
        }

        const playCount = parseInt(appleTrack?.playCount || '0') || 0;
        if (playCount > 0) withPlaycount++;

        trackPool.set(spotifyTrack.id, {
          id: spotifyTrack.id,
          uri: spotifyTrack.uri || `spotify:track:${spotifyTrack.id}`,
          name: trackForFilter.name,
          artists: trackForFilter.artists,
          album: trackForFilter.album,
          popularity: spotifyTrack.popularity || 0,
          duration_ms: spotifyTrack.duration_ms || 0,
          source: 'liked-songs',
          appleMusicPlayCount: playCount,
          selectionScore: 0,
        } as EnrichedTrack);
        addedFromApple++;
      }
    }
    console.log(`  📊 Added ${addedFromApple} Apple Music tracks (${withPlaycount} with playcounts, filtered ${appleFiltered} low-quality)`);

    console.log(`  📊 Total pool: ${trackPool.size} tracks`);

    // ============================================
    // STEP 2: PARSE CONSTRAINTS (Claude - good at this)
    // ============================================
    console.log('\n🧠 STEP 2: Parsing constraints with Claude...');
    const constraints = await extractPlaylistConstraints(prompt);
    console.log(`  ✓ ${summarizeConstraints(constraints)}`);

    // Build artist sets for matching
    const includeArtists = new Set(
      (constraints.artists || [])
        .filter((a: any) => a && typeof a === 'string')
        .map((a: string) => a.toLowerCase())
    );
    const referenceArtists = new Set(
      (constraints.referenceArtists || [])
        .filter((a: any) => a && typeof a === 'string')
        .map((a: string) => a.toLowerCase())
    );

    // Infer BPM/genre from reference artists if not explicitly specified
    const inferredConstraints = inferConstraintsFromArtists(
      Array.from(referenceArtists),
      Array.from(includeArtists),
      constraints
    );

    // Apply inferred constraints
    if (inferredConstraints.bpmRange && !constraints.bpmRange) {
      constraints.bpmRange = inferredConstraints.bpmRange;
      console.log(`  🎚️ Inferred BPM: ${constraints.bpmRange.min}-${constraints.bpmRange.max}`);
    }
    if (inferredConstraints.genres && (!constraints.genres || constraints.genres.length === 0)) {
      constraints.genres = inferredConstraints.genres;
      console.log(`  🎸 Inferred genres: ${constraints.genres.join(', ')}`);
    }

    const targetCount = calculateTargetTrackCount(constraints);
    console.log(`  🎯 Target: ${targetCount} tracks`);

    console.log(`  📌 Include artists: ${Array.from(includeArtists).join(', ') || 'none'}`);
    console.log(`  📎 Reference artists: ${Array.from(referenceArtists).join(', ') || 'none'}`);

    // Determine target genre families for filtering
    const targetGenreFamilies = getTargetGenreFamilies({
      genres: constraints.genres,
      referenceArtists: Array.from(referenceArtists),
      artists: Array.from(includeArtists),
    });
    console.log(`  🎸 Target genre families: ${targetGenreFamilies.join(', ') || 'any'}`);

    // ============================================
    // STEP 3: SEARCH SPOTIFY FOR INCLUDE ARTISTS
    // ============================================
    if (includeArtists.size > 0 && accessToken) {
      console.log('\n🔍 STEP 3: Searching Spotify for Include artists...');

      for (const artist of includeArtists) {
        const artistTracks = await searchArtistTracks(artist, accessToken, 30);
        let added = 0;
        let filtered = 0;

        for (const track of artistTracks) {
          if (!trackPool.has(track.id)) {
            // Filter out low-quality tracks (karaoke, Various Artists, etc.)
            const { isLowQuality, reason } = isLowQualityTrack(track);
            if (isLowQuality) {
              filtered++;
              continue;
            }

            const playCount = applePlayCounts.get(track.id) || 0;
            trackPool.set(track.id, {
              ...track,
              appleMusicPlayCount: playCount,
              selectionScore: 0,
            });
            added++;
          }
        }
        console.log(`  ✓ ${artist}: added ${added} tracks from Spotify${filtered > 0 ? ` (filtered ${filtered} low-quality)` : ''}`);
      }
    }

    // ============================================
    // STEP 4: CALCULATE SELECTION SCORES
    // ============================================
    console.log('\n📊 STEP 4: Calculating selection scores...');

    for (const [id, track] of trackPool) {
      track.selectionScore = calculateSelectionScore(
        track,
        track.appleMusicPlayCount,
        constraints,
        includeArtists,
        referenceArtists,
        recentlyUsedTracks,
        targetGenreFamilies
      );
    }

    // Count genre-filtered tracks for logging
    const genreFilteredCount = Array.from(trackPool.values()).filter(t => t.selectionScore < -100).length;
    if (genreFilteredCount > 0) {
      console.log(`  🎸 Genre filtered: ${genreFilteredCount} tracks excluded due to incompatible genre`);
    }

    // Sort by score
    const rankedTracks = Array.from(trackPool.values())
      .sort((a, b) => b.selectionScore - a.selectionScore);

    console.log(`  ✓ Ranked ${rankedTracks.length} tracks`);
    console.log(`  Top 5 scores: ${rankedTracks.slice(0, 5).map(t => t.selectionScore.toFixed(1)).join(', ')}`);

    // ============================================
    // STEP 5: SELECT TRACKS WITH VARIETY ENFORCEMENT
    // ============================================
    console.log('\n🎯 STEP 5: Selecting tracks with variety enforcement...');

    const selectedTracks: EnrichedTrack[] = [];
    const selectedArtists = new Map<string, number>(); // artist -> count
    const selectedTrackIds = new Set<string>(); // Prevent duplicate IDs
    const selectedTrackKeys = new Set<string>(); // Prevent duplicate name+artist combos
    const maxPerArtist = Math.max(2, Math.ceil(targetCount / 15)); // At least 15 different artists

    // Smarter Include artist allocation:
    // - Scale down per-artist allocation when there are many Include artists
    // - Cap Include artists at 40% of total playlist
    const includeArtistCount = includeArtists.size;
    const maxIncludeTotal = Math.ceil(targetCount * 0.4); // Max 40% from Include artists
    const tracksPerIncludeArtist = includeArtistCount > 0
      ? Math.min(3, Math.max(1, Math.floor(maxIncludeTotal / includeArtistCount)))
      : 0;

    console.log(`  📊 Balancing: ${tracksPerIncludeArtist} tracks per Include artist (${includeArtistCount} artists, max ${maxIncludeTotal} total)`);

    // Helper to create track key for duplicate detection
    const getTrackKey = (track: EnrichedTrack): string => {
      const name = track.name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim(); // Remove parenthetical
      const artist = track.artists[0]?.name?.toLowerCase() || '';
      return `${name}::${artist}`;
    };

    // First pass: ensure Include artists are represented (with balanced allocation)
    let includeTracksAdded = 0;
    for (const artist of includeArtists) {
      if (includeTracksAdded >= maxIncludeTotal) break;

      const artistTracks = rankedTracks.filter(t =>
        t.artists.some(a => a && a.name && a.name.toLowerCase() === artist)
      );

      const toAdd = artistTracks.slice(0, tracksPerIncludeArtist);
      for (const track of toAdd) {
        if (includeTracksAdded >= maxIncludeTotal) break;
        const trackKey = getTrackKey(track);

        // Skip duplicates (by ID or by name+artist)
        if (selectedTrackIds.has(track.id) || selectedTrackKeys.has(trackKey)) {
          continue;
        }

        if (selectedTracks.length < targetCount) {
          selectedTracks.push(track);
          selectedTrackIds.add(track.id);
          selectedTrackKeys.add(trackKey);
          const mainArtist = track.artists[0]?.name || 'Unknown';
          selectedArtists.set(mainArtist, (selectedArtists.get(mainArtist) || 0) + 1);
          includeTracksAdded++;
        }
      }
    }

    console.log(`  ✓ Added ${includeTracksAdded} tracks from Include artists (${Math.round(includeTracksAdded/targetCount*100)}% of playlist)`);

    // Second pass: fill with highest-scored tracks, enforcing variety
    for (const track of rankedTracks) {
      if (selectedTracks.length >= targetCount) break;

      const trackKey = getTrackKey(track);

      // Skip duplicates (by ID or by name+artist)
      if (selectedTrackIds.has(track.id) || selectedTrackKeys.has(trackKey)) {
        continue;
      }

      // Skip tracks with very negative scores (genre mismatch)
      if (track.selectionScore < -50) {
        continue;
      }

      const mainArtist = track.artists[0]?.name || 'Unknown';
      const artistCount = selectedArtists.get(mainArtist) || 0;

      // Skip if this artist already has too many tracks
      if (artistCount >= maxPerArtist) continue;

      selectedTracks.push(track);
      selectedTrackIds.add(track.id);
      selectedTrackKeys.add(trackKey);
      selectedArtists.set(mainArtist, artistCount + 1);
    }

    console.log(`  ✓ Selected ${selectedTracks.length} tracks`);
    console.log(`  🎨 Artist variety: ${selectedArtists.size} unique artists`);

    // Log artist distribution
    const artistDist = Array.from(selectedArtists.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    console.log(`  Top artists: ${artistDist.map(([a, c]) => `${a}(${c})`).join(', ')}`);

    // ============================================
    // STEP 6: OPTIMIZE ORDER FOR DJ MIXING
    // ============================================
    console.log('\n🔧 STEP 6: Optimizing track order for harmonic mixing...');

    const optimizedPlaylist = optimizeTrackOrder(selectedTracks as SpotifyTrackWithFeatures[], {
      energyCurve: (constraints.energyCurve || energyCurve) as any,
      prioritizeHarmonic: true,
      prioritizeBPM: true,
    });

    const quality = calculatePlaylistQuality(optimizedPlaylist);
    console.log(`  ✓ Harmonic mix: ${quality.harmonicMixPercentage}%`);
    console.log(`  ✓ Quality score: ${quality.avgTransitionScore}/100`);

    // Generate transition metadata for the mix
    console.log('\n🎚️ STEP 6b: Generating transition metadata...');
    const transitions = generatePlaylistTransitions(optimizedPlaylist);
    const mixDifficulty = calculateMixDifficulty(transitions);
    console.log(`  ✓ Mix difficulty: ${mixDifficulty.overall.toUpperCase()}`);
    console.log(`  ✓ Transitions: ${mixDifficulty.easyCount} easy, ${mixDifficulty.mediumCount} medium, ${mixDifficulty.hardCount} hard`);
    if (mixDifficulty.problemTransitions.length > 0) {
      console.log(`  ⚠️ Problem transitions at positions: ${mixDifficulty.problemTransitions.map(i => i + 1).join(', ')}`);
    }

    // ============================================
    // STEP 7: CREATE SPOTIFY PLAYLIST
    // ============================================
    console.log('\n📝 STEP 7: Creating Spotify playlist...');

    // Generate name (Claude - good at this)
    let playlistName: string;
    let playlistDescription: string;

    try {
      const characteristics = extractPlaylistCharacteristics(optimizedPlaylist, constraints, prompt);
      const nameResult = await generatePlaylistName(characteristics, prompt, 'creative');
      playlistName = `🎧 DAD: ${nameResult.withBranding}`;
      playlistDescription = `${nameResult.description}\n\n🤖 Deterministic Selection • ${quality.harmonicMixPercentage}% harmonic • ${selectedArtists.size} artists`;
    } catch {
      const characteristics = extractPlaylistCharacteristics(optimizedPlaylist, constraints, prompt);
      const fallback = generateSimpleName(characteristics, prompt);
      playlistName = `🎧 DAD: ${fallback.withBranding}`;
      playlistDescription = fallback.description;
    }

    // Sanitize
    playlistName = playlistName
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);

    playlistDescription = playlistDescription
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 300);

    console.log(`  Name: ${playlistName}`);

    // Create playlist
    const playlistResponse = await fetch(
      `https://api.spotify.com/v1/users/${user.id}/playlists`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: playlistName,
          description: playlistDescription,
          public: false,
        }),
      }
    );

    if (!playlistResponse.ok) {
      const errorBody = await playlistResponse.text();
      console.error('❌ Playlist creation failed:', errorBody);
      return NextResponse.json({
        error: 'Failed to create playlist',
        details: errorBody,
      }, { status: 500 });
    }

    const playlist = await playlistResponse.json();

    // Add tracks
    const trackUris = optimizedPlaylist.map(t => `spotify:track:${t.id}`);
    console.log(`  Adding ${trackUris.length} tracks...`);

    const addTracksResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: trackUris }),
      }
    );

    if (!addTracksResponse.ok) {
      const errorBody = await addTracksResponse.text();
      console.error('❌ Failed to add tracks:', errorBody);
      return NextResponse.json({
        error: 'Failed to add tracks',
        details: errorBody,
      }, { status: 500 });
    }

    // ============================================
    // STEP 8: GENERATE COVER ART
    // ============================================
    let coverArtUrl: string | undefined;
    try {
      console.log('\n🎨 STEP 8: Generating cover art...');
      const characteristics = extractPlaylistCharacteristics(optimizedPlaylist, constraints, prompt);
      coverArtUrl = await generateAndUploadCoverArt(
        {
          playlistName,
          emoji: '🎧',
          genres: characteristics.genres,
          vibe: playlistDescription,
          energy: characteristics.energyRange.max,
          topArtists: characteristics.topArtists,
        },
        playlist.id,
        accessToken!
      );
      console.log('  ✓ Cover art uploaded');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.warn('  ⚠️ Cover art failed:', errorMessage);
      console.warn('  Stack:', errorStack);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log(`✅ PLAYLIST CREATED IN ${duration}s`);
    console.log(`   ${playlist.external_urls.spotify}`);
    console.log('='.repeat(60) + '\n');

    // Record used tracks for deduplication (async, non-blocking)
    const trackIds = optimizedPlaylist.map(t => t.id);
    recordUsedTracks(trackIds, playlist.id, userHash)
      .then(() => console.log('📝 Track history recorded'))
      .catch(e => console.warn('⚠️ Failed to record track history:', e));

    // Occasional cleanup of old entries (1% chance per request)
    if (Math.random() < 0.01) {
      cleanupOldTrackHistory().catch(e => console.warn('⚠️ Cleanup failed:', e));
    }

    // Generate full mix recipe
    const mixRecipe = generateMixRecipe(
      optimizedPlaylist,
      playlistName,
      playlist.id,
      quality.harmonicMixPercentage,
      quality.avgTransitionScore
    );

    // Generate quick cue sheet
    const cueSheet = exportCueSheet(mixRecipe);

    // 🎭 NEW: Find mashup opportunities in the playlist
    console.log('\n🎭 Analyzing mashup opportunities...');
    const mashupTracks: MashupableTrack[] = optimizedPlaylist
      .filter(t => {
        const hasBPM = t.mikData?.bpm || t.tempo;
        const hasKey = t.camelotKey;
        const hasEnergy = t.energy !== undefined;
        const hasArtist = t.artists?.[0]?.name;
        return hasBPM && hasKey && hasEnergy && hasArtist;
      })
      .map(t => ({
        id: t.id,
        name: t.name,
        artist: t.artists![0]!.name,
        bpm: t.mikData?.bpm || t.tempo || 120, // Fallback to MIK or Spotify tempo
        camelotKey: t.camelotKey!,
        energy: t.energy!,
        instrumentalness: t.instrumentalness,
        acousticness: t.acousticness,
        speechiness: t.speechiness,
        danceability: t.danceability,
        valence: t.valence,
      }));

    const mashupPairs = findMashupPairs(mashupTracks, {
      minCompatibilityScore: 75, // Good quality mashups
      maxBPMDifference: 0.06,
    });

    // Filter to diverse artist pairs only
    const diverseMashups = mashupPairs.filter(
      pair => pair.track1.artist !== pair.track2.artist
    ).slice(0, 10); // Top 10 mashup opportunities

    console.log(`   Found ${mashupPairs.length} total mashup pairs`);
    console.log(`   Including ${diverseMashups.length} diverse artist mashups`);

    const response = NextResponse.json({
      playlistUrl: playlist.external_urls.spotify,
      playlistId: playlist.id,
      playlistName: playlist.name,
      coverArtUrl,
      trackCount: optimizedPlaylist.length,
      artistCount: selectedArtists.size,
      quality,
      constraints: summarizeConstraints(constraints),
      message: `Created with ${selectedArtists.size} different artists • ${quality.harmonicMixPercentage}% harmonic mix • ${mixDifficulty.overall} difficulty`,
      tracks: optimizedPlaylist,
      // NEW: Mix recipe with transition data
      mixRecipe: {
        difficulty: mixDifficulty.overall,
        transitions: transitions.slice(0, 5), // First 5 transitions in response
        transitionSummary: {
          easy: mixDifficulty.easyCount,
          medium: mixDifficulty.mediumCount,
          hard: mixDifficulty.hardCount,
          problemPositions: mixDifficulty.problemTransitions,
        },
        bpmRange: mixRecipe.bpmRange,
        cueSheet, // Quick reference for DJs
      },
      // 🎭 NEW: Mashup opportunities
      mashupOpportunities: diverseMashups.length > 0 ? {
        count: diverseMashups.length,
        totalPairs: mashupPairs.length,
        pairs: diverseMashups.map(pair => ({
          track1: {
            name: pair.track1.name,
            artist: pair.track1.artist,
            bpm: Math.round(pair.track1.bpm),
            key: pair.track1.camelotKey,
          },
          track2: {
            name: pair.track2.name,
            artist: pair.track2.artist,
            bpm: Math.round(pair.track2.bpm),
            key: pair.track2.camelotKey,
          },
          compatibility: pair.compatibility.overallScore,
          difficulty: pair.compatibility.difficulty,
          notes: pair.mixingNotes.slice(0, 3), // Top 3 mixing notes
        })),
      } : null,
    });

    // Update cookie if token was refreshed
    if (accessToken && accessToken !== request.cookies.get('spotify_access_token')?.value) {
      response.cookies.set('spotify_access_token', accessToken, {
        httpOnly: true,
        secure: true,
        maxAge: 3600,
        sameSite: 'lax',
        path: '/',
      });
    }

    return response;

  } catch (error) {
    console.error('Error generating playlist:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
}
