<script>
  import { renderRichText } from '$lib/trajectory-content.js';
  import 'github-markdown-css/github-markdown.css';

  /**
   * @typedef {Object} TrajectoryRichTextProps
   * @property {string} text
   * @property {import('$lib/syntax-highlight.js').Lowlight | null} [lowlight]
   */

  /** @type {TrajectoryRichTextProps} */
  let { text, lowlight = null } = $props();

  let html = $derived(renderRichText(text, lowlight));
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized by DOMPurify in renderRichText -->
<div class="markdown-body p-3 text-sm">{@html html}</div>
