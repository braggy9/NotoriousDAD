import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const USER_DATA_DIR = path.join(process.cwd(), 'data', 'user-data');
const MAX_HISTORY_ITEMS = 100; // Limit history to prevent unbounded growth

interface TrackItem {
  title: string;
  artist: string;
  bpm?: number;
  key?: string;
}

interface GenerationHistoryItem {
  id: string;
  prompt: string;
  playlistName?: string;
  playlistURL?: string;
  trackCount: number;
  generationType: 'spotify' | 'mix';
  tracks?: TrackItem[];  // Track listing for mixes
  duration?: string;     // Duration for mixes
  createdAt: string;
}

interface SpotifyUser {
  id: string;
  display_name: string;
}

/**
 * Refresh Spotify access token
 */
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string } | null> {
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

/**
 * Get authenticated Spotify user from request
 */
async function getAuthenticatedUser(request: NextRequest, body?: any): Promise<{ user: SpotifyUser; error?: never } | { user?: never; error: NextResponse }> {
  // Try cookies first (web app)
  let accessToken = request.cookies.get('spotify_access_token')?.value;
  let refreshToken = request.cookies.get('spotify_refresh_token')?.value;

  // Fallback: Accept tokens from request body (for iOS/macOS apps)
  if (!accessToken && !refreshToken && body) {
    accessToken = body.access_token;
    refreshToken = body.refresh_token;
  }

  // Fallback: Use server-side refresh token
  if (!accessToken && !refreshToken) {
    refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  }

  if (!accessToken && !refreshToken) {
    return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  // Fetch user profile
  let userResponse = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userResponse.ok && userResponse.status === 401 && refreshToken) {
    const newTokenData = await refreshAccessToken(refreshToken);
    if (!newTokenData) {
      return { error: NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 }) };
    }
    accessToken = newTokenData.access_token;
    userResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  if (!userResponse.ok) {
    return { error: NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 }) };
  }

  const user: SpotifyUser = await userResponse.json();
  return { user };
}

/**
 * Get user's history file path
 */
function getUserHistoryPath(userId: string): string {
  return path.join(USER_DATA_DIR, userId, 'history.json');
}

/**
 * Ensure user data directory exists
 */
async function ensureUserDir(userId: string): Promise<void> {
  const userDir = path.join(USER_DATA_DIR, userId);
  await fs.mkdir(userDir, { recursive: true });
}

/**
 * Load user's history
 */
async function loadHistory(userId: string): Promise<GenerationHistoryItem[]> {
  try {
    const filePath = getUserHistoryPath(userId);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet - return empty array
    return [];
  }
}

/**
 * Save user's history
 */
async function saveHistory(userId: string, history: GenerationHistoryItem[]): Promise<void> {
  await ensureUserDir(userId);
  const filePath = getUserHistoryPath(userId);
  // Limit history size
  const limitedHistory = history.slice(0, MAX_HISTORY_ITEMS);
  await fs.writeFile(filePath, JSON.stringify(limitedHistory, null, 2));
}

/**
 * GET /api/user/history - List generation history for authenticated user
 * Query params: limit (default 20), offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser(request);
    if (authResult.error) return authResult.error;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const allHistory = await loadHistory(authResult.user.id);
    const history = allHistory.slice(offset, offset + limit);

    console.log(`📜 History: Loaded ${history.length}/${allHistory.length} items for user ${authResult.user.display_name}`);

    return NextResponse.json({
      history,
      total: allHistory.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error loading history:', error);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  }
}

/**
 * POST /api/user/history - Add a new history item
 * Body: { item: GenerationHistoryItem, access_token?: string, refresh_token?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { item } = body;

    if (!item || !item.id || !item.prompt || !item.generationType) {
      return NextResponse.json({ error: 'Invalid history item data' }, { status: 400 });
    }

    const authResult = await getAuthenticatedUser(request, body);
    if (authResult.error) return authResult.error;

    const history = await loadHistory(authResult.user.id);

    // Add new item at the beginning
    const newItem: GenerationHistoryItem = {
      ...item,
      createdAt: item.createdAt || new Date().toISOString(),
    };

    history.unshift(newItem);
    await saveHistory(authResult.user.id, history);

    console.log(`📜 History: Added ${item.generationType} generation for user ${authResult.user.display_name}`);

    return NextResponse.json({ success: true, item: newItem });
  } catch (error) {
    console.error('Error saving history item:', error);
    return NextResponse.json({ error: 'Failed to save history item' }, { status: 500 });
  }
}

/**
 * DELETE /api/user/history - Clear all history or delete specific item
 * Body: { itemId?: string, clearAll?: boolean, access_token?: string, refresh_token?: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, clearAll } = body;

    const authResult = await getAuthenticatedUser(request, body);
    if (authResult.error) return authResult.error;

    if (clearAll) {
      await saveHistory(authResult.user.id, []);
      console.log(`📜 History: Cleared all history for user ${authResult.user.display_name}`);
      return NextResponse.json({ success: true });
    }

    if (!itemId) {
      return NextResponse.json({ error: 'Item ID or clearAll flag required' }, { status: 400 });
    }

    const history = await loadHistory(authResult.user.id);
    const filteredHistory = history.filter(h => h.id !== itemId);

    if (filteredHistory.length === history.length) {
      return NextResponse.json({ error: 'History item not found' }, { status: 404 });
    }

    await saveHistory(authResult.user.id, filteredHistory);

    console.log(`📜 History: Deleted item ${itemId} for user ${authResult.user.display_name}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting history:', error);
    return NextResponse.json({ error: 'Failed to delete history' }, { status: 500 });
  }
}
