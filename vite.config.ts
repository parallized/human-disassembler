import react from "@vitejs/plugin-react";
import unocss from "unocss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [unocss(), react()],
  build: {
    outDir: "dist/frontend",
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000"
    }
  }
});
