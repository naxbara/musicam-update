"use client";

/**
 * Camera source dropdown: one click = one change. Lists every local webcam by
 * name, the phone camera (with a connection dot), screen share, and the
 * generalized dual view (with a "junto a:" second-source selector). Anchored
 * above the "Cámara principal" control-bar button, same pattern as
 * MetronomePanel / AudioSettingsPanel.
 */

/** Second video source for the dual view: phone, a webcam, or the screen. */
export type DualSourceKind = "phone" | "screen" | { deviceId: string };

function sameSource(a: DualSourceKind, b: DualSourceKind): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  return a.deviceId === b.deviceId;
}

export default function CameraMenu({
  open,
  videoDevices,
  currentCamId,
  usingPhone,
  phoneConnecting,
  phoneConnected,
  sharing,
  dualActive,
  dualSourceB,
  onPickCamera,
  onPickPhone,
  onShareScreen,
  onDualView,
  onLinkPhone,
  onClose,
}: {
  open: boolean;
  videoDevices: MediaDeviceInfo[];
  currentCamId: string | null;
  usingPhone: boolean;
  phoneConnecting: boolean;
  phoneConnected: boolean;
  sharing: boolean;
  dualActive: boolean;
  dualSourceB: DualSourceKind;
  onPickCamera: (deviceId: string) => void;
  onPickPhone: () => void;
  onShareScreen: () => void;
  onDualView: (source: DualSourceKind) => void;
  onLinkPhone: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const webcams = videoDevices.filter((d) => d.deviceId);
  const phoneDot = phoneConnecting
    ? "bg-amber-400"
    : phoneConnected
      ? "bg-emerald-400"
      : "bg-gray-500";

  // Options for the dual view's second source (never the active main camera).
  const dualOptions: { key: string; label: string; src: DualSourceKind }[] = [
    { key: "phone", label: "Cámara del celular", src: "phone" },
    ...webcams
      .filter((c) => c.deviceId !== currentCamId)
      .map((c, i) => ({
        key: c.deviceId,
        label: c.label || `Cámara ${i + 2}`,
        src: { deviceId: c.deviceId } as DualSourceKind,
      })),
    { key: "screen", label: "Pantalla", src: "screen" as DualSourceKind },
  ];

  const Row = ({
    active,
    onClick,
    children,
  }: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      onClick={() => {
        onClick();
        onClose();
      }}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
        active ? "bg-accent/15 text-accent" : "text-gray-200 hover:bg-white/10"
      }`}
    >
      <span className="w-4 text-center text-accent">{active ? "✓" : ""}</span>
      <span className="flex-1">{children}</span>
    </button>
  );

  return (
    <div className="absolute bottom-full left-1/2 z-40 mb-3 w-64 -translate-x-1/2 rounded-2xl border border-gray-700 bg-panel/95 p-2 shadow-2xl">
      <div className="flex items-center justify-between px-2 py-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Fuente de video
        </p>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-white">
          Cerrar
        </button>
      </div>

      {webcams.map((cam, i) => {
        const active = !usingPhone && !sharing && !dualActive && cam.deviceId === currentCamId;
        return (
          <Row key={cam.deviceId} active={active} onClick={() => onPickCamera(cam.deviceId)}>
            {cam.label || `Cámara ${i + 1}`}
          </Row>
        );
      })}

      <Row active={usingPhone} onClick={onPickPhone}>
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${phoneDot}`} />
          Cámara del celular
        </span>
      </Row>

      <Row active={sharing} onClick={onShareScreen}>
        Compartir pantalla
      </Row>

      <Row active={dualActive} onClick={() => onDualView(dualSourceB)}>
        Vista dual (cara + manos)
      </Row>

      {/* Dual second-source selector */}
      <div className="mx-2 mt-1 rounded-lg bg-black/30 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
          Vista dual · junto a:
        </p>
        <div className="flex flex-wrap gap-1">
          {dualOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                onDualView(opt.src);
                onClose();
              }}
              className={`rounded-md px-2 py-1 text-[11px] transition ${
                sameSource(dualSourceB, opt.src)
                  ? "bg-accent text-black"
                  : "bg-white/10 text-gray-200 hover:bg-white/20"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="my-1 h-px bg-white/10" />

      <Row onClick={onLinkPhone}>Vincular celular (código QR)…</Row>
    </div>
  );
}
