// Spotify Recommendations Engine Integration
// Leverages Spotify's AI for taste matching and track discovery

import { spotifyToCamelot } from './camelot-wheel';
import { spotifyFetch } from './spotify-api';

// Helper to add delay between API calls
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string }[] };
  duration_ms: number;
  popularity: number;
}

interface TrackWithFeatures extends SpotifyTrack {
  tempo?: number;
  key?: number;
  mode?: number;
  energy?: number;
  danceability?: number;
  valence?: number;
  camelotKey?: string;
  source?: 'recommendations' | 'related-artists' | 'liked-songs' | 'user-library';
}

interface RecommendationParams {
  seedArtists?: string[];      // Artist IDs (up to 5 total seeds)
  seedTracks?: string[];       // Track IDs
  seedGenres?: string[];       // Genre names
  targetTempo?: number;        // Target BPM
  minTempo?: number;
  maxTempo?: number;
  targetEnergy?: number;       // 0-1
  minEnergy?: number;
  maxEnergy?: number;
  targetDanceability?: number; // 0-1
  targetValence?: number;      // 0-1 (mood/happiness)
  limit?: number;              // Max 100
}

/**
 * Get track recommendations using Spotify's AI engine
 * This is the same engine that powers Discover Weekly and Radio
 */
export async function getRecommendations(
  accessToken: string,
  params: RecommendationParams
): Promise<TrackWithFeatures[]> {
  const {
    seedArtists = [],
    seedTracks = [],
    seedGenres = [],
    targetTempo,
    minTempo,
    maxTempo,
    targetEnergy,
    minEnergy,
    maxEnergy,
    targetDanceability,
    targetValence,
    limit = 50,
  } = params;

  // Spotify requires at least 1 seed and max 5 total
  const totalSeeds = seedArtists.length + seedTracks.length + seedGenres.length;
  if (totalSeeds === 0) {
    console.warn('⚠️ No seeds provided for recommendations');
    return [];
  }
  if (totalSeeds > 5) {
    console.warn('⚠️ Too many seeds (max 5), truncating...');
  }

  // Build query parameters
  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(Math.min(limit, 100)));

  if (seedArtists.length > 0) {
    queryParams.set('seed_artists', seedArtists.slice(0, 5).join(','));
  }
  if (seedTracks.length > 0) {
    queryParams.set('seed_tracks', seedTracks.slice(0, 5 - seedArtists.length).join(','));
  }
  if (seedGenres.length > 0) {
    queryParams.set('seed_genres', seedGenres.slice(0, 5 - seedArtists.length - seedTracks.length).join(','));
  }

  // Add tunable attributes
  if (targetTempo) queryParams.set('target_tempo', String(targetTempo));
  if (minTempo) queryParams.set('min_tempo', String(minTempo));
  if (maxTempo) queryParams.set('max_tempo', String(maxTempo));
  if (targetEnergy !== undefined) queryParams.set('target_energy', String(targetEnergy));
  if (minEnergy !== undefined) queryParams.set('min_energy', String(minEnergy));
  if (maxEnergy !== undefined) queryParams.set('max_energy', String(maxEnergy));
  if (targetDanceability !== undefined) queryParams.set('target_danceability', String(targetDanceability));
  if (targetValence !== undefined) queryParams.set('target_valence', String(targetValence));

  console.log(`🎯 Getting Spotify recommendations with ${totalSeeds} seeds...`);

  try {
    const response = await spotifyFetch(
      `https://api.spotify.com/v1/recommendations?${queryParams.toString()}`,
      accessToken,
      { maxRetries: 2, baseDelay: 1000 }
    );

    if (!response.ok) {
      console.error('❌ Recommendations API failed:', await response.text());
      return [];
    }

    const data = await response.json();
    const tracks: SpotifyTrack[] = data.tracks || [];

    console.log(`  ✓ Got ${tracks.length} recommendations`);

    // Fetch audio features for all tracks (with rate limiting)
    if (tracks.length > 0) {
      await sleep(100); // Small delay before next API call
      const trackIds = tracks.map(t => t.id).join(',');
      const featuresResponse = await spotifyFetch(
        `https://api.spotify.com/v1/audio-features?ids=${trackIds}`,
        accessToken,
        { maxRetries: 2, baseDelay: 500 }
      );

      if (featuresResponse.ok) {
        const featuresData = await featuresResponse.json();
        const features = featuresData.audio_features || [];

        return tracks.map((track, i) => {
          const f = features[i];
          return {
            ...track,
            tempo: f?.tempo,
            key: f?.key,
            mode: f?.mode,
            energy: f?.energy,
            danceability: f?.danceability,
            valence: f?.valence,
            camelotKey: f ? spotifyToCamelot(f.key, f.mode) : undefined,
            source: 'recommendations' as const,
          };
        });
      }
    }

    return tracks.map(t => ({ ...t, source: 'recommendations' as const }));
  } catch (error) {
    console.error('❌ Recommendations error:', error);
    return [];
  }
}

/**
 * Get related artists (Spotify's "Fans also like" feature)
 */
export async function getRelatedArtists(
  artistId: string,
  accessToken: string
): Promise<{ id: string; name: string; genres: string[]; popularity: number }[]> {
  try {
    const response = await spotifyFetch(
      `https://api.spotify.com/v1/artists/${artistId}/related-artists`,
      accessToken,
      { maxRetries: 2, baseDelay: 500 }
    );

    if (!response.ok) {
      console.error('❌ Related artists API failed');
      return [];
    }

    const data = await response.json();
    return (data.artists || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      genres: a.genres || [],
      popularity: a.popularity,
    }));
  } catch (error) {
    console.error('❌ Related artists error:', error);
    return [];
  }
}

/**
 * Search for an artist and get their ID
 */
export async function searchArtistId(
  artistName: string,
  accessToken: string
): Promise<string | null> {
  try {
    const response = await spotifyFetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
      accessToken,
      { maxRetries: 2, baseDelay: 500 }
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.artists?.items?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Get user's liked/saved tracks
 */
export async function getUserLikedTracks(
  accessToken: string,
  limit: number = 50,
  offset: number = 0
): Promise<TrackWithFeatures[]> {
  console.log(`💚 Fetching user's liked songs (offset: ${offset}, limit: ${limit})...`);

  try {
    const response = await spotifyFetch(
      `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`,
      accessToken,
      { maxRetries: 2, baseDelay: 500 }
    );

    if (!response.ok) {
      console.error('❌ Liked tracks API failed');
      return [];
    }

    const data = await response.json();
    const items = data.items || [];
    const tracks: SpotifyTrack[] = items.map((item: any) => item.track);

    console.log(`  ✓ Got ${tracks.length} liked tracks`);

    // Fetch audio features
    if (tracks.length > 0) {
      const trackIds = tracks.map(t => t.id).join(',');
      const featuresResponse = await fetch(
        `https://api.spotify.com/v1/audio-features?ids=${trackIds}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (featuresResponse.ok) {
        const featuresData = await featuresResponse.json();
        const features = featuresData.audio_features || [];

        return tracks.map((track, i) => {
          const f = features[i];
          return {
            ...track,
            tempo: f?.tempo,
            key: f?.key,
            mode: f?.mode,
            energy: f?.energy,
            danceability: f?.danceability,
            valence: f?.valence,
            camelotKey: f ? spotifyToCamelot(f.key, f.mode) : undefined,
            source: 'liked-songs' as const,
          };
        });
      }
    }

    return tracks.map(t => ({ ...t, source: 'liked-songs' as const }));
  } catch (error) {
    console.error('❌ Liked tracks error:', error);
    return [];
  }
}

/**
 * Get tracks from related artists
 */
export async function getTracksFromRelatedArtists(
  artistNames: string[],
  accessToken: string,
  tracksPerArtist: number = 10
): Promise<TrackWithFeatures[]> {
  console.log(`🔗 Finding related artists for: ${artistNames.join(', ')}`);

  const allTracks: TrackWithFeatures[] = [];
  const processedArtists = new Set<string>();

  for (const artistName of artistNames.slice(0, 3)) { // Limit to 3 seed artists
    // Get artist ID
    const artistId = await searchArtistId(artistName, accessToken);
    if (!artistId) continue;

    // Get related artists
    const related = await getRelatedArtists(artistId, accessToken);
    console.log(`  ${artistName}: Found ${related.length} related artists`);

    // Get top tracks from top 5 related artists
    for (const relatedArtist of related.slice(0, 5)) {
      if (processedArtists.has(relatedArtist.id)) continue;
      processedArtists.add(relatedArtist.id);

      try {
        await sleep(50); // Small delay between artist fetches
        const response = await spotifyFetch(
          `https://api.spotify.com/v1/artists/${relatedArtist.id}/top-tracks?market=US`,
          accessToken,
          { maxRetries: 1, baseDelay: 500 }
        );

        if (response.ok) {
          const data = await response.json();
          const tracks = (data.tracks || []).slice(0, tracksPerArtist);

          for (const track of tracks) {
            allTracks.push({
              ...track,
              source: 'related-artists' as const,
            });
          }
        }
      } catch {
        // Continue on error
      }
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Deduplicate and fetch audio features
  const uniqueTracks = Array.from(
    new Map(allTracks.map(t => [t.id, t])).values()
  );

  console.log(`  ✓ Total from related artists: ${uniqueTracks.length} unique tracks`);

  // Fetch audio features in batches
  if (uniqueTracks.length > 0) {
    const batches = [];
    for (let i = 0; i < uniqueTracks.length; i += 100) {
      batches.push(uniqueTracks.slice(i, i + 100));
    }

    for (const batch of batches) {
      const trackIds = batch.map(t => t.id).join(',');
      try {
        const featuresResponse = await fetch(
          `https://api.spotify.com/v1/audio-features?ids=${trackIds}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (featuresResponse.ok) {
          const featuresData = await featuresResponse.json();
          const features = featuresData.audio_features || [];

          for (let i = 0; i < batch.length; i++) {
            const f = features[i];
            if (f) {
              batch[i] = {
                ...batch[i],
                tempo: f.tempo,
                key: f.key,
                mode: f.mode,
                energy: f.energy,
                danceability: f.danceability,
                valence: f.valence,
                camelotKey: spotifyToCamelot(f.key, f.mode),
              };
            }
          }
        }
      } catch {
        // Continue without features
      }
    }
  }

  return uniqueTracks;
}

/**
 * Build a comprehensive track pool using all Spotify engines
 * This is the main function that combines all sources
 */
export async function buildEnhancedTrackPool(
  accessToken: string,
  options: {
    includeArtists?: string[];     // Artists that MUST be in playlist
    referenceArtists?: string[];   // Artists for style guidance
    targetBpm?: number;
    bpmRange?: { min: number; max: number };
    energyRange?: { min: number; max: number };
    mood?: 'energetic' | 'chill' | 'dark' | 'uplifting';
    genres?: string[];
    includeLikedSongs?: boolean;
    maxTracks?: number;
  }
): Promise<{
  tracks: TrackWithFeatures[];
  sources: {
    recommendations: number;
    relatedArtists: number;
    likedSongs: number;
  };
}> {
  const {
    includeArtists = [],
    referenceArtists = [],
    targetBpm,
    bpmRange,
    energyRange,
    mood,
    genres = [],
    includeLikedSongs = true,
    maxTracks = 200,
  } = options;

  console.log('\n🚀 Building enhanced track pool with Spotify engines...');

  const allTracks: TrackWithFeatures[] = [];
  const sources = { recommendations: 0, relatedArtists: 0, likedSongs: 0 };

  // 1. Get artist IDs for seeds
  const allArtistNames = [...includeArtists, ...referenceArtists];
  const artistIds: string[] = [];

  for (const name of allArtistNames.slice(0, 5)) {
    const id = await searchArtistId(name, accessToken);
    if (id) artistIds.push(id);
  }

  // 2. Get recommendations using Spotify's AI
  if (artistIds.length > 0 || genres.length > 0) {
    // Map mood to energy/valence targets
    let targetEnergy: number | undefined;
    let targetValence: number | undefined;

    switch (mood) {
      case 'energetic':
        targetEnergy = 0.8;
        targetValence = 0.7;
        break;
      case 'chill':
        targetEnergy = 0.4;
        targetValence = 0.5;
        break;
      case 'dark':
        targetEnergy = 0.6;
        targetValence = 0.3;
        break;
      case 'uplifting':
        targetEnergy = 0.7;
        targetValence = 0.8;
        break;
    }

    const recommendations = await getRecommendations(accessToken, {
      seedArtists: artistIds.slice(0, 5),
      seedGenres: genres.slice(0, Math.max(0, 5 - artistIds.length)),
      targetTempo: targetBpm,
      minTempo: bpmRange?.min,
      maxTempo: bpmRange?.max,
      minEnergy: energyRange?.min ? energyRange.min / 10 : undefined,
      maxEnergy: energyRange?.max ? energyRange.max / 10 : undefined,
      targetEnergy,
      targetValence,
      limit: 100,
    });

    allTracks.push(...recommendations);
    sources.recommendations = recommendations.length;
  }

  // 3. Get tracks from related artists
  if (allArtistNames.length > 0) {
    const relatedTracks = await getTracksFromRelatedArtists(
      allArtistNames,
      accessToken,
      10
    );
    allTracks.push(...relatedTracks);
    sources.relatedArtists = relatedTracks.length;
  }

  // 4. Get user's liked songs (high priority tracks)
  if (includeLikedSongs) {
    const likedTracks = await getUserLikedTracks(accessToken, 100, 0);

    // Filter liked songs by BPM/energy if specified
    const filtered = likedTracks.filter(t => {
      if (bpmRange && t.tempo) {
        if (t.tempo < bpmRange.min || t.tempo > bpmRange.max) return false;
      }
      if (energyRange && t.energy !== undefined) {
        const e = t.energy * 10; // Convert 0-1 to 0-10
        if (e < energyRange.min || e > energyRange.max) return false;
      }
      return true;
    });

    allTracks.push(...filtered);
    sources.likedSongs = filtered.length;
  }

  // 5. Deduplicate and limit
  const uniqueTracks = Array.from(
    new Map(allTracks.map(t => [t.id, t])).values()
  ).slice(0, maxTracks);

  console.log(`\n📊 Enhanced Track Pool Summary:`);
  console.log(`   🎯 Recommendations: ${sources.recommendations} tracks`);
  console.log(`   🔗 Related Artists: ${sources.relatedArtists} tracks`);
  console.log(`   💚 Liked Songs: ${sources.likedSongs} tracks`);
  console.log(`   📦 Total unique: ${uniqueTracks.length} tracks`);

  return { tracks: uniqueTracks, sources };
}

/**
 * Map genre/vibe keywords to Spotify genre seeds
 */
export function mapToSpotifyGenres(keywords: string[]): string[] {
  const genreMap: Record<string, string[]> = {
    // Electronic
    'house': ['house', 'deep-house', 'progressive-house'],
    'techno': ['techno', 'minimal-techno'],
    'trance': ['trance'],
    'electronic': ['electronic', 'electro'],
    'edm': ['edm', 'electronic'],
    'dnb': ['drum-and-bass'],
    'drum and bass': ['drum-and-bass'],
    'dubstep': ['dubstep'],
    'ambient': ['ambient'],

    // Pop/Dance
    'pop': ['pop', 'dance-pop'],
    'dance': ['dance', 'dancehall'],
    'disco': ['disco'],
    'funk': ['funk'],

    // Hip-hop
    'hiphop': ['hip-hop'],
    'hip-hop': ['hip-hop'],
    'rap': ['hip-hop'],
    'trap': ['trap'],

    // Rock
    'rock': ['rock', 'alt-rock'],
    'indie': ['indie', 'indie-pop'],
    'alternative': ['alternative'],

    // Other
    'jazz': ['jazz'],
    'soul': ['soul'],
    'rnb': ['r-n-b'],
    'r&b': ['r-n-b'],
    'latin': ['latin'],
    'reggaeton': ['reggaeton'],
    'afrobeats': ['afrobeat'],
  };

  const spotifyGenres: string[] = [];

  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    if (genreMap[lower]) {
      spotifyGenres.push(...genreMap[lower]);
    }
  }

  // Return unique genres, max 5
  return [...new Set(spotifyGenres)].slice(0, 5);
}
