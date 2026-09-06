import { defineConfig } from "vite";

export default defineConfig({
  base: "/insight/",
  test: {
    include: ["tests/**/*.test.js"]
  }
});
