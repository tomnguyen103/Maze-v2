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
    files: ["api/**/*.js", "server.js", "server/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node
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
