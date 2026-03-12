import { randomUUID } from "node:crypto";
import { QUESTION_MAP, QUESTIONS, TOTAL_QUESTIONS } from "../shared/questions";
import type { AnswerRecord, InterviewSession, Question, SessionSnapshot } from "../shared/types";
import { generateHumanMarkdown, isAiConfigured, pickNextQuestionIds, summarizeAnswer } from "./ai";
import { loadSession, saveSession } from "./storage";

const QUESTION_BATCH_SIZE = 4;

type AnswerInput = {
  questionId: string;
  answer: string;
};

const buildSnapshot = (session: InterviewSession): SessionSnapshot => {
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

const selectNextQuestions = async (session: InterviewSession) => {
  const answeredIds = new Set(session.answers.map((answer) => answer.questionId));
  const queuedIds = new Set(session.currentQuestionIds);
  const remainingQuestions = QUESTIONS.filter(
    (question) => !answeredIds.has(question.id) && !queuedIds.has(question.id)
  );

  if (remainingQuestions.length === 0) {
    return [] as string[];
  }

  const pickedIds = await pickNextQuestionIds({
    remainingQuestions,
    previousSummaries: session.answers.map((answer) => answer.summary),
    focus: session.focus,
    batchSize: Math.min(QUESTION_BATCH_SIZE, remainingQuestions.length)
  });

  if (pickedIds.length > 0) {
    return pickedIds;
  }

  return remainingQuestions.slice(0, QUESTION_BATCH_SIZE).map((question) => question.id);
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
    answers: []
  };

  session.currentQuestionIds = await selectNextQuestions(session);
  session.askedQuestionIds = [...session.currentQuestionIds];

  await saveSession(session);

  return buildSnapshot(session);
};

export const getSessionSnapshot = async (sessionId: string) => {
  const session = await loadSession(sessionId);
  if (!session) {
    return null;
  }

  return buildSnapshot(session);
};

export const submitAnswers = async (sessionId: string, answers: AnswerInput[]) => {
  const session = await loadSession(sessionId);
  if (!session) {
    return null;
  }

  const now = new Date().toISOString();
  const allowedQuestionIds = new Set(session.currentQuestionIds);
  const cleanAnswers = answers
    .map((answer) => ({
      questionId: answer.questionId,
      answer: answer.answer.trim()
    }))
    .filter((answer) => allowedQuestionIds.has(answer.questionId) && answer.answer.length > 0);

  const summarizedRecords = await Promise.all(
    cleanAnswers.map(async (item) => {
      const question = QUESTION_MAP.get(item.questionId);
      const summary = await summarizeAnswer({
        prompt: question?.prompt ?? item.questionId,
        answer: item.answer
      });

      const record: AnswerRecord = {
        questionId: item.questionId,
        answer: item.answer,
        summary,
        askedAt: session.updatedAt,
        answeredAt: now
      };

      return record;
    })
  );

  if (summarizedRecords.length === 0) {
    return buildSnapshot(session);
  }

  const existing = new Map(session.answers.map((answer) => [answer.questionId, answer]));
  for (const record of summarizedRecords) {
    existing.set(record.questionId, record);
  }

  session.answers = Array.from(existing.values());
  session.updatedAt = now;
  session.currentQuestionIds = await selectNextQuestions({
    ...session,
    answers: session.answers,
    updatedAt: now
  });
  session.askedQuestionIds = Array.from(new Set([...session.askedQuestionIds, ...session.currentQuestionIds]));

  await saveSession(session);

  return buildSnapshot(session);
};

export const generateHumanFile = async (sessionId: string) => {
  const session = await loadSession(sessionId);
  if (!session) {
    return null;
  }

  const qaPairs = session.answers.map((answer) => ({
    prompt: QUESTION_MAP.get(answer.questionId)?.prompt ?? answer.questionId,
    answer: answer.answer,
    summary: answer.summary
  }));

  const markdown = await generateHumanMarkdown({
    userName: session.userName,
    focus: session.focus,
    qaPairs,
    updatedAt: new Date().toISOString()
  });

  const now = new Date().toISOString();
  session.humanMarkdown = markdown;
  session.humanMarkdownUpdatedAt = now;
  session.updatedAt = now;

  await saveSession(session);

  return buildSnapshot(session);
};
