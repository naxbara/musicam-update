/**
 * Minimal line-icon set for MusiCam — single style: 24px grid, 1.8 stroke,
 * round caps, currentColor. Keeps the control bar clean and consistent.
 */

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const MicIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <line x1="12" y1="18" x2="12" y2="21.5" />
  </Svg>
);

export const MicOffIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 5a3 3 0 0 1 6 0v5" />
    <path d="M5 11a7 7 0 0 0 11.3 4.3M19 11a7 7 0 0 1-.6 2.8" />
    <line x1="12" y1="18" x2="12" y2="21.5" />
    <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
  </Svg>
);

export const VideoIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 11l6-3.5v9l-6-3.5" />
  </Svg>
);

export const VideoOffIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 6h5a2.5 2.5 0 0 1 2.5 2.5V11l6-3.5v9l-3-1.75" />
    <path d="M2.5 8.5V15.5A2.5 2.5 0 0 0 5 18h8.5" />
    <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
  </Svg>
);

export const PhoneIcon = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <line x1="10.5" y1="18" x2="13.5" y2="18" />
  </Svg>
);

export const ScreenIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </Svg>
);

export const DualIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="6" width="8.5" height="12" rx="1.5" />
    <rect x="13" y="6" width="8.5" height="12" rx="1.5" />
  </Svg>
);

export const RecordIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const StopIcon = (p: P) => (
  <Svg {...p}>
    <rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="currentColor" stroke="none" />
  </Svg>
);

export const FlagIcon = (p: P) => (
  <Svg {...p}>
    <line x1="5.5" y1="21" x2="5.5" y2="3.5" />
    <path d="M5.5 4h10.5l-2 4 2 4H5.5" />
  </Svg>
);

export const ForkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8.5 2.5v8a3.5 3.5 0 0 0 7 0v-8" />
    <line x1="12" y1="14" x2="12" y2="21" />
    <line x1="9" y1="21" x2="15" y2="21" />
  </Svg>
);

export const MetronomeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 3h5l4.5 18h-14L9.5 3z" />
    <line x1="12" y1="16" x2="17.5" y2="6.5" />
  </Svg>
);

export const SlidersIcon = (p: P) => (
  <Svg {...p}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
    <circle cx="10" cy="7" r="2" fill="#161a24" />
    <circle cx="15" cy="12" r="2" fill="#161a24" />
    <circle cx="8" cy="17" r="2" fill="#161a24" />
  </Svg>
);

export const SendIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21.5 2.5L11 13" />
    <path d="M21.5 2.5l-6.8 19-3.7-8.5-8.5-3.7 19-6.8z" />
  </Svg>
);

export const HelpIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.35-1.2.95-1.2 1.7v.5" />
    <line x1="12" y1="17.2" x2="12" y2="17.3" />
  </Svg>
);

export const NoteIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 17.5V5l11-2.5V15" />
    <circle cx="6.5" cy="17.5" r="2.8" />
    <circle cx="17.5" cy="15" r="2.8" />
  </Svg>
);

export const LogoutIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H9" />
    <path d="M16 17l5-5-5-5" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </Svg>
);

/** Official multicolor Google "G" mark. */
export const GoogleIcon = (p: P) => (
  <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" {...p}>
    <path
      fill="#4285F4"
      d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.07 7.93-2.92l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.3v3.1A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.3a12 12 0 0 0 0 10.76l3.98-3.1z"
    />
    <path
      fill="#EA4335"
      d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.3 6.62l3.98 3.1C6.23 6.88 8.88 4.77 12 4.77z"
    />
  </svg>
);
