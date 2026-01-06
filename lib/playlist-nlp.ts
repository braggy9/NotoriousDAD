// NLP extraction for playlist generation
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface PlaylistConstraints {
  // Explicit entity references
  artists?: string[]; // Artists to include
  referenceArtists?: string[]; // Artists to use as style/vibe reference ("similar to X")
  genres?: string[];
  playlists?: string[];
  tracks?: string[];

  // Seed playlist
  seedPlaylistUrl?: string;
  seedPlaylistId?: string;

  // Beatport integration
  beatportGenre?: string; // e.g., "tech-house", "techno"
  useBeatportChart?: boolean;

  // Musical characteristics
  bpmRange?: { min: number; max: number };
  keyPreferences?: string[]; // Camelot keys
  energyRange?: { min: number; max: number }; // 0-10

  // Playlist structure
  duration?: number; // minutes
  trackCount?: number;
  energyCurve?: 'flat' | 'ascending' | 'descending' | 'wave' | 'peak-middle' | 'peak-end';

  // Mood/vibe descriptors
  moods?: string[];
  activities?: string[];
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | 'late-night';

  // Advanced constraints
  eraPreferences?: string[]; // e.g., "90s", "2010s"
  excludeArtists?: string[];
  mustIncludeTracks?: string[];

  // Track familiarity preference
  familiarityPreference?: 'deep-cuts' | 'hits' | 'mixed'; // deep cuts = low popularity, hits = popular tracks

  // Original prompt for context
  originalPrompt: string;
}

/**
 * PASS 1: Extract structured constraints from natural language
 */
export async function extractPlaylistConstraints(
  prompt: string
): Promise<PlaylistConstraints> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are an expert DJ and music analyst. Extract structured information from this playlist request.

DJ LINGO MAPPINGS (apply these automatically):
- "peak time" / "prime time" / "main room" → energyRange: {min: 8, max: 10}
- "warm up" / "opening set" → energyRange: {min: 4, max: 6}, energyCurve: "ascending"
- "closing set" / "cool down" → energyCurve: "descending", energyRange: {min: 5, max: 7}
- "sunrise set" / "after hours" → timeOfDay: "late-night", moods: ["hypnotic", "deep"]
- "sunset session" / "golden hour" → timeOfDay: "evening", moods: ["melodic", "uplifting"]
- "Boiler Room style" / "underground" → moods: ["underground", "raw"], energyRange: {min: 6, max: 9}
- "festival banger" / "mainstage" → energyRange: {min: 9, max: 10}, moods: ["euphoric", "big-room"]
- "Ibiza vibes" / "beach club" → moods: ["summery", "melodic"], genres: ["house", "tech-house"]
- "Berlin techno" / "warehouse" → genres: ["techno"], moods: ["dark", "industrial"]
- "driving" / "motorik" → bpmRange: {min: 125, max: 135}, moods: ["hypnotic", "relentless"]

GENRE BPM DEFAULTS (use if no explicit BPM given):
- techno: 130-145
- tech-house: 124-130
- house: 118-128
- deep house: 118-124
- progressive house: 126-132
- trance: 138-145
- drum & bass / dnb: 170-180
- downtempo: 90-110

User's request: "${prompt}"

Analyze and extract:
1. Artists to INCLUDE (explicitly mentioned with "with", "mix with", "include", "Include:" - MUST have these artists)
2. REFERENCE artists (mentioned with "similar to", "like", "in the style of", "vibe of", "Reference:" - use as style guide)
3. Spotify playlist URLs (https://open.spotify.com/playlist/...)
4. Genre preferences
5. Beatport genre (if mentioned: tech house, techno, house, progressive house, deep house, trance, drum & bass, etc.)
6. Beatport chart reference (phrases like "Beatport top", "Beatport chart", "trending on Beatport")
7. BPM/tempo preferences (slow=60-100, medium=100-130, fast=130-180)
8. Energy level (1-10 scale)
9. Playlist duration if mentioned
10. Number of tracks if mentioned
11. Energy progression (flat/ascending/descending/wave/peak-middle/peak-end)
12. Mood/Vibe descriptors - map to these categories:
    - CHILLED: relaxing, afternoon coffee, wind down, sunset drinks, laid-back, mellow
    - ENERGETIC: workout, party, pre-game, pump-up, high-energy, intense
    - FOCUSED: study, deep work, coding, concentration, productive, flow state
    - SOCIAL: dinner party, drinks with friends, background vibes, gathering, entertaining
    - MOODY: introspective, late-night, melancholic, atmospheric, contemplative, dark
13. Activity context (workout, study, party, chill, etc.)
14. Time of day if mentioned
15. Era preferences (decades like "80s", "90s", "2000s", "2010s", "modern" → "2020s")
16. Specific tracks to include
17. Artists to EXCLUDE (look for: "no X", "exclude X", "without X", "skip X", "not X")
18. Track familiarity: "deep cuts" / "hidden gems" / "obscure" → "deep-cuts", "hits only" / "bangers" / "crowd pleasers" → "hits", default → "mixed"

Examples:
- "Mix with Daft Punk and Justice" → artists: ["Daft Punk", "Justice"]
- "Include: Daft Punk, Justice" → artists: ["Daft Punk", "Justice"]
- "Similar to Daft Punk and Justice" → referenceArtists: ["Daft Punk", "Justice"]
- "Reference: Radiohead, Coldplay" → referenceArtists: ["Radiohead", "Coldplay"]
- "Include: Fred again. Reference: Fatboy Slim" → artists: ["Fred again"], referenceArtists: ["Fatboy Slim"]
- "Chilled vibe, relaxing afternoon coffee mood" → moods: ["chilled", "relaxing", "afternoon coffee"]
- "Energetic workout, pump-up vibes" → moods: ["energetic", "workout", "pump-up"]
- "2 hours" or "120 minutes" → duration: 120
- "Use this playlist as reference: https://open.spotify.com/playlist/xyz" → seedPlaylistUrl: "https://..."
- "Beatport tech house chart" → beatportGenre: "tech-house", useBeatportChart: true
- "Trending techno on Beatport" → beatportGenre: "techno", useBeatportChart: true
- "90s house", "classic 90s" → eraPreferences: ["1990s"], genres: ["house"]
- "modern techno" → eraPreferences: ["2020s"], genres: ["techno"]
- "no Drake", "exclude pop", "without mainstream" → excludeArtists: ["Drake"] or genres exclude
- "deep cuts only", "hidden gems" → familiarityPreference: "deep-cuts"
- "hits", "crowd pleasers", "bangers" → familiarityPreference: "hits"

Respond with ONLY a JSON object, no other text:
{
  "artists": ["Artist Name"],
  "referenceArtists": ["Artist Name"],
  "seedPlaylistUrl": "https://open.spotify.com/playlist/...",
  "genres": ["genre1", "genre2"],
  "beatportGenre": "tech-house",
  "useBeatportChart": true,
  "bpmRange": {"min": 120, "max": 130},
  "keyPreferences": ["8A", "9A"],
  "energyRange": {"min": 6, "max": 9},
  "duration": 45,
  "trackCount": 20,
  "energyCurve": "ascending",
  "moods": ["upbeat", "energetic"],
  "activities": ["workout"],
  "timeOfDay": "morning",
  "eraPreferences": ["2010s", "2020s"],
  "excludeArtists": ["Artist Name"],
  "mustIncludeTracks": ["Track - Artist"],
  "familiarityPreference": "mixed"
}

Only include fields that are clearly specified. Use null for unspecified fields.`,
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Strip markdown code blocks if present
  let jsonText = responseText.trim();
  if (jsonText.startsWith('```')) {
    const lines = jsonText.split('\n');
    lines.shift();
    if (lines[lines.length - 1].trim() === '```') {
      lines.pop();
    }
    jsonText = lines.join('\n').trim();
  }

  const extracted = JSON.parse(jsonText);

  return {
    ...extracted,
    originalPrompt: prompt,
  };
}

/**
 * Filter tracks based on extracted constraints
 */
export function filterTracksByConstraints(
  tracks: any[],
  constraints: PlaylistConstraints
): any[] {
  let filtered = [...tracks];

  // NOTE: Include artists are handled SEPARATELY via Spotify search in generate-playlist
  // We do NOT filter the library here - we want variety from the FULL library
  // Include artists get ADDED to the pool later, not used to EXCLUDE other tracks
  if (constraints.artists && constraints.artists.length > 0) {
    console.log(`ℹ️ Include artists (${constraints.artists.join(', ')}) will be added via Spotify search`);
    // DO NOT filter - keep all library tracks for variety!
  }

  // Reference artists (prefer these artists but don't require them)
  if (constraints.referenceArtists && constraints.referenceArtists.length > 0) {
    const referenceLower = constraints.referenceArtists.map(a => a.toLowerCase());

    // Boost tracks from reference artists
    const withReferenceArtists = filtered.filter(track => {
      const trackArtists = track.artists.map((a: any) => a.name.toLowerCase()).join(' ');
      return referenceLower.some(artist => trackArtists.includes(artist));
    });

    // If we have at least 20 tracks from reference artists, prioritize them
    if (withReferenceArtists.length >= 20) {
      // Include all reference artist tracks + some others for variety
      const others = filtered.filter(t => !withReferenceArtists.includes(t));
      filtered = [...withReferenceArtists, ...others.slice(0, Math.min(100, others.length))];
    }
  }

  // Filter by genre (if available in MIK data)
  if (constraints.genres && constraints.genres.length > 0 && filtered.length > 0) {
    const genresLower = constraints.genres.map(g => g.toLowerCase());
    const withGenre = filtered.filter(track => {
      const genre = track.mikData?.genre?.toLowerCase() || '';
      return genresLower.some(g => genre.includes(g));
    });
    // Only apply genre filter if we have enough matches
    if (withGenre.length >= 10) {
      filtered = withGenre;
    }
  }

  // Filter by BPM range
  if (constraints.bpmRange) {
    filtered = filtered.filter(track => {
      const bpm = track.tempo || track.mikData?.bpm;
      if (!bpm) return false;
      return bpm >= constraints.bpmRange!.min && bpm <= constraints.bpmRange!.max;
    });
  }

  // Filter by energy range
  if (constraints.energyRange) {
    filtered = filtered.filter(track => {
      const energy = track.energy || track.mikData?.energy;
      if (energy === undefined || energy === null) return false;
      const normalizedEnergy = energy <= 1 ? energy * 10 : energy; // Normalize to 0-10
      return normalizedEnergy >= constraints.energyRange!.min &&
             normalizedEnergy <= constraints.energyRange!.max;
    });
  }

  // Filter by key preferences
  if (constraints.keyPreferences && constraints.keyPreferences.length > 0) {
    const withPreferredKey = filtered.filter(track => {
      const key = track.camelotKey || track.mikData?.camelotKey;
      return key && constraints.keyPreferences!.includes(key);
    });
    // Only apply if we have enough matches
    if (withPreferredKey.length >= 10) {
      filtered = withPreferredKey;
    }
  }

  // Exclude specific artists
  if (constraints.excludeArtists && constraints.excludeArtists.length > 0) {
    const excludeLower = constraints.excludeArtists.map(a => a.toLowerCase());
    filtered = filtered.filter(track => {
      const trackArtists = track.artists.map((a: any) => a.name.toLowerCase()).join(' ');
      return !excludeLower.some(artist => trackArtists.includes(artist));
    });
  }

  return filtered;
}

/**
 * Calculate target track count based on duration or explicit count
 */
export function calculateTargetTrackCount(constraints: PlaylistConstraints): number {
  // Explicit track count takes priority
  if (constraints.trackCount) {
    return constraints.trackCount;
  }

  // Calculate from duration (assuming ~3.5 min average track)
  if (constraints.duration) {
    return Math.round(constraints.duration / 3.5);
  }

  // Default to 20 tracks
  return 20;
}

/**
 * Generate a summary of applied constraints for logging
 */
export function summarizeConstraints(constraints: PlaylistConstraints): string {
  const parts: string[] = [];

  if (constraints.useBeatportChart && constraints.beatportGenre) {
    parts.push(`📊 Beatport ${constraints.beatportGenre} chart`);
  }
  if (constraints.seedPlaylistId) {
    parts.push(`📋 Seed playlist`);
  }
  if (constraints.artists?.length) {
    parts.push(`Artists: ${constraints.artists.join(', ')}`);
  }
  if (constraints.referenceArtists?.length) {
    parts.push(`Similar to: ${constraints.referenceArtists.slice(0, 3).join(', ')}`);
  }
  if (constraints.genres?.length) {
    parts.push(`Genres: ${constraints.genres.join(', ')}`);
  }
  if (constraints.bpmRange) {
    parts.push(`BPM: ${constraints.bpmRange.min}-${constraints.bpmRange.max}`);
  }
  if (constraints.energyRange) {
    parts.push(`Energy: ${constraints.energyRange.min}-${constraints.energyRange.max}/10`);
  }
  if (constraints.duration) {
    parts.push(`Duration: ${constraints.duration} min`);
  }
  if (constraints.energyCurve) {
    parts.push(`Curve: ${constraints.energyCurve}`);
  }
  if (constraints.moods?.length) {
    parts.push(`Mood: ${constraints.moods.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'No specific constraints';
}
