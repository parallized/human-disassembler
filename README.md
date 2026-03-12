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
- `PORT`：默认 `3000`

如果未配置 API Key，应用仍然可以运行，但会退化为：

- 使用预设顺序继续提问
- 用本地截断文本代替 AI 摘要
- 使用兜底模板生成 `SELF-ARCHIVE.md`

## 开发

```bash
bun install
bun run dev
```

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
