import { NextResponse } from "next/server";
import { spotifyFetch } from "@/lib/spotify";

export async function GET() {
  try {
    const user = await spotifyFetch("/me");
    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        display_name: user.display_name,
        images: user.images,
      },
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
