import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import RecordsList from './RecordsList.svelte';

/** @param {any} record */
function defaultFormatRow(record) {
  return `<span>${record.label}</span>`;
}

const sampleRecords = [
  { id: 1, label: 'Record One' },
  { id: 2, label: 'Record Two' },
  { id: 3, label: 'Record Three' }
];

const defaultProps = { formatRow: defaultFormatRow, onclear: () => {} };

describe('RecordsList', () => {
  it('renders default title', async () => {
    const screen = render(RecordsList, defaultProps);
    await expect.element(screen.getByRole('heading', { name: 'Records' })).toBeVisible();
  });

  it('renders custom title', async () => {
    const screen = render(RecordsList, { ...defaultProps, title: 'My Records' });
    await expect.element(screen.getByRole('heading', { name: 'My Records' })).toBeVisible();
  });

  it('shows empty message when no records', async () => {
    const screen = render(RecordsList, defaultProps);
    await expect.element(screen.getByText('No records yet')).toBeVisible();
  });

  it('shows custom empty message', async () => {
    const screen = render(RecordsList, {
      ...defaultProps,
      emptyMessage: 'Nothing here'
    });
    await expect.element(screen.getByText('Nothing here')).toBeVisible();
  });

  it('does not show Clear All button when empty', async () => {
    const screen = render(RecordsList, defaultProps);
    await expect.element(screen.getByRole('button', { name: 'Clear All' })).not.toBeInTheDocument();
  });

  it('renders records using formatRow', async () => {
    const screen = render(RecordsList, {
      ...defaultProps,
      records: sampleRecords
    });
    await expect.element(screen.getByText('Record One')).toBeVisible();
    await expect.element(screen.getByText('Record Two')).toBeVisible();
    await expect.element(screen.getByText('Record Three')).toBeVisible();
  });

  it('shows Clear All button when records exist', async () => {
    const screen = render(RecordsList, {
      ...defaultProps,
      records: sampleRecords
    });
    await expect.element(screen.getByRole('button', { name: 'Clear All' })).toBeVisible();
  });

  it('opens confirmation modal when Clear All is clicked', async () => {
    const screen = render(RecordsList, {
      records: sampleRecords,
      formatRow: defaultFormatRow,
      onclear: vi.fn()
    });
    await screen.getByRole('button', { name: 'Clear All' }).click();
    await expect
      .element(screen.getByText('Are you sure you want to clear all records?'))
      .toBeVisible();
  });

  it('closes modal without calling onclear when Cancel is clicked', async () => {
    const onclear = vi.fn();
    const screen = render(RecordsList, {
      records: sampleRecords,
      formatRow: defaultFormatRow,
      onclear
    });
    await screen.getByRole('button', { name: 'Clear All' }).click();
    await screen.getByRole('button', { name: 'Cancel' }).click();
    await expect
      .element(screen.getByText('Are you sure you want to clear all records?'))
      .not.toBeInTheDocument();
    expect(onclear).not.toHaveBeenCalled();
  });

  it('calls onclear and closes modal when confirmed', async () => {
    const onclear = vi.fn();
    const screen = render(RecordsList, {
      records: sampleRecords,
      formatRow: defaultFormatRow,
      onclear
    });
    // Click the header "Clear All" button
    await screen.getByRole('button', { name: 'Clear All' }).click();
    // Now there are two "Clear All" elements — click the modal confirm button
    const clearButtons = screen.getByRole('button', { name: 'Clear All' }).all();
    // The last one is the modal confirm button
    await clearButtons[clearButtons.length - 1].click();
    expect(onclear).toHaveBeenCalledOnce();
    await expect
      .element(screen.getByText('Are you sure you want to clear all records?'))
      .not.toBeInTheDocument();
  });
});
