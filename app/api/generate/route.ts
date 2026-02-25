import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert DJ and music curator. Given a user's description of the vibe, mood, or occasion they want music for, you generate structured criteria for building a playlist.

You MUST respond with valid JSON matching this schema:
{
  "genres": string[],       // 1-4 Spotify-compatible genres (e.g., "house", "hip-hop", "disco", "ambient")
  "bpm_min": number,        // Minimum BPM (60-200)
  "bpm_max": number,        // Maximum BPM (60-200)
  "energy_min": number,     // 0.0-1.0 (0=chill, 1=intense)
  "energy_max": number,     // 0.0-1.0
  "mood": string,           // One-word mood: "euphoric", "melancholic", "aggressive", "dreamy", "groovy", etc.
  "era": string | null,     // Decade preference: "80s", "90s", "2000s", "2010s", "2020s", or null for any
  "track_count": number,    // 10-30 tracks
  "description": string,    // 1-2 sentence description of the playlist vibe
  "search_queries": string[] // 3-6 specific Spotify search queries to find matching tracks
}

Genre reference (use Spotify's genre seeds):
acoustic, afrobeat, alt-rock, ambient, anime, black-metal, bluegrass, blues, bossanova, breakbeat, british, cantopop, chicago-house, chill, classical, club, comedy, country, dance, dancehall, death-metal, deep-house, detroit-techno, disco, disney, drum-and-bass, dub, dubstep, edm, electro, electronic, emo, folk, forro, french, funk, garage, german, gospel, goth, grindcore, groove, grunge, guitar, happy, hard-rock, hardcore, hardstyle, heavy-metal, hip-hop, holidays, honky-tonk, house, idm, indian, indie, indie-pop, industrial, iranian, j-dance, j-idol, j-pop, j-rock, jazz, k-pop, kids, latin, latino, malay, mandopop, metal, metalcore, minimal-techno, mpb, new-age, new-release, opera, pagode, party, philippines-opm, piano, pop, pop-film, post-dubstep, power-pop, progressive-house, psych-rock, punk, punk-rock, r-n-b, rainy-day, reggae, reggaeton, road-trip, rock, rock-n-roll, rockabilly, romance, sad, salsa, samba, sertanejo, show-tunes, singer-songwriter, ska, sleep, songwriter, soul, soundtracks, spanish, study, summer, swedish, synth-pop, tango, techno, trance, trip-hop, turkish, work-out, world-music

Rules:
- BPM ranges should span ~20 BPM (e.g., 120-140 for house)
- Energy ranges should span ~0.2 (e.g., 0.6-0.8)
- search_queries should be specific artist+track or genre searches that would find the right vibe
- Be creative and knowledgeable about music history and subgenres
- Only use genres from the reference list above`;

export async function POST(request: NextRequest) {
  const { prompt } = await request.json();

  if (!prompt) {
    return Response.json({ error: "Prompt required" }, { status: 400 });
  }

  // Stream the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Generation failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
