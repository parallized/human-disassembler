import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_MAP } from "../shared/questions";
import { PROFILE_DIMENSION_IDS, type EvolvedProfile, type ProfileDimensionId, type ProfileGuess } from "../shared/types";
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

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type AiCallMeta = {
  purpose: string;
  temperature?: number;
};

const logsDir = join(process.cwd(), "data", "logs");

const writeAiLog = async (payload: Record<string, unknown>) => {
  await mkdir(logsDir, { recursive: true });
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
  await writeFile(join(logsDir, fileName), JSON.stringify(payload, null, 2), "utf8");
};

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

const sanitizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const callChatCompletion = async (messages: ChatMessage[], meta: AiCallMeta) => {
  const temperature = meta.temperature ?? 0.2;

  if (!env.apiKey) {
    await writeAiLog({
      kind: "ai-call",
      purpose: meta.purpose,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      request: {
        model: env.model,
        temperature,
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
    temperature,
    messages
  };

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
      });

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
    });

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

const guessSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string().min(1)
}).strict();

const dimensionSchema = z.object({
  categoryId: z.enum(PROFILE_DIMENSION_IDS),
  categoryTitle: z.string().min(1),
  categoryDescription: z.string().min(1),
  status: z.enum(["pending", "completed"]),
  completedAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1),
  analysis: z.string().min(1),
  evidence: z.array(z.string().min(1)).max(6)
}).strict();

const evolvedProfileSchema = z.object({
  updatedAt: z.string().min(1),
  dimensions: z.array(dimensionSchema).length(PROFILE_DIMENSION_IDS.length),
  mbtiGuess: guessSchema,
  enneagramGuess: guessSchema
}).strict();

const validateAnalyzedProfile = (profile: EvolvedProfile, input: AnalyzeProfileInput) => {
  const completedCategoryIds = new Set(input.completedCategories.map((category) => category.categoryId));

  if (profile.dimensions.length !== PROFILE_DIMENSION_IDS.length) {
    throw new Error("AI returned an incomplete dimensions list");
  }

  for (const [index, expectedId] of PROFILE_DIMENSION_IDS.entries()) {
    const dimension = profile.dimensions[index];
    const category = QUESTION_CATEGORY_MAP.get(expectedId);

    if (!dimension || dimension.categoryId !== expectedId) {
      throw new Error(`AI returned an invalid dimensions order at index ${index}`);
    }

    if (!category || dimension.categoryTitle !== category.title || dimension.categoryDescription !== category.description) {
      throw new Error(`AI returned invalid category metadata for ${expectedId}`);
    }

    if (completedCategoryIds.has(expectedId)) {
      if (dimension.status !== "completed") {
        throw new Error(`AI must mark ${expectedId} as completed`);
      }

      if (!dimension.completedAt) {
        throw new Error(`AI must include completedAt for ${expectedId}`);
      }

      if (dimension.evidence.length === 0) {
        throw new Error(`AI must include evidence for completed dimension ${expectedId}`);
      }
    } else if (dimension.status !== "pending") {
      throw new Error(`AI must mark ${expectedId} as pending`);
    }
  }
};

export const isAiConfigured = () => Boolean(env.apiKey);

export const analyzeProfileEvolution = async (input: AnalyzeProfileInput): Promise<EvolvedProfile> => {
  const requiredDimensions = QUESTION_CATEGORIES.map((category) => ({
    categoryId: category.id,
    categoryTitle: category.title,
    categoryDescription: category.description,
    requiredStatus: input.completedCategories.some((item) => item.categoryId === category.id) ? "completed" : "pending"
  }));

  const content = await callChatCompletion(
    [
      {
        role: "system",
        content: [
          "你是一个中文人格访谈分析助手。",
          "你每次只能基于用户已经完成的题组问答与上一版侧边栏数据，输出一份完整的右侧栏 JSON。",
          "输出必须是单个 JSON 对象，不要输出 Markdown，不要输出代码块，不要解释。",
          "右侧栏严格只包含 10 个维度、MBTI、九型人格。不要输出 overview、strengths、growthEdges、attachment 或任何额外字段。",
          "dimensions 必须严格按给定 requiredDimensions 的顺序返回 10 项。",
          "每个 dimension 必须包含字段：categoryId、categoryTitle、categoryDescription、status、completedAt（仅 completed 时需要）、updatedAt、analysis、evidence。",
          "已完成维度可以结合本维度问答给出分析；未完成维度必须保持克制，不要臆测，只能写成待完成状态下的谨慎描述。",
          "evidence 必须是从已完成维度问答中提炼的简短证据点，不要捏造。",
          "MBTI 和九型人格都必须返回 code、label、confidence、rationale。",
          "如果证据不足，请用 low 置信度并在 rationale 里明确说明仍待更多题组。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            userName: input.userName,
            focus: input.focus ?? "",
            updatedAt: input.updatedAt,
            completedCategories: input.completedCategories,
            previousProfile: input.previousProfile ?? null,
            requiredDimensions
          },
          null,
          2
        )
      }
    ],
    { purpose: "analyze-profile-evolution", temperature: 0.2 }
  );

  if (!content) {
    throw new Error("AI service is not configured");
  }

  const parsed = parseJsonFromText<unknown>(content);
  if (!parsed) {
    throw new Error("AI did not return valid JSON");
  }

  const result = evolvedProfileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI returned invalid sidebar schema: ${result.error.issues[0]?.message ?? "unknown error"}`);
  }

  const normalized: EvolvedProfile = {
    ...result.data,
    updatedAt: sanitizeText(result.data.updatedAt),
    dimensions: result.data.dimensions.map((dimension) => ({
      ...dimension,
      categoryTitle: sanitizeText(dimension.categoryTitle),
      categoryDescription: sanitizeText(dimension.categoryDescription),
      analysis: sanitizeText(dimension.analysis),
      completedAt: dimension.completedAt ? sanitizeText(dimension.completedAt) : undefined,
      updatedAt: sanitizeText(dimension.updatedAt),
      evidence: dimension.evidence.map((item) => sanitizeText(item)).filter((item) => item.length > 0)
    })),
    mbtiGuess: {
      ...result.data.mbtiGuess,
      code: sanitizeText(result.data.mbtiGuess.code),
      label: sanitizeText(result.data.mbtiGuess.label),
      rationale: sanitizeText(result.data.mbtiGuess.rationale)
    },
    enneagramGuess: {
      ...result.data.enneagramGuess,
      code: sanitizeText(result.data.enneagramGuess.code),
      label: sanitizeText(result.data.enneagramGuess.label),
      rationale: sanitizeText(result.data.enneagramGuess.rationale)
    }
  };

  validateAnalyzedProfile(normalized, input);
  return normalized;
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
    "**使用方式**：将这份文档提供给 AI，作为理解你的长期上下文。",
    "### 1. Profile",
    `- 用户名/代号：${input.userName}`,
    `- 当前关注主题：${input.focus || "未填写"}`,
    `- 已完成问题数：${input.qaPairs.length}`,
    "### 2. Interview Highlights",
    ...input.qaPairs.slice(0, 12).map((item) => `- ${item.prompt}：${item.summary}`),
    "### 3. Sidebar Snapshot",
    ...completedDimensions.map((dimension) => `- ${dimension.categoryTitle}：${dimension.analysis}`),
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
            "请根据问答记录与右侧栏画像，输出一份清晰、克制、可复用的 HUMAN.md。",
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
