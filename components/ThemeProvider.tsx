"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("app-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else {
      // Check brand default appearance
      fetch("/api/brand")
        .then((r) => r.json())
        .then((b) => {
          if (b.defaultAppearance === "dark") setTheme("dark");
        })
        .catch(() => {});
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    localStorage.setItem("app-theme", theme);
  }, [theme, mounted]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
      style={{
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "5px 8px",
        cursor: "pointer",
        fontSize: 14,
        lineHeight: 1,
        color: "var(--text-header)",
        transition: "border-color 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
