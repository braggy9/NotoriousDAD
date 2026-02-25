import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { spotifyFetch } from "@/lib/spotify";
import { parseSpotifyKey } from "@/lib/camelot";
import { buildMixPlan } from "@/lib/mix-engine";
import type { MixTrack } from "@/lib/mix-types";

const client = new Anthropic();

const MIX_SYSTEM_PROMPT = `You are an expert DJ and mix engineer. Given a user's description of the mix they want, you generate structured criteria for building a professional DJ mix set.

You MUST respond with valid JSON matching this schema:
{
  "genres": string[],           // 1-4 Spotify-compatible genres
  "bpm_min": number,            // Minimum BPM (60-200)
  "bpm_max": number,            // Maximum BPM (60-200, keep range ~15 BPM for mixable sets)
  "energy_min": number,         // 0.0-1.0 starting energy
  "energy_max": number,         // 0.0-1.0 peak energy
  "energy_arc": string,         // "build" | "peak" | "journey" | "chill" | "warmup"
  "mood": string,               // One-word mood descriptor
  "era": string | null,         // Decade preference or null
  "track_count": number,        // 8-20 tracks (mix sets are focused)
  "set_length_minutes": number, // Target set length in minutes (30-120)
  "description": string,        // 1-2 sentence mix description
  "transition_preference": string, // "smooth" | "creative" | "aggressive" | "minimal"
  "search_queries": string[]    // 4-8 specific Spotify search queries
}

Mix-specific rules:
- BPM ranges should be TIGHT (10-15 BPM) for smooth mixing — DJs don't jump 40 BPM
- Energy arc matters: "build" starts low and rises, "peak" stays high, "journey" rises then falls
- track_count should be 8-16 for a focused mix set (not a playlist)
- search_queries should find tracks known for being DJ-friendly (strong intros/outros, steady beats)
- Consider harmonic mixing — tracks in compatible keys sound better together
- Think about buildups, drops, and transitions between tracks

Genre reference (use Spotify's genre seeds):
acoustic, afrobeat, alt-rock, ambient, breakbeat, british, chicago-house, chill, classical, club, dance, dancehall, deep-house, detroit-techno, disco, drum-and-bass, dub, dubstep, edm, electro, electronic, folk, funk, garage, groove, grunge, happy, hard-rock, hardcore, hardstyle, hip-hop, house, idm, indie, indie-pop, industrial, jazz, k-pop, latin, latino, metal, minimal-techno, new-age, party, pop, progressive-house, psych-rock, punk, r-n-b, reggae, reggaeton, rock, soul, summer, synth-pop, techno, trance, trip-hop, work-out, world-music`;

export async function POST(request: NextRequest) {
  const { prompt } = await request.json();

  if (!prompt) {
    return Response.json({ error: "Prompt required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Phase 1: Stream Claude's criteria generation
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ phase: "thinking", text: "Analyzing your mix request..." })}\n\n`
          )
        );

        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: MIX_SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
          stream: true,
        });

        let accumulated = "";
        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            accumulated += event.delta.text;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ phase: "thinking", text: event.delta.text })}\n\n`
              )
            );
          }
        }

        // Parse criteria from Claude's response
        const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Failed to parse mix criteria" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const criteria = JSON.parse(jsonMatch[0]);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ phase: "criteria", criteria })}\n\n`
          )
        );

        // Phase 2: Search Spotify for tracks
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ phase: "searching", text: "Searching Spotify for matching tracks..." })}\n\n`
          )
        );

        const tracks = await searchAndEnrichTracks(criteria);

        if (tracks.length === 0) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "No tracks found matching criteria" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ phase: "searching", text: `Found ${tracks.length} tracks, building mix plan...` })}\n\n`
          )
        );

        // Phase 3: Build mix plan (ordering + transitions)
        const mixPlan = buildMixPlan(tracks);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ phase: "complete", mixPlan })}\n\n`
          )
        );

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Mix planning failed";
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

async function searchAndEnrichTracks(
  criteria: Record<string, unknown>
): Promise<MixTrack[]> {
  const allTracks: MixTrack[] = [];
  const seenIds = new Set<string>();
  const searchQueries = (criteria.search_queries as string[]) || [];
  const genres = (criteria.genres as string[]) || [];
  const trackCount = Math.min(
    Math.max((criteria.track_count as number) || 12, 6),
    20
  );

  // Search by Claude's queries
  for (const query of searchQueries) {
    try {
      const data = await spotifyFetch(
        `/search?${new URLSearchParams({
          q: query,
          type: "track",
          limit: "8",
        })}`
      );

      for (const item of data.tracks?.items || []) {
        if (seenIds.has(item.id)) continue;

        // Enforce artist diversity (max 2 per artist)
        const artist = item.artists?.[0]?.name || "Unknown";
        const artistCount = allTracks.filter(
          (t) => t.artists[0] === artist
        ).length;
        if (artistCount >= 2) continue;

        seenIds.add(item.id);
        allTracks.push({
          id: item.id,
          name: item.name,
          uri: item.uri,
          artists: item.artists?.map((a: { name: string }) => a.name) || [],
          album: item.album?.name || "",
          image: item.album?.images?.[0]?.url,
          preview_url: item.preview_url,
          duration_ms: item.duration_ms,
        });
      }
    } catch {
      // Skip failed searches
    }
  }

  // Also search by genre
  for (const genre of genres.slice(0, 2)) {
    try {
      const data = await spotifyFetch(
        `/search?${new URLSearchParams({
          q: `genre:"${genre}"`,
          type: "track",
          limit: "8",
        })}`
      );

      for (const item of data.tracks?.items || []) {
        if (seenIds.has(item.id)) continue;
        const artist = item.artists?.[0]?.name || "Unknown";
        const artistCount = allTracks.filter(
          (t) => t.artists[0] === artist
        ).length;
        if (artistCount >= 2) continue;

        seenIds.add(item.id);
        allTracks.push({
          id: item.id,
          name: item.name,
          uri: item.uri,
          artists: item.artists?.map((a: { name: string }) => a.name) || [],
          album: item.album?.name || "",
          image: item.album?.images?.[0]?.url,
          preview_url: item.preview_url,
          duration_ms: item.duration_ms,
        });
      }
    } catch {
      // Skip failed searches
    }
  }

  // Trim to track count
  const trimmed = allTracks.slice(0, trackCount);

  // Enrich with audio features (BPM, key, energy, danceability)
  if (trimmed.length > 0) {
    try {
      const ids = trimmed.map((t) => t.id).join(",");
      const data = await spotifyFetch(`/audio-features?ids=${ids}`);

      const featureMap = new Map<string, Record<string, unknown>>();
      for (const f of data.audio_features || []) {
        if (f) featureMap.set(f.id, f);
      }

      for (const track of trimmed) {
        const features = featureMap.get(track.id);
        if (features) {
          track.bpm = Math.round(features.tempo as number);
          track.energy = features.energy as number;
          track.danceability = features.danceability as number;
          track.key = features.key as number;
          track.mode = features.mode as number;

          // Convert Spotify key+mode to Camelot notation
          if (
            typeof features.key === "number" &&
            typeof features.mode === "number" &&
            features.key >= 0
          ) {
            track.camelotKey = parseSpotifyKey(
              features.key as number,
              features.mode as number
            );
          }
        }
      }
    } catch {
      // Continue without audio features
    }
  }

  return trimmed;
}
