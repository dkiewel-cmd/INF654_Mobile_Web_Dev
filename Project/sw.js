const CACHE_NAME = 'loci-intellectus-cache-v1';

const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'offline.html',
    'manifest.json',
    'app.js',
    'css/styles.css',
    'js/ui.js',
    'pages/about.html',
    'pages/contact.html',
    'https://googleapis.com',
    'https://cloudflare.com',
    'https://cloudflare.com'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).catch(error => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('offline.html');
                    }
                    throw error;
                });
            })
    );
});
