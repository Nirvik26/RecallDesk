import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallDesk — Your knowledge, connected",
  description: "Turn documents into answers you can inspect. A research workspace with source-backed answers, an evidence desk, and saved discoveries.",
  applicationName: "RecallDesk",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
