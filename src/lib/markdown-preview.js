import { marked } from 'marked'

export const DEFAULT_CONTENT = `# Markdown Preview

Write your markdown on the left, see the live preview on the right.

## Text Formatting

You can make text **bold**, *italic*, or ***both***. You can also use ~~strikethrough~~ and \`inline code\`.

## Lists

**Unordered:**
- Item one
- Item two
  - Nested item
  - Another nested item
- Item three

**Ordered:**
1. First step
2. Second step
3. Third step

## Blockquotes

> "The best way to predict the future is to invent it."
> — Alan Kay

## Code Blocks

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

## Tables

| Language   | Created | Paradigm       |
| ---------- | ------- | -------------- |
| JavaScript | 1995    | Multi-paradigm |
| Python     | 1991    | Multi-paradigm |
| Rust       | 2010    | Systems        |

## Task List

- [x] Create the editor
- [x] Add live preview
- [ ] Add syntax highlighting

---

*Happy writing!*
`

/**
 * Parse markdown to sanitized HTML. DOMPurify is loaded dynamically (browser only)
 * so this function is safe to call during SSR — it will return raw HTML on the server.
 *
 * @param {string} markdown
 * @param {any} purify - DOMPurify instance, or null during SSR
 * @returns {string}
 */
export function renderMarkdown(markdown, purify) {
  const raw = /** @type {string} */ (marked.parse(markdown))
  return purify ? purify.sanitize(raw) : raw
}
