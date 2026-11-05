import { defineAgentNativeConfig } from "@agent-native/core/config";

export default defineAgentNativeConfig({
  changelog: { enabled: false },
  harness: true,
  // Free providers (e.g. Groq) cap replies at 16K-32K tokens. The framework default of 64K
  // makes them reject every request. 12K is plenty for this app and works everywhere.
  agent: {
    mainChatMaxOutputTokens: 12000,
    emptyResponseRetryMaxOutputTokens: 12000,
  },
});
