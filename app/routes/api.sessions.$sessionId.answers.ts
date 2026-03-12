import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { submitAnswers } from "../../server/session-service";

const submitAnswersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      answer: z.string().min(1)
    })
  )
});

export async function action({ request, params }: ActionFunctionArgs) {
  const payload = submitAnswersSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: "回答格式不正确" }, { status: 400 });
  }

  const snapshot = await submitAnswers(params.sessionId ?? "", payload.data.answers);
  if (!snapshot) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }

  return Response.json(snapshot);
}
