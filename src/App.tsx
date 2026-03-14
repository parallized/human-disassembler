import { CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, RotateCcw, Send, Sparkles, Zap } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QUESTION_CATEGORY_MAP, QUESTIONS, TOTAL_QUESTIONS } from "../shared/questions";
import { PROFILE_DIMENSION_IDS, type ProfileDimension, type SessionSnapshot } from "../shared/types";
import Silk from "./components/Silk";

const ACTIVE_SESSION_KEY = "human-disassembler.active-session-id";

type StatusTone = "info" | "success" | "error" | "loading";

type LogItem = {
  message: string;
  time: string;
};

const ANALYSIS_ACTIVE_STATUSES = new Set(["pending"]);

const clampIndex = (value: number, length: number) => {
  if (length <= 0) {
    return 0;
  }

  return Math.min(Math.max(value, 0), length - 1);
};

const mergeDraftAnswers = (
  existingDraftAnswers: Record<string, string> | undefined,
  nextDraftAnswers: Record<string, string>
) => {
  const mergedDraftAnswers = { ...(existingDraftAnswers ?? {}) };

  for (const [questionId, answer] of Object.entries(nextDraftAnswers)) {
    if (answer.length > 0) {
      mergedDraftAnswers[questionId] = answer;
    } else {
      delete mergedDraftAnswers[questionId];
    }
  }

  return mergedDraftAnswers;
};

const getDraftAnswersFromForm = (
  form: HTMLFormElement | null,
  questionIds: string[],
  existingDraftAnswers: Record<string, string> | undefined = {}
) => {
  if (!form) {
    return existingDraftAnswers ?? {};
  }

  const visibleDraftAnswers = Object.fromEntries(
    questionIds.flatMap((questionId) => {
      const field = form.elements.namedItem(questionId);
      if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) {
        return [];
      }

      return [[questionId, field.value.trim()] as const];
    })
  );

  return mergeDraftAnswers(existingDraftAnswers, visibleDraftAnswers);
};

const categoryColors: Record<string, string> = {
  "daily-life": "text-white bg-notion-blue border-notion-blue",
  mindset: "text-white bg-notion-purple border-notion-purple",
  "dream-life": "text-white bg-notion-yellow border-notion-yellow",
  past: "text-white bg-notion-orange border-notion-orange",
  feelings: "text-white bg-notion-red border-notion-red",
  "future-self": "text-white bg-notion-green border-notion-green",
  "self-growth": "text-white bg-notion-pink border-notion-pink",
  relationships: "text-white bg-notion-blue border-notion-blue",
  "self-love": "text-white bg-notion-red border-notion-red",
  personality: "text-white bg-notion-gray border-notion-gray"
};

const statusColors: Record<StatusTone, string> = {
  info: "text-black/60 bg-black/[0.05] border border-black/10 shadow-sm backdrop-blur-xl",
  success: "text-notion-green bg-notion-green/10 border border-notion-green/20 shadow-sm backdrop-blur-xl",
  error: "text-notion-red bg-notion-red/10 border border-notion-red/20 shadow-sm backdrop-blur-xl",
  loading: "text-notion-blue bg-white/80 border border-black/10 shadow-xl backdrop-blur-2xl"
};

const normalizeDimension = (snapshot: SessionSnapshot | null, categoryId: (typeof PROFILE_DIMENSION_IDS)[number]): ProfileDimension => {
  const existing = snapshot?.session.evolvedProfile?.dimensions.find((dimension) => dimension.categoryId === categoryId);
  const category = QUESTION_CATEGORY_MAP.get(categoryId);
  const rawSignals = Array.isArray(existing?.signals) ? existing.signals : [];
  const rawEvidence = Array.isArray(existing?.evidence) ? existing.evidence : [];
  const signals = rawSignals
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const evidence = rawEvidence
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const summary =
    existing?.summary?.trim() ||
    existing?.analysis?.trim() ||
    (existing?.status === "completed" ? "该维度已完成，等待 AI 在后台补全分析。" : "完成该维度问答后，这里会显示总结。");

  return {
    categoryId,
    categoryTitle: existing?.categoryTitle ?? category?.title,
    categoryDescription: existing?.categoryDescription ?? category?.description,
    status: existing?.status === "completed" ? "completed" : "pending",
    completedAt: existing?.completedAt,
    updatedAt: existing?.updatedAt ?? snapshot?.session.updatedAt ?? new Date().toISOString(),
    summary,
    analysis: existing?.analysis ?? summary,
    signals,
    evidence
  };
};

const mergeIncomingSnapshot = (current: SessionSnapshot | null, next: SessionSnapshot): SessionSnapshot => {
  if (!current || current.session.id !== next.session.id) {
    return next;
  }

  if (next.currentQuestions.length !== current.currentQuestions.length) {
    return next;
  }

  return {
    ...next,
    session: {
      ...next.session,
      progress: {
        currentQuestionIndex:
          current.session.progress?.currentQuestionIndex ?? next.session.progress?.currentQuestionIndex ?? 0,
        draftAnswers: current.session.progress?.draftAnswers ?? next.session.progress?.draftAnswers ?? {},
        lastSavedAt: current.session.progress?.lastSavedAt ?? next.session.progress?.lastSavedAt
      }
    }
  };
};

const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [status, setStatus] = useState<{ message: string; tone: StatusTone }>({
    message: "",
    tone: "info"
  });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const saveProgressTimerRef = useRef<number | null>(null);
  const hydratedDraftsRef = useRef<string | null>(null);

  const addLog = (message: string) => {
    setLogs((prev) =>
      [...prev, { message, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) }].slice(-10)
    );
  };

  const updateStatus = (message: string, tone: StatusTone = "info") => {
    setStatus({ message, tone });
    addLog(message);
  };

  const request = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? "请求失败");
    }

    return payload;
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const restoreSession = async () => {
      const sessionId = window.localStorage.getItem(ACTIVE_SESSION_KEY);
      if (!sessionId) {
        setRestoring(false);
        return;
      }

      try {
        const result = await request(`/api/sessions/${sessionId}`);
        setSnapshot(result);
        setCurrentQuestionIndex(clampIndex(result.session.progress?.currentQuestionIndex ?? 0, result.currentQuestions?.length ?? 0));
        hydratedDraftsRef.current = JSON.stringify(result.session.progress?.draftAnswers ?? {});
      } catch {
        window.localStorage.removeItem(ACTIVE_SESSION_KEY);
      } finally {
        setRestoring(false);
      }
    };

    void restoreSession();
  }, []);

  useEffect(() => {
    if (!snapshot) {
      hydratedDraftsRef.current = null;
      return;
    }

    const nextIndex = clampIndex(snapshot.session.progress?.currentQuestionIndex ?? 0, snapshot.currentQuestions.length);
    setCurrentQuestionIndex(nextIndex);
  }, [snapshot]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || !snapshot) {
      return;
    }

    const draftAnswers = snapshot.session.progress?.draftAnswers ?? {};
    const serialized = JSON.stringify(draftAnswers);
    if (hydratedDraftsRef.current === serialized) {
      return;
    }

    for (const question of snapshot.currentQuestions) {
      const field = form.elements.namedItem(question.id);
      if (field instanceof HTMLTextAreaElement) {
        field.value = draftAnswers[question.id] ?? "";
      }
    }

    hydratedDraftsRef.current = serialized;
  }, [snapshot, currentQuestionIndex]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!snapshot?.session.id) {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }

    window.localStorage.setItem(ACTIVE_SESSION_KEY, snapshot.session.id);
  }, [snapshot?.session.id]);

  useEffect(() => {
    if (!snapshot || loading) {
      return;
    }

    if (saveProgressTimerRef.current) {
      window.clearTimeout(saveProgressTimerRef.current);
    }

    saveProgressTimerRef.current = window.setTimeout(() => {
      const draftAnswers = getDraftAnswersFromForm(
        formRef.current,
        snapshot.currentQuestions.map((question) => question.id),
        snapshot.session.progress?.draftAnswers
      );

      void request(`/api/sessions/${snapshot.session.id}/progress`, {
        method: "POST",
        body: JSON.stringify({
          currentQuestionIndex,
          draftAnswers
        })
      }).catch(() => undefined);
    }, 500);

    return () => {
      if (saveProgressTimerRef.current) {
        window.clearTimeout(saveProgressTimerRef.current);
      }
    };
  }, [currentQuestionIndex, snapshot, loading]);

  useEffect(() => {
    if (!snapshot?.session.id) {
      return;
    }

    const analysisStatus = snapshot.session.profileAnalysis?.status;
    if (!analysisStatus || !ANALYSIS_ACTIVE_STATUSES.has(analysisStatus)) {
      return;
    }

    const timer = window.setInterval(() => {
      void request(`/api/sessions/${snapshot.session.id}`)
        .then((result) => {
          setSnapshot((prev) => mergeIncomingSnapshot(prev, result));
        })
        .catch(() => undefined);
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [snapshot?.session.id, snapshot?.session.profileAnalysis?.status]);

  const simulateProgress = async (steps: string[]) => {
    for (const step of steps) {
      await new Promise((resolve) => window.setTimeout(resolve, 500 + Math.random() * 500));
      addLog(step);
    }
  };

  const handleStart = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setLoading(true);
    setLogs([]);
    updateStatus("正在初始化...", "loading");

    try {
      const result = await request("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          userName: formData.get("userName"),
          focus: formData.get("focus")
        })
      });

      hydratedDraftsRef.current = JSON.stringify(result.session.progress?.draftAnswers ?? {});
      setSnapshot(result);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      updateStatus("访谈已开始，先从当前题组进入。", "success");
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "会话创建失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const syncDraftAnswers = (nextQuestionIndex = currentQuestionIndex) => {
    if (!snapshot) {
      return {} as Record<string, string>;
    }

    const draftAnswers = getDraftAnswersFromForm(
      formRef.current,
      snapshot.currentQuestions.map((question) => question.id),
      snapshot.session.progress?.draftAnswers
    );

    hydratedDraftsRef.current = JSON.stringify(draftAnswers);
    setSnapshot((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        session: {
          ...prev.session,
          progress: {
            currentQuestionIndex: nextQuestionIndex,
            draftAnswers,
            lastSavedAt: prev.session.progress?.lastSavedAt
          }
        }
      };
    });

    return draftAnswers;
  };

  const handleDraftInput = () => {
    if (!snapshot || loading) {
      return;
    }

    syncDraftAnswers(currentQuestionIndex);
  };

  const handleSubmitAnswers = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!snapshot || loading) {
      return;
    }

    const draftAnswers = getDraftAnswersFromForm(
      event.currentTarget,
      snapshot.currentQuestions.map((question) => question.id),
      snapshot.session.progress?.draftAnswers
    );

    const firstMissingIndex = snapshot.currentQuestions.findIndex(
      (question) => (draftAnswers[question.id] ?? "").trim().length === 0
    );

    if (firstMissingIndex >= 0) {
      hydratedDraftsRef.current = JSON.stringify(draftAnswers);
      setSnapshot((prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          session: {
            ...prev.session,
            progress: {
              currentQuestionIndex: firstMissingIndex,
              draftAnswers,
              lastSavedAt: prev.session.progress?.lastSavedAt
            }
          }
        };
      });
      setDirection(firstMissingIndex > currentQuestionIndex ? 1 : -1);
      setCurrentQuestionIndex(firstMissingIndex);
      updateStatus("请先完成当前题组的全部问题，再继续下一组。", "error");
      return;
    }

    const answers = snapshot.currentQuestions.map((question) => ({
      questionId: question.id,
      answer: draftAnswers[question.id] ?? ""
    }));

    setLoading(true);
    updateStatus("已提交当前题组，继续衔接下一组问题...", "loading");
    void simulateProgress(["保存回答...", "刷新访谈路径...", "后台分析当前画像..."]);

    try {
      const result = await request(`/api/sessions/${snapshot.session.id}/answers`, {
        method: "POST",
        body: JSON.stringify({ answers })
      });

      hydratedDraftsRef.current = JSON.stringify(result.session.progress?.draftAnswers ?? {});
      setSnapshot(result);
      setDirection(1);
      setCurrentQuestionIndex(0);
      formRef.current?.reset();
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      updateStatus(
        result.session.profileAnalysis?.status === "pending"
          ? "当前题组已提交，AI 正在后台更新画像，你可以继续答题。"
          : "当前题组已提交，继续下一组。",
        "success"
      );
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "回答提交失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMarkdown = async () => {
    if (!snapshot || loading) {
      return;
    }

    setLoading(true);
    updateStatus("正在凝练你的 HUMAN.md 档案...", "loading");
    void simulateProgress(["扫描问答记录...", "提炼画像摘要...", "生成最终文档..."]);

    try {
      const result = await request(`/api/sessions/${snapshot.session.id}/human-markdown`, {
        method: "POST"
      });
      setSnapshot(result);
      updateStatus("HUMAN.md 已生成，可以直接导出。", "success");
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "文档生成失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!snapshot?.session.humanMarkdown) {
      return;
    }

    const blob = new Blob([snapshot.session.humanMarkdown], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${snapshot.session.userName || "human"}.HUMAN.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleResetSession = () => {
    setSnapshot(null);
    setCurrentQuestionIndex(0);
    hydratedDraftsRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
    updateStatus("已清除本地会话记录。", "info");
  };

  const handleRetryAnalysis = async () => {
    if (!snapshot?.session.id) return;
    try {
      const result = await request(`/api/sessions/${snapshot.session.id}/retry-analysis`, { method: "POST" });
      setSnapshot((prev) => mergeIncomingSnapshot(prev, result));
    } catch {
      updateStatus("重试画像分析失败，请稍后再试。", "error");
    }
  };

  const currentQuestions = snapshot?.currentQuestions ?? [];
  const currentQuestion = currentQuestions[currentQuestionIndex];
  const currentDraftAnswers = snapshot?.session.progress?.draftAnswers ?? {};
  const isOnLastQuestion = currentQuestionIndex === currentQuestions.length - 1;
  const currentQuestionDraftAnswer = currentQuestion ? (currentDraftAnswers[currentQuestion.id] ?? "").trim() : "";
  const hasCurrentQuestionAnswer = currentQuestionDraftAnswer.length > 0;
  const firstUnansweredQuestionIndex = currentQuestions.findIndex(
    (question) => (currentDraftAnswers[question.id] ?? "").trim().length === 0
  );
  const hasUnansweredQuestionsInBatch = firstUnansweredQuestionIndex >= 0;
  const canSubmitCurrentBatch = currentQuestions.length > 0 && isOnLastQuestion && !hasUnansweredQuestionsInBatch;

  const handlePreviousQuestion = () => {
    if (!snapshot || loading || currentQuestionIndex === 0) {
      return;
    }

    const nextIndex = Math.max(0, currentQuestionIndex - 1);
    syncDraftAnswers(nextIndex);
    setDirection(-1);
    setCurrentQuestionIndex(nextIndex);
  };

  const handleNextQuestion = () => {
    if (!snapshot || loading || !currentQuestion) {
      return;
    }

    const draftAnswers = syncDraftAnswers(currentQuestionIndex);
    const currentAnswer = (draftAnswers[currentQuestion.id] ?? "").trim();
    if (currentAnswer.length === 0) {
      updateStatus("请先回答当前问题，再继续下一题。", "error");
      return;
    }

    if (currentQuestionIndex >= currentQuestions.length - 1) {
      if (firstUnansweredQuestionIndex >= 0) {
        syncDraftAnswers(firstUnansweredQuestionIndex);
        setDirection(firstUnansweredQuestionIndex > currentQuestionIndex ? 1 : -1);
        setCurrentQuestionIndex(firstUnansweredQuestionIndex);
        updateStatus("还有题目未完成，已带你回到第一道未作答的问题。", "error");
      }

      return;
    }

    const nextIndex = Math.min(currentQuestions.length - 1, currentQuestionIndex + 1);
    syncDraftAnswers(nextIndex);
    setDirection(1);
    setCurrentQuestionIndex(nextIndex);
  };

  const absoluteQuestionNumber = currentQuestion
    ? QUESTIONS.findIndex((question) => question.id === currentQuestion.id) + 1
    : 0;

  const allDimensions = PROFILE_DIMENSION_IDS.map((categoryId) => normalizeDimension(snapshot, categoryId));
  const completedDimensions = allDimensions.filter((dimension) => dimension.status === "completed");
  const latestDimension = [...completedDimensions].sort((left, right) =>
    (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt)
  )[0];

  const profileAnalysisStatus = snapshot?.session.profileAnalysis?.status;
  const isProfileAnalysisActive = Boolean(profileAnalysisStatus && ANALYSIS_ACTIVE_STATUSES.has(profileAnalysisStatus));
  const profileAnalysisMessage =
    profileAnalysisStatus === "pending"
      ? "当前题组已完成，AI 正在后台补全最新画像。你可以继续答题。"
      : profileAnalysisStatus === "failed"
        ? `画像分析失败：${snapshot?.session.profileAnalysis?.error ?? "请稍后重试。"}`
        : completedDimensions.length > 0
          ? `已同步 ${completedDimensions.length} / ${PROFILE_DIMENSION_IDS.length} 个核心维度。`
          : "完成任意题组后，结构化画像将在此处实时演化。";

  return (
    <div className="relative h-screen max-h-screen min-h-0 w-screen max-w-screen overflow-hidden selection:bg-notion-selection selection:text-notion-text font-sans bg-transparent text-notion-text">
      <div className="fixed inset-0 z-1 pointer-events-none">
        <Silk speed={0.6} scale={1.2} noiseIntensity={12} color="#3e3e3eff" />
      </div>

      <div ref={scrollContainerRef} className="relative z-10 h-full w-full overflow-y-auto">
        <div className="mx-auto flex h-full min-h-0 max-w-[1200px] flex-col px-4 py-6 sm:px-8">
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex shrink-0 items-center justify-between border-b border-black/5 pb-6"
          >
            <button type="button" className="flex items-center gap-5 text-left group transition-all border-none bg-transparent p-0 outline-none appearance-none cursor-pointer" onClick={handleResetSession}>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1a1a1a] text-2xl italic text-white transition-all duration-500 group-hover:scale-105 group-hover:rotate-3">
                S
              </div>
              <div>
                <div className="text-lg font-black tracking-tight leading-none mb-1">SELF-ARCHIVE</div>
                <div className="text-xs uppercase tracking-[0.05em] font-black text-black/20">Long-form self archive</div>
              </div>
            </button>

            <div className="hidden items-center gap-4 sm:flex">
              <div className="flex items-center gap-4 text-sm text-black/40 uppercase tracking-[0.05em]">
                <span>{snapshot ? `${snapshot.answeredCount} / ${snapshot.totalQuestions} 已记录` : "系统待机"}</span>
              </div>
              {snapshot && (
                <div className="relative h-10 w-10 group">
                  <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                    <path
                      className="text-black/5"
                      strokeDasharray="100, 100"
                      strokeWidth="3"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <motion.path
                      strokeWidth="3"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      initial={{ strokeDasharray: "0, 100" }}
                      animate={{ strokeDasharray: `${(snapshot.answeredCount / snapshot.totalQuestions) * 100}, 100` }}
                      transition={{ duration: 1.5, ease: [0.23, 1, 0.32, 1] }}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                </div>
              )}
            </div>
          </motion.header>

          <main className="flex min-h-0 flex-1 flex-col">
            <AnimatePresence mode="wait">
              {!snapshot ? (
                <motion.section
                  key="landing"
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  variants={{
                    initial: { opacity: 0 },
                    animate: { opacity: 1, transition: { staggerChildren: 0.1 } },
                    exit: { opacity: 0, transition: { duration: 0.2 } }
                  }}
                  className="grid min-h-[calc(100vh-180px)] items-center gap-16 lg:grid-cols-[1.2fr_0.8fr] py-12"
                >
                  <div className="space-y-10">
                    <motion.div
                      variants={{
                        initial: { opacity: 0, x: -20 },
                        animate: { opacity: 1, x: 0 }
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/40 px-5 py-2 text-xs font-bold text-black/40 backdrop-blur-md shadow-sm"
                    >
                      <Sparkles size={14} className="text-notion-blue" />
                      <span className="uppercase tracking-[0.2em]">100 个生命深度命题</span>
                    </motion.div>

                    <motion.div
                      variants={{
                        initial: { opacity: 0, y: 20 },
                        animate: { opacity: 1, y: 0 }
                      }}
                    >
                      <h1 className="notion-h1">
                        凝练属于你的<br />
                        <span className="text-black/30 italic">意识演化档案</span>
                      </h1>
                      <p className="notion-p">
                        通过 100 个基于深度生命体验的探索路径，我们将为您构建一份极致简约、高度结构化的个人意识上下文。
                      </p>
                    </motion.div>

                    <motion.div
                      variants={{
                        initial: { opacity: 0 },
                        animate: { opacity: 1 }
                      }}
                      className="flex items-center gap-12 border-t border-black/5 pt-10"
                    >
                      <div>
                        <div className="text-2xl font-bold">100</div>
                        <div className="text-xs font-bold uppercase tracking-widest text-black/30 mt-1">核心基石</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">∞</div>
                        <div className="text-xs font-bold uppercase tracking-widest text-black/30 mt-1">持续演化</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">*.md</div>
                        <div className="text-xs font-bold uppercase tracking-widest text-black/30 mt-1">永久存档</div>
                      </div>
                    </motion.div>
                  </div>

                  <motion.div
                    variants={{
                      initial: { opacity: 0, scale: 0.95, y: 30 },
                      animate: { opacity: 1, scale: 1, y: 0 }
                    }}
                    className="notion-card p-10 relative overflow-hidden group backdrop-blur-2xl bg-white/60"
                  >
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-notion-blue/5 blur-3xl transition-all group-hover:bg-notion-blue/10" />

                    <div className="relative mb-10 space-y-3">
                      <div className="text-2xl font-bold tracking-tight">启动访谈录入</div>
                      <div className="text-sm text-black/40 leading-relaxed">
                        支持中途离开，系统将为您实时保存在云端，随时可以回来续接进度。
                      </div>
                    </div>

                    <form onSubmit={handleStart} className="relative space-y-8">
                      <div className="space-y-3">
                        <label className="notion-label">Identity / 身份识别</label>
                        <input name="userName" required autoFocus className="notion-input" placeholder="输入你的名字或代号" />
                      </div>
                      <div className="space-y-3">
                        <label className="notion-label">Focus (Optional) / 探索重心</label>
                        <textarea name="focus" className="notion-input min-h-[160px] w-full resize-none py-4 leading-relaxed" placeholder="近期最想梳理的主题：职业、关系、自我成长..." />
                      </div>
                      <button type="submit" disabled={loading} className="notion-btn-primary h-14 w-full text-base group overflow-hidden relative">
                        {loading ? (
                          <span className="flex items-center justify-center gap-3">
                            <Loader2 className="animate-spin" size={20} />
                            <span>正在初始化...</span>
                          </span>
                        ) : (
                          <>
                            <span className="relative z-10 flex items-center justify-center gap-2">
                              <span>开始深度探索</span>
                              <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                          </>
                        )}
                      </button>
                    </form>

                    {restoring ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 flex items-center justify-center gap-2 text-xs text-black/30 font-bold"><Loader2 size={12} className="animate-spin" /><span>正在恢复上次的访谈轨迹...</span></motion.div> : null}
                  </motion.div>
                </motion.section>
              ) : (
                <motion.section
                  key="interview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex h-full min-h-0 flex-col"
                >
                  <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_420px] rounded-2xl border border-black/10 bg-white/60 shadow-2xl backdrop-blur-3xl">
                    <div className="flex min-h-0 flex-col p-10">
                      <div className="mb-8 flex items-center justify-between gap-8 border-b border-black/5 pb-6">
                        <div>
                          <span className={`rounded-lg border border-black/5 bg-black/[0.03] px-4 py-1.5 text-[12px] uppercase tracking-[0.075em] ${categoryColors[currentQuestions[0]?.categoryId] ?? "text-black/40"}`}>
                            {QUESTION_CATEGORY_MAP.get(currentQuestions[0]?.categoryId)?.title ?? currentQuestions[0]?.categoryId}
                          </span>
                        </div>
                        <div />
                      </div>

                      <AnimatePresence mode="wait">
                        {snapshot.isComplete ? (
                          <motion.div key="complete" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col items-center justify-center text-center py-10">
                            <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-notion-green/10 text-notion-green shadow-inner">
                              <CheckCircle2 size={40} />
                            </div>
                            <h2 className="mb-4 text-4xl font-bold tracking-tight">意识闭环已完成</h2>
                            <p className="mb-10 max-w-md text-lg leading-relaxed text-notion-secondary font-medium">
                              你已经完成了全部命题探索。现在可以凝练最终的 HUMAN.md 档案，或静待数据同步完成。
                            </p>
                            <button type="button" onClick={handleGenerateMarkdown} disabled={loading} className="notion-btn-primary h-14 min-w-[260px] px-10 text-lg font-bold shadow-xl shadow-notion-blue/20">
                              {loading ? (
                                <span className="flex items-center gap-3">
                                  <Loader2 className="animate-spin" size={20} />
                                  <span>凝练中...</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-3">
                                  <Zap size={20} fill="currentColor" />
                                  <span>生成 HUMAN.md</span>
                                </span>
                              )}
                            </button>
                          </motion.div>
                        ) : (
                          <motion.form key="question-form" ref={formRef} onSubmit={handleSubmitAnswers} onInput={handleDraftInput} className="flex min-h-0 flex-1 flex-col">
                            <div className="relative flex min-h-0 flex-1 flex-col">
                              <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                                {currentQuestions.map(
                                  (question, index) =>
                                    index === currentQuestionIndex && (
                                      <motion.div
                                        key={question.id}
                                        custom={direction}
                                        variants={{
                                          enter: (val: number) => ({ opacity: 0, y: val > 0 ? 15 : -15 }),
                                          center: { opacity: 1, y: 0 },
                                          exit: (val: number) => ({ opacity: 0, y: val > 0 ? -15 : 15 })
                                        }}
                                        initial="enter"
                                        animate="center"
                                        exit="exit"
                                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                        className="absolute inset-0 flex flex-col"
                                      >
                                        <h2 className="mb-8 mt-0 text-2xl font-bold leading-[1.3] sm:text-4xl text-black">{question.prompt}</h2>
                                        <textarea
                                          name={question.id}
                                          autoFocus
                                          defaultValue={snapshot.session.progress?.draftAnswers?.[question.id] ?? ""}
                                          className="flex-1 resize-none rounded-[0.5rem] border border-white/10 shadow-md bg-white/5 p-8 text-xl leading-relaxed outline-none transition-all duration-500 focus:bg-white/20 focus:shadow-[0_20px_50px_rgba(0,0,0,0.1)] placeholder-black/10"
                                          placeholder="在此记录你的见解与回响..."
                                        />
                                      </motion.div>
                                    )
                                )}
                              </AnimatePresence>
                            </div>

                            <div className="flex items-center gap-6 border-t border-notion-border/20 pt-8">
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={handlePreviousQuestion} disabled={currentQuestionIndex === 0 || loading} className="border-none rounded-xl h-[40px] transition-all hover:bg-notion-hover disabled:opacity-40">
                                  <ChevronLeft size={24} />
                                </button>
                                <div className="px-3 text-sm font-black tracking-tighter text-notion-secondary/80 bg-notion-hover h-[40px] flex items-center rounded-lg">
                                  {absoluteQuestionNumber} <span className="mx-1 opacity-30">/</span> {TOTAL_QUESTIONS}
                                </div>
                                <button type="button" onClick={handleNextQuestion} disabled={loading || currentQuestions.length === 0 || (isOnLastQuestion && canSubmitCurrentBatch)} className="h-[40px] border-none rounded-xl transition-all bg-transparent hover:bg-notion-hover disabled:opacity-40">
                                  <ChevronRight size={24} />
                                </button>
                              </div>

                              <div className="flex-1" />

                              {canSubmitCurrentBatch ? (
                                <button type="submit" disabled={loading} className="notion-btn-primary h-12 min-w-[180px] px-8 text-base font-bold shadow-lg shadow-notion-blue/10">
                                  {loading ? (
                                    <span className="flex items-center gap-2">
                                      <Loader2 className="animate-spin" size={18} />
                                      <span>同步中...</span>
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-2">
                                      <Send size={18} />
                                      <span>同步此区块</span>
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <button type="button" onClick={handleNextQuestion} className="notion-btn-secondary h-[40px] border-black/10 bg-white/40 px-8 text-sm hover:brightness-95 backdrop-blur-md">
                                  下一题
                                </button>
                              )}
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>

                    <aside className="hidden min-h-0 flex-col border-l border-black/10 p-8 lg:flex">
                      <div className="mb-8 flex items-center justify-between border-b border-black/5 pb-6">
                        <div className="flex items-center gap-3">
                          {isProfileAnalysisActive ? (
                            <>
                              <Loader2 size={18} className="text-black/40 animate-spin" />
                              <span className="text-sm tracking-[0.125em] uppercase text-black">AI 正在思考中</span>
                            </>
                          ) : (
                            <>
                              <FileText size={18} className="text-black/40" />
                              <span className="text-sm tracking-[0.125em] uppercase text-black">画像演化</span>
                            </>
                          )}
                        </div>
                        {profileAnalysisStatus === "failed" && (
                          <button
                            type="button"
                            onClick={handleRetryAnalysis}
                            className="flex items-center gap-1.5 text-xs font-bold text-notion-blue hover:text-notion-blue/80 transition-colors cursor-pointer bg-transparent border-none p-0 outline-none"
                          >
                            <RotateCcw size={12} />
                            重试
                          </button>
                        )}
                      </div>

                      <div className="flex-1 space-y-6 pr-1 pb-4">
                        {snapshot.session.humanMarkdown ? (
                          <div className="notion-card-inset p-6 text-sm leading-relaxed text-black/60 whitespace-pre-wrap">
                            {snapshot.session.humanMarkdown}
                            <button type="button" onClick={handleExport} className="notion-btn-primary mt-8 w-full">
                              下载 HUMAN.md
                            </button>
                          </div>
                        ) : snapshot.session.answers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center pt-24 text-center space-y-6 opacity-20">
                            <Sparkles size={40} strokeWidth={1.5} />
                            <p className="text-xs font-black uppercase tracking-[0.2em] leading-relaxed">还有 {currentQuestions.length} 题<br />触发第一次认知</p>
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              {[
                                { title: "MBTI", guess: snapshot.session.evolvedProfile?.mbtiGuess, displayField: "code" as const },
                                { title: "九型人格", guess: snapshot.session.evolvedProfile?.enneagramGuess, displayField: "label" as const }
                              ].map(({ title, guess, displayField }) => {
                                if (!guess) return null;
                                return (
                                  <div key={title} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-sm font-bold text-black/40 shrink-0">{title}</span>
                                      <span className="text-sm font-bold text-black truncate">{guess[displayField]}</span>
                                    </div>
                                    <span className="text-xs font-bold text-black/25 shrink-0 tabular-nums">{guess.confidence}% 相似度</span>
                                  </div>
                                );
                              })}
                            </div>

                            <div>
                              <div className="space-y-1.5">
                                {allDimensions.map((dimension) => (
                                  <div
                                    key={dimension.categoryId}
                                    className={`flex items-center justify-between gap-3 py-1 transition-all duration-700 ${dimension.status === "completed"
                                      ? "opacity-100"
                                      : "opacity-25"
                                      }`}
                                  >
                                    <span className="text-sm font-medium text-black truncate">
                                      {QUESTION_CATEGORY_MAP.get(dimension.categoryId)?.title ?? dimension.categoryId}
                                    </span>
                                    <span
                                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-black uppercase tracking-widest transition-colors ${dimension.status === "completed"
                                        ? (categoryColors[dimension.categoryId] ?? "text-white bg-notion-green border-notion-green")
                                        : "text-black/20 bg-black/[0.02] border-black/5"
                                        }`}
                                    >
                                      {dimension.status === "completed" ? "已同步" : "待处理"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </aside>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
