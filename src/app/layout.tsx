import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "JN Chuteiras | Seu jogo. Outro nível.",
    template: "%s | JN Chuteiras",
  },
  description:
    "Loja de chuteiras de campo, society e futsal. Ambiente demonstrativo com produtos fictícios.",
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  robots:
    process.env.DEMO_MODE === "false"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
