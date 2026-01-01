import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { SpotifyTrackWithFeatures } from '@/lib/types';
import { optimizeTrackOrder, calculatePlaylistQuality } from '@/lib/automix-optimizer';
import { spotifyToCamelot } from '@/lib/camelot-wheel';
import {
  extractPlaylistConstraints,
  filterTracksByConstraints,
  summarizeConstraints,
} from '@/lib/playlist-nlp';
import {
  selectTracksWithClaude,
  getUserTopArtists,
} from '@/lib/enhanced-track-selector';
import {
  extractSpotifyPlaylistId,
  fetchSpotifyPlaylist,
  analyzePlaylistCharacteristics,
  describePlaylist,
} from '@/lib/playlist-seed-parser';
import {
  getSampleBeatportChart,
  findBeatportTracksInLibrary,
} from '@/lib/beatport-scraper';
import {
  generatePlaylistName,
  extractPlaylistCharacteristics,
  generateSimpleName,
} from '@/lib/playlist-namer';
import { generateAndUploadCoverArt } from '@/lib/cover-art-generator';
import { searchMultipleArtists } from '@/lib/spotify-artist-search';
import {
  buildEnhancedTrackPool,
  mapToSpotifyGenres,
} from '@/lib/spotify-recommendations';

const STORAGE_PATH = path.join(process.cwd(), 'data', 'matched-tracks.json');

interface SpotifyUser {
  id: string;
  display_name: string;
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

export async function POST(request: NextRequest) {
  try {
    const { prompt, energyCurve = 'wave' } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    let accessToken = request.cookies.get('spotify_access_token')?.value;
    const refreshToken = request.cookies.get('spotify_refresh_token')?.value;

    console.log('🔍 Cookie check:', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      accessTokenLength: accessToken?.length,
      allCookies: request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })),
    });

    if (!accessToken && !refreshToken) {
      console.error('❌ No auth cookies found');
      return NextResponse.json({
        error: 'Not authenticated. Please log in again.',
        debug: {
          foundCookies: request.cookies.getAll().map(c => c.name),
        }
      }, { status: 401 });
    }

    // Fetch user profile (with token refresh if needed)
    let userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // If unauthorized and we have a refresh token, try to refresh
    if (!userResponse.ok && userResponse.status === 401 && refreshToken) {
      console.log('🔄 Access token expired, refreshing...');
      const newTokenData = await refreshAccessToken(refreshToken);

      if (!newTokenData) {
        return NextResponse.json({ error: 'Failed to refresh token. Please log in again.' }, { status: 401 });
      }

      accessToken = newTokenData.access_token;

      // Retry user profile fetch with new token
      userResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('User profile fetch failed:', {
        status: userResponse.status,
        statusText: userResponse.statusText,
        body: errorText,
        hasAccessToken: !!accessToken,
        accessTokenLength: accessToken?.length,
        hasRefreshToken: !!refreshToken,
      });
      return NextResponse.json({
        error: 'Failed to fetch user profile. Please try logging in again.',
        debug: {
          status: userResponse.status,
          hasToken: !!accessToken,
          tokenLength: accessToken?.length,
          errorDetail: errorText.substring(0, 200),
        }
      }, { status: 500 });
    }

    const user: SpotifyUser = await userResponse.json();

    // Load MIK matched tracks or fall back to Spotify library
    let availableTracks: SpotifyTrackWithFeatures[] = [];

    try {
      const data = await fs.readFile(STORAGE_PATH, 'utf-8');
      const matchedData = JSON.parse(data);
      availableTracks = matchedData.tracks.map((t: any) => t.spotifyTrack);
      console.log(`Loaded ${availableTracks.length} MIK-matched tracks`);
    } catch (error) {
      console.log('No MIK data found, using Spotify library');

      // Fetch user's top tracks
      const topTracksResponse = await fetch(
        'https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (topTracksResponse.ok) {
        const topTracksData = await topTracksResponse.json();
        availableTracks = topTracksData.items;
      }
    }

    // Fetch audio features for all tracks
    const trackIds = availableTracks.map(t => t.id).filter(Boolean);

    if (trackIds.length > 0) {
      const audioFeaturesResponse = await fetch(
        `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (audioFeaturesResponse.ok) {
        const audioFeaturesData = await audioFeaturesResponse.json();

        availableTracks = availableTracks.map((track, index) => {
          const features = audioFeaturesData.audio_features[index];

          if (!features) return track;

          return {
            ...track,
            ...features,
            // Use MIK camelot key if available, otherwise convert Spotify key
            camelotKey: track.camelotKey || (
              features.key !== null && features.mode !== null
                ? spotifyToCamelot(features.key, features.mode)
                : undefined
            ),
          };
        });
      }
    }

    // ============================================
    // ENHANCED TWO-PASS SYSTEM
    // ============================================

    // PASS 1: Extract structured constraints from natural language
    console.log('🔍 PASS 1: Extracting constraints from prompt...');
    let constraints = await extractPlaylistConstraints(prompt);
    console.log('✓ Constraints extracted:', summarizeConstraints(constraints));

    // Handle seed playlist if provided
    if (constraints.seedPlaylistUrl) {
      console.log('🎵 Seed playlist detected, analyzing...');
      const playlistId = extractSpotifyPlaylistId(constraints.seedPlaylistUrl);

      if (playlistId && accessToken) {
        try {
          const seedPlaylist = await fetchSpotifyPlaylist(playlistId, accessToken);
          console.log(`✓ Fetched seed playlist: "${seedPlaylist.name}" (${seedPlaylist.tracks.length} tracks)`);

          const analysis = analyzePlaylistCharacteristics(seedPlaylist.tracks);
          console.log(`✓ Analysis: ${analysis.commonArtists.length} common artists, ${analysis.avgBPM} BPM avg`);

          // Merge seed analysis with extracted constraints
          constraints = {
            ...constraints,
            seedPlaylistId: playlistId,
            // Use seed characteristics if not explicitly specified
            referenceArtists: constraints.referenceArtists || analysis.commonArtists,
            bpmRange: constraints.bpmRange || analysis.bpmRange,
            energyRange: constraints.energyRange || {
              min: Math.round(analysis.energyRange.min * 10),
              max: Math.round(analysis.energyRange.max * 10),
            },
            genres: constraints.genres || analysis.genres,
          };

          // Enhance prompt with playlist description
          const playlistDesc = describePlaylist(analysis, seedPlaylist.name);
          constraints.originalPrompt = `${prompt}\n\nSeed playlist analysis: ${playlistDesc}`;

          console.log('✓ Enhanced constraints with seed playlist data');
        } catch (error) {
          console.warn('⚠️  Failed to fetch seed playlist:', error);
        }
      }
    }

    // Handle Beatport chart if requested
    if (constraints.useBeatportChart && constraints.beatportGenre && accessToken) {
      console.log(`📊 Fetching Beatport ${constraints.beatportGenre} chart...`);
      try {
        // Get sample Beatport chart (in production, this would scrape the actual chart)
        const beatportChart = getSampleBeatportChart(constraints.beatportGenre);
        console.log(`✓ Loaded ${beatportChart.tracks.length} Beatport chart tracks`);

        if (beatportChart.tracks.length > 0) {
          // Match Beatport tracks to user's Spotify library
          const matches = await findBeatportTracksInLibrary(
            beatportChart.tracks,
            availableTracks,
            accessToken
          );

          console.log(`✓ Matched ${matches.length} Beatport tracks to library`);

          // Add matched Beatport tracks as reference artists
          if (matches.length > 0) {
            const beatportArtists = matches
              .flatMap(m => m.spotify.artists.map(a => a.name))
              .filter((v, i, a) => a.indexOf(v) === i) // unique
              .slice(0, 10);

            constraints.referenceArtists = [
              ...(constraints.referenceArtists || []),
              ...beatportArtists,
            ];

            // Update prompt context
            constraints.originalPrompt += `\n\nBeatport ${constraints.beatportGenre} chart influence: ${beatportArtists.slice(0, 5).join(', ')}`;

            console.log(`✓ Added ${beatportArtists.length} Beatport artists as references`);
          }
        }
      } catch (error) {
        console.warn('⚠️  Failed to fetch Beatport chart:', error);
        // Continue without Beatport data
      }
    }

    // Apply constraints to filter available tracks
    console.log(`📊 Filtering ${availableTracks.length} tracks by constraints...`);
    let filteredTracks = filterTracksByConstraints(availableTracks, constraints);
    console.log(`✓ ${filteredTracks.length} tracks match constraints`);

    // ============================================
    // SPOTIFY CATALOG SEARCH FOR INCLUDE ARTISTS
    // ============================================
    // Key improvement: Search Spotify for Include artists instead of only using library
    if (constraints.artists && constraints.artists.length > 0 && accessToken) {
      console.log(`🔍 Searching Spotify catalog for Include artists: ${constraints.artists.join(', ')}`);

      // Create set of user library track IDs for prioritization
      const userLibraryIds = new Set(availableTracks.map(t => t.id));

      // Create map of MIK data for enhanced track info
      const mikDataMap = new Map<string, any>();
      availableTracks.forEach(t => {
        if (t.camelotKey || t.tempo) {
          mikDataMap.set(t.id, {
            bpm: t.tempo,
            camelotKey: t.camelotKey,
            energy: t.energy,
          });
        }
      });

      try {
        // Search Spotify for all tracks from Include artists
        const { tracks: spotifySearchTracks, artistResults } = await searchMultipleArtists(
          constraints.artists,
          accessToken,
          {
            tracksPerArtist: 30, // Get up to 30 tracks per Include artist
            userLibraryIds,
            mikDataMap,
          }
        );

        console.log(`✓ Found ${spotifySearchTracks.length} tracks from Include artists via Spotify search`);

        // Log per-artist results
        for (const [artist, tracks] of artistResults) {
          const inLibrary = tracks.filter(t => t.inUserLibrary).length;
          const withMik = tracks.filter(t => t.hasMikData).length;
          console.log(`  • ${artist}: ${tracks.length} tracks (${inLibrary} in library, ${withMik} with MIK data)`);
        }

        // Merge Spotify search results with library tracks
        // Priority: Library tracks with MIK data > Library tracks > Spotify search
        const mergedTracks = new Map<string, SpotifyTrackWithFeatures>();

        // First, add all library tracks (highest priority)
        for (const track of filteredTracks) {
          mergedTracks.set(track.id, track);
        }

        // Then, add Spotify search results (won't overwrite library tracks due to Map behavior)
        for (const track of spotifySearchTracks) {
          if (!mergedTracks.has(track.id)) {
            mergedTracks.set(track.id, track as SpotifyTrackWithFeatures);
          }
        }

        filteredTracks = Array.from(mergedTracks.values());
        console.log(`✓ Merged pool: ${filteredTracks.length} total tracks`);

        // Summarize track sources
        const libraryTracks = filteredTracks.filter(t => userLibraryIds.has(t.id)).length;
        const searchTracks = filteredTracks.length - libraryTracks;
        console.log(`  Sources: ${libraryTracks} from library, ${searchTracks} from Spotify search`);

      } catch (error) {
        console.warn('⚠️  Spotify search failed, using library only:', error);
        // Continue with library tracks if search fails
      }
    }

    // Check if we have enough tracks
    if (constraints.artists && constraints.artists.length > 0) {
      if (filteredTracks.length === 0) {
        return NextResponse.json({
          error: `No tracks found from required artists: ${constraints.artists.join(', ')}`,
          hint: 'Try using "Reference:" instead of "Include:" to use these artists as a style guide.',
          constraints: summarizeConstraints(constraints),
        }, { status: 404 });
      }

      // If still very few tracks, convert to Reference for better playlist
      if (filteredTracks.length < 15) {
        console.warn(`⚠️  Only ${filteredTracks.length} tracks from Include artists - expanding pool with Reference approach`);

        // Keep Include artists but also search for similar tracks
        constraints.referenceArtists = [
          ...(constraints.referenceArtists || []),
          ...constraints.artists
        ];

        // Also add general library tracks to the pool for variety
        const generalTracks = filterTracksByConstraints(availableTracks, {
          ...constraints,
          artists: undefined, // Remove Include requirement for this filter
        });

        // Merge general tracks with Include artist tracks
        const includeTrackIds = new Set(filteredTracks.map(t => t.id));
        for (const track of generalTracks.slice(0, 100)) {
          if (!includeTrackIds.has(track.id)) {
            filteredTracks.push(track);
          }
        }

        console.log(`✓ Expanded to ${filteredTracks.length} tracks (Include artists + reference pool)`);
      }
    }

    // ============================================
    // SPOTIFY ENGINES: Recommendations + Related Artists + Liked Songs
    // ============================================
    // Use Spotify's AI to expand the track pool with taste-matched tracks
    if (accessToken) {
      console.log('\n🚀 Engaging Spotify engines for enhanced discovery...');

      // Map mood/vibe keywords to Spotify genre seeds
      const spotifyGenres = mapToSpotifyGenres([
        ...(constraints.genres || []),
        ...(constraints.moods || []),
      ]);

      // Determine mood for Spotify tuning
      let spotifyMood: 'energetic' | 'chill' | 'dark' | 'uplifting' | undefined;
      const moodKeywords = constraints.moods?.join(' ') || '';
      if (moodKeywords) {
        const moodLower = moodKeywords.toLowerCase();
        if (moodLower.includes('energ') || moodLower.includes('pump') || moodLower.includes('hype')) {
          spotifyMood = 'energetic';
        } else if (moodLower.includes('chill') || moodLower.includes('relax') || moodLower.includes('mellow')) {
          spotifyMood = 'chill';
        } else if (moodLower.includes('dark') || moodLower.includes('deep') || moodLower.includes('underground')) {
          spotifyMood = 'dark';
        } else if (moodLower.includes('happy') || moodLower.includes('uplift') || moodLower.includes('positive')) {
          spotifyMood = 'uplifting';
        }
      }

      try {
        const { tracks: enhancedTracks, sources } = await buildEnhancedTrackPool(
          accessToken,
          {
            includeArtists: constraints.artists,
            referenceArtists: constraints.referenceArtists,
            targetBpm: constraints.bpmRange
              ? Math.round((constraints.bpmRange.min + constraints.bpmRange.max) / 2)
              : undefined,
            bpmRange: constraints.bpmRange,
            energyRange: constraints.energyRange,
            mood: spotifyMood,
            genres: spotifyGenres,
            includeLikedSongs: true,
            maxTracks: 300,
          }
        );

        // Merge Spotify engine tracks with existing pool
        const existingIds = new Set(filteredTracks.map(t => t.id));
        let addedFromSpotify = 0;

        for (const track of enhancedTracks) {
          if (!existingIds.has(track.id)) {
            filteredTracks.push(track as SpotifyTrackWithFeatures);
            existingIds.add(track.id);
            addedFromSpotify++;
          }
        }

        console.log(`✅ Spotify engines added ${addedFromSpotify} new tracks to pool`);
        console.log(`   Total pool now: ${filteredTracks.length} tracks`);

      } catch (error) {
        console.warn('⚠️ Spotify engines failed (continuing with existing pool):', error);
      }
    }

    // Fallback: if still too few tracks, use full library
    if (filteredTracks.length < 30) {
      console.warn('⚠️  Too few matches, using full library...');
      filteredTracks = availableTracks;
    }

    // Fetch user's top artists for personalization
    console.log('⭐ Fetching user preferences...');
    const topArtists = accessToken ? await getUserTopArtists(accessToken) : [];
    console.log(`✓ Found ${topArtists.length} top artists`);

    // PASS 2: Intelligent track selection with Claude
    console.log('🎵 PASS 2: Selecting optimal tracks with Claude...');
    const selectedIds = await selectTracksWithClaude(
      filteredTracks,
      constraints,
      topArtists
    );
    console.log(`✓ Selected ${selectedIds.length} tracks`);

    // Get selected tracks with full features (preserve order, remove duplicates)
    const selectedTracks: SpotifyTrackWithFeatures[] = [];
    const seenIds = new Set<string>();

    for (const id of selectedIds) {
      if (!seenIds.has(id)) {
        const track = filteredTracks.find(t => t.id === id);
        if (track) {
          selectedTracks.push(track);
          seenIds.add(id);
        }
      }
    }

    // Optimize track order for automix
    console.log('🔧 Optimizing track order for automix...');
    const optimizedPlaylist = optimizeTrackOrder(selectedTracks, {
      energyCurve: (constraints.energyCurve || energyCurve) as any,
      prioritizeHarmonic: true,
      prioritizeBPM: true,
    });

    // Calculate playlist quality metrics
    const quality = calculatePlaylistQuality(optimizedPlaylist);

    // Generate smart playlist name with AI
    console.log('🎨 Generating creative playlist name...');
    let playlistName;
    let playlistDescription;

    try {
      const characteristics = extractPlaylistCharacteristics(optimizedPlaylist, constraints, prompt);
      const nameResult = await generatePlaylistName(characteristics, prompt, 'creative');

      playlistName = `🎧 DAD: ${nameResult.withBranding}`;
      playlistDescription = `${nameResult.description}\n\n🤖 2-Pass AI Curated • ${quality.harmonicMixPercentage}% harmonic • Score: ${quality.avgTransitionScore}/100 • djay Pro optimized`;

      console.log(`✓ Generated name: "${playlistName}"`);
    } catch (error) {
      console.warn('⚠️  Smart naming failed, using fallback:', error);
      const characteristics = extractPlaylistCharacteristics(optimizedPlaylist, constraints, prompt);
      const fallback = generateSimpleName(characteristics, prompt);
      playlistName = `🎧 DAD: ${fallback.withBranding}`;
      playlistDescription = `${fallback.description}\n\n🤖 2-Pass AI Curated • ${quality.harmonicMixPercentage}% harmonic • Score: ${quality.avgTransitionScore}/100`;
    }

    // Sanitize and validate playlist name and description for Spotify API
    // Remove problematic characters and normalize whitespace
    playlistName = playlistName
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    playlistDescription = playlistDescription
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .replace(/\n/g, ' ') // Replace newlines with spaces for Spotify API compatibility
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Validate length (Spotify limits)
    if (playlistName.length > 100) {
      playlistName = playlistName.substring(0, 97) + '...';
      console.warn('⚠️  Playlist name truncated to 100 chars');
    }
    if (playlistDescription.length > 300) {
      playlistDescription = playlistDescription.substring(0, 297) + '...';
      console.warn('⚠️  Playlist description truncated to 300 chars');
    }

    // Create Spotify playlist
    console.log('📝 Creating Spotify playlist...');
    console.log('  Name:', playlistName);
    console.log('  Name length:', playlistName.length, 'chars');
    console.log('  Description:', playlistDescription.substring(0, 100) + '...');
    console.log('  Description length:', playlistDescription.length, 'chars');
    console.log('  User ID:', user.id);

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
      console.error('❌ Spotify playlist creation failed:', {
        status: playlistResponse.status,
        statusText: playlistResponse.statusText,
        body: errorBody,
        userId: user.id,
        playlistName,
      });
      return NextResponse.json({
        error: 'Failed to create playlist',
        details: errorBody,
        status: playlistResponse.status,
        hint: playlistResponse.status === 401 ? 'Token may have expired' : undefined
      }, { status: 500 });
    }

    const playlist = await playlistResponse.json();

    // Add tracks in optimized order
    const trackUris = optimizedPlaylist.map(t => `spotify:track:${t.id}`);
    console.log(`🎵 Adding ${trackUris.length} tracks to playlist...`);

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
      console.error('❌ Failed to add tracks to playlist:', {
        status: addTracksResponse.status,
        statusText: addTracksResponse.statusText,
        body: errorBody,
        playlistId: playlist.id,
        trackCount: trackUris.length,
      });
      return NextResponse.json({
        error: 'Failed to add tracks',
        details: errorBody,
        status: addTracksResponse.status,
        playlistId: playlist.id
      }, { status: 500 });
    }
    console.log('✓ Tracks added successfully');

    // Generate and upload cover art
    let coverArtUrl: string | undefined;
    try {
      console.log('🎨 Generating AI cover art...');
      const characteristics = extractPlaylistCharacteristics(optimizedPlaylist, constraints, prompt);

      coverArtUrl = await generateAndUploadCoverArt(
        {
          playlistName: playlistName,
          emoji: playlistName.charAt(0), // Extract emoji from playlist name
          genres: characteristics.genres,
          vibe: playlistDescription,
          energy: characteristics.energyRange.max,
          topArtists: characteristics.topArtists,
          beatportGenre: constraints.beatportGenre,
        },
        playlist.id,
        accessToken!
      );
      console.log('✅ Cover art uploaded!');
    } catch (error) {
      console.warn('⚠️  Cover art generation failed (continuing anyway):', error);
      // Don't fail the whole request if cover art fails
    }

    console.log('✅ Playlist created successfully!');

    const response = NextResponse.json({
      playlistUrl: playlist.external_urls.spotify,
      playlistId: playlist.id,
      playlistName: playlist.name,
      coverArtUrl,
      trackCount: optimizedPlaylist.length,
      quality,
      constraints: summarizeConstraints(constraints),
      personalizedWith: topArtists.length,
      message: `🎉 Created with 2-pass AI curation: ${quality.harmonicMixPercentage}% harmonic mix, ${quality.avgTransitionScore}/100 quality score`,
      // Include tracks for export
      tracks: optimizedPlaylist,
    });

    // If token was refreshed, update the cookie
    if (accessToken && accessToken !== request.cookies.get('spotify_access_token')?.value) {
      response.cookies.set('spotify_access_token', accessToken, {
        httpOnly: true,
        secure: true,
        maxAge: 3600, // 1 hour
        sameSite: 'lax',
        path: '/',
      });
      console.log('🔄 Updated access token cookie');
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
