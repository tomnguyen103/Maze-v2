import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      ".codegraph/**",
      "coverage/**",
      "design-system/**",
      "dist/**",
      "graphify-out/**",
      "node_modules/**",
      "playwright-report/**",
      "public/**",
      "server.js",
      "test-results/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser
    }
  },
  {
    files: ["*.config.js", "*.config.mjs", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-undef": "off"
    }
  }
];
