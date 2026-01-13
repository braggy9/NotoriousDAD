import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;

  // Use environment variable for redirect URI (nginx proxy doesn't pass correct host)
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://mixmaster.mixtape.run/api/auth/callback';

  console.log('🔐 Auth flow started:', { redirectUri });

  const scopes = [
    'user-read-private',
    'user-read-email',
    'playlist-read-private',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-library-read',
    'user-top-read',
    'ugc-image-upload', // Required for custom playlist cover art
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId!,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    show_dialog: 'true', // Force Spotify to show login/consent even if already logged in
  });

  const spotifyAuthUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  return NextResponse.redirect(spotifyAuthUrl);
}
