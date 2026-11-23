/**
 * tasks.js: task CRUD, online/offline storage, and synchronization
 *
 * Storage rules:
 *   ONLINE  → each create/update/delete is written to Firestore (collection "tasks"),
 *             then mirrored into IndexedDB with synced: true (so it's available offline).
 *   OFFLINE → the change is written only to IndexedDB with synced: false.
 *             Deletes become tombstones (deleted: true) so they can be replayed later.
 *   FAILURE → if a Firebase call fails or times out while "online", the change falls
 *             back to IndexedDB as unsynced and the user is told why.
 *
 * IDs: every task gets crypto.randomUUID() when it's created in the browser. That same
 * id is the IndexedDB key and the Firestore document id (setDoc(doc(tasks, id))), so
 * re-sending a record overwrites one document and never creates a duplicate.
 *
 * Sync: on the "online" event, on startup, and every 30s while changes are pending,
 * syncPending() pushes every unsynced IndexedDB record to Firestore, then marks it synced
 * (or removes the tombstone). All data operations run through a one-at-a-time queue so
 * a sync and a user edit can never interleave while the connection is switching.
 */
import { firebaseConfig } from './firebase-config.js';
import { idbGetAll, idbPut, idbDelete } from './idb.js';

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const configured = !firebaseConfig.apiKey.startsWith('YOUR_');

// The Firebase SDK is loaded separately (dynamic import) so that if it can't load
// while offline, the IndexedDB CRUD below still works normally.
let fs = null;        // Firestore functions: doc, getDocs, setDoc, deleteDoc
let tasksCol = null;  // Firestore "tasks" collection reference

async function initFirebase() {
    if (!configured || tasksCol) return;
    try {
        const [{ initializeApp, getApps, getApp }, firestore] = await Promise.all([
            import(`${FIREBASE_SDK}/firebase-app.js`),
            import(`${FIREBASE_SDK}/firebase-firestore.js`)
        ]);
        // auth.js also uses Firebase: reuse the app if it already exists
        const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        const db = firestore.getFirestore(app);
        fs = firestore;
        tasksCol = firestore.collection(db, 'tasks');
    } catch (err) {
        console.warn('Firebase SDK unavailable, running on IndexedDB only:', err);
    }
}

let editingId = null;

// ---------- helpers ----------
const isOnline = () => navigator.onLine && tasksCol !== null;

// Firestore queues writes in memory and never rejects if the network silently drops,
// so give each remote call a time limit and fall back to IndexedDB if it expires.
function withTimeout(promise, ms = 6000) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout')), ms))
    ]);
}

// All data operations run one at a time through this queue. This stops a sync that is
// still running from interleaving with a create/edit/delete made while the connection
// is switching (e.g. sync re-uploading an old offline version over a newer edit).
let queue = Promise.resolve();
function serial(fn) {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
}

// Fields stored in Firestore (local-only flags like synced/deleted are left out)
const toRemote = ({ id, title, type, done, createdAt, updatedAt }) =>
    ({ id, title, type, done, createdAt, updatedAt });

// Turns technical errors from Firebase or IndexedDB into a message a user can act on
function friendlyError(err) {
    const code = (err && (err.code || err.name)) || '';
    const msg = (err && err.message) || '';
    if (code === 'permission-denied') return 'Firebase refused access (check the Firestore security rules)';
    if (code === 'unavailable' || msg.includes('timeout')) return 'Firebase did not respond (connection may be weak)';
    if (msg.includes('offline')) return 'the connection dropped';
    if (code === 'QuotaExceededError') return 'this device is out of storage space';
    if (code === 'resource-exhausted') return 'the Firebase usage limit was reached';
    return msg || 'an unexpected error occurred';
}

// ---------- CREATE / UPDATE ----------
function saveTask(task) { return serial(async () => {
    task.updatedAt = Date.now();
    if (isOnline()) {
        try {
            await withTimeout(fs.setDoc(fs.doc(tasksCol, task.id), toRemote(task)));
            await idbPut({ ...task, synced: true, deleted: false });
            return { where: 'firebase' };
        } catch (err) {
            console.warn('Firebase write failed, saving offline instead:', err);
            // Fall back to IndexedDB; the change is marked unsynced and retried later
            await idbPut({ ...task, synced: false, deleted: false });
            return { where: 'local', reason: friendlyError(err) };
        }
    }
    await idbPut({ ...task, synced: false, deleted: false });
    return { where: 'local' };
}); }

// ---------- DELETE ----------
function removeTask(id) { return serial(async () => {
    let fallbackReason = null;
    if (isOnline()) {
        try {
            await withTimeout(fs.deleteDoc(fs.doc(tasksCol, id)));
            await idbDelete(id);
            return { where: 'firebase' };
        } catch (err) {
            console.warn('Firebase delete failed, marking for later sync:', err);
            fallbackReason = friendlyError(err);
        }
    }
    // Keep a "tombstone" so the delete can be replayed against Firebase later
    const existing = (await idbGetAll()).find(t => t.id === id);
    if (existing) await idbPut({ ...existing, deleted: true, synced: false, updatedAt: Date.now() });
    return { where: 'local', reason: fallbackReason };
}); }

// ---------- READ ----------
function loadTasks() { return serial(async () => {
    const local = await idbGetAll();
    if (isOnline()) {
        try {
            const snapshot = await withTimeout(fs.getDocs(tasksCol));
            const pending = new Map(local.filter(t => !t.synced).map(t => [t.id, t]));
            const remoteIds = new Set(snapshot.docs.map(d => d.id));
            // Refresh the IndexedDB cache from Firebase, never overwriting unsynced local changes
            for (const d of snapshot.docs) {
                if (!pending.has(d.id)) await idbPut({ ...d.data(), id: d.id, synced: true, deleted: false });
            }
            // Drop cached records that were deleted in Firebase
            for (const t of local) {
                if (t.synced && !remoteIds.has(t.id)) await idbDelete(t.id);
            }
            return (await idbGetAll()).filter(t => !t.deleted);
        } catch (err) {
            console.warn('Firebase read failed, showing offline data:', err);
        }
    }
    return local.filter(t => !t.deleted);
}); }

// ---------- SYNC ----------
// Pushes every unsynced IndexedDB record to Firebase. Because each record keeps the
// same client-generated id in both stores, setDoc/deleteDoc on doc(tasks, id) simply
// overwrite or remove that one document, so re-running a sync never creates duplicates.
let syncing = false;
async function syncPending({ silent = false } = {}) {
    await initFirebase();   // retry loading the SDK if it failed while offline
    if (!isOnline() || syncing) return;
    syncing = true;
    let count = 0;
    let failed = false;
    try {
        count = await serial(async () => {
            let done = 0;
            const pending = (await idbGetAll()).filter(t => !t.synced);
            for (const task of pending) {
                if (!navigator.onLine) throw new Error('Went offline during sync');
                if (task.deleted) {
                    await withTimeout(fs.deleteDoc(fs.doc(tasksCol, task.id)));
                    await idbDelete(task.id);
                } else {
                    await withTimeout(fs.setDoc(fs.doc(tasksCol, task.id), toRemote(task)));
                    await idbPut({ ...task, synced: true });
                }
                done++;
            }
            return done;
        });
        if (count) M.toast({ html: `✅ Synced ${count} offline change${count > 1 ? 's' : ''} to Firebase`, classes: 'green darken-2' });
    } catch (err) {
        failed = true;
        console.warn('Sync interrupted; unsynced changes stay in IndexedDB and will retry:', err);
        // Nothing is lost: unsynced records stay in IndexedDB until a later sync succeeds.
        // (The 30-second background retry passes silent: true so it doesn't repeat this toast.)
        if (!silent) {
            M.toast({
                html: `⚠️ Sync paused: ${friendlyError(err)}. Your changes are safe on this device and will retry automatically.`,
                classes: 'orange darken-3', displayLength: 6000
            });
        }
    } finally {
        syncing = false;
    }
    await render();
    return !failed;
}

// Safety net: if the connection is flaky (online event fired but requests failed),
// keep retrying every 30 seconds while there are unsynced changes.
setInterval(async () => {
    if (!navigator.onLine || syncing) return;
    const pending = (await idbGetAll()).some(t => !t.synced);
    if (pending) syncPending({ silent: true });
}, 30000);

// ---------- UI ----------
const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function updateBanner() {
    const banner = document.getElementById('status-banner');
    if (!banner) return;
    const pending = (await idbGetAll()).filter(t => !t.synced).length;
    const pendingText = pending ? ` · ${pending} change${pending > 1 ? 's' : ''} waiting to sync` : '';
    if (!configured) {
        banner.textContent = 'Firebase not configured: saving to this device only (IndexedDB)';
        banner.className = 'offline-banner status-offline';
    } else if (navigator.onLine && tasksCol) {
        banner.textContent = `Online: tasks saved to Firebase${pendingText}`;
        banner.className = 'offline-banner status-online';
    } else {
        banner.textContent = `Offline: tasks saved locally (IndexedDB)${pendingText}`;
        banner.className = 'offline-banner status-offline';
    }
}

async function render() {
    const list = document.getElementById('task-list');
    let tasks;
    try {
        tasks = (await loadTasks()).sort((a, b) => a.createdAt - b.createdAt);
    } catch (err) {
        console.error('Could not load tasks:', err);
        list.innerHTML = `<li class="collection-item red-text">Couldn't load your tasks: ${escapeHtml(friendlyError(err))}. Try reloading the page.</li>`;
        return;
    }
    list.innerHTML = tasks.length ? tasks.map(t => `
        <li class="collection-item task-item">
            <label>
                <input type="checkbox" ${t.done ? 'checked' : ''} data-action="toggle" data-id="${t.id}">
                <span class="${t.done ? 'task-done' : ''}">${escapeHtml(t.title)}</span>
            </label>
            <span class="task-meta">
                ${t.type === 'exam' ? 'Exam' : 'Homework'}
                ${t.synced ? '' : '<i class="material-icons tiny orange-text" title="Waiting to sync">cloud_off</i>'}
            </span>
            <span class="task-actions">
                <a href="#!" data-action="edit" data-id="${t.id}" title="Edit"><i class="material-icons">edit</i></a>
                <a href="#!" data-action="delete" data-id="${t.id}" title="Delete"><i class="material-icons red-text">delete</i></a>
            </span>
        </li>`).join('')
        : '<li class="collection-item grey-text">No tasks yet. Add one above.</li>';
    list.dataset.tasks = JSON.stringify(tasks);
    await updateBanner();
}

function resetForm() {
    editingId = null;
    document.getElementById('title').value = '';
    document.getElementById('task-type').value = 'homework';
    document.getElementById('task-submit').textContent = 'Queue Item';
    document.getElementById('task-cancel').style.display = 'none';
}

async function submitTask() {
    const title = document.getElementById('title').value.trim();
    const type = document.getElementById('task-type').value;
    if (!title) {
        M.toast({ html: 'Enter a topic first.' });
        return;
    }
    const tasks = JSON.parse(document.getElementById('task-list').dataset.tasks || '[]');
    const existing = editingId ? tasks.find(t => t.id === editingId) : null;
    const task = existing
        ? { ...existing, title, type }
        : { id: crypto.randomUUID(), title, type, done: false, createdAt: Date.now() };
    const button = document.getElementById('task-submit');
    button.disabled = true;   // prevent double-submits while saving
    try {
        const result = await saveTask(task);
        showSaveResult(existing ? 'Updated' : 'Added', result);
        resetForm();
    } catch (err) {
        // Both Firebase and IndexedDB failed: keep the form filled so nothing is lost
        console.error('Save failed:', err);
        M.toast({ html: `❌ Couldn't save "${escapeHtml(title)}": ${escapeHtml(friendlyError(err))}. Please try again.`, classes: 'red darken-2', displayLength: 6000 });
    } finally {
        button.disabled = false;
    }
    await render();
}

// Tells the user where a change was stored, and why if it couldn't reach Firebase
function showSaveResult(verb, { where, reason }) {
    if (where === 'firebase') {
        M.toast({ html: `${verb} in Firebase` });
    } else if (reason) {
        M.toast({ html: `⚠️ ${verb} on this device only: ${escapeHtml(reason)}. It will sync automatically.`, classes: 'orange darken-3', displayLength: 6000 });
    } else {
        M.toast({ html: `${verb} offline. It will sync when you reconnect.` });
    }
}

async function handleListClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const { action, id } = target.dataset;
    const tasks = JSON.parse(document.getElementById('task-list').dataset.tasks || '[]');
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (action === 'toggle') {
        try {
            const result = await saveTask({ ...task, done: target.checked });
            if (result.reason) showSaveResult('Updated', result);
        } catch (err) {
            console.error('Update failed:', err);
            M.toast({ html: `❌ Couldn't update this task: ${escapeHtml(friendlyError(err))}. Please try again.`, classes: 'red darken-2' });
        }
        await render();
    } else if (action === 'edit') {
        event.preventDefault();
        editingId = id;
        document.getElementById('title').value = task.title;
        document.getElementById('task-type').value = task.type;
        document.getElementById('task-submit').textContent = 'Update Item';
        document.getElementById('task-cancel').style.display = 'block';
        M.updateTextFields();
        document.getElementById('title').focus();
    } else if (action === 'delete') {
        event.preventDefault();
        try {
            const result = await removeTask(id);
            if (editingId === id) resetForm();
            if (result.where === 'firebase') M.toast({ html: 'Deleted from Firebase' });
            else showSaveResult('Deleted', result);
        } catch (err) {
            console.error('Delete failed:', err);
            M.toast({ html: `❌ Couldn't delete this task: ${escapeHtml(friendlyError(err))}. Please try again.`, classes: 'red darken-2' });
        }
        await render();
    }
}

// ---------- startup ----------
document.getElementById('task-submit').addEventListener('click', submitTask);
document.getElementById('task-cancel').addEventListener('click', resetForm);
document.getElementById('task-list').addEventListener('click', handleListClick);
// Detect connection changes and switch storage systems accordingly
window.addEventListener('online', () => {
    M.toast({ html: '🟢 Back online: syncing with Firebase…' });
    syncPending();
});
window.addEventListener('offline', () => {
    M.toast({ html: '🟠 Offline: changes will be saved on this device' });
    updateBanner();
});

// Startup: load Firebase (if reachable), show tasks, then push any changes left from last time
if (!('indexedDB' in window)) {
    M.toast({ html: '❌ This browser does not support offline storage (IndexedDB). Tasks will only work online.', classes: 'red darken-2', displayLength: 8000 });
}
initFirebase().then(render).then(() => syncPending());
