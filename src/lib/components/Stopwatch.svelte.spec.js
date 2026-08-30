import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Stopwatch from './Stopwatch.svelte';
import { clearAllRecords } from '$lib/stopwatch-db';
import { clearPausedSession } from '$lib/stopwatch-storage';

describe('Stopwatch', () => {
  beforeEach(() => {
    // Only fake what the component actually drives its own timing with.
    // Leaving setTimeout real keeps expect.element(...) retry-polling working,
    // since vitest-browser-svelte's assertions rely on it internally.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await clearAllRecords();
    clearPausedSession();
  });

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
    // Advance the faked clock so the 1-second interval fires and elapsedTime > 0
    await vi.advanceTimersByTimeAsync(1100);
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

  it('calls ontick at 5-second intervals', async () => {
    const ontick = vi.fn();
    const screen = render(Stopwatch, { ontick });
    await screen.getByRole('button', { name: 'Start' }).click();

    await vi.advanceTimersByTimeAsync(5000);
    expect(ontick).toHaveBeenCalledTimes(1);
    expect(ontick).toHaveBeenCalledWith(
      expect.objectContaining({ elapsedTime: expect.any(Number) })
    );

    await vi.advanceTimersByTimeAsync(5000);
    expect(ontick).toHaveBeenCalledTimes(2);
  });

  it('stops interval after component unmount', async () => {
    const ontick = vi.fn();
    const screen = render(Stopwatch, { ontick });
    await screen.getByRole('button', { name: 'Start' }).click();

    await vi.advanceTimersByTimeAsync(5000);
    expect(ontick).toHaveBeenCalledTimes(1);

    screen.unmount();

    await vi.advanceTimersByTimeAsync(10000);
    expect(ontick).toHaveBeenCalledTimes(1); // no additional calls after unmount
  });

  describe('Laps', () => {
    it('shows a Lap button only while running', async () => {
      const screen = render(Stopwatch);
      await expect.element(screen.getByRole('button', { name: 'Lap' })).not.toBeInTheDocument();

      await screen.getByRole('button', { name: 'Start' }).click();
      await expect.element(screen.getByRole('button', { name: 'Lap' })).toBeVisible();

      await screen.getByRole('button', { name: 'Pause' }).click();
      await expect.element(screen.getByRole('button', { name: 'Lap' })).not.toBeInTheDocument();
    });

    it('adds a lap entry when Lap is clicked', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Lap' }).click();
      await expect.element(screen.getByText(/⏳ Lap 1:/)).toBeVisible();
    });

    it('computes distinct split durations for consecutive laps', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();

      // First lap: ~61s elapsed since session start -> a 1-minute split
      await vi.advanceTimersByTimeAsync(61000);
      await screen.getByRole('button', { name: 'Lap' }).click();
      await expect.element(screen.getByText(/⏳ Lap 1:.*00:01/)).toBeVisible();

      // Second lap: ~121s further -> a 2-minute split, distinct from the first
      await vi.advanceTimersByTimeAsync(121000);
      await screen.getByRole('button', { name: 'Lap' }).click();
      await expect.element(screen.getByText(/⏳ Lap 2:.*00:02/)).toBeVisible();
    });

    it('clears laps when starting a fresh session after Stop', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Lap' }).click();
      await expect.element(screen.getByText(/⏳ Lap 1:/)).toBeVisible();

      await screen.getByRole('button', { name: 'Stop' }).click();
      await screen.getByRole('button', { name: 'Start' }).click();
      await expect.element(screen.getByText(/⏳ Lap/)).not.toBeInTheDocument();
    });

    it('persists laps across a pause/remount cycle', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Lap' }).click();
      await expect.element(screen.getByText(/⏳ Lap 1:/)).toBeVisible();

      await screen.getByRole('button', { name: 'Pause' }).click();
      screen.unmount();

      const remounted = render(Stopwatch);
      await expect.element(remounted.getByText(/⏳ Lap 1:/)).toBeVisible();
    });

    it('records a final partial lap on Stop when time passed since the last lap', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Lap' }).click();
      await expect.element(screen.getByText(/⏳ Lap 1:/)).toBeVisible();

      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Stop' }).click();
      await expect.element(screen.getByText(/⏳ Lap 2:/)).toBeVisible();
    });
  });

  describe('Paused session persistence', () => {
    it('restores elapsed time and Continue state on remount after pause', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Pause' }).click();
      screen.unmount();

      const remounted = render(Stopwatch);
      await expect.element(remounted.getByRole('button', { name: 'Continue' })).toBeVisible();
    });

    it('does not show a "Resumed from a pause" note on a normal pause without reload', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Pause' }).click();
      await expect.element(screen.getByText(/Resumed from a pause/)).not.toBeInTheDocument();
    });

    it('shows a "Resumed from a pause" note after remount', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Pause' }).click();
      screen.unmount();

      const remounted = render(Stopwatch);
      await expect.element(remounted.getByText(/Resumed from a pause/)).toBeVisible();
    });

    it('hides the "Resumed from a pause" note after Stop', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Pause' }).click();
      screen.unmount();

      const remounted = render(Stopwatch);
      await expect.element(remounted.getByText(/Resumed from a pause/)).toBeVisible();
      await remounted.getByRole('button', { name: 'Stop' }).click();
      await expect.element(remounted.getByText(/Resumed from a pause/)).not.toBeInTheDocument();
    });

    it('does not restore a paused session after Stop', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Pause' }).click();
      await screen.getByRole('button', { name: 'Stop' }).click();
      screen.unmount();

      const remounted = render(Stopwatch);
      await expect.element(remounted.getByRole('button', { name: 'Start' })).toBeVisible();
    });
  });

  describe('Records', () => {
    it('renders "No records yet" on initial mount', async () => {
      const screen = render(Stopwatch);
      await expect.element(screen.getByText('No records yet')).toBeVisible();
    });

    it('shows a record entry after starting and stopping', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Stop' }).click();
      await expect.element(screen.getByText(/Duration:/)).toBeVisible();
    });

    it('does not show a duplicate record if stopped twice without restarting', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Stop' }).click();
      await expect.element(screen.getByText(/Duration:/)).toBeVisible();
      // Stop again without restarting — sessionStartTime is 0, so no save occurs
      await screen.getByRole('button', { name: 'Stop' }).click();
      expect(screen.getByText(/Duration:/).all()).toHaveLength(1);
    });

    it('shows "Clear All Records" button only when records exist', async () => {
      const screen = render(Stopwatch);
      await expect
        .element(screen.getByRole('button', { name: 'Clear All Records' }))
        .not.toBeInTheDocument();

      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Stop' }).click();
      await expect.element(screen.getByRole('button', { name: 'Clear All Records' })).toBeVisible();
    });

    it('clicking "Clear All Records" opens the confirmation modal', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Stop' }).click();
      await screen.getByRole('button', { name: 'Clear All Records' }).click();
      await expect
        .element(screen.getByText('Are you sure you want to clear all records?'))
        .toBeVisible();
    });

    it('clicking Cancel closes the modal without clearing records', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Stop' }).click();
      await expect.element(screen.getByText(/Duration:/)).toBeVisible();
      await screen.getByRole('button', { name: 'Clear All Records' }).click();
      await screen.getByRole('button', { name: 'Cancel' }).click();
      await expect
        .element(screen.getByText('Are you sure you want to clear all records?'))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText(/Duration:/)).toBeVisible();
    });

    it('clicking confirm in the modal clears records and shows "No records yet"', async () => {
      const screen = render(Stopwatch);
      await screen.getByRole('button', { name: 'Start' }).click();
      await vi.advanceTimersByTimeAsync(1100);
      await screen.getByRole('button', { name: 'Stop' }).click();
      await expect.element(screen.getByText(/Duration:/)).toBeVisible();
      await screen.getByRole('button', { name: 'Clear All Records' }).click();
      // Click the modal's "Clear All" confirm button (exact to avoid matching "Clear All Records")
      await screen.getByRole('button', { name: 'Clear All', exact: true }).click();
      await expect.element(screen.getByText('No records yet')).toBeVisible();
    });
  });
});
