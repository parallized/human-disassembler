import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/sessions", "routes/api.sessions.ts"),
  route("api/sessions/:sessionId", "routes/api.sessions.$sessionId.ts"),
  route("api/sessions/:sessionId/answers", "routes/api.sessions.$sessionId.answers.ts"),
  route("api/sessions/:sessionId/progress", "routes/api.sessions.$sessionId.progress.ts"),
  route("api/sessions/:sessionId/human-markdown", "routes/api.sessions.$sessionId.human-markdown.ts")
] satisfies RouteConfig;
