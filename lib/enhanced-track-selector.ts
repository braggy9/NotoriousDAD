// Enhanced track selection with intelligent filtering and Claude-powered curation
import Anthropic from '@anthropic-ai/sdk';
import { PlaylistConstraints, calculateTargetTrackCount } from './playlist-nlp';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * PASS 2: Intelligent track selection using Claude
 * This runs AFTER filtering by constraints
 */
export async function selectTracksWithClaude(
  availableTracks: any[],
  constraints: PlaylistConstraints,
  userTopArtists?: string[]
): Promise<string[]> {
  const targetCount = calculateTargetTrackCount(constraints);

  // Prepare track list with enhanced metadata for cohesion judgment
  // IMPORTANT: Shuffle tracks to prevent Claude from over-indexing on Include artists
  // which would otherwise appear at the top of the list
  const shuffledTracks = [...availableTracks]
    .sort(() => Math.random() - 0.5) // Fisher-Yates lite shuffle
    .slice(0, 500); // Limit to 500 tracks to stay within context window

  const trackList = shuffledTracks
    .map((track, index) => {
      const key = track.camelotKey || track.mikData?.camelotKey || 'Unknown';
      const bpm = Math.round(track.tempo || track.mikData?.bpm || 0);
      const energy = track.energy
        ? Math.round(track.energy * 10)
        : track.mikData?.energy
        ? Math.round(track.mikData.energy * 10)
        : '?';

      // Add valence (mood: 0=sad/dark, 10=happy/bright) and danceability for cohesion
      const valence = track.valence !== undefined ? Math.round(track.valence * 10) : '?';
      const danceability = track.danceability !== undefined ? Math.round(track.danceability * 10) : '?';

      const popularity = track.popularity || '?';
      const artistNames = track.artists.map((a: any) => a.name).join(', ');

      // Check if artist is in user's top artists
      const isTopArtist = userTopArtists?.some(topArtist =>
        artistNames.toLowerCase().includes(topArtist.toLowerCase())
      );
      const topArtistMarker = isTopArtist ? ' ⭐' : '';

      // Include source for context (liked songs should be prioritized for cohesion)
      const sourceMarker = track.source === 'liked-songs' ? ' 💚' : '';

      return `${index + 1}. "${track.name}" by ${artistNames}${topArtistMarker}${sourceMarker} | Key: ${key} | BPM: ${bpm} | Energy: ${energy}/10 | Mood: ${valence}/10 | Dance: ${danceability}/10 (ID: ${track.id})`;
    })
    .join('\n');

  // Build constraint summary for Claude
  const constraintSummary = buildConstraintSummary(constraints);

  // Build task list with conditional Include artists requirement
  const taskList = [
    `1. Select exactly ${targetCount} UNIQUE tracks (no duplicates!)`,
  ];

  if (constraints.artists && constraints.artists.length > 0) {
    taskList.push(`2. Include tracks from: ${constraints.artists.join(', ')} (3-5 each, woven throughout)`);
  }
  if (constraints.referenceArtists && constraints.referenceArtists.length > 0) {
    taskList.push(`${taskList.length + 1}. Use these as style/vibe reference: ${constraints.referenceArtists.join(', ')}`);
  }

  taskList.push(`${taskList.length + 1}. Prioritize ⭐ (user's top artists) and 💚 (liked songs) for personalization`);

  const criticalRules = [
    '- Each track ID must appear ONLY ONCE',
  ];

  // Extract mood/vibe info for cohesion guidance
  const vibeDescription = [
    constraints.moods?.join(', '),
    constraints.genres?.join(', '),
    constraints.activities?.join(', '),
  ].filter(Boolean).join(' | ') || 'consistent and cohesive';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are an expert DJ creating the perfect mix for djay Pro automix. Your output will be played as a seamless, continuous DJ set.

## #1 PRIORITY: MIX QUALITY FOR DJAY PRO AUTOMIX
This mix must flow PERFECTLY when played through djay Pro's automix feature. Every transition matters.

**Target vibe: ${vibeDescription}**
**User's request: "${constraints.originalPrompt}"**

${constraintSummary}

## AVAILABLE TRACKS:
${trackList}

## YOUR TASK:
${taskList.join('\n')}

## MIX OPTIMIZATION (THIS IS WHAT MATTERS MOST):

### 1. HARMONIC MIXING (Camelot Wheel)
- Same key = perfect transition
- ±1 number (8A→9A, 8A→7A) = smooth transition
- Same number, switch letter (8A↔8B) = energy shift
- AVOID jumps >2 numbers - these sound jarring in automix

### 2. BPM FLOW
- Ideal: ±3 BPM between adjacent tracks
- Acceptable: ±5 BPM
- Avoid: >8 BPM jumps (automix struggles with these)

### 3. ENERGY CURVE (${constraints.energyCurve || 'wave'})
- Build natural momentum - don't jump from 3/10 to 9/10
- Energy values should flow: 5→6→7→8 not 5→9→4→8

### 4. VIBE COHESION
- Every track should feel like it belongs in the same DJ set
- Use Mood (valence) and Dance metrics to maintain consistency
- 💚 Liked songs = user-approved vibes
- ⭐ Top artists = user preferences

## ARTIST VARIETY (CRITICAL FOR DJ SETS):
Real DJ sets feature MANY artists, not just 3-4. A great mix weaves between:
- **Include artists**: Feature them (3-5 tracks each is plenty), but they should NOT dominate
- **Discovery tracks**: Related artists, recommendations, liked songs - these are what make a set INTERESTING
- **Mix it up**: A 2-hour set with only Fred again/Rufus/Disclosure sounds repetitive - that's BAD DJing

Think like a festival DJ: you play SOME tracks from headliners but most of the set is discovering new sounds that FIT the vibe.

NO quotas - but aim for rich variety. 40-60% from Include artists, rest from discovery pool.

## OUTPUT:
Respond with ONLY a JSON array of track IDs in optimal play order.
Order matters - arrange for best transitions!

["track_id_1", "track_id_2", ...]`,
      },
    ],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
  console.log('🤖 Claude response preview:', responseText.substring(0, 200));

  // Strip markdown code blocks and any surrounding text
  let jsonText = responseText.trim();

  // Remove markdown code blocks
  if (jsonText.includes('```')) {
    const match = jsonText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (match) {
      jsonText = match[1];
    } else {
      // Fallback: remove all ``` markers
      jsonText = jsonText.replace(/```(?:json)?/g, '').trim();
    }
  }

  // Try to extract JSON array if there's surrounding text
  if (!jsonText.startsWith('[')) {
    const arrayMatch = jsonText.match(/(\[[\s\S]*\])/);
    if (arrayMatch) {
      jsonText = arrayMatch[1];
    }
  }

  console.log('📝 Parsed JSON preview:', jsonText.substring(0, 200));

  let selectedIds;
  try {
    selectedIds = JSON.parse(jsonText);
  } catch (error) {
    console.error('❌ JSON parsing failed. Claude response:', responseText);
    throw new Error(`Failed to parse Claude response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    throw new Error('Claude failed to generate valid track selection');
  }

  return selectedIds;
}

/**
 * Build a human-readable constraint summary for Claude
 */
function buildConstraintSummary(constraints: PlaylistConstraints): string {
  const parts: string[] = [];

  if (constraints.artists?.length) {
    parts.push(`- Must include artists: ${constraints.artists.join(', ')}`);
  }
  if (constraints.referenceArtists?.length) {
    parts.push(`- Use as style/vibe reference (similar artists welcome): ${constraints.referenceArtists.join(', ')}`);
  }
  if (constraints.seedPlaylistId) {
    parts.push(`- Using seed playlist as reference for style and characteristics`);
  }
  if (constraints.genres?.length) {
    parts.push(`- Genres: ${constraints.genres.join(', ')}`);
  }
  if (constraints.bpmRange) {
    parts.push(`- BPM range: ${constraints.bpmRange.min}-${constraints.bpmRange.max}`);
  }
  if (constraints.energyRange) {
    parts.push(`- Energy level: ${constraints.energyRange.min}-${constraints.energyRange.max}/10`);
  }
  if (constraints.keyPreferences?.length) {
    parts.push(`- Preferred keys: ${constraints.keyPreferences.join(', ')}`);
  }
  if (constraints.duration) {
    parts.push(`- Target duration: ${constraints.duration} minutes`);
  }
  if (constraints.moods?.length) {
    parts.push(`- Mood: ${constraints.moods.join(', ')}`);
  }
  if (constraints.activities?.length) {
    parts.push(`- Activity: ${constraints.activities.join(', ')}`);
  }
  if (constraints.timeOfDay) {
    parts.push(`- Time of day: ${constraints.timeOfDay}`);
  }
  if (constraints.eraPreferences?.length) {
    parts.push(`- Era: ${constraints.eraPreferences.join(', ')}`);
  }
  if (constraints.excludeArtists?.length) {
    parts.push(`- Exclude artists: ${constraints.excludeArtists.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No specific constraints - use your best judgment';
}

/**
 * Fetch user's top artists from Spotify for personalization
 */
export async function getUserTopArtists(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch(
      'https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      console.warn('Failed to fetch top artists, skipping personalization');
      return [];
    }

    const data = await response.json();
    return data.items.map((artist: any) => artist.name);
  } catch (error) {
    console.warn('Error fetching top artists:', error);
    return [];
  }
}
