/**
 * Optional syntax highlighting for the Diff Checker, backed by lowlight (highlight.js wrapped
 * to return a hast tree instead of an HTML string) so highlight runs can be merged with diff
 * segments without ever parsing or emitting HTML.
 *
 * `lowlight` is loaded via a dynamic `import()` so the ~85-100 KB gzipped `common` grammar
 * bundle is a separate chunk that only downloads when a non-'plain' language is selected. That
 * chunk is emitted by our own build and served as a same-origin static asset (GitHub Pages / the
 * Docker image) - it is not a CDN or third-party request, so this stays 100% client-side and
 * self-hostable.
 *
 * Unlike DOMPurify (which needs a real `window`), lowlight has no DOM dependency and runs fine
 * under Node, so this module needs no SSR/browser guard - the invariant that matters is that
 * `ensureHighlighter()` is only ever called from an explicit user action (language picked, Diff
 * clicked), never from module scope or an unconditional `$effect`, so it never runs during
 * SvelteKit's prerender pass regardless of environment.
 */

/** @typedef {{ id: string, label: string }} DiffLanguage */

/** @typedef {{ text: string, className: string | null }} HighlightRun */

export const LANGUAGES = /** @type {DiffLanguage[]} */ ([
  { id: 'plain', label: 'Plain text' },
  { id: 'arduino', label: 'Arduino' },
  { id: 'bash', label: 'Bash' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'css', label: 'CSS' },
  { id: 'diff', label: 'Diff / Patch' },
  { id: 'go', label: 'Go' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'ini', label: 'INI' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'less', label: 'Less' },
  { id: 'lua', label: 'Lua' },
  { id: 'makefile', label: 'Makefile' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'objectivec', label: 'Objective-C' },
  { id: 'perl', label: 'Perl' },
  { id: 'php', label: 'PHP' },
  { id: 'php-template', label: 'PHP Template' },
  { id: 'python', label: 'Python' },
  { id: 'python-repl', label: 'Python REPL' },
  { id: 'r', label: 'R' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'rust', label: 'Rust' },
  { id: 'scss', label: 'SCSS' },
  { id: 'shell', label: 'Shell Session' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'vbnet', label: 'VB.NET' },
  { id: 'wasm', label: 'WebAssembly' },
  { id: 'xml', label: 'XML/HTML' },
  { id: 'yaml', label: 'YAML' }
]);

// `lowlight` has no named `Lowlight` export - `createLowlight()` returns an inline object type,
// so it is derived here with `ReturnType` instead. Likewise the hast tree it returns is typed
// with small local shapes rather than importing from the `hast` package, which isn't a direct
// dependency of this project (only an ambient type used inside lowlight's own .d.ts).
/** @typedef {ReturnType<typeof import('lowlight').createLowlight>} Lowlight */

/** @typedef {{ type: 'text', value: string }} HastText */
/** @typedef {{ type: 'element', tagName: string, properties?: { className?: unknown }, children: HastNode[] }} HastElement */
/** @typedef {HastText | HastElement} HastNode */
/** @typedef {{ type: 'root', children: HastNode[] }} HastRoot */

/** @type {Promise<Lowlight> | null} */
let highlighterPromise = null;

/**
 * Loads and caches the lowlight instance. Safe to call repeatedly and concurrently - the
 * in-flight promise is shared rather than starting a second import. Returns `null` if the
 * dynamic import fails, so callers always have a plain-text fallback.
 * @returns {Promise<Lowlight | null>}
 */
export async function ensureHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('lowlight').then(({ createLowlight, common }) =>
      createLowlight(common)
    );
  }
  try {
    return await highlighterPromise;
  } catch {
    highlighterPromise = null;
    return null;
  }
}

/**
 * @param {string} language
 * @returns {boolean}
 */
export function isKnownLanguage(language) {
  return LANGUAGES.some((l) => l.id === language);
}

/**
 * Splits a hast root produced by lowlight into one run array per source line, carrying each
 * text node's nearest ancestor className down to it.
 * @param {HastRoot} tree
 * @param {number} lineCount
 * @returns {HighlightRun[][]}
 */
function splitTreeIntoLines(tree, lineCount) {
  /** @type {HighlightRun[][]} */
  const lines = Array.from({ length: lineCount }, () => []);
  let lineIndex = 0;

  /**
   * @param {HastNode} node
   * @param {string | null} className
   */
  function walk(node, className) {
    if (node.type === 'text') {
      const parts = node.value.split('\n');
      parts.forEach((part, i) => {
        if (part.length > 0 && lineIndex < lineCount) {
          lines[lineIndex].push({ text: part, className });
        }
        if (i < parts.length - 1) lineIndex++;
      });
      return;
    }
    if (node.type === 'element') {
      const classes = node.properties?.className;
      const nextClassName = Array.isArray(classes)
        ? String(classes[0])
        : typeof classes === 'string'
          ? classes
          : className;
      for (const child of node.children) walk(child, nextClassName);
    }
  }

  for (const child of tree.children) walk(child, null);
  return lines;
}

/**
 * Highlights the whole document in one pass (so block comments and multi-line strings stay
 * classified correctly) and returns one run array per line. `plain`, an unknown language, or a
 * highlighter that has not finished loading all fall back to a single unstyled run per line, so
 * panes render correctly before/without the dynamic import.
 * @param {string[]} lines
 * @param {string} language
 * @param {Lowlight | null} [lowlight]
 * @returns {HighlightRun[][]}
 */
export function highlightLines(lines, language, lowlight) {
  if (language === 'plain' || !lowlight || !isKnownLanguage(language)) {
    return lines.map((line) => (line.length === 0 ? [] : [{ text: line, className: null }]));
  }

  try {
    // lowlight's real hast tree has more node variants (comment, doctype, ...) than the local
    // HastNode shape above models, so the boundary is cast explicitly here; splitTreeIntoLines
    // narrows with runtime `type` checks regardless of what's actually in the tree.
    const tree = /** @type {HastRoot} */ (
      /** @type {unknown} */ (lowlight.highlight(language, lines.join('\n')))
    );
    return splitTreeIntoLines(tree, lines.length);
  } catch {
    return lines.map((line) => (line.length === 0 ? [] : [{ text: line, className: null }]));
  }
}
