"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import FloatingNav from "./components/FloatingNav";

type TextBlock = {
  id: string;
  createdAt: string;
  content: string;
};

type Entry = {
  id: string;
  createdAt: string;
  mediaType: "photo" | "video";
  mediaUri: string;
  thumbUri?: string;
  textBlocks: TextBlock[];
  stackId?: string;
  artboardData?: any;
};

type StackContext = {
  isInStack: boolean;
  previousEntry: Entry | null;
  nextEntry: Entry | null;
  position: number;
  total: number;
  allStackEntries: Entry[];
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

function saveTimeline(entries: Entry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(EVT));
  } catch (err) {
    console.error("Failed to save timeline:", err);
  }
}

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return iso;
  }
}

function getStackContext(entry: Entry, allEntries: Entry[]): StackContext | null {
  if (!entry.stackId) return null;

  const stackEntries = allEntries
    .filter((e) => e.stackId === entry.stackId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const currentIndex = stackEntries.findIndex((e) => e.id === entry.id);

  return {
    isInStack: true,
    previousEntry: stackEntries[currentIndex - 1] || null,
    nextEntry: stackEntries[currentIndex + 1] || null,
    position: currentIndex,
    total: stackEntries.length,
    allStackEntries: stackEntries,
  };
}

export default function TimelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  
  // Track which entry in each stack slot is currently visible
  const [visibleInSlot, setVisibleInSlot] = useState<Record<string, string>>({});

  const longPressTimerRef = useRef<number | null>(null);

  const returnToId = searchParams.get("returnTo");

  useEffect(() => {
    const load = () => {
      const loaded = readTimeline();
      setEntries(loaded);
      
      // Initialize visible entry for each timeline slot
      const visible: Record<string, string> = {};
      loaded.forEach(entry => {
        visible[entry.id] = entry.id;
      });
      setVisibleInSlot(visible);
    };
    
    load();

    const onCustom = () => load();
    window.addEventListener(EVT, onCustom);

    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) load();
    };
    window.addEventListener("storage", onStorage);

    const onFocus = () => load();
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener(EVT, onCustom);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (returnToId && entries.length > 0) {
      setTimeout(() => {
        const targetElement = document.getElementById(`slot-${returnToId}`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
        }
      }, 100);
    }
  }, [returnToId, entries]);

  const sortedEntries = [...entries].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  function handleLongPressStart(entryId: string) {
    longPressTimerRef.current = window.setTimeout(() => {
      setMultiSelectMode(true);
      setSelectedEntries([entryId]);
    }, 500);
  }

  function handleLongPressEnd() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function toggleSelection(entryId: string) {
    if (selectedEntries.includes(entryId)) {
      setSelectedEntries(selectedEntries.filter((id) => id !== entryId));
    } else {
      setSelectedEntries([...selectedEntries, entryId]);
    }
  }

  function createStack() {
    if (selectedEntries.length < 2) {
      alert("Select at least 2 entries to create a stack");
      return;
    }

    const stackId = crypto.randomUUID();
    const updatedEntries = entries.map((entry) =>
      selectedEntries.includes(entry.id) ? { ...entry, stackId } : entry
    );

    saveTimeline(updatedEntries);
    setMultiSelectMode(false);
    setSelectedEntries([]);
  }

  function cancelMultiSelect() {
    setMultiSelectMode(false);
    setSelectedEntries([]);
  }

  function handleEntryClick(entryId: string) {
    if (multiSelectMode) {
      toggleSelection(entryId);
    } else {
      const entry = entries.find(e => e.id === entryId);
      
      if (entry?.artboardData) {
        router.push(`/artboard?edit=${entryId}`);
      } else {
        router.push(`/entry/${entryId}`);
      }
    }
  }

  function rotateSlot(slotId: string, targetEntryId: string) {
    setVisibleInSlot({ ...visibleInSlot, [slotId]: targetEntryId });
  }

  return (
    <>
      {/* Floating Navigation */}
      <FloatingNav />

      {/* Main Timeline */}
      <main 
        className="fixed inset-0 bg-black text-white"
        style={{
          // Prevent any scrolling on the body
          overflow: "hidden",
          height: "100vh",
          height: "100dvh", // Dynamic viewport height for mobile
          width: "100vw",
        }}
      >
        <div
          ref={scrollRef}
          style={{ 
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "1.5rem",
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            paddingTop: "2rem",
            paddingBottom: "2rem",
            overflowX: "auto",
            overflowY: "hidden",
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {sortedEntries.length === 0 ? (
            <div 
              style={{
                display: "flex",
                height: "100%",
                width: "100%",
                alignItems: "center",
                justifyContent: "center",
                color: "#71717a",
              }}
            >
              No entries yet. Create some in /capture or /artboard
            </div>
          ) : (
            sortedEntries.map((slotEntry) => {
              const visibleEntryId = visibleInSlot[slotEntry.id] || slotEntry.id;
              const visibleEntry = entries.find(e => e.id === visibleEntryId) || slotEntry;
              const stackContext = getStackContext(slotEntry, entries);
              
              return (
                <EntryCard
                  key={slotEntry.id}
                  slotId={slotEntry.id}
                  displayEntry={visibleEntry}
                  stackContext={stackContext}
                  multiSelectMode={multiSelectMode}
                  isSelected={selectedEntries.includes(visibleEntry.id)}
                  onClick={() => handleEntryClick(visibleEntry.id)}
                  onRotateSlot={rotateSlot}
                  onLongPressStart={() => handleLongPressStart(visibleEntry.id)}
                  onLongPressEnd={handleLongPressEnd}
                />
              );
            })
          )}
        </div>

        {/* Multi-Select Toolbar */}
        {multiSelectMode && (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-4 border-t border-zinc-800 bg-black p-4">
            <button
              onClick={cancelMultiSelect}
              className="rounded-full border border-zinc-700 px-6 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            >
              Cancel
            </button>
            <button
              onClick={createStack}
              disabled={selectedEntries.length < 2}
              className="rounded-full bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-40"
            >
              Create Stack ({selectedEntries.length})
            </button>
          </div>
        )}
      </main>

      {/* Hide scrollbar globally */}
      <style jsx global>{`
        * {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        *::-webkit-scrollbar {
          display: none;
        }
        body {
          overflow: hidden;
        }
      `}</style>
    </>
  );
}

function EntryCard({
  slotId,
  displayEntry,
  stackContext,
  multiSelectMode,
  isSelected,
  onClick,
  onRotateSlot,
  onLongPressStart,
  onLongPressEnd,
}: {
  slotId: string;
  displayEntry: Entry;
  stackContext: StackContext | null;
  multiSelectMode: boolean;
  isSelected: boolean;
  onClick: () => void;
  onRotateSlot: (slotId: string, targetEntryId: string) => void;
  onLongPressStart: () => void;
  onLongPressEnd: () => void;
}) {
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const hasSwiped = useRef(false);

  const displayUri = displayEntry.thumbUri || displayEntry.mediaUri;
  
  const currentIndex = stackContext?.allStackEntries.findIndex(e => e.id === displayEntry.id) ?? 0;
  const previousEntry = stackContext?.allStackEntries[currentIndex - 1] || null;
  const nextEntry = stackContext?.allStackEntries[currentIndex + 1] || null;

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    hasSwiped.current = false;
    
    if (!multiSelectMode) {
      onLongPressStart();
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (multiSelectMode || !stackContext) return;

    const currentY = e.touches[0].clientY;
    const deltaY = touchStartY.current - currentY;

    if (Math.abs(deltaY) > 50) {
      hasSwiped.current = true;
      onLongPressEnd();

      if (deltaY > 0 && previousEntry) {
        onRotateSlot(slotId, previousEntry.id);
        touchStartY.current = currentY;
      } else if (deltaY < 0 && nextEntry) {
        onRotateSlot(slotId, nextEntry.id);
        touchStartY.current = currentY;
      }
    }
  }

  function handleTouchEnd() {
    const touchDuration = Date.now() - touchStartTime.current;
    
    onLongPressEnd();
    
    if (!hasSwiped.current && touchDuration < 500) {
      onClick();
    }
    
    hasSwiped.current = false;
  }

  function handleMouseDown() {
    if (!multiSelectMode) {
      onLongPressStart();
    }
  }

  function handleMouseUp() {
    onLongPressEnd();
  }

  function handleClick() {
    onClick();
  }

  function handleWheel(e: React.WheelEvent) {
    if (!stackContext) return;

    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.stopPropagation();
      
      if (e.deltaY < 0 && previousEntry) {
        onRotateSlot(slotId, previousEntry.id);
      } else if (e.deltaY > 0 && nextEntry) {
        onRotateSlot(slotId, nextEntry.id);
      }
    }
  }

  return (
    <div
      id={`slot-${slotId}`}
      className="flex-shrink-0"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        scrollSnapAlign: "center",
        minWidth: "320px",
        maxWidth: "320px",
      }}
      onWheel={handleWheel}
    >
      {/* Ghost Above */}
      {previousEntry && (
        <div className="mb-2 flex flex-col items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRotateSlot(slotId, previousEntry.id);
            }}
            className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
          >
            <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 14l5-5 5 5H7z" />
            </svg>
          </button>
          <div
            className="cursor-pointer transition-opacity hover:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              onRotateSlot(slotId, previousEntry.id);
            }}
          >
            <GhostPreview entry={previousEntry} />
          </div>
        </div>
      )}

      <div className="mb-2 text-xs text-zinc-500">{formatDate(displayEntry.createdAt)}</div>

      <div
        className={`relative overflow-hidden rounded-2xl border ${
          isSelected
            ? "border-orange-500 ring-2 ring-orange-500"
            : "border-zinc-800"
        } bg-zinc-950 transition-all ${multiSelectMode ? "cursor-pointer" : "hover:border-zinc-700 cursor-pointer"}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={onLongPressEnd}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {multiSelectMode && (
          <div className="absolute left-3 top-3 z-10">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded border-2 ${
                isSelected
                  ? "border-orange-500 bg-orange-500"
                  : "border-zinc-600 bg-zinc-900"
              }`}
            >
              {isSelected && (
                <svg
                  className="h-4 w-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        )}

        {displayEntry.mediaType === "photo" && displayUri && (
          <img
            src={displayUri}
            alt="Entry"
            className="w-full object-cover select-none"
            style={{ maxHeight: "400px", minHeight: "200px" }}
            draggable={false}
          />
        )}

        {displayEntry.mediaType === "video" && displayUri && (
          <video
            src={displayUri}
            className="w-full object-cover select-none"
            style={{ maxHeight: "400px", minHeight: "200px" }}
            controls={false}
            playsInline
            muted
          />
        )}

        {displayEntry.textBlocks?.[0]?.content && (
          <div className="p-4 select-none">
            <p className="line-clamp-2 text-sm text-zinc-300">
              {displayEntry.textBlocks[0].content}
            </p>
          </div>
        )}

        {stackContext && (
          <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white backdrop-blur-sm select-none">
            {currentIndex + 1}/{stackContext.total}
          </div>
        )}
      </div>

      {/* Ghost Below */}
      {nextEntry && (
        <div className="mt-2 flex flex-col items-center">
          <div
            className="cursor-pointer transition-opacity hover:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              onRotateSlot(slotId, nextEntry.id);
            }}
          >
            <GhostPreview entry={nextEntry} />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRotateSlot(slotId, nextEntry.id);
            }}
            className="mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
          >
            <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5H7z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function GhostPreview({ entry }: { entry: Entry }) {
  const displayUri = entry.thumbUri || entry.mediaUri;

  return (
    <div
      className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 select-none"
      style={{
        width: "192px",
        opacity: 0.3,
      }}
    >
      {entry.mediaType === "photo" && displayUri && (
        <img
          src={displayUri}
          alt="Ghost preview"
          className="w-full object-cover"
          style={{ height: "120px" }}
          draggable={false}
        />
      )}
      {entry.mediaType === "video" && displayUri && (
        <video
          src={displayUri}
          className="w-full object-cover"
          style={{ height: "120px" }}
          playsInline
          muted
        />
      )}
    </div>
  );
}