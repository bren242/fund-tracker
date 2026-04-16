import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import ConditionalHeader from "@/components/ConditionalHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "מעקב קרנות השקעה",
  description: "מערכת מעקב קרנות השקעה",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <Suspense fallback={null}>
            <ConditionalHeader />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
