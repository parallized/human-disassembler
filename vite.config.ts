import devServer from "@hono/vite-dev-server";
import nodeAdapter from "@hono/vite-dev-server/node";
import react from "@vitejs/plugin-react";
import unocss from "unocss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.PORT ?? process.env.PORT ?? 3000);

  return {
    plugins: [
      devServer({
        entry: "server/index.tsx",
        adapter: nodeAdapter
      }),
      unocss(),
      react()
    ],
    build: {
      outDir: "dist/frontend",
      emptyOutDir: true
    },
    server: {
      port,
      strictPort: true
    }
  };
});
