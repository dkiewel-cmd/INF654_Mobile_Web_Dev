# 🧠 Loci Intellectus

Loci Intellectus is an offline-first cognitive planner built as a Progressive Web App (PWA). It balances focused study blocks with recovery breaks (a 1:1 focus-to-decompression ratio) and includes a study countdown timer, flashcards and a task planner.

This version adds **Firebase Firestore** for online data storage, **IndexedDB** for offline storage, and **automatic synchronization** between the two whenever the connection returns.

---

## 📁 Project Structure

```text
Project/
├── index.html              # Single-page app shell (dashboard, study system, tasks, etc.)
├── offline.html            # Fallback page for uncached pages while offline
├── manifest.json           # Web app manifest (name, colors, icons, standalone display)
├── sw.js                   # Service worker: app-shell caching + offline fallback
├── app.js                  # Registers the service worker, update + install notices
├── css/
│   └── styles.css          # Theme, layout, status banner and task list styles
├── js/
│   ├── ui.js               # Page navigation, countdown timer, flashcards
│   ├── tasks.js            # Task CRUD, online/offline storage choice, synchronization
│   ├── idb.js              # IndexedDB wrapper (offline storage)
│   └── firebase-config.js  # Firebase project configuration
├── icons/                  # App icons (192, 512, maskable 512)
└── pages/
    ├── about.html
    └── contact.html
```

---

## 🔥 How Firebase and IndexedDB Are Used

The **Task Allocations** screen stores tasks (homework or exam items). Each task looks like this:

| Field       | Description                                                   |
|-------------|---------------------------------------------------------------|
| `id`        | Unique ID created in the browser with `crypto.randomUUID()`   |
| `title`     | Task name                                                     |
| `type`      | `homework` or `exam`                                          |
| `done`      | Completed checkbox                                            |
| `createdAt` | Creation time (used for list order)                           |
| `updatedAt` | Time of the last change                                       |

- **Firebase Firestore (online):** tasks are stored in the `tasks` collection. The document ID is the task's `id`.
- **IndexedDB (offline):** tasks are stored in the `tasks` object store of the `loci-intellectus-db` database, keyed by the same `id`. IndexedDB also keeps a local copy of all Firebase tasks, so the list is available offline. Two extra local-only fields track sync state:
  - `synced`: `true` once the latest version is in Firebase, `false` if it's waiting to sync
  - `deleted`: `true` for a task deleted offline (a "tombstone") whose delete hasn't reached Firebase yet

| Situation | Where the change goes |
|-----------|-----------------------|
| Online | Firestore first, then copied into IndexedDB with `synced: true` |
| Offline | IndexedDB only, with `synced: false` |
| Online but Firebase fails or times out (6 s) | Falls back to IndexedDB with `synced: false`, and the user sees why |

The app decides with `navigator.onLine` at the moment of each operation, and it listens for the browser's `online` and `offline` events.

---

## ✏️ How to Perform CRUD Operations

Open the menu and go to **Task Allocations**.

| Operation  | How | Online | Offline |
|------------|-----|--------|---------|
| **Create** | Type a topic, choose a type, click **Queue Item** | Saved to Firebase | Saved to IndexedDB, marked with an orange cloud icon |
| **Read**   | The **Queued Tasks** list shows every task | Loaded from Firebase (and cached locally) | Loaded from IndexedDB |
| **Update** | Click ✏️ **Edit**, change the fields, click **Update Item** (or **Cancel Edit**); or tick the checkbox to mark a task done | Updated in Firebase | Updated in IndexedDB |
| **Delete** | Click 🗑️ **Delete** | Removed from Firebase | Hidden right away and kept as a tombstone until it syncs |

The banner at the top always shows the current mode:
- 🟢 **Online:** tasks saved to Firebase
- 🟠 **Offline:** tasks saved locally (IndexedDB), with the number of changes waiting to sync

---

## 🔄 How Synchronization Works

1. **When it runs:** whenever the browser fires the `online` event, every time the app starts, and every 30 seconds while unsynced changes exist (a safety net for unreliable connections).
2. **What it does:** `syncPending()` in `js/tasks.js` reads every IndexedDB record with `synced: false`:
   - normal records → `setDoc(doc(tasks, id), data)` in Firestore, then marked `synced: true`
   - tombstones → `deleteDoc(doc(tasks, id))` in Firestore, then removed from IndexedDB
3. **Feedback:** the user sees "✅ Synced N offline changes to Firebase". If the sync is interrupted, a "⚠️ Sync paused" message explains why, and the changes stay safely in IndexedDB until the next attempt.

### Keeping record IDs consistent (no duplicates)

- Each task's ID is created **on the client** (`crypto.randomUUID()`) at the moment the task is created, whether online or offline.
- That same ID is the **IndexedDB key** and the **Firestore document ID**. The app never uses Firestore's `addDoc()`, which would generate a different ID.
- Because sync writes with `setDoc(doc(tasks, id))`, sending the same record twice (after a retry or an interrupted sync) just overwrites the same document. **Duplicates can't be created.**

### Handling changes while switching online/offline

- **One operation at a time:** every read, create, update, delete and sync runs through a single queue. A sync that is still running can't overwrite an edit the user just made.
- **Writes that hang or fail:** if Firebase doesn't answer within 6 seconds, or the connection drops in the middle of a save, the change falls back to IndexedDB as pending.
- **Going offline during a sync:** the sync stops cleanly, and the remaining records stay pending.
- **Refreshing from Firebase:** the local copy is refreshed from Firestore without ever overwriting changes that haven't synced yet.
- **Conflict rule:** a pending offline change replaces the Firebase version when it syncs (the device wins). This suits a single-user planner.

---

## ⚠️ Error Handling

| Problem | What the user sees |
|---------|--------------------|
| Firebase unreachable or slow | "⚠️ Added on this device only: Firebase did not respond… It will sync automatically." |
| Firestore rules deny access | "…Firebase refused access (check the Firestore security rules)…" |
| Sync interrupted | "⚠️ Sync paused: … Your changes are safe on this device and will retry automatically." |
| Both Firebase and IndexedDB fail | "❌ Couldn't save …: … Please try again." The form stays filled in so nothing is lost. |
| Tasks can't be loaded | An error message in the task list asking you to reload |
| Browser has no IndexedDB | A warning that tasks will only work online |
| Empty topic | "Enter a topic first." |

The **Queue Item** button is disabled while a save is in progress, so a task can't be submitted twice.

---

## 📦 Service Worker and Offline Support

`sw.js` precaches everything needed to open the interface and work with local data while offline:

- the pages, manifest and icons
- the styles and the UI scripts
- the data layer (`tasks.js`, `idb.js`, `firebase-config.js`)
- Materialize, the Material Icons stylesheet **and its font file**, and the Firebase SDK

How it caches and serves files:
- **Fetch strategy:** cache-first, then the network, and any new file fetched is cached too. Pages that aren't cached fall back to `offline.html` when offline.
- **Firestore traffic is never cached,** so live data is never served stale.
- **Updates:** the cache name (`loci-intellectus-cache-vN`) is bumped whenever a cached file changes. The new worker deletes old caches, and the app shows "✨ App updated".

---

## 🚀 Setup

### 1. Create the Firebase project
1. In the [Firebase console](https://console.firebase.google.com), create a project. Google Analytics is optional.
2. In the left panel, go to **Databases & Storage → Firestore → Create database**. Choose **Standard edition**, a location, and **Start in test mode**.
   - Test-mode rules expire after about 30 days. To keep the app working, update the rules under **Firestore → Rules**.
3. In **Project settings → Your apps**, click the **`</>`** (Web) icon to register a web app.
4. Copy the `firebaseConfig` values into `js/firebase-config.js`.

> The Firebase SDK is loaded from the gstatic CDN as ES modules, so **no `npm install` is needed**.

### 2. Run the app
Service workers need `localhost` or HTTPS, so serve the folder with a local web server:

```bash
# Python 3
python -m http.server 8000

# or Node.js
npx serve .
```

Then open <http://localhost:8000>.

### 3. Install it (optional)
Click the install icon in the browser's address bar to run Loci Intellectus as a standalone app.

> **After changing any file:** open DevTools → Application → Service workers, click **Unregister**, then hard-reload (Ctrl+Shift+R), or bump `CACHE_NAME` in `sw.js`.

---

## 🧪 Testing

| Test | How to check it |
|------|-----------------|
| Online CRUD with Firebase | Add, edit, check off and delete tasks. Compare with the `tasks` collection in the Firestore console. |
| Offline CRUD with IndexedDB | DevTools → Network → **Offline**. Add, edit and delete tasks, then check DevTools → Application → IndexedDB → `loci-intellectus-db` → `tasks` (`synced: false`). |
| Sync on reconnect | Untick **Offline**. Look for the "Synced N offline changes" toast, then refresh Firestore. It should match the app exactly. |
| Same IDs, no duplicates | Compare a record's `id` in IndexedDB with its Firestore document ID. Reconnect several times; the document count stays the same. |
| Persistence | While offline, reload the page, then close and reopen the browser. Pending tasks are still listed. |
| Offline interface | After one online visit, go offline and reload. The full app loads from the service worker cache. |
| Devices and browsers | Test in Chrome, Edge and Firefox on desktop, and on a phone (or DevTools device mode). The layout and the sidenav menu should adapt to small screens. |

These scenarios were also run in automated headless-Chrome tests: online CRUD, offline CRUD, persistence after reload, sync after reconnect, ID consistency, no duplicates on re-sync, error messages, and loading the app offline from the service worker cache. All passed.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, Materialize CSS 1.0.0, Google Material Icons
- **Design:** CSS custom properties, cubic-bezier transitions
- **PWA:** Service Worker API (cache-first with offline fallback), Web App Manifest
- **Data:** Firebase Firestore (JS SDK v10, modular), IndexedDB
