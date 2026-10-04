if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('🚀 Service Worker registered successfully with scope:', registration.scope);
            })
            .catch(error => {
                console.error('❌ Service Worker registration lifecycle aborted:', error);
            });
    });
} else {
    console.log('⚠️ Service Workers are not supported by this browser environment.');
}

window.addEventListener('appinstalled', (event) => {
    console.log('🎉 Loci Intellectus has been installed natively onto the target device filesystem!', event);
    M.toast({html: '📱 App installed successfully to your device!'});
});
