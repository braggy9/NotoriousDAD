import { NextRequest, NextResponse } from 'next/server';

// Minimal Spotify API test - just one request
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('spotify_access_token')?.value;

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token' }, { status: 401 });
  }

  // Try the simplest possible Spotify API call
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    // Capture rate limit headers
    if (key.toLowerCase().includes('retry') || key.toLowerCase().includes('rate')) {
      headers[key] = value;
    }
  });

  if (response.ok) {
    const data = await response.json();
    return NextResponse.json({
      status: 'success',
      user: data.display_name,
      headers,
    });
  } else {
    return NextResponse.json({
      status: 'failed',
      httpStatus: response.status,
      error: await response.text(),
      headers,
      retryAfter: response.headers.get('Retry-After'),
    });
  }
}
