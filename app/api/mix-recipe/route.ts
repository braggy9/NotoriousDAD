import { NextRequest, NextResponse } from 'next/server';
import { PlaylistTrack } from '@/lib/types';
import {
  generatePlaylistTransitions,
  calculateMixDifficulty,
  generateMixNotes,
} from '@/lib/transition-analyzer';
import {
  generateMixRecipe,
  exportMixRecipeJSON,
  exportMixRecipeMarkdown,
  exportCueSheet,
} from '@/lib/mix-recipe';

/**
 * GET /api/mix-recipe?playlistId=xxx&format=json|markdown|cuesheet
 *
 * Fetches a Spotify playlist and generates a full mix recipe with
 * transition recommendations.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const playlistId = searchParams.get('playlistId');
  const format = searchParams.get('format') || 'json';

  if (!playlistId) {
    return NextResponse.json({ error: 'playlistId is required' }, { status: 400 });
  }

  // Get access token
  let accessToken = request.cookies.get('spotify_access_token')?.value;
  const refreshToken = request.cookies.get('spotify_refresh_token')?.value;

  if (!accessToken && refreshToken) {
    // Refresh token
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

    if (response.ok) {
      const data = await response.json();
      accessToken = data.access_token;
    }
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Fetch playlist from Spotify
    const playlistResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!playlistResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch playlist' },
        { status: playlistResponse.status }
      );
    }

    const playlist = await playlistResponse.json();

    // Fetch audio features for all tracks
    const trackIds = playlist.tracks.items
      .map((item: any) => item.track?.id)
      .filter(Boolean);

    const featuresResponse = await fetch(
      `https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let audioFeatures: any[] = [];
    if (featuresResponse.ok) {
      const data = await featuresResponse.json();
      audioFeatures = data.audio_features || [];
    }

    // Build enriched track list
    const tracks: PlaylistTrack[] = playlist.tracks.items.map((item: any, index: number) => {
      const track = item.track;
      const features = audioFeatures.find((f: any) => f?.id === track?.id);

      return {
        ...track,
        position: index,
        tempo: features?.tempo,
        energy: features?.energy,
        danceability: features?.danceability,
        key: features?.key,
        mode: features?.mode,
        camelotKey: features ? spotifyToCamelot(features.key, features.mode) : undefined,
      };
    });

    // Generate mix recipe
    const mixRecipe = generateMixRecipe(
      tracks,
      playlist.name,
      playlist.id,
      0, // Will be calculated
      0  // Will be calculated
    );

    // Calculate proper quality metrics
    const transitions = generatePlaylistTransitions(tracks);
    const difficulty = calculateMixDifficulty(transitions);

    // Update recipe with calculated values
    mixRecipe.harmonicMixPercentage = Math.round(
      (transitions.filter(t => t.keyCompatibility !== 'clash').length / transitions.length) * 100
    );

    // Return based on format
    switch (format) {
      case 'markdown':
        return new NextResponse(exportMixRecipeMarkdown(mixRecipe), {
          headers: {
            'Content-Type': 'text/markdown',
            'Content-Disposition': `attachment; filename="${playlist.name.replace(/[^a-z0-9]/gi, '-')}-mix-recipe.md"`,
          },
        });

      case 'cuesheet':
        return new NextResponse(exportCueSheet(mixRecipe), {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="${playlist.name.replace(/[^a-z0-9]/gi, '-')}-cuesheet.txt"`,
          },
        });

      case 'notes':
        return new NextResponse(generateMixNotes(tracks, transitions), {
          headers: {
            'Content-Type': 'text/markdown',
          },
        });

      case 'json':
      default:
        return NextResponse.json(mixRecipe);
    }
  } catch (error) {
    console.error('Error generating mix recipe:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate mix recipe' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mix-recipe
 *
 * Generate mix recipe from provided tracks (doesn't require Spotify fetch)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tracks, playlistName, playlistId, format = 'json' } = body;

    if (!tracks || !Array.isArray(tracks)) {
      return NextResponse.json({ error: 'tracks array is required' }, { status: 400 });
    }

    // Generate mix recipe
    const mixRecipe = generateMixRecipe(
      tracks,
      playlistName || 'Mix',
      playlistId || 'custom',
      0,
      0
    );

    // Calculate quality metrics
    const transitions = generatePlaylistTransitions(tracks);
    mixRecipe.harmonicMixPercentage = Math.round(
      (transitions.filter(t => t.keyCompatibility !== 'clash').length / transitions.length) * 100
    );

    // Return based on format
    switch (format) {
      case 'markdown':
        return new NextResponse(exportMixRecipeMarkdown(mixRecipe), {
          headers: { 'Content-Type': 'text/markdown' },
        });

      case 'cuesheet':
        return new NextResponse(exportCueSheet(mixRecipe), {
          headers: { 'Content-Type': 'text/plain' },
        });

      case 'notes':
        return new NextResponse(generateMixNotes(tracks, transitions), {
          headers: { 'Content-Type': 'text/markdown' },
        });

      case 'json':
      default:
        return NextResponse.json(mixRecipe);
    }
  } catch (error) {
    console.error('Error generating mix recipe:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate mix recipe' },
      { status: 500 }
    );
  }
}

// Helper function (duplicated from camelot-wheel to avoid import issues)
function spotifyToCamelot(key: number, mode: number): string {
  const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const CAMELOT_WHEEL: Record<string, string> = {
    'C major': '8B', 'C minor': '5A',
    'Db major': '3B', 'Db minor': '12A',
    'D major': '10B', 'D minor': '7A',
    'Eb major': '5B', 'Eb minor': '2A',
    'E major': '12B', 'E minor': '9A',
    'F major': '7B', 'F minor': '4A',
    'F# major': '2B', 'F# minor': '11A',
    'G major': '9B', 'G minor': '6A',
    'Ab major': '4B', 'Ab minor': '1A',
    'A major': '11B', 'A minor': '8A',
    'Bb major': '6B', 'Bb minor': '3A',
    'B major': '1B', 'B minor': '10A',
  };
  const keyName = keys[key];
  const modeName = mode === 1 ? 'major' : 'minor';
  return CAMELOT_WHEEL[`${keyName} ${modeName}`] || '0A';
}
