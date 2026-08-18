import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alex Oxytocin — ИИ, архитектура и инструменты",
  description:
    "Личный сайт Алексея Грищенко: ИИ по делу, разработка решений, профессиональный опыт и комьюнити «Алло, Нейросеточная?».",
  icons: {
    icon: "/favicon.svg?v=alex-a-20260818",
    shortcut: "/favicon.svg?v=alex-a-20260818",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
