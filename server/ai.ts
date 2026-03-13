import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_MAP } from "../shared/questions";
import {
  PROFILE_DIMENSION_IDS,
  type EvolvedProfile,
  type ProfileDimension,
  type ProfileDimensionId,
  type ProfileGuess
} from "../shared/types";
import { env } from "./config";

type CompletedCategoryInput = {
  categoryId: ProfileDimensionId;
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

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AiCallMeta = {
  purpose: string;
  temperature?: number;
};

const logsDir = join(process.cwd(), "data", "logs");

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const sliceText = (value: string, maxLength: number) => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 1, 0))}…`;
};

const sanitizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeWhitespace(value);
};

const writeAiLog = async (payload: Record<string, unknown>) => {
  await mkdir(logsDir, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  await writeFile(join(logsDir, fileName), JSON.stringify(payload, null, 2), "utf8");
};

const parseJsonFromText = <T>(text: string): T | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? text).trim();

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

const callChatCompletion = async (messages: ChatMessage[], meta: AiCallMeta) => {
  const temperature = meta.temperature ?? 0.2;
  const startedAt = new Date().toISOString();
  const requestPayload = {
    model: env.model,
    temperature,
    messages
  };

  if (!env.apiKey) {
    await writeAiLog({
      kind: "ai-call",
      purpose: meta.purpose,
      startedAt,
      finishedAt: new Date().toISOString(),
      request: requestPayload,
      response: {
        skipped: true,
        reason: "missing_api_key"
      },
      ok: false
    }).catch(() => undefined);

    return null;
  }

  try {
    const response = await fetch(`${env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`
      },
      body: JSON.stringify(requestPayload)
    });

    const responseText = await response.text();
    if (!response.ok) {
      await writeAiLog({
        kind: "ai-call",
        purpose: meta.purpose,
        startedAt,
        finishedAt: new Date().toISOString(),
        request: requestPayload,
        response: {
          status: response.status,
          statusText: response.statusText,
          body: responseText
        },
        ok: false
      }).catch(() => undefined);

      throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
    }

    const payload = JSON.parse(responseText) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";

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
    }).catch(() => undefined);

    return content;
  } catch (error) {
    await writeAiLog({
      kind: "ai-call",
      purpose: meta.purpose,
      startedAt,
      finishedAt: new Date().toISOString(),
      request: requestPayload,
      response: {
        error: error instanceof Error ? error.message : String(error)
      },
      ok: false
    }).catch(() => undefined);

    throw error;
  }
};

const buildUnknownGuess = (label: string): ProfileGuess => ({
  code: "unknown",
  label,
  confidence: "low",
  rationale: "需要更多已完成维度后再判断。"
});

const sanitizeGuess = (guess: ProfileGuess, fallback: ProfileGuess = buildUnknownGuess("待确认")): ProfileGuess => ({
  code: sliceText(sanitizeText(guess.code) || fallback.code, 24),
  label: sliceText(sanitizeText(guess.label) || fallback.label, 64),
  confidence: guess.confidence,
  rationale: sliceText(sanitizeText(guess.rationale) || fallback.rationale, 240)
});

const guessSchema = z
  .object({
    code: z.string().min(1),
    label: z.string().min(1),
    confidence: z.enum(["low", "medium", "high"]),
    rationale: z.string().min(1)
  })
  .strict();

const dimensionSchema = z
  .object({
    categoryId: z.enum(PROFILE_DIMENSION_IDS),
    status: z.enum(["pending", "completed"]).optional(),
    summary: z.string().min(1),
    signals: z.array(z.string()).default([]),
    evidence: z.array(z.string()).default([])
  })
  .strict();

const evolvedProfileSchema = z
  .object({
    updatedAt: z.string().min(1),
    dimensions: z.array(dimensionSchema),
    mbtiGuess: guessSchema,
    enneagramGuess: guessSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.dimensions.map((dimension) => dimension.categoryId);
    if (new Set(ids).size !== PROFILE_DIMENSION_IDS.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dimensions must contain all 10 unique categoryId values"
      });
    }
  });

const buildCompletedFallbackDimension = (
  category: CompletedCategoryInput,
  updatedAt: string
): ProfileDimension => {
  const summary = "该维度已完成，等待 AI 在后台补全分析。";

  return {
    categoryId: category.categoryId,
    categoryTitle: category.categoryTitle,
    categoryDescription: category.categoryDescription,
    status: "completed",
    completedAt: category.completedAt,
    updatedAt,
    summary,
    analysis: summary,
    signals: [],
    evidence: []
  };
};

export const createEmptyEvolvedProfile = (
  updatedAt: string,
  completedCategoryIds: Set<ProfileDimensionId> = new Set(),
  completedCategories: CompletedCategoryInput[] = []
): EvolvedProfile => {
  const completedCategoryMap = new Map(completedCategories.map((category) => [category.categoryId, category] as const));

  return {
    updatedAt,
    dimensions: PROFILE_DIMENSION_IDS.map((categoryId) => {
      const category = QUESTION_CATEGORY_MAP.get(categoryId);
      const completedCategory = completedCategoryMap.get(categoryId);
      if (completedCategory) {
        return buildCompletedFallbackDimension(completedCategory, updatedAt);
      }

      const isCompleted = completedCategoryIds.has(categoryId);
      const summary = isCompleted
        ? "该维度已完成，等待 AI 在后台补全分析。"
        : "完成该维度问答后，这里会显示总结。";

      return {
        categoryId,
        categoryTitle: category?.title,
        categoryDescription: category?.description,
        status: isCompleted ? "completed" : "pending",
        completedAt: isCompleted ? updatedAt : undefined,
        updatedAt,
        summary,
        analysis: summary,
        signals: [],
        evidence: []
      };
    }),
    mbtiGuess: buildUnknownGuess("待确认"),
    enneagramGuess: buildUnknownGuess("待确认")
  };
};

export const summarizeAnswer = (input: { prompt: string; answer: string }) => {
  void input.prompt;
  return sliceText(input.answer, 160);
};

const validateAnalyzedProfile = (profile: EvolvedProfile, input: AnalyzeProfileInput) => {
  const categoryIds = profile.dimensions.map((dimension) => dimension.categoryId);
  if (new Set(categoryIds).size !== PROFILE_DIMENSION_IDS.length) {
    throw new Error("AI returned duplicate categoryId values");
  }

  for (const completedCategory of input.completedCategories) {
    const dimension = profile.dimensions.find((item) => item.categoryId === completedCategory.categoryId);
    if (!dimension || dimension.status !== "completed") {
      throw new Error(`AI did not keep completed dimension: ${completedCategory.categoryId}`);
    }
  }
};

export const isAiConfigured = () => Boolean(env.apiKey);

export const analyzeProfileEvolution = async (input: AnalyzeProfileInput): Promise<EvolvedProfile> => {
  const completedCategoryIds = new Set(input.completedCategories.map((category) => category.categoryId));
  const fallbackProfile = createEmptyEvolvedProfile(input.updatedAt, completedCategoryIds, input.completedCategories);

  if (!env.apiKey) {
    return fallbackProfile;
  }

  try {
    const content = await callChatCompletion(
      [
        {
          role: "system",
          content: [
            "你是一个谨慎的中文人格画像分析助手。",
            "请基于已完成题组的问答摘要，返回严格 JSON，不要返回 Markdown。",
            "返回对象必须包含 updatedAt、dimensions、mbtiGuess、enneagramGuess。",
            `dimensions 必须包含全部 10 个维度，categoryId 只能是：${PROFILE_DIMENSION_IDS.join(", ")}。`,
            "每个 dimension 必须包含 categoryId、status、summary、signals、evidence。",
            "signals 是简短洞察关键词或行为模式，evidence 是来自问答的简短证据点。",
            "未完成维度只能给 pending；已完成维度给 completed。",
            "MBTI 和九型人格都必须返回 code、label、confidence、rationale。",
            "如果证据不足，请使用 low 置信度，并明确说明仍待更多题组。"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              userName: input.userName,
              focus: input.focus ?? "",
              updatedAt: input.updatedAt,
              categories: QUESTION_CATEGORIES.map((category) => ({
                categoryId: category.id,
                title: category.title,
                description: category.description
              })),
              completedCategories: input.completedCategories,
              previousProfile: input.previousProfile ?? null
            },
            null,
            2
          )
        }
      ],
      { purpose: "analyze-profile-evolution", temperature: 0.2 }
    );

    if (!content) {
      return fallbackProfile;
    }

    const parsed = parseJsonFromText<unknown>(content);
    if (!parsed) {
      throw new Error("AI did not return valid JSON");
    }

    const result = evolvedProfileSchema.safeParse(parsed);
    if (!result.success) {
      await writeAiLog({
        kind: "ai-parse-error",
        purpose: "analyze-profile-evolution",
        happenedAt: new Date().toISOString(),
        raw: content,
        issues: result.error.issues
      }).catch(() => undefined);
      return fallbackProfile;
    }

    const parsedDimensionMap = new Map(result.data.dimensions.map((dimension) => [dimension.categoryId, dimension] as const));
    const completedCategoryMap = new Map(input.completedCategories.map((category) => [category.categoryId, category] as const));

    const normalized: EvolvedProfile = {
      updatedAt: sliceText(sanitizeText(result.data.updatedAt) || input.updatedAt, 64),
      dimensions: PROFILE_DIMENSION_IDS.map((categoryId) => {
        const parsedDimension = parsedDimensionMap.get(categoryId);
        const completedCategory = completedCategoryMap.get(categoryId);
        const fallbackDimension = fallbackProfile.dimensions.find((dimension) => dimension.categoryId === categoryId)!;
        const category = QUESTION_CATEGORY_MAP.get(categoryId);

        if (!parsedDimension) {
          return fallbackDimension;
        }

        const signals = parsedDimension.signals
          .map((item) => sliceText(sanitizeText(item), 120))
          .filter((item) => item.length > 0)
          .slice(0, 5);

        const evidence = parsedDimension.evidence
          .map((item) => sliceText(sanitizeText(item), 160))
          .filter((item) => item.length > 0)
          .slice(0, 5);

        const status = completedCategoryIds.has(categoryId) || parsedDimension.status === "completed" ? "completed" : "pending";
        const summary = sliceText(sanitizeText(parsedDimension.summary) || fallbackDimension.summary, 240);

        return {
          categoryId,
          categoryTitle: completedCategory?.categoryTitle ?? category?.title ?? fallbackDimension.categoryTitle,
          categoryDescription:
            completedCategory?.categoryDescription ?? category?.description ?? fallbackDimension.categoryDescription,
          status,
          completedAt: status === "completed" ? completedCategory?.completedAt ?? fallbackDimension.completedAt ?? input.updatedAt : undefined,
          updatedAt: input.updatedAt,
          summary,
          analysis: summary,
          signals: signals.length > 0 ? signals : fallbackDimension.signals,
          evidence: evidence.length > 0 ? evidence : fallbackDimension.evidence
        };
      }),
      mbtiGuess: sanitizeGuess(result.data.mbtiGuess, fallbackProfile.mbtiGuess),
      enneagramGuess: sanitizeGuess(result.data.enneagramGuess, fallbackProfile.enneagramGuess)
    };

    validateAnalyzedProfile(normalized, input);
    return normalized;
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
  const completedDimensions = (input.evolvedProfile?.dimensions ?? []).filter((dimension) => dimension.status === "completed");
  const fallbackSections = [
    "# HUMAN.md - 自我档案 v1.0",
    `## 更新时间：${input.updatedAt.slice(0, 10)}`,
    "**使用方式**：把这份文档提供给 AI，作为理解你的长期上下文。",
    "### 1. Profile",
    `- 用户名 / 代号：${input.userName}`,
    `- 当前关注主题：${input.focus || "未填写"}`,
    `- 已完成问题数：${input.qaPairs.length}`,
    "### 2. Interview Highlights",
    ...input.qaPairs.slice(0, 12).map((item) => `- ${item.prompt}：${item.summary}`),
    "### 3. Profile Snapshot",
    ...completedDimensions.map(
      (dimension) => `- ${QUESTION_CATEGORY_MAP.get(dimension.categoryId)?.title ?? dimension.categoryId}：${dimension.summary}`
    ),
    `- MBTI：${input.evolvedProfile?.mbtiGuess.label ?? buildUnknownGuess("待确认").label}`,
    `- 九型人格：${input.evolvedProfile?.enneagramGuess.label ?? buildUnknownGuess("待确认").label}`,
    "### 4. AI Collaboration Notes",
    "- 回答时优先结合这份档案中的长期偏好与表达习惯。",
    "- 信息不足时先澄清，再给建议。"
  ];

  if (!env.apiKey) {
    return fallbackSections.join("\n");
  }

  try {
    const content = await callChatCompletion(
      [
        {
          role: "system",
          content: [
            "你是一个擅长把人物访谈整理成长期 AI 上下文文档的中文助手。",
            "请根据问答记录与当前画像，输出一份清晰、克制、可复用的 HUMAN.md。",
            "输出必须是 Markdown。",
            "不要虚构未被提及的信息；不确定时明确写出待确认。"
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
      ],
      { purpose: "generate-human-markdown", temperature: 0.3 }
    );

    return content || fallbackSections.join("\n");
  } catch {
    return fallbackSections.join("\n");
  }
};
