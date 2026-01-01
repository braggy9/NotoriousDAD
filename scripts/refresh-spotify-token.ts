// Refresh Spotify access token using refresh token
// Run with: npx tsx scripts/refresh-spotify-token.ts

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

async function refreshToken() {
  const tokenPath = join(process.cwd(), '.spotify-token.json');

  if (!existsSync(tokenPath)) {
    console.error('❌ No token file found at .spotify-token.json');
    process.exit(1);
  }

  const tokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'));

  if (!tokenData.refresh_token) {
    console.error('❌ No refresh token found!');
    process.exit(1);
  }

  console.log('🔄 Refreshing Spotify access token...');

  // Load credentials from .env.local
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) {
    console.error('❌ No .env.local file found');
    process.exit(1);
  }

  const envContent = readFileSync(envPath, 'utf-8');
  const clientId = envContent.match(/SPOTIFY_CLIENT_ID=(.+)/)?.[1]?.trim();
  const clientSecret = envContent.match(/SPOTIFY_CLIENT_SECRET=(.+)/)?.[1]?.trim();

  if (!clientId || !clientSecret) {
    console.error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env.local');
    process.exit(1);
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
    console.error('❌ Token refresh failed:', errorData);
    process.exit(1);
  }

  const newTokenData = await response.json();

  // Update token file
  writeFileSync(tokenPath, JSON.stringify({
    access_token: newTokenData.access_token,
    refresh_token: newTokenData.refresh_token || tokenData.refresh_token,
    expires_at: Date.now() + (newTokenData.expires_in * 1000),
    token_type: newTokenData.token_type,
  }, null, 2));

  console.log('✅ Token refreshed successfully!');
  console.log(`   New token expires in: ${newTokenData.expires_in} seconds (${Math.floor(newTokenData.expires_in / 60)} minutes)`);
}

refreshToken().catch(console.error);
