import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppHeader from "@/components/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "מעקב קרנות השקעה",
  description: "מערכת מעקב קרנות השקעה",
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") || "";
  const showHeader = !pathname.startsWith("/fund-report");

  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          {showHeader && (
            <Suspense fallback={null}>
              <AppHeader fundCount={84} />
            </Suspense>
          )}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
