import { fixupConfigRules } from "@eslint/compat";
import nextConfig from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint 10 flat config.
 *
 * eslint-config-next@16 bundles plugins (react, jsx-a11y, import) that
 * haven't released ESLint 10-compatible versions yet. fixupConfigRules
 * shims the deprecated rule context APIs so everything works until the
 * plugins catch up.
 */
/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  {
    // Assets vendored (Swagger UI minificado) y prototipo histórico — no lintear
    ignores: ["public/swagger/**", "legacy/**"],
  },
  ...fixupConfigRules(nextConfig),
  ...fixupConfigRules(nextCoreWebVitals),
  ...fixupConfigRules(nextTypescript),
];

export default eslintConfig;
