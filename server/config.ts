export const env = {
  apiKey: process.env.HUAN666_API_KEY ?? "",
  baseUrl: (process.env.HUAN666_BASE_URL ?? "https://ai.huan666.de/v1").replace(/\/$/, ""),
  model: process.env.AI_MODEL ?? "grok-4.20-beta",
  port: Number(process.env.PORT ?? 3000),
  isDevelopment: process.env.NODE_ENV !== "production"
};
