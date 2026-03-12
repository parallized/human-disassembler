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
      updateStatus("空间已就绪，期待你的见解。", "success");
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
    updateStatus("正在凝练你的 HUMAN.md 档案...", "loading");
    
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
      updateStatus("HUMAN.md 档案已凝练完成。", "success");
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
    link.download = `${snapshot.session.userName || "my"}.HUMAN.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const statusColors = {
    info: "text-notion-secondary",
    success: "text-emerald-600 bg-emerald-50 border border-emerald-100",
    error: "text-rose-600 bg-rose-50 border border-rose-100",
    loading: "text-notion-blue animate-pulse",
  };

  const currentQuestions = snapshot?.currentQuestions ?? [];
  const currentQuestion = currentQuestions[currentQuestionIndex];

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 text-notion-text selection:bg-notion-selection">
      {/* Header */}
      <header className="mb-24 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 flex items-center justify-center rounded bg-notion-text text-white font-bold text-sm">
            H
          </div>
          <span className="text-xl font-bold tracking-tight">
            HUMAN<span className="text-notion-secondary">.md</span>
          </span>
        </div>
        {snapshot && (
          <div className="flex items-center gap-2 rounded-full border border-notion-border bg-white px-3 py-1.5 text-xs font-medium text-notion-secondary shadow-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${snapshot.aiConfigured ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-slate-300"}`}></span>
            <span>{snapshot.aiConfigured ? "AI Active" : "Local Mode"}</span>
          </div>
        )}
      </header>

      <main>
        {!snapshot ? (
          /* Welcome Section - More Notion-like Document Feel */
          <div className="max-w-4xl mx-auto">
            <div className="mb-20">
              <h1 className="text-4xl sm:text-6xl font-bold leading-tight mb-8">
                凝练属于你的人生坐标
              </h1>
              <p className="text-lg text-notion-secondary leading-relaxed font-normal">
                通过 100 个精心设计的自我探索路径，结合 AI 的动态共鸣，为你构建一份极致简约、结构化的个人上下文档案。
              </p>
            
            <section className="border-t border-notion-border pt-4 opacity-40">
              <div className="flex flex-wrap items-center justify-start gap-12 grayscale">
                <span className="text-lg font-bold tracking-tighter">Anthropic</span>
                <span className="text-lg font-bold tracking-tighter">OpenAI</span>
                <span className="text-lg font-bold tracking-tight uppercase">Markdown</span>
                <span className="text-lg font-bold tracking-tighter">Aimlief</span>
              </div>
            </section>

            </div>

            <section className="bg-notion-bg shadow-xl border border-notion-border rounded-xl p-8 sm:p-12 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <h2 className="text-2xl font-bold">开启新对话</h2>
              </div>

              <form onSubmit={handleStart} className="space-y-8 max-w-xl">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-notion-secondary uppercase tracking-wider block">你的名字或代号</label>
                  <input
                    name="userName"
                    required
                    className="notion-input h-11"
                    placeholder="例如：Parallized"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-notion-secondary uppercase tracking-wider block">（可选）你更希望侧重的主题</label>
                  <textarea
                    name="focus"
                    rows={3}
                    className="notion-input min-h-[100px] py-3"
                    placeholder="例如：职业转型、认知盲点、长期愿景……"
                  ></textarea>
                </div>
                <div className="flex items-center justify-between gap-6 pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="notion-btn-primary flex items-center gap-2 group h-11 px-8"
                  >
                    开始访谈
                    <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                  </button>
                  <div className={`text-[14px] font-medium ${statusColors[status.tone]}`}>
                    {status.message}
                  </div>
                </div>
              </form>
            </section>

          </div>
        ) : (
          /* Interview Section */
          <section className="space-y-16 max-w-5xl mx-auto animate-fade-in">
            <div className="sticky top-0 z-50 py-6 bg-white/95 backdrop-blur border-b border-notion-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 px-1">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-notion-secondary">
                    <span className="flex items-center gap-1.5"><Clock size={12}/> 探索进度</span>
                    <span className="text-notion-text">
                      {snapshot.answeredCount} / {snapshot.totalQuestions} ({Math.round(snapshot.completionRatio * 100)}%)
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-notion-hover">
                    <div
                      className="h-full rounded-full bg-notion-text transition-all duration-700 ease-in-out"
                      style={{ width: `${Math.round(snapshot.completionRatio * 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="flex items-center gap-8 sm:border-l border-notion-border sm:pl-8">
                  <div className="flex flex-col sm:items-end">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-notion-secondary mb-0.5">Session</div>
                    <div className="mono text-[10px] font-bold text-notion-text">{snapshot.session.id.slice(0, 8)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-16 lg:grid-cols-[1fr_360px]">
              <div className="space-y-12">
                {snapshot.isComplete ? (
                  <div className="p-12 text-center border border-emerald-100 bg-emerald-50/20 rounded-xl">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500 text-white mb-6">
                      <CheckCircle2 size={24} />
                    </div>
                    <h3 className="text-xl font-bold mb-2">所有问题已完成</h3>
                    <p className="text-notion-secondary text-sm max-w-sm mx-auto">你已跨越 100 个探索节点。现在，请凝练最终的 HUMAN.md 档案。</p>
                  </div>
                ) : (
                  <form ref={formRef} onSubmit={handleSubmitAnswers} className="space-y-12">
                    <div className="relative min-h-[360px]">
                      {currentQuestions.map((question, index) => (
                        <div
                          key={question.id}
                          className={`transition-all duration-300 ${
                            index === currentQuestionIndex ? "opacity-100 translate-x-0 relative" : "opacity-0 absolute inset-0 pointer-events-none -translate-x-4"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded bg-notion-text text-[9px] font-bold text-white">
                                {snapshot.answeredCount + index + 1}
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-notion-secondary">
                                Node {snapshot.answeredCount + index + 1}
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-notion-blue bg-notion-blue/5 px-2 py-0.5 rounded border border-notion-blue/10">
                              {question.categoryId}
                            </span>
                          </div>
                          <h2 className="text-2xl sm:text-3xl font-bold leading-tight mb-10">
                            {question.prompt}
                          </h2>
                          <textarea
                            name={question.id}
                            rows={8}
                            className="notion-input min-h-[200px] text-lg py-4 leading-relaxed"
                            placeholder="输入你的见解..."
                          ></textarea>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-notion-border">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                          disabled={currentQuestionIndex === 0 || loading}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-notion-border bg-white text-notion-secondary transition-colors hover:bg-notion-hover hover:text-notion-text disabled:opacity-30"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <div className="text-[11px] font-bold text-notion-text mono w-12 text-center">
                          {currentQuestionIndex + 1} / {currentQuestions.length}
                        </div>
                        <button
                          type="button"
                          onClick={() => setCurrentQuestionIndex(prev => Math.min(currentQuestions.length - 1, prev + 1))}
                          disabled={currentQuestionIndex === currentQuestions.length - 1 || loading}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-notion-border bg-white text-notion-secondary transition-colors hover:bg-notion-hover hover:text-notion-text disabled:opacity-30"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className={`text-[10px] font-medium hidden sm:block ${statusColors[status.tone]}`}>
                          {status.message}
                        </div>
                        {currentQuestionIndex === currentQuestions.length - 1 && (
                          <button
                            type="submit"
                            disabled={loading}
                            className="notion-btn-primary flex items-center gap-2 px-6"
                          >
                            完成本组
                            <Send size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                )}

                {/* Activity Log - Integrated look */}
                <div className="rounded-lg border border-notion-border overflow-hidden bg-notion-bg">
                  <div className="flex items-center justify-between border-b border-notion-border px-4 py-2.5 bg-notion-hover">
                    <div className="flex items-center gap-2">
                      <Terminal size={14} className="text-notion-secondary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-notion-secondary">Activity</span>
                    </div>
                    {loading && <Loader2 size={12} className="animate-spin text-notion-blue" />}
                  </div>
                  <div className="p-4 space-y-2 max-h-[160px] overflow-y-auto">
                    {logs.length === 0 ? (
                      <div className="text-[11px] text-notion-secondary">等待记录...</div>
                    ) : (
                      logs.map((log, i) => (
                        <div key={i} className="flex gap-4 text-[11px] leading-relaxed">
                          <span className="text-notion-secondary shrink-0 font-mono w-16">{log.time}</span>
                          <span className={i === logs.length - 1 ? "text-notion-text font-semibold" : "text-notion-secondary"}>
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                    {status.tone === "error" && (
                      <div className="flex gap-2 text-[11px] font-bold text-rose-600 p-2 bg-rose-50 rounded mt-2">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{status.message}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <button
                    type="button"
                    onClick={handleGenerateMarkdown}
                    disabled={loading || snapshot.answeredCount === 0}
                    className="notion-btn-secondary flex items-center gap-2 h-10 px-6 text-sm"
                  >
                    <Zap size={16} />
                    凝练 HUMAN.md
                  </button>
                </div>
              </div>

              <aside className="space-y-8">
                <div className="sticky top-40">
                  <div className="notion-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-notion-border px-5 py-3.5 bg-notion-hover/50">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-notion-text" />
                        <span className="text-xs font-bold uppercase tracking-wider">Preview</span>
                      </div>
                      {snapshot.session.humanMarkdown && (
                        <button
                          onClick={handleExport}
                          className="text-[10px] font-bold text-notion-blue hover:underline flex items-center gap-1.5"
                        >
                          <Download size={12} />
                          导出档案
                        </button>
                      )}
                    </div>
                    <div className="p-0.5">
                      <textarea
                        readOnly
                        className="mono block h-[500px] lg:h-[600px] w-full resize-none bg-transparent p-5 text-[11px] leading-relaxed outline-none border-none placeholder-notion-secondary/30"
                        placeholder="档案预览..."
                        value={snapshot.session.humanMarkdown ?? ""}
                      ></textarea>
                    </div>
                  </div>
                  <div className="mt-6 p-4 rounded border border-notion-border bg-notion-hover/30 text-[11px] leading-relaxed text-notion-secondary italic">
                    <strong className="text-notion-text not-italic uppercase tracking-widest mr-2">Tip</strong>
                    诚挚的回答是构建精准个人坐标的关键。你可以随时点击凝练按钮，观测档案的演进状态。
                  </div>
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>

      <footer className="mt-40 border-t border-notion-border pt-12 pb-12 text-center">
        <p className="text-[13px] font-medium uppercase tracking-[0.2em] text-notion-secondary opacity-50">&copy; 2026 HUMAN.md — AI-Driven Self-Exploration</p>
      </footer>
    </div>
  );
};

export default App;
