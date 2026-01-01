'use client';

import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function HomeContent() {
  const searchParams = useSearchParams();
  const isLoggedIn = searchParams.get('success') === 'true';
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    playlistUrl?: string;
    playlistName?: string;
    error?: string;
    message?: string;
    constraints?: string;
    trackCount?: number;
    quality?: any;
    tracks?: any[];
  } | null>(null);

  const handleGeneratePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/generate-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Show detailed error information
        const errorMessage = data.error || 'Failed to generate playlist';
        const details = data.details ? `\n\nDetails: ${data.details}` : '';
        const status = data.status ? `\n\nHTTP Status: ${data.status}` : '';
        const hint = data.hint ? `\n\nHint: ${data.hint}` : '';
        const debugInfo = data.debug ? `\n\nDebug: ${JSON.stringify(data.debug)}` : '';

        setResult({
          error: errorMessage + details + status + hint + debugInfo
        });
      } else {
        setResult(data);
      }
    } catch (error) {
      setResult({ error: 'An error occurred while generating the playlist' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (error) {
      alert('Failed to logout');
    }
  };

  const handleExport = async (format: 'm3u8' | 'json' | 'csv') => {
    if (!result?.tracks || !result?.playlistName) return;

    try {
      const response = await fetch('/api/export-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: result.tracks,
          playlistName: result.playlistName,
          format,
          metadata: {
            description: result.constraints,
            harmonicMixPercentage: result.quality?.harmonicMixPercentage,
            avgTransitionScore: result.quality?.avgTransitionScore,
            constraints: result.constraints,
          },
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `playlist.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to export playlist');
      }
    } catch (error) {
      alert('Error exporting playlist');
    }
  };

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 sm:p-12 md:p-24">
        <div className="text-center max-w-lg">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
            🎧 AI DJ Mix Generator
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8">
            Generate intelligent playlists from natural language
          </p>
          <a
            href="/api/auth"
            className="inline-block bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold px-8 py-3 rounded-lg transition-colors touch-manipulation"
          >
            Login with Spotify
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 md:p-16 lg:p-24">
      <div className="w-full max-w-2xl">
        <div className="flex justify-between items-start mb-2">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center flex-1">
            🎧 AI DJ Mix Generator
          </h1>
          <button
            onClick={handleLogout}
            className="text-xs sm:text-sm text-gray-600 hover:text-red-600 underline transition-colors"
          >
            Logout
          </button>
        </div>
        <p className="text-sm sm:text-base md:text-lg text-gray-600 mb-4 text-center px-2">
          🤖 2-Pass AI Curation • Harmonic Mixing • Personalized • djay Pro Optimized
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-6 sm:mb-8">
          <p className="text-xs sm:text-sm font-semibold text-blue-900 mb-3">✨ How to Prompt:</p>

          <div className="space-y-3 text-xs sm:text-sm text-blue-800">
            <div>
              <p className="font-semibold mb-1">🎵 Artists:</p>
              <p className="ml-3">• <strong>Include</strong>: "Mix with Daft Punk and Justice" (must have these artists)</p>
              <p className="ml-3">• <strong>Reference</strong>: "Similar to Radiohead" (use as style guide, not required)</p>
            </div>

            <div>
              <p className="font-semibold mb-1">😎 Vibes & Moods:</p>
              <p className="ml-3">• <strong>Chilled</strong>: relaxing, afternoon coffee, wind down, sunset drinks</p>
              <p className="ml-3">• <strong>Energetic</strong>: workout, party, pre-game, pump-up</p>
              <p className="ml-3">• <strong>Focused</strong>: study, deep work, coding, concentration</p>
              <p className="ml-3">• <strong>Social</strong>: dinner party, drinks with friends, background vibes</p>
              <p className="ml-3">• <strong>Moody</strong>: introspective, late-night, melancholic, atmospheric</p>
            </div>

            <div>
              <p className="font-semibold mb-1">🎛️ Other Options:</p>
              <p className="ml-3">• <strong>Beatport charts</strong>: "Beatport tech house top 10"</p>
              <p className="ml-3">• <strong>Seed playlists</strong>: Paste any Spotify playlist URL</p>
              <p className="ml-3">• <strong>BPM/Energy</strong>: Specify ranges (e.g., "120-128 BPM, energy 7-9/10")</p>
              <p className="ml-3">• <strong>Energy curves</strong>: ascending, descending, wave, peak-middle, peak-end</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleGeneratePlaylist} className="mb-4 sm:mb-6">
          <div className="mb-4">
            <label htmlFor="prompt" className="block text-sm font-medium text-gray-700 mb-2">
              Describe your playlist
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: 'Chilled sunset drinks vibe, similar to Bonobo and Tycho, 90-110 BPM, relaxing afternoon coffee mood' or 'Energetic workout mix with Daft Punk and Justice, 128-135 BPM, ascending energy, pump-up party vibes'"
              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none touch-manipulation"
              rows={4}
              required
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPrompt('Beatport tech house chart, 126-130 BPM, peak-middle energy')}
                className="text-xs sm:text-sm px-3 py-1.5 sm:py-2 bg-purple-100 hover:bg-purple-200 active:bg-purple-300 text-purple-900 rounded-full transition-colors touch-manipulation font-medium"
              >
                📊 Beatport
              </button>
              <button
                type="button"
                onClick={() => setPrompt('Chilled vibe, similar to Bonobo and Tycho, relaxing afternoon coffee mood, 95-110 BPM')}
                className="text-xs sm:text-sm px-3 py-1.5 sm:py-2 bg-blue-100 hover:bg-blue-200 active:bg-blue-300 text-blue-900 rounded-full transition-colors touch-manipulation"
              >
                😎 Chilled (Reference)
              </button>
              <button
                type="button"
                onClick={() => setPrompt('Energetic workout mix with Daft Punk and Justice, pump-up party vibes, 128-135 BPM, ascending energy')}
                className="text-xs sm:text-sm px-3 py-1.5 sm:py-2 bg-orange-100 hover:bg-orange-200 active:bg-orange-300 text-orange-900 rounded-full transition-colors touch-manipulation"
              >
                🔥 Energetic (Include)
              </button>
              <button
                type="button"
                onClick={() => setPrompt('Focused deep work, similar to Jon Hopkins and Nils Frahm, concentration and coding mood, 110-125 BPM')}
                className="text-xs sm:text-sm px-3 py-1.5 sm:py-2 bg-green-100 hover:bg-green-200 active:bg-green-300 text-green-900 rounded-full transition-colors touch-manipulation"
              >
                🎯 Focused
              </button>
              <button
                type="button"
                onClick={() => setPrompt('Social dinner party, background vibes with drinks with friends mood, 100-115 BPM, wave energy')}
                className="text-xs sm:text-sm px-3 py-1.5 sm:py-2 bg-pink-100 hover:bg-pink-200 active:bg-pink-300 text-pink-900 rounded-full transition-colors touch-manipulation"
              >
                🍷 Social
              </button>
            </div>
            <p className="mt-3 text-xs sm:text-sm text-gray-500">
              💡 <strong>Tip:</strong> Use "with [artists]" to include them, "similar to [artists]" to use as reference!
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base rounded-lg transition-colors touch-manipulation"
          >
            {loading ? 'Generating...' : 'Generate Playlist'}
          </button>
        </form>

        {result && (
          <div className={`p-4 sm:p-6 rounded-lg ${result.error ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {result.error ? (
              <div>
                <p className="font-bold mb-2">❌ Error:</p>
                <pre className="text-xs sm:text-sm whitespace-pre-wrap font-mono bg-red-50 p-3 rounded border border-red-300 overflow-x-auto">
                  {result.error}
                </pre>
              </div>
            ) : (
              <div>
                <p className="font-bold mb-3 text-base sm:text-lg">{result.message || '✓ Playlist created successfully!'}</p>
                {result.trackCount && (
                  <div className="mb-3 text-xs sm:text-sm space-y-1">
                    <p>📊 {result.trackCount} tracks selected</p>
                    {result.constraints && <p className="break-words">🎯 {result.constraints}</p>}
                    {result.quality && (
                      <p>🎵 {result.quality.harmonicMixPercentage}% harmonic • {result.quality.avgTransitionScore}/100 quality</p>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
                  <a
                    href={result.playlistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-center bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors touch-manipulation"
                  >
                    🎧 Open in Spotify
                  </a>
                </div>

                {result.tracks && (
                  <div className="border-t border-green-300 pt-4 mt-4">
                    <p className="text-xs sm:text-sm font-semibold mb-3">📥 Export for djay Pro:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        onClick={() => handleExport('m3u8')}
                        className="bg-white hover:bg-green-50 active:bg-green-100 text-green-700 font-medium px-4 py-3 rounded border border-green-300 transition-colors text-xs sm:text-sm touch-manipulation"
                      >
                        📄 M3U8 (Recommended)
                      </button>
                      <button
                        onClick={() => handleExport('json')}
                        className="bg-white hover:bg-green-50 active:bg-green-100 text-green-700 font-medium px-4 py-3 rounded border border-green-300 transition-colors text-xs sm:text-sm touch-manipulation"
                      >
                        🔧 JSON
                      </button>
                      <button
                        onClick={() => handleExport('csv')}
                        className="bg-white hover:bg-green-50 active:bg-green-100 text-green-700 font-medium px-4 py-3 rounded border border-green-300 transition-colors text-xs sm:text-sm touch-manipulation"
                      >
                        📊 CSV
                      </button>
                    </div>
                    <p className="text-xs text-green-800 mt-3">
                      💡 Import M3U8 to djay Pro: File → Import Playlist → Select file
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen flex-col items-center justify-center p-6 sm:p-12 md:p-24">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">🎧 AI DJ Mix Generator</h1>
          <p className="text-lg sm:text-xl text-gray-600">Loading...</p>
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
