import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Renderer-Build. base "./" macht die Asset-Pfade relativ, damit die gebaute
// index.html auch per file:// aus Electron heraus lädt.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173 },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
