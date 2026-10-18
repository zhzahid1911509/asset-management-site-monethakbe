import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "মনে থাকবে — Mone Thakbe",
    short_name: "মনে থাকবে",
    description: "Your family's assets and important records, in one place.",
    lang: "bn",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f7f9fa",
    theme_color: "#12345a",
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
