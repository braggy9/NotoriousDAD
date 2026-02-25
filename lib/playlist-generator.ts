export interface PlaylistCriteria {
  genres: string[];
  bpm_min: number;
  bpm_max: number;
  energy_min: number;
  energy_max: number;
  mood: string;
  era: string | null;
  track_count: number;
  description: string;
  search_queries: string[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  artists: string[];
  album: string;
  image?: string;
  preview_url?: string;
  duration_ms: number;
  bpm?: number;
  energy?: number;
  key?: number;
}

export function parseCriteria(text: string): PlaylistCriteria | null {
  // Extract JSON from Claude's response (might be wrapped in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      genres: parsed.genres || [],
      bpm_min: parsed.bpm_min || 100,
      bpm_max: parsed.bpm_max || 140,
      energy_min: parsed.energy_min || 0.4,
      energy_max: parsed.energy_max || 0.8,
      mood: parsed.mood || "groovy",
      era: parsed.era || null,
      track_count: Math.min(Math.max(parsed.track_count || 20, 5), 50),
      description: parsed.description || "",
      search_queries: parsed.search_queries || [],
    };
  } catch {
    return null;
  }
}

export async function searchTracks(
  criteria: PlaylistCriteria
): Promise<SpotifyTrack[]> {
  const allTracks: SpotifyTrack[] = [];
  const seenArtists = new Set<string>();
  const seenIds = new Set<string>();

  // Search using each query from Claude
  for (const query of criteria.search_queries) {
    try {
      const res = await fetch(
        `/api/spotify/search?${new URLSearchParams({
          q: query,
          limit: "10",
        })}`
      );
      if (!res.ok) continue;

      const data = await res.json();

      for (const track of data.tracks) {
        // Skip duplicates
        if (seenIds.has(track.id)) continue;

        // Diversity: max 2 tracks per artist
        const artistKey = track.artists[0];
        const artistCount = [...allTracks].filter(
          (t) => t.artists[0] === artistKey
        ).length;
        if (artistCount >= 2) continue;

        seenIds.add(track.id);
        seenArtists.add(artistKey);
        allTracks.push(track);
      }
    } catch {
      // Skip failed searches
    }
  }

  // Also search by genre
  for (const genre of criteria.genres.slice(0, 2)) {
    try {
      const res = await fetch(
        `/api/spotify/search?${new URLSearchParams({
          q: `genre:"${genre}"`,
          limit: "10",
        })}`
      );
      if (!res.ok) continue;

      const data = await res.json();
      for (const track of data.tracks) {
        if (seenIds.has(track.id)) continue;
        const artistKey = track.artists[0];
        const artistCount = [...allTracks].filter(
          (t) => t.artists[0] === artistKey
        ).length;
        if (artistCount >= 2) continue;

        seenIds.add(track.id);
        allTracks.push(track);
      }
    } catch {
      // Skip failed searches
    }
  }

  // Trim to requested count
  return allTracks.slice(0, criteria.track_count);
}

export async function enrichWithAudioFeatures(
  tracks: SpotifyTrack[]
): Promise<SpotifyTrack[]> {
  if (tracks.length === 0) return tracks;

  // Batch IDs (max 100 per request)
  const ids = tracks.map((t) => t.id).join(",");
  try {
    const res = await fetch(`/api/spotify/audio-features?ids=${ids}`);
    if (!res.ok) return tracks;

    const data = await res.json();
    const featureMap = new Map(
      data.features.map((f: { id: string; bpm: number; energy: number; key: number }) => [f.id, f])
    );

    return tracks.map((track) => {
      const features = featureMap.get(track.id) as { bpm: number; energy: number; key: number } | undefined;
      if (features) {
        return {
          ...track,
          bpm: features.bpm,
          energy: features.energy,
          key: features.key,
        };
      }
      return track;
    });
  } catch {
    return tracks;
  }
}
