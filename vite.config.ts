import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Published on GitHub Pages at the custom domain https://cmvpcerts.net/, so the production base is "/".
// Set BASE_PATH=/<repo>/ to publish as a plain project site instead. Dev/tests use "/".
const buildBase = process.env["BASE_PATH"] ?? "/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? buildBase : "/",
  plugins: [
    // Router codegen must run before the React transform.
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      routeFileIgnorePattern: "\\.(test|spec)\\.",
    }),
    react(),
    tailwind(),
  ],
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
}));
