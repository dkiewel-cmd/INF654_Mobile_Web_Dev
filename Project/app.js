if ('serviceWorker' in navigator) {
    // Was a service worker already controlling this page? (false on the very first visit)
    const hadController = Boolean(navigator.serviceWorker.controller);

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('🚀 Service Worker registered successfully with scope:', registration.scope);
                // Check for a newer sw.js whenever the app comes back online
                window.addEventListener('online', () => registration.update());
            })
            .catch(error => {
                console.error('❌ Service Worker registration lifecycle aborted:', error);
            });
    });

    // A new service worker version took over (new files cached): let the user know
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && window.M) {
            M.toast({ html: '✨ App updated: latest version cached for offline use' });
        }
    });
} else {
    console.log('⚠️ Service Workers are not supported by this browser environment.');
}

window.addEventListener('appinstalled', (event) => {
    console.log('🎉 Loci Intellectus has been installed natively onto the target device filesystem!', event);
    M.toast({html: '📱 App installed successfully to your device!'});
});
