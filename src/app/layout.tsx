import type { Metadata } from "next";
import { Fira_Sans } from "next/font/google";
import "./globals.css";

const firaSans = Fira_Sans({
  variable: "--font-fira-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Every page exports its own short title; the template appends the app name.
  title: {
    default: "Anschriftenverzeichnis — Deutscher Pfadfinderbund",
    template: "%s — Anschriftenverzeichnis",
  },
  description: "Bundesanschriftenverzeichnis des Deutschen Pfadfinderbundes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${firaSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
