import type { LoaderFunctionArgs } from "react-router";
import { withApiRequestLogging } from "../../server/request-log";
import { getSessionSnapshot } from "../../server/session-service";

export const loader = withApiRequestLogging(
  "get-session",
  async ({ params }: LoaderFunctionArgs) => {
    const snapshot = await getSessionSnapshot(params.sessionId ?? "");
    if (!snapshot) {
      return Response.json({ error: "会话不存在" }, { status: 404 });
    }

    return Response.json(snapshot);
  },
  ({ params }) => ({ sessionId: params.sessionId })
);