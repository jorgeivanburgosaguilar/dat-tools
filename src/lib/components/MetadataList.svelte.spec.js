import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import MetadataList from './MetadataList.svelte';
import TrajectoryInfo from './TrajectoryInfo.svelte';
import { normalizeTrajectory } from '$lib/agent-trajectory.js';

describe('MetadataList', () => {
  it('shows top-level scalars as plain rows', async () => {
    render(MetadataList, {
      entries: [{ path: 'flag', value: 'on', isJson: false }],
      title: 'Meta'
    });
    await expect.element(page.getByText('flag')).toBeVisible();
    await expect.element(page.getByText('on', { exact: true })).toBeVisible();
  });

  it('renders nested paths as accordions that are open by default', async () => {
    render(MetadataList, {
      entries: [
        { path: 'outer.inner.leaf', value: 'deep-value', isJson: false },
        { path: 'outer.sibling', value: 'side-value', isJson: false }
      ]
    });
    await expect.element(page.getByText('deep-value')).toBeVisible();
    await expect.element(page.getByText('side-value')).toBeVisible();
    const groups = document.querySelectorAll('[data-testid="metadata-group"]');
    expect(groups.length).toBe(2);
    expect([...groups].every((g) => /** @type {HTMLDetailsElement} */ (g).open)).toBe(true);
  });
});

describe('TrajectoryInfo', () => {
  /** @param {Record<string, unknown>} data */
  function build(data) {
    const result = normalizeTrajectory({
      steps: [{ step_id: 1, source: 'user', message: 'm' }],
      ...data
    });
    if (!result.ok) throw new Error('expected ok');
    return result;
  }

  it('renders nothing when the trajectory has no top-level details', async () => {
    render(TrajectoryInfo, { trajectory: build({}) });
    expect(document.querySelector('button')).toBeNull();
  });

  it('opens a modal with agent metadata as an expanded tree', async () => {
    render(TrajectoryInfo, {
      trajectory: build({
        session_id: 'sess-1',
        agent: { name: 'runner', extra: { config: { limit: 5 } } }
      })
    });
    await page.getByRole('button', { name: 'Info' }).click();
    await expect.element(page.getByText('sess-1')).toBeVisible();
    await expect.element(page.getByText('limit')).toBeVisible();
  });
});
