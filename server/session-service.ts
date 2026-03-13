import { randomUUID } from "node:crypto";
import { QUESTION_CATEGORY_MAP, QUESTION_MAP, QUESTIONS, TOTAL_QUESTIONS } from "../shared/questions";
import {
  PROFILE_DIMENSION_IDS,
  type AnswerRecord,
  type InterviewSession,
  type ProfileDimensionId,
  type ProfileGuess,
  type Question,
  type SessionSnapshot
} from "../shared/types";
import {
  analyzeProfileEvolution,
  createEmptyEvolvedProfile,
  generateHumanMarkdown,
  isAiConfigured,
  summarizeAnswer
} from "./ai";
import { loadSession, saveSession } from "./storage";

type AnswerInput = {
  questionId: string;
  answer: string;
};

type ProgressInput = {
  currentQuestionIndex?: number;
  draftAnswers?: Record<string, string>;
};

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

const BROKEN_TEXT_PATTERN = /[\u00C0-\u024F\uFFFD]/;

const hasBrokenText = (value: unknown): value is string => {
  return (
    typeof value === "string" &&
    (BROKEN_TEXT_PATTERN.test(value) || /\?{3,}/.test(value) || /[\u0000-\u001f]/.test(value))
  );
};

const pickText = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = candidate.trim();
    if (!normalized || hasBrokenText(normalized)) {
      continue;
    }

    return normalized;
  }

  return undefined;
};

const sanitizeGuess = (value: unknown, fallback: ProfileGuess): ProfileGuess => {
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const guess = value as Partial<ProfileGuess>;
  return {
    code: pickText(guess.code, fallback.code) ?? fallback.code,
    label: pickText(guess.label, fallback.label) ?? fallback.label,
    confidence:
      guess.confidence === "low" || guess.confidence === "medium" || guess.confidence === "high"
        ? guess.confidence
        : fallback.confidence,
    rationale: pickText(guess.rationale, fallback.rationale) ?? fallback.rationale
  };
};

const normalizeProfileAnalysis = (session: InterviewSession) => {
  const analysis = session.profileAnalysis as
    | (InterviewSession["profileAnalysis"] & { requestedAt?: string; status?: string })
    | undefined;

  if (!analysis) {
    return undefined;
  }

  const startedAt = analysis.startedAt ?? analysis.requestedAt ?? session.updatedAt;
  const status =
    analysis.status === "queued" || analysis.status === "running"
      ? "pending"
      : analysis.status === "completed" || analysis.status === "failed" || analysis.status === "pending"
        ? analysis.status
        : "pending";

  return {
    requestId: pickText(analysis.requestId) ?? randomUUID(),
    status,
    targetCategoryId: analysis.targetCategoryId,
    startedAt,
    finishedAt: analysis.finishedAt,
    error: pickText(analysis.error)
  };
};

const normalizeEvolvedProfile = (session: InterviewSession) => {
  const completedCategories = buildCompletedCategories(session, session.updatedAt);
  const completedCategoryMap = new Map(completedCategories.map((category) => [category.categoryId, category] as const));
  const completedCategoryIds = new Set(completedCategories.map((category) => category.categoryId));
  const fallbackProfile = createEmptyEvolvedProfile(session.updatedAt, completedCategoryIds, completedCategories);
  const currentProfile = session.evolvedProfile as
    | (InterviewSession["evolvedProfile"] & {
        dimensions?: Array<{
          categoryId?: string;
          status?: string;
          completedAt?: string;
          updatedAt?: string;
          summary?: string;
          analysis?: string;
          signals?: unknown;
          evidence?: unknown;
        }>;
      })
    | undefined;

  if (!currentProfile || !Array.isArray(currentProfile.dimensions)) {
    return fallbackProfile;
  }

  const dimensionEntries = currentProfile.dimensions
    .map((dimension) => {
      if (!dimension || typeof dimension !== "object") {
        return null;
      }

      const categoryId =
        typeof dimension.categoryId === "string" && PROFILE_DIMENSION_IDS.includes(dimension.categoryId as ProfileDimensionId)
          ? (dimension.categoryId as ProfileDimensionId)
          : undefined;

      if (!categoryId) {
        return null;
      }

      return [categoryId, dimension] as const;
    })
    .filter((entry): entry is readonly [ProfileDimensionId, NonNullable<typeof currentProfile.dimensions>[number]] => Boolean(entry));
  const dimensionMap = new Map(dimensionEntries);

  return {
    updatedAt: currentProfile.updatedAt ?? session.updatedAt,
    dimensions: PROFILE_DIMENSION_IDS.map((categoryId) => {
      const fallbackDimension = fallbackProfile.dimensions.find((dimension) => dimension.categoryId === categoryId)!;
      const existing = dimensionMap.get(categoryId);

      if (!existing) {
        return fallbackDimension;
      }

      const rawSignals = Array.isArray(existing.signals) ? existing.signals : [];
      const rawEvidence = Array.isArray(existing.evidence) ? existing.evidence : [];
      const signals = rawSignals
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && !hasBrokenText(item));
      const evidence = rawEvidence
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0 && !hasBrokenText(item));
      const normalizedSignals = signals.length > 0 ? signals : fallbackDimension.signals;
      const normalizedEvidence = evidence.length > 0 ? evidence : fallbackDimension.evidence;
      const summary =
        pickText(existing.summary, existing.analysis, normalizedSignals[0], fallbackDimension.summary) ??
        fallbackDimension.summary;
      const status: "completed" | "pending" =
        completedCategoryIds.has(categoryId) || existing.status === "completed"
          ? "completed"
          : "pending";

      return {
        categoryId,
        status,
        completedAt: completedCategoryMap.get(categoryId)?.completedAt ?? existing.completedAt ?? fallbackDimension.completedAt,
        updatedAt: existing.updatedAt ?? currentProfile.updatedAt ?? session.updatedAt,
        summary,
        signals: normalizedSignals,
        evidence: normalizedEvidence
      };
    }),
    mbtiGuess: sanitizeGuess(currentProfile.mbtiGuess, fallbackProfile.mbtiGuess),
    enneagramGuess: sanitizeGuess(currentProfile.enneagramGuess, fallbackProfile.enneagramGuess)
  };
};

const ensureSessionState = (session: InterviewSession) => {
  const currentQuestionIds = Array.isArray(session.currentQuestionIds) ? session.currentQuestionIds : [];
  const maxIndex = Math.max(currentQuestionIds.length - 1, 0);
  const currentQuestionIndex = Math.min(
    Math.max(session.progress?.currentQuestionIndex ?? 0, 0),
    maxIndex
  );

  session.currentQuestionAskedAt ??= session.updatedAt;
  session.progress = {
    currentQuestionIndex,
    draftAnswers: Object.fromEntries(
      Object.entries(session.progress?.draftAnswers ?? {}).filter(([questionId, answer]) => {
        return currentQuestionIds.includes(questionId) && typeof answer === "string" && answer.trim().length > 0;
      })
    ),
    lastSavedAt: session.progress?.lastSavedAt ?? session.updatedAt
  };

  session.evolvedProfile = normalizeEvolvedProfile(session);
  session.profileAnalysis = normalizeProfileAnalysis(session);
  return session;
};

const normalizeProgress = (session: InterviewSession, input: ProgressInput, now: string) => {
  const allowedQuestionIds = new Set(session.currentQuestionIds);
  const draftAnswers = Object.fromEntries(
    Object.entries(input.draftAnswers ?? {}).filter(
      ([questionId, answer]) =>
        allowedQuestionIds.has(questionId) && typeof answer === "string" && answer.trim().length > 0
    )
  );

  const maxIndex = Math.max(session.currentQuestionIds.length - 1, 0);
  const currentQuestionIndex = Math.min(Math.max(input.currentQuestionIndex ?? 0, 0), maxIndex);

  return {
    currentQuestionIndex,
    draftAnswers,
    lastSavedAt: now
  };
};

const buildSnapshot = (session: InterviewSession): SessionSnapshot => {
  ensureSessionState(session);

  const currentQuestions = session.currentQuestionIds
    .map((questionId) => QUESTION_MAP.get(questionId))
    .filter((question): question is Question => Boolean(question));

  const answeredCount = session.answers.length;
  const remainingCount = Math.max(TOTAL_QUESTIONS - answeredCount, 0);

  return {
    session,
    totalQuestions: TOTAL_QUESTIONS,
    answeredCount,
    remainingCount,
    completionRatio: TOTAL_QUESTIONS === 0 ? 0 : answeredCount / TOTAL_QUESTIONS,
    currentQuestions,
    isComplete: answeredCount >= TOTAL_QUESTIONS,
    aiConfigured: isAiConfigured()
  };
};

const getCompletedCategoryIds = (session: InterviewSession) => {
  const answeredIds = new Set(session.answers.map((answer) => answer.questionId));

  return Array.from(QUESTION_CATEGORY_MAP.keys()).filter((categoryId) =>
    QUESTIONS.filter((question) => question.categoryId === categoryId).every((question) => answeredIds.has(question.id))
  ) as ProfileDimensionId[];
};

const buildCompletedCategories = (session: InterviewSession, now: string) => {
  return getCompletedCategoryIds(session)
    .map((categoryId) => {
      const category = QUESTION_CATEGORY_MAP.get(categoryId);
      if (!category) {
        return null;
      }

      const categoryAnswers = session.answers
        .filter((answer) => QUESTION_MAP.get(answer.questionId)?.categoryId === categoryId)
        .sort((left, right) => left.answeredAt.localeCompare(right.answeredAt));

      return {
        categoryId,
        categoryTitle: category.title,
        categoryDescription: category.description,
        completedAt: categoryAnswers[categoryAnswers.length - 1]?.answeredAt ?? now,
        qaPairs: categoryAnswers.map((answer) => ({
          questionId: answer.questionId,
          prompt: QUESTION_MAP.get(answer.questionId)?.prompt ?? answer.questionId,
          answer: answer.answer,
          summary: answer.summary,
          answeredAt: answer.answeredAt
        }))
      } satisfies CompletedCategoryInput;
    })
    .filter((item): item is CompletedCategoryInput => Boolean(item));
};

const selectNextQuestions = (session: InterviewSession) => {
  const answeredIds = new Set(session.answers.map((answer) => answer.questionId));
  const remainingQuestions = QUESTIONS.filter((question) => !answeredIds.has(question.id));

  if (remainingQuestions.length === 0) {
    return [] as string[];
  }

  const nextCategoryId = remainingQuestions[0].categoryId;
  return remainingQuestions
    .filter((question) => question.categoryId === nextCategoryId)
    .map((question) => question.id);
};

const runProfileAnalysisInBackground = (sessionId: string, requestId: string, targetCategoryId?: ProfileDimensionId) => {
  void (async () => {
    const startedAt = new Date().toISOString();
    const runningSession = await loadSession(sessionId);
    if (!runningSession || runningSession.profileAnalysis?.requestId !== requestId) {
      return;
    }

    ensureSessionState(runningSession);
    const completedCategories = buildCompletedCategories(runningSession, startedAt);

    try {
      const evolvedProfile = await analyzeProfileEvolution({
        userName: runningSession.userName,
        focus: runningSession.focus,
        updatedAt: startedAt,
        completedCategories,
        previousProfile: runningSession.evolvedProfile
      });

      const latestSession = await loadSession(sessionId);
      if (!latestSession || latestSession.profileAnalysis?.requestId !== requestId) {
        return;
      }

      ensureSessionState(latestSession);
      latestSession.evolvedProfile = evolvedProfile;
      latestSession.profileAnalysis = {
        requestId,
        status: "completed",
        targetCategoryId,
        startedAt: latestSession.profileAnalysis?.startedAt ?? startedAt,
        finishedAt: new Date().toISOString()
      };
      latestSession.updatedAt = new Date().toISOString();
      await saveSession(latestSession);
    } catch (error) {
      const latestSession = await loadSession(sessionId);
      if (!latestSession || latestSession.profileAnalysis?.requestId !== requestId) {
        return;
      }

      ensureSessionState(latestSession);
      latestSession.profileAnalysis = {
        requestId,
        status: "failed",
        targetCategoryId,
        startedAt: latestSession.profileAnalysis?.startedAt ?? startedAt,
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      };
      latestSession.updatedAt = new Date().toISOString();
      await saveSession(latestSession);
    }
  })();
};

export const createSession = async (input: { userName: string; focus?: string | null }) => {
  const now = new Date().toISOString();
  const session: InterviewSession = {
    id: randomUUID(),
    userName: input.userName.trim(),
    focus: input.focus?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    askedQuestionIds: [],
    currentQuestionIds: [],
    currentQuestionAskedAt: now,
    progress: {
      currentQuestionIndex: 0,
      draftAnswers: {},
      lastSavedAt: now
    },
    answers: [],
    evolvedProfile: createEmptyEvolvedProfile(now)
  };

  session.currentQuestionIds = selectNextQuestions(session);
  session.askedQuestionIds = [...session.currentQuestionIds];

  await saveSession(session);
  return buildSnapshot(session);
};

export const getSessionSnapshot = async (sessionId: string) => {
  const session = await loadSession(sessionId);
  if (!session) {
    return null;
  }

  ensureSessionState(session);
  return buildSnapshot(session);
};

export const submitAnswers = async (sessionId: string, answers: AnswerInput[]) => {
  const session = await loadSession(sessionId);
  if (!session) {
    return null;
  }

  ensureSessionState(session);

  const now = new Date().toISOString();
  const completedBefore = new Set(getCompletedCategoryIds(session));
  const currentQuestionIds = [...session.currentQuestionIds];
  if (currentQuestionIds.length === 0) {
    return buildSnapshot(session);
  }

  const allowedQuestionIds = new Set(currentQuestionIds);
  const normalizedAnswerMap = new Map<string, string>();

  for (const answer of answers) {
    if (!allowedQuestionIds.has(answer.questionId)) {
      continue;
    }

    const normalizedAnswer = answer.answer.trim();
    if (normalizedAnswer.length === 0) {
      continue;
    }

    normalizedAnswerMap.set(answer.questionId, normalizedAnswer);
  }

  for (const [questionId, draftAnswer] of Object.entries(session.progress?.draftAnswers ?? {})) {
    if (!allowedQuestionIds.has(questionId) || normalizedAnswerMap.has(questionId)) {
      continue;
    }

    const normalizedDraftAnswer = draftAnswer.trim();
    if (normalizedDraftAnswer.length === 0) {
      continue;
    }

    normalizedAnswerMap.set(questionId, normalizedDraftAnswer);
  }

  const missingQuestionId = currentQuestionIds.find((questionId) => !normalizedAnswerMap.has(questionId));
  if (missingQuestionId) {
    const question = QUESTION_MAP.get(missingQuestionId);
    throw new Error(`请先完成当前题组中的全部问题：${question?.prompt ?? missingQuestionId}`);
  }

  const records: AnswerRecord[] = currentQuestionIds.map((questionId) => {
    const answer = normalizedAnswerMap.get(questionId) ?? "";

    return {
      questionId,
      answer,
      summary: summarizeAnswer({
        prompt: QUESTION_MAP.get(questionId)?.prompt ?? questionId,
        answer
      }),
      askedAt: session.currentQuestionAskedAt ?? session.updatedAt,
      answeredAt: now
    };
  });

  const existingAnswers = new Map(session.answers.map((answer) => [answer.questionId, answer]));
  for (const record of records) {
    existingAnswers.set(record.questionId, record);
  }

  session.answers = Array.from(existingAnswers.values()).sort((left, right) => left.answeredAt.localeCompare(right.answeredAt));
  session.updatedAt = now;
  session.currentQuestionIds = selectNextQuestions(session);
  session.askedQuestionIds = Array.from(new Set([...session.askedQuestionIds, ...session.currentQuestionIds]));
  session.currentQuestionAskedAt = now;
  session.progress = normalizeProgress(
    {
      ...session,
      currentQuestionIds: session.currentQuestionIds
    },
    {
      currentQuestionIndex: 0,
      draftAnswers: {}
    },
    now
  );

  const completedAfter = getCompletedCategoryIds(session);
  const newlyCompletedCategoryId = completedAfter.find((categoryId) => !completedBefore.has(categoryId));
  const completedCategories = buildCompletedCategories(session, now);

  session.evolvedProfile = createEmptyEvolvedProfile(now, new Set(completedAfter), completedCategories);

  if (newlyCompletedCategoryId) {
    const requestId = randomUUID();
    session.profileAnalysis = {
      requestId,
      status: "pending",
      targetCategoryId: newlyCompletedCategoryId,
      startedAt: now
    };
    await saveSession(session);
    runProfileAnalysisInBackground(session.id, requestId, newlyCompletedCategoryId);
  } else {
    await saveSession(session);
  }

  return buildSnapshot(session);
};

export const updateSessionProgress = async (sessionId: string, input: ProgressInput) => {
  const session = await loadSession(sessionId);
  if (!session) {
    return null;
  }

  ensureSessionState(session);
  const now = new Date().toISOString();
  session.progress = normalizeProgress(session, input, now);
  session.updatedAt = now;

  await saveSession(session);
  return session.progress;
};

export const generateHumanFile = async (sessionId: string) => {
  const session = await loadSession(sessionId);
  if (!session) {
    return null;
  }

  ensureSessionState(session);

  const qaPairs = session.answers.map((answer) => ({
    prompt: QUESTION_MAP.get(answer.questionId)?.prompt ?? answer.questionId,
    answer: answer.answer,
    summary: answer.summary
  }));

  const markdown = await generateHumanMarkdown({
    userName: session.userName,
    focus: session.focus,
    qaPairs,
    updatedAt: new Date().toISOString(),
    evolvedProfile: session.evolvedProfile
  });

  const now = new Date().toISOString();
  session.humanMarkdown = markdown;
  session.humanMarkdownUpdatedAt = now;
  session.updatedAt = now;

  await saveSession(session);
  return buildSnapshot(session);
};



