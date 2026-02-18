"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useResolvedMediaUrl } from "../../lib/useResolvedMediaUrl";

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
  thumbUri?: string;
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

function writeTimeline(list: Entry[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVT));
}

function tryDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default function EntryClient({ id }: { id: string }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [draft, setDraft] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [debug, setDebug] = useState<{
    requestedId: string;
    decodedId: string;
    count: number;
    sampleIds: string[];
  } | null>(null);

  useEffect(() => {
    const list = readTimeline();
    const decoded = tryDecode(id);

    const found =
      list.find((e) => e.id === id) ||
      list.find((e) => e.id === decoded) ||
      null;

    setEntry(found);

    if (!found) {
      setDebug({
        requestedId: id,
        decodedId: decoded,
        count: list.length,
        sampleIds: list.slice(0, 8).map((e) => e.id),
      });
    } else {
      setDebug(null);
      const first = found.textBlocks?.[0]?.content ?? "";
      setDraft(first);
    }
  }, [id]);

  const ts = useMemo(() => {
    if (!entry) return "";
    return new Date(entry.createdAt).toLocaleString();
  }, [entry]);

  const resolvedMediaUrl = useResolvedMediaUrl(entry?.mediaUri ?? null);

  async function onSaveNotes() {
    if (!entry) return;

    const list = readTimeline();
    const idx = list.findIndex((e) => e.id === entry.id);
    if (idx === -1) return;

    const now = new Date().toISOString();
    const content = draft.trim();

    const nextEntry: Entry = {
      ...list[idx],
      textBlocks: content
        ? list[idx].textBlocks?.length
          ? [{ ...list[idx].textBlocks[0], content }]
          : [{ id: crypto.randomUUID(), createdAt: now, content }]
        : [],
    };

    const next = [...list];
    next[idx] = nextEntry;

    writeTimeline(next);
    setEntry(nextEntry);

    setSavedMsg("Saved.");
    window.setTimeout(() => setSavedMsg(null), 1200);
  }

  if (!entry) {
    return (
      <div className="p-6">
        <div className="text-white/80 mb-4">Entry not found.</div>

        {debug ? (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            <div>
              <span className="text-white/50">requested:</span> {debug.requestedId}
            </div>
            <div>
              <span className="text-white/50">decoded:</span> {debug.decodedId}
            </div>
            <div>
              <span className="text-white/50">timeline count:</span> {debug.count}
            </div>
            <div className="mt-2 text-white/50">sample ids:</div>
            <ul className="list-disc pl-5">
              {debug.sampleIds.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Link className="text-white/60 hover:text-white" href="/">
          ← Back to Timeline
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="text-white/60 text-sm">{ts}</div>
        <Link className="text-white/60 hover:text-white text-sm" href="/">
          Close
        </Link>
      </div>

      <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/5">
        {entry.mediaType === "photo" ? (
          <img
            src={resolvedMediaUrl ?? entry.mediaUri}
            alt=""
            className="w-full h-auto block"
          />
        ) : resolvedMediaUrl ? (
          <video
            src={resolvedMediaUrl}
            controls
            playsInline
            className="w-full h-auto block"
          />
        ) : (
          <div className="w-full p-6 text-sm text-white/60">Loading video…</div>
        )}
      </div>

      {/* ✅ Edit caption / notes */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div className="text-white/80 text-sm">Notes</div>
          <div className="text-white/40 text-xs">
            {savedMsg ? savedMsg : "Edit + save anytime"}
          </div>
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a caption or notes…"
          className="mt-3 h-28 w-full resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/90 outline-none placeholder:text-white/30"
        />

        <div className="mt-3 flex items-center justify-end gap-3">
          <button
            onClick={() => setDraft(entry.textBlocks?.[0]?.content ?? "")}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Reset
          </button>
          <button
            onClick={onSaveNotes}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-100"
          >
            Save notes
          </button>
        </div>
      </div>
    </div>
  );
}