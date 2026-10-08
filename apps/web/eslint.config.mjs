import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import base from "../../eslint.base.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  // After nextVitals so the shared TypeScript rules and Prettier override win.
  ...base,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
