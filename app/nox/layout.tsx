import type { Metadata } from "next";

export const metadata: Metadata = {
  icons: { icon: "/branding/nox/favicon.svg" },
};

export default function NoxLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
