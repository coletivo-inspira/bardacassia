import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
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
