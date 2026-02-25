"use client";

import { useState, useRef } from "react";
import type { MixTrack, Transition } from "@/lib/mix-types";
import TransitionCard from "./TransitionCard";
import CamelotBadge from "./CamelotBadge";

interface TrackQueueProps {
  tracks: MixTrack[];
  transitions: Transition[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (trackId: string) => void;
}

export default function TrackQueue({
  tracks,
  transitions,
  onReorder,
  onRemove,
}: TrackQueueProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  function handleDragStart(index: number) {
    dragRef.current = index;
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(index: number) {
    if (dragRef.current !== null && dragRef.current !== index) {
      onReorder(dragRef.current, index);
    }
    dragRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    dragRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function formatDuration(ms: number) {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
        <div className="text-2xl text-zinc-600">&#x266B;</div>
        <p className="mt-2 text-sm text-zinc-500">
          No tracks in queue. Generate a mix plan or add tracks from the
          Generate page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {tracks.map((track, i) => {
        const prevTrack = i > 0 ? tracks[i - 1] : null;
        const transition = i > 0 ? transitions[i - 1] : null;
        const isDragging = dragIndex === i;
        const isDragOver = dragOverIndex === i;

        return (
          <div key={track.id}>
            {/* Transition card between tracks */}
            {transition && prevTrack && (
              <TransitionCard
                transition={transition}
                fromTrack={prevTrack}
                toTrack={track}
              />
            )}

            {/* Track row */}
            <div
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all
                ${isDragging ? "opacity-40" : ""}
                ${isDragOver ? "bg-violet-500/10 ring-1 ring-violet-500/30" : "hover:bg-white/[0.03]"}
              `}
            >
              {/* Drag handle */}
              <button
                className="cursor-grab touch-none text-zinc-600 hover:text-zinc-400 active:cursor-grabbing"
                aria-label="Drag to reorder"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <circle cx="3" cy="2" r="1.2" />
                  <circle cx="9" cy="2" r="1.2" />
                  <circle cx="3" cy="6" r="1.2" />
                  <circle cx="9" cy="6" r="1.2" />
                  <circle cx="3" cy="10" r="1.2" />
                  <circle cx="9" cy="10" r="1.2" />
                </svg>
              </button>

              {/* Track number */}
              <span className="w-5 text-right text-xs tabular-nums text-zinc-600">
                {i + 1}
              </span>

              {/* Album art */}
              {track.image && (
                <img
                  src={track.image}
                  alt=""
                  className="size-10 rounded"
                  draggable={false}
                />
              )}

              {/* Track info */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {track.name}
                </div>
                <div className="truncate text-xs text-zinc-500">
                  {track.artists.join(", ")}
                </div>
              </div>

              {/* Track metadata */}
              <div className="hidden items-center gap-2 sm:flex">
                {track.bpm && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-400">
                    {track.bpm}
                  </span>
                )}
                {track.camelotKey && (
                  <CamelotBadge
                    camelotKey={track.camelotKey}
                    comparedTo={prevTrack?.camelotKey}
                  />
                )}
                {track.energy !== undefined && (
                  <div className="flex items-center gap-1" title={`Energy: ${(track.energy * 100).toFixed(0)}%`}>
                    <div className="h-1.5 w-10 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{ width: `${track.energy * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                <span className="text-[10px] tabular-nums text-zinc-600">
                  {formatDuration(track.duration_ms)}
                </span>
              </div>

              {/* Remove button */}
              <button
                onClick={() => onRemove(track.id)}
                className="rounded p-1 text-zinc-600 hover:bg-white/5 hover:text-zinc-400"
                title="Remove from queue"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
