"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import VideoThumb from "./components/VideoThumb";

type TextBlock = {
  id: string;
  createdAt: string;
  content: string;
};

type Entry = {
  id: string;
  createdAt: string;
  mediaType: "photo" | "video";
  mediaUri: string; // data URL or idb:<id>
  thumbUri?: string; // for video preview (or photo)
  textBlocks: TextBlock[];
};

const KEY = "ponto.timeline.v1";
const EVT = "ponto-timeline-updated";

function readTimeline(): Entry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Entry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function TimelinePage() {
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    const load = () => setEntries(readTimeline());

    load();

    // When thumbnails/notes get written back, refresh list
    const onCustom = () => load();
    window.addEventListener(EVT, onCustom);

    // If another tab updates localStorage
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) load();
    };
    window.addEventListener("storage", onStorage);

    // When you return to the tab, reload (handy after editing an entry)
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener(EVT, onCustom);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [entries]);

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Ponto OS</h1>
            <p className="mt-1 text-zinc-400">Timeline</p>
          </div>

          <Link
            href="/capture"
            className="rounded-full bg-zinc-100 px-6 py-3 text-sm font-medium text-black hover:bg-white"
          >
            Capture
          </Link>
        </header>

        <div className="mt-8 space-y-6">
          {sorted.length === 0 ? (
            <div className="text-zinc-400">No entries yet.</div>
          ) : (
            sorted.map((entry) => {
              const notePreview =
                entry.textBlocks?.[0]?.content?.slice(0, 140) ?? "";

              return (
                <Link
                  key={entry.id}
                  href={`/entry/${encodeURIComponent(entry.id)}`}
                  className="block rounded-3xl border border-zinc-800 bg-zinc-950 p-6 hover:border-zinc-700"
                >
                  <div className="text-sm text-zinc-400">
                    {formatTs(entry.createdAt)}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-black">
                    {entry.mediaType === "photo" ? (
                      <img
                        src={entry.thumbUri ?? entry.mediaUri}
                        alt=""
                        className="block w-full object-cover"
                      />
                    ) : (
                      <VideoThumb entry={entry} />
                    )}
                  </div>

                  {notePreview ? (
                    <div className="mt-4 text-xl text-zinc-100">
                      {notePreview}
                    </div>
                  ) : null}
                </Link>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}