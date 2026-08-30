import { describe, it, expect, beforeEach } from 'vitest';
import { initDB, saveRecord, getAllRecords, clearAllRecords } from './stopwatch-db.js';

describe('stopwatch-db', () => {
  beforeEach(async () => {
    // initDB() caches its connection in module scope, so tests share one open
    // database for the file's lifetime. Clearing records (rather than deleting
    // the database) keeps each test isolated without touching that cached
    // connection.
    await clearAllRecords();
  });

  it('initializes the database with a records object store', async () => {
    const db = await initDB();
    expect(db.name).toBe('StopwatchDB');
    expect(db.objectStoreNames.contains('records')).toBe(true);
  });

  it('computes elapsedMinutes from elapsedMs and persists timestamps', async () => {
    await saveRecord(1000, 125000, 124000);
    const [record] = await getAllRecords();
    expect(record.startTimestamp).toBe(1000);
    expect(record.endTimestamp).toBe(125000);
    expect(record.elapsedMinutes).toBe(2); // Math.floor(124000 / 60000)
  });

  it('does not persist the raw elapsedMs value', async () => {
    await saveRecord(0, 60000, 60000);
    const [record] = await getAllRecords();
    expect(record).not.toHaveProperty('elapsedMs');
  });

  it('rounds down elapsed minutes for a sub-minute session', async () => {
    await saveRecord(0, 59999, 59999);
    const [record] = await getAllRecords();
    expect(record.elapsedMinutes).toBe(0);
  });

  it('returns records in reverse chronological (most-recent-first) order', async () => {
    await saveRecord(0, 60000, 60000);
    await saveRecord(1, 120000, 120000);
    await saveRecord(2, 180000, 180000);
    const records = await getAllRecords();
    expect(records.map((r) => r.startTimestamp)).toEqual([2, 1, 0]);
  });

  it('clears all records', async () => {
    await saveRecord(0, 60000, 60000);
    await clearAllRecords();
    expect(await getAllRecords()).toEqual([]);
  });

  it('returns an empty array when no records exist', async () => {
    expect(await getAllRecords()).toEqual([]);
  });
});
