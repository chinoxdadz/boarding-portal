// --- CONFIGURATION (Same as app.js) ---
const firebaseConfig = {
  apiKey: "AIzaSyAtzL7jEhQhtfxbEMxFmttcDA7GLCh1d7g",
  authDomain: "boarding-portal.firebaseapp.com",
  projectId: "boarding-portal",
  storageBucket: "boarding-portal.firebasestorage.app",
  messagingSenderId: "303774773682",
  appId: "1:303774773682:web:1ee0a3c98793c8ab7cb4ab"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const adminApp = {
    // Simple password check (Not secure for real banking apps, but fine for this)
    login: () => {
        const pass = document.getElementById('admin-pass').value;
        if(pass === "admin123") { // <--- CHANGE THIS PASSWORD!
            document.getElementById('admin-login').classList.add('hidden');
            document.getElementById('admin-dash').classList.remove('hidden');
            adminApp.loadTickets();
        } else {
            alert("Wrong password");
        }
    },

    // 1. Post News
    postNews: async () => {
        const title = document.getElementById('news-title').value;
        const body = document.getElementById('news-body').value;
        if(!title || !body) return alert("Fill in all fields");

        try {
            await db.collection('announcements').add({
                title: title,
                body: body,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert("Announcement Posted!");
            document.getElementById('news-title').value = "";
            document.getElementById('news-body').value = "";
        } catch(e) { alert("Error: " + e.message); }
    },

    // 2. Create Bill
    createBill: async () => {
        const room = document.getElementById('bill-room').value;
        const month = document.getElementById('bill-month').value; // Returns "2026-02"
        const water = parseFloat(document.getElementById('bill-water').value) || 0;
        const electric = parseFloat(document.getElementById('bill-electric').value) || 0;
        const due = document.getElementById('bill-due').value;

        if(!room || !month) return alert("Room and Month are required");

        const total = water + electric;

        try {
            await db.collection('soas').add({
                roomNo: room,
                month: month,
                waterAmount: water,
                electricAmount: electric,
                totalAmount: total,
                dueDate: due,
                status: "unpaid"
            });
            alert(`Bill sent to Room ${room} for ${total}!`);
        } catch(e) { alert("Error: " + e.message); }
    },

    // 3. Load Tickets (Updated with Buttons)
    loadTickets: async () => {
        const container = document.getElementById('admin-tickets-list');
        container.innerHTML = 'Loading...';
        
        try {
            // Get tickets, ordered by newest first
            const snap = await db.collection('tickets').orderBy('createdAt', 'desc').get();
            let html = '';
            
            snap.forEach(doc => {
                const data = doc.data();
                const id = doc.id; // We need the ID to update/delete it
                const isResolved = data.status === 'resolved';
                const statusColor = isResolved ? 'green' : 'red';
                const statusText = isResolved ? '✅ Solved' : '🔥 Open';

                // Only show buttons if the ticket is NOT resolved yet
                const actionButtons = isResolved 
                    ? `<button onclick="adminApp.deleteTicket('${id}')" style="background:#666; color:white; padding:5px;">🗑 Delete</button>`
                    : `<button onclick="adminApp.resolveTicket('${id}')" style="background:green; color:white; padding:5px; margin-right:5px;">✅ Mark Done</button>
                       <button onclick="adminApp.deleteTicket('${id}')" style="background:red; color:white; padding:5px;">🗑 Delete</button>`;

                html += `
                    <div class="card" style="border-left: 5px solid ${statusColor}; margin-bottom:10px; padding:15px;">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>Room ${data.roomNo}</strong>
                            <small style="color:${statusColor}; font-weight:bold;">${statusText}</small>
                        </div>
                        <p style="margin: 10px 0;">${data.description}</p>
                        <div style="display:flex; justify-content:space-between; align-items:end;">
                            <small style="color:grey">${new Date(data.createdAt.seconds*1000).toLocaleDateString()}</small>
                            <div>${actionButtons}</div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html || '<p>No tickets found.</p>';
        } catch(e) { 
            console.error(e);
            container.innerHTML = '<p>Error loading tickets.</p>'; 
        }
    },

    // 4. Function to Mark as Resolved
    resolveTicket: async (id) => {
        if(!confirm("Mark this issue as fixed?")) return;
        try {
            await db.collection('tickets').doc(id).update({ status: 'resolved' });
            adminApp.loadTickets(); // Refresh the list
        } catch(e) { alert("Error: " + e.message); }
    },

    // 5. Function to Delete Ticket
    deleteTicket: async (id) => {
        if(!confirm("Permanently delete this ticket?")) return;
        try {
            await db.collection('tickets').doc(id).delete();
            adminApp.loadTickets(); // Refresh the list
        } catch(e) { alert("Error: " + e.message); }
    }
}
