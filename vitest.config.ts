import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // A few Buy or Pass tests create many posts sequentially (each one a
    // real image upload + sharp re-encode), which comfortably clears
    // vitest's 5s default locally but can exceed it on a loaded/shared CI
    // runner — caught by a real CI timeout, not assumed in advance.
    testTimeout: 20000,
  },
});
