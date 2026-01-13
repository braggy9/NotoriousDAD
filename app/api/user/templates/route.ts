import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const USER_DATA_DIR = path.join(process.cwd(), 'data', 'user-data');

// Template structure matches iOS app's PromptTemplate
interface PromptTemplate {
  id: string;
  name: string;
  includeArtists: string;
  referenceArtists: string;
  vibe?: string;
  energy: string;
  notes: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt?: string;
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
 * Get user's templates file path
 */
function getUserTemplatesPath(userId: string): string {
  return path.join(USER_DATA_DIR, userId, 'templates.json');
}

/**
 * Ensure user data directory exists
 */
async function ensureUserDir(userId: string): Promise<void> {
  const userDir = path.join(USER_DATA_DIR, userId);
  await fs.mkdir(userDir, { recursive: true });
}

/**
 * Load user's templates
 */
async function loadTemplates(userId: string): Promise<PromptTemplate[]> {
  try {
    const filePath = getUserTemplatesPath(userId);
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet - return empty array
    return [];
  }
}

/**
 * Save user's templates
 */
async function saveTemplates(userId: string, templates: PromptTemplate[]): Promise<void> {
  await ensureUserDir(userId);
  const filePath = getUserTemplatesPath(userId);
  await fs.writeFile(filePath, JSON.stringify(templates, null, 2));
}

/**
 * GET /api/user/templates - List all templates for authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser(request);
    if (authResult.error) return authResult.error;

    const templates = await loadTemplates(authResult.user.id);

    console.log(`📋 Templates: Loaded ${templates.length} templates for user ${authResult.user.display_name}`);

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error loading templates:', error);
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  }
}

/**
 * POST /api/user/templates - Create or update a template
 * Body: { template: PromptTemplate, access_token?: string, refresh_token?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { template } = body;

    if (!template || !template.id || !template.name) {
      return NextResponse.json({ error: 'Invalid template data' }, { status: 400 });
    }

    const authResult = await getAuthenticatedUser(request, body);
    if (authResult.error) return authResult.error;

    const templates = await loadTemplates(authResult.user.id);

    // Find existing template or add new one
    const existingIndex = templates.findIndex(t => t.id === template.id);
    const now = new Date().toISOString();

    const updatedTemplate: PromptTemplate = {
      ...template,
      updatedAt: now,
      createdAt: template.createdAt || now,
    };

    if (existingIndex >= 0) {
      templates[existingIndex] = updatedTemplate;
      console.log(`📋 Templates: Updated template "${template.name}" for user ${authResult.user.display_name}`);
    } else {
      templates.unshift(updatedTemplate);
      console.log(`📋 Templates: Created template "${template.name}" for user ${authResult.user.display_name}`);
    }

    await saveTemplates(authResult.user.id, templates);

    return NextResponse.json({ success: true, template: updatedTemplate });
  } catch (error) {
    console.error('Error saving template:', error);
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 });
  }
}

/**
 * DELETE /api/user/templates - Delete a template
 * Body: { templateId: string, access_token?: string, refresh_token?: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
    }

    const authResult = await getAuthenticatedUser(request, body);
    if (authResult.error) return authResult.error;

    const templates = await loadTemplates(authResult.user.id);
    const filteredTemplates = templates.filter(t => t.id !== templateId);

    if (filteredTemplates.length === templates.length) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await saveTemplates(authResult.user.id, filteredTemplates);

    console.log(`📋 Templates: Deleted template ${templateId} for user ${authResult.user.display_name}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
