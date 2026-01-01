// Match MIK tracks to Spotify tracks

import { MIKTrack, SpotifyTrackWithFeatures, TrackMatchResult } from './types';

// Normalize string for comparison (lowercase, remove special chars, trim)
const normalize = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Calculate similarity between two strings (0-1)
const stringSimilarity = (str1: string, str2: string): number => {
  const s1 = normalize(str1);
  const s2 = normalize(str2);

  if (s1 === s2) return 1.0;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  // Simple word overlap
  const words1 = new Set(s1.split(' '));
  const words2 = new Set(s2.split(' '));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
};

// Search Spotify for a track
export const searchSpotifyTrack = async (
  mikTrack: MIKTrack,
  accessToken: string
): Promise<SpotifyTrackWithFeatures | null> => {
  const query = `track:${mikTrack.trackName} artist:${mikTrack.artist}`;
  const encodedQuery = encodeURIComponent(query);

  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=5`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    console.error('Spotify search failed:', await response.text());
    return null;
  }

  const data = await response.json();
  const tracks = data.tracks?.items || [];

  if (tracks.length === 0) return null;

  // Find best match
  let bestMatch = tracks[0];
  let bestScore = 0;

  for (const track of tracks) {
    const nameScore = stringSimilarity(mikTrack.trackName, track.name);
    const artistScore = stringSimilarity(
      mikTrack.artist,
      track.artists.map((a: any) => a.name).join(' ')
    );
    const totalScore = (nameScore + artistScore) / 2;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestMatch = track;
    }
  }

  // Only return if confidence is reasonable
  return bestScore > 0.6 ? bestMatch : null;
};

// Get Spotify audio features for a track
export const getSpotifyAudioFeatures = async (
  trackId: string,
  accessToken: string
): Promise<any> => {
  const response = await fetch(
    `https://api.spotify.com/v1/audio-features/${trackId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    console.error('Failed to fetch audio features:', await response.text());
    return null;
  }

  return response.json();
};

// Match a MIK track to Spotify and enrich with audio features
export const matchTrackToSpotify = async (
  mikTrack: MIKTrack,
  accessToken: string
): Promise<TrackMatchResult | null> => {
  // Search Spotify
  const spotifyTrack = await searchSpotifyTrack(mikTrack, accessToken);

  if (!spotifyTrack) {
    return null;
  }

  // Get audio features
  const audioFeatures = await getSpotifyAudioFeatures(spotifyTrack.id, accessToken);

  // Merge data
  const enrichedTrack: SpotifyTrackWithFeatures = {
    ...spotifyTrack,
    ...audioFeatures,
    camelotKey: mikTrack.camelotKey,
    matchedMIK: true,
    mikData: mikTrack,
  };

  // Calculate match confidence
  const nameScore = stringSimilarity(mikTrack.trackName, spotifyTrack.name);
  const artistScore = stringSimilarity(
    mikTrack.artist,
    spotifyTrack.artists.map(a => a.name).join(' ')
  );
  const matchConfidence = (nameScore + artistScore) / 2;

  return {
    spotifyTrack: enrichedTrack,
    mikTrack,
    matchConfidence,
    matchMethod: matchConfidence > 0.9 ? 'exact' : 'fuzzy',
  };
};

// Batch match multiple MIK tracks
export const batchMatchTracks = async (
  mikTracks: MIKTrack[],
  accessToken: string,
  onProgress?: (current: number, total: number) => void
): Promise<TrackMatchResult[]> => {
  const results: TrackMatchResult[] = [];

  for (let i = 0; i < mikTracks.length; i++) {
    const mikTrack = mikTracks[i];

    if (onProgress) {
      onProgress(i + 1, mikTracks.length);
    }

    try {
      const result = await matchTrackToSpotify(mikTrack, accessToken);
      if (result) {
        results.push(result);
      }

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to match track: ${mikTrack.trackName}`, error);
    }
  }

  return results;
};
