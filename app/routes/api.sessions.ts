import { z } from "zod";
import type { ActionFunctionArgs } from "react-router";
import { createSession } from "../../server/session-service";

const createSessionSchema = z.object({
  userName: z.string().min(1, "请输入你的名字或代号"),
  focus: z.string().nullable().optional()
});

export async function action({ request }: ActionFunctionArgs) {
  const payload = createSessionSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return Response.json({ error: payload.error.issues[0]?.message ?? "请求参数不合法" }, { status: 400 });
  }

  const snapshot = await createSession(payload.data);
  return Response.json(snapshot);
}
