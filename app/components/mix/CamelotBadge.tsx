"use client";

import { isHarmonicMatch, keyDistance } from "@/lib/camelot";

interface CamelotBadgeProps {
  camelotKey: string;
  comparedTo?: string; // Show compatibility relative to this key
}

export default function CamelotBadge({
  camelotKey,
  comparedTo,
}: CamelotBadgeProps) {
  let colorClass = "bg-zinc-700 text-zinc-300"; // Default: no comparison

  if (comparedTo) {
    const dist = keyDistance(camelotKey, comparedTo);
    if (dist === 0) {
      colorClass = "bg-emerald-500/20 text-emerald-400"; // Same key
    } else if (dist === 1) {
      colorClass = "bg-green-500/20 text-green-400"; // Compatible
    } else if (dist === 2) {
      colorClass = "bg-yellow-500/20 text-yellow-400"; // Tolerable
    } else {
      colorClass = "bg-red-500/20 text-red-400"; // Clash
    }
  }

  const label = comparedTo
    ? isHarmonicMatch(camelotKey, comparedTo)
      ? "Harmonic"
      : keyDistance(camelotKey, comparedTo) <= 2
        ? "OK"
        : "Clash"
    : "";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-mono font-medium ${colorClass}`}
      title={
        comparedTo
          ? `${camelotKey} → ${comparedTo}: ${label}`
          : `Key: ${camelotKey}`
      }
    >
      {camelotKey}
      {label && (
        <span className="text-[10px] opacity-70">{label}</span>
      )}
    </span>
  );
}
