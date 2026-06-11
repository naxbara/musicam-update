import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MusiCam — Clases de música en vivo",
  description:
    "Videollamadas 1:1 para clases de música: audio sin supresión de ruido, modo instrumento, cámara del celular y grabación sincronizada.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-stage antialiased">{children}</body>
    </html>
  );
}
