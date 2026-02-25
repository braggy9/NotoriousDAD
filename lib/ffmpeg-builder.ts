import type { TransitionType } from "./mix-types";

/**
 * FFmpeg filtergraph builders for each transition type.
 * Each function returns a filtergraph segment string that
 * the Hetzner server can chain into a full mix pipeline.
 */

/** Standard triangular crossfade. */
export function crossfade(duration: number): string {
  return `acrossfade=d=${duration}:c1=tri:c2=tri`;
}

/**
 * EQ bass swap — crossfade with low-shelf manipulation.
 * Cuts bass on outgoing track while boosting bass on incoming,
 * creating a smooth hand-off that masks tempo shifts.
 */
export function eqSwap(duration: number): string {
  const halfDur = (duration / 2).toFixed(2);
  // Chain: split both inputs, apply complementary EQ, then crossfade
  return [
    `[0]equalizer=f=100:t=h:w=200:g=-12:r=f:enable='between(t,TF-${halfDur},TF)'[out_eq]`,
    `[1]equalizer=f=100:t=h:w=200:g=6:r=f:enable='between(t,0,${halfDur})'[in_eq]`,
    `[out_eq][in_eq]acrossfade=d=${duration}:c1=tri:c2=tri`,
  ].join(";");
}

/**
 * Progressive lowpass sweep on outgoing (20kHz→200Hz),
 * highpass sweep on incoming (200Hz→20kHz).
 */
export function filterSweep(duration: number): string {
  return [
    `[0]lowpass=f='if(between(t,TF-${duration},TF),20000-19800*(t-(TF-${duration}))/${duration},20000)':r=f[out_lp]`,
    `[1]highpass=f='if(between(t,0,${duration}),200+19800*(1-t/${duration}),20)':r=f[in_hp]`,
    `[out_lp][in_hp]acrossfade=d=${duration}:c1=exp:c2=log`,
  ].join(";");
}

/**
 * Echo fadeout on outgoing tail + fade to silence, then hard cut to incoming.
 * Masks tempo changes with rhythmic echo decay.
 */
export function echoOut(duration: number): string {
  const echoDelay = Math.round(duration * 150); // ms, proportional
  const echoDelay2 = echoDelay * 2;
  return [
    `[0]aecho=0.8:0.7:${echoDelay}|${echoDelay2}:0.5|0.3,afade=t=out:st=TF-${duration}:d=${duration}[out_echo]`,
    `[out_echo][1]acrossfade=d=${(duration * 0.3).toFixed(2)}:c1=tri:c2=exp`,
  ].join(";");
}

/**
 * Hard cut with optional silence gap (50–200ms).
 * Best for dramatic energy shifts and drops.
 */
export function dropMix(gapMs: number = 100): string {
  const gapSec = (gapMs / 1000).toFixed(3);
  return [
    `[0]afade=t=out:st=TF-0.5:d=0.5[out_drop]`,
    `aevalsrc=0:d=${gapSec}[silence]`,
    `[out_drop][silence][1]concat=n=3:v=0:a=1`,
  ].join(";");
}

/**
 * Long crossfade with loudnorm for balanced levels.
 * Best quality mix for key-matched tracks at similar BPM.
 */
export function harmonicBlend(duration: number): string {
  return [
    `[0]loudnorm=I=-16:TP=-1.5:LRA=11[out_norm]`,
    `[1]loudnorm=I=-16:TP=-1.5:LRA=11[in_norm]`,
    `[out_norm][in_norm]acrossfade=d=${duration}:c1=tri:c2=tri`,
  ].join(";");
}

/** Maps a TransitionType to its filtergraph builder. */
export function buildFiltergraph(
  type: TransitionType,
  duration: number
): string {
  switch (type) {
    case "crossfade":
      return crossfade(duration);
    case "eq_swap":
      return eqSwap(duration);
    case "filter_sweep":
      return filterSweep(duration);
    case "echo_out":
      return echoOut(duration);
    case "drop":
      return dropMix();
    case "harmonic_blend":
      return harmonicBlend(duration);
  }
}
