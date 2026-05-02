import { Frank_Ruhl_Libre, Heebo } from "next/font/google";
import "./v2.css";

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew"],
  weight: ["300", "400", "500", "700", "900"],
  variable: "--font-serif",
  display: "swap",
});

const heebo = Heebo({
  subsets: ["hebrew"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

export default function ConsistencyV2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${frankRuhl.variable} ${heebo.variable} v2-root`}>
      {children}
    </div>
  );
}
