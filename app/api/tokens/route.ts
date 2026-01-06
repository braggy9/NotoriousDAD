import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Try cookies first (for authenticated web sessions - has latest tokens)
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('spotify_access_token')?.value;
    const refreshToken = cookieStore.get('spotify_refresh_token')?.value;

    if (accessToken && refreshToken) {
      return NextResponse.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: Date.now() + 3600000, // Assume 1 hour from now
        source: 'cookies'
      });
    }

    // Fall back to file (for local development and scripts)
    const tokenPath = path.join(process.cwd(), '.spotify-token.json');

    if (fs.existsSync(tokenPath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
      return NextResponse.json({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_at,
        source: 'file'
      });
    }

    // No tokens found anywhere
    return NextResponse.json(
      { error: 'Not authenticated. Please log in via web app first.' },
      { status: 401 }
    );
  } catch (error) {
    console.error('Token API error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve tokens' },
      { status: 500 }
    );
  }
}
