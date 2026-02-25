import { cookies } from "next/headers";

export interface SpotifyTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

const SPOTIFY_TOKEN_COOKIE = "spotify_tokens";

export async function getSpotifyTokens(): Promise<SpotifyTokens | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SPOTIFY_TOKEN_COOKIE)?.value;
  if (!raw) return null;

  try {
    const tokens: SpotifyTokens = JSON.parse(raw);
    // Check if expired (with 60s buffer)
    if (Date.now() > tokens.expires_at - 60_000) {
      return refreshTokens(tokens.refresh_token);
    }
    return tokens;
  } catch {
    return null;
  }
}

async function refreshTokens(refreshToken: string): Promise<SpotifyTokens | null> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.SPOTIFY_CLIENT_ID!,
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const tokens: SpotifyTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  // Update cookie
  const cookieStore = await cookies();
  cookieStore.set(SPOTIFY_TOKEN_COOKIE, JSON.stringify(tokens), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return tokens;
}

export function setSpotifyTokensCookie(tokens: SpotifyTokens) {
  // This is called from route handlers that have access to the response
  return {
    name: SPOTIFY_TOKEN_COOKIE,
    value: JSON.stringify(tokens),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };
}

export function clearSpotifyTokensCookie() {
  return {
    name: SPOTIFY_TOKEN_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
  };
}

export async function spotifyFetch(path: string, options: RequestInit = {}) {
  const tokens = await getSpotifyTokens();
  if (!tokens) throw new Error("Not authenticated with Spotify");

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Spotify API error ${res.status}: ${error}`);
  }

  return res.json();
}

// PKCE helpers
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(new Uint8Array(digest));
}

function base64URLEncode(buffer: Uint8Array): string {
  let str = "";
  buffer.forEach((byte) => (str += String.fromCharCode(byte)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
