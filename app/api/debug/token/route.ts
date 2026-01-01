import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * Debug endpoint to get the current Spotify access token
 * Used for command-line scripts that need the token
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('spotify_access_token');
  const refreshToken = cookieStore.get('spotify_refresh_token');

  if (!accessToken) {
    return NextResponse.json(
      { error: 'No access token found. Please log in first at http://localhost:3000' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    access_token: accessToken.value,
    refresh_token: refreshToken?.value,
    instructions: 'Copy the access_token value and use it with: export SPOTIFY_ACCESS_TOKEN="<token>"',
  });
}
