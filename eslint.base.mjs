// Shared ESLint rules. Each workspace has a thin eslint.config.mjs that
// spreads this array and adds its own rules (e.g. Next's for apps/web).
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default [
  globalIgnores(["**/dist/**", "**/coverage/**", "**/.next/**", "**/out/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Last, so it switches off every stylistic rule Prettier owns.
  prettier,
];
