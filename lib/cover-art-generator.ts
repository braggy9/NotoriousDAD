// AI-generated playlist cover art using DALL-E
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Lazy-load OpenAI client (optional feature)
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface CoverArtParams {
  playlistName: string;
  emoji: string;
  genres: string[];
  vibe: string;
  energy: number;
  topArtists: string[];
  beatportGenre?: string;
}

/**
 * Generate a DALL-E prompt optimized for playlist cover art
 */
async function generateCoverArtPrompt(params: CoverArtParams): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are an expert at creating DALL-E prompts for DJ playlist cover art.

Playlist Info:
- Name: ${params.playlistName}
- Emoji: ${params.emoji}
- Genres: ${params.genres.join(', ')}
- Vibe: ${params.vibe}
- Energy: ${params.energy}/10
- Top Artists: ${params.topArtists.slice(0, 3).join(', ')}
${params.beatportGenre ? `- Beatport Genre: ${params.beatportGenre}` : ''}

Create a DALL-E prompt for a 1024x1024 square cover art image that:
1. Captures the musical vibe and energy
2. Uses abstract/geometric/artistic style (NO text, NO faces, NO copyrighted logos)
3. Matches the genre aesthetic (techno = dark/industrial, house = colorful/vibrant, etc.)
4. Incorporates the emoji's symbolic meaning
5. Looks professional for a DJ mix cover

Style guidelines:
- Abstract geometric patterns, gradients, vinyl records, waveforms, neon lights, DJ equipment silhouettes
- Dark backgrounds for underground/techno vibes
- Vibrant colors for house/progressive
- Cosmic/space themes for trance/progressive
- Urban/gritty for bass music
- NO text, NO artist names, NO readable words
- Professional, modern, clean design

Respond with ONLY the DALL-E prompt, no other text.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  return content.text.trim();
}

/**
 * Generate cover art image using DALL-E
 */
export async function generateCoverArt(params: CoverArtParams): Promise<string> {
  console.log('🎨 Generating cover art prompt...');

  // Generate optimized DALL-E prompt
  const prompt = await generateCoverArtPrompt(params);
  console.log(`✓ DALL-E prompt: ${prompt.slice(0, 100)}...`);

  // Generate image with DALL-E
  console.log('🖼️  Generating image with DALL-E...');
  const openai = getOpenAIClient();
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    style: 'vivid',
  });

  if (!response.data || response.data.length === 0) {
    throw new Error('DALL-E returned no images');
  }

  const imageUrl = response.data[0].url;
  if (!imageUrl) {
    throw new Error('DALL-E failed to generate image');
  }

  console.log('✓ Cover art generated!');
  return imageUrl;
}

/**
 * Upload cover art to Spotify playlist
 */
export async function uploadCoverArtToSpotify(
  playlistId: string,
  imageUrl: string,
  accessToken: string
): Promise<void> {
  console.log('📤 Downloading cover art...');

  // Download the image
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error('Failed to download cover art from DALL-E');
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = Buffer.from(imageBuffer).toString('base64');

  console.log('📤 Uploading cover art to Spotify...');

  // Upload to Spotify
  const uploadResponse = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/images`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/jpeg',
      },
      body: base64Image,
    }
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.warn('⚠️  Failed to upload cover art to Spotify:', errorText);
    throw new Error(`Failed to upload cover art: ${uploadResponse.status}`);
  }

  console.log('✓ Cover art uploaded to Spotify!');
}

/**
 * Generate and upload cover art in one step
 */
export async function generateAndUploadCoverArt(
  params: CoverArtParams,
  playlistId: string,
  accessToken: string
): Promise<string> {
  try {
    const imageUrl = await generateCoverArt(params);
    await uploadCoverArtToSpotify(playlistId, imageUrl, accessToken);
    return imageUrl;
  } catch (error) {
    console.error('❌ Cover art generation failed:', error);
    throw error;
  }
}
