"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { MixTrack, MixPlan, Transition, MixStatus } from "@/lib/mix-types";
import { recalcTransitions } from "@/lib/mix-engine";
import {
  getMixQueue,
  setMixQueue,
  removeFromMixQueue,
  clearMixQueue,
  saveMixToHistory,
} from "@/lib/mix-store";
import TrackQueue from "@/app/components/mix/TrackQueue";
import EnergyArc from "@/app/components/mix/EnergyArc";

const MIX_PRESETS = [
  "Deep house warm-up set, 30 minutes",
  "Peak time techno, high energy throughout",
  "Sunset chill — ambient to deep house journey",
  "Disco funk party starter, groovy and upbeat",
];

export default function MixPage() {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "thinking" | "searching" | "complete"
  >("idle");
  const [thinkingText, setThinkingText] = useState("");
  const [criteria, setCriteria] = useState<Record<string, unknown> | null>(
    null
  );
  const [error, setError] = useState("");

  // Mix plan state
  const [tracks, setTracks] = useState<MixTrack[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [energyArc, setEnergyArc] = useState<number[]>([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [mixPlanId, setMixPlanId] = useState<string | null>(null);

  // Execution state
  const [mixStatus, setMixStatus] = useState<MixStatus | null>(null);
  const [executing, setExecuting] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted queue on mount
  useEffect(() => {
    const saved = getMixQueue();
    if (saved.length > 0) {
      setTracks(saved);
      const result = recalcTransitions(saved);
      setTransitions(result.transitions);
      setEnergyArc(result.energyArc);
      setTotalDuration(result.totalDuration);
    }
  }, []);

  // Listen for external queue changes (from Generate page)
  useEffect(() => {
    function handleQueueChange() {
      const saved = getMixQueue();
      setTracks(saved);
      if (saved.length > 1) {
        const result = recalcTransitions(saved);
        setTransitions(result.transitions);
        setEnergyArc(result.energyArc);
        setTotalDuration(result.totalDuration);
      } else {
        setTransitions([]);
        setEnergyArc(saved.map((t) => t.energy ?? 0.5));
        setTotalDuration(
          saved.reduce((sum, t) => sum + t.duration_ms / 1000, 0)
        );
      }
    }

    window.addEventListener("mix-queue-change", handleQueueChange);
    return () =>
      window.removeEventListener("mix-queue-change", handleQueueChange);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const updateTransitions = useCallback((newTracks: MixTrack[]) => {
    setTracks(newTracks);
    setMixQueue(newTracks);

    if (newTracks.length > 1) {
      const result = recalcTransitions(newTracks);
      setTransitions(result.transitions);
      setEnergyArc(result.energyArc);
      setTotalDuration(result.totalDuration);
    } else {
      setTransitions([]);
      setEnergyArc(newTracks.map((t) => t.energy ?? 0.5));
      setTotalDuration(
        newTracks.reduce((sum, t) => sum + t.duration_ms / 1000, 0)
      );
    }
  }, []);

  async function generateMixPlan(text: string) {
    const input = text || prompt;
    if (!input.trim()) return;

    // Reset state
    setPhase("thinking");
    setThinkingText("");
    setCriteria(null);
    setError("");
    setPlaylistUrl(null);
    setMixStatus(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/mix-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        setError("Failed to generate mix plan. Check API key.");
        setPhase("idle");
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let thinkingAccum = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              setError(parsed.error);
              setPhase("idle");
              return;
            }

            if (parsed.phase === "thinking") {
              thinkingAccum += parsed.text || "";
              setThinkingText(thinkingAccum);
            }

            if (parsed.phase === "criteria") {
              setCriteria(parsed.criteria);
            }

            if (parsed.phase === "searching") {
              setPhase("searching");
              setThinkingText(parsed.text || "");
            }

            if (parsed.phase === "complete" && parsed.mixPlan) {
              const plan: MixPlan = parsed.mixPlan;
              setMixPlanId(plan.id);
              updateTransitions(plan.tracks);
              setPhase("complete");
              saveMixToHistory(plan);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      if (phase !== "complete") {
        // Stream ended without a complete plan
        setPhase((prev) => (prev === "idle" ? "idle" : "complete"));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError("Mix plan generation failed. Check your connection.");
      }
      setPhase("idle");
    }
  }

  function handleReorder(fromIndex: number, toIndex: number) {
    const newTracks = [...tracks];
    const [item] = newTracks.splice(fromIndex, 1);
    newTracks.splice(toIndex, 0, item);
    updateTransitions(newTracks);
  }

  function handleRemove(trackId: string) {
    removeFromMixQueue(trackId);
    const newTracks = tracks.filter((t) => t.id !== trackId);
    updateTransitions(newTracks);
  }

  function handleClear() {
    clearMixQueue();
    setTracks([]);
    setTransitions([]);
    setEnergyArc([]);
    setTotalDuration(0);
    setPhase("idle");
    setMixStatus(null);
  }

  async function executeMix() {
    if (tracks.length < 2) return;

    setExecuting(true);
    setMixStatus({
      planId: mixPlanId || "unknown",
      status: "queued",
      progress: 0,
      currentStep: "Sending to mix server...",
    });

    const plan: MixPlan = {
      id: mixPlanId || `mix_${Date.now()}`,
      tracks,
      transitions,
      totalDuration,
      energyArc,
    };

    try {
      const res = await fetch("/api/mix-execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mixPlan: plan }),
      });

      if (!res.ok) {
        setMixStatus({
          planId: plan.id,
          status: "error",
          progress: 0,
          error: "Failed to connect to mix server",
        });
        setExecuting(false);
        return;
      }

      // Process SSE stream from Hetzner proxy
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              setMixStatus({
                planId: plan.id,
                status: "error",
                progress: 0,
                error: parsed.error,
              });
            } else {
              setMixStatus({
                planId: plan.id,
                status: parsed.status || "processing",
                progress: parsed.progress || 0,
                currentStep: parsed.currentStep,
                outputUrl: parsed.outputUrl,
              });
            }
          } catch {
            // Skip malformed
          }
        }
      }

      // Start polling for status if not yet complete
      if (mixStatus?.status !== "complete" && mixStatus?.status !== "error") {
        startStatusPolling(plan.id);
      }
    } catch {
      setMixStatus({
        planId: plan.id,
        status: "error",
        progress: 0,
        error: "Network error — could not reach mix server",
      });
    }

    setExecuting(false);
  }

  function startStatusPolling(planId: string) {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/mix-execute/status?planId=${planId}`
        );
        if (!res.ok) return;

        const status: MixStatus = await res.json();
        setMixStatus(status);

        if (status.status === "complete" || status.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Retry on next interval
      }
    }, 3000);
  }

  async function saveAsPlaylist() {
    if (tracks.length === 0) return;

    setSavingPlaylist(true);
    try {
      const res = await fetch("/api/spotify/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `D.A.D. Mix — ${criteria ? String(criteria.mood || "") + " " + (((criteria.genres as string[]) || [])[0] || "set") : "custom set"}`,
          description: `Mixed set: ${tracks.length} tracks, ${formatTotalDuration(totalDuration)}`,
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

  function formatTotalDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const isGenerating = phase === "thinking" || phase === "searching";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Mix</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Build and generate professional DJ mixes with intelligent transitions
        </p>
      </div>

      {/* Prompt input */}
      <div className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., Deep house warm-up set that builds from 118 to 124 BPM over 30 minutes..."
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm placeholder-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              generateMixPlan("");
            }
          }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => generateMixPlan("")}
            disabled={isGenerating || !prompt.trim()}
            className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50 disabled:hover:bg-violet-600"
          >
            {isGenerating ? "Generating..." : "Generate Mix Plan"}
          </button>
          {isGenerating && (
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
        {MIX_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => {
              setPrompt(preset);
              generateMixPlan(preset);
            }}
            disabled={isGenerating}
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

      {/* AI Thinking / Searching */}
      {isGenerating && thinkingText && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-zinc-500">
            {phase === "thinking"
              ? "AI is planning your mix..."
              : "Searching for tracks..."}
          </div>
          <pre className="whitespace-pre-wrap text-xs text-zinc-400">
            {thinkingText}
          </pre>
        </div>
      )}

      {/* Criteria summary */}
      {criteria && !isGenerating && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="mb-2 text-sm font-medium text-violet-400">
            {String(criteria.description || "Mix plan ready")}
          </div>
          <div className="flex flex-wrap gap-2">
            {((criteria.genres as string[]) || []).map((g: string) => (
              <span
                key={g}
                className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs text-violet-300"
              >
                {g}
              </span>
            ))}
            {criteria.bpm_min != null && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-zinc-400">
                {String(criteria.bpm_min)}-{String(criteria.bpm_max)} BPM
              </span>
            )}
            {criteria.energy_arc != null && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-zinc-400">
                {String(criteria.energy_arc)} arc
              </span>
            )}
            {criteria.mood != null && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-zinc-400">
                {String(criteria.mood)}
              </span>
            )}
            {criteria.transition_preference != null && (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-zinc-400">
                {String(criteria.transition_preference)} transitions
              </span>
            )}
          </div>
        </div>
      )}

      {/* Track Queue */}
      {tracks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {tracks.length} Tracks
              </h2>
              <p className="text-xs text-zinc-500">
                {formatTotalDuration(totalDuration)} estimated mix length
                {transitions.length > 0 &&
                  ` — ${transitions.length} transitions`}
              </p>
            </div>
            <button
              onClick={handleClear}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-500 hover:bg-white/5 hover:text-zinc-400"
            >
              Clear All
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02]">
            <TrackQueue
              tracks={tracks}
              transitions={transitions}
              onReorder={handleReorder}
              onRemove={handleRemove}
            />
          </div>
        </div>
      )}

      {/* Energy Arc */}
      {energyArc.length > 1 && (
        <EnergyArc
          energyValues={energyArc}
          trackNames={tracks.map((t) => `${t.artists[0]} — ${t.name}`)}
        />
      )}

      {/* Mix Execution Status */}
      {mixStatus && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              {mixStatus.status === "queued" && "Queued for processing..."}
              {mixStatus.status === "processing" && "Mixing in progress..."}
              {mixStatus.status === "complete" && "Mix complete!"}
              {mixStatus.status === "error" && "Mix failed"}
            </div>
            {mixStatus.status === "processing" && (
              <span className="text-xs text-zinc-500">
                {mixStatus.progress}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          {(mixStatus.status === "queued" ||
            mixStatus.status === "processing") && (
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-500"
                style={{ width: `${mixStatus.progress}%` }}
              />
            </div>
          )}

          {mixStatus.currentStep && (
            <p className="text-xs text-zinc-500">{mixStatus.currentStep}</p>
          )}

          {mixStatus.error && (
            <p className="text-xs text-red-400">{mixStatus.error}</p>
          )}

          {/* Audio player when complete */}
          {mixStatus.status === "complete" && mixStatus.outputUrl && (
            <div className="space-y-2">
              <audio
                controls
                src={mixStatus.outputUrl}
                className="w-full"
              />
              <a
                href={mixStatus.outputUrl}
                download
                className="inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
              >
                Download Mix
              </a>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {tracks.length >= 2 && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={executeMix}
            disabled={executing || tracks.length < 2}
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            {executing ? "Processing..." : "Execute Mix"}
          </button>

          {playlistUrl ? (
            <a
              href={playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-[#1DB954] px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90"
            >
              Open in Spotify
            </a>
          ) : (
            <button
              onClick={saveAsPlaylist}
              disabled={savingPlaylist}
              className="rounded-lg bg-[#1DB954] px-4 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingPlaylist ? "Saving..." : "Save to Spotify"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
