import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  // Use environment variable for redirect URI (nginx proxy doesn't pass correct host)
  const baseUrl = process.env.SPOTIFY_REDIRECT_URI?.replace('/api/auth/callback', '') || 'https://mixmaster.mixtape.run';
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'https://mixmaster.mixtape.run/api/auth/callback';

  console.log('🔄 Callback received:', {
    hasCode: !!code,
    hasError: !!error,
    redirectUri,
    baseUrl
  });

  if (error) {
    console.error('❌ Auth error:', error);
    return NextResponse.redirect(new URL(`/?error=${error}`, baseUrl));
  }

  if (!code) {
    console.error('❌ No code received');
    return NextResponse.redirect(new URL('/?error=no_code', baseUrl));
  }

  try {
    // Exchange the authorization code for an access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', baseUrl));
    }

    const tokenData = await tokenResponse.json();

    // Write token to .spotify-token.json for command-line scripts
    try {
      const tokenFilePath = join(process.cwd(), '.spotify-token.json');
      writeFileSync(tokenFilePath, JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in * 1000),
        token_type: tokenData.token_type,
      }, null, 2));
      console.log('✓ Wrote Spotify token to .spotify-token.json');
    } catch (fileError) {
      console.error('Failed to write token file:', fileError);
    }

    // For now, redirect to home with success
    // In a real app, you'd store the access_token and refresh_token in a session/database
    const response = NextResponse.redirect(new URL('/?success=true', baseUrl));

    // Store tokens in HTTP-only cookies for security
    const cookieOptions = {
      httpOnly: true,
      secure: true, // Always use secure in production (Vercel is always HTTPS)
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookies.set('spotify_access_token', tokenData.access_token, {
      ...cookieOptions,
      maxAge: tokenData.expires_in,
    });

    if (tokenData.refresh_token) {
      response.cookies.set('spotify_refresh_token', tokenData.refresh_token, {
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }

    console.log('✅ Cookies set:', {
      access_token_length: tokenData.access_token.length,
      has_refresh: !!tokenData.refresh_token,
      expires_in: tokenData.expires_in,
    });

    return response;
  } catch (error) {
    console.error('Error in callback:', error);
    return NextResponse.redirect(new URL('/?error=callback_error', baseUrl));
  }
}
