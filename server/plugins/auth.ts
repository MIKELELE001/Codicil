import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  // "/a" is the public living agreement page, "/c" the older single-change page; their JSON APIs are token-gated.
  workspaceAppPublicPaths: ["/", "/c", "/a"],
  publicPaths: ["/api/client", "/api/agreement"],
  rootAuth: true,
  marketing: false,
});
