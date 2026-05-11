import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppHeader from "@/components/AppHeader";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const pathname = h.get("x-pathname") || "";
  const isNox = pathname.includes("/nox");
  return {
    title: isNox ? "NOX Wealth Management" : "GREEN Wealth Management",
    description: "מערכת מעקב קרנות השקעה",
    icons: { icon: isNox ? "/branding/nox/favicon.svg" : "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") || "";
  const showHeader = !pathname.startsWith("/fund-report") && !pathname.includes("/consistency/v2");

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
