import { randomUUID } from "node:crypto";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_MAP, QUESTION_MAP, QUESTIONS, TOTAL_QUESTIONS } from "../shared/questions";
import { PROFILE_DIMENSION_IDS, type AnswerRecord, type EvolvedProfile, type InterviewSession, type ProfileDimension, type ProfileDimensionId, type Question, type SessionSnapshot } from "../shared/types";
import { analyzeProfileEvolution, generateHumanMarkdown, isAiConfigured } from "./ai";
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

const buildLocalSummary = (answer: string) => answer.replace(/\s+/g, " ").trim().slice(0, 180);

const buildUnknownGuess = (label: string) => ({
  code: "unknown",
  label,
  confidence: "low" as const,
  rationale: "需要更多已完成维度后再判断。"
});

const buildPendingDimensions = (updatedAt: string): ProfileDimension[] =>
  QUESTION_CATEGORIES.map((category) => ({
    categoryId: category.id,
    categoryTitle: category.title,
    categoryDescription: category.description,
    status: "pending",
    updatedAt,
    analysis: "完成该维度问答后，系统会在后台生成完整分析。",
    evidence: []
  }));

const buildDefaultEvolvedProfile = (updatedAt: string): EvolvedProfile => ({
  updatedAt,
  dimensions: buildPendingDimensions(updatedAt),
  mbtiGuess: buildUnknownGuess("待确认"),
  enneagramGuess: buildUnknownGuess("待确认")
});

const ensureEvolvedProfileState = (session: InterviewSession) => {
  if (!session.evolvedProfile) {
    session.evolvedProfile = buildDefaultEvolvedProfile(session.updatedAt);
    return session.evolvedProfile;
  }

  const currentById = new Map(session.evolvedProfile.dimensions.map((dimension) => [dimension.categoryId, dimension]));
  session.evolvedProfile.dimensions = QUESTION_CATEGORIES.map((category) => {
    const existing = currentById.get(category.id);
    if (existing) {
      return {
        ...existing,
        categoryId: category.id,
        categoryTitle: category.title,
        categoryDescription: category.description,
        analysis: existing.analysis?.trim().length > 0 ? existing.analysis : "完成该维度问答后，系统会在后台生成完整分析。",
        evidence: Array.isArray(existing.evidence) ? existing.evidence : []
      };
    }

    return {
      categoryId: category.id,
      categoryTitle: category.title,
      categoryDescription: category.description,
      status: "pending" as const,
      updatedAt: session.evolvedProfile?.updatedAt ?? session.updatedAt,
      analysis: "完成该维度问答后，系统会在后台生成完整分析。",
      evidence: []
    };
  });
  session.evolvedProfile.updatedAt ??= session.updatedAt;
  session.evolvedProfile.mbtiGuess ??= buildUnknownGuess("待确认");
  session.evolvedProfile.enneagramGuess ??= buildUnknownGuess("待确认");

  return session.evolvedProfile;
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

  ensureEvolvedProfileState(session);
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

  return PROFILE_DIMENSION_IDS.filter((categoryId) =>
    QUESTIONS.filter((question) => question.categoryId === categoryId).every((question) => answeredIds.has(question.id))
  );
};

const buildCompletedCategories = (session: InterviewSession): CompletedCategoryInput[] => {
  const completedCategoryIds = getCompletedCategoryIds(session);

  return completedCategoryIds
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
        completedAt: categoryAnswers[categoryAnswers.length - 1]?.answeredAt ?? session.updatedAt,
        qaPairs: categoryAnswers.map((answer) => ({
          questionId: answer.questionId,
          prompt: QUESTION_MAP.get(answer.questionId)?.prompt ?? answer.questionId,
          answer: answer.answer,
          summary: answer.summary,
          answeredAt: answer.answeredAt
        }))
      };
    })
    .filter((item): item is CompletedCategoryInput => Boolean(item));
};

const selectNextQuestions = (session: InterviewSession) => {
  const answeredIds = new Set(session.answers.map((answer) => answer.questionId));
  const remainingQuestions = QUESTIONS.filter((question) => !answeredIds.has(question.id));

  if (remainingQuestions.length === 0) {
    return [] as string[];
  }

  const firstRemainingCategoryId = remainingQuestions[0]?.categoryId;
  return remainingQuestions
    .filter((question) => question.categoryId === firstRemainingCategoryId)
    .map((question) => question.id);
};

const runProfileAnalysis = async (sessionId: string, requestId: string, targetCategoryId: ProfileDimensionId) => {
  const runningAt = new Date().toISOString();
  const runningSession = await loadSession(sessionId);
  if (!runningSession || runningSession.profileAnalysis?.requestId !== requestId) {
    return;
  }

  ensureSessionState(runningSession);
  runningSession.profileAnalysis = {
    ...runningSession.profileAnalysis,
    requestId,
    targetCategoryId,
    status: "running",
    requestedAt: runningSession.profileAnalysis?.requestedAt ?? runningAt,
    startedAt: runningAt,
    finishedAt: undefined,
    error: undefined
  };
  runningSession.updatedAt = runningAt;
  await saveSession(runningSession);

  try {
    const analyzedProfile = await analyzeProfileEvolution({
      userName: runningSession.userName,
      focus: runningSession.focus,
      updatedAt: new Date().toISOString(),
      completedCategories: buildCompletedCategories(runningSession),
      previousProfile: runningSession.evolvedProfile
    });

    const completedAt = new Date().toISOString();
    const completedSession = await loadSession(sessionId);
    if (!completedSession || completedSession.profileAnalysis?.requestId !== requestId) {
      return;
    }

    ensureSessionState(completedSession);
    completedSession.evolvedProfile = analyzedProfile;
    completedSession.profileAnalysis = {
      ...completedSession.profileAnalysis,
      requestId,
      targetCategoryId,
      status: "completed",
      requestedAt: completedSession.profileAnalysis?.requestedAt ?? runningAt,
      startedAt: completedSession.profileAnalysis?.startedAt ?? runningAt,
      finishedAt: completedAt,
      error: undefined
    };
    completedSession.updatedAt = completedAt;
    await saveSession(completedSession);
  } catch (error) {
    const failedAt = new Date().toISOString();
    const failedSession = await loadSession(sessionId);
    if (!failedSession || failedSession.profileAnalysis?.requestId !== requestId) {
      return;
    }

    ensureSessionState(failedSession);
    failedSession.profileAnalysis = {
      ...failedSession.profileAnalysis,
      requestId,
      targetCategoryId,
      status: "failed",
      requestedAt: failedSession.profileAnalysis?.requestedAt ?? runningAt,
      startedAt: failedSession.profileAnalysis?.startedAt ?? runningAt,
      finishedAt: failedAt,
      error: error instanceof Error ? error.message : "画像更新失败"
    };
    failedSession.updatedAt = failedAt;
    await saveSession(failedSession);
  }
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
    evolvedProfile: buildDefaultEvolvedProfile(now)
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
  const currentQuestionIds = [...session.currentQuestionIds];
  const allowedQuestionIds = new Set(currentQuestionIds);
  const normalizedAnswerMap = new Map(
    answers
      .map((answer) => ({
        questionId: answer.questionId,
        answer: answer.answer.trim()
      }))
      .filter((answer) => allowedQuestionIds.has(answer.questionId) && answer.answer.length > 0)
      .map((answer) => [answer.questionId, answer.answer])
  );

  const missingQuestion = currentQuestionIds.find((questionId) => !normalizedAnswerMap.has(questionId));
  if (missingQuestion) {
    const question = QUESTION_MAP.get(missingQuestion);
    throw new Error(`请先完成当前题组中的全部问题：${question?.prompt ?? missingQuestion}`);
  }

  if (currentQuestionIds.length === 0) {
    return buildSnapshot(session);
  }

  const completedBefore = new Set(getCompletedCategoryIds(session));
  const askedAt = session.currentQuestionAskedAt ?? session.updatedAt;
  const existing = new Map(session.answers.map((answer) => [answer.questionId, answer]));

  for (const questionId of currentQuestionIds) {
    const answer = normalizedAnswerMap.get(questionId);
    if (!answer) {
      continue;
    }

    const record: AnswerRecord = {
      questionId,
      answer,
      summary: buildLocalSummary(answer),
      askedAt,
      answeredAt: now
    };

    existing.set(questionId, record);
  }

  session.answers = Array.from(existing.values()).sort((left, right) => left.answeredAt.localeCompare(right.answeredAt));
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

  if (newlyCompletedCategoryId) {
    const requestId = randomUUID();
    session.profileAnalysis = {
      requestId,
      targetCategoryId: newlyCompletedCategoryId,
      status: "queued",
      requestedAt: now
    };
    await saveSession(session);
    void runProfileAnalysis(session.id, requestId, newlyCompletedCategoryId);
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
