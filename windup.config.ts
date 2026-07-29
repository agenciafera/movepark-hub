import { defineConfig } from "windupjs";

export default defineConfig({
  baseUrl: "http://localhost:5173",
  llm: {
    provider: "google",
    model: "gemini-3.1-flash-lite",
    apiKeyEnv: "GEMINI_API_KEY",
  },
  scenarios: "e2e/windup",
  framework: "react-router",
  scan: { llmAssist: { enabled: true, maxCalls: 80 } },
  context: {},
});
