import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Published as a GitHub Pages project site at https://regenscheid.github.io/cmvpvalidations/, so the
// production base is the repo subpath. Set BASE_PATH=/ for a custom domain. Dev/tests use "/".
const buildBase = process.env["BASE_PATH"] ?? "/cmvpvalidations/";

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
