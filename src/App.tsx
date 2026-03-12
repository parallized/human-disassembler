import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FileText, Loader2, Send, Terminal, Zap } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "../shared/types";

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
      window.scrollTo({ top: 0, behavior: "smooth" });
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
      window.scrollTo({ top: 0, behavior: "smooth" });
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
    info: "text-notion-secondary",
    success: "text-notion-green bg-notion-green/5 border border-notion-green/10",
    error: "text-notion-red bg-notion-red/5 border border-notion-red/10",
    loading: "text-notion-blue animate-pulse",
  };

  const currentQuestions = snapshot?.currentQuestions ?? [];
  const currentQuestion = currentQuestions[currentQuestionIndex];

  return (
    <div className="min-h-screen notion-dot-bg selection:bg-notion-selection selection:text-notion-text">
      <div className="mx-auto max-w-6xl px-6 py-12 text-notion-text">
        {/* Header */}
        <header className="mb-20 flex items-center justify-between">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setSnapshot(null)}>
            <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-notion-text text-white font-bold text-xl shadow-lg group-hover:rotate-3 transition-transform">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight leading-none">
                SELF-IMPROVE<span className="text-notion-secondary font-medium">.md</span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-notion-secondary/50">Human Disassembler</span>
            </div>
          </div>
          {snapshot && (
            <div className="flex items-center gap-6">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] font-black uppercase tracking-widest text-notion-secondary">当前进度</span>
                <span className="text-sm font-bold">{Math.round(snapshot.completionRatio * 100)}% 已完成</span>
              </div>

              <div className="relative flex items-center justify-center w-14 h-14 group">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="28" cy="28" r="24" className="stroke-notion-border" strokeWidth="3" fill="transparent" />
                  <circle cx="28" cy="28" r="24" strokeWidth="3" 
                    strokeDasharray={150.8} 
                    strokeDashoffset={150.8 * (1 - snapshot.completionRatio)} 
                    strokeLinecap="round" fill="transparent" 
                    className="stroke-notion-text transition-all duration-1000 ease-in-out"
                  />
                </svg>
                <span className="absolute text-xs font-black group-hover:scale-110 transition-transform">{Math.round(snapshot.completionRatio * 100)}%</span>
              </div>
            </div>
          )}
        </header>

        <main className="animate-[fade-in_0.6s_ease-out_forwards]">
          {!snapshot ? (
            /* Welcome Section */
            <div className="max-w-4xl">
              <div className="mb-16">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-notion-blue/10 text-notion-blue text-[12px] font-bold uppercase tracking-wider mb-6">
                  <Zap size={12} fill="currentColor" />
                  Protocol 100-Nodes
                </div>
                <h1 className="notion-h1">
                  凝练属于你的<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-notion-text to-notion-secondary/40">数字精神档案</span>
                </h1>
                <p className="notion-p">
                  通过 100 个深度探索路径，结合 AI 的动态感知，我们将为您构建一份极致简约、高度结构化的个人上下文档案。这不仅是对话，更是对自我的重新编排。
                </p>
              
                <section className="mt-16 flex flex-wrap items-center gap-x-12 gap-y-6 opacity-20 hover:opacity-50 transition-opacity duration-500">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-notion-text/20" />
                    <span className="text-sm font-bold tracking-tight">Anthropic</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-notion-text/20" />
                    <span className="text-sm font-bold tracking-tight uppercase">OpenAI</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Terminal size={18} />
                    <span className="text-sm font-bold tracking-tight uppercase">Markdown</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock size={18} />
                    <span className="text-sm font-bold tracking-tight uppercase">100 Nodes</span>
                  </div>
                </section>
              </div>

              <section className="notion-card max-w-2xl relative">
                <div className="p-8 sm:p-12">
                  <div className="flex items-center gap-3 mb-10">
                    <div className="p-2.5 rounded-xl bg-notion-hover/5 border border-notion-border">
                      <Send size={20} className="text-notion-text" />
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-notion-text">开启探索之旅</h2>
                  </div>

                  <form onSubmit={handleStart} className="space-y-10">
                    <div className="space-y-3">
                      <label className="notion-label">
                        你的名字或代号
                      </label>
                      <input
                        name="userName"
                        required
                        autoFocus
                        className="notion-input h-14 text-lg"
                        placeholder="例如：Parallized"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="notion-label">
                        （可选）您更希望侧重的主题
                      </label>
                      <textarea
                        name="focus"
                        rows={3}
                        className="notion-input min-h-[140px] py-4 text-lg leading-relaxed"
                        placeholder="例如：职业转型、认知盲点、长期愿景……"
                      ></textarea>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-6">
                      <button
                        type="submit"
                        disabled={loading}
                        className="notion-btn-primary h-14 px-12 text-lg w-full sm:w-auto shadow-xl shadow-notion-text/10"
                      >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : "开始访谈"}
                        {!loading && <ChevronRight size={20} />}
                      </button>
                      <div className={`text-sm font-bold ${statusColors[status.tone]} px-4 py-2 rounded-lg transition-all`}>
                        {status.message}
                      </div>
                    </div>
                  </form>
                </div>
              </section>
            </div>
          ) : (
            /* Interview Section */
            <section className="space-y-16 animate-[fade-in_0.6s_ease-out_forwards]">
              <div className="grid gap-12 lg:grid-cols-[1fr_400px] items-start">
                <div className="space-y-12">
                  {snapshot.isComplete ? (
                    <div className="p-16 text-center border border-notion-border bg-white rounded-2xl shadow-xl shadow-notion-border/20">
                      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-notion-green text-white mb-8 shadow-lg shadow-notion-green/20">
                        <CheckCircle2 size={40} />
                      </div>
                      <h3 className="text-3xl font-bold mb-4 tracking-tight">所有探索节点已完成</h3>
                      <p className="notion-p mx-auto text-base">您的 100 问探索已完美闭环。现在，请点击下方按钮，凝练属于您的终极数字档案。</p>
                      <button
                        onClick={handleGenerateMarkdown}
                        disabled={loading}
                        className="mt-10 notion-btn-primary h-16 px-16 text-lg shadow-2xl shadow-notion-text/20"
                      >
                        {loading ? <Loader2 className="animate-spin mr-2" /> : <Zap className="mr-2" size={24} />}
                        凝练最终档案
                      </button>
                    </div>
                  ) : (
                    <form ref={formRef} onSubmit={handleSubmitAnswers} className="space-y-12">
                      <div className="relative min-h-[480px]">
                        {currentQuestions.map((question, index) => (
                          <div
                            key={question.id}
                            className={`transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                              index === currentQuestionIndex 
                                ? "opacity-100 translate-y-0 relative scale-100" 
                                : "opacity-0 absolute inset-0 pointer-events-none translate-y-12 scale-[0.98]"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-10">
                              <div className="flex items-center gap-4">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-notion-text text-[14px] font-black text-white shadow-md">
                                  {snapshot.answeredCount + index + 1}
                                </span>
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-notion-secondary/60">
                                    Node Exploration
                                  </span>
                                  <span className="text-sm font-bold text-notion-text">
                                    节点 {snapshot.answeredCount + index + 1} / 100
                                  </span>
                                </div>
                              </div>
                              <span className={`notion-badge ${categoryColors[question.categoryId] || 'text-notion-gray bg-notion-gray/10 border-notion-gray/20'} px-3 py-1.5`}>
                                {question.categoryId}
                              </span>
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-bold leading-snug mb-10 tracking-tight text-notion-text">
                              {question.prompt}
                            </h2>
                            <textarea
                              name={question.id}
                              rows={12}
                              autoFocus
                              className="notion-input min-h-[280px] text-lg py-6 leading-relaxed bg-white/50 backdrop-blur-sm shadow-sm"
                              placeholder="输入您的见解与共鸣..."
                            ></textarea>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-12 border-t border-notion-border/60 relative min-h-[100px]">
                        <button
                          type="button"
                          onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                          disabled={currentQuestionIndex === 0 || loading}
                          className="notion-btn-secondary h-12 px-6 shadow-sm"
                          title="上一题"
                        >
                          <ChevronLeft size={20} />
                          <span className="text-sm">BACK</span>
                        </button>

                        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-notion-hover/5 border border-notion-border/40 text-sm font-black font-mono">
                          <span className="text-notion-text">{currentQuestionIndex + 1}</span>
                          <span className="text-notion-secondary/30">/</span>
                          <span className="text-notion-secondary">{currentQuestions.length}</span>
                        </div>

                        <div className="flex items-center gap-4">
                          {currentQuestionIndex < currentQuestions.length - 1 ? (
                            <button
                              type="button"
                              onClick={() => setCurrentQuestionIndex(prev => Math.min(currentQuestions.length - 1, prev + 1))}
                              disabled={loading}
                              className="notion-btn-secondary h-12 px-6 shadow-sm group"
                              title="下一题"
                            >
                              <span className="text-sm">NEXT</span>
                              <ChevronRight size={20} className="group-hover:translate-x-0.5 transition-transform" />
                            </button>
                          ) : (
                            <button
                              type="submit"
                              disabled={loading}
                              className="notion-btn-primary h-12 px-10 shadow-xl shadow-notion-text/10"
                            >
                              {loading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                              <span>完成同步</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </form>
                  )}
                </div>

                <aside className="space-y-8 lg:sticky lg:top-12">
                  {/* Insight Suggestions */}
                  <div className="notion-callout bg-white border-notion-border shadow-sm group hover:shadow-md transition-shadow">
                    <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-notion-blue/10 text-notion-blue group-hover:scale-110 transition-transform">
                      <Zap size={20} fill="currentColor" className="animate-[pulse-subtle_2s_ease-in-out_infinite]" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-notion-blue flex items-center gap-2">
                        洞察建议 / Insight
                      </h4>
                      <p className="text-[13px] leading-relaxed text-notion-secondary font-medium">
                        {currentQuestion?.categoryId === 'daily-life' ? "试着描述一个具体的瞬间。细节越多，AI 对你的还原就越真实。" : 
                         currentQuestion?.categoryId === 'mindset' ? "不要担心答案是否正确，这里只有最真实的你。挖掘深层的动机。" :
                         "深呼吸，试着跳出当下的角色。每一个回答都是对未来的投资。"}
                      </p>
                    </div>
                  </div>

                  {/* Archive Preview */}
                  <div className="relative group">
                    <div className="flex items-center justify-between mb-4 px-1">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-notion-hover/10">
                          <FileText size={16} className="text-notion-secondary" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-notion-secondary">档案预览 / Snapshot</span>
                      </div>
                      {snapshot.session.humanMarkdown && (
                        <button
                          onClick={handleExport}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-notion-blue hover:bg-notion-blue/5 transition-colors"
                        >
                          <Download size={12} />
                          EXPORT
                        </button>
                      )}
                    </div>
                    
                    <div className="notion-card-inset relative overflow-hidden group-hover:border-notion-border transition-colors">
                      <div className="absolute top-0 left-0 right-0 h-8 bg-notion-hover/5 border-b border-notion-border/40 flex items-center px-4 gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-notion-border/40" />
                        <div className="w-2.5 h-2.5 rounded-full bg-notion-border/40" />
                        <div className="w-2.5 h-2.5 rounded-full bg-notion-border/40" />
                        <span className="ml-2 text-[10px] font-mono text-notion-secondary/40">SELF-IMPROVE.md</span>
                      </div>
                      <textarea
                        readOnly
                        className="font-mono block w-full resize-none bg-transparent text-[13px] leading-relaxed outline-none border-none p-6 pt-12 placeholder-notion-secondary/20 selection:bg-notion-blue/10 min-h-[450px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        placeholder="# 这里将实时映射你的档案内容 ..."
                        value={snapshot.session.humanMarkdown ?? ""}
                      ></textarea>
                    </div>
                  </div>

                  {/* System Logs / Thinking Console */}
                  <div className="notion-card-inset border-notion-blue/10 bg-notion-blue/5 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-notion-blue flex items-center gap-2">
                        <Terminal size={14} />
                        思维进程 / Thinking
                      </h4>
                      {loading && <div className="h-1.5 w-1.5 rounded-full bg-notion-blue animate-ping" />}
                    </div>
                    <div className="space-y-3 max-h-[160px] overflow-y-auto font-mono [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                      {logs.length === 0 ? (
                        <div className="text-[11px] text-notion-secondary/40 italic">等待系统指令...</div>
                      ) : (
                        logs.map((log, i) => (
                          <div key={i} className="flex gap-3 text-[11px] animate-[fade-in_0.6s_ease-out_forwards]">
                            <span className="text-notion-secondary/30 shrink-0">[{log.time}]</span>
                            <span className={i === logs.length - 1 ? "text-notion-blue font-bold" : "text-notion-secondary"}>
                              {log.message}
                            </span>
                          </div>
                        ))
                      )}
                      <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
                    </div>
                  </div>
                </aside>
              </div>
            </section>
          )}
        </main>

        <footer className="mt-40 border-t border-notion-border/40 pt-16 pb-20 text-center">
          <div className="flex items-center justify-center gap-4 mb-8 grayscale opacity-30 hover:opacity-60 transition-opacity">
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Self-Improve</span>
            <div className="w-1.5 h-1.5 rounded-full bg-notion-border" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">Neural Mapping</span>
            <div className="w-1.5 h-1.5 rounded-full bg-notion-border" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em]">100 Nodes</span>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-notion-secondary/30">
            &copy; 2026 SELF-IMPROVE.md &bull; POWERED BY PARALLIZED
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
