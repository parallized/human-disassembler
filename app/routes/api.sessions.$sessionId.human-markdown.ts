import type { ActionFunctionArgs } from "react-router";
import { generateHumanFile } from "../../server/session-service";

export async function action({ params }: ActionFunctionArgs) {
  const snapshot = await generateHumanFile(params.sessionId ?? "");
  if (!snapshot) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }

  return Response.json(snapshot);
}
