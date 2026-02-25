"use client";

export default function LibraryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Library</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Browse and filter your 28K track catalog
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
        <div className="text-4xl">📀</div>
        <h2 className="mt-4 text-lg font-semibold">Coming Soon</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Track browser with search, genre filters, BPM range, Camelot key
          wheel, and energy controls. Connect to the Hetzner server to load
          your analyzed track catalog.
        </p>
      </div>
    </div>
  );
}
