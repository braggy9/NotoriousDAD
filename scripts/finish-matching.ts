// Quick script to finish the last ~774 tracks with a hardcoded token
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CHECKPOINT_FILE = join(process.cwd(), 'data', 'apple-music-checkpoint.json');
const TRACKS_FILE = join(process.cwd(), 'data', 'apple-music-tracks.json');

// Hardcoded valid token - will work for ~1 hour
const ACCESS_TOKEN = 'BQCZKiOp7hkUsrku2KKdKeRp02l-H6StsZB2MaQLUK4hZsUsyUxdwC9CcRdJHD20B6DuKVw_MeLIeEteAZ9jVKOXTMvRZYpMMhBxrvLtMt9WICj6U7xwGceBoHEci__WzYf8wtLDhhXxa3AOdwFGkJ7BoMoatwgXGyba9vhTSEFlzNKxIuAe_UaphjdmLyLK-qOXy76d32APfjfLSMIVruTrwvV4nEHlRu5nX2JCa5BAhHoLuUgFlG3g6-2ZPKhzzT0YaoCHPNeoO0Kw_2JBmq__-0Whw-kjgOOQtvlM-EyEW6HbXTSRn_3vbBSR-w-Xz5ygVAeEuxPOOYmXiE6JxOnUTtnHgSTm';

interface AppleMusicTrack {
  name: string;
  artist: string;
  album?: string;
  playCount?: number;
}

async function searchSpotify(track: AppleMusicTrack) {
  const query = encodeURIComponent(`track:${track.name} artist:${track.artist}`);
  const url = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=5`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
      console.log(`⏳ Rate limited, waiting ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return searchSpotify(track);
    }
    throw new Error(`Spotify API error: ${response.status}`);
  }

  const data = await response.json();
  return data.tracks?.items || [];
}

function matchTrack(appleTrack: AppleMusicTrack, spotifyResults: any[]) {
  if (!spotifyResults.length) return null;

  const normalizedApple = {
    name: appleTrack.name.toLowerCase().trim(),
    artist: appleTrack.artist.toLowerCase().trim(),
  };

  for (const result of spotifyResults) {
    const spotifyName = result.name.toLowerCase().trim();
    const spotifyArtist = result.artists[0]?.name.toLowerCase().trim();

    if (spotifyName === normalizedApple.name && spotifyArtist === normalizedApple.artist) {
      return {
        appleMusicTrack: appleTrack,
        spotifyTrack: {
          id: result.id,
          name: result.name,
          artists: result.artists.map((a: any) => a.name),
          album: result.album.name,
          uri: result.uri,
        },
      };
    }
  }

  // Fuzzy match - first result if names are similar
  const firstResult = spotifyResults[0];
  if (firstResult) {
    const spotifyName = firstResult.name.toLowerCase();
    if (spotifyName.includes(normalizedApple.name) || normalizedApple.name.includes(spotifyName)) {
      return {
        appleMusicTrack: appleTrack,
        spotifyTrack: {
          id: firstResult.id,
          name: firstResult.name,
          artists: firstResult.artists.map((a: any) => a.name),
          album: firstResult.album.name,
          uri: firstResult.uri,
        },
      };
    }
  }

  return null;
}

async function main() {
  console.log('🎵 Finishing Apple Music → Spotify Matching');
  console.log('==========================================\n');

  const allTracks: AppleMusicTrack[] = JSON.parse(readFileSync(TRACKS_FILE, 'utf-8'));

  let startIndex = 0;
  let matches: any[] = [];

  if (existsSync(CHECKPOINT_FILE)) {
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf-8'));
    startIndex = checkpoint.lastIndex || 0;
    matches = checkpoint.matches || [];
  }

  const remaining = allTracks.length - startIndex;
  console.log(`📊 Remaining: ${remaining} tracks\n`);

  let matched = matches.length;
  let notMatched = 0;

  for (let i = startIndex; i < allTracks.length; i++) {
    const track = allTracks[i];

    try {
      if (!track.name || !track.artist) {
        notMatched++;
        continue;
      }

      const results = await searchSpotify(track);
      const match = matchTrack(track, results);

      if (match) {
        matches.push(match);
        matched++;
      } else {
        notMatched++;
      }

      // Progress every 50 tracks
      if ((i + 1) % 50 === 0 || i === allTracks.length - 1) {
        console.log(`📊 Progress: ${i + 1}/${allTracks.length} | Matched: ${matched}`);

        // Save checkpoint
        writeFileSync(CHECKPOINT_FILE, JSON.stringify({
          lastIndex: i + 1,
          matches,
        }, null, 2));
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 50));
    } catch (error) {
      console.error(`Error at track ${i}:`, error);
      // Save progress and exit
      writeFileSync(CHECKPOINT_FILE, JSON.stringify({
        lastIndex: i,
        matches,
      }, null, 2));
      process.exit(1);
    }
  }

  console.log('\n✅ COMPLETE!');
  console.log(`   Total matched: ${matched}`);
  console.log(`   Total not matched: ${notMatched}`);
}

main().catch(console.error);
