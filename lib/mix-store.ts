import type { MixTrack } from "./mix-types";
import type { MixPlan } from "./mix-types";

const QUEUE_KEY = "dad_mix_queue";
const HISTORY_KEY = "dad_mix_history";

/** Get the current mix queue from localStorage. */
export function getMixQueue(): MixTrack[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Replace the entire mix queue. */
export function setMixQueue(tracks: MixTrack[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(tracks));
  window.dispatchEvent(new Event("mix-queue-change"));
}

/** Add a single track to the end of the queue (deduplicates by ID). */
export function addToMixQueue(track: MixTrack): boolean {
  const queue = getMixQueue();
  if (queue.some((t) => t.id === track.id)) return false;
  queue.push(track);
  setMixQueue(queue);
  return true;
}

/** Add multiple tracks to the queue (deduplicates). */
export function addTracksToMixQueue(tracks: MixTrack[]): number {
  const queue = getMixQueue();
  const existingIds = new Set(queue.map((t) => t.id));
  let added = 0;
  for (const track of tracks) {
    if (!existingIds.has(track.id)) {
      queue.push(track);
      existingIds.add(track.id);
      added++;
    }
  }
  if (added > 0) setMixQueue(queue);
  return added;
}

/** Move a track from one index to another (drag-and-drop). */
export function reorderMixQueue(fromIndex: number, toIndex: number): void {
  const queue = getMixQueue();
  if (fromIndex < 0 || fromIndex >= queue.length) return;
  if (toIndex < 0 || toIndex >= queue.length) return;

  const [item] = queue.splice(fromIndex, 1);
  queue.splice(toIndex, 0, item);
  setMixQueue(queue);
}

/** Remove a track from the queue by ID. */
export function removeFromMixQueue(trackId: string): void {
  const queue = getMixQueue().filter((t) => t.id !== trackId);
  setMixQueue(queue);
}

/** Clear all tracks from the queue. */
export function clearMixQueue(): void {
  setMixQueue([]);
}

// --- Mix history ---

interface MixHistoryEntry {
  plan: MixPlan;
  createdAt: number;
  status: "planned" | "processing" | "complete" | "error";
  outputUrl?: string;
}

/** Get saved mix history (newest first). */
export function getMixHistory(): MixHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const entries: MixHistoryEntry[] = raw ? JSON.parse(raw) : [];
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** Save a mix plan to history. */
export function saveMixToHistory(plan: MixPlan): void {
  if (typeof window === "undefined") return;
  const history = getMixHistory();
  history.unshift({
    plan,
    createdAt: Date.now(),
    status: "planned",
  });
  // Keep last 20 entries
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
}

/** Update the status of a mix in history. */
export function updateMixHistoryStatus(
  planId: string,
  status: MixHistoryEntry["status"],
  outputUrl?: string
): void {
  if (typeof window === "undefined") return;
  const history = getMixHistory();
  const entry = history.find((h) => h.plan.id === planId);
  if (entry) {
    entry.status = status;
    if (outputUrl) entry.outputUrl = outputUrl;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }
}
