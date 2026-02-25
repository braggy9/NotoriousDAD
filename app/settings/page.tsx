"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface SpotifyUser {
  id: string;
  display_name: string;
  images: { url: string }[];
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setMessage("Connected to Spotify!");
    } else if (searchParams.get("error")) {
      setMessage(`Connection failed: ${searchParams.get("error")}`);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/spotify/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) setUser(data.user);
      })
      .finally(() => setLoading(false));
  }, []);

  async function disconnect() {
    await fetch("/api/spotify/disconnect", { method: "POST" });
    setUser(null);
    setMessage("Disconnected from Spotify");
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Spotify Connection */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-4 text-lg font-semibold">Spotify</h2>

        {message && (
          <div
            className={`mb-4 rounded-lg px-4 py-2 text-sm ${
              message.includes("fail") || message.includes("error")
                ? "bg-red-500/15 text-red-400"
                : "bg-green-500/15 text-green-400"
            }`}
          >
            {message}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-zinc-500">Checking connection...</div>
        ) : user ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {user.images?.[0] && (
                <img
                  src={user.images[0].url}
                  alt=""
                  className="size-10 rounded-full"
                />
              )}
              <div>
                <div className="font-medium">{user.display_name}</div>
                <div className="text-sm text-zinc-500">Connected</div>
              </div>
            </div>
            <button
              onClick={disconnect}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <a
            href="/api/spotify/authorize"
            className="inline-flex items-center gap-2 rounded-lg bg-[#1DB954] px-5 py-2.5 font-medium text-black transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-current">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Connect Spotify
          </a>
        )}
      </section>

      {/* About */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-2 text-lg font-semibold">About</h2>
        <p className="text-sm text-zinc-400">
          Notorious D.A.D. — AI-powered DJ mix generator. Type a vibe, get a
          playlist. Built with Next.js, Claude AI, and the Spotify API.
        </p>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
