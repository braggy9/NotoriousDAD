#!/usr/bin/env npx tsx
/**
 * Spotify CLI Authentication Helper
 *
 * Usage: npx tsx scripts/spotify-auth.ts
 *
 * Opens browser for Spotify login, captures tokens automatically,
 * and saves them to .spotify-token.json for use by the matcher.
 */

import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { randomBytes, createHash } from 'crypto';

const ENV_PATH = join(process.cwd(), '.env.local');
const TOKEN_PATH = join(process.cwd(), '.spotify-token.json');
const PORT = 8888;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

// Load credentials
function loadCredentials() {
  if (!existsSync(ENV_PATH)) {
    throw new Error('❌ No .env.local file found');
  }

  const envContent = readFileSync(ENV_PATH, 'utf-8');
  const clientId = envContent.match(/SPOTIFY_CLIENT_ID=(.+)/)?.[1]?.trim().replace(/^["']|["']$/g, '');
  const clientSecret = envContent.match(/SPOTIFY_CLIENT_SECRET=(.+)/)?.[1]?.trim().replace(/^["']|["']$/g, '');

  if (!clientId || !clientSecret) {
    throw new Error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env.local');
  }

  return { clientId, clientSecret };
}

// Generate PKCE code verifier and challenge
function generatePKCE() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// Open URL in default browser
function openBrowser(url: string) {
  const command = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "${url}"`
      : `xdg-open "${url}"`;

  exec(command, (error) => {
    if (error) {
      console.log('\n📋 Please open this URL manually:');
      console.log(url);
    }
  });
}

async function main() {
  console.log('🎵 Spotify CLI Authentication');
  console.log('============================\n');

  const { clientId, clientSecret } = loadCredentials();
  const { verifier, challenge } = generatePKCE();

  // Scopes needed for the matcher and playlist generation
  const scopes = [
    'user-library-read',
    'user-read-private',
    'user-read-email',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-top-read',
    'user-read-recently-played',
  ].join(' ');

  // Build authorization URL
  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('code_challenge', challenge);

  // Create temporary server to catch the callback
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${PORT}`);

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>❌ Authorization Failed</h1><p>${error}</p>`);
        console.error(`\n❌ Authorization failed: ${error}`);
        server.close();
        process.exit(1);
      }

      if (code) {
        console.log('\n✅ Authorization code received, exchanging for tokens...');

        try {
          // Exchange code for tokens
          const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              redirect_uri: REDIRECT_URI,
              code_verifier: verifier,
            }),
          });

          if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${errorData}`);
          }

          const tokenData = await tokenResponse.json();

          // Save tokens
          writeFileSync(TOKEN_PATH, JSON.stringify({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: Date.now() + (tokenData.expires_in * 1000),
            token_type: tokenData.token_type,
          }, null, 2));

          console.log('\n✅ Tokens saved to .spotify-token.json');
          console.log(`   Access token valid for ${Math.floor(tokenData.expires_in / 60)} minutes`);
          console.log('   Refresh token saved for automatic renewal\n');

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Success!</title></head>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>✅ Authentication Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
                <p>Tokens have been saved to <code>.spotify-token.json</code></p>
              </body>
            </html>
          `);

          server.close();
          process.exit(0);

        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>❌ Token Exchange Failed</h1><pre>${err}</pre>`);
          console.error(`\n❌ Token exchange failed:`, err);
          server.close();
          process.exit(1);
        }
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`🌐 Callback server listening on http://localhost:${PORT}`);
    console.log('\n📱 Opening browser for Spotify login...\n');
    openBrowser(authUrl.toString());
    console.log('Waiting for authorization...');
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    console.error('\n⏰ Timeout: No authorization received after 5 minutes');
    server.close();
    process.exit(1);
  }, 5 * 60 * 1000);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
