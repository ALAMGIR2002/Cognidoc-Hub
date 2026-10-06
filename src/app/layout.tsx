import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";
import { TTSProvider } from "@/lib/tts";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CogniDoc — Adaptive Document Analyzer",
  description:
    "AI document analysis with cognitive and emotional responses tailored to your profile. Powered by Gemini.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${geistMono.variable} h-full dark`}
    >
      <body>
        <TTSProvider>
          {children}
        </TTSProvider>
      </body>
    </html>
  );
}
