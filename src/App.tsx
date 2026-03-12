import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileText, Loader2, Send, Terminal, Zap } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QUESTION_MAP } from "../shared/questions";
import type { SessionSnapshot } from "../shared/types";
import Silk from "./components/Silk";

const ACTIVE_SESSION_KEY = "human-disassembler.active-session-id";

const clampIndex = (value: number, length: number) => {
  if (length <= 0) return 0;
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

  const formData = new FormData(form);
  const visibleDraftAnswers = Object.fromEntries(
    questionIds.map((questionId) => [questionId, String(formData.get(questionId) ?? "").trim()] as const)
  );

  return mergeDraftAnswers(existingDraftAnswers, visibleDraftAnswers);
};

const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [status, setStatus] = useState<{ message: string; tone: "info" | "success" | "error" | "loading" }>({
    message: "准备开启探索之旅...",
    tone: "info",
  });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [logs, setLogs] = useState<{ message: string; time: string }[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const saveProgressTimerRef = useRef<number | null>(null);
  const hydratedDraftsRef = useRef<string | null>(null);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, { message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }].slice(-10));
  };

  const updateStatus = (message: string, tone: typeof status.tone = "info") => {
    setStatus({ message, tone });
    addLog(message);
  };

  const request = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "请求失败");
    return payload;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const restoreSession = async () => {
      const sessionId = window.localStorage.getItem(ACTIVE_SESSION_KEY);
      if (!sessionId) {
        setRestoring(false);
        return;
      }

      try {
        const result = await request(`/api/sessions/${sessionId}`);
        setSnapshot(result);
        const restoredIndex = clampIndex(result.session.progress?.currentQuestionIndex ?? 0, result.currentQuestions?.length ?? 0);
        setCurrentQuestionIndex(restoredIndex);
        hydratedDraftsRef.current = JSON.stringify(result.session.progress?.draftAnswers ?? {});
        updateStatus("已恢复上次访谈进度。", "success");
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
    if (!form || !snapshot) return;

    const draftAnswers = snapshot.session.progress?.draftAnswers ?? {};
    const serialized = JSON.stringify(draftAnswers);
    if (hydratedDraftsRef.current === serialized) return;

    for (const question of snapshot.currentQuestions) {
      const field = form.elements.namedItem(question.id);
      if (field instanceof HTMLTextAreaElement) {
        field.value = draftAnswers[question.id] ?? "";
      }
    }

    hydratedDraftsRef.current = serialized;
  }, [snapshot, currentQuestionIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!snapshot?.session.id) {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }

    window.localStorage.setItem(ACTIVE_SESSION_KEY, snapshot.session.id);
  }, [snapshot?.session.id]);

  useEffect(() => {
    if (!snapshot || loading) return;

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
      }).catch(() => {
        // ignore background save errors to avoid interrupting writing flow
      });
    }, 500);

    return () => {
      if (saveProgressTimerRef.current) {
        window.clearTimeout(saveProgressTimerRef.current);
      }
    };
  }, [currentQuestionIndex, snapshot, loading]);

  const handleStart = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    const formData = new FormData(e.currentTarget);
    setLoading(true);
    setLogs([]);
    updateStatus("正在初始化...", "loading");

    try {
      const result = await request("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          userName: formData.get("userName"),
          focus: formData.get("focus"),
        }),
      });
      hydratedDraftsRef.current = JSON.stringify(result.session.progress?.draftAnswers ?? {});
      setSnapshot(result);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: any) {
      updateStatus(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const simulateProgress = async (steps: string[]) => {
    for (const step of steps) {
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1000));
      addLog(step);
    }
  };

  const handleSubmitAnswers = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!snapshot || loading) return;

    const draftAnswers = getDraftAnswersFromForm(
      e.currentTarget,
      snapshot.currentQuestions.map((question) => question.id),
      snapshot.session.progress?.draftAnswers
    );
    const answers = (snapshot.currentQuestions ?? [])
      .map((q) => ({
        questionId: q.id,
        answer: draftAnswers[q.id] ?? "",
      }))
      .filter((a) => a.answer.length > 0);

    if (answers.length === 0) {
      updateStatus("请至少分享一点你的想法以继续。", "error");
      return;
    }

    setLoading(true);
    updateStatus("AI 正在细致感知你的回答...", "loading");

    const progressPromise = simulateProgress([
      "捕捉关键洞察...",
      "映射认知模型...",
      "编排深度访谈路径...",
      "同步持久化记忆..."
    ]);

    try {
      const result = await request(`/api/sessions/${snapshot.session.id}/answers`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      hydratedDraftsRef.current = JSON.stringify(result.session.progress?.draftAnswers ?? {});
      setSnapshot(result);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      updateStatus("见解已存档，开启下一阶段对话。", "success");
      e.currentTarget.reset();
    } catch (error: any) {
      updateStatus(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMarkdown = async () => {
    if (!snapshot || loading) return;

    setLoading(true);
    updateStatus("正在凝练你的 SELF-IMPROVE.md 档案...", "loading");

    simulateProgress([
      "全量扫描 100 问记录...",
      "凝练核心价值观与行为范式...",
      "映射认知地图与潜能基底...",
      "渲染标准化档案文档..."
    ]);

    try {
      const result = await request(`/api/sessions/${snapshot.session.id}/human-markdown`, {
        method: "POST",
      });
      setSnapshot(result);
      updateStatus("SELF-IMPROVE.md 档案已凝练完成。", "success");
    } catch (error: any) {
      updateStatus(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!snapshot?.session?.humanMarkdown) return;
    const blob = new Blob([snapshot.session.humanMarkdown], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${snapshot.session.userName || "my"}.SELF-IMPROVE.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const categoryColors: Record<string, string> = {
    "daily-life": "text-notion-blue bg-notion-blue/10 border-notion-blue/20",
    "mindset": "text-notion-purple bg-notion-purple/10 border-notion-purple/20",
    "dream-life": "text-notion-yellow bg-notion-yellow/10 border-notion-yellow/20",
    "past": "text-notion-orange bg-notion-orange/10 border-notion-orange/20",
    "feelings": "text-notion-red bg-notion-red/10 border-notion-red/20",
    "future-self": "text-notion-green bg-notion-green/10 border-notion-green/20",
    "self-growth": "text-notion-pink bg-notion-pink/10 border-notion-pink/20",
    "relationships": "text-notion-blue bg-notion-blue/10 border-notion-blue/20",
    "self-love": "text-notion-red bg-notion-red/10 border-notion-red/20",
    "personality": "text-notion-gray bg-notion-gray/10 border-notion-gray/20",
  };

  const statusColors = {
    info: "text-notion-secondary bg-notion-hover/10 border border-notion-border/30 shadow-sm",
    success: "text-notion-green bg-notion-green/10 border border-notion-green/40 shadow-md",
    error: "text-notion-red bg-notion-red/10 border border-notion-red/40 shadow-md",
    loading: "text-notion-blue bg-white border-2 border-notion-blue/40 shadow-xl",
  };

  const currentQuestions = snapshot?.currentQuestions ?? [];
  const currentQuestion = currentQuestions[currentQuestionIndex];

  const handleResetSession = () => {
    setSnapshot(null);
    setCurrentQuestionIndex(0);
    hydratedDraftsRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  };

  const handleDraftInput = () => {
    if (!snapshot || loading) return;

    const draftAnswers = getDraftAnswersFromForm(
      formRef.current,
      snapshot.currentQuestions.map((question) => question.id),
      snapshot.session.progress?.draftAnswers
    );

    hydratedDraftsRef.current = JSON.stringify(draftAnswers);
    setSnapshot((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        session: {
          ...prev.session,
          progress: {
            currentQuestionIndex,
            draftAnswers,
            lastSavedAt: prev.session.progress?.lastSavedAt
          }
        }
      };
    });
  };

  const currentBatchEnd = snapshot ? snapshot.answeredCount + currentQuestions.length : currentQuestions.length;
  const absoluteQuestionNumber = snapshot ? snapshot.answeredCount + currentQuestionIndex + 1 : currentQuestionIndex + 1;

  return (
    <div className="relative h-screen max-h-screen min-h-0 w-screen max-w-screen overflow-hidden selection:bg-notion-selection selection:text-notion-text font-sans bg-white text-notion-text">
      {/* Background Effect - Adjusted for density and motion */}
      <div className="fixed inset-0 z-1 pointer-events-none">
        <Silk speed={0.8} scale={1.2} noiseIntensity={1.0} color="#e5e5e0" />
      </div>

      <div 
        ref={scrollContainerRef}
        className="relative z-10 h-full w-full overflow-hidden"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-8 py-4 flex h-full min-h-0 flex-col overflow-hidden">
          {/* Header */}
          <motion.header
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-8 flex shrink-0 items-center justify-between border-b border-notion-border pb-4"
          >

            <motion.div
              whileHover={{ opacity: 0.7 }}
              className="flex items-center gap-3 cursor-pointer group"
              onClick={handleResetSession}
            >
              <div className="h-8 w-8 flex items-center justify-center rounded bg-notion-text text-white font-bold text-lg">
                S
              </div>
              <span className="text-sm font-bold tracking-tight">
                HUMAN DISASSEMBLER <span className="text-notion-secondary font-medium ml-1">/ My Archive</span>
              </span>
            </motion.div>

            {snapshot && (
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-notion-secondary">Completion</span>
                  <span className="text-xs font-bold text-notion-text">{Math.round(snapshot.completionRatio * 100)}%</span>
                </div>
                <div className="flex sm:hidden flex-col items-end">
                  <span className="text-[10px] font-bold text-notion-text">{Math.round(snapshot.completionRatio * 100)}%</span>
                </div>
                <div className="relative flex items-center justify-center w-10 h-10 group">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="20" cy="20" r="18" className="stroke-notion-border/40" strokeWidth="2" fill="transparent" />
                    <motion.circle
                      cx="20" cy="20" r="18" strokeWidth="2"
                      strokeDasharray={113.1}
                      initial={{ strokeDashoffset: 113.1 }}
                      animate={{ strokeDashoffset: 113.1 * (1 - snapshot.completionRatio) }}
                      strokeLinecap="round" fill="transparent"
                      className="stroke-notion-text"
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </svg>
                </div>
              </div>
            )}
          </motion.header>

          <main className="flex min-h-0 flex-1 flex-col justify-center">
            <AnimatePresence mode="wait">
              {!snapshot ? (
                /* Welcome Section */
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="w-full max-w-4xl"
                >
                  <div className="mb-12 sm:mb-20 relative">
                    {/* Design Element: Accent Bar */}
                    <motion.div 
                      initial={{ height: 0 }}
                      animate={{ height: "100%" }}
                      transition={{ duration: 1, delay: 0.5 }}
                      className="absolute -left-6 sm:-left-12 top-0 w-[2px] bg-notion-blue/20"
                    />
                    <motion.h1 
                      className="notion-h1 text-4xl sm:text-7xl mb-6 leading-tight"
                    >
                      凝练属于你的数字精神档案
                    </motion.h1>
                    <motion.p className="text-lg sm:text-xl text-notion-secondary/80 leading-relaxed font-sans max-w-2xl">
                      通过 100 个基于深度生命体验的探索路径，我们将为您构建一份极致简约、高度结构化的个人意识上下文。
                    </motion.p>
                  </div>

                  <div className="max-w-md">
                    <label className="notion-label mb-3">您的身份 / IDENTITY</label>
                    <form onSubmit={handleStart} className="flex flex-col gap-4">
                        <input
                          name="userName"
                          required
                          autoFocus
                          className="notion-input h-11"
                          placeholder="例如：Parallized..."
                        />
                        <button
                          type="submit"
                          disabled={loading}
                          className="notion-btn-primary h-11 w-fit min-w-[140px] px-8"
                        >
                          {loading ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="animate-spin" size={18} />
                              <span>{status.message}</span>
                            </div>
                          ) : (
                            <span>开始探索之旅</span>
                          )}
                        </button>
                    </form>

                    {restoring ? (
                      <p className="mt-4 text-sm text-notion-secondary/70">正在检查是否有可恢复的访谈进度...</p>
                    ) : null}

                    {!restoring && typeof window !== "undefined" && window.localStorage.getItem(ACTIVE_SESSION_KEY) ? (
                      <p className="mt-4 text-sm text-notion-secondary/70">
                        检测到本地保存的访谈记录，若未自动续接，可刷新页面后重试。
                      </p>
                    ) : null}
                  </div>
                  
                </motion.div>
              ) : (
                /* Interview Section */
                <motion.section
                  key="interview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex h-full min-h-0 flex-col overflow-hidden"
                >
                  <div className="grid h-full min-h-0 items-stretch gap-12 overflow-hidden lg:grid-cols-[1fr_300px]">
                    <div className="flex h-full min-h-0 flex-col overflow-hidden">
                      <AnimatePresence mode="wait">
                        {snapshot.isComplete ? (
                          <motion.div
                            key="complete"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex-1 flex flex-col items-center justify-center p-12 text-center"
                          >
                            <div className="h-16 w-16 flex items-center justify-center rounded-2xl bg-notion-green/10 text-notion-green mb-8">
                              <CheckCircle2 size={32} />
                            </div>
                            <h3 className="notion-h1 text-3xl mb-4">探索节点同步完成</h3>
                            <p className="text-notion-secondary mb-10 max-w-sm mx-auto">
                              您的 100 问探索已完美闭环。点击下方按钮开始编译您的最终数字档案。
                            </p>
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              onClick={handleGenerateMarkdown}
                              disabled={loading}
                              className="notion-btn-primary h-12 px-10 text-base min-w-[200px]"
                            >
                              {loading ? (
                                <div className="flex items-center gap-2">
                                  <Loader2 className="animate-spin" size={20} />
                                  <span>{status.message}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Zap className="text-notion-yellow" size={20} fill="currentColor" />
                                  <span>凝练最终档案</span>
                                </div>
                              )}
                            </motion.button>
                          </motion.div>
                        ) : (
                          <motion.form
                            key="question-form"
                            ref={formRef}
                            onSubmit={handleSubmitAnswers}
                            onInput={handleDraftInput}
                            className="flex min-h-0 flex-1 flex-col overflow-hidden"
                          >
                            <div className="flex-1 min-h-0 relative flex flex-col pt-4">
                              <AnimatePresence mode="popLayout" custom={direction} initial={false}>
                                {currentQuestions.map((question, index) => (
                                  index === currentQuestionIndex && (
                                    <motion.div
                                      key={question.id}
                                      custom={direction}
                                      variants={{
                                        enter: (d: number) => ({ opacity: 0, y: d > 0 ? 10 : -10 }),
                                        center: { opacity: 1, y: 0 },
                                        exit: (d: number) => ({ opacity: 0, y: d > 0 ? -10 : 10 })
                                      }}
                                      initial="enter"
                                      animate="center"
                                      exit="exit"
                                      transition={{ duration: 0.3 }}
                                      className="absolute inset-0 flex flex-col"
                                    >
                                      <div className="flex items-center gap-2 mb-6 text-notion-secondary">
                                        <span className="notion-badge bg-notion-hover text-notion-secondary border-none lowercase font-medium">
                                          {question.categoryId}
                                        </span>
                                      </div>
                                      
                                      <h2 className="notion-h1 text-2xl sm:text-4xl leading-tight mb-8">
                                        {question.prompt}
                                      </h2>
                                      
                                      <textarea
                                        name={question.id}
                                        autoFocus
                                        defaultValue={snapshot.session.progress?.draftAnswers?.[question.id] ?? ""}
                                        className="flex-1 bg-[#f7f6f3]/30 border-none rounded-lg p-6 text-lg leading-relaxed outline-none focus:bg-[#f7f6f3]/50 transition-all resize-none placeholder-notion-secondary/30"
                                        placeholder="记录您的见解与意识回响..."
                                      ></textarea>
                                    </motion.div>
                                  )
                                ))}
                              </AnimatePresence>
                            </div>

                            <div className="flex items-center gap-4 mt-8 pt-6 border-t border-notion-border">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDirection(-1);
                                    setCurrentQuestionIndex(prev => Math.max(0, prev - 1));
                                  }}
                                  disabled={currentQuestionIndex === 0 || loading}
                                  className="p-2 hover:bg-notion-hover rounded transition-colors disabled:opacity-0"
                                >
                                  <ChevronLeft size={20} />
                                </button>
                                <div className="text-[11px] font-bold font-mono text-notion-secondary px-2">
                                  {absoluteQuestionNumber} / {currentBatchEnd}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDirection(1);
                                    setCurrentQuestionIndex(prev => Math.min(currentQuestions.length - 1, prev + 1));
                                  }}
                                  disabled={currentQuestionIndex === currentQuestions.length - 1 || loading}
                                  className="p-2 hover:bg-notion-hover rounded transition-colors disabled:opacity-0"
                                >
                                  <ChevronRight size={20} />
                                </button>
                              </div>

                              <div className="flex-1"></div>

                              {currentQuestionIndex === currentQuestions.length - 1 ? (
                                <button
                                  type="submit"
                                  disabled={loading}
                                  className="notion-btn-primary h-10 px-6 min-w-[160px]"
                                >
                                  {loading ? (
                                    <div className="flex items-center gap-2">
                                      <Loader2 className="animate-spin" size={18} />
                                      <span>{status.message}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Send size={18} />
                                      <span>同步意识片段</span>
                                    </div>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDirection(1);
                                    setCurrentQuestionIndex(prev => Math.min(currentQuestions.length - 1, prev + 1));
                                  }}
                                  className="notion-btn-secondary h-10 px-6 border-none hover:bg-notion-hover"
                                >
                                  下一题
                                </button>
                              )}
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>

                    <aside className="hidden lg:flex flex-col min-h-0 border-l border-notion-border bg-[#fbfbfa]/50 pl-8 pt-4">
                      <div className="flex items-center gap-2 mb-6">
                        <FileText size={16} className="text-notion-secondary" />
                        <span className="notion-label mb-0">记录集 / SNAPSHOTS</span>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                        {snapshot.session.humanMarkdown ? (
                          <div className="font-mono text-[11px] leading-relaxed text-notion-secondary whitespace-pre-wrap bg-[#f7f6f3] p-4 rounded-lg">
                            {snapshot.session.humanMarkdown}
                            <button onClick={handleExport} className="mt-4 block text-notion-blue hover:underline">导出为 MD</button>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {snapshot.session.answers.length === 0 ? (
                              <div className="pt-10 text-center opacity-30 italic text-sm">
                                尚未录入意识片段...
                              </div>
                            ) : (
                              [...snapshot.session.answers].reverse().map((answer, i) => {
                                const question = QUESTION_MAP.get(answer.questionId);
                                return (
                                  <motion.div
                                    key={answer.questionId}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="group"
                                  >
                                    <div className="text-[10px] font-bold text-notion-secondary/40 mb-1 flex justify-between">
                                      <span>{question?.categoryId}</span>
                                      <span>{new Date(answer.answeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <h4 className="text-[12px] font-bold mb-1 group-hover:text-notion-blue transition-colors leading-snug">
                                      {question?.prompt}
                                    </h4>
                                    <p className="text-[12px] text-notion-secondary line-clamp-2">
                                      {answer.answer}
                                    </p>
                                  </motion.div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </aside>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </main>

          <motion.footer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-bold text-notion-secondary/30 py-6 border-t border-notion-border"
          >
            <div className="flex gap-4 sm:gap-6">
              <span>&copy; 2026 SELF-IMPROVE</span>
              <span className="cursor-pointer hover:text-notion-secondary">Protocol v2.1</span>
            </div>
            <div className="flex gap-4 sm:gap-6">
              <span className="cursor-pointer hover:text-notion-secondary underline underline-offset-4">Privacy Existence</span>
              <span className="cursor-pointer hover:text-notion-secondary underline underline-offset-4">Archive License</span>
            </div>
          </motion.footer>
        </div>
      </div>
    </div>
  );
};

export default App;



