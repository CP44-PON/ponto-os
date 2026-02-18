"use client";

import { useEffect, useRef, useState } from "react";
import { getMedia, isIdbUri } from "../lib/mediaStore";

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
  thumbUri?: string; // data URL thumbnail
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

function writeBackThumb(entryId: string, thumbUri: string) {
  const list = readTimeline();
  const next = list.map((e) => (e.id === entryId ? { ...e, thumbUri } : e));
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVT));
}

// Ordered list of MIME types to try if the blob has no type
const FALLBACK_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

async function makeVideoThumbFromUrl(url: string): Promise<string | null> {
  return await new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.crossOrigin = "anonymous";

      let done = false;
      const finish = (thumb: string | null) => {
        if (done) return;
        done = true;
        console.log(
          "[VideoThumb] finish called with:",
          thumb ? `data URL ✅ (${thumb.length} chars)` : "null ❌"
        );
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
        } catch {}
        resolve(thumb);
      };

      const waitFor = (
        event: keyof HTMLVideoElementEventMap,
        timeoutMs: number
      ) =>
        new Promise<void>((res) => {
          const onDone = () => {
            clearTimeout(timer);
            res();
          };
          const timer = window.setTimeout(() => {
            video.removeEventListener(event, onDone);
            res();
          }, timeoutMs);
          video.addEventListener(event, onDone, { once: true });
        });

      video.addEventListener(
        "error",
        () => {
          console.warn(
            "[VideoThumb] video element error — code:",
            video.error?.code,
            "message:",
            video.error?.message
          );
          finish(null);
        },
        { once: true }
      );

      video.addEventListener(
        "loadedmetadata",
        async () => {
          try {
            console.log(
              "[VideoThumb] loadedmetadata — duration:",
              video.duration,
              "size:",
              video.videoWidth,
              "x",
              video.videoHeight
            );

            const duration = video.duration;
            const t =
              isFinite(duration) && duration > 0
                ? Math.min(0.2, duration / 10)
                : 0;

            if (t > 0) {
              video.currentTime = t;
              await waitFor("seeked", 1500);
            } else {
              await waitFor("loadeddata", 1500);
            }

            // Give the browser one paint cycle to settle the decoded frame
            await new Promise((r) => setTimeout(r, 50));

            const w = video.videoWidth || 1280;
            const h = video.videoHeight || 720;

            if (!w || !h) return finish(null);

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;

            const ctx = canvas.getContext("2d");
            if (!ctx) return finish(null);

            ctx.drawImage(video, 0, 0, w, h);
            finish(canvas.toDataURL("image/jpeg", 0.85));
          } catch (err) {
            console.error("[VideoThumb] error during frame capture:", err);
            finish(null);
          }
        },
        { once: true }
      );

      video.src = url;
      video.load();
    } catch (err) {
      console.error("[VideoThumb] outer catch:", err);
      resolve(null);
    }
  });
}

async function resolveVideoUrl(
  mediaUri: string
): Promise<{ url: string; owned: boolean } | null> {
  if (isIdbUri(mediaUri)) {
    const key = mediaUri.slice(4);
    const blob = await getMedia(key);
    if (!blob) {
      console.warn("[VideoThumb] blob not found in IDB for key:", key);
      return null;
    }

    console.log(
      "[VideoThumb] blob from IDB — type:",
      JSON.stringify(blob.type),
      "size:",
      blob.size
    );

    // If the blob has no MIME type, re-wrap it so the browser can decode it
    let finalBlob = blob;
    if (!blob.type || blob.type === "") {
      console.warn(
        "[VideoThumb] blob has no MIME type — wrapping as:",
        FALLBACK_MIME_TYPES[0]
      );
      finalBlob = new Blob([blob], { type: FALLBACK_MIME_TYPES[0] });
    }

    return { url: URL.createObjectURL(finalBlob), owned: true };
  }

  if (mediaUri.startsWith("data:")) {
    return { url: mediaUri, owned: false };
  }

  if (mediaUri.startsWith("blob:")) {
    // blob: URLs saved from a previous session are dead — unrecoverable
    console.warn(
      "[VideoThumb] stale blob: URI — cannot generate thumbnail for:",
      mediaUri.slice(0, 50)
    );
    return null;
  }

  console.warn(
    "[VideoThumb] unrecognized mediaUri format:",
    mediaUri.slice(0, 50)
  );
  return null;
}

export default function VideoThumb({ entry }: { entry: Entry }) {
  const [thumb, setThumb] = useState<string | null>(entry.thumbUri ?? null);
  const [busy, setBusy] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setThumb(entry.thumbUri ?? null);
  }, [entry.id, entry.thumbUri]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (thumb) return;
      if (entry.mediaType !== "video") return;

      setBusy(true);

      try {
        console.log(
          "[VideoThumb] starting thumb generation for entry:",
          entry.id,
          "uri prefix:",
          entry.mediaUri.slice(0, 30)
        );

        const resolved = await resolveVideoUrl(entry.mediaUri);
        if (!resolved) return;

        if (resolved.owned) {
          objectUrlRef.current = resolved.url;
        }

        const t = await makeVideoThumbFromUrl(resolved.url);
        if (cancelled) return;

        if (t) {
          setThumb(t);
          writeBackThumb(entry.id, t);
        } else {
          console.warn(
            "[VideoThumb] thumb generation returned null for entry:",
            entry.id
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    run();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, entry.mediaUri]);

  return (
    <div className="relative">
      {thumb ? (
        <img src={thumb} alt="" className="block w-full object-cover" />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-black text-xs text-zinc-500">
          {busy ? "Generating thumbnail…" : "No thumbnail"}
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-black/40">
          <div className="ml-1 h-0 w-0 border-y-[10px] border-y-transparent border-l-[14px] border-l-white/80" />
        </div>
      </div>
    </div>
  );
}