import { NextRequest } from "next/server";
import type { MixPlan } from "@/lib/mix-types";
import { buildFiltergraph } from "@/lib/ffmpeg-builder";

const HETZNER_URL = process.env.HETZNER_API_URL || "https://mixmaster.mixtape.run";

export async function POST(request: NextRequest) {
  const { mixPlan } = (await request.json()) as { mixPlan: MixPlan };

  if (!mixPlan || !mixPlan.tracks.length) {
    return Response.json({ error: "Mix plan required" }, { status: 400 });
  }

  // Build filtergraph commands for the Hetzner server
  const filtergraphs = mixPlan.transitions.map((t) =>
    buildFiltergraph(t.type, t.duration)
  );

  const payload = {
    planId: mixPlan.id,
    tracks: mixPlan.tracks.map((t) => ({
      spotifyId: t.id,
      name: t.name,
      artists: t.artists,
      uri: t.uri,
      duration_ms: t.duration_ms,
      bpm: t.bpm,
    })),
    transitions: mixPlan.transitions.map((t, i) => ({
      ...t,
      filtergraph: filtergraphs[i],
    })),
  };

  // Proxy to Hetzner server with SSE streaming
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${HETZNER_URL}/api/mix/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const error = await res.text();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: `Hetzner error: ${error}` })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // If Hetzner streams SSE, proxy it through
        if (res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            controller.enqueue(encoder.encode(chunk));
          }
        } else {
          // Fallback: Hetzner returned a JSON response
          const data = await res.json();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ status: "queued", planId: data.planId || mixPlan.id })}\n\n`
            )
          );
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Mix execution failed";
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
