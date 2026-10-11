import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SR - Feirinhas", template: "%s · SR - Feirinhas" },
  description: "Gestão simples de agendas, eventos, vendas e finanças para feirantes e organizadores de feiras.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#e2600f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={nunito.variable}>
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
