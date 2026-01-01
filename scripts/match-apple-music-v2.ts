// Apple Music to Spotify matching with progress tracking
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getValidToken } from '../lib/token-manager';

interface AppleMusicTrack {
  name: string;
  artist: string;
  album?: string;
  totalTime?: string;
}

interface MatchedTrack {
  appleMusicTrack: AppleMusicTrack;
  spotifyTrack: any;
  matchConfidence: 'high' | 'medium' | 'low';
}

const CHECKPOINT_FILE = 'data/apple-music-checkpoint.json';
const OUTPUT_FILE = 'data/apple-music-matched-v2.json';

async function searchSpotify(track: AppleMusicTrack, getToken: () => Promise<string>) {
  const query = `track:${track.name} artist:${track.artist}`;
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`;

  const token = await getToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
      console.log(`⏳ Rate limited, waiting ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return searchSpotify(track, getToken);
    }
    if (response.status === 401) {
      console.log(`🔄 Token expired, refreshing...`);
      return searchSpotify(track, getToken);
    }
    if (response.status === 400) {
      // Skip tracks with malformed data (special characters, invalid format, etc.)
      console.log(`⚠️  Skipping track with bad data: "${track.name}" by ${track.artist}`);
      return []; // Return empty results to skip this track
    }
    throw new Error(`Spotify API error: ${response.status}`);
  }

  const data = await response.json();
  return data.tracks.items;
}

function matchTrack(appleMusicTrack: AppleMusicTrack, spotifyResults: any[]): MatchedTrack | null {
  if (!spotifyResults || spotifyResults.length === 0) return null;

  // Skip tracks with missing data
  if (!appleMusicTrack.name || !appleMusicTrack.artist) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const amTitle = normalize(appleMusicTrack.name);
  const amArtist = normalize(appleMusicTrack.artist);

  for (const spotifyTrack of spotifyResults) {
    const spTitle = normalize(spotifyTrack.name);
    const spArtists = spotifyTrack.artists.map((a: any) => normalize(a.name));

    const titleMatch = spTitle.includes(amTitle) || amTitle.includes(spTitle);
    const artistMatch = spArtists.some((a: string) => a.includes(amArtist) || amArtist.includes(a));

    if (titleMatch && artistMatch) {
      return {
        appleMusicTrack,
        spotifyTrack,
        matchConfidence: 'high',
      };
    }
  }

  // Fallback: return first result as low confidence
  return {
    appleMusicTrack,
    spotifyTrack: spotifyResults[0],
    matchConfidence: 'low',
  };
}

async function main() {
  console.log('🎵 Apple Music → Spotify Matcher v2');
  console.log('====================================\n');

  // Load Apple Music tracks
  const appleMusicData = JSON.parse(readFileSync('data/apple-music-tracks.json', 'utf-8'));
  const allTracks: AppleMusicTrack[] = appleMusicData.tracks || appleMusicData;

  console.log(`📊 Total tracks: ${allTracks.length.toLocaleString()}`);

  // Load checkpoint if exists
  let startIndex = 0;
  let matches: MatchedTrack[] = [];

  if (existsSync(CHECKPOINT_FILE)) {
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    startIndex = checkpoint.lastIndex || 0;
    matches = checkpoint.matches || [];
    console.log(`📍 Resuming from track ${startIndex.toLocaleString()}\n`);
  }

  // Token getter function that always returns a fresh token
  const getToken = async () => await getValidToken();

  // Verify initial token
  await getToken();
  console.log('✅ Spotify token acquired\n');

  const startTime = Date.now();
  let matched = matches.length;
  let notMatched = 0;

  for (let i = startIndex; i < allTracks.length; i++) {
    const track = allTracks[i];

    try {
      // Skip tracks with missing data
      if (!track.name || !track.artist) {
        notMatched++;
        continue;
      }

      const results = await searchSpotify(track, getToken);
      const match = matchTrack(track, results);

      if (match) {
        matches.push(match);
        matched++;
      } else {
        notMatched++;
      }

      // Progress update every 100 tracks
      if ((i + 1) % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (i + 1 - startIndex) / elapsed;
        const remaining = allTracks.length - i - 1;
        const eta = remaining / rate;

        console.log(`\n📊 Progress: ${i + 1}/${allTracks.length} (${((i + 1) / allTracks.length * 100).toFixed(1)}%)`);
        console.log(`   ✅ Matched: ${matched} | ❌ Not matched: ${notMatched}`);
        console.log(`   ⚡ Rate: ${rate.toFixed(1)} tracks/sec`);
        console.log(`   ⏱️  ETA: ${Math.round(eta / 60)} minutes`);

        // Save checkpoint
        writeFileSync(CHECKPOINT_FILE, JSON.stringify({
          lastIndex: i + 1,
          matches,
          timestamp: new Date().toISOString(),
        }, null, 2));
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`❌ Error on track ${i}:`, error);
      // Save checkpoint and exit on error
      writeFileSync(CHECKPOINT_FILE, JSON.stringify({
        lastIndex: i,
        matches,
        timestamp: new Date().toISOString(),
        error: String(error),
      }, null, 2));
      throw error;
    }
  }

  // Save final results
  writeFileSync(OUTPUT_FILE, JSON.stringify({
    totalTracks: allTracks.length,
    matched: matches.length,
    timestamp: new Date().toISOString(),
    matches,
  }, null, 2));

  console.log(`\n✅ Complete!`);
  console.log(`   Matched: ${matched}/${allTracks.length} (${(matched / allTracks.length * 100).toFixed(1)}%)`);
  console.log(`   Output: ${OUTPUT_FILE}`);
}

main().catch(console.error);
