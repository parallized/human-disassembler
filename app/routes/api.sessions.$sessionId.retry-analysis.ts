import type { ActionFunctionArgs } from "react-router";
import { withApiRequestLogging } from "../../server/request-log";
import { retryProfileAnalysis } from "../../server/session-service";

export const action = withApiRequestLogging(
  "retry-profile-analysis",
  async ({ params }: ActionFunctionArgs) => {
    const snapshot = await retryProfileAnalysis(params.sessionId ?? "");
    if (!snapshot) {
      return Response.json({ error: "会话不存在" }, { status: 404 });
    }

    return Response.json(snapshot);
  },
  ({ params }) => ({ sessionId: params.sessionId })
);
