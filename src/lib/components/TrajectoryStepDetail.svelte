<script>
  import TrajectoryRichText from './TrajectoryRichText.svelte';
  import TrajectoryCodeBlock from './TrajectoryCodeBlock.svelte';
  import TrajectoryObservation from './TrajectoryObservation.svelte';
  import MetadataList from './MetadataList.svelte';
  import { guessCodeLanguage } from '$lib/trajectory-content.js';

  /**
   * @typedef {Object} TrajectoryStepDetailProps
   * @property {import('$lib/agent-trajectory.js').TrajectoryStep | null} step
   * @property {import('$lib/syntax-highlight.js').Lowlight | null} [lowlight]
   */

  /** @type {TrajectoryStepDetailProps} */
  let { step, lowlight = null } = $props();

  let rawJson = $derived(step ? JSON.stringify(step.raw, null, 2) : '');
  let hasObservationSection = $derived(
    !!step && (step.stepObservations.length > 0 || step.observationMetadata.length > 0)
  );

  // Per-window view state for the six collapsible sections below, driven by the Expand/Collapse
  // all buttons as well as each section's own <summary>. Deliberately *not* reset when `step`
  // changes - a reader who collapsed Raw JSON while triaging wants it to stay collapsed while
  // arrowing through the rest of the steps.
  let open = $state({
    message: true,
    reasoning: true,
    tools: true,
    observation: true,
    metrics: true,
    raw: false
  });

  function expandAll() {
    open = {
      message: true,
      reasoning: true,
      tools: true,
      observation: true,
      metrics: true,
      raw: true
    };
  }

  function collapseAll() {
    open = {
      message: false,
      reasoning: false,
      tools: false,
      observation: false,
      metrics: false,
      raw: false
    };
  }
</script>

{#if step}
  {@const currentStep = step}
  <div class="flex-1 space-y-4 overflow-y-auto p-4">
    <div
      class="flex flex-wrap items-center justify-between gap-2 text-[1em] text-gray-500 dark:text-gray-400"
    >
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="font-mono font-semibold text-gray-900 dark:text-gray-100"
          >Step {currentStep.stepId}</span
        >
        <span>&middot;</span>
        <span class="capitalize">{currentStep.source}</span>
        {#if currentStep.timestamp}
          <span>&middot;</span>
          <span class="font-mono">{currentStep.timestamp}</span>
        {/if}
        {#if currentStep.modelName}
          <span>&middot;</span>
          <span class="font-mono">{currentStep.modelName}</span>
        {/if}
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          onclick={expandAll}
          class="rounded px-2 py-0.5 text-[0.9em] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          Expand all
        </button>
        <button
          type="button"
          onclick={collapseAll}
          class="rounded px-2 py-0.5 text-[0.9em] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          Collapse all
        </button>
      </div>
    </div>

    {#if currentStep.message}
      <details bind:open={open.message}>
        <summary
          class="cursor-pointer text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Message
          {#if currentStep.messageMalformed}
            <span
              class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[0.85em] font-medium tracking-normal text-amber-800 normal-case dark:bg-amber-900/50 dark:text-amber-300"
              >malformed output</span
            >
          {/if}
        </summary>
        <div
          data-testid="step-message"
          class="mt-2 rounded border border-gray-200 dark:border-gray-700"
        >
          {#if currentStep.messageFields.length > 0}
            <div class="divide-y divide-gray-100 dark:divide-gray-800">
              {#each currentStep.messageFields as field (field.key)}
                <div class="p-2">
                  <h4
                    class="mb-1 text-[0.9em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
                  >
                    {field.key}
                  </h4>
                  <TrajectoryRichText text={field.value} {lowlight} />
                </div>
              {/each}
            </div>
          {:else}
            <TrajectoryRichText text={currentStep.message} {lowlight} />
          {/if}
        </div>
      </details>
    {/if}

    {#if currentStep.reasoningContent}
      <details bind:open={open.reasoning}>
        <summary
          class="cursor-pointer text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Reasoning
        </summary>
        <div
          data-testid="step-reasoning"
          class="mt-2 rounded border border-gray-200 dark:border-gray-700"
        >
          <TrajectoryRichText text={currentStep.reasoningContent} {lowlight} />
        </div>
      </details>
    {/if}

    {#if currentStep.toolCalls.length > 0}
      <details bind:open={open.tools}>
        <summary
          class="cursor-pointer text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Tool Calls ({currentStep.toolCalls.length})
        </summary>
        <div class="mt-2 space-y-3">
          {#each currentStep.toolCalls as toolCall, ti (toolCall.toolCallId ?? ti)}
            <div class="space-y-2 rounded border border-gray-200 p-2 dark:border-gray-700">
              <div class="flex flex-wrap items-center gap-2 text-[1em]">
                <span class="font-mono font-semibold text-gray-900 dark:text-gray-100"
                  >{toolCall.functionName}</span
                >
                {#if toolCall.toolCallId}
                  <span class="font-mono text-gray-400 dark:text-gray-500"
                    >{toolCall.toolCallId}</span
                  >
                {/if}
              </div>
              {#each toolCall.codeArgs as arg (arg.label)}
                <TrajectoryCodeBlock
                  label={arg.label}
                  code={arg.code}
                  language={guessCodeLanguage(arg.code, 'bash', lowlight)}
                  {lowlight}
                />
              {/each}
              <MetadataList entries={toolCall.metadata} title="Arguments" />
              {#each toolCall.observations as obs, oi (obs.sourceCallId ?? oi)}
                <TrajectoryObservation observation={obs} {lowlight} />
              {/each}
            </div>
          {/each}
        </div>
      </details>
    {/if}

    {#if hasObservationSection}
      <details bind:open={open.observation}>
        <summary
          class="cursor-pointer text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Observation
        </summary>
        <div class="mt-2 space-y-2">
          <MetadataList entries={currentStep.observationMetadata} title="Observation metadata" />
          {#each currentStep.stepObservations as obs, oi (obs.sourceCallId ?? oi)}
            <TrajectoryObservation observation={obs} {lowlight} metadataTitle="Result metadata" />
          {/each}
        </div>
      </details>
    {/if}

    {#if currentStep.metrics.length > 0}
      <details bind:open={open.metrics}>
        <summary
          class="cursor-pointer text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Metrics
        </summary>
        <dl class="mt-2 grid grid-cols-2 gap-2 text-[1em] sm:grid-cols-4">
          {#each currentStep.metrics as metric (metric.key)}
            <div class="rounded border border-gray-200 p-2 dark:border-gray-700">
              <dt class="text-gray-500 dark:text-gray-400">{metric.key}</dt>
              <dd class="font-mono font-semibold text-gray-900 dark:text-gray-100">
                {metric.display}
              </dd>
            </div>
          {/each}
        </dl>
      </details>
    {/if}

    <div data-testid="step-metadata">
      <MetadataList entries={currentStep.metadata} title="Metadata" />
    </div>

    <details bind:open={open.raw}>
      <summary
        class="cursor-pointer text-[1em] font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
      >
        Raw JSON
      </summary>
      <div class="mt-2">
        <TrajectoryCodeBlock label="step.json" code={rawJson} language="json" {lowlight} />
      </div>
    </details>
  </div>
{:else}
  <p class="p-4 text-[1.125em] text-gray-500 dark:text-gray-400">
    Select a step to see its details.
  </p>
{/if}
