'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

type TabType = 'playlist' | 'mix';

interface MixResult {
  success: boolean;
  mixName?: string;
  mixUrl?: string;
  tracklist?: Array<{
    position: number;
    artist: string;
    title: string;
    bpm?: number;
    key?: string;
    energy?: number;
  }>;
  duration?: number;
  transitionCount?: number;
  harmonicPercentage?: number;
  error?: string;
}

interface AvailableMix {
  filename: string;
  name: string;
  sizeFormatted: string;
  durationFormatted: string;
  createdAt: string;
  downloadUrl: string;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const isLoggedIn = searchParams.get('success') === 'true';
  const [activeTab, setActiveTab] = useState<TabType>('playlist');
  const [prompt, setPrompt] = useState('');
  const [mixPrompt, setMixPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [mixLoading, setMixLoading] = useState(false);
  const [availableMixes, setAvailableMixes] = useState<AvailableMix[]>([]);
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
  const [mixResult, setMixResult] = useState<MixResult | null>(null);

  // Load available mixes on mount
  useEffect(() => {
    if (isLoggedIn) {
      fetchAvailableMixes();
    }
  }, [isLoggedIn]);

  const fetchAvailableMixes = async () => {
    try {
      const response = await fetch('/api/list-mixes');
      if (response.ok) {
        const data = await response.json();
        setAvailableMixes(data.mixes || []);
      }
    } catch (error) {
      console.error('Failed to fetch mixes:', error);
    }
  };

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
        const errorMessage = data.error || 'Failed to generate playlist';
        const details = data.details ? `\n\nDetails: ${data.details}` : '';
        setResult({ error: errorMessage + details });
      } else {
        setResult(data);
      }
    } catch (error) {
      setResult({ error: 'An error occurred while generating the playlist' });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMix = async (e: React.FormEvent) => {
    e.preventDefault();
    setMixLoading(true);
    setMixResult(null);

    try {
      const response = await fetch('/api/generate-mix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: mixPrompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMixResult({ success: false, error: data.error || 'Failed to generate mix' });
      } else {
        setMixResult(data);
        // Refresh available mixes
        fetchAvailableMixes();
      }
    } catch (error) {
      setMixResult({ success: false, error: 'An error occurred while generating the mix' });
    } finally {
      setMixLoading(false);
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

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 sm:p-12 md:p-24">
        <div className="text-center max-w-lg">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
            🎧 AI DJ Mix Generator
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8">
            Generate intelligent playlists and audio mixes from natural language
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
    <main className="flex min-h-screen flex-col items-center justify-start p-4 sm:p-8 md:p-16 lg:p-24">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center flex-1">
            🎧 Notorious DAD
          </h1>
          <button
            onClick={handleLogout}
            className="text-xs sm:text-sm text-gray-600 hover:text-red-600 underline transition-colors"
          >
            Logout
          </button>
        </div>
        <p className="text-sm sm:text-base text-gray-600 mb-6 text-center">
          AI-Powered DJ Mix Generator
        </p>

        {/* Tab Navigation */}
        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('playlist')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              activeTab === 'playlist'
                ? 'bg-white text-green-600 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📋 Spotify Playlist
          </button>
          <button
            onClick={() => setActiveTab('mix')}
            className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
              activeTab === 'mix'
                ? 'bg-white text-purple-600 shadow'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🎛️ Audio Mix
          </button>
        </div>

        {/* Playlist Tab */}
        {activeTab === 'playlist' && (
          <div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-6">
              <p className="text-xs sm:text-sm font-semibold text-blue-900 mb-2">
                Creates a Spotify playlist from your library with harmonic mixing
              </p>
              <p className="text-xs text-blue-700">
                Use "Include: artist" for must-have artists, "Reference: artist" for style guide
              </p>
            </div>

            <form onSubmit={handleGeneratePlaylist} className="mb-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: 'Chilled sunset drinks vibe, similar to Bonobo and Tycho, 90-110 BPM'"
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                rows={3}
                required
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPrompt('Chilled vibe, similar to Bonobo and Tycho, 95-110 BPM')}
                  className="text-xs px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-full"
                >
                  😎 Chilled
                </button>
                <button
                  type="button"
                  onClick={() => setPrompt('Energetic workout with Daft Punk, 128-135 BPM, ascending energy')}
                  className="text-xs px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-900 rounded-full"
                >
                  🔥 Energetic
                </button>
                <button
                  type="button"
                  onClick={() => setPrompt('Deep house sunset, 118-124 BPM, wave energy')}
                  className="text-xs px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-full"
                >
                  🌅 Sunset
                </button>
              </div>
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                {loading ? 'Generating...' : 'Generate Spotify Playlist'}
              </button>
            </form>

            {result && (
              <div className={`p-4 rounded-lg ${result.error ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {result.error ? (
                  <pre className="text-xs whitespace-pre-wrap">{result.error}</pre>
                ) : (
                  <div>
                    <p className="font-bold mb-2">{result.message}</p>
                    {result.trackCount && <p className="text-sm">📊 {result.trackCount} tracks</p>}
                    {result.quality && (
                      <p className="text-sm">🎵 {result.quality.harmonicMixPercentage}% harmonic</p>
                    )}
                    <a
                      href={result.playlistUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-3 bg-green-600 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      🎧 Open in Spotify
                    </a>
                    {result.tracks && (
                      <div className="mt-3 pt-3 border-t border-green-300">
                        <p className="text-xs font-semibold mb-2">📥 Export:</p>
                        <div className="flex gap-2">
                          <button onClick={() => handleExport('m3u8')} className="text-xs bg-white px-3 py-1 rounded border">M3U8</button>
                          <button onClick={() => handleExport('json')} className="text-xs bg-white px-3 py-1 rounded border">JSON</button>
                          <button onClick={() => handleExport('csv')} className="text-xs bg-white px-3 py-1 rounded border">CSV</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Audio Mix Tab */}
        {activeTab === 'mix' && (
          <div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4 mb-6">
              <p className="text-xs sm:text-sm font-semibold text-purple-900 mb-2">
                Creates a real audio mix file with crossfades and harmonic transitions
              </p>
              <p className="text-xs text-purple-700">
                Uses your local DJ library with MIK analysis data
              </p>
            </div>

            <form onSubmit={handleGenerateMix} className="mb-4">
              <textarea
                value={mixPrompt}
                onChange={(e) => setMixPrompt(e.target.value)}
                placeholder="Example: 'Tech house mix, 6 tracks, 125 BPM, building energy'"
                className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                rows={3}
                required
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMixPrompt('Tech house mix, 6 tracks, 125 BPM, building energy')}
                  className="text-xs px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 rounded-full"
                >
                  🏠 Tech House
                </button>
                <button
                  type="button"
                  onClick={() => setMixPrompt('Deep house sunset, 6 tracks, 120 BPM, chill vibes')}
                  className="text-xs px-3 py-1.5 bg-pink-100 hover:bg-pink-200 text-pink-900 rounded-full"
                >
                  🌅 Sunset Session
                </button>
                <button
                  type="button"
                  onClick={() => setMixPrompt('High energy mix, 8 tracks, 128-135 BPM, peak time')}
                  className="text-xs px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 rounded-full"
                >
                  ⚡ Peak Time
                </button>
              </div>
              <button
                type="submit"
                disabled={mixLoading || !mixPrompt.trim()}
                className="w-full mt-4 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                {mixLoading ? 'Generating Mix...' : 'Generate Audio Mix'}
              </button>
            </form>

            {mixLoading && (
              <div className="bg-purple-50 p-4 rounded-lg mb-4">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                  <p className="text-purple-700 text-sm">
                    Generating mix... This may take a few minutes
                  </p>
                </div>
              </div>
            )}

            {mixResult && (
              <div className={`p-4 rounded-lg mb-4 ${mixResult.error ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'}`}>
                {mixResult.error ? (
                  <pre className="text-xs whitespace-pre-wrap">{mixResult.error}</pre>
                ) : (
                  <div>
                    <p className="font-bold mb-2">🎉 {mixResult.mixName}</p>
                    <div className="text-sm space-y-1 mb-3">
                      <p>⏱️ Duration: {formatDuration(mixResult.duration)}</p>
                      <p>🔗 Transitions: {mixResult.transitionCount}</p>
                      <p>🎹 Harmonic: {mixResult.harmonicPercentage}%</p>
                    </div>
                    {mixResult.tracklist && (
                      <div className="bg-white/50 rounded p-2 mb-3">
                        <p className="text-xs font-semibold mb-1">Tracklist:</p>
                        {mixResult.tracklist.map((track, i) => (
                          <p key={i} className="text-xs">
                            {track.position}. {track.artist} - {track.title}
                            <span className="text-purple-500 ml-1">
                              ({track.bpm} BPM, {track.key})
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                    <a
                      href={mixResult.mixUrl}
                      className="inline-block bg-purple-600 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      📥 Download Mix
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Available Mixes */}
            {availableMixes.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <p className="font-semibold text-gray-700 mb-3">📁 Previous Mixes</p>
                <div className="space-y-2">
                  {availableMixes.slice(0, 5).map((mix, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3"
                    >
                      <div>
                        <p className="font-medium text-sm">{mix.name}</p>
                        <p className="text-xs text-gray-500">
                          {mix.durationFormatted} • {mix.sizeFormatted}
                        </p>
                      </div>
                      <a
                        href={mix.downloadUrl}
                        className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
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
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">🎧 Notorious DAD</h1>
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
