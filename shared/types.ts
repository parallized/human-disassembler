export const PROFILE_DIMENSION_IDS = [
  "daily-life",
  "mindset",
  "dream-life",
  "past",
  "feelings",
  "future-self",
  "self-growth",
  "relationships",
  "self-love",
  "personality"
] as const;

export type ProfileDimensionId = (typeof PROFILE_DIMENSION_IDS)[number];

export type QuestionCategory = {
  id: ProfileDimensionId;
  title: string;
  description: string;
};

export type Question = {
  id: string;
  categoryId: ProfileDimensionId;
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

export type ProfileGuess = {
  code: string;
  label: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
};

export type ProfileDimensionStatus = "pending" | "completed";

export type ProfileDimension = {
  categoryId: ProfileDimensionId;
  status: ProfileDimensionStatus;
  completedAt?: string;
  updatedAt: string;
  summary: string;
  signals: string[];
  evidence: string[];
  categoryTitle?: string;
  categoryDescription?: string;
  analysis?: string;
};

export type EvolvedProfile = {
  updatedAt: string;
  dimensions: ProfileDimension[];
  mbtiGuess: ProfileGuess;
  enneagramGuess: ProfileGuess;
};

export type ProfileAnalysis = {
  requestId: string;
  status: "queued" | "running" | "pending" | "completed" | "failed";
  targetCategoryId?: ProfileDimensionId;
  requestedAt?: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

export type InterviewSession = {
  id: string;
  userName: string;
  focus?: string;
  createdAt: string;
  updatedAt: string;
  askedQuestionIds: string[];
  currentQuestionIds: string[];
  currentQuestionAskedAt?: string;
  answers: AnswerRecord[];
  progress?: {
    currentQuestionIndex: number;
    draftAnswers: Record<string, string>;
    lastSavedAt?: string;
  };
  humanMarkdown?: string;
  humanMarkdownUpdatedAt?: string;
  evolvedProfile?: EvolvedProfile;
  profileAnalysis?: ProfileAnalysis;
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
