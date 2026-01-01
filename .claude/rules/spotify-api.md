# Spotify API Patterns

## Token Management (CRITICAL)

All API routes MUST implement token refresh logic:

```typescript
let accessToken = request.cookies.get('spotify_access_token')?.value;
const refreshToken = request.cookies.get('spotify_refresh_token')?.value;

// Try API call
let response = await fetch(spotifyEndpoint, {
  headers: { Authorization: `Bearer ${accessToken}` }
});

// If 401 and have refresh token, refresh and retry
if (!response.ok && response.status === 401 && refreshToken) {
  const newTokenData = await refreshAccessToken(refreshToken);
  accessToken = newTokenData.access_token;
  response = await fetch(spotifyEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
}
```

Reference: `app/api/generate-playlist/route.ts:45-69`

## Rate Limits

- Audio features: 100 tracks per request (`/v1/audio-features?ids=...`)
- Artists batch: 50 artists per request (`/v1/artists?ids=...`)
- Recommendations: max 5 seeds total (artists + tracks + genres)

## Playlist Creation Limits

- Name: 100 characters max
- Description: 300 characters max
- Must sanitize control characters and normalize whitespace
- See `app/api/generate-playlist/route.ts:536-557` for sanitization

## Cookie Settings

Auth cookies MUST set:
- `path: '/'`
- `sameSite: 'lax'`
- `httpOnly: true`

Or auth breaks across routes.

## Debug Endpoints

When troubleshooting auth:
- `GET /api/debug/env` - Verify environment variables
- `GET /api/debug/auth` - Check cookie status
- `GET /api/debug/token` - Test token validity
- `GET /api/debug/spotify-test` - Test API connectivity
