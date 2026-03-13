import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { withApiRequestLogging } from "../../server/request-log";
import { updateSessionProgress } from "../../server/session-service";

const updateSessionProgressSchema = z.object({
  currentQuestionIndex: z.number().int().min(0).optional(),
  draftAnswers: z.record(z.string(), z.string()).optional()
});

export const action = withApiRequestLogging(
  "update-session-progress",
  async ({ request, params }: ActionFunctionArgs) => {
    const payload = updateSessionProgressSchema.safeParse(await request.json().catch(() => null));
    if (!payload.success) {
      return Response.json({ error: "进度格式不正确" }, { status: 400 });
    }

    const progress = await updateSessionProgress(params.sessionId ?? "", payload.data);
    if (!progress) {
      return Response.json({ error: "会话不存在" }, { status: 404 });
    }

    return Response.json({ progress });
  },
  ({ params }) => ({ sessionId: params.sessionId })
);