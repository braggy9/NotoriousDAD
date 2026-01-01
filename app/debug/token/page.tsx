import { cookies } from 'next/headers';

export default async function TokenDebugPage() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('spotify_access_token');
  const refreshToken = cookieStore.get('spotify_refresh_token');

  if (!accessToken) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
        <h1>❌ No Access Token Found</h1>
        <p>Please <a href="/">log in first</a></p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', maxWidth: '800px' }}>
      <h1>🎵 Spotify Access Token</h1>

      <h2>Access Token:</h2>
      <div style={{
        background: '#f5f5f5',
        padding: '1rem',
        borderRadius: '4px',
        wordBreak: 'break-all',
        marginBottom: '2rem'
      }}>
        <code>{accessToken.value}</code>
      </div>

      <h2>Command to use:</h2>
      <div style={{
        background: '#2d2d2d',
        color: '#fff',
        padding: '1rem',
        borderRadius: '4px',
        marginBottom: '1rem'
      }}>
        <code>export SPOTIFY_ACCESS_TOKEN="{accessToken.value}"</code>
      </div>

      {refreshToken && (
        <>
          <h2>Refresh Token:</h2>
          <div style={{
            background: '#f5f5f5',
            padding: '1rem',
            borderRadius: '4px',
            wordBreak: 'break-all'
          }}>
            <code>{refreshToken.value}</code>
          </div>
        </>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#e3f2fd', borderRadius: '4px' }}>
        <h3>📋 Quick Start:</h3>
        <ol>
          <li>Copy the export command above</li>
          <li>Paste it in your terminal</li>
          <li>Run: <code>npx tsx scripts/match-apple-music-to-spotify.ts</code></li>
        </ol>
      </div>
    </div>
  );
}
