"use client";

import { useState, useRef } from "react";
import {
  parseCriteria,
  searchTracks,
  enrichWithAudioFeatures,
  type PlaylistCriteria,
  type SpotifyTrack,
} from "@/lib/playlist-generator";
import { addTracksToMixQueue } from "@/lib/mix-store";
import type { MixTrack } from "@/lib/mix-types";

const PRESETS = [
  "Upbeat house for a summer BBQ",
  "Chill lounge vibes for dinner",
  "90s hip hop block party",
  "Deep house sunset session",
  "Disco funk dance floor",
  "Ambient electronic for focus",
];

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [rawResponse, setRawResponse] = useState("");
  const [criteria, setCriteria] = useState<PlaylistCriteria | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sentToMix, setSentToMix] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function generate(text: string) {
    const input = text || prompt;
    if (!input.trim()) return;

    // Reset state
    setStreaming(true);
    setRawResponse("");
    setCriteria(null);
    setTracks([]);
    setPlaylistUrl(null);
    setError("");

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        setError("Failed to generate. Check API key in settings.");
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                setError(parsed.error);
              } else if (parsed.text) {
                accumulated += parsed.text;
                setRawResponse(accumulated);
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }

      // Parse criteria from completed response
      const parsed = parseCriteria(accumulated);
      if (parsed) {
        setCriteria(parsed);
        setStreaming(false);

        // Now search Spotify
        setLoadingTracks(true);
        try {
          let results = await searchTracks(parsed);
          results = await enrichWithAudioFeatures(results);
          setTracks(results);
        } catch {
          setError("Connected to Claude but Spotify search failed. Check Spotify connection in Settings.");
        }
        setLoadingTracks(false);
      } else {
        setError("Couldn't parse AI response. Try again.");
        setStreaming(false);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Generation failed. Check your connection.");
      }
      setStreaming(false);
    }
  }

  async function savePlaylist() {
    if (!tracks.length || !criteria) return;

    setSavingPlaylist(true);
    try {
      const res = await fetch("/api/spotify/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `D.A.D. — ${criteria.mood} ${criteria.genres[0] || "mix"}`,
          description: criteria.description,
          trackUris: tracks.map((t) => t.uri),
        }),
      });

      if (!res.ok) throw new Error("Failed to create playlist");

      const data = await res.json();
      setPlaylistUrl(data.url);
    } catch {
      setError("Failed to save playlist. Check Spotify connection.");
    }
    setSavingPlaylist(false);
  }

  function formatDuration(ms: number) {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Generate</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Describe the vibe and let AI build your playlist
        </p>
      </div>

      {/* Prompt input */}
      <div className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Upbeat house for a summer BBQ, transitioning to disco as the sun sets..."
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm placeholder-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              generate("");
            }
          }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => generate("")}
            disabled={streaming || !prompt.trim()}
            className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600"
          >
            {streaming ? "Generating..." : "Generate Playlist"}
          </button>
          {streaming && (
            <button
              onClick={() => abortRef.current?.abort()}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 hover:bg-white/5"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => {
              setPrompt(preset);
              generate(preset);
            }}
            disabled={streaming}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-violet-500/30 hover:text-violet-400 disabled:opacity-50"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-500/15 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Streaming response */}
      {streaming && rawResponse && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-zinc-500">
            AI is thinking...
          </div>
          <pre className="whitespace-pre-wrap text-xs text-zinc-400">
            {rawResponse}
          </pre>
        </div>
      )}

      {/* Criteria summary */}
      {criteria && !streaming && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="mb-2 text-sm font-medium text-violet-400">
            {criteria.description}
          </div>
          <div className="flex flex-wrap gap-2">
            {criteria.genres.map((g) => (
              <span
                key={g}
                className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs text-violet-300"
              >
                {g}
              </span>
            ))}
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-zinc-400">
              {criteria.bpm_min}-{criteria.bpm_max} BPM
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-zinc-400">
              {criteria.mood}
            </span>
            {criteria.era && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-zinc-400">
                {criteria.era}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Loading tracks */}
      {loadingTracks && (
        <div className="py-8 text-center text-sm text-zinc-500">
          Searching Spotify for matching tracks...
        </div>
      )}

      {/* Track list */}
      {tracks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {tracks.length} Tracks
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const mixTracks: MixTrack[] = tracks.map((t) => ({ ...t }));
                  const added = addTracksToMixQueue(mixTracks);
                  if (added > 0) {
                    setSentToMix(true);
                    setTimeout(() => setSentToMix(false), 3000);
                  }
                }}
                disabled={sentToMix}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-70"
              >
                {sentToMix ? `Sent to Mix` : "Send to Mix Queue"}
              </button>
              {playlistUrl ? (
                <a
                  href={playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-[#1DB954] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
                >
                  Open in Spotify
                </a>
              ) : (
                <button
                  onClick={savePlaylist}
                  disabled={savingPlaylist}
                  className="rounded-lg bg-[#1DB954] px-4 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {savingPlaylist ? "Saving..." : "Save to Spotify"}
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {tracks.map((track, i) => (
              <div
                key={track.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="w-6 text-right text-xs text-zinc-600">
                  {i + 1}
                </span>
                {track.image && (
                  <img
                    src={track.image}
                    alt=""
                    className="size-10 rounded"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {track.name}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {track.artists.join(", ")}
                  </div>
                </div>
                <div className="hidden items-center gap-3 text-xs text-zinc-500 sm:flex">
                  {track.bpm && <span>{track.bpm} BPM</span>}
                  {track.energy !== undefined && (
                    <span>E:{(track.energy * 100).toFixed(0)}%</span>
                  )}
                  <span>{formatDuration(track.duration_ms)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
