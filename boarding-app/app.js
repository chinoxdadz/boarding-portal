// ==================== CONFIGURATION ====================
const firebaseConfig = {
  apiKey: "AIzaSyAtzL7jEhQhtfxbEMxFmttcDA7GLCh1d7g",
  authDomain: "boarding-portal.firebaseapp.com",
  projectId: "boarding-portal",
  storageBucket: "boarding-portal.firebasestorage.app",
  messagingSenderId: "303774773682",
  appId: "1:303774773682:web:1ee0a3c98793c8ab7cb4ab"
};

// Initialize Firebase (Using the global variables from script tags)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Helper to handle Firestore Timestamps or plain Date objects
function formatDate(ts) {
    if (!ts) return 'Just now';
    if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleDateString();
    return new Date(ts).toLocaleDateString();
}

// ==================== STATE MANAGEMENT ====================
const app = {
    user: null, // Stores { roomNo, pin, ... }
    history: [], // Navigation history
    
    // Initialize App
    init: () => {
        const storedUser = localStorage.getItem('bh_tenant');
        if (storedUser) {
            app.user = JSON.parse(storedUser);
            app.showApp();
        } else {
            app.showLogin();
        }
    },

    // Navigation Router
    nav: (screen) => {
        // Add to history if not going back
        if (app.history[app.history.length - 1] !== screen) {
            app.history.push(screen);
        }
        
        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        
        // Show selected view
        const target = document.getElementById(`${screen}-view`);
        if (target) {
            target.classList.remove('hidden');
            app.loadData(screen); // Fetch data for this screen
        }
        
        // Show/hide back button
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            if (screen === 'home' || app.history.length <= 1) {
                backBtn.classList.add('hidden');
            } else {
                backBtn.classList.remove('hidden');
            }
        }
    },
    
    // Back navigation
    back: () => {
        // Remove current view from history
        if (app.history.length > 1) {
            app.history.pop();
            // Get previous view
            const previousView = app.history[app.history.length - 1] || 'home';
            // Navigate without adding to history again
            app.history.pop(); // Remove it temporarily
            app.nav(previousView);
        } else {
            app.nav('home');
        }
    },

    // ==================== AUTHENTICATION ====================
    login: async (e) => {
        e.preventDefault();
        
        const roomInput = document.getElementById('login-room').value;
        const pinInput = document.getElementById('login-pin').value;
        const errorMsg = document.getElementById('login-error');

        errorMsg.innerText = "";

        try {
            // Validate and sanitize inputs
            const room = Security.validateRoomNo(roomInput);
            const pin = Security.validatePin(pinInput);
            
            // Check rate limiting
            Security.rateLimiter.canAttempt(room);

            // Clear previous errors
            errorMsg.innerText = "Checking credentials...";

            // Check Firestore for matching Room AND PIN
            // WARNING: This is NOT secure! PINs should be hashed server-side
            // For production, use Firebase Authentication or Cloud Functions
            const snapshot = await db.collection('tenants')
                .where('roomNo', '==', room)
                .where('pin', '==', pin)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                Security.rateLimiter.recordAttempt(room, true);
                app.user = { roomNo: room };
                
                // Store with timestamp for session management
                const sessionData = {
                    roomNo: room,
                    loginTime: Date.now()
                };
                localStorage.setItem('bh_tenant', JSON.stringify(sessionData));
                
                app.showApp();
                document.getElementById('login-form').reset();
            } else {
                Security.rateLimiter.recordAttempt(room, false);
                errorMsg.innerText = "Invalid Room Number or PIN.";
                
                // Clear password field on failed attempt
                document.getElementById('login-pin').value = '';
            }
        } catch (err) {
            if (err.message.includes('Too many failed attempts')) {
                errorMsg.innerText = err.message;
            } else if (err.message.includes('Invalid')) {
                errorMsg.innerText = err.message;
            } else {
                console.error("Login Error:", err);
                errorMsg.innerText = "Login error. Please try again.";
            }
        }
    },

    logout: () => {
        localStorage.removeItem('bh_tenant');
        app.user = null;
        window.location.reload();
    },

    showLogin: () => {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
    },

    showApp: () => {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        app.nav('home'); // Load dashboard by default
    },

    // ==================== DATA FETCHING ====================
    loadData: (screen) => {
        if (screen === 'home') {
            app.fetchHomeData();
        } else if (screen === 'announcements') {
            app.fetchAnnouncements();
        } else if (screen === 'tickets') {
            app.fetchTickets();
        } else if (screen === 'billing') {
            app.fetchBilling();
        }
    },

    // --- Home Logic ---
    fetchHomeData: async () => {
        // Check session validity
        if (!Security.session.checkExpiration()) return;
        
        const container = document.getElementById('home-announcements-list');
        const soaContainer = document.getElementById('home-soa-summary');

        // 1. Get Top 2 Announcements
        try {
            const snap = await db.collection('announcements')
                .orderBy('createdAt', 'desc')
                .limit(2)
                .get();
            
            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                const date = formatDate(data.createdAt);
                const safeTitle = Security.sanitizeText(data.title);
                const safeBody = Security.sanitizeText(data.body);
                html += `
                    <div class="announcement-card">
                        <div class="announcement-meta">
                            <small>${date}</small>
                        </div>
                        <h4>${safeTitle}</h4>
                        <p>${safeBody}</p>
                    </div>
                `;
            });
            container.innerHTML = html || '<p class="loading-text">No new announcements.</p>';
        } catch (e) { 
            console.error("News Error:", e);
            container.innerHTML = '<p>Error loading news.</p>'; 
        }

        // 2. Get Latest SOA
        try {
            const snap = await db.collection('soas')
                .where('roomNo', '==', app.user.roomNo)
                .orderBy('month', 'desc')
                .limit(1)
                .get();

            if (!snap.empty) {
                const data = snap.docs[0].data();
                // SAFEGUARDS: Check if fields exist before using them
                const safeStatus = (data.status || 'unpaid'); 
                const safeAmount = (data.totalAmount || 0);

                soaContainer.innerHTML = `
                    <div style="text-align:center; padding: 0.75rem 0;">
                        <p style="font-size: 0.7rem; color: var(--text-muted); margin: 0 0 0.5rem 0; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Due: ${data.dueDate || 'N/A'}</p>
                        <h1 style="font-size: 2rem; color: var(--primary); margin: 0 0 0.5rem 0; font-weight: 700;">₱${safeAmount.toFixed(2)}</h1>
                        <span class="status-badge status-${safeStatus.toLowerCase()}">${safeStatus}</span>
                    </div>
                `;
            } else {
                soaContainer.innerHTML = `
                    <div class="no-bill-state">
                        <div class="status-icon">✓</div>
                        <div class="status-title">All Caught Up</div>
                        <div class="status-description">No active bills at the moment</div>
                    </div>
                `;
            }
        } catch (e) { 
            console.error("SOA Error:", e);
            soaContainer.innerHTML = '<p>Error loading bill.</p>'; 
        }
    },

    // --- Announcements Logic ---

    // --- Announcements Logic ---
    fetchAnnouncements: async () => {
        const container = document.getElementById('all-announcements-list');
        container.innerHTML = 'Loading...';
        
        try {
            const snap = await db.collection('announcements').orderBy('createdAt', 'desc').get();
            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                const date = formatDate(data.createdAt);
                const safeTitle = Security.sanitizeText(data.title);
                const safeBody = Security.sanitizeText(data.body);
                html += `
                    <div class="announcement-card">
                        <div class="announcement-meta">
                            <small>${date}</small>
                        </div>
                        <h4>${safeTitle}</h4>
                        <p>${safeBody}</p>
                    </div>
                `;
            });
            container.innerHTML = html || '<p class="loading-text">No announcements found.</p>';
        } catch(e) {
            console.error(e);
            container.innerHTML = "<p>Error loading data.</p>";
        }
    },

    // --- Tickets Logic ---
    fetchTickets: async () => {
        const container = document.getElementById('tickets-list');
        container.innerHTML = 'Loading...';

        try {
            const snap = await db.collection('tickets')
                .where('roomNo', '==', app.user.roomNo)
                .orderBy('createdAt', 'desc')
                .get();

            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                const date = formatDate(data.createdAt);
                const safeCategory = Security.sanitizeText(data.category);
                const safeMessage = Security.sanitizeText(data.message);
                const safeStatus = Security.sanitizeText(data.status);
                html += `
                    <div class="ticket-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                            <h4 style="margin:0;">${safeCategory.toUpperCase()}</h4>
                            <span class="status-badge status-${safeStatus}">${safeStatus}</span>
                        </div>
                        <p>${safeMessage}</p>
                        <div class="ticket-meta">
                            <small>Submitted: ${date}</small>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html || '<p class="loading-text">You haven\'t submitted any tickets.</p>';
        } catch(e) {
            console.error(e);
            container.innerHTML = "<p>Error loading tickets.</p>";
        }
    },

    submitTicket: async (e) => {
        e.preventDefault();
        const cat = document.getElementById('ticket-category').value;
        const msgInput = document.getElementById('ticket-message').value;
        const btn = e.target.querySelector('button');
        
        btn.disabled = true;
        btn.innerText = "Submitting...";

        try {
            // Validate and sanitize message
            const msg = Security.validateMessage(msgInput);
            
            await db.collection('tickets').add({
                roomNo: app.user.roomNo,
                category: cat,
                message: msg,
                status: 'new',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert('Ticket submitted successfully!');
            document.getElementById('ticket-form').reset();
            app.fetchTickets(); // Refresh list
        } catch (err) {
            console.error(err);
            alert(err.message || 'Error submitting ticket');
        } finally {
            btn.disabled = false;
            btn.innerText = "Submit Ticket";
        }
    },

    // --- Billing Logic ---
    // --- Billing Logic ---
    fetchBilling: async () => {
        const container = document.getElementById('billing-list');
        container.innerHTML = 'Loading...';

        try {
            const snap = await db.collection('soas')
                .where('roomNo', '==', app.user.roomNo)
                .orderBy('month', 'desc')
                .get();

            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                // SAFEGUARDS: Default values if data is missing
                const safeStatus = (data.status || 'unpaid');
                const safeTotal = (data.totalAmount || 0);

                // Use the correct key name for electric amount
                const electric = data.electricAmount || data.electricalAmount || 0;

                html += `
                    <div class="soa-card">
                        <div class="soa-header">
                            <h4 class="soa-month">Month: ${data.month || 'N/A'}</h4>
                            <span class="status-badge status-${safeStatus.toLowerCase()}">${safeStatus}</span>
                        </div>
                        <div class="soa-details">
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:0.75rem;">
                                <div>
                                    <small style="color: var(--text-muted); font-size: 0.75rem;">Water</small>
                                    <div style="font-weight: 600;">₱${(data.waterAmount || 0).toFixed(2)}</div>
                                </div>
                                <div>
                                    <small style="color: var(--text-muted); font-size: 0.75rem;">Electricity</small>
                                    <div style="font-weight: 600;">₱${electric.toFixed(2)}</div>
                                </div>
                            </div>
                            <div style="font-size: 0.8rem; color: var(--danger); font-weight: 600;">Due: ${data.dueDate || 'N/A'}</div>
                        </div>
                        <div class="soa-total">
                            Total: ₱${safeTotal.toFixed(2)}
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html || '<p class="loading-text">No billing history found.</p>';
        } catch(e) {
            console.error("Billing List Error:", e);
            container.innerHTML = "<p>Error loading bills.</p>";
        }
    }

    ,

    

    
};

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', app.init);
document.getElementById('login-form').addEventListener('submit', app.login);
document.getElementById('ticket-form').addEventListener('submit', app.submitTicket);