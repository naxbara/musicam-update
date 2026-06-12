"use client";

/**
 * Audio input settings: microphone/interface picker, channel selection
 * (stereo / left / right), instrument enhancement and echo cancellation.
 */

import type { ChannelMode } from "@/lib/audio";

export default function AudioSettingsPanel({
  open,
  devices,
  selectedDeviceId,
  channel,
  enhance,
  boost,
  echoCancel,
  onDevice,
  onChannel,
  onEnhance,
  onBoost,
  onEcho,
  onClose,
}: {
  open: boolean;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  channel: ChannelMode;
  enhance: boolean;
  boost: number;
  echoCancel: boolean;
  onDevice: (id: string) => void;
  onChannel: (c: ChannelMode) => void;
  onEnhance: () => void;
  onBoost: (v: number) => void;
  onEcho: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const channels: { value: ChannelMode; label: string }[] = [
    { value: "stereo", label: "Estéreo" },
    { value: "left", label: "Izquierdo" },
    { value: "right", label: "Derecho" },
  ];

  return (
    <div className="absolute bottom-full right-0 z-40 mb-3 w-80 rounded-2xl border border-gray-700 bg-panel/95 p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Entrada de audio
        </p>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white">
          Cerrar
        </button>
      </div>

      {/* Microphone / interface */}
      <label className="mb-1 block text-[11px] font-medium text-gray-300">
        Micrófono / interfaz
      </label>
      <select
        value={selectedDeviceId ?? ""}
        onChange={(e) => onDevice(e.target.value)}
        className="w-full rounded-lg border border-gray-600 bg-stage px-2.5 py-2 text-xs text-gray-200 outline-none focus:border-accent"
      >
        {devices.length === 0 && <option value="">(sin dispositivos)</option>}
        {devices.map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Entrada ${i + 1}`}
          </option>
        ))}
      </select>

      {/* Channel */}
      <label className="mb-1 mt-3 block text-[11px] font-medium text-gray-300">
        Canal de entrada
        <span className="ml-1 font-normal text-gray-500">
          (si tu interfaz trae el instrumento en un solo canal)
        </span>
      </label>
      <div className="flex gap-1 rounded-lg bg-white/10 p-1">
        {channels.map((c) => (
          <button
            key={c.value}
            onClick={() => onChannel(c.value)}
            className={`flex-1 rounded-md py-1.5 text-[11px] transition ${
              channel === c.value
                ? "bg-accent font-semibold text-black"
                : "text-gray-300 hover:bg-white/10"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="my-3 h-px bg-white/10" />

      {/* Instrument mode + boost */}
      <label className="flex cursor-pointer items-center justify-between text-xs text-gray-200">
        <span>
          Modo instrumento
          <span className="block text-[10px] font-normal text-gray-500">
            Realza y empareja el sonido del instrumento
          </span>
        </span>
        <input
          type="checkbox"
          checked={enhance}
          onChange={onEnhance}
          className="accent-[#e8b339]"
        />
      </label>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
        <span className="text-[10px] text-gray-500">Potencia</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.1}
          value={boost}
          onChange={(e) => onBoost(Number(e.target.value))}
          className="flex-1 accent-[#e8b339]"
        />
        <span className="w-9 text-right tabular-nums">{boost.toFixed(1)}x</span>
      </div>

      <div className="my-3 h-px bg-white/10" />

      <label className="flex cursor-pointer items-center justify-between text-xs text-gray-200">
        <span>
          Anti-eco
          <span className="block text-[10px] font-normal text-gray-500">
            Actívalo solo si no usas audífonos (reduce fidelidad)
          </span>
        </span>
        <input
          type="checkbox"
          checked={echoCancel}
          onChange={onEcho}
          className="accent-[#e8b339]"
        />
      </label>
    </div>
  );
}
