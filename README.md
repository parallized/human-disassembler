# AI, Remember Me

一个基于 Bun + TypeScript + Hono + UnoCSS 的自我访谈应用：

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

`bun run dev` 会一次性启动服务端与 Vite 开发环境；开发时直接访问 `http://localhost:3333`（或你在 `.env` 里配置的 `PORT`），不需要先手动执行前端 build。

当前开发模式为单端口：Vite 直接托管 Hono 应用，SSR 页面、前端 HMR 与 `/api/*` 都走同一个 `PORT`，不再额外占用 `5173` 做浏览器访问入口。

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
