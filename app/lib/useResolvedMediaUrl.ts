"use client";

import { useEffect, useState } from "react";
import { getMedia, isIdbUri } from "./mediaStore";

export function useResolvedMediaUrl(mediaUri: string | null) {
  const [url, setUrl] = useState<string | null>(mediaUri ?? null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function run() {
      if (!mediaUri) {
        setUrl(null);
        return;
      }

      // Plain data URL or regular URL — use as-is
      if (!isIdbUri(mediaUri)) {
        setUrl(mediaUri);
        return;
      }

      // IDB URI — resolve blob → object URL
      const key = mediaUri.slice(4);
      const blob = await getMedia(key);
      if (!active) return;

      if (!blob) {
        console.warn("[useResolvedMediaUrl] blob not found in IDB for key:", key);
        setUrl(null);
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }

    run();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaUri]);

  return url;
}