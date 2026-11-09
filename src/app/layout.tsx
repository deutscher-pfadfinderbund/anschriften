import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import "./globals.css";

// Fira Sans is vendored (see ./fonts, OFL.txt alongside) instead of pulled from
// Google. `next/font/google` self-hosts the files but downloads them from
// fonts.gstatic.com at *build* time, which would make the Docker build depend on
// reaching Google. These are the same latin-subset woff2 faces, checked in.
const firaSans = localFont({
  variable: "--font-fira-sans",
  display: "swap",
  src: [
    { path: "./fonts/FiraSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/FiraSans-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/FiraSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/FiraSans-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/FiraSans-Bold.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  // Every page exports its own short title; the template appends the app name.
  title: {
    default: "Anschriftenverzeichnis — Deutscher Pfadfinderbund",
    template: "%s — Anschriftenverzeichnis",
  },
  description: "Bundesanschriftenverzeichnis des Deutschen Pfadfinderbundes",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The viewer's saved light/dark choice (ThemeToggle); without one: the system's.
  const saved = (await cookies()).get("theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : undefined;
  return (
    <html lang="de" data-theme={theme} className={`${firaSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
