import type { ActionFunctionArgs } from "react-router";
import { withApiRequestLogging } from "../../server/request-log";
import { generateHumanFile } from "../../server/session-service";

export const action = withApiRequestLogging(
  "generate-human-markdown",
  async ({ params }: ActionFunctionArgs) => {
    const snapshot = await generateHumanFile(params.sessionId ?? "");
    if (!snapshot) {
      return Response.json({ error: "会话不存在" }, { status: 404 });
    }

    return Response.json(snapshot);
  },
  ({ params }) => ({ sessionId: params.sessionId })
);