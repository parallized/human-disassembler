export type QuestionCategory = {
  id: string;
  title: string;
  description: string;
};

export type Question = {
  id: string;
  categoryId: string;
  index: number;
  prompt: string;
};

export type AnswerRecord = {
  questionId: string;
  answer: string;
  summary: string;
  askedAt: string;
  answeredAt: string;
};

export type InterviewSession = {
  id: string;
  userName: string;
  focus?: string;
  createdAt: string;
  updatedAt: string;
  askedQuestionIds: string[];
  currentQuestionIds: string[];
  answers: AnswerRecord[];
  humanMarkdown?: string;
  humanMarkdownUpdatedAt?: string;
};

export type SessionSnapshot = {
  session: InterviewSession;
  totalQuestions: number;
  answeredCount: number;
  remainingCount: number;
  completionRatio: number;
  currentQuestions: Question[];
  isComplete: boolean;
  aiConfigured: boolean;
};
