const DB_NAME = 'StopwatchDB';
const STORE_NAME = 'records';
let db = null;

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
