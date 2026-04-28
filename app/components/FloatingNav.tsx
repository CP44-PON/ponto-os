"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

type Position = {
  x: number;
  y: number;
};

export default function FloatingNav() {
  const router = useRouter();
  const pathname = usePathname();

  const [position, setPosition] = useState<Position>({ x: 24, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<Position>({ x: 0, y: 0 });
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPosition({ x: 24, y: (window.innerHeight - 240) / 2 });
    }
  }, []);

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStartPos.current = {
      x: clientX - position.x,
      y: clientY - position.y,
    };
  };

  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;

    const newX = clientX - dragStartPos.current.x;
    const newY = clientY - dragStartPos.current.y;

    setPosition({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY);
    const onMouseUp = () => handleDragEnd();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => handleDragEnd();

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, position.x, position.y]);

  return (
    <div
      ref={navRef}
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 50,
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onMouseDown={(e) => handleDragStart(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        if (e.touches.length > 0) {
          handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 backdrop-blur-sm">
        <button
          onClick={() => router.push("/")}
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
            pathname === "/"
              ? "bg-zinc-100 text-black"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          }`}
          aria-label="Home"
          title="Timeline"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </button>

        <button
          onClick={() => router.push("/capture")}
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
            pathname === "/capture"
              ? "bg-zinc-100 text-black"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          }`}
          aria-label="Capture"
          title="Camera"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        <button
          onClick={() => router.push("/artboard")}
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
            pathname === "/artboard" || pathname === "/note"
              ? "bg-zinc-100 text-black"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          }`}
          aria-label="Note"
          title="Artboard"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>

        <button
          onClick={() => router.push("/p")}
          className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
            pathname === "/p"
              ? "bg-zinc-100 text-black"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          }`}
          aria-label="PONTO"
          title="PONTO"
        >
          <span className="font-bold text-lg">P</span>
        </button>
      </div>
    </div>
  );
}