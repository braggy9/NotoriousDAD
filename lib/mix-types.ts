import type { SpotifyTrack } from "./playlist-generator";

export interface MixTrack extends SpotifyTrack {
  camelotKey?: string;
  danceability?: number;
  mode?: number;
}

export type TransitionType =
  | "crossfade"
  | "eq_swap"
  | "filter_sweep"
  | "echo_out"
  | "drop"
  | "harmonic_blend";

export interface Transition {
  fromTrackId: string;
  toTrackId: string;
  type: TransitionType;
  duration: number; // seconds
  mixOutPoint: number; // seconds from start of outgoing track
  mixInPoint: number; // seconds from start of incoming track
  bpmAdjustment: number; // BPM shift applied to incoming track (0 = none)
  notes: string;
}

export interface MixPlan {
  id: string;
  tracks: MixTrack[];
  transitions: Transition[];
  totalDuration: number; // seconds
  energyArc: number[]; // energy value per track position
}

export interface MixStatus {
  planId: string;
  status: "queued" | "processing" | "complete" | "error";
  progress: number; // 0-100
  currentStep?: string;
  outputUrl?: string;
  error?: string;
}
