// Automatic Spotify token management with refresh
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TOKEN_PATH = join(process.cwd(), '.spotify-token.json');
const ENV_PATH = join(process.cwd(), '.env.local');

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
}

let cachedToken: TokenData | null = null;
let lastRefreshTime = 0;

/**
 * Get a valid Spotify access token, automatically refreshing if needed
 */
export async function getValidToken(): Promise<string> {
  // Reload token from file if we haven't cached it or if it's been a while
  if (!cachedToken || Date.now() - lastRefreshTime > 30000) {
    if (!existsSync(TOKEN_PATH)) {
      throw new Error('❌ No token file found. Please log in at http://localhost:3000');
    }
    cachedToken = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
    lastRefreshTime = Date.now();
  }

  // Check if token is expired or will expire in next 5 minutes
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  if (cachedToken && cachedToken.expires_at && Date.now() + expiryBuffer > cachedToken.expires_at) {
    console.log('🔄 Token expired or expiring soon, refreshing...');
    await refreshToken();

    // Reload the refreshed token
    cachedToken = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
    lastRefreshTime = Date.now();
  }

  if (!cachedToken) {
    throw new Error('❌ No valid token available');
  }

  return cachedToken.access_token;
}

/**
 * Refresh the Spotify access token
 */
async function refreshToken(): Promise<void> {
  if (!existsSync(TOKEN_PATH)) {
    throw new Error('❌ No token file found');
  }

  const tokenData: TokenData = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));

  if (!tokenData.refresh_token) {
    throw new Error('❌ No refresh token found');
  }

  // Load credentials from .env.local
  if (!existsSync(ENV_PATH)) {
    throw new Error('❌ No .env.local file found');
  }

  const envContent = readFileSync(ENV_PATH, 'utf-8');
  const clientId = envContent.match(/SPOTIFY_CLIENT_ID=(.+)/)?.[1]?.trim();
  const clientSecret = envContent.match(/SPOTIFY_CLIENT_SECRET=(.+)/)?.[1]?.trim();

  if (!clientId || !clientSecret) {
    throw new Error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenData.refresh_token,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Token refresh failed: ${errorData}`);
  }

  const newTokenData = await response.json();

  // Update token file
  writeFileSync(TOKEN_PATH, JSON.stringify({
    access_token: newTokenData.access_token,
    refresh_token: newTokenData.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + (newTokenData.expires_in * 1000),
    token_type: newTokenData.token_type,
  }, null, 2));

  console.log(`✅ Token refreshed! Valid for ${Math.floor(newTokenData.expires_in / 60)} minutes`);
}

/**
 * Force invalidate the cached token (useful for testing or after manual changes)
 */
export function invalidateCache(): void {
  cachedToken = null;
  lastRefreshTime = 0;
}
