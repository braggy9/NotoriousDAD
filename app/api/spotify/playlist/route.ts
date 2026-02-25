import { NextRequest, NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";

export async function POST(request: NextRequest) {
  try {
    const { name, description, trackUris } = await request.json();

    if (!name || !trackUris?.length) {
      return NextResponse.json(
        { error: "Name and trackUris required" },
        { status: 400 }
      );
    }

    // Get current user
    const user = await spotifyFetch("/me");

    // Create playlist
    const playlist = await spotifyFetch(`/users/${user.id}/playlists`, {
      method: "POST",
      body: JSON.stringify({
        name,
        description: description || "Created by Notorious D.A.D.",
        public: false,
      }),
    });

    // Add tracks (max 100 per request)
    for (let i = 0; i < trackUris.length; i += 100) {
      const batch = trackUris.slice(i, i + 100);
      await spotifyFetch(`/playlists/${playlist.id}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: batch }),
      });
    }

    return NextResponse.json({
      id: playlist.id,
      url: playlist.external_urls.spotify,
      name: playlist.name,
      trackCount: trackUris.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Playlist creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
