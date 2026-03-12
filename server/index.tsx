import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import type { ViteDevServer } from "vite";
import { z } from "zod";
import { env } from "./config";
import { createSession, generateHumanFile, getSessionSnapshot, submitAnswers } from "./session-service";
import { renderAppPage } from "./ssr";

type AppBindings = {
  vite?: ViteDevServer;
};

const app = new Hono<{ Bindings: AppBindings }>();

const createSessionSchema = z.object({
  userName: z.string().min(1, "请输入你的名字或代号"),
  focus: z.string().optional()
});

const submitAnswersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      answer: z.string().min(1)
    })
  )
});

// API Routes
app.post("/api/sessions", async (c) => {
  const payload = createSessionSchema.safeParse(await c.req.json().catch(() => null));
  if (!payload.success) {
    return c.json({ error: payload.error.issues[0]?.message ?? "请求参数不合法" }, 400);
  }

  const snapshot = await createSession(payload.data);
  return c.json(snapshot);
});

app.get("/api/sessions/:sessionId", async (c) => {
  const snapshot = await getSessionSnapshot(c.req.param("sessionId"));
  if (!snapshot) {
    return c.json({ error: "会话不存在" }, 404);
  }

  return c.json(snapshot);
});

app.post("/api/sessions/:sessionId/answers", async (c) => {
  const payload = submitAnswersSchema.safeParse(await c.req.json().catch(() => null));
  if (!payload.success) {
    return c.json({ error: "回答格式不正确" }, 400);
  }

  const snapshot = await submitAnswers(c.req.param("sessionId"), payload.data.answers);
  if (!snapshot) {
    return c.json({ error: "会话不存在" }, 404);
  }

  return c.json(snapshot);
});

app.post("/api/sessions/:sessionId/human-markdown", async (c) => {
  const snapshot = await generateHumanFile(c.req.param("sessionId"));
  if (!snapshot) {
    return c.json({ error: "会话不存在" }, 404);
  }

  return c.json(snapshot);
});

if (env.isDevelopment) {
  app.get("*", async (c) => {
    try {
      const html = await renderAppPage({
        requestUrl: c.req.url,
        vite: c.env.vite
      });

      return c.html(html);
    } catch (error) {
      console.error("Development SSR render failed:", error);
      return c.html("<h1>Development render failed</h1><p>Please check the server logs.</p>", 500);
    }
  });
} else {
  app.use("/assets/*", serveStatic({ root: "./dist/frontend" }));

  app.get("*", async (c) => {
    try {
      const html = await renderAppPage({ requestUrl: c.req.url });
      return c.html(html);
    } catch (error) {
      console.error("SSR render failed:", error);
      return c.html(
        "<h1>Frontend build not found</h1><p>Please run <code>bun run build:frontend</code> first.</p>",
        500,
      );
    }
  });
}

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: error.message || "服务器异常" }, 500);
});

export default {
  port: env.port,
  fetch: app.fetch
};
