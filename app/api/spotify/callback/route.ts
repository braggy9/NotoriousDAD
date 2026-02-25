import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { setSpotifyTokensCookie, type SpotifyTokens } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/settings?error=${error || "no_code"}`, request.url)
    );
  }

  const cookieStore = await cookies();
  const verifier = cookieStore.get("spotify_code_verifier")?.value;

  if (!verifier) {
    return NextResponse.redirect(
      new URL("/settings?error=no_verifier", request.url)
    );
  }

  // Exchange code for tokens
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Spotify token exchange failed:", err);
    return NextResponse.redirect(
      new URL("/settings?error=token_exchange", request.url)
    );
  }

  const data = await res.json();
  const tokens: SpotifyTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  // Set tokens cookie and clear verifier
  const response = NextResponse.redirect(
    new URL("/settings?success=true", request.url)
  );
  response.cookies.set(setSpotifyTokensCookie(tokens));
  response.cookies.delete("spotify_code_verifier");

  return response;
}
