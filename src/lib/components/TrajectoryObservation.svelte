<script>
  import TrajectoryCodeBlock from './TrajectoryCodeBlock.svelte';
  import MetadataList from './MetadataList.svelte';
  import { guessCodeLanguage } from '$lib/trajectory-content.js';

  /**
   * Renders one observation result: an optional severity-colored notice banner (extracted by
   * `splitObservation()`/`noticeLevel()`) followed by the terminal/content code block and its
   * metadata. Shared by both the per-tool-call and step-level observation lists in
   * TrajectoryStepDetail.svelte, which previously duplicated this markup verbatim.
   */

  /**
   * @typedef {Object} TrajectoryObservationProps
   * @property {import('$lib/agent-trajectory.js').ObservationResult} observation
   * @property {import('$lib/syntax-highlight.js').Lowlight | null} [lowlight]
   * @property {string} [metadataTitle]
   */

  /** @type {TrajectoryObservationProps} */
  let { observation, lowlight = null, metadataTitle = 'Observation metadata' } = $props();

  const NOTICE_CLASSES = /** @type {Record<string, string>} */ ({
    err: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
    warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    ok: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
  });

  /** @param {import('$lib/agent-trajectory.js').IssueLevel} level */
  function noticeClass(level) {
    return NOTICE_CLASSES[level] ?? NOTICE_CLASSES.ok;
  }
</script>

{#if observation.notice}
  <div
    data-testid="observation-notice"
    class="rounded border px-3 py-2 font-mono text-[1em] break-words whitespace-pre-wrap {noticeClass(
      observation.level
    )}"
  >
    {observation.notice}
  </div>
{/if}
{#if observation.terminal || !observation.notice}
  <TrajectoryCodeBlock
    label={observation.marker ?? 'Observation'}
    code={observation.terminal || observation.content}
    language={guessCodeLanguage(observation.terminal || observation.content, 'bash', lowlight)}
    {lowlight}
  />
{/if}
<MetadataList entries={observation.metadata} title={metadataTitle} />
