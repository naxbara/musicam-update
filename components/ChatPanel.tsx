"use client";

/**
 * In-call chat panel. Messages travel over the PeerJS data channel between
 * the two participants (teacher ↔ student). Right-side sliding panel.
 */

import { useEffect, useRef, useState } from "react";

export interface ChatMessage {
  from: string;
  text: string;
  ts: number;
  mine: boolean;
}

export default function ChatPanel({
  open,
  messages,
  connected,
  onSend,
  onClose,
}: {
  open: boolean;
  messages: ChatMessage[];
  connected: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, messages]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="absolute right-3 top-14 bottom-24 z-40 flex w-80 max-w-[85vw] flex-col rounded-2xl border border-gray-700 bg-panel/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Chat
        </p>
        <button
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-white"
        >
          Cerrar
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="mt-4 text-center text-xs text-gray-500">
            {connected
              ? "Aún no hay mensajes. Escribe algo abajo."
              : "El chat se activa cuando el otro participante entra a la sala."}
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex flex-col ${m.mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                  m.mine
                    ? "rounded-br-sm bg-accent text-black"
                    : "rounded-bl-sm bg-white/10 text-gray-100"
                }`}
              >
                {!m.mine && (
                  <span className="mb-0.5 block text-[10px] font-semibold text-accent/90">
                    {m.from}
                  </span>
                )}
                <span className="whitespace-pre-wrap break-words">{m.text}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2 border-t border-gray-700 p-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe un mensaje…"
          className="flex-1 rounded-lg border border-gray-700 bg-stage px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-black hover:brightness-110"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
