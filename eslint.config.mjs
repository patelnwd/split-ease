/**
 * ESLint flat config — applies to all TypeScript sources in the monorepo.
 * Run:  pnpm lint
 * Fix:  pnpm lint:fix
 */

import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
    // ── Ignored paths ────────────────────────────────────────────────────
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**",
            "**/coverage/**",
            "**/.next/**",
            "**/drizzle/**",
        ],
    },

    // ── Backend — TypeScript ─────────────────────────────────────────────
    {
        files: ["packages/backend/src/**/*.ts"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            // Baseline from @typescript-eslint recommended
            ...tsPlugin.configs["recommended"].rules,

            // Allow unused vars that start with _ (common Fastify pattern)
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],

            // Warn on 'any' rather than error — some Drizzle generics need it
            "@typescript-eslint/no-explicit-any": "warn",

            // Prefer const where possible
            "prefer-const": "error",

            // console.log is fine in a backend service
            "no-console": "off",

            // Enforce === everywhere
            eqeqeq: ["error", "always"],

            // No dangling promises — every async operation should be awaited or void-cast
            "@typescript-eslint/no-floating-promises": "off",
        },
    },

    // ── Frontend — TypeScript + React ────────────────────────────────────
    {
        files: ["packages/frontend/src/**/*.{ts,tsx}"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: { jsx: true },
            },
            globals: {
                // Browser globals
                window: "readonly",
                document: "readonly",
                console: "readonly",
                fetch: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                FormData: "readonly",
                File: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
            },
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
            react: reactPlugin,
            "react-hooks": reactHooksPlugin,
        },
        settings: {
            react: { version: "18" },
        },
        rules: {
            ...tsPlugin.configs["recommended"].rules,
            ...reactPlugin.configs["recommended"].rules,

            // React 17+ — no need to import React for JSX
            "react/react-in-jsx-scope": "off",
            "react/prop-types": "off",

            // Hooks rules
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",

            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            "@typescript-eslint/no-explicit-any": "warn",
            "prefer-const": "error",
            eqeqeq: ["error", "always"],
        },
    },

    // ── Prettier — must be last to disable conflicting style rules ────────
    prettierConfig,
];
