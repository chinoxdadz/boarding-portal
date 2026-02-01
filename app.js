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

// ==================== STATE MANAGEMENT ====================
const app = {
    user: null, // Stores { roomNo, pin, ... }
    
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
        // Hide all views
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        
        // Show selected view
        const target = document.getElementById(`${screen}-view`);
        if (target) {
            target.classList.remove('hidden');
            app.loadData(screen); // Fetch data for this screen
        }
    },

    // ==================== AUTHENTICATION ====================
    login: async (e) => {
        e.preventDefault(); // This stops the page from reloading!
        
        const room = document.getElementById('login-room').value.trim();
        const pin = document.getElementById('login-pin').value.trim();
        const errorMsg = document.getElementById('login-error');

        // Clear previous errors
        errorMsg.innerText = "Checking credentials...";
        
        console.log(`Attempting login for Room: ${room}, PIN: ${pin}`); // Debug log

        try {
            // Check Firestore for matching Room AND PIN
            const snapshot = await db.collection('tenants')
                .where('roomNo', '==', room)
                .where('pin', '==', pin)
                .get();

            if (!snapshot.empty) {
                console.log("Login Success!");
                app.user = { roomNo: room };
                localStorage.setItem('bh_tenant', JSON.stringify(app.user));
                app.showApp();
                document.getElementById('login-form').reset();
            } else {
                console.log("Login Failed: No match found.");
                errorMsg.innerText = "Invalid Room Number or PIN.";
            }
        } catch (err) {
            console.error("Firebase Error:", err);
            errorMsg.innerText = "Login error. Check console (F12) for details.";
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
    // --- Home Logic ---
    fetchHomeData: async () => {
        const container = document.getElementById('home-announcements-list');
        const soaContainer = document.getElementById('home-soa-summary');

        // 1. Get Top 3 Announcements
        try {
            const snap = await db.collection('announcements')
                .orderBy('createdAt', 'desc')
                .limit(3)
                .get();
            
            let html = '';
            snap.forEach(doc => {
                const data = doc.data();
                const date = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';
                html += `
                    <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
                        <small style="color:#666">${date}</small>
                        <h4 style="margin: 4px 0;">${data.title}</h4>
                    </div>
                `;
            });
            container.innerHTML = html || '<p>No new announcements.</p>';
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
                    <div style="text-align:center; padding: 10px;">
                        <p style="font-size: 0.9rem">Due: ${data.dueDate || 'N/A'}</p>
                        <h1 style="font-size: 2.5rem; color: var(--primary)">${safeAmount.toFixed(2)}</h1>
                        <span class="status-badge status-${safeStatus.toLowerCase()}">${safeStatus}</span>
                    </div>
                `;
            } else {
                soaContainer.innerHTML = '<p>No bills found.</p>';
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
                const date = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';
                html += `
                    <div class="card">
                        <small class="status-badge" style="background:#e5e7eb; color:#333;">${date}</small>
                        <h3 class="mt-large">${data.title}</h3>
                        <p style="margin-top:0.5rem; color:#4b5563;">${data.body}</p>
                    </div>
                `;
            });
            container.innerHTML = html || '<p>No announcements found.</p>';
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
                const date = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';
                html += `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>${data.category.toUpperCase()}</strong>
                            <span class="status-badge status-${data.status}">${data.status}</span>
                        </div>
                        <p style="margin-top: 10px;">${data.message}</p>
                        <small style="color:gray; display:block; margin-top:10px">Submitted: ${date}</small>
                    </div>
                `;
            });
            container.innerHTML = html || '<p>You haven\'t submitted any tickets.</p>';
        } catch(e) {
            console.error(e);
            container.innerHTML = "<p>Error loading tickets.</p>";
        }
    },

    submitTicket: async (e) => {
        e.preventDefault();
        const cat = document.getElementById('ticket-category').value;
        const msg = document.getElementById('ticket-message').value;
        const btn = e.target.querySelector('button');
        
        btn.disabled = true;
        btn.innerText = "Submitting...";

        try {
            await db.collection('tickets').add({
                roomNo: app.user.roomNo,
                category: cat,
                message: msg,
                status: 'new',
                createdAt: new Date()
            });
            alert('Ticket submitted successfully!');
            document.getElementById('ticket-form').reset();
            app.fetchTickets(); // Refresh list
        } catch (err) {
            console.error(err);
            alert('Error submitting ticket');
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

                html += `
                    <div class="card">
                        <div style="display:flex; justify-content:space-between; align-items:center">
                            <h3>Month: ${data.month || 'N/A'}</h3>
                            <span class="status-badge status-${safeStatus.toLowerCase()}">${safeStatus}</span>
                        </div>
                        <hr style="margin: 10px 0; border:0; border-top:1px solid #eee;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                            <div>
                                <small>Water</small>
                                <div>${data.waterAmount || 0}</div>
                            </div>
                            <div>
                                <small>Electricity</small>
                                <div>${data.electricalAmount || 0}</div>
                            </div>
                        </div>
                        <div style="margin-top:15px; background:#f9fafb; padding:10px; border-radius:5px;">
                            <strong>Total: ${safeTotal.toFixed(2)}</strong>
                            <div style="font-size:0.8rem; color:red">Due: ${data.dueDate || 'N/A'}</div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html || '<p>No billing history found.</p>';
        } catch(e) {
            console.error("Billing List Error:", e);
            container.innerHTML = "<p>Error loading bills.</p>";
        }
    }
};

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', app.init);
document.getElementById('login-form').addEventListener('submit', app.login);
document.getElementById('ticket-form').addEventListener('submit', app.submitTicket);