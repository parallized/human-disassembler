import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { html } from "hono/html";
import { z } from "zod";
import { env } from "./config";
import { createSession, generateHumanFile, getSessionSnapshot, submitAnswers } from "./session-service";

const app = new Hono();

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

const pageShell = (content: unknown) => html`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI, Remember Me</title>
    <link rel="stylesheet" href="/public/uno.css" />
  </head>
  <body class="min-h-screen bg-slate-950 text-slate-100">
    ${content}
  </body>
</html>`;

app.get("/public/*", serveStatic({ root: "./" }));

app.get("/", (c) => {
  return c.html(
    pageShell(
      <main class="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 lg:px-8">
        <section class="overflow-hidden rounded-3xl border border-slate-400/20 bg-slate-900/75 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur-lg lg:p-12">
          <div class="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <div class="mb-4 inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-cyan-200">
                AI, Remember Me
              </div>
              <h1 class="max-w-3xl text-4xl font-semibold leading-tight lg:text-6xl">
                用 100 个自我探索问题，沉淀一份真正懂你的 <span class="text-cyan-300">HUMAN.md</span>
              </h1>
              <p class="mt-6 max-w-2xl text-base leading-8 text-slate-300 lg:text-lg">
                基于 Aimlief 主题结构组织 100 个深度问题。每轮回答后，AI 会总结你的原始答案，并继续挑选更相关的下一组问题，直到 100 个问题全部完成。
              </p>
              <div class="mt-8 grid gap-4 text-sm text-slate-300 md:grid-cols-3">
                <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div class="text-cyan-300">100 个硬编码问题</div>
                  <div class="mt-2 text-slate-400">完整保存原始回答与 AI 摘要</div>
                </div>
                <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div class="text-cyan-300">Grok 兼容接口</div>
                  <div class="mt-2 text-slate-400">通过 `ai.huan666.de/v1/chat/completions` 接入</div>
                </div>
                <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div class="text-cyan-300">一键生成 HUMAN.md</div>
                  <div class="mt-2 text-slate-400">适合作为任意 AI 的长期上下文前缀</div>
                </div>
              </div>
            </div>
            <div class="rounded-[2rem] border border-slate-800 bg-slate-950/80 p-6">
              <div class="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">Start Session</div>
              <form id="start-form" class="mt-6 space-y-4">
                <label class="block">
                  <div class="mb-2 text-sm text-slate-300">你的名字或代号</div>
                  <input name="userName" required class="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-400" placeholder="比如：Parallized" />
                </label>
                <label class="block">
                  <div class="mb-2 text-sm text-slate-300">当前最想探索的主题</div>
                  <textarea name="focus" rows={4} class="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-400" placeholder="比如：职业选择、亲密关系、长期目标、自我认知……"></textarea>
                </label>
                <button class="inline-flex w-full items-center justify-center rounded-xl bg-cyan-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-cyan-300">
                  创建访谈
                </button>
              </form>
              <div id="status" data-tone="info" class="mt-4 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
                填写信息后开始第一轮访谈。
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-8 lg:grid-cols-[1fr_420px]">
          <div class="rounded-3xl border border-slate-400/20 bg-slate-900/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur-lg lg:p-8">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div class="text-xs uppercase tracking-[0.2em] text-slate-500">Interview Progress</div>
                <div class="mt-2 text-sm text-slate-300">会话 ID：<span id="session-id" class="text-slate-100">尚未创建</span></div>
              </div>
              <div id="ai-badge" class="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs text-cyan-200">等待会话开始</div>
            </div>
            <div class="mt-6 h-3 overflow-hidden rounded-full bg-slate-900">
              <div id="progress-bar" class="h-full w-0 rounded-full bg-cyan-400 transition-all"></div>
            </div>
            <div id="progress-text" class="mt-3 text-sm text-slate-400">0 / 100</div>

            <form id="answer-form" class="mt-8 hidden space-y-4">
              <div id="question-list" class="space-y-4"></div>
              <div class="flex flex-wrap gap-3">
                <button type="submit" class="rounded-xl bg-cyan-400 px-5 py-3 font-medium text-slate-950 transition hover:bg-cyan-300">
                  保存回答并获取下一组问题
                </button>
                <button id="generate-btn" type="button" class="rounded-xl border border-slate-700 px-5 py-3 font-medium text-slate-100 transition hover:border-cyan-400">
                  生成 HUMAN.md
                </button>
              </div>
            </form>
          </div>

          <aside class="rounded-3xl border border-slate-400/20 bg-slate-900/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur-lg lg:p-8">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-xs uppercase tracking-[0.2em] text-slate-500">Output</div>
                <h2 class="mt-2 text-2xl font-semibold">HUMAN.md</h2>
              </div>
              <button id="export-btn" type="button" class="hidden rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:border-cyan-400">
                导出 Markdown
              </button>
            </div>
            <textarea id="human-markdown" readonly rows={28} class="mt-6 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-4 font-mono text-sm leading-7 text-slate-200 outline-none" placeholder="完成访谈后，这里会出现 HUMAN.md"></textarea>
          </aside>
        </section>

        <script src="/public/app.js"></script>
      </main>
    )
  );
});

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

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: error.message || "服务器异常" }, 500);
});

export default {
  port: env.port,
  fetch: app.fetch
};
