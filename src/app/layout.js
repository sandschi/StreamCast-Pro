import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face — logotypes, marketing headlines and big stat numerals only.
// Never body/nav/buttons/labels. See Designsystem/HANDOFF.md section 1.
const pressStart2P = localFont({
  src: "./fonts/PressStart2P-Regular.ttf",
  variable: "--font-press-start-2p",
  weight: "400",
  display: "swap",
});

export const metadata = {
  title: "StreamCast by Sandschi",
  description: "Advanced broadcast tools for Streamers",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
};

import { AuthProvider } from "@/context/AuthContext";
import { PostHogProvider } from "@/providers/PostHogProvider";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pressStart2P.variable} antialiased`}
      >
        <PostHogProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </PostHogProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
