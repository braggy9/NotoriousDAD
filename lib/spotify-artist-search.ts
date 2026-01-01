// Spotify Artist Search - Find tracks from Include artists
// This supplements the user's library with Spotify catalog search

import { spotifyToCamelot } from './camelot-wheel';
import { spotifyFetch } from './spotify-api';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface SpotifyTrackWithFeatures {
  id: string;
  name: string;
  uri: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string }[] };
  duration_ms: number;
  popularity: number;
  // Audio features (added after fetch)
  tempo?: number;
  key?: number;
  mode?: number;
  energy?: number;
  danceability?: number;
  valence?: number;
  camelotKey?: string;
  // Metadata
  inUserLibrary?: boolean;
  hasMikData?: boolean;
  source?: 'spotify-search' | 'user-library' | 'mik';
}

/**
 * Search Spotify for tracks by an artist
 * Returns tracks enhanced with audio features for harmonic mixing
 */
export async function searchArtistTracks(
  artistName: string,
  accessToken: string,
  options: {
    limit?: number;
    userLibraryIds?: Set<string>;
    mikDataMap?: Map<string, any>;
  } = {}
): Promise<SpotifyTrackWithFeatures[]> {
  const { limit = 30, userLibraryIds = new Set(), mikDataMap = new Map() } = options;

  console.log(`🔍 Searching Spotify for "${artistName}"...`);

  // 1. Search for the artist (with rate limit handling)
  const searchResponse = await spotifyFetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
    accessToken,
    { maxRetries: 3, baseDelay: 1000 }
  );

  if (!searchResponse.ok) {
    const errorText = await searchResponse.text();
    console.error(`❌ Artist search failed for "${artistName}": ${searchResponse.status} - ${errorText}`);
    return [];
  }

  const searchData = await searchResponse.json();
  const artist = searchData.artists?.items?.[0];

  if (!artist) {
    console.warn(`⚠️ Artist not found: "${artistName}"`);
    return [];
  }

  console.log(`  Found: ${artist.name} (ID: ${artist.id})`);

  // 2. Get artist's top tracks (with rate limit handling)
  await sleep(100); // Small delay between requests
  const topTracksResponse = await spotifyFetch(
    `https://api.spotify.com/v1/artists/${artist.id}/top-tracks?market=US`,
    accessToken,
    { maxRetries: 3, baseDelay: 1000 }
  );

  if (!topTracksResponse.ok) {
    console.error(`❌ Failed to get top tracks for ${artist.name}`);
    return [];
  }

  const topTracksData = await topTracksResponse.json();
  let tracks: SpotifyTrackWithFeatures[] = topTracksData.tracks || [];

  console.log(`  Top tracks: ${tracks.length}`);

  // 3. Get more tracks from albums if needed
  if (tracks.length < limit) {
    await sleep(100);
    const albumsResponse = await spotifyFetch(
      `https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album,single&limit=10&market=US`,
      accessToken,
      { maxRetries: 2, baseDelay: 1000 }
    );

    if (albumsResponse.ok) {
      const albumsData = await albumsResponse.json();
      const albums = albumsData.items || [];

      // Get tracks from each album
      for (const album of albums.slice(0, 5)) { // Limit to 5 albums
        await sleep(50); // Small delay between album fetches
        const albumTracksResponse = await spotifyFetch(
          `https://api.spotify.com/v1/albums/${album.id}/tracks?limit=50`,
          accessToken,
          { maxRetries: 2, baseDelay: 500 }
        );

        if (albumTracksResponse.ok) {
          const albumTracksData = await albumTracksResponse.json();
          const albumTracks = (albumTracksData.items || []).map((t: any) => ({
            ...t,
            uri: t.uri || `spotify:track:${t.id}`, // Ensure URI exists
            album: { id: album.id, name: album.name, images: album.images },
            popularity: album.popularity || 50, // Use album popularity as estimate
          }));
          tracks.push(...albumTracks);
        }
      }
    }
  }

  // 4. Deduplicate by track ID
  const uniqueTracks = Array.from(
    new Map(tracks.map(t => [t.id, t])).values()
  ).slice(0, Math.min(limit * 2, 50)); // Get extra for filtering

  console.log(`  Unique tracks: ${uniqueTracks.length}`);

  // 5. Get audio features for all tracks (with rate limiting)
  if (uniqueTracks.length > 0) {
    await sleep(100);
    const trackIds = uniqueTracks.map(t => t.id).join(',');
    const featuresResponse = await spotifyFetch(
      `https://api.spotify.com/v1/audio-features?ids=${trackIds}`,
      accessToken,
      { maxRetries: 2, baseDelay: 500 }
    );

    if (featuresResponse.ok) {
      const featuresData = await featuresResponse.json();
      const features = featuresData.audio_features || [];

      // Merge features into tracks
      for (let i = 0; i < uniqueTracks.length; i++) {
        const trackFeatures = features[i];
        if (trackFeatures) {
          uniqueTracks[i] = {
            ...uniqueTracks[i],
            tempo: trackFeatures.tempo,
            key: trackFeatures.key,
            mode: trackFeatures.mode,
            energy: trackFeatures.energy,
            danceability: trackFeatures.danceability,
            valence: trackFeatures.valence,
            camelotKey: spotifyToCamelot(trackFeatures.key, trackFeatures.mode),
          };
        }
      }
    }
  }

  // 6. Enhance with user library and MIK data info
  const enhanced = uniqueTracks.map(track => {
    const inLibrary = userLibraryIds.has(track.id);
    const mikData = mikDataMap.get(track.id);

    return {
      ...track,
      inUserLibrary: inLibrary,
      hasMikData: !!mikData,
      source: 'spotify-search' as const,
      // Override with MIK data if available (more accurate)
      ...(mikData ? {
        tempo: mikData.bpm || track.tempo,
        camelotKey: mikData.camelotKey || track.camelotKey,
        energy: mikData.energy ? mikData.energy / 10 : track.energy, // Normalize MIK 0-10 to 0-1
      } : {}),
    };
  });

  // 7. Sort by priority: Library tracks first, then by popularity
  enhanced.sort((a, b) => {
    if (a.inUserLibrary && !b.inUserLibrary) return -1;
    if (!a.inUserLibrary && b.inUserLibrary) return 1;
    if (a.hasMikData && !b.hasMikData) return -1;
    if (!a.hasMikData && b.hasMikData) return 1;
    return (b.popularity || 0) - (a.popularity || 0);
  });

  const result = enhanced.slice(0, limit);

  console.log(`  ✓ Returning ${result.length} tracks for "${artistName}"`);
  console.log(`    ${result.filter(t => t.inUserLibrary).length} in user library`);
  console.log(`    ${result.filter(t => t.hasMikData).length} with MIK data`);

  return result;
}

/**
 * Search multiple artists and combine results
 */
export async function searchMultipleArtists(
  artistNames: string[],
  accessToken: string,
  options: {
    tracksPerArtist?: number;
    userLibraryIds?: Set<string>;
    mikDataMap?: Map<string, any>;
  } = {}
): Promise<{
  tracks: SpotifyTrackWithFeatures[];
  artistResults: Map<string, SpotifyTrackWithFeatures[]>;
}> {
  const { tracksPerArtist = 30 } = options;

  const artistResults = new Map<string, SpotifyTrackWithFeatures[]>();
  const allTracks: SpotifyTrackWithFeatures[] = [];

  for (const artistName of artistNames) {
    try {
      const tracks = await searchArtistTracks(artistName, accessToken, {
        limit: tracksPerArtist,
        userLibraryIds: options.userLibraryIds,
        mikDataMap: options.mikDataMap,
      });

      artistResults.set(artistName.toLowerCase(), tracks);
      allTracks.push(...tracks);

      // Small delay between artist searches to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`❌ Error searching for "${artistName}":`, error);
    }
  }

  // Deduplicate across all artists
  const uniqueTracks = Array.from(
    new Map(allTracks.map(t => [t.id, t])).values()
  );

  console.log(`\n📊 Total from ${artistNames.length} Include artists: ${uniqueTracks.length} unique tracks`);

  return { tracks: uniqueTracks, artistResults };
}
