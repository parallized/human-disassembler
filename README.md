# AI, Remember Me

一个基于 Bun + TypeScript + React Router Framework + UnoCSS 的自我访谈应用：

- 内置 100 个按主题组织的深度问题
- 保存每次原始回答，并生成 AI 摘要
- 通过 `https://ai.huan666.de/v1/chat/completions` 接入兼容模型
- 最终整理并导出一份可长期复用的 `SELF-ARCHIVE.md`

## 环境变量

复制 `.env.example` 并填写：

- `HUAN666_API_KEY`：兼容 OpenAI 接口的 API Key
- `HUAN666_BASE_URL`：默认 `https://ai.huan666.de/v1`
- `AI_MODEL`：默认 `grok-4.20-beta`
- `PORT`：默认 `3333`

如果未配置 API Key，应用仍然可以运行，但会退化为：

- 使用预设顺序继续提问
- 用本地截断文本代替 AI 摘要
- 使用兜底模板生成 `SELF-ARCHIVE.md`

## 开发

```bash
bun install
bun run dev
```

`bun run dev` 现在直接启动 React Router 的 SSR 开发服务器；开发时访问 `http://localhost:3333`（或你在 `.env` 里配置的 `PORT`）。

当前开发模式为单端口 SSR：页面渲染、前端 HMR 与 `/api/*` resource routes 都由现成框架统一托管，不再依赖手工拼装的 Hono + 自定义 Vite SSR 管线。

## 构建与运行

```bash
bun run build
bun run start
```

生产构建会输出到 `build/client` 与 `build/server`。

## 校验

```bash
bun run check
```

## 数据存储

会话数据会写入 `data/sessions/*.json`，内容包括：

- 100 个问题的回答进度
- 每条回答对应的 AI 摘要
- 当前待回答的问题批次
- 最终生成的 `SELF-ARCHIVE.md`
