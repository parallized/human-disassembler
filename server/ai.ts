import { env } from "./config";

const systemSummaryPrompt = [
  "你是一个擅长做人物访谈归纳的中文助手。",
  "请根据用户的原始回答提炼关键信息，保留真实语气与具体细节。",
  "输出简洁自然；避免说教、避免编造结论。"
].join("\n");

const parseJsonFromText = <T>(text: string): T | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }

    return null;
  }
};

const callChatCompletion = async (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => {
  if (!env.apiKey) {
    return null;
  }

  const response = await fetch(`${env.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`
    },
    body: JSON.stringify({
      model: env.model,
      temperature: 0.4,
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return payload.choices?.[0]?.message?.content?.trim() ?? null;
};

export const summarizeAnswer = async (input: { prompt: string; answer: string }) => {
  const fallback = input.answer
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "暂无可用摘要。";

  try {
    const content = await callChatCompletion([
      { role: "system", content: systemSummaryPrompt },
      {
        role: "user",
        content: [
          "请将下面这段回答总结成 1 到 2 句话。",
          "尽量保留用户原意、具体信息和情绪线索，不要拔高。",
          `问题：${input.prompt}`,
          `回答：${input.answer}`
        ].join("\n")
      }
    ]);

    return content || fallback;
  } catch {
    return fallback;
  }
};

export const pickNextQuestionIds = async (input: {
  remainingQuestions: Array<{ id: string; categoryId: string; prompt: string }>;
  previousSummaries: string[];
  focus?: string;
  batchSize: number;
}) => {
  const fallback = input.remainingQuestions.slice(0, input.batchSize).map((question) => question.id);

  if (!env.apiKey || input.remainingQuestions.length <= input.batchSize) {
    return fallback;
  }

  try {
    const content = await callChatCompletion([
      {
        role: "system",
        content: [
          "你是一个访谈编排助手。",
          "请根据用户已经回答过的摘要与当前关注主题，挑选下一组更相关的问题。",
          "要求：问题不能重复，优先保持主题连贯，同时覆盖不同维度。",
          '只返回 JSON：{"questionIds":["id1","id2"]}'
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            focus: input.focus ?? "",
            batchSize: input.batchSize,
            previousSummaries: input.previousSummaries.slice(-12),
            candidates: input.remainingQuestions.map((question) => ({
              id: question.id,
              categoryId: question.categoryId,
              prompt: question.prompt
            }))
          },
          null,
          2
        )
      }
    ]);

    const parsed = content ? parseJsonFromText<{ questionIds?: string[] }>(content) : null;
    const picked = (parsed?.questionIds ?? []).filter((id) =>
      input.remainingQuestions.some((question) => question.id === id)
    );

    if (picked.length === 0) {
      return fallback;
    }

    return Array.from(new Set(picked)).slice(0, input.batchSize);
  } catch {
    return fallback;
  }
};

export const generateHumanMarkdown = async (input: {
  userName: string;
  focus?: string;
  qaPairs: Array<{ prompt: string; answer: string; summary: string }>;
  updatedAt: string;
}) => {
  const fallbackSections = [
    "# HUMAN.md - 自我档案 v1.0",
    `## 更新时间：${input.updatedAt.slice(0, 10)}`,
    "**使用方式**：将这份文档提供给 AI（如 Grok、Claude、ChatGPT、Cursor），作为‘理解我是谁、我如何思考、我目前在意什么’的长期上下文。",
    "### 1. Profile（基本资料 + 当前关注）",
    `- 用户名/代号：${input.userName}`,
    `- 当前关注主题：${input.focus || "未填写"}`,
    `- 已完成问题数：${input.qaPairs.length}`,
    "- 资料来源：基于多轮自我访谈整理而成",
    "### 2. Interview Highlights（访谈摘要）",
    ...input.qaPairs.slice(0, 12).map((item) => `- ${item.prompt}：${item.summary}`),
    "### 3. AI 协作建议",
    "- 回应时优先结合这份档案中的长期偏好与表达习惯",
    "- 识别潜在优势与盲点，但不要武断贴标签",
    "- 当信息不足时，先提问澄清，再给建议"
  ];

  if (!env.apiKey) {
    return fallbackSections.join("\n");
  }

  try {
    const content = await callChatCompletion([
      {
        role: "system",
        content: [
          "你是一个擅长把人物访谈整理成长期 AI 上下文文档的中文助手。",
          "请根据最多 100 个问题的问答记录，输出一份清晰、克制、可复用的 HUMAN.md。",
          "输出必须是 Markdown。",
          "不要虚构未被提及的信息；不确定时可明确写出‘待确认’。",
          "建议包含这些章节：Profile、Core Values & Routines、Talent、Weakness、Growth、Cognitive & Learning Style、Relationships、Current Objectives、AI Collaboration Notes。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            userName: input.userName,
            focus: input.focus ?? "",
            updatedAt: input.updatedAt,
            qaPairs: input.qaPairs
          },
          null,
          2
        )
      }
    ]);

    return content || fallbackSections.join("\n");
  } catch {
    return fallbackSections.join("\n");
  }
};

export const isAiConfigured = () => Boolean(env.apiKey);
