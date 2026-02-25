"use client";

import type { Transition, MixTrack, TransitionType } from "@/lib/mix-types";
import { isHarmonicMatch, keyDistance } from "@/lib/camelot";

interface TransitionCardProps {
  transition: Transition;
  fromTrack: MixTrack;
  toTrack: MixTrack;
}

const TYPE_LABELS: Record<TransitionType, string> = {
  crossfade: "Crossfade",
  eq_swap: "EQ Swap",
  filter_sweep: "Filter Sweep",
  echo_out: "Echo Out",
  drop: "Drop",
  harmonic_blend: "Harmonic Blend",
};

const TYPE_ICONS: Record<TransitionType, string> = {
  crossfade: "⟷",
  eq_swap: "⇌",
  filter_sweep: "〰",
  echo_out: "↝",
  drop: "⚡",
  harmonic_blend: "∿",
};

export default function TransitionCard({
  transition,
  fromTrack,
  toTrack,
}: TransitionCardProps) {
  const keyCompat = getKeyCompatibility(fromTrack, toTrack);
  const bpmDiff =
    fromTrack.bpm && toTrack.bpm ? toTrack.bpm - fromTrack.bpm : null;

  return (
    <div className="mx-4 flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      {/* Transition type */}
      <div className="flex items-center gap-2">
        <span className="text-lg" title={TYPE_LABELS[transition.type]}>
          {TYPE_ICONS[transition.type]}
        </span>
        <div>
          <div className="text-xs font-medium text-zinc-300">
            {TYPE_LABELS[transition.type]}
          </div>
          <div className="text-[10px] text-zinc-600">
            {transition.duration.toFixed(1)}s
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1 border-t border-dashed border-white/10" />

      {/* Key compatibility */}
      <div className="flex items-center gap-2">
        {fromTrack.camelotKey && toTrack.camelotKey && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${keyCompat.colorClass}`}
          >
            {fromTrack.camelotKey} → {toTrack.camelotKey}
          </span>
        )}
        {bpmDiff !== null && bpmDiff !== 0 && (
          <span className="text-[10px] text-zinc-500">
            {bpmDiff > 0 ? "+" : ""}
            {bpmDiff} BPM
          </span>
        )}
      </div>

      {/* Key match indicator dot */}
      <div
        className={`size-2 rounded-full ${keyCompat.dotClass}`}
        title={keyCompat.label}
      />
    </div>
  );
}

function getKeyCompatibility(from: MixTrack, to: MixTrack) {
  if (!from.camelotKey || !to.camelotKey) {
    return {
      colorClass: "bg-zinc-700/50 text-zinc-500",
      dotClass: "bg-zinc-600",
      label: "Unknown keys",
    };
  }

  const dist = keyDistance(from.camelotKey, to.camelotKey);

  if (dist === 0) {
    return {
      colorClass: "bg-emerald-500/15 text-emerald-400",
      dotClass: "bg-emerald-400",
      label: "Same key — perfect match",
    };
  }
  if (dist === 1 || isHarmonicMatch(from.camelotKey, to.camelotKey)) {
    return {
      colorClass: "bg-green-500/15 text-green-400",
      dotClass: "bg-green-400",
      label: "Harmonic — compatible keys",
    };
  }
  if (dist === 2) {
    return {
      colorClass: "bg-yellow-500/15 text-yellow-400",
      dotClass: "bg-yellow-400",
      label: "Tolerable — slight tension",
    };
  }
  return {
    colorClass: "bg-red-500/15 text-red-400",
    dotClass: "bg-red-400",
    label: "Key clash — dissonance likely",
  };
}
