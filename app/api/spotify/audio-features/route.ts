import { NextRequest, NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids");

  if (!ids) {
    return NextResponse.json(
      { error: "Track IDs required (comma-separated)" },
      { status: 400 }
    );
  }

  try {
    const data = await spotifyFetch(`/audio-features?ids=${ids}`);

    const features = data.audio_features
      .filter(Boolean)
      .map((f: Record<string, unknown>) => ({
        id: f.id,
        bpm: Math.round(f.tempo as number),
        key: f.key,
        mode: f.mode,
        energy: f.energy,
        danceability: f.danceability,
        valence: f.valence,
      }));

    return NextResponse.json({ features });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get audio features";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
