import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AppleMusicTrack } from '../lib/apple-music-parser';
import { getValidToken } from '../lib/token-manager';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

interface SpotifySearchResult {
  tracks: {
    items: Array<{
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      album: { name: string };
      duration_ms: number;
      popularity: number;
      uri: string;
    }>;
  };
}

interface MatchedTrack {
  // Apple Music data
  appleMusicId: string;
  name: string;
  artist: string;
  album?: string;
  genre?: string;
  playCount?: number;
  dateAdded?: string;

  // Spotify match
  spotifyId: string;
  spotifyUri: string;
  matchConfidence: number;
  spotifyPopularity: number;
  spotifyDuration: number;
}

async function searchSpotify(track: AppleMusicTrack): Promise<{ id: string; uri: string; popularity: number; duration_ms: number; confidence: number } | null> {
  try {
    // Get valid token (auto-refreshes if needed)
    const accessToken = await getValidToken();

    // Clean up artist name (remove HTML entities like &#38; for &)
    const cleanArtist = track.artist
      .replace(/&#38;/g, '&')
      .replace(/&amp;/g, '&');

    // Try exact search first
    let query = `track:"${track.name}" artist:"${cleanArtist}"`;
    let response = await fetch(
      `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        console.error('\n❌ Access token expired unexpectedly! Trying to refresh...');
        // Token should have auto-refreshed, but try one more time
        const freshToken = await getValidToken();
        response = await fetch(
          `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
          {
            headers: { Authorization: `Bearer ${freshToken}` },
          }
        );
        if (!response.ok) {
          throw new Error(`Spotify API error after refresh: ${response.status}`);
        }
      } else {
        throw new Error(`Spotify API error: ${response.status}`);
      }
    }

    let data = await response.json() as SpotifySearchResult;

    // If no exact match, try simplified search
    if (!data.tracks.items.length) {
      query = `${track.name} ${cleanArtist}`;
      response = await fetch(
        `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      data = await response.json() as SpotifySearchResult;
    }

    if (!data.tracks.items.length) {
      return null;
    }

    // Calculate match confidence for each result
    const matches = data.tracks.items.map(item => {
      const nameSimilarity = calculateSimilarity(
        track.name.toLowerCase(),
        item.name.toLowerCase()
      );
      const artistSimilarity = calculateSimilarity(
        cleanArtist.toLowerCase(),
        item.artists[0].name.toLowerCase()
      );

      const confidence = (nameSimilarity + artistSimilarity) / 2;

      return {
        id: item.id,
        uri: item.uri,
        popularity: item.popularity,
        duration_ms: item.duration_ms,
        confidence,
      };
    });

    // Return best match if confidence is good enough
    matches.sort((a, b) => b.confidence - a.confidence);
    const bestMatch = matches[0];

    if (bestMatch.confidence >= 0.6) {
      return bestMatch;
    }

    return null;
  } catch (error) {
    console.error(`Error searching for "${track.name}" by ${track.artist}:`, error);
    return null;
  }
}

/**
 * Simple similarity scoring based on string matching
 */
function calculateSimilarity(a: string, b: string): number {
  // Remove common DJ words/suffixes
  const cleanA = a.replace(/\s*(remix|remaster|edit|mix|version|feat\.?|ft\.?|featuring).*$/i, '').trim();
  const cleanB = b.replace(/\s*(remix|remaster|edit|mix|version|feat\.?|ft\.?|featuring).*$/i, '').trim();

  if (cleanA === cleanB) return 1.0;
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return 0.9;

  // Levenshtein-like scoring
  const longer = cleanA.length > cleanB.length ? cleanA : cleanB;
  const shorter = cleanA.length > cleanB.length ? cleanB : cleanA;

  if (longer.length === 0) return 1.0;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }

  return matches / longer.length;
}

async function main() {
  // Verify token is available (will auto-refresh if needed)
  await getValidToken();
  console.log('✓ Spotify token ready (auto-refresh enabled)');
  console.log('🎵 Matching Apple Music tracks to Spotify...\n');

  const appleMusicPath = join(process.cwd(), 'data', 'apple-music-tracks.json');
  if (!existsSync(appleMusicPath)) {
    console.error('❌ Apple Music tracks not found. Run process-apple-music-library.ts first');
    process.exit(1);
  }

  const appleMusicTracks: AppleMusicTrack[] = JSON.parse(readFileSync(appleMusicPath, 'utf-8'));
  console.log(`📂 Loaded ${appleMusicTracks.length} Apple Music tracks`);

  // Check for existing progress
  const progressPath = join(process.cwd(), 'data', 'apple-music-matched.json');
  let matchedTracks: MatchedTrack[] = [];
  let startIndex = 0;

  if (existsSync(progressPath)) {
    matchedTracks = JSON.parse(readFileSync(progressPath, 'utf-8'));
    startIndex = matchedTracks.length;
    console.log(`📥 Resuming from track ${startIndex + 1}...`);
  }

  console.log(`🔗 Matching ${appleMusicTracks.length - startIndex} tracks to Spotify...`);
  console.log(`   (This will take ~${Math.ceil((appleMusicTracks.length - startIndex) / 600)} hours for ${appleMusicTracks.length - startIndex} tracks)\n`);

  let matched = 0;
  let notFound = 0;

  for (let i = startIndex; i < appleMusicTracks.length; i++) {
    const track = appleMusicTracks[i];

    // Progress update every 50 tracks
    if (i > 0 && i % 50 === 0) {
      const progress = ((i / appleMusicTracks.length) * 100).toFixed(1);
      console.log(`   Progress: ${i}/${appleMusicTracks.length} (${progress}%)`);
      console.log(`   Matched: ${matched} | Not found: ${notFound}`);

      // Save progress
      writeFileSync(progressPath, JSON.stringify(matchedTracks, null, 2));
    }

    const spotifyMatch = await searchSpotify(track);

    if (spotifyMatch) {
      matchedTracks.push({
        appleMusicId: track.persistentId,
        name: track.name,
        artist: track.artist,
        album: track.album,
        genre: track.genre,
        playCount: track.playCount,
        dateAdded: track.dateAdded ? (typeof track.dateAdded === 'string' ? track.dateAdded : track.dateAdded.toISOString()) : undefined,
        spotifyId: spotifyMatch.id,
        spotifyUri: spotifyMatch.uri,
        matchConfidence: spotifyMatch.confidence,
        spotifyPopularity: spotifyMatch.popularity,
        spotifyDuration: spotifyMatch.duration_ms,
      });
      matched++;
    } else {
      notFound++;
    }

    // Rate limiting: ~100ms per request = ~600 tracks/hour
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Save final results
  writeFileSync(progressPath, JSON.stringify(matchedTracks, null, 2));

  console.log(`\n✓ Matching complete!`);
  console.log(`   Matched: ${matched} tracks`);
  console.log(`   Not found: ${notFound} tracks`);
  console.log(`   Success rate: ${((matched / appleMusicTracks.length) * 100).toFixed(1)}%`);
  console.log(`\n✓ Saved to ${progressPath}`);
}

main();
