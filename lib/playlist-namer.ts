// Smart playlist naming with AI-generated creative titles
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface PlaylistCharacteristics {
  genres: string[];
  bpmRange: { min: number; max: number };
  energyRange: { min: number; max: number };
  energyCurve?: string;
  topArtists: string[];
  trackCount: number;
  hasBeatportInfluence?: boolean;
  beatportGenre?: string;
  vibe?: string;
}

interface PlaylistName {
  name: string;
  emoji: string;
  withBranding: string;
  description: string;
}

export async function generatePlaylistName(
  characteristics: PlaylistCharacteristics,
  userPrompt?: string,
  style: 'creative' | 'descriptive' = 'creative'
): Promise<PlaylistName> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are a creative DJ playlist namer for "Notorious D.A.D." - an AI-powered mix generator.

Generate a ${style} playlist name based on these characteristics:

**Playlist Info:**
- Tracks: ${characteristics.trackCount}
- Genres: ${characteristics.genres.join(', ')}
- BPM Range: ${characteristics.bpmRange.min}-${characteristics.bpmRange.max}
- Energy: ${characteristics.energyRange.min}-${characteristics.energyRange.max}/10
- Energy Curve: ${characteristics.energyCurve || 'balanced'}
- Top Artists: ${characteristics.topArtists.slice(0, 5).join(', ')}
${characteristics.hasBeatportInfluence ? `- Beatport Chart: ${characteristics.beatportGenre}` : ''}
${userPrompt ? `- User Request: "${userPrompt}"` : ''}

**Style Guidelines:**
${style === 'creative' ? `
- CREATIVE: Evocative, atmospheric, captures the vibe
- Examples: "Midnight Techno Odyssey", "Euphoric Summer Waves", "Dark Basement Sessions"
- Use metaphors, imagery, feelings
- 2-4 words max
` : `
- DESCRIPTIVE: Clear genre/mood/energy description
- Examples: "Progressive House Energy Builder", "Deep Tech Minimal Grooves"
- Straightforward and informative
- 3-5 words max
`}

**Emoji Selection:**
Choose ONE emoji that best represents the vibe:
🌙 = Late night/dark/mysterious
🔥 = High energy/bangers/peak hour
🌊 = Progressive/flowing/waves
💫 = Euphoric/uplifting/cosmic
🎭 = Eclectic/varied/journey
🌅 = Sunrise/morning/chill
⚡ = Energetic/intense/powerful
🌴 = Tropical/summer/warm
🖤 = Dark/minimal/underground
✨ = Magical/dreamy/ethereal
🏙️ = Urban/city/modern
🎪 = Party/fun/celebratory
💎 = Classy/refined/premium
🌀 = Hypnotic/driving/progressive
🔊 = Bass heavy/club/loud

**Notorious D.A.D. Branding:**
For the branded version, use ONE of these formats:
- "Notorious D.A.D. presents: [Name]" (for special/premium mixes)
- "D.A.D. Sessions: [Name]" (for regular mixes)
- "[Name] - A D.A.D. Mix" (for casual/simple)

Choose format based on vibe - underground/serious gets full "Notorious D.A.D.", casual gets "D.A.D."

**Output Format (JSON only):**
{
  "name": "The main playlist name",
  "emoji": "Single emoji character",
  "withBranding": "Name with Notorious D.A.D. branding",
  "description": "One sentence describing the mix vibe (for playlist description)"
}

Respond with ONLY the JSON, no other text.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Parse JSON response
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse playlist name from Claude response');
  }

  const result = JSON.parse(jsonMatch[0]);
  return result as PlaylistName;
}

export function extractPlaylistCharacteristics(
  tracks: any[],
  constraints?: any,
  userPrompt?: string
): PlaylistCharacteristics {
  // Extract genres from tracks
  const genreCount: Record<string, number> = {};
  tracks.forEach(track => {
    if (track.genres) {
      track.genres.forEach((genre: string) => {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      });
    }
  });

  const genres = Object.entries(genreCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([genre]) => genre);

  // BPM range
  const bpms = tracks
    .map(t => t.tempo || t.mikData?.bpm)
    .filter(Boolean);
  const bpmRange = {
    min: Math.round(Math.min(...bpms)),
    max: Math.round(Math.max(...bpms)),
  };

  // Energy range
  const energies = tracks.map(t => Math.round((t.energy || 0) * 10));
  const energyRange = {
    min: Math.min(...energies),
    max: Math.max(...energies),
  };

  // Top artists
  const artistCount: Record<string, number> = {};
  tracks.forEach(track => {
    if (track.artists) {
      track.artists.forEach((artist: any) => {
        const name = typeof artist === 'string' ? artist : artist.name;
        artistCount[name] = (artistCount[name] || 0) + 1;
      });
    }
  });

  const topArtists = Object.entries(artistCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([artist]) => artist);

  return {
    genres: genres.length > 0 ? genres : ['Electronic'],
    bpmRange,
    energyRange,
    energyCurve: constraints?.energyCurve,
    topArtists,
    trackCount: tracks.length,
    hasBeatportInfluence: constraints?.useBeatportChart,
    beatportGenre: constraints?.beatportGenre,
  };
}

// Fallback simple namer if AI fails
export function generateSimpleName(
  characteristics: PlaylistCharacteristics,
  userPrompt?: string
): PlaylistName {
  const genre = characteristics.genres[0] || 'Electronic';
  const energy = characteristics.energyRange.max;

  let vibe = 'Mix';
  let emoji = '🎵';

  if (energy >= 8) {
    vibe = 'Energy';
    emoji = '🔥';
  } else if (energy >= 6) {
    vibe = 'Groove';
    emoji = '🌊';
  } else {
    vibe = 'Chill';
    emoji = '🌙';
  }

  const name = `${genre} ${vibe}`;

  return {
    name,
    emoji,
    withBranding: `D.A.D. Sessions: ${name}`,
    description: `A ${characteristics.trackCount}-track ${genre.toLowerCase()} mix curated by Notorious D.A.D.`,
  };
}
