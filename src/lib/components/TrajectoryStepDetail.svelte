<script>
  import TrajectoryRichText from './TrajectoryRichText.svelte';
  import TrajectoryCodeBlock from './TrajectoryCodeBlock.svelte';
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
</script>

{#if step}
  {@const currentStep = step}
  <div class="flex-1 space-y-4 overflow-y-auto p-4">
    <div
      class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
    >
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

    {#if currentStep.message}
      <details open>
        <summary
          class="cursor-pointer text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Message
        </summary>
        <div
          data-testid="step-message"
          class="mt-2 rounded border border-gray-200 dark:border-gray-700"
        >
          <TrajectoryRichText text={currentStep.message} {lowlight} />
        </div>
      </details>
    {/if}

    {#if currentStep.toolCalls.length > 0}
      <details open>
        <summary
          class="cursor-pointer text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Tool Calls ({currentStep.toolCalls.length})
        </summary>
        <div class="mt-2 space-y-3">
          {#each currentStep.toolCalls as toolCall, ti (toolCall.toolCallId ?? ti)}
            <div class="space-y-2 rounded border border-gray-200 p-2 dark:border-gray-700">
              <div class="flex flex-wrap items-center gap-2 text-xs">
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
                <TrajectoryCodeBlock
                  label="Observation"
                  code={obs.content}
                  language="plain"
                  {lowlight}
                />
                <MetadataList entries={obs.metadata} title="Observation metadata" />
              {/each}
            </div>
          {/each}
        </div>
      </details>
    {/if}

    {#if hasObservationSection}
      <details open>
        <summary
          class="cursor-pointer text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Observation
        </summary>
        <div class="mt-2 space-y-2">
          <MetadataList entries={currentStep.observationMetadata} title="Observation metadata" />
          {#each currentStep.stepObservations as obs, oi (obs.sourceCallId ?? oi)}
            <TrajectoryCodeBlock
              label="Observation"
              code={obs.content}
              language="plain"
              {lowlight}
            />
            <MetadataList entries={obs.metadata} title="Result metadata" />
          {/each}
        </div>
      </details>
    {/if}

    {#if currentStep.metrics.length > 0}
      <details open>
        <summary
          class="cursor-pointer text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          Metrics
        </summary>
        <dl class="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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

    <details>
      <summary
        class="cursor-pointer text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
      >
        Raw JSON
      </summary>
      <div class="mt-2">
        <TrajectoryCodeBlock label="step.json" code={rawJson} language="json" {lowlight} />
      </div>
    </details>
  </div>
{:else}
  <p class="p-4 text-sm text-gray-500 dark:text-gray-400">Select a step to see its details.</p>
{/if}
