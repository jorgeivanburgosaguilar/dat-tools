# AGENTS.md - DAT Tools

## Project Overview

A collection of privacy-first, client-side browser utilities for developers. All processing happens entirely in the browser — data never leaves the machine. Ideal for teams working under strict NDAs or handling sensitive information.

- 100% client-side processing with zero server communication
- No analytics, tracking, or external dependencies
- Self-hostable via Docker

### Tools

| Tool                  | Description                | Status      |
| --------------------- | -------------------------- | ----------- |
| Stopwatch             | Clean, ad-free timer       | Available   |
| JSON Parser/Validator | Parse and validate JSON    | Planned     |
| Code/Text Diff        | Compare text side-by-side  | Planned     |
| Word Counter          | Count words and characters | Development |

## General Code Style

- ES modules (`"type": "module"` in package.json). Use `import`/`export`, never `require`.
- Prefer `const`; use `let` only when reassignment is needed. Never use `var`.
- Error handling: use try/catch in API routes, return appropriate JSON error responses with status codes.

## Project Commands

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm lint` — run prettier --check + eslint
- `pnpm format` — auto-format with prettier
- `pnpm check` — svelte-check type validation

## Type System

- **JavaScript only** — this project uses `jsconfig.json` with `checkJs: true`, NOT TypeScript.
- **All types must be expressed via JSDoc** (`@type`, `@param`, `@returns`, `@typedef`, etc.). Never create `.ts` files.
- Use `/** @type {import('@sveltejs/kit').Config} */` style imports for framework types.
- Keep `@param` / `@returns` annotations on all exported functions and SvelteKit handlers.

## Svelte

- This project uses **Svelte 5** with runes (`$state`, `$derived`, `$effect`, `$props`). Never use Svelte 4 patterns (`export let`, `$:` reactive statements, stores via `$` prefix).
- Use the **Svelte MCP server** (`list-sections`, `get-documentation`, `svelte-autofixer`) to verify syntax when unsure about Svelte 5 APIs.
- Always run `svelte-autofixer` on any Svelte component you write or modify before presenting it.
- Use `{@render children()}` for slot content, not `<slot />`.
- Use `onclick={handler}` attribute syntax, not `on:click={handler}`.

## SvelteKit

- Adapter: `@sveltejs/adapter-static`
- Path aliases: `$lib` maps to `src/lib/`.

## Formatting

- Formatting is auto-enforced by `.prettierrc` + `.editorconfig`. Run `pnpm format` before committing.
- **Spaces** (2-space indent), **single quotes**, **no trailing commas**, **print width: 100**.
- Tailwind class sorting is automatic via `prettier-plugin-tailwindcss`.

## Styling

- **Tailwind CSS v4** via `@tailwindcss/vite` plugin. Utility-first classes inline in markup.
- `@tailwindcss/forms` plugin is available.
- Dark mode is class-based (`dark:` variant with `document.documentElement.classList`).
- Stylesheet entry point: `src/app.css`.
