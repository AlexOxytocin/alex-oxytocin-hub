"use client";

import { useEffect } from "react";

export function NeuralField() {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/assets/neural.js";
    document.head.appendChild(script);

    return () => script.remove();
  }, []);

  return <canvas className="hero-canvas" aria-hidden="true" />;
}
