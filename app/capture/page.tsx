"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { dataUrlToBlob, putMedia, toIdbUri } from "../lib/mediaStore";

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

function pickBestMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function makePhotoThumbFromCanvas(src: HTMLCanvasElement) {
  const maxSize = 720;
  const width = src.width;
  const height = src.height;
  const scale = Math.min(1, maxSize / width, maxSize / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const thumb = document.createElement("canvas");
  thumb.width = w;
  thumb.height = h;

  const ctx = thumb.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(src, 0, 0, w, h);
  return thumb.toDataURL("image/jpeg", 0.8);
}

async function makePhotoThumbFromDataUrl(dataUrl: string) {
  return await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxSize = 720;
      const scale = Math.min(1, maxSize / img.width, maxSize / img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function makeVideoThumbnailFromUrl(videoUrl: string): Promise<string | null> {
  return await new Promise((resolve) => {
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";

      let finished = false;
      const finish = (thumb: string | null) => {
        if (finished) return;
        finished = true;
        try {
          video.pause();
          video.removeAttribute("src");
          video.load();
        } catch {}
        resolve(thumb);
      };

      const waitFor = (event: keyof HTMLVideoElementEventMap, timeoutMs: number) =>
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

      video.addEventListener("error", () => finish(null), { once: true });

      video.addEventListener(
        "loadedmetadata",
        async () => {
          try {
            const duration = video.duration;
            const target = isFinite(duration) && duration > 0 ? Math.min(0.2, duration / 10) : 0;

            if (target > 0) {
              video.currentTime = target;
              await waitFor("seeked", 500);
            } else {
              await waitFor("loadeddata", 500);
            }

            const width = video.videoWidth || 1280;
            const height = video.videoHeight || 720;
            if (!width || !height) return finish(null);

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            if (!ctx) return finish(null);

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            finish(canvas.toDataURL("image/jpeg", 0.85));
          } catch {
            finish(null);
          }
        },
        { once: true }
      );

      video.src = videoUrl;
      video.load();
    } catch {
      resolve(null);
    }
  });
}

export default function CapturePage() {
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const holdTimerRef = useRef<number | null>(null);
  const holdingRef = useRef(false);

  const previewUrlRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const [captured, setCaptured] = useState<null | {
    mediaType: "photo" | "video";
    mediaUri: string; // preview (photo data URL OR video blob URL)
    thumbUri?: string; // IMPORTANT: keep this string|undefined only
    blob?: Blob;
  }>(null);

  useEffect(() => {
    (async () => {
      try {
        setCaptureError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: true,
        });
        streamRef.current = stream;

        if (videoRef.current) {
          // @ts-ignore
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setReady(true);
      } catch {
        setReady(false);
        setCaptureError("Camera unavailable (permission/device).");
      }
    })();

    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function readTimeline(): Entry[] {
    try {
      const raw = localStorage.getItem(KEY);
      const list = raw ? (JSON.parse(raw) as Entry[]) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function isQuotaExceeded(err: unknown) {
    return (
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")
    );
  }

  async function migrateTimelineMedia(entries: Entry[]) {
    const updated: Entry[] = [];

    for (const entry of entries) {
      if (entry.mediaUri.startsWith("data:")) {
        try {
          const blob = await dataUrlToBlob(entry.mediaUri);
          let thumbUri: string | undefined = entry.thumbUri;

          if (!thumbUri && entry.mediaType === "photo") {
            thumbUri = (await makePhotoThumbFromDataUrl(entry.mediaUri)) ?? undefined;
          }

          await putMedia(entry.id, blob);

          updated.push({
            ...entry,
            mediaUri: toIdbUri(entry.id),
            thumbUri,
          });
          continue;
        } catch {
          // keep original if migration fails
        }
      }
      updated.push(entry);
    }

    return updated;
  }

  async function writeTimeline(entries: Entry[]) {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
      return;
    } catch (err) {
      if (!isQuotaExceeded(err)) throw err;
    }

    const migrated = await migrateTimelineMedia(entries);
    localStorage.setItem(KEY, JSON.stringify(migrated));
  }

  async function snapPhoto() {
    const v = videoRef.current;
    if (!v) return;

    setCaptureError(null);

    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 1080;
    canvas.height = v.videoHeight || 1920;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const thumbUrl = makePhotoThumbFromCanvas(canvas) ?? dataUrl;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
    });

    if (!blob) {
      setCaptured({ mediaType: "photo", mediaUri: dataUrl, thumbUri: thumbUrl });
      setCaptureError("Couldn’t create photo blob. Try again.");
      return;
    }

    setCaptured({ mediaType: "photo", mediaUri: dataUrl, thumbUri: thumbUrl, blob });
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;

    setCaptureError(null);
    chunksRef.current = [];

    const mimeType = pickBestMimeType();
    const recorder =
      mimeType.length > 0 ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      try {
        const type = recorder.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];

        if (!blob || blob.size === 0) {
          setCaptureError("Recording was empty (0 bytes). Try holding a bit longer.");
          return;
        }

        const playbackUrl = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = playbackUrl;

        const liveEl = videoRef.current;
        if (liveEl) {
          liveEl.pause();
          // @ts-ignore
          liveEl.srcObject = null;
          liveEl.removeAttribute("src");
          liveEl.load();
        }

        setCaptured({ mediaType: "video", mediaUri: playbackUrl, blob });

        const thumb = await makeVideoThumbnailFromUrl(playbackUrl);
        setCaptured({
          mediaType: "video",
          mediaUri: playbackUrl,
          thumbUri: thumb ?? undefined,
          blob,
        });
      } finally {
        setIsRecording(false);
      }
    };

    setIsRecording(true);

    // timeslice helps ensure dataavailable fires reliably
    recorder.start(250);
  }

  function stopRecording() {
    const r = recorderRef.current;
    if (!r) return;

    if (r.state !== "inactive") {
      try {
        r.requestData();
      } catch {}
      r.stop();
    }
  }

  function onPressStart() {
    if (!ready || captured) return;
    holdingRef.current = true;

    holdTimerRef.current = window.setTimeout(() => {
      if (holdingRef.current) startRecording();
    }, 250);
  }

  function onPressEnd() {
    holdingRef.current = false;

    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (captured) return;

    if (isRecording) stopRecording();
    else void snapPhoto();
  }

  async function reattachCameraPreview() {
    const stream = streamRef.current;
    const v = videoRef.current;
    if (!stream || !v) return;

    // @ts-ignore
    v.srcObject = stream;
    v.removeAttribute("src");
    v.controls = false;
    v.muted = true;
    v.playsInline = true;
    try {
      await v.play();
    } catch {}
  }

  function onRetake() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setCaptured(null);
    setNote("");
    setCaptureError(null);
    void reattachCameraPreview();
  }

  async function onSave() {
    if (!captured?.blob || captured.blob.size === 0) {
      setCaptureError("Nothing to save. Retake and try again.");
      return;
    }

    // ✅ CHANGE: don't allow saving videos until thumb is ready
    if (captured.mediaType === "video" && !captured.thumbUri) {
      setCaptureError("Thumbnail still generating — give it a second.");
      return;
    }

    const now = new Date().toISOString();
    const entryId = crypto.randomUUID();

    await putMedia(entryId, captured.blob);

    const entry: Entry = {
      id: entryId,
      createdAt: now,
      mediaType: captured.mediaType,
      mediaUri: toIdbUri(entryId),
      thumbUri: captured.thumbUri ?? undefined,
      textBlocks: note.trim()
        ? [{ id: crypto.randomUUID(), createdAt: now, content: note.trim() }]
        : [],
    };

    const list = readTimeline();
    await writeTimeline([entry, ...list]);
    router.push("/");
  }

  const saveDisabled =
    !captured?.blob ||
    captured.blob.size === 0 ||
    (captured?.mediaType === "video" && !captured.thumbUri);

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-lg font-semibold tracking-tight">Capture</h1>
            <p className="text-sm text-zinc-400">
              {captured ? "Add a note, then save." : "Tap photo · Hold video"}
            </p>
          </div>

          <button
            onClick={() => router.push("/")}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Close
          </button>
        </header>

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="relative">
            {!captured ? (
              <>
                <video ref={videoRef} className="w-full" playsInline muted />
                {!ready && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
                    {captureError ?? "Camera unavailable (permission/device)."}
                  </div>
                )}
                {isRecording ? (
                  <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white">
                    REC
                  </div>
                ) : null}
              </>
            ) : captured.mediaType === "photo" ? (
              <img src={captured.mediaUri} alt="Captured photo" className="w-full object-cover" />
            ) : (
              <video src={captured.mediaUri} className="w-full" controls playsInline />
            )}
          </div>

          <div className="p-4">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
              className="h-24 w-full resize-none rounded-xl border border-zinc-800 bg-transparent p-3 text-sm outline-none placeholder:text-zinc-500"
            />

            <div className="mt-4 flex items-center justify-center gap-3">
              {!captured ? (
                <button
                  onMouseDown={onPressStart}
                  onMouseUp={onPressEnd}
                  onMouseLeave={() => holdingRef.current && onPressEnd()}
                  onTouchStart={onPressStart}
                  onTouchEnd={onPressEnd}
                  disabled={!ready}
                  className="h-14 w-14 rounded-full bg-zinc-100 text-black disabled:opacity-40"
                  aria-label="Tap for photo, hold for video"
                  title="Tap for photo, hold for video"
                />
              ) : (
                <>
                  <button
                    onClick={onRetake}
                    className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                  >
                    Retake
                  </button>
                  <button
                    onClick={onSave}
                    disabled={saveDisabled}
                    className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-medium text-black hover:bg-white disabled:opacity-40"
                  >
                    Save
                  </button>
                </>
              )}
            </div>

            {/* ✅ CHANGE: explicit thumb generation message for videos */}
            {captured?.mediaType === "video" && captured.blob && !captured.thumbUri ? (
              <div className="mt-3 text-center text-xs text-zinc-500">
                Generating thumbnail…
              </div>
            ) : null}

            {captureError ? (
              <div className="mt-3 text-center text-xs text-red-400">{captureError}</div>
            ) : captured && !captured.blob ? (
              <div className="mt-3 text-center text-xs text-zinc-500">Processing media…</div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}