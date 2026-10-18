### 🧠 Loci Intellectus

Loci Intellectus is an offline-first cognitive planner and progresive web application (PWA) engineered to balance high-performance study routines with optimized wellness recovery windows. By bringing the ancient Method of Loci into a modern digital interface, it automates daily scheduling using a strict 1:1 focus-to-decompression time allocation sequence. 

### 📱 Project Description

### Short Manifest Overview

An offline-first cognitive planner engineered to balance structured web-app study routines with optimized wellness recovery windows. 

### Comprehensive Application Purpose

Relying solely on mental tracking to carve out study sessions often leads to last-second cramming and intense fatigue. Loci Intellectus solves this problem by automating the distribution of daily activities. The system dynamically schedules 30-to-60-minute blocks of high-focus study times per course subject while strictly balancing an equal focus-to-relaxation ratio to protect user cognitive load and prevent burnout. 

### ⚙️ Core PWA & Technical Features

Progressive FeatureCode Engine ImplementationArchitectural Advantage
****Offline-First Resilience****
Powered by the Fetch listener in sw.js intercepting asset pipelines.The workspace stays fully operational and interactive even during complete network drops.
****App Shell Caching****
Handled by cache.addAll() during the Service Worker install lifecycle event.Core assets like Materialize UI, fonts, and scripts load instantly from local disk memory without network lag.
****Standalone Native Installation****
Managed by display: standalone in the web manifest and tracked via the appinstalled event handler.Eliminates browser URL bars, running the planner in its own dedicated, native-feeling app window.
****Immersive SPA State Architecture****
Driven by a rapid DOM view router and hardware-accelerated CSS keyframe transitions.Eliminates harsh page flashes or white screens when swapping dashboard tabs, preserving user flow state.
****Tactile Responsiveness****
Built using fluid CSS transform scaling triggers (scale(0.98)) and auto-closing mobile sidebar drawers.Optimizes the execution layouts dynamically for high-retention study bursts on mobile touchscreen surfaces.

Export to Sheets

### 🧠 Functional Cognitive Features

* **Automated Routine Scheduler:** Dynamically locks in an optimal focus-to-recovery time allocation sequence based on outstanding task targets.
* **Focused Study Countdown:** An integrated 45-minute countdown stopwatch that updates app states and displays toast reminders natively upon block completion.
* **Interactive Cognitive Flashcards:** Rapid-fire card-flipping module using clean, alternating 3D-styled theme interfaces to track active recall velocity.
* **Resilient Support Nexus Outbox:** Form capture loops designed to stage user ticket feedback securely inside local memory storage, queueing transmission for the next verified network handshake.

### 🛠️ Technology Stack

* **Frontend Layout:** HTML5, Materialize CSS (v1.0.0 Framework), Google Material Icons
* **Design Engine:** CSS Custom Properties (:root), Cubic-Bezier transitions, Hardware-accelerated animations
* **PWA Infrastructure:** JavaScript (ES6+), Service Worker API (Cache-First strategy with navigation fallback), Web App Manifest Specification

### 📁 Directory Architecture

text

loci-intellectus/
├── index.html          # Core Single Page Application (SPA) dashboard shell
├── offline.html        # Low-network/offline user view safety fallback page
├── manifest.json       # Web app installation manifest parameters
├── sw.js               # Service Worker cache proxy script
├── css/
│   └── styles.css      # Core theme properties and responsive structural styles
└── js/
    └── ui.js           # Navigation routing, countdown clock, and flashcard logic

Use code with caution.

### 🚀 Getting Started

1. **Clone the Repository:** 

bash

git clone https://github.com/your-username/loci-intellectus.git
cd loci-intellectus

Use code with caution.
2. **Serve the Application:**
Because Service Workers require a secure origin context, serve the directory using a local web server: 

bash

# Using Python 3
python3 -m http.server 8000

# Or using Node.js static server tools
npx serve .

Use code with caution.
3. **Access and Install:**
Open your browser and navigate to http://localhost:8000. Click the install prompt icon in your browser's address bar to run Loci Intellectus as a native standalone app.