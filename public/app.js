const state = {
  snapshot: null
};

const el = {
  startForm: document.getElementById("start-form"),
  answerForm: document.getElementById("answer-form"),
  sessionId: document.getElementById("session-id"),
  progressText: document.getElementById("progress-text"),
  progressBar: document.getElementById("progress-bar"),
  aiBadge: document.getElementById("ai-badge"),
  questionList: document.getElementById("question-list"),
  markdown: document.getElementById("human-markdown"),
  generateBtn: document.getElementById("generate-btn"),
  exportBtn: document.getElementById("export-btn"),
  status: document.getElementById("status")
};

const setStatus = (message, tone = "info") => {
  if (!el.status) {
    return;
  }

  el.status.textContent = message;
  el.status.dataset.tone = tone;
};

const render = () => {
  const snapshot = state.snapshot;
  if (!snapshot) {
    el.answerForm?.classList.add("hidden");
    el.exportBtn?.classList.add("hidden");
    return;
  }

  el.answerForm?.classList.remove("hidden");
  if (el.sessionId) {
    el.sessionId.textContent = snapshot.session.id;
  }
  if (el.progressText) {
    el.progressText.textContent = `${snapshot.answeredCount} / ${snapshot.totalQuestions}`;
  }
  if (el.progressBar) {
    el.progressBar.style.width = `${Math.round(snapshot.completionRatio * 100)}%`;
  }
  if (el.aiBadge) {
    el.aiBadge.textContent = snapshot.aiConfigured ? "AI 总结已启用" : "未配置 API Key，使用本地回退";
  }
  if (el.generateBtn) {
    el.generateBtn.disabled = snapshot.answeredCount === 0;
  }
  el.exportBtn?.classList.toggle("hidden", !snapshot.session.humanMarkdown);
  if (el.markdown) {
    el.markdown.value = snapshot.session.humanMarkdown ?? "";
  }

  const questions = snapshot.currentQuestions ?? [];
  if (el.questionList) {
    el.questionList.innerHTML = questions
      .map(
        (question, index) => `
          <label class="block rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div class="text-xs uppercase tracking-[0.24em] text-cyan-300">Question ${index + 1}</div>
            <div class="mt-2 text-base leading-7 text-slate-100">${question.prompt}</div>
            <textarea
              name="${question.id}"
              rows="5"
              class="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              placeholder="写下你真实的答案，AI 会为你总结并继续挑选下一组更相关的问题"
            ></textarea>
          </label>
        `
      )
      .join("");
  }

  if (snapshot.isComplete) {
    setStatus("100 个问题已全部完成，可以生成 HUMAN.md。", "success");
  }
};

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "请求失败");
  }

  return payload;
};

el.startForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(el.startForm);
  setStatus("正在创建访谈会话…");

  try {
    const payload = await request("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        userName: String(form.get("userName") ?? ""),
        focus: String(form.get("focus") ?? "")
      })
    });

    state.snapshot = payload;
    render();
    setStatus("会话已创建，开始回答这一轮问题吧。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "创建会话失败", "error");
  }
});

el.answerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.snapshot) {
    return;
  }

  const form = new FormData(el.answerForm);
  const answers = (state.snapshot.currentQuestions ?? [])
    .map((question) => ({
      questionId: question.id,
      answer: String(form.get(question.id) ?? "").trim()
    }))
    .filter((item) => item.answer.length > 0);

  if (answers.length === 0) {
    setStatus("至少先回答一个问题。", "error");
    return;
  }

  setStatus("正在总结你的回答，并挑选下一组问题…");

  try {
    const payload = await request(`/api/sessions/${state.snapshot.session.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ answers })
    });

    state.snapshot = payload;
    render();
    el.answerForm.reset();
    setStatus("已保存这一轮回答。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "保存回答失败", "error");
  }
});

el.generateBtn?.addEventListener("click", async () => {
  if (!state.snapshot) {
    return;
  }

  setStatus("正在生成 HUMAN.md…");

  try {
    const payload = await request(`/api/sessions/${state.snapshot.session.id}/human-markdown`, {
      method: "POST"
    });

    state.snapshot = payload;
    render();
    setStatus("HUMAN.md 已生成。", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "生成失败", "error");
  }
});

el.exportBtn?.addEventListener("click", () => {
  if (!state.snapshot?.session?.humanMarkdown) {
    return;
  }

  const blob = new Blob([state.snapshot.session.humanMarkdown], {
    type: "text/markdown;charset=utf-8"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${state.snapshot.session.userName || "human"}.HUMAN.md`;
  link.click();
  URL.revokeObjectURL(link.href);
});
