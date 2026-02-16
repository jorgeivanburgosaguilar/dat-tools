import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Stopwatch from './Stopwatch.svelte';

describe('Stopwatch', () => {
  it('renders initial time display as 00:00:00', async () => {
    const screen = render(Stopwatch);
    await expect.element(screen.getByText('00:00:00')).toBeVisible();
  });

  it('renders Start and Stop buttons initially', async () => {
    const screen = render(Stopwatch);
    await expect.element(screen.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
  });

  it('shows Pause button after clicking Start', async () => {
    const screen = render(Stopwatch);
    await screen.getByRole('button', { name: 'Start' }).click();
    await expect.element(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  it('shows Continue button after clicking Pause', async () => {
    const screen = render(Stopwatch);
    await screen.getByRole('button', { name: 'Start' }).click();
    await screen.getByRole('button', { name: 'Pause' }).click();
    await expect.element(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  it('shows Pause button again after clicking Continue', async () => {
    const screen = render(Stopwatch);
    await screen.getByRole('button', { name: 'Start' }).click();
    await screen.getByRole('button', { name: 'Pause' }).click();
    await screen.getByRole('button', { name: 'Continue' }).click();
    await expect.element(screen.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  it('shows Start button again after Stop', async () => {
    const screen = render(Stopwatch);
    await screen.getByRole('button', { name: 'Start' }).click();
    await screen.getByRole('button', { name: 'Stop' }).click();
    await expect.element(screen.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  it('calls onstart callback when started', async () => {
    const onstart = vi.fn();
    const screen = render(Stopwatch, { onstart });
    await screen.getByRole('button', { name: 'Start' }).click();
    expect(onstart).toHaveBeenCalledOnce();
    expect(onstart).toHaveBeenCalledWith(
      expect.objectContaining({ elapsedTime: expect.any(Number) })
    );
  });

  it('calls onpause callback when paused', async () => {
    const onpause = vi.fn();
    const screen = render(Stopwatch, { onpause });
    await screen.getByRole('button', { name: 'Start' }).click();
    await screen.getByRole('button', { name: 'Pause' }).click();
    expect(onpause).toHaveBeenCalledOnce();
    expect(onpause).toHaveBeenCalledWith(
      expect.objectContaining({ elapsedTime: expect.any(Number) })
    );
  });

  it('calls onstop callback when stopped after running', async () => {
    const onstop = vi.fn();
    const screen = render(Stopwatch, { onstop });
    await screen.getByRole('button', { name: 'Start' }).click();
    // Wait for the 1-second interval to fire so elapsedTime > 0
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await screen.getByRole('button', { name: 'Stop' }).click();
    expect(onstop).toHaveBeenCalledOnce();
    expect(onstop).toHaveBeenCalledWith(
      expect.objectContaining({
        elapsedTime: expect.any(Number),
        sessionStartTime: expect.any(Number),
        endTimestamp: expect.any(Number)
      })
    );
  });

  it('does not call onstop if never started', async () => {
    const onstop = vi.fn();
    const screen = render(Stopwatch, { onstop });
    await screen.getByRole('button', { name: 'Stop' }).click();
    expect(onstop).not.toHaveBeenCalled();
  });
});
