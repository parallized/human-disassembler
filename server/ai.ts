import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvolvedProfile, ProfileDimension, ProfileGuess } from "../shared/types";
import { env } from "./config";

type CompletedCategoryInput = {
  categoryId: string;
  categoryTitle: string;
  categoryDescription: string;
  completedAt: string;
  qaPairs: Array<{
    questionId: string;
    prompt: string;
    answer: string;
    summary: string;
    answeredAt: string;
  }>;
};

type AnalyzeProfileInput = {
  userName: string;
  focus?: string;
  updatedAt: string;
  completedCategories: CompletedCategoryInput[];
  previousProfile?: EvolvedProfile;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type AiCallMeta = {
  purpose: string;
};

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

const logsDir = join(process.cwd(), "data", "logs");

const writeAiLog = async (payload: Record<string, unknown>) => {
  await mkdir(logsDir, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  await writeFile(join(logsDir, fileName), JSON.stringify(payload, null, 2), "utf8");
};

const callChatCompletion = async (messages: ChatMessage[], meta: AiCallMeta) => {
  if (!env.apiKey) {
    await writeAiLog({
      kind: "ai-call",
      purpose: meta.purpose,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      request: {
        model: env.model,
        temperature: 0.4,
        messages
      },
      response: {
        skipped: true,
        reason: "missing_api_key"
      },
      ok: false
    }).catch(() => undefined);
    return null;
  }

  const startedAt = new Date().toISOString();
  const requestPayload = {
    model: env.model,
    temperature: 0.4,
    messages
  };

  let responseStatus: number | null = null;
  let responseStatusText: string | null = null;

  try {
    const response = await fetch(`${env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`
      },
      body: JSON.stringify(requestPayload)
    });

    responseStatus = response.status;
    responseStatusText = response.statusText;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      await writeAiLog({
        kind: "ai-call",
        purpose: meta.purpose,
        startedAt,
        finishedAt: new Date().toISOString(),
        request: requestPayload,
        response: {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        },
        ok: false
      });

      throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim() ?? null;

    await writeAiLog({
      kind: "ai-call",
      purpose: meta.purpose,
      startedAt,
      finishedAt: new Date().toISOString(),
      request: requestPayload,
      response: {
        status: response.status,
        statusText: response.statusText,
        body: payload,
        content
      },
      ok: true
    });

    return content;
  } catch (error) {
    if (responseStatus === null) {
      await writeAiLog({
        kind: "ai-call",
        purpose: meta.purpose,
        startedAt,
        finishedAt: new Date().toISOString(),
        request: requestPayload,
        response: {
          status: responseStatus,
          statusText: responseStatusText,
          error: error instanceof Error ? error.message : String(error)
        },
        ok: false
      }).catch(() => undefined);
    }

    throw error;
  }
};

const sliceText = (text: string, maxLength: number) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 1, 0))}…`;
};

const sanitizeStringList = (value: unknown, fallback: string[] = []) => {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return cleaned.length > 0 ? cleaned : fallback;
};

const sanitizeConfidence = (value: unknown): ProfileGuess["confidence"] => {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
};

const buildUnknownGuess = (label: string): ProfileGuess => ({
  code: "unknown",
  label,
  confidence: "low",
  rationale: "当前样本仍不足以稳定猜测，保留为待确认。"
});

const sanitizeGuess = (value: unknown, fallbackLabel: string): ProfileGuess => {
  if (!value || typeof value !== "object") {
    return buildUnknownGuess(fallbackLabel);
  }

  const candidate = value as Partial<ProfileGuess>;

  return {
    code: typeof candidate.code === "string" && candidate.code.trim().length > 0 ? candidate.code.trim() : "unknown",
    label:
      typeof candidate.label === "string" && candidate.label.trim().length > 0
        ? candidate.label.trim()
        : fallbackLabel,
    confidence: sanitizeConfidence(candidate.confidence),
    rationale:
      typeof candidate.rationale === "string" && candidate.rationale.trim().length > 0
        ? candidate.rationale.trim()
        : "当前样本仍不足以稳定猜测，保留为待确认。"
  };
};

const buildFallbackDimension = (category: CompletedCategoryInput, updatedAt: string): ProfileDimension => {
  const evidence = category.qaPairs
    .slice(0, 2)
    .map((item) => `${item.prompt}：${sliceText(item.answer, 72)}`);
  const signals = category.qaPairs
    .map((item) => sliceText(item.summary || item.answer, 42))
    .filter((item) => item.length > 0)
    .slice(0, 3);

  return {
    categoryId: category.categoryId,
    categoryTitle: category.categoryTitle,
    completedAt: category.completedAt,
    updatedAt,
    summary:
      signals[0] ?? `${category.categoryTitle}维度已完成，当前可以看到一些稳定但仍待更多样本确认的模式。`,
    signals,
    evidence
  };
};

export const summarizeAnswer = async (input: { prompt: string; answer: string }) => {
  const fallback = input.answer.replace(/\s+/g, " ").trim().slice(0, 180) || "暂无可用摘要。";

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
    ], { purpose: "summarize-answer" });

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
    ], { purpose: "pick-next-question-ids" });

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

export const analyzeProfileEvolution = async (input: AnalyzeProfileInput): Promise<EvolvedProfile> => {
  const fallbackDimensions = input.completedCategories.map((category) => {
    const previousDimension = input.previousProfile?.dimensions.find(
      (dimension) => dimension.categoryId === category.categoryId
    );
    const dimension = buildFallbackDimension(category, input.updatedAt);

    return {
      ...dimension,
      completedAt: previousDimension?.completedAt ?? dimension.completedAt
    };
  });

  const fallbackProfile: EvolvedProfile = {
    updatedAt: input.updatedAt,
    completedCategoryIds: input.completedCategories.map((category) => category.categoryId),
    overview:
      input.completedCategories.length === 0
        ? "画像尚未形成。"
        : `已基于 ${input.completedCategories.length} 个已完成分类生成阶段性画像，后续会随着更多分类完成继续进化。`,
    strengths: fallbackDimensions.map((dimension) => dimension.summary).slice(0, 3),
    growthEdges: ["继续完成更多分类，以提高人格与关系判断的稳定度。"],
    blindSpots: ["当前结论基于有限样本，应视为动态假设而非定论。"],
    dimensions: fallbackDimensions,
    mbtiGuess: buildUnknownGuess("待确认"),
    enneagramGuess: buildUnknownGuess("待确认"),
    attachmentGuess: buildUnknownGuess("待确认")
  };

  if (!env.apiKey || input.completedCategories.length === 0) {
    return fallbackProfile;
  }

  try {
    const content = await callChatCompletion([
      {
        role: "system",
        content: [
          "你是一个人物画像进化助手。",
          "每当用户完成一个问题分类后，你需要基于所有已完成分类的问答，更新阶段性用户画像。",
          "输出必须是 JSON，不要输出 Markdown。",
          "所有结论要克制、可解释、保留不确定性，不要把猜测说成事实。",
          "请输出字段：overview、strengths、growthEdges、blindSpots、dimensions、mbtiGuess、enneagramGuess、attachmentGuess。",
          "dimensions 每项字段：categoryId、summary、signals、evidence。",
          "guess 字段结构：code、label、confidence(low|medium|high)、rationale。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            userName: input.userName,
            focus: input.focus ?? "",
            updatedAt: input.updatedAt,
            previousProfile: input.previousProfile ?? null,
            completedCategories: input.completedCategories
          },
          null,
          2
        )
      }
    ], { purpose: "analyze-profile-evolution" });

    const parsed = content
      ? parseJsonFromText<{
          overview?: string;
          strengths?: string[];
          growthEdges?: string[];
          blindSpots?: string[];
          dimensions?: Array<{
            categoryId?: string;
            summary?: string;
            signals?: string[];
            evidence?: string[];
          }>;
          mbtiGuess?: unknown;
          enneagramGuess?: unknown;
          attachmentGuess?: unknown;
        }>(content)
      : null;

    if (!parsed) {
      return fallbackProfile;
    }

    const dimensions: ProfileDimension[] = input.completedCategories.map((category) => {
      const previousDimension = input.previousProfile?.dimensions.find(
        (dimension) => dimension.categoryId === category.categoryId
      );
      const fallbackDimension = buildFallbackDimension(category, input.updatedAt);
      const parsedDimension = parsed.dimensions?.find((dimension) => dimension.categoryId === category.categoryId);

      return {
        categoryId: category.categoryId,
        categoryTitle: category.categoryTitle,
        completedAt: previousDimension?.completedAt ?? category.completedAt,
        updatedAt: input.updatedAt,
        summary: typeof parsedDimension?.summary === "string" && parsedDimension.summary.trim().length > 0
          ? parsedDimension.summary.trim()
          : fallbackDimension.summary,
        signals: sanitizeStringList(parsedDimension?.signals, fallbackDimension.signals).slice(0, 5),
        evidence: sanitizeStringList(parsedDimension?.evidence, fallbackDimension.evidence).slice(0, 5)
      };
    });

    return {
      updatedAt: input.updatedAt,
      completedCategoryIds: input.completedCategories.map((category) => category.categoryId),
      overview:
        typeof parsed.overview === "string" && parsed.overview.trim().length > 0
          ? parsed.overview.trim()
          : fallbackProfile.overview,
      strengths: sanitizeStringList(parsed.strengths, fallbackProfile.strengths).slice(0, 5),
      growthEdges: sanitizeStringList(parsed.growthEdges, fallbackProfile.growthEdges).slice(0, 5),
      blindSpots: sanitizeStringList(parsed.blindSpots, fallbackProfile.blindSpots).slice(0, 5),
      dimensions,
      mbtiGuess: sanitizeGuess(parsed.mbtiGuess, "待确认"),
      enneagramGuess: sanitizeGuess(parsed.enneagramGuess, "待确认"),
      attachmentGuess: sanitizeGuess(parsed.attachmentGuess, "待确认")
    };
  } catch {
    return fallbackProfile;
  }
};

export const generateHumanMarkdown = async (input: {
  userName: string;
  focus?: string;
  qaPairs: Array<{ prompt: string; answer: string; summary: string }>;
  updatedAt: string;
  evolvedProfile?: EvolvedProfile;
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
    "### 3. Stage Profile（阶段画像）",
    `- 总览：${input.evolvedProfile?.overview || "待更多问答后生成。"}`,
    ...(input.evolvedProfile?.strengths ?? []).slice(0, 3).map((item) => `- 优势：${item}`),
    ...(input.evolvedProfile?.growthEdges ?? []).slice(0, 3).map((item) => `- 成长边缘：${item}`),
    "### 4. AI 协作建议",
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
            qaPairs: input.qaPairs,
            evolvedProfile: input.evolvedProfile ?? null
          },
          null,
          2
        )
      }
    ], { purpose: "generate-human-markdown" });

    return content || fallbackSections.join("\n");
  } catch {
    return fallbackSections.join("\n");
  }
};

export const isAiConfigured = () => Boolean(env.apiKey);
