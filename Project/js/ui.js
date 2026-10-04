document.addEventListener('DOMContentLoaded', function() {
    const sideNavs = document.querySelectorAll('.sidenav');
    sideNavs.forEach(nav => M.Sidenav.init(nav, { edge: 'left' }));
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => M.Modal.init(modal));
    const tabs = document.querySelectorAll('.tabs');
    tabs.forEach(tab => M.Tabs.init(tab));
});


function switchPage(pageId) {
    const sections = document.querySelectorAll('.spa-section');
    sections.forEach(sec => sec.classList.remove('active'));
    
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.add('active');
    }

    const mobileNav = document.getElementById('mobile-nav');
    const sideNavInstance = M.Sidenav.getInstance(mobileNav);
    if (sideNavInstance && sideNavInstance.isOpen) {
        sideNavInstance.close();
    }
    
    window.scrollTo(0, 0);
}

let timerRunning = false;
let timerInterval = null;
let totalSeconds = 45 * 60;

function toggleTimer() {
    const display = document.getElementById('timer-display');
    const text = document.getElementById('timer-text');
    const icon = document.getElementById('timer-icon');
    const btn = document.getElementById('timer-btn');

    if (!timerRunning) {
        timerRunning = true;
        text.innerText = "Pause Block";
        icon.innerText = "pause";
        btn.className = "btn-large waves-effect waves-light orange darken-4";
        
        timerInterval = setInterval(() => {
            if (totalSeconds > 0) {
                totalSeconds--;
                const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
                const secs = (totalSeconds % 60).toString().padStart(2, '0');
                display.innerText = `${mins}:${secs}`;
            } else {
                clearInterval(timerInterval);
                M.toast({html: '🔔 Routine block completed! Commencing decompression break.'});
                resetTimer();
            }
        }, 1000);
    } else {
        timerRunning = false;
        text.innerText = "Resume Block";
        icon.innerText = "play_arrow";
        btn.className = "btn-large waves-effect waves-light indigo";
        clearInterval(timerInterval);
    }
}

function resetTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    totalSeconds = 45 * 60;
    document.getElementById('timer-display').innerText = "45:00";
    document.getElementById('timer-text').innerText = "Start Block";
    document.getElementById('timer-icon').innerText = "play_arrow";
    document.getElementById('timer-btn').className = "btn-large waves-effect waves-light indigo";
}

const flashcards = [
    { q: "What is the baseline role of a Service Worker?", a: "It acts as a network proxy allowing the application to intercept requests, handle caching, and manage offline access states." },
    { q: "How is a 1:1 balance ratio maintained?", a: "By validating task duration logs and automatically scheduling equal 'Me-Time' relaxation blocks directly after focus sessions." },
    { q: "What happens if network connection drops entirely?", a: "The application relies on its Service Worker cache to display structural timelines and load current flashcards seamlessly." }
];
let currentCardIdx = 0;
let showingAnswer = false;

function flipCard() {
    const box = document.querySelector('.flashcard-box');
    const display = document.getElementById('flashcard-text');
    showingAnswer = !showingAnswer;
    
    if (showingAnswer) {
        display.innerText = flashcards[currentCardIdx].a;
        box.className = "card-panel z-depth-0 center-align flashcard-box back-state green-text text-darken-4";
    } else {
        display.innerText = flashcards[currentCardIdx].q;
        box.className = "card-panel z-depth-0 center-align flashcard-box front-state indigo-text text-darken-4";
    }
}

function nextCard() {
    currentCardIdx = (currentCardIdx + 1) % flashcards.length;
    showingAnswer = true;
    flipCard();
    document.getElementById('card-index').innerText = `Card ${currentCardIdx + 1} of ${flashcards.length}`;
}

function prevCard() {
    currentCardIdx = (currentCardIdx - 1 + flashcards.length) % flashcards.length;
    showingAnswer = true;
    flipCard();
    document.getElementById('card-index').innerText = `Card ${currentCardIdx + 1} of ${flashcards.length}`;
}

function checkExamAnswer() {
    const correctAns = document.getElementById('correct-ans');
    if (correctAns && correctAns.checked) {
        M.toast({html: '🎉 Correct! Cache Storage preserves system utility metrics natively.'});
    } else {
        M.toast({html: '❌ Review structural Service Worker caching constraints.'});
    }
}
