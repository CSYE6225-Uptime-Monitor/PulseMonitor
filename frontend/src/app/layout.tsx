import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PulseMonitor",
    template: "%s · PulseMonitor",
  },
  description:
    "Real-time uptime monitoring for your websites and APIs. Get instant email alerts the moment something goes down.",
  keywords: ["uptime monitoring", "website monitoring", "downtime alerts", "status page", "ping monitor"],
  authors: [{ name: "PulseMonitor" }],
  creator: "PulseMonitor",
  metadataBase: new URL("https://pulsemonitor.app"),
  openGraph: {
    type: "website",
    siteName: "PulseMonitor",
    title: "PulseMonitor - Know the moment your site goes down",
    description:
      "Real-time uptime monitoring for your websites and APIs. Get instant email alerts the moment something goes down.",
    url: "https://pulsemonitor.app",
  },
  twitter: {
    card: "summary",
    title: "PulseMonitor - Know the moment your site goes down",
    description:
      "Real-time uptime monitoring for your websites and APIs. Get instant email alerts the moment something goes down.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-ink antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
