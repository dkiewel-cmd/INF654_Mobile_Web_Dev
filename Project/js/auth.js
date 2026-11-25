/**
 * auth.js: Firebase Authentication (email + password sign-in / sign-out)
 *
 * - Loads the Firebase Auth SDK with a dynamic import, so the rest of the app still
 *   works if the SDK can't be fetched while offline (it retries on the "online" event).
 * - Firebase keeps the signed-in user in local persistence by default, so a user who
 *   signed in earlier stays signed in across reloads and while offline.
 * - Every change in sign-in state updates the nav/sidenav and fires a window event,
 *   "auth-changed" (detail: { user }), that other modules (tasks.js) can listen for.
 */
import { firebaseConfig } from './firebase-config.js';

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const configured = !firebaseConfig.apiKey.startsWith('YOUR_');

let auth = null;      // Firebase Auth instance
let fa = null;        // Firebase Auth functions (signIn..., signOut, ...)
let currentUser = null;
let firstState = true; // the first onAuthStateChanged call is the restored session, not a user action

export const getCurrentUser = () => currentUser;

async function initAuth() {
    if (!configured || auth) return;
    try {
        const [appMod, authMod] = await Promise.all([
            import(`${FIREBASE_SDK}/firebase-app.js`),
            import(`${FIREBASE_SDK}/firebase-auth.js`)
        ]);
        // tasks.js also uses Firebase: reuse the app if it already exists
        const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
        auth = authMod.getAuth(app);
        fa = authMod;
        fa.onAuthStateChanged(auth, user => {
            currentUser = user;
            updateAuthUI(user);
            if (!firstState) {
                M.toast({ html: user ? `👋 Signed in as ${escapeHtml(user.email)}` : '🔒 Signed out' });
            }
            firstState = false;
            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
        });
    } catch (err) {
        console.warn('Firebase Auth SDK unavailable (offline?), will retry when back online:', err);
        updateAuthUI(null);
    }
}

// Turns Firebase Auth error codes into messages a user can act on
function friendlyAuthError(err) {
    switch (err && err.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':       return 'Email or password is incorrect.';
        case 'auth/invalid-email':        return 'That email address is not valid.';
        case 'auth/missing-password':     return 'Enter a password.';
        case 'auth/weak-password':        return 'Password must be at least 6 characters.';
        case 'auth/email-already-in-use': return 'An account with that email already exists. Try signing in.';
        case 'auth/too-many-requests':    return 'Too many attempts. Wait a minute and try again.';
        case 'auth/network-request-failed': return 'No connection to Firebase. Check your internet and try again.';
        case 'auth/operation-not-allowed': return 'Email/password sign-in is not enabled in the Firebase Console.';
        default: return (err && err.message) || 'Something went wrong. Please try again.';
    }
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- UI ----------
function updateAuthUI(user) {
    document.querySelectorAll('.auth-link').forEach(link => {
        link.querySelector('.auth-icon').textContent = user ? 'logout' : 'login';
        link.querySelector('.auth-label').textContent = user ? 'Sign out' : 'Sign in';
    });
    const name = document.getElementById('sidenav-name');
    const email = document.getElementById('sidenav-email');
    if (name) name.textContent = user ? 'Signed in' : 'Guest';
    if (email) email.textContent = user ? user.email : 'Not signed in';
}

function authModal() {
    return M.Modal.getInstance(document.getElementById('auth-modal'));
}

function setBusy(busy) {
    document.querySelectorAll('#auth-signin, #auth-signup').forEach(b => { b.disabled = busy; });
}

// mode: 'signin' or 'signup'
async function submitAuth(mode) {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) {
        M.toast({ html: 'Enter your email and password.' });
        return;
    }
    if (!navigator.onLine) {
        M.toast({ html: '🟠 You need an internet connection to sign in.', classes: 'orange darken-3' });
        return;
    }
    await initAuth();
    if (!auth) {
        M.toast({ html: '❌ Firebase sign-in is unavailable right now. Try again in a moment.', classes: 'red darken-2' });
        return;
    }
    setBusy(true);
    try {
        if (mode === 'signup') {
            await fa.createUserWithEmailAndPassword(auth, email, password);
        } else {
            await fa.signInWithEmailAndPassword(auth, email, password);
        }
        document.getElementById('auth-password').value = '';
        authModal().close();
    } catch (err) {
        console.warn('Auth failed:', err);
        M.toast({ html: `❌ ${escapeHtml(friendlyAuthError(err))}`, classes: 'red darken-2', displayLength: 6000 });
    } finally {
        setBusy(false);
    }
}

async function handleAuthLink(event) {
    event.preventDefault();
    if (currentUser) {
        try {
            await fa.signOut(auth);
        } catch (err) {
            M.toast({ html: `❌ Couldn't sign out: ${escapeHtml(friendlyAuthError(err))}`, classes: 'red darken-2' });
        }
    } else {
        authModal().open();
        setTimeout(() => document.getElementById('auth-email').focus(), 250);
    }
}

// ---------- startup ----------
document.querySelectorAll('.auth-link').forEach(link => link.addEventListener('click', handleAuthLink));
document.getElementById('auth-form').addEventListener('submit', event => {
    event.preventDefault();   // Enter key = Sign in
    submitAuth('signin');
});
document.getElementById('auth-signup').addEventListener('click', () => submitAuth('signup'));
window.addEventListener('online', initAuth);   // retry loading the SDK if it failed offline

updateAuthUI(null);
if (configured) initAuth();
