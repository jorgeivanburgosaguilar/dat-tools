const DB_NAME = 'StopwatchDB';
const STORE_NAME = 'records';
/** @type {IDBDatabase | null} */
let db = null;

/**
 * Initializes the IndexedDB database for storing stopwatch records.
 * Creates the database and object store if they don't exist.
 * @returns {Promise<IDBDatabase>} A promise that resolves to the database instance
 */
export async function initDB() {
	if (db) return db;

	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);

		request.onerror = () => reject(request.error);
		request.onsuccess = () => {
			db = request.result;
			resolve(db);
		};

		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
			}
		};
	});
}

/**
 * Saves a stopwatch session record to the database.
 * @param {string} sessionName - The name of the stopwatch session
 * @param {number} startTimestamp - The start timestamp in milliseconds
 * @param {number} endTimestamp - The end timestamp in milliseconds
 * @param {number} elapsed - The total elapsed time in milliseconds
 * @param {Array<{start: number, end: number}>} workSegments - Array of work segments with start and end times
 * @returns {Promise<IDBValidKey>} A promise that resolves to the auto-generated record ID
 */
export async function saveRecord(sessionName, startTimestamp, endTimestamp, elapsed, workSegments) {
	const db = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.add({
			sessionName,
			startTimestamp,
			endTimestamp,
			elapsed,
			workSegments,
			date: new Date().toISOString()
		});

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Retrieves all saved stopwatch records from the database.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of records in reverse chronological order
 */
export async function getAllRecords() {
	const db = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.getAll();

		request.onsuccess = () => resolve(request.result.reverse());
		request.onerror = () => reject(request.error);
	});
}

/**
 * Clears all stopwatch records from the database.
 * @returns {Promise<void>} A promise that resolves when all records are cleared
 */
export async function clearAllRecords() {
	const db = await initDB();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction([STORE_NAME], 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.clear();

		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}
