import type { LoaderFunctionArgs } from "react-router";
import { getSessionSnapshot } from "../../server/session-service";

export async function loader({ params }: LoaderFunctionArgs) {
  const snapshot = await getSessionSnapshot(params.sessionId ?? "");
  if (!snapshot) {
    return Response.json({ error: "会话不存在" }, { status: 404 });
  }

  return Response.json(snapshot);
}
