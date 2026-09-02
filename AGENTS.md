# AGENTS.md - DAT Tools

## Project Overview

A collection of privacy-first, client-side browser utilities for developers. All processing happens entirely in the browser — data never leaves the machine. Ideal for teams working under strict NDAs or handling sensitive information.

- 100% client-side processing with zero server communication
- No analytics, tracking, or external dependencies
- Self-hostable via Docker

### Tools

| Tool                    | Description                         | Status    |
| ----------------------- | ----------------------------------- | --------- |
| Stopwatch               | Clean, ad-free timer                | Available |
| JSON Parser/Validator   | Parse and validate JSON             | Available |
| Word Counter            | Count words and characters          | Available |
| Markdown Preview        | Write and preview markdown          | Available |
| Code/Text Diff          | Compare text side-by-side           | Available |
| Agent Trajectory Viewer | Navigate agent trajectory JSON logs | Available |

## General Code Style

- ES modules (`"type": "module"` in package.json). Use `import`/`export`, never `require`.
- Prefer `const`; use `let` only when reassignment is needed. Never use `var`.
- Error handling: use try/catch in API routes, return appropriate JSON error responses with status codes.

## Git Workflow

- Never run `git commit` unless the user has explicitly asked for a commit to be created in this turn. Making code changes or completing a task is never implicit permission to commit.

## Project Commands

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm lint` — run prettier --check + eslint
- `pnpm format` — auto-format with prettier
- `pnpm check` — svelte-check type validation

## Post-Change Checklist

- After every completed change, run `pnpm format`.
- After formatting, run `pnpm check` and `pnpm lint`.
- `pnpm check` and `pnpm lint` must not report already known errors as part of the final state.
- If any `.svelte` file changed, run the `svelte-autofixer` tool before presenting results.
- If test files changed or new coverage was added, run `pnpm test` and confirm a clean pass across
  both Vitest projects before presenting results.

## Testing

- `pnpm test` — single run (CI-style). `pnpm test:unit` — watch mode.
- `expect: { requireAssertions: true }` is set globally in `vite.config.js` — every test must
  contain at least one assertion.

### Dual-project architecture

`vite.config.js` defines two Vitest projects; a spec file's **name** decides which one runs it —
there is no manual project selection:

| Project  | Environment                      | Include globs                                                       |
| -------- | -------------------------------- | ------------------------------------------------------------------- |
| `client` | Headless Chromium via Playwright | `src/**/*.svelte.{test,spec}.js`, `src/**/*.browser.{test,spec}.js` |
| `server` | Node.js                          | `src/**/*.{test,spec}.js` (excluding the two client patterns above) |

**Naming rule — pick the suffix by what the code under test needs, not by preference:**

- `*.svelte.spec.js` — Svelte component tests (needs real DOM via `vitest-browser-svelte`).
- `*.browser.spec.js` — a plain `.js` module that needs a real browser API at runtime:
  `localStorage`, `indexedDB`, or a working `DOMPurify` (see below). Existing example:
  `html-table-to-markdown.browser.spec.js`.
- `*.spec.js` — pure, browser-independent logic. Runs in Node with zero browser startup cost.

Getting this wrong doesn't fail loudly — the test just runs in the wrong environment and silently
exercises different behavior than production. In particular:

- **Sanitization/XSS tests must use `.browser.spec.js`.** `DOMPurify.isSupported` is `false` under
  Node (no `window`), so code like `markdown-preview.js`'s `renderMarkdown()` skips sanitization
  entirely in that environment — an XSS test in the wrong project would pass against unsanitized
  HTML and never catch a real regression. Add a guard assertion
  (`expect(DOMPurify.isSupported).toBe(true)`) at the top of such a suite so a future misplacement
  fails loudly instead of silently.
- Any module reading `localStorage`/`indexedDB` needs `.browser.spec.js` — those globals don't
  exist under Node.

### No real sleeps

- **Never** use `await new Promise((r) => setTimeout(r, N))` to wait out a component's own timer.
  It was previously used 12× in `Stopwatch.svelte.spec.js` alone, adding ~13s of dead time to every
  run.
- For a component-owned `setInterval`/`setTimeout`, use scoped fake timers so unrelated retry
  polling (`expect.element(...)`, which itself uses real timers internally) keeps working:
  ```javascript
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  // trigger the action
  await vi.advanceTimersByTimeAsync(1100);
  // assert
  vi.useRealTimers(); // in afterEach
  ```
  Fake `Date` alongside the timer functions whenever the component reads `Date.now()` inside the
  interval callback (as `Stopwatch.svelte` does) — otherwise elapsed-time math goes stale relative
  to the faked clock.
- **Fake timers only help when the thing you're waiting on is actually timer-driven.** If the delay
  comes from something else — a dynamic import, an IndexedDB transaction, a debounced async
  pipeline — advancing fake timers does nothing. Use `expect.element(...)` (auto-retries) or
  `expect.poll(() => condition, { timeout: 3000 })` instead.

### Svelte 5 & Vitest Browser Testing pattern

- Use `render` from `vitest-browser-svelte`; assert with
  `expect.element(screen.getByRole(...)).toBeVisible()`.
- Prefer accessible queries (`getByRole`, `getByText`, `getByLabelText`) over CSS classes or
  internal IDs (Testing Trophy philosophy).
- Test callback props with `vi.fn()`:
  ```javascript
  const onchange = vi.fn();
  render(WordCounter, { onchange });
  // interact
  expect(onchange).toHaveBeenCalledWith(expect.objectContaining({ words: 2 }));
  ```
- For a component that accepts **snippet props** it can't construct on its own (e.g. panes,
  actions), write a thin test-only harness `.svelte` component that supplies mock snippets and
  wraps the real component — see `DiffLayoutHarness.svelte`, used by `DiffLayout.svelte.spec.js`.

### State isolation between tests

- Clean up storage a test wrote to in `afterEach`/`beforeEach`: remove specific `localStorage`
  keys, clear IndexedDB stores, `vi.restoreAllMocks()` after spying.
- A module that caches a resource at module scope (e.g. `stopwatch-db.js` keeps its open IndexedDB
  connection in a module-level `let db = null;`) is shared across every test in that file — prefer
  clearing its data (`clearAllRecords()`) over deleting/recreating the underlying resource, which
  would race the stale cached handle.

### JS + JSDoc only

- New test files are `.spec.js`, `.browser.spec.js`, or `.svelte.spec.js` — never `.ts`, per the
  project-wide JSDoc-only type system.

## Type System

- **JavaScript only** — this project uses `jsconfig.json` with `checkJs: true`, NOT TypeScript.
- **All types must be expressed via JSDoc** (`@type`, `@param`, `@returns`, `@typedef`, etc.). Never create `.ts` files.
- Use `/** @type {import('@sveltejs/kit').Config} */` style imports for framework types.
- Keep `@param` / `@returns` annotations on all exported functions and SvelteKit handlers.
- Follow the **Post-Change Checklist** after finalizing code changes.

## Svelte

- This project uses **Svelte 5** with runes (`$state`, `$derived`, `$effect`, `$props`). Never use Svelte 4 patterns (`export let`, `$:` reactive statements, stores via `$` prefix).
- Use the **Svelte MCP server** (`list-sections`, `get-documentation`, `svelte-autofixer`) to verify syntax when unsure about Svelte 5 APIs.
- If any `.svelte` file is changed, run `svelte-autofixer` before presenting results.
- Use `{@render children()}` for slot content, not `<slot />`.
- Use `onclick={handler}` attribute syntax, not `on:click={handler}`.

## Component Architecture

- **Prioritize reusable components** in `src/lib/components/`. Extract shared UI patterns into standalone components instead of inlining logic in pages.
- **Components own their internal state** — manage local state (`$state`) inside the component, never leak internal mechanics to the parent.
- **Parent communication via callback props** — use `on`-prefixed callback props (`onclear`, `onstart`, `onstop`) instead of dispatching events. Provide sensible defaults (e.g. `() => {}`).
- **Destructure `$props()` with defaults** — every prop that can have a reasonable default should. This keeps component usage concise.
- **Document prop contracts with JSDoc `@typedef`** — define a `@typedef` at the top of the `<script>` block describing the component's prop shape.
- **Delegate rendering via function props** when the component shouldn't know about the parent's data shape (e.g. `formatRow` in `RecordsList`).
- **Pages are thin orchestrators** — pages import components, wire callbacks, and manage page-level data (e.g. fetching/persisting records). Business logic and UI state live in components.
- **Components handle their own UX concerns** — modals, confirmation dialogs, loading states, and empty states belong inside the component that needs them.

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
