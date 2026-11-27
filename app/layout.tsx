import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BLAZE-X | Advanced AI Assistant",
  description:
    "BLAZE-X is an advanced multimodal AI assistant for learning, coding, research, business and creativity.",
  applicationName: "BLAZE-X",
  authors: [{ name: "Yuva" }],
  creator: "Yuva",
  keywords: [
    "BLAZE-X",
    "Artificial Intelligence",
    "AI Assistant",
    "Multimodal AI",
    "Chat AI",
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#ffffff",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#0d0d0d",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
