import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Inline SVG data URI — no network request, renders entirely in the browser.
const EXAMPLE_IMAGE_SRC = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="200">` +
    `<rect width="700" height="200" fill="#bfdbfe"/>` +
    `<rect y="140" width="700" height="60" fill="#bbf7d0"/>` +
    `<polygon points="60,140 190,45 320,140" fill="#9ca3af"/>` +
    `<polygon points="230,140 390,20 550,140" fill="#6b7280"/>` +
    `<polygon points="450,140 570,65 690,140" fill="#9ca3af"/>` +
    `<circle cx="80" cy="42" r="24" fill="#fde68a"/>` +
    `</svg>`
)}`;

export const DEFAULT_CONTENT = `# Markdown Preview

> **Privacy-first:** Everything you type stays entirely in your browser — no data ever leaves your machine.

Write your markdown on the left and see the live preview update in real time on the right.

---

## Text Formatting

You can write **bold**, *italic*, ***bold and italic***, ~~strikethrough~~, and \`inline code\`.

## Links

Inline link: [SvelteKit Documentation](https://kit.svelte.dev)

Reference-style links keep source readable when you reuse the same URL: [Svelte][svelte-home] and [Vite][vite-home].

[svelte-home]: https://svelte.dev
[vite-home]: https://vite.dev

## Images

![A mountain landscape](${EXAMPLE_IMAGE_SRC})

*Images render inline — paste any URL or local path.*

## Blockquotes

> "The best way to predict the future is to invent it."
> — Alan Kay

Quotes nest too:

> Outer context
>
> > Inner quote — useful for threading conversations or citing sources.

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

**Task list:**
- [x] Create the editor
- [x] Add live preview
- [x] Copy rendered HTML
- [ ] Add syntax highlighting
- [ ] PDF export

## Code

Inline: prefer \`const\` over \`var\`, and \`===\` over \`==\`.

\`\`\`javascript
async function fetchUser(id) {
  const res = await fetch(\`/api/users/\${id}\`)
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`)
  return res.json()
}
\`\`\`

\`\`\`bash
# Install and run
pnpm install
pnpm dev
\`\`\`

\`\`\`json
{
  "name": "my-project",
  "version": "1.0.0",
  "private": true
}
\`\`\`

## Tables

| Language   | Released | Typing   | Primary use          |
| ---------- | -------- | -------- | -------------------- |
| JavaScript | 1995     | Dynamic  | Web, Node.js         |
| Python     | 1991     | Dynamic  | Data, scripting      |
| Rust       | 2010     | Static   | Systems, WebAssembly |
| Go         | 2009     | Static   | Backend, CLI tools   |
| TypeScript | 2012     | Static   | Web, Node.js         |

## HTML Embeds

Markdown passes raw HTML through — handy for elements with no markdown equivalent:

<details>
<summary>Click to expand a collapsible section</summary>

Hidden content revealed on click. Great for FAQs or long explanations in technical docs.

</details>

Keyboard shortcuts: <kbd>Ctrl</kbd> + <kbd>S</kbd> to save, <kbd>Ctrl</kbd> + <kbd>Z</kbd> to undo.

---

*Clear this content and start writing — your work stays private.*
`;

/**
 * Returns a data-line attribute string for a token.
 * Accepts any so the custom _lineStart property doesn't cause type errors.
 * @param {any} token
 * @returns {string}
 */
function dataLine(token) {
  return `data-line="${token._lineStart ?? ''}"`;
}

// One-time renderer setup: block elements get a data-line attribute so the
// scroll sync can find the element that corresponds to the keyboard cursor.
// The _lineStart property is added to each token by renderMarkdown() before
// calling marked.parser(), so it is always present when these functions run.
marked.use({
  renderer: {
    heading(token) {
      const text = this.parser.parseInline(token.tokens);
      return `<h${token.depth} ${dataLine(token)}>${text}</h${token.depth}>\n`;
    },
    paragraph(token) {
      const text = this.parser.parseInline(token.tokens);
      return `<p ${dataLine(token)}>${text}</p>\n`;
    },
    code(token) {
      const lang = token.lang ? ` class="language-${token.lang}"` : '';
      return `<pre ${dataLine(token)}><code${lang}>${token.text}</code></pre>\n`;
    },
    blockquote(token) {
      const body = this.parser.parse(token.tokens);
      return `<blockquote ${dataLine(token)}>\n${body}</blockquote>\n`;
    },
    table(token) {
      const headerCells = token.header
        .map((cell, i) => {
          const align = token.align[i] ? ` align="${token.align[i]}"` : '';
          return `<th${align}>${this.parser.parseInline(cell.tokens)}</th>`;
        })
        .join('');
      const rows = token.rows
        .map((row) => {
          const cells = row
            .map((cell, i) => {
              const align = token.align[i] ? ` align="${token.align[i]}"` : '';
              return `<td${align}>${this.parser.parseInline(cell.tokens)}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('\n');
      return (
        `<table ${dataLine(token)}>` +
        `<thead><tr>${headerCells}</tr></thead>` +
        `<tbody>\n${rows}\n</tbody></table>\n`
      );
    },
    hr(token) {
      return `<hr ${dataLine(token)}>\n`;
    }
  }
});

/**
 * Parse markdown to sanitized HTML. DOMPurify is imported statically. During SSR/
 * prerendering there is no `window` global at all, so DOMPurify.isSupported is false
 * and sanitize() is never defined — that path only ever runs against this module's own
 * trusted DEFAULT_CONTENT, since real user input is entered and rendered entirely
 * client-side, where `window` always exists and sanitize() always runs.
 *
 * Tokens are annotated with _lineStart before parsing so the custom renderer can
 * embed data-line attributes used by the scroll sync feature.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function renderMarkdown(markdown) {
  const tokens = marked.lexer(markdown);
  let line = 1;
  for (const token of tokens) {
    /** @type {any} */ (token)._lineStart = line;
    line += (token.raw.match(/\n/g) ?? []).length;
  }
  const raw = /** @type {string} */ (marked.parser(tokens));
  // ADD_ATTR ensures data-line survives DOMPurify sanitization
  return DOMPurify.isSupported ? DOMPurify.sanitize(raw, { ADD_ATTR: ['data-line'] }) : raw;
}
