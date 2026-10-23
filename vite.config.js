import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative assets work both at the custom-domain root and under
  // /bardacassia/ on GitHub Pages without producing 404s.
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        evento: resolve(__dirname, "evento.html"),
        oBar: resolve(__dirname, "o-bar.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api/deezer": {
        target: "https://api.deezer.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deezer/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/api/deezer": {
        target: "https://api.deezer.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deezer/, ""),
      },
    },
  },
});
