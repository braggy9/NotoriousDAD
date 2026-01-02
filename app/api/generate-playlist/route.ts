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

const MIK_DATA_PATH = path.join(process.cwd(), 'data', 'matched-tracks.json');
const APPLE_MUSIC_CHECKPOINT_PATH = path.join(process.cwd(), 'data', 'apple-music-checkpoint.json');

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
 * - Apple Music playcount (normalized 0-40 points) - what you actually play
 * - MIK data presence (20 points) - professional analysis available
 * - Constraint match (0-20 points) - fits BPM/energy/genre
 * - Artist match (20 points) - matches Include/Reference artists
 * - Randomness (0-10 points) - variety
 */
function calculateSelectionScore(
  track: SpotifyTrackWithFeatures,
  applePlayCount: number,
  constraints: any,
  includeArtists: Set<string>,
  referenceArtists: Set<string>
): number {
  let score = 0;

  // 1. Apple Music playcount (0-40 points) - MOST IMPORTANT
  // Normalize: 0 plays = 0, 10+ plays = 40 points
  score += Math.min(applePlayCount * 4, 40);

  // 2. MIK data presence (20 points)
  if (track.mikData || track.camelotKey) {
    score += 20;
  }

  // 3. Constraint matching (0-20 points)
  let constraintScore = 20; // Start with full points, subtract for mismatches

  if (constraints.bpmRange && track.tempo) {
    const bpm = track.tempo;
    if (bpm < constraints.bpmRange.min || bpm > constraints.bpmRange.max) {
      constraintScore -= 10;
    }
  }

  if (constraints.energyRange && track.energy !== undefined) {
    const energy = track.energy * 10; // Normalize to 0-10
    if (energy < constraints.energyRange.min || energy > constraints.energyRange.max) {
      constraintScore -= 10;
    }
  }

  score += Math.max(0, constraintScore);

  // 4. Artist match (20 points for Include, 10 for Reference)
  const trackArtists = track.artists.map(a => a.name.toLowerCase());

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
    const { prompt, energyCurve = 'wave' } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎵 DETERMINISTIC PLAYLIST GENERATOR v2.0');
    console.log('='.repeat(60));
    console.log(`📝 Prompt: "${prompt}"`);

    let accessToken = request.cookies.get('spotify_access_token')?.value;
    let refreshToken = request.cookies.get('spotify_refresh_token')?.value;

    // Fallback: Accept tokens from request body (for iOS/macOS apps)
    if (!accessToken && !refreshToken) {
      const body = await request.clone().json().catch(() => ({}));
      if (body.access_token || body.refresh_token) {
        accessToken = body.access_token;
        refreshToken = body.refresh_token;
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
    for (const track of mikTracks) {
      const playCount = applePlayCounts.get(track.id) || 0;
      trackPool.set(track.id, {
        ...track,
        appleMusicPlayCount: playCount,
        selectionScore: 0,
      });
    }
    console.log(`  📊 MIK pool: ${trackPool.size} tracks`);

    // Source B: ALL Apple Music matched tracks (34k+ from your full library)
    let addedFromApple = 0;
    let withPlaycount = 0;

    for (const match of appleMatches) {
      const spotifyTrack = match.spotifyTrack;
      const appleTrack = match.appleMusicTrack;

      if (spotifyTrack?.id && !trackPool.has(spotifyTrack.id)) {
        const playCount = parseInt(appleTrack?.playCount || '0') || 0;
        if (playCount > 0) withPlaycount++;

        trackPool.set(spotifyTrack.id, {
          id: spotifyTrack.id,
          uri: spotifyTrack.uri || `spotify:track:${spotifyTrack.id}`,
          name: spotifyTrack.name || appleTrack?.name || 'Unknown',
          artists: spotifyTrack.artists || [{ name: appleTrack?.artist || 'Unknown' }],
          album: spotifyTrack.album || { name: appleTrack?.album || 'Unknown' },
          popularity: spotifyTrack.popularity || 0,
          duration_ms: spotifyTrack.duration_ms || 0,
          source: 'liked-songs',
          appleMusicPlayCount: playCount,
          selectionScore: 0,
        } as EnrichedTrack);
        addedFromApple++;
      }
    }
    console.log(`  📊 Added ${addedFromApple} Apple Music tracks (${withPlaycount} with playcounts)`);

    console.log(`  📊 Total pool: ${trackPool.size} tracks`);

    // ============================================
    // STEP 2: PARSE CONSTRAINTS (Claude - good at this)
    // ============================================
    console.log('\n🧠 STEP 2: Parsing constraints with Claude...');
    const constraints = await extractPlaylistConstraints(prompt);
    console.log(`  ✓ ${summarizeConstraints(constraints)}`);

    const targetCount = calculateTargetTrackCount(constraints);
    console.log(`  🎯 Target: ${targetCount} tracks`);

    // Build artist sets for matching
    const includeArtists = new Set(
      (constraints.artists || []).map((a: string) => a.toLowerCase())
    );
    const referenceArtists = new Set(
      (constraints.referenceArtists || []).map((a: string) => a.toLowerCase())
    );

    console.log(`  📌 Include artists: ${Array.from(includeArtists).join(', ') || 'none'}`);
    console.log(`  📎 Reference artists: ${Array.from(referenceArtists).join(', ') || 'none'}`);

    // ============================================
    // STEP 3: SEARCH SPOTIFY FOR INCLUDE ARTISTS
    // ============================================
    if (includeArtists.size > 0 && accessToken) {
      console.log('\n🔍 STEP 3: Searching Spotify for Include artists...');

      for (const artist of includeArtists) {
        const artistTracks = await searchArtistTracks(artist, accessToken, 30);
        let added = 0;

        for (const track of artistTracks) {
          if (!trackPool.has(track.id)) {
            const playCount = applePlayCounts.get(track.id) || 0;
            trackPool.set(track.id, {
              ...track,
              appleMusicPlayCount: playCount,
              selectionScore: 0,
            });
            added++;
          }
        }
        console.log(`  ✓ ${artist}: added ${added} tracks from Spotify`);
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
        referenceArtists
      );
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
    const maxPerArtist = Math.max(3, Math.ceil(targetCount / 10)); // At least 10 different artists

    // First pass: ensure Include artists are represented
    for (const artist of includeArtists) {
      const artistTracks = rankedTracks.filter(t =>
        t.artists.some(a => a.name.toLowerCase() === artist)
      );

      const toAdd = artistTracks.slice(0, Math.min(3, maxPerArtist)); // 3 tracks per Include artist
      for (const track of toAdd) {
        if (selectedTracks.length < targetCount && !selectedTracks.find(t => t.id === track.id)) {
          selectedTracks.push(track);
          const mainArtist = track.artists[0]?.name || 'Unknown';
          selectedArtists.set(mainArtist, (selectedArtists.get(mainArtist) || 0) + 1);
        }
      }
    }

    console.log(`  ✓ Added ${selectedTracks.length} tracks from Include artists`);

    // Second pass: fill with highest-scored tracks, enforcing variety
    for (const track of rankedTracks) {
      if (selectedTracks.length >= targetCount) break;
      if (selectedTracks.find(t => t.id === track.id)) continue;

      const mainArtist = track.artists[0]?.name || 'Unknown';
      const artistCount = selectedArtists.get(mainArtist) || 0;

      // Skip if this artist already has too many tracks
      if (artistCount >= maxPerArtist) continue;

      selectedTracks.push(track);
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
      console.warn('  ⚠️ Cover art failed:', error);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(60));
    console.log(`✅ PLAYLIST CREATED IN ${duration}s`);
    console.log(`   ${playlist.external_urls.spotify}`);
    console.log('='.repeat(60) + '\n');

    const response = NextResponse.json({
      playlistUrl: playlist.external_urls.spotify,
      playlistId: playlist.id,
      playlistName: playlist.name,
      coverArtUrl,
      trackCount: optimizedPlaylist.length,
      artistCount: selectedArtists.size,
      quality,
      constraints: summarizeConstraints(constraints),
      message: `Created with ${selectedArtists.size} different artists • ${quality.harmonicMixPercentage}% harmonic mix`,
      tracks: optimizedPlaylist,
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
