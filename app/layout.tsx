import type { Metadata } from "next";
import "../shared/ecosystem-nav.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://godmodetools.com"),
  title: "Alex Oxytocin — ИИ, архитектура и инструменты",
  description:
    "Личный сайт Алексея Грищенко: ИИ по делу, разработка решений, профессиональный опыт и комьюнити «Алло, Нейросеточная?».",
  alternates: {
    canonical: "/",
    languages: {
      "ru-RU": "/",
      "en-US": "/en/",
    },
  },
  icons: {
    icon: "/favicon.png?v=alex-a-solid-20260818",
    shortcut: "/favicon.png?v=alex-a-solid-20260818",
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
