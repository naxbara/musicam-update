"use client";

/**
 * Chord text box overlaid on the video. The teacher writes chords (or any
 * note) in a box that can be dragged, resized by stretching its corner, and
 * styled (color, font size, transparency). The exact box — text, position,
 * size and style — is mirrored to the student, who sees it read-only.
 */

import { useRef, type RefObject } from "react";

export interface ChordBox {
  text: string;
  /** Top-left position in px, relative to the video container. */
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fontSize: number;
  /** 0..1 — text opacity. */
  opacity: number;
  visible: boolean;
}

export const DEFAULT_CHORD_BOX: ChordBox = {
  text: "",
  x: 80,
  y: 120,
  w: 320,
  h: 120,
  color: "#ffd166",
  fontSize: 48,
  opacity: 0.95,
  visible: false,
};

const MIN_W = 120;
const MIN_H = 60;

export default function ChordOverlay({
  box,
  editable,
  containerRef,
  onChange,
  onClose,
}: {
  box: ChordBox;
  editable: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onChange: (box: ChordBox) => void;
  onClose: () => void;
}) {
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; w: number; h: number } | null>(null);

  if (!box.visible) return null;

  const bounds = () => containerRef.current?.getBoundingClientRect();

  // --- drag (move) ---
  const onDragDown = (e: React.PointerEvent) => {
    if (!editable) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - box.x, dy: e.clientY - box.y };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const b = bounds();
    if (!d || !b) return;
    const x = Math.min(Math.max(e.clientX - d.dx, 0), b.width - box.w);
    const y = Math.min(Math.max(e.clientY - d.dy, 0), b.height - box.h);
    onChange({ ...box, x, y });
  };
  const onDragUp = () => {
    dragRef.current = null;
  };

  // --- resize (stretch corner) ---
  const onResizeDown = (e: React.PointerEvent) => {
    if (!editable) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { sx: e.clientX, sy: e.clientY, w: box.w, h: box.h };
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    const b = bounds();
    if (!r || !b) return;
    const w = Math.min(Math.max(r.w + (e.clientX - r.sx), MIN_W), b.width - box.x);
    const h = Math.min(Math.max(r.h + (e.clientY - r.sy), MIN_H), b.height - box.y);
    onChange({ ...box, w, h });
  };
  const onResizeUp = () => {
    resizeRef.current = null;
  };

  return (
    <div
      className="absolute z-30 select-none"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      {/* Editor toolbar (teacher only) */}
      {editable && (
        <div className="absolute -top-11 left-0 flex items-center gap-2 rounded-lg border border-gray-700 bg-panel/95 px-2 py-1 text-[11px] shadow-xl">
          <span
            className="cursor-grab touch-none px-1 text-gray-400 active:cursor-grabbing"
            onPointerDown={onDragDown}
            onPointerMove={onDragMove}
            onPointerUp={onDragUp}
            title="Arrastra para mover la caja"
          >
            ✥
          </span>
          <label className="flex items-center gap-1" title="Color">
            <input
              type="color"
              value={box.color}
              onChange={(e) => onChange({ ...box, color: e.target.value })}
              className="h-5 w-6 cursor-pointer rounded border-none bg-transparent p-0"
            />
          </label>
          <label className="flex items-center gap-1" title="Tamaño de fuente">
            <span className="text-gray-400">A</span>
            <input
              type="range"
              min={16}
              max={120}
              step={2}
              value={box.fontSize}
              onChange={(e) => onChange({ ...box, fontSize: Number(e.target.value) })}
              className="w-16 accent-accent"
            />
          </label>
          <label className="flex items-center gap-1" title="Transparencia">
            <span className="text-gray-400">◍</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={box.opacity}
              onChange={(e) => onChange({ ...box, opacity: Number(e.target.value) })}
              className="w-16 accent-accent"
            />
          </label>
          <button
            onClick={onClose}
            className="rounded px-1.5 py-0.5 text-gray-400 hover:bg-white/10 hover:text-white"
            title="Ocultar acordes"
          >
            ✕
          </button>
        </div>
      )}

      {/* The box itself */}
      {editable ? (
        <textarea
          value={box.text}
          onChange={(e) => onChange({ ...box, text: e.target.value })}
          placeholder="Escribe acordes… (ej. Am  G  F)"
          spellCheck={false}
          className="h-full w-full resize-none rounded-xl border-2 border-dashed border-white/30 bg-black/20 p-2 font-semibold leading-tight outline-none placeholder:text-white/30 focus:border-accent/70"
          style={{
            color: box.color,
            fontSize: box.fontSize,
            opacity: box.opacity,
          }}
        />
      ) : (
        <div
          className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-2 font-semibold leading-tight"
          style={{ color: box.color, fontSize: box.fontSize, opacity: box.opacity }}
        >
          {box.text}
        </div>
      )}

      {/* Resize handle (teacher only) */}
      {editable && (
        <span
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize touch-none rounded-sm border border-white/40 bg-accent/80"
          title="Estira para cambiar el tamaño"
        />
      )}
    </div>
  );
}
