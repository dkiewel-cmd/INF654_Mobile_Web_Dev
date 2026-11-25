// Bump this version whenever any cached file changes so users get the new files.
const CACHE_NAME = 'loci-intellectus-cache-v11';

// App shell: everything needed to open the interface and work with IndexedDB data offline
const ASSETS_TO_CACHE = [
    // Pages
    './',
    'index.html',
    'offline.html',
    'pages/about.html',
    'pages/contact.html',
    // Manifest + icons
    'manifest.json',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    // Styles and UI scripts
    'css/styles.css',
    'app.js',
    'js/ui.js',
    // Data layer: Firebase + IndexedDB CRUD and sync
    'js/auth.js',
    'js/tasks.js',
    'js/idb.js',
    'js/firebase-config.js',
    // Third-party libraries
    'https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js',
    'https://fonts.googleapis.com/icon?family=Material+Icons',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'
];

const ICON_FONT_CSS = 'https://fonts.googleapis.com/icon?family=Material+Icons';

// The Material Icons stylesheet points to a font file on fonts.gstatic.com.
// Read the stylesheet and cache that font file too, so icons render offline.
async function cacheIconFont(cache) {
    try {
        const cssResponse = await cache.match(ICON_FONT_CSS);
        if (!cssResponse) return;
        const css = await cssResponse.text();
        const fontUrls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await cache.addAll(fontUrls);
    } catch (err) {
        console.warn('Icon font not pre-cached; it will be cached on first use instead:', err);
    }
}

// Install: pre-cache the app shell (cache: 'reload' skips the browser's HTTP cache)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache =>
                cache.addAll(ASSETS_TO_CACHE.map(url => new Request(url, { cache: 'reload' })))
                    .then(() => cacheIconFont(cache))
            )
            .then(() => self.skipWaiting())
    );
});

// Activate: delete caches from older versions, then take control of open pages
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames
                    .filter(cache => cache !== CACHE_NAME)
                    .map(cache => caches.delete(cache))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: cache-first, then network (caching new GET responses),
// with offline.html as the fallback for pages that aren't cached
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    // Never cache live Firebase/Firestore traffic; it must always hit the network
    const host = new URL(event.request.url).hostname;
    if (host === 'firestore.googleapis.com' || host.endsWith('firebaseio.com') ||
        host.endsWith('identitytoolkit.googleapis.com') ||
        host === 'securetoken.googleapis.com') return;

    const isNavigation = event.request.mode === 'navigate';

    event.respondWith(
        // ignoreSearch lets page URLs with ?query strings still match the cached page
        caches.match(event.request, { ignoreSearch: isNavigation }).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    }
                    return networkResponse;
                })
                .catch(error => {
                    if (isNavigation) {
                        return caches.match('offline.html');
                    }
                    throw error;
                });
        })
    );
});
