import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileText, Loader2, Send, Terminal, Zap } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SessionSnapshot } from "../shared/types";
import Silk from "./components/Silk";

const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "info" | "success" | "error" | "loading" }>({
    message: "准备开启探索之旅...",
    tone: "info",
  });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [logs, setLogs] = useState<{ message: string; time: string }[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
    setCurrentQuestionIndex(0);
  }, [snapshot?.currentQuestions]);

  const handleStart = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;

    const formData = new FormData(e.currentTarget);
    setLoading(true);
    setLogs([]);
    updateStatus("正在构建个人探索空间...", "loading");

    try {
      const result = await request("/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          userName: formData.get("userName"),
          focus: formData.get("focus"),
        }),
      });
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

    const formData = new FormData(e.currentTarget);
    const answers = (snapshot.currentQuestions ?? [])
      .map((q) => ({
        questionId: q.id,
        answer: String(formData.get(q.id) ?? "").trim(),
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

  return (
    <div className="relative h-screen max-h-screen min-h-0 w-screen max-w-screen overflow-hidden selection:bg-notion-selection selection:text-notion-text font-sans bg-white">
      {/* Background Effect */}
      <div className="absolute inset-0 z-0 opacity-50 pointer-events-none">
        <Silk color="#2383e2" speed={1} scale={0.7} />
      </div>

      <div 
        ref={scrollContainerRef}
        className="relative z-10 h-full w-full overflow-hidden"
      >
        <div className="mx-auto max-w-6xl px-6 py-4 text-notion-text flex h-full min-h-0 flex-col overflow-hidden">
          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-4 sm:mb-4 lg:mb-4"
          >
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-4 group cursor-pointer"
              onClick={() => setSnapshot(null)}
            >
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-notion-text text-white font-black text-2xl shadow-lg group-hover:rotate-6 transition-transform">
                S
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-black tracking-tight leading-none">
                  SELF-IMPROVE<span className="text-notion-secondary font-bold">.md</span>
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-notion-secondary/40 font-black mt-0.5">Human Disassembler</span>
              </div>
            </motion.div>
            {snapshot && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-4 sm:gap-6"
              >
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest text-notion-secondary/60">Completion</span>
                  <span className="text-sm font-black">{Math.round(snapshot.completionRatio * 100)}%</span>
                </div>

                <div className="relative flex items-center justify-center w-14 h-14 group">
                  <svg className="w-full h-full -rotate-90 drop-shadow-sm">
                    <circle cx="28" cy="28" r="24" className="stroke-notion-border/40" strokeWidth="4" fill="transparent" />
                    <motion.circle
                      cx="28" cy="28" r="24" strokeWidth="4"
                      strokeDasharray={150.8}
                      initial={{ strokeDashoffset: 150.8 }}
                      animate={{ strokeDashoffset: 150.8 * (1 - snapshot.completionRatio) }}
                      strokeLinecap="round" fill="transparent"
                      className="stroke-notion-text"
                      transition={{ duration: 1.5, ease: [0.34, 1.56, 0.64, 1] }}
                    />
                  </svg>
                  <span className="absolute text-[11px] font-black group-hover:scale-110 transition-transform">{Math.round(snapshot.completionRatio * 100)}%</span>
                </div>
              </motion.div>
            )}
          </motion.header>

          <main className="flex min-h-0 flex-1 flex-col justify-center">
            <AnimatePresence mode="wait">
              {!snapshot ? (
                /* Welcome Section */
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, x: -40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="mx-auto w-full max-w-4xl py-6 px-4"
                >
                  <div>
                    <motion.h1
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.8 }}
                      className="mb-6 text-4xl font-black leading-[0.96] tracking-tighter text-notion-text sm:text-5xl lg:text-7xl"
                    >
                      凝练属于你的<br />
                      <span className="text-transparent bg-clip-text bg-gradient-to-br from-notion-text via-notion-text to-notion-secondary/20">数字精神档案</span>
                    </motion.h1>
                    <motion.p
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.8 }}
                      className="mb-8 max-w-2xl text-base font-medium leading-relaxed text-notion-secondary sm:text-lg lg:mb-10 lg:text-xl"
                    >
                      通过 100 个深度探索路径，我们将为您构建一份极致简约、高度结构化的个人上下文档案。
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.8 }}
                      className="mb-8 max-w-xl lg:mb-10"
                    >
                      <label className="text-[11px] uppercase tracking-[0.2em] text-notion-secondary/40 font-black ml-1 mb-3 block">
                        如何称呼 / IDENTITY
                      </label>
                      <form onSubmit={handleStart} className="group grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[minmax(0,1fr),auto] sm:items-center">
                          <div className="relative flex-1 min-w-0 transition-all focus-within:-translate-y-1">
                            <input
                              name="userName"
                              required
                              autoFocus
                              className="notion-input h-12 px-5 text-base shadow-sm border-notion-border/40 hover:border-notion-border/80 transition-all bg-white/70 backdrop-blur-md rounded-xl"
                              placeholder="例如：Parallized"
                            />
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.05, y: -4 }}
                            whileTap={{ scale: 0.95 }}
                            type="submit"
                            disabled={loading}
                            className="notion-btn-primary h-12 px-8 w-fit text-base shadow-2xl shadow-notion-text/10 shrink-0 rounded-xl font-black"
                          >
                            开始访谈
                            {!loading && <ChevronRight size={20} />}
                          </motion.button>
                      </form>
                    </motion.div>

                    <AnimatePresence>
                      {status.message !== "准备开启探索之旅..." && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className={`mb-10 text-[13px] font-black uppercase tracking-wider ${statusColors[status.tone]} px-6 py-4 rounded-2xl inline-flex items-center gap-4 shadow-2xl`}
                        >
                          {status.tone === "loading" && <Loader2 size={18} className="animate-spin text-notion-blue" />}
                          {status.tone === "success" && <CheckCircle2 size={18} className="text-notion-green" />}
                          {status.tone === "error" && <AlertCircle size={18} className="text-notion-red" />}
                          {status.message}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : (
                /* Interview Section */
                <motion.section
                  key="interview"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.6 }}
                  className="flex h-full min-h-0 flex-col overflow-hidden"
                >
                  <div className="grid h-full min-h-0 items-stretch gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:gap-6 2xl:gap-8">
                    <div className="flex h-full min-h-0 flex-col overflow-hidden">
                      <AnimatePresence mode="wait">
                        {snapshot.isComplete ? (
                          <motion.div
                            key="complete"
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex-1 flex flex-col items-center justify-center p-8 text-center border border-notion-border bg-white/50 backdrop-blur-xl rounded-3xl shadow-2xl shadow-notion-border/20"
                          >
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", damping: 12 }}
                              className="h-20 w-20 flex items-center justify-center rounded-3xl bg-notion-green text-white mb-8 shadow-xl shadow-notion-green/30"
                            >
                              <CheckCircle2 size={40} />
                            </motion.div>
                            <h3 className="text-3xl font-black mb-4 tracking-tighter">所有探索节点已完成</h3>
                            <p className="text-base text-notion-secondary font-medium mx-auto max-w-sm mb-8">您的 100 问探索已完美闭环。现在，请点击下方按钮，凝练属于您的终极数字档案。</p>
                            <motion.button
                              whileHover={{ scale: 1.05, y: -4 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleGenerateMarkdown}
                              disabled={loading}
                              className="notion-btn-primary h-14 px-10 text-lg shadow-2xl shadow-notion-text/20 rounded-2xl font-black"
                            >
                              {loading ? <Loader2 className="animate-spin mr-3" size={24} /> : <Zap className="mr-3 text-notion-yellow" size={24} fill="currentColor" />}
                              凝练最终档案
                            </motion.button>
                          </motion.div>
                        ) : (
                          <motion.form
                            key="question-form"
                            ref={formRef}
                            onSubmit={handleSubmitAnswers}
                            className="flex min-h-0 flex-1 flex-col overflow-hidden"
                          >
                            <div className="relative flex-1 min-h-0 overflow-hidden">
                              <AnimatePresence mode="wait">
                                {currentQuestions.map((question, index) => (
                                  index === currentQuestionIndex && (
                                    <motion.div
                                      key={question.id}
                                      initial={{ opacity: 0, x: 20 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      exit={{ opacity: 0, x: -20 }}
                                      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                                      className="absolute inset-0 flex flex-col"
                                    >
                                      <div className="flex items-start gap-4 mb-6 shrink-0">
                                        <h2 className="text-2xl sm:text-4xl font-black leading-[1.1] tracking-tighter text-notion-text">
                                          {question.prompt}
                                        </h2>
                                        <motion.span
                                          layoutId="category-badge"
                                          className={`notion-badge ${categoryColors[question.categoryId] || 'text-notion-gray bg-notion-gray/10 border-notion-gray/20'} px-3 py-1.5 rounded-lg text-[9px] font-black shadow-sm shrink-0 mt-1`}
                                        >
                                          {question.categoryId}
                                        </motion.span>
                                      </div>
                                      <textarea
                                        name={question.id}
                                        autoFocus
                                        className="notion-input min-h-[220px] flex-1 resize-y text-base leading-relaxed shadow-inner shadow-notion-text/5 transition-all focus:shadow-xl focus:shadow-notion-blue/5 sm:min-h-[260px] sm:px-6 sm:py-5 sm:text-lg xl:resize-none"
                                        placeholder="输入您的见解与共鸣..."
                                      ></textarea>
                                    </motion.div>
                                  )
                                ))}
                              </AnimatePresence>
                            </div>

                            <div className="flex items-center justify-center gap-8 py-6 border-t border-notion-border/30 shrink-0">
                              <motion.button
                                whileHover={{ x: -4, scale: 1.02 }}
                                whileTap={{ scale: 0.95 }}
                                type="button"
                                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                                disabled={currentQuestionIndex === 0 || loading}
                                className="notion-btn-secondary h-10 px-5 shadow-sm rounded-xl font-black text-[10px] tracking-widest"
                                title="上一题"
                              >
                                <ChevronLeft size={16} />
                                上一题
                              </motion.button>

                              <div className="flex items-center gap-2 rounded-2xl border border-notion-border/30 bg-white px-3 py-2 text-[10px] font-black font-mono shadow-sm sm:px-5 sm:py-2.5 sm:text-[11px]">
                                <span className="text-notion-text">{currentQuestionIndex + 1}</span>
                                <span className="font-sans text-notion-secondary/20">/</span>
                                <span className="text-notion-secondary/60">{currentQuestions.length}</span>
                              </div>

                              <div className="flex items-center gap-4">
                                {currentQuestionIndex < currentQuestions.length - 1 ? (
                                  <motion.button
                                    whileHover={{ x: 4, scale: 1.02 }}
                                    whileTap={{ scale: 0.95 }}
                                    type="button"
                                    onClick={() => setCurrentQuestionIndex(prev => Math.min(currentQuestions.length - 1, prev + 1))}
                                    disabled={loading}
                                    className="notion-btn-secondary h-10 px-5 shadow-sm group rounded-xl font-black text-[10px] tracking-widest border-notion-blue/20 text-notion-blue hover:bg-notion-blue/5"
                                    title="下一题"
                                  >
                                    下一题
                                    <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                  </motion.button>
                                ) : (
                                  <motion.button
                                    whileHover={{ scale: 1.05, y: -4 }}
                                    whileTap={{ scale: 0.95 }}
                                    type="submit"
                                    disabled={loading}
                                    className="notion-btn-primary h-10 rounded-xl px-6 font-black shadow-xl shadow-notion-text/10 sm:px-8"
                                  >
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                    <span>完成同步</span>
                                  </motion.button>
                                )}
                              </div>
                            </div>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>

                    <aside className="flex h-full min-h-0 flex-col overflow-hidden">
                      {/* Archive Preview */}
                      <div className="group flex h-full min-h-0 flex-col overflow-hidden">
                        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 px-1 sm:mb-4">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-1.5 rounded-xl bg-white shadow-sm border border-notion-border/20">
                              <FileText size={14} className="text-notion-text" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-notion-secondary/60">档案预览 / Snapshot</span>
                          </div>
                          {snapshot.session.humanMarkdown && (
                            <motion.button
                              whileHover={{ scale: 1.05, y: -2 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleExport}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest text-notion-blue bg-notion-blue/5 border border-notion-blue/10 hover:bg-notion-blue/10 transition-all shadow-sm"
                            >
                              <Download size={10} />
                              EXPORT
                            </motion.button>
                          )}
                        </div>

                        <div className="notion-card-inset relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-notion-border/30 bg-white/50 transition-colors group-hover:border-notion-border/70">
                          <div className="h-8 bg-notion-hover/5 border-b border-notion-border/10 flex items-center px-4 gap-2 shrink-0">
                            <div className="w-2 h-2 rounded-full bg-notion-red/40" />
                            <div className="w-2 h-2 rounded-full bg-notion-yellow/40" />
                            <div className="w-2 h-2 rounded-full bg-notion-green/40" />
                            <span className="ml-2 text-[9px] font-black font-mono text-notion-secondary/30 tracking-widest uppercase">SELF-IMPROVE.md</span>
                          </div>
                          <textarea
                            readOnly
                            className="font-mono block min-h-full w-full flex-1 resize-none border-none bg-transparent p-4 text-[12px] leading-relaxed text-notion-text/80 outline-none placeholder-notion-secondary/10 selection:bg-notion-blue/10 sm:p-6"
                            placeholder="# 这里将实时映射你的档案内容 ..."
                            value={snapshot.session.humanMarkdown ?? ""}
                          ></textarea>
                        </div>
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
            transition={{ delay: 1 }}
            className="mt-4 shrink-0 border-t border-notion-border/40 pt-4 text-center sm:mt-6 sm:pt-6 lg:mt-8"
          >
            <p className="text-[11px] uppercase tracking-[0.125em] text-notion-secondary/30">
              &copy; 2026 SELF-IMPROVE.md &bull; POWERED BY PARALLIZED
            </p>
          </motion.footer>
        </div>
      </div>
    </div>
  );
};

export default App;



