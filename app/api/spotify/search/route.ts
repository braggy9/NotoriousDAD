import { NextRequest, NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q");
  const genre = searchParams.get("genre");
  const limit = searchParams.get("limit") || "20";

  if (!q && !genre) {
    return NextResponse.json(
      { error: "Query (q) or genre required" },
      { status: 400 }
    );
  }

  try {
    // Build Spotify search query
    let query = q || "";
    if (genre) {
      query += ` genre:"${genre}"`;
    }

    const data = await spotifyFetch(
      `/search?${new URLSearchParams({
        q: query.trim(),
        type: "track",
        limit,
      })}`
    );

    const tracks = data.tracks.items.map((track: Record<string, unknown>) => ({
      id: track.id,
      name: track.name,
      uri: track.uri,
      artists: (track.artists as Array<{ name: string }>).map((a) => a.name),
      album: (track.album as { name: string; images: Array<{ url: string }> }).name,
      image: (track.album as { images: Array<{ url: string }> }).images?.[0]?.url,
      preview_url: track.preview_url,
      duration_ms: track.duration_ms,
    }));

    return NextResponse.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
