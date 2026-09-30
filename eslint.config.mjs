import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "public/**",
      "views/**",
    ],
  },

  {
    files: ["src/**/*.ts"],

    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
    ],
  },
]);
