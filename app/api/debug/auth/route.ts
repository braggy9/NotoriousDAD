import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('spotify_access_token')?.value;
  const refreshToken = request.cookies.get('spotify_refresh_token')?.value;
  const allCookies = request.cookies.getAll();

  const result: any = {
    timestamp: new Date().toISOString(),
    cookies: {
      total: allCookies.length,
      names: allCookies.map(c => c.name),
      hasAccessToken: !!accessToken,
      accessTokenLength: accessToken?.length,
      hasRefreshToken: !!refreshToken,
      refreshTokenLength: refreshToken?.length,
    },
    spotifyTest: null,
  };

  // Try to fetch Spotify profile
  if (accessToken) {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.ok) {
        const user = await response.json();
        result.spotifyTest = {
          status: 'success',
          user: {
            id: user.id,
            display_name: user.display_name,
            email: user.email,
          }
        };
      } else {
        result.spotifyTest = {
          status: 'failed',
          httpStatus: response.status,
          error: await response.text(),
        };
      }
    } catch (error) {
      result.spotifyTest = {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  } else {
    result.spotifyTest = {
      status: 'no_token',
      message: 'No access token found in cookies',
    };
  }

  return NextResponse.json(result, { status: 200 });
}
