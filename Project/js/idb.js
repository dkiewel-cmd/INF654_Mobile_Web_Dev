/**
 * idb.js: IndexedDB storage (offline data)
 *
 * Database "loci-intellectus-db" has one object store, "tasks", keyed by the task's
 * client-generated `id` (the same id is used as the Firestore document id).
 * Besides the task fields, each record carries two local-only flags:
 *   synced  : true once the record's latest version is in Firebase
 *   deleted : true for a "tombstone" (deleted offline, delete not yet sent to Firebase)
 * IndexedDB is stored on disk, so records survive page reloads and browser restarts.
 */
const DB_NAME = 'loci-intellectus-db';
const DB_VERSION = 1;
const STORE = 'tasks';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex('synced', 'synced', { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function run(mode, action) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = action(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => reject(tx.error);
    });
}

export const idbGetAll = () => run('readonly', store => store.getAll());
export const idbPut = record => run('readwrite', store => store.put(record));
export const idbDelete = id => run('readwrite', store => store.delete(id));
