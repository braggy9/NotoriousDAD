import { NextResponse } from "next/server";
import { clearSpotifyTokensCookie } from "@/lib/spotify";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearSpotifyTokensCookie());
  return response;
}
