import type { Metadata, Viewport } from "next";
import "./globals.css";

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Talk to Jenny | Student Space",
  description: "Lições, homework e progresso dos alunos da Talk to Jenny.",
  manifest: `${publicBasePath}/manifest.webmanifest`,
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: `${publicBasePath}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { url: `${publicBasePath}/icon-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: `${publicBasePath}/icon-192.png`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#003f70",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
