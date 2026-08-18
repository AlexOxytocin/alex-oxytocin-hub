import type { Metadata } from "next";
import HomePage from "../HomePage";

export const metadata: Metadata = {
  title: "Alex Oxytocin — AI, architecture, and practical tools",
  description:
    "Aleksei Grishchenko’s personal site: practical AI solutions, one-to-one AI learning sessions, professional experience, and the Hello, Neural Network? community.",
  alternates: {
    canonical: "/en/",
    languages: {
      "ru-RU": "/",
      "en-US": "/en/",
    },
  },
};

export default function EnglishHome() {
  return <HomePage locale="en" />;
}
