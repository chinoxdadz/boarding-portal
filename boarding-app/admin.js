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

// Unit prices for consumption-based billing
const UNIT_PRICES = {
    water: 50,      // Cost per m³ (cubic meter)
    electric: 12    // Cost per kWh (kilowatt-hour)
};

const adminApp = {
    // Admin password loaded from config.js (see SETUP.md)
    // In production: Copy config.example.js to config.js and set custom password
    // DO NOT commit config.js to version control!
    ADMIN_PASSWORD: typeof ADMIN_PASSWORD !== 'undefined' ? ADMIN_PASSWORD : "BH@dm!n2026#Secure",

    normalizeRoomNo: (roomNo) => {
        return String(roomNo)
            .trim()
            .replace(/^room\s*/i, '')
            .replace(/\s+/g, '')
            .toLowerCase();
    },

    applyTheme: () => {
        const theme = localStorage.getItem('bh_theme') || 'dark';
        document.body.classList.toggle('theme-light', theme === 'light');
        adminApp.updateThemeButton(theme);
    },

    toggleTheme: () => {
        const isLight = document.body.classList.contains('theme-light');
        const next = isLight ? 'dark' : 'light';
        localStorage.setItem('bh_theme', next);
        adminApp.applyTheme();
    },

    updateThemeButton: (theme) => {
        const btn = document.getElementById('admin-theme-toggle');
        if (btn) {
            btn.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
        }
    },

    reportCache: {
        type: 'owner',
        rows: [],
        summary: {}
    },
    
    login: () => {
        const pass = document.getElementById('admin-pass').value;
        if(pass === adminApp.ADMIN_PASSWORD) {
            document.getElementById('admin-login').classList.add('hidden');
            document.getElementById('admin-dash').classList.remove('hidden');
            adminApp.showView('dashboard');
            
            // Load data with error handling
            setTimeout(() => {
                adminApp.loadDashboard().catch(e => console.error('Dashboard error:', e));
                adminApp.loadTenants().catch(e => console.error('Tenants error:', e));
                adminApp.loadBilling().catch(e => console.error('Billing error:', e));
                adminApp.loadTickets().catch(e => console.error('Tickets error:', e));
                adminApp.loadAnnouncements().catch(e => console.error('Announcements error:', e));
            }, 100);
        } else {
            alert("Wrong password");
        }
    },

    // Show specific view
    showView: (viewName) => {
        // Update nav links
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`.nav-link[data-view="${viewName}"]`)?.classList.add('active');

        // Update views
        document.querySelectorAll('.admin-view').forEach(view => {
            view.classList.remove('active');
        });
        document.getElementById(`view-${viewName}`)?.classList.add('active');

        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            tenants: 'Tenants',
            readings: 'Meter Readings',
            billing: 'Billing',
            tickets: 'Tickets',
            announcements: 'Announcements',
            reports: 'Reports'
        };
        document.getElementById('page-title').textContent = titles[viewName] || viewName;

        if (viewName === 'announcements') {
            adminApp.loadAnnouncements().catch(e => console.error('Announcements error:', e));
        }

        if (viewName === 'reports') {
            adminApp.loadReports();
        }
    },

    loadReports: () => {
        const startInput = document.getElementById('report-start');
        const endInput = document.getElementById('report-end');
        if (startInput && endInput) {
            const now = new Date();
            const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
            const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
            if (!startInput.value) startInput.value = startMonth;
            if (!endInput.value) endInput.value = endMonth;
        }
        adminApp.generateReport();
    },

    generateReport: async () => {
        const type = document.getElementById('report-type')?.value || 'owner';
        const start = document.getElementById('report-start')?.value || '';
        const end = document.getElementById('report-end')?.value || '';
        const output = document.getElementById('report-output');
        if (output) output.innerHTML = 'Generating report...';

        const inRange = (monthStr) => {
            if (!monthStr) return false;
            if (start && monthStr < start) return false;
            if (end && monthStr > end) return false;
            return true;
        };

        try {
            const billsSnap = await db.collection('soas').get();
            const bills = billsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const tenantsSnap = await db.collection('tenants').get();
            const tenants = tenantsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const filteredBills = bills.filter(b => inRange(b.month || ''));
            adminApp.reportCache.type = type;

            if (type === 'owner') {
                const totalBilled = filteredBills.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
                const totalPaid = filteredBills.filter(b => (b.status || '').toLowerCase() === 'paid')
                    .reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
                const totalUnpaid = totalBilled - totalPaid;
                const paidCount = filteredBills.filter(b => (b.status || '').toLowerCase() === 'paid').length;
                const unpaidCount = filteredBills.length - paidCount;
                const cashPaid = filteredBills.filter(b => (b.paymentType || '') === 'cash')
                    .reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
                const gcashPaid = filteredBills.filter(b => (b.paymentType || '') === 'gcash')
                    .reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
                const today = new Date();
                const overdueCount = filteredBills.filter(b => {
                    const status = (b.status || '').toLowerCase();
                    if (status !== 'unpaid') return false;
                    if (!b.dueDate) return false;
                    const due = new Date(b.dueDate);
                    return due.toString() !== 'Invalid Date' && due < today;
                }).length;

                adminApp.reportCache.summary = {
                    totalBilled,
                    totalPaid,
                    totalUnpaid,
                    paidCount,
                    unpaidCount,
                    cashPaid,
                    gcashPaid,
                    overdueCount
                };

                adminApp.reportCache.rows = filteredBills.map(b => ({
                    roomNo: b.roomNo || '',
                    month: b.month || '',
                    status: b.status || 'unpaid',
                    total: Number(b.totalAmount || 0),
                    paymentType: b.paymentType || ''
                }));

                if (output) {
                    output.innerHTML = `
                        <div class="kpi-strip" style="margin-bottom: 1rem;">
                            <div class="kpi-card">
                                <div class="kpi-label">Total Billed</div>
                                <div class="kpi-value">₱${totalBilled.toFixed(2)}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">Total Paid</div>
                                <div class="kpi-value">₱${totalPaid.toFixed(2)}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">Total Unpaid</div>
                                <div class="kpi-value">₱${totalUnpaid.toFixed(2)}</div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-label">Overdue Bills</div>
                                <div class="kpi-value">${overdueCount}</div>
                            </div>
                        </div>
                        <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem;">
                            <div class="card">
                                <strong>Paid Bills:</strong> ${paidCount}
                            </div>
                            <div class="card">
                                <strong>Unpaid Bills:</strong> ${unpaidCount}
                            </div>
                            <div class="card">
                                <strong>Cash Collected:</strong> ₱${cashPaid.toFixed(2)}
                            </div>
                            <div class="card">
                                <strong>GCash Collected:</strong> ₱${gcashPaid.toFixed(2)}
                            </div>
                        </div>
                        <table class="report-table">
                            <thead>
                                <tr>
                                    <th>Room</th>
                                    <th>Month</th>
                                    <th>Status</th>
                                    <th>Total</th>
                                    <th>Payment</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${adminApp.reportCache.rows.map(r => `
                                    <tr>
                                        <td>${r.roomNo}</td>
                                        <td>${r.month}</td>
                                        <td>${r.status}</td>
                                        <td>₱${r.total.toFixed(2)}</td>
                                        <td>${r.paymentType || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }
            }

            if (type === 'rental-history') {
                const byRoom = new Map();
                filteredBills.forEach(b => {
                    const room = b.roomNo || 'N/A';
                    if (!byRoom.has(room)) byRoom.set(room, []);
                    byRoom.get(room).push(b);
                });

                const rows = Array.from(byRoom.entries()).map(([room, items]) => {
                    const totalBilled = items.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
                    const totalPaid = items.filter(b => (b.status || '').toLowerCase() === 'paid')
                        .reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
                    const last = items.sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0];
                    return {
                        roomNo: room,
                        months: items.length,
                        totalBilled,
                        totalPaid,
                        lastStatus: last?.status || 'unpaid'
                    };
                });

                adminApp.reportCache.rows = rows;
                adminApp.reportCache.summary = {};

                if (output) {
                    output.innerHTML = `
                        <table class="report-table">
                            <thead>
                                <tr>
                                    <th>Room</th>
                                    <th>Months Billed</th>
                                    <th>Total Billed</th>
                                    <th>Total Paid</th>
                                    <th>Last Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.map(r => `
                                    <tr>
                                        <td>${r.roomNo}</td>
                                        <td>${r.months}</td>
                                        <td>₱${r.totalBilled.toFixed(2)}</td>
                                        <td>₱${r.totalPaid.toFixed(2)}</td>
                                        <td>${r.lastStatus}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }
            }

            if (type === 'screening') {
                const rows = tenants.map(t => ({
                    name: t.name || '',
                    roomNo: t.roomNo || '',
                    email: t.email || '',
                    phone: t.phone || ''
                }));
                adminApp.reportCache.rows = rows;
                adminApp.reportCache.summary = {};

                if (output) {
                    output.innerHTML = `
                        <table class="report-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Room</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.map(r => `
                                    <tr>
                                        <td>${(typeof Security !== 'undefined' && Security.sanitizeText) ? Security.sanitizeText(r.name) : r.name}</td>
                                        <td>${r.roomNo}</td>
                                        <td>${r.email || '-'}</td>
                                        <td>${r.phone || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }
            }

            if (type === 'rent-roll') {
                const billsByRoom = new Map();
                bills.forEach(b => {
                    const room = b.roomNo || 'N/A';
                    if (!billsByRoom.has(room)) billsByRoom.set(room, []);
                    billsByRoom.get(room).push(b);
                });

                const rows = tenants.map(t => {
                    const room = t.roomNo || 'N/A';
                    const list = billsByRoom.get(room) || [];
                    const latest = list.sort((a, b) => (b.month || '').localeCompare(a.month || ''))[0];
                    return {
                        name: t.name || '',
                        roomNo: room,
                        rent: Number(latest?.rentalAmount || 0),
                        status: latest?.status || 'unpaid',
                        dueDate: latest?.dueDate || 'N/A'
                    };
                });

                adminApp.reportCache.rows = rows;
                adminApp.reportCache.summary = {};

                if (output) {
                    output.innerHTML = `
                        <table class="report-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Room</th>
                                    <th>Rent</th>
                                    <th>Status</th>
                                    <th>Due Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.map(r => `
                                    <tr>
                                        <td>${(typeof Security !== 'undefined' && Security.sanitizeText) ? Security.sanitizeText(r.name) : r.name}</td>
                                        <td>${r.roomNo}</td>
                                        <td>₱${r.rent.toFixed(2)}</td>
                                        <td>${r.status}</td>
                                        <td>${r.dueDate}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }
            }
        } catch (e) {
            console.error('Report error:', e);
            if (output) output.innerHTML = '<p style="color:var(--danger);">Could not generate report.</p>';
        }
    },

    downloadReportCSV: () => {
        const type = adminApp.reportCache.type || 'report';
        const rows = adminApp.reportCache.rows || [];
        if (!rows.length) {
            alert('No report data to download.');
            return;
        }

        let headers = [];
        if (type === 'owner') headers = ['Room', 'Month', 'Status', 'Total', 'Payment'];
        if (type === 'rental-history') headers = ['Room', 'Months Billed', 'Total Billed', 'Total Paid', 'Last Status'];
        if (type === 'screening') headers = ['Name', 'Room', 'Email', 'Phone'];
        if (type === 'rent-roll') headers = ['Name', 'Room', 'Rent', 'Status', 'Due Date'];

        const csvRows = [headers.join(',')];
        rows.forEach(r => {
            const values = headers.map(h => {
                const key = h.toLowerCase().replace(/\s+/g, '');
                if (type === 'owner') {
                    return [r.roomNo, r.month, r.status, r.total, r.paymentType][headers.indexOf(h)];
                }
                if (type === 'rental-history') {
                    return [r.roomNo, r.months, r.totalBilled, r.totalPaid, r.lastStatus][headers.indexOf(h)];
                }
                if (type === 'screening') {
                    return [r.name, r.roomNo, r.email, r.phone][headers.indexOf(h)];
                }
                if (type === 'rent-roll') {
                    return [r.name, r.roomNo, r.rent, r.status, r.dueDate][headers.indexOf(h)];
                }
                return r[key] ?? '';
            });
            const escaped = values.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`);
            csvRows.push(escaped.join(','));
        });

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    printReport: () => {
        window.print();
    },

    // Load Dashboard KPIs and Recent Data
    loadDashboard: async () => {
        try {
            // Load KPIs
            const tenantsSnap = await db.collection('tenants').get();
            const totalRooms = tenantsSnap.size;
            const kpiOccupied = document.getElementById('kpi-occupied');
            if (kpiOccupied) kpiOccupied.textContent = totalRooms;
            
            // For vacant rooms, you'd need to track total capacity
            // For now, just show a placeholder
            const kpiVacant = document.getElementById('kpi-vacant');
            if (kpiVacant) kpiVacant.textContent = '-';
            
            // Bills due this month
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const billsSnap = await db.collection('soas')
                .where('month', '==', currentMonth)
                .where('status', '==', 'unpaid')
                .get();
            const kpiBillsDue = document.getElementById('kpi-bills-due');
            if (kpiBillsDue) kpiBillsDue.textContent = billsSnap.size;
            
            // Open tickets
            const ticketsSnap = await db.collection('tickets')
                .where('status', '!=', 'resolved')
                .get();
            const kpiTickets = document.getElementById('kpi-tickets');
            if (kpiTickets) kpiTickets.textContent = ticketsSnap.size;
            
            // Recent tenants
            const recentTenants = tenantsSnap.docs.slice(0, 3);
            const dashboardTenants = document.getElementById('dashboard-tenants');
            if (dashboardTenants) {
                if (recentTenants.length > 0) {
                    let html = '<div style=\"display:flex; flex-direction:column; gap:0.5rem;\">';
                    recentTenants.forEach(doc => {
                        const t = doc.data();
                        html += `<div style=\"display:flex; justify-content:space-between; padding:0.5rem; background:var(--bg-color); border-radius:0.25rem;\">
                            <strong>${t.name}</strong>
                            <span style=\"color:var(--text-muted);\">Room ${t.roomNo}</span>
                        </div>`;
                    });
                    html += '</div>';
                    dashboardTenants.innerHTML = html;
                } else {
                    dashboardTenants.innerHTML = 'No tenants yet';
                }
            }
            
            // Unpaid bills
            const dashboardBills = document.getElementById('dashboard-bills');
            if (dashboardBills) {
                if (!billsSnap.empty) {
                    let html = '<div style=\"display:flex; flex-direction:column; gap:0.5rem;\">';
                    billsSnap.docs.slice(0, 3).forEach(doc => {
                        const b = doc.data();
                        html += `<div style=\"display:flex; justify-content:space-between; padding:0.5rem; background:var(--bg-color); border-radius:0.25rem;\">
                            <span>Room ${b.roomNo}</span>
                            <strong style=\"color:var(--danger);\">₱${b.totalAmount}</strong>
                        </div>`;
                    });
                    html += '</div>';
                    dashboardBills.innerHTML = html;
                } else {
                    dashboardBills.innerHTML = 'All caught up! 🎉';
                }
            }
            
            // Open tickets preview
            const dashboardTickets = document.getElementById('dashboard-tickets');
            if (dashboardTickets) {
                if (!ticketsSnap.empty) {
                    let html = '<div style=\"display:flex; flex-direction:column; gap:0.5rem;\">';
                    ticketsSnap.docs.slice(0, 3).forEach(doc => {
                        const t = doc.data();
                        html += `<div style=\"padding:0.5rem; background:var(--bg-color); border-radius:0.25rem;\">
                            <div style=\"font-weight:600;\">${t.title || 'Untitled'}</div>
                            <div style=\"font-size:0.75rem; color:var(--text-muted);\">Room ${t.roomNo}</div>
                        </div>`;
                    });
                    html += '</div>';
                    dashboardTickets.innerHTML = html;
                } else {
                    dashboardTickets.innerHTML = 'No open tickets 👍';
                }
            }
            
        } catch (e) {
            console.error('Dashboard load error:', e);
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
            adminApp.closeAnnouncementModal();
            adminApp.loadAnnouncements();
        } catch(e) { alert("Error: " + e.message); }
    },

    // Load Announcements (Admin)
    loadAnnouncements: async () => {
        const container = document.getElementById('admin-announcements-list');
        if (!container) return;
        container.innerHTML = 'Loading announcements…';

        try {
            const snap = await db.collection('announcements')
                .orderBy('createdAt', 'desc')
                .get();

            if (snap.empty) {
                container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">No announcements yet.</p>';
                return;
            }

            let html = '<div style="display:grid; gap:0.75rem;">';
            snap.forEach(doc => {
                const data = doc.data();
                const title = (typeof Security !== 'undefined' && Security.sanitizeText) ? Security.sanitizeText(data.title || '') : (data.title || '');
                const body = (typeof Security !== 'undefined' && Security.sanitizeText) ? Security.sanitizeText(data.body || '') : (data.body || '');
                const date = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : 'Just now';

                html += `
                    <div style="background:var(--bg-color); border:1px solid var(--border); border-radius:0.35rem; padding:0.75rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
                            <strong>${title}</strong>
                            <button onclick="adminApp.deleteAnnouncement('${doc.id}')" class="btn-action danger">🗑 Remove</button>
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin:0.25rem 0;">${date}</div>
                        <div style="font-size:0.9rem;">${body}</div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        } catch (e) {
            console.error('Load announcements error:', e);
            container.innerHTML = '<p style="text-align:center; color:red;">Could not load announcements.</p>';
        }
    },

    // Delete Announcement
    deleteAnnouncement: async (announcementId) => {
        if (!confirm('Remove this announcement?')) return;
        try {
            await db.collection('announcements').doc(announcementId).delete();
            adminApp.loadAnnouncements();
        } catch (e) {
            alert('Error deleting announcement: ' + e.message);
        }
    },

    // 2. Fetch meter readings for selected room and month
    fetchReadings: async () => {
        const room = document.getElementById('bill-room').value;
        const month = document.getElementById('bill-month').value; // Format: "2026-02"

        if (!room || !month) {
            document.getElementById('bill-water-prev').value = '';
            document.getElementById('bill-water-reading').value = '';
            document.getElementById('bill-electric-prev').value = '';
            document.getElementById('bill-electric-reading').value = '';
            document.getElementById('water-consumption').textContent = '0';
            document.getElementById('electric-consumption').textContent = '0';
            document.getElementById('water-cost').textContent = '0';
            document.getElementById('electric-cost').textContent = '0';
            return;
        }

        try {
            // Calculate previous month
            const [year, monthNum] = month.split('-');
            const prevMonth = parseInt(monthNum) - 1;
            let prevYear = parseInt(year);
            let prevMonthStr = prevMonth.toString().padStart(2, '0');
            
            if (prevMonth === 0) {
                prevYear--;
                prevMonthStr = '12';
            }
            
            const prevMonthStr_full = `${prevYear}-${prevMonthStr}`;

            // Query all meter readings for this room
            const readingsSnap = await db.collection('meter_readings')
                .where('roomNo', '==', room)
                .get();

            if (readingsSnap.empty) {
                alert(`No meter reading found for Room ${room}. Please add it first.`);
                document.getElementById('bill-water-prev').value = '0';
                document.getElementById('bill-water-reading').value = '';
                document.getElementById('bill-electric-prev').value = '0';
                document.getElementById('bill-electric-reading').value = '';
                return;
            }

            // Filter and sort readings
            const allReadings = readingsSnap.docs
                .map(doc => ({ ...doc.data(), docId: doc.id }))
                .filter(r => r.readingDate)
                .sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));

            // Find current month reading
            const currentReading = allReadings.find(r => r.readingDate.startsWith(month));
            
            // Find previous month reading
            const previousReading = allReadings.find(r => r.readingDate.startsWith(prevMonthStr_full));

            if (!currentReading) {
                alert(`No meter reading found for Room ${room} in ${month}. Please add it first.`);
                return;
            }

            const prevWater = previousReading ? (previousReading.waterReading || 0) : 0;
            const prevElectric = previousReading ? (previousReading.electricReading || 0) : 0;
            const currWater = currentReading.waterReading || 0;
            const currElectric = currentReading.electricReading || 0;

            // Calculate consumption
            const waterConsumption = Math.max(0, currWater - prevWater);
            const electricConsumption = Math.max(0, currElectric - prevElectric);

            // Calculate costs
            const waterCost = waterConsumption * UNIT_PRICES.water;
            const electricCost = electricConsumption * UNIT_PRICES.electric;

            // Populate fields
            document.getElementById('bill-water-prev').value = prevWater;
            document.getElementById('bill-water-reading').value = currWater;
            document.getElementById('bill-electric-prev').value = prevElectric;
            document.getElementById('bill-electric-reading').value = currElectric;

            // Update display
            document.getElementById('water-consumption').textContent = waterConsumption.toFixed(2);
            document.getElementById('electric-consumption').textContent = electricConsumption.toFixed(2);
            document.getElementById('water-rate').textContent = UNIT_PRICES.water;
            document.getElementById('electric-rate').textContent = UNIT_PRICES.electric;
            document.getElementById('water-cost').textContent = waterCost.toFixed(2);
            document.getElementById('electric-cost').textContent = electricCost.toFixed(2);

        } catch(e) {
            console.error(e);
            alert("Error fetching readings: " + e.message);
        }
    },

    // 3. Create Bill with auto-calculated costs from meter readings
    createBill: async () => {
        const room = document.getElementById('bill-room').value;
        const month = document.getElementById('bill-month').value;
        const rental = parseFloat(document.getElementById('bill-rental').value) || 0;
        const currentWaterReading = parseFloat(document.getElementById('bill-water-reading').value);
        const currentElectricReading = parseFloat(document.getElementById('bill-electric-reading').value);
        const due = document.getElementById('bill-due').value;

        if(!room || !month) return alert("Room and Month are required");
        if(isNaN(currentWaterReading) || isNaN(currentElectricReading)) return alert("Please fetch meter readings first (select Room and Month)");

        try {
            // Get all readings for this room
            const allReadingsSnap = await db.collection('meter_readings')
                .where('roomNo', '==', room)
                .get();

            let waterConsumption = 0;
            let electricConsumption = 0;

            if (!allReadingsSnap.empty) {
                // Calculate previous month
                const [year, monthNum] = month.split('-');
                const prevMonth = parseInt(monthNum) - 1;
                let prevYear = parseInt(year);
                let prevMonthStr = prevMonth.toString().padStart(2, '0');
                
                if (prevMonth === 0) {
                    prevYear--;
                    prevMonthStr = '12';
                }
                
                const prevMonthStr_full = `${prevYear}-${prevMonthStr}`;

                // Filter and sort readings to find previous month's reading
                const allReadings = allReadingsSnap.docs
                    .map(doc => doc.data())
                    .filter(r => r.readingDate)
                    .sort((a, b) => new Date(b.readingDate) - new Date(a.readingDate));

                // Find the most recent reading from previous month
                const prevReading = allReadings.find(r => r.readingDate.startsWith(prevMonthStr_full));

                if (prevReading) {
                    waterConsumption = currentWaterReading - (prevReading.waterReading || 0);
                    electricConsumption = currentElectricReading - (prevReading.electricReading || 0);
                } else {
                    // If no previous reading, use current reading as consumption (first month)
                    waterConsumption = currentWaterReading;
                    electricConsumption = currentElectricReading;
                }
            } else {
                // If no previous reading, use current reading as consumption (first month)
                waterConsumption = currentWaterReading;
                electricConsumption = currentElectricReading;
            }

            // Ensure consumption is not negative
            waterConsumption = Math.max(0, waterConsumption);
            electricConsumption = Math.max(0, electricConsumption);

            // Calculate costs
            const waterAmount = waterConsumption * UNIT_PRICES.water;
            const electricAmount = electricConsumption * UNIT_PRICES.electric;
            const total = rental + waterAmount + electricAmount;

            // Save bill
            await db.collection('soas').add({
                roomNo: room,
                month: month,
                rentalAmount: rental,
                waterReading: currentWaterReading,
                waterConsumption: waterConsumption,
                waterAmount: waterAmount,
                electricReading: currentElectricReading,
                electricConsumption: electricConsumption,
                electricAmount: electricAmount,
                totalAmount: total,
                dueDate: due,
                status: "unpaid"
            });

            alert(`Bill sent to Room ${room}!\nBreakdown:\nRental: ${rental}\nWater (${waterConsumption}m³): ${waterAmount}\nElectric (${electricConsumption}kWh): ${electricAmount}\nTotal: ${total}`);
            
            // Close modal and clear form
            adminApp.closeBillModal();
        } catch(e) { 
            console.error(e);
            alert("Error: " + e.message); 
        }
    },

    // 2.5 Load Tenants
    loadTenants: async () => {
        const tbody = document.getElementById('tenants-tbody');
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Loading tenants…</td></tr>';
        
        try {
            const snap = await db.collection('tenants').orderBy('roomNo', 'asc').get();
            
            if (snap.empty) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No tenants yet. Add your first tenant to get started.</td></tr>';
                return;
            }

            let tableHtml = '';
            snap.forEach(doc => {
                const data = doc.data();
                const id = doc.id;
                const name = data.name || 'N/A';
                const roomNo = data.roomNo || 'N/A';
                const email = data.email || '';
                const phone = data.phone || '';
                const pin = data.pin || '';
                tableHtml += `<tr>
                    <td>${name}</td>
                    <td>${roomNo}</td>
                    <td>
                        <button onclick="adminApp.openBillModal('${roomNo}')" class="btn-action primary">🧾 Bill</button>
                        <button onclick="adminApp.viewTenantBills('${roomNo}', '${name}')" class="btn-action success">💰 History</button>
                        <button onclick='adminApp.editTenant(${JSON.stringify({id, name, roomNo, email, phone, pin})})' class="btn-action warning">✏️ Edit</button>
                        <button onclick="adminApp.removeTenant('${id}', '${roomNo}')" class="btn-action danger">🗑 Remove</button>
                    </td>
                </tr>`;
            });
            tbody.innerHTML = tableHtml;
        } catch (e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Could not load tenants right now.</td></tr>';
        }
    },

    // Open Bill Modal
    openBillModal: (roomNo) => {
        document.getElementById('bill-modal').style.display = 'flex';
        document.getElementById('bill-room').value = roomNo;
        // Clear other fields
        document.getElementById('bill-month').value = '';
        document.getElementById('bill-rental').value = '';
        document.getElementById('bill-water-reading').value = '';
        document.getElementById('bill-electric-reading').value = '';
        document.getElementById('bill-due').value = '';
    },

    // Close Bill Modal
    closeBillModal: () => {
        document.getElementById('bill-modal').style.display = 'none';
    },

    // View Tenant Billing History
    viewTenantBills: async (roomNo, tenantName) => {
        const modal = document.getElementById('tenant-bills-modal');
        const container = document.getElementById('tenant-bills-list');
        document.getElementById('tenant-bills-title').innerText = `${tenantName} - Room ${roomNo} Billing History`;
        
        modal.style.display = 'flex';
        container.innerHTML = 'Loading billing records…';
        
        try {
            const snap = await db.collection('soas')
                .where('roomNo', '==', roomNo)
                .orderBy('month', 'desc')
                .get();
            
            if (snap.empty) {
                container.innerHTML = '<p style="text-align:center; color:var(--text-muted);">No bills yet for this tenant.</p>';
                return;
            }

            let html = '<div style="display: grid; gap: 1rem;">';
            
            snap.forEach(doc => {
                const data = doc.data();
                const id = doc.id;
                const status = data.status || 'unpaid';
                const statusColor = status === 'paid' ? 'green' : 'red';
                const statusText = status === 'paid' ? '✅ Paid' : '❌ Unpaid';
                const total = data.totalAmount || 0;

                const actionButton = status === 'paid'
                    ? `<button onclick="adminApp.updateBillStatusFromTenantView('${id}', 'unpaid', '${roomNo}', '${tenantName}')" class="btn-action danger">Mark Unpaid</button>`
                    : `<button onclick="adminApp.updateBillStatusFromTenantView('${id}', 'paid', '${roomNo}', '${tenantName}')" class="btn-action success">Mark Paid</button>`;

                html += `
                    <div style="border: 1px solid var(--border); border-left: 5px solid ${statusColor}; padding: 12px; border-radius: 8px; background: white;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <strong style="font-size:1rem;">${data.month}</strong>
                            <span style="color:${statusColor}; font-weight:bold; font-size:0.85rem;">${statusText}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin:8px 0; font-size:0.85rem;">
                            <div>
                                <small style="color:var(--text-muted);">Rental</small>
                                <div>₱${data.rentalAmount || 0}</div>
                            </div>
                            <div>
                                <small style="color:var(--text-muted);">Water</small>
                                <div>₱${data.waterAmount || 0}</div>
                            </div>
                            <div>
                                <small style="color:var(--text-muted);">Electric</small>
                                <div>₱${data.electricAmount || 0}</div>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid var(--border);">
                            <div>
                                <strong>Total: ₱${total.toFixed(2)}</strong>
                                <small style="color:red; display:block; font-size:0.75rem;">Due: ${data.dueDate || 'N/A'}</small>
                            </div>
                            ${actionButton}
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            container.innerHTML = html;
        } catch(e) { 
            console.error(e);
            container.innerHTML = '<p>Could not load billing history.</p>'; 
        }
    },

    // Close Tenant Bills Modal
    closeTenantBillsModal: () => {
        document.getElementById('tenant-bills-modal').style.display = 'none';
    },

    // Update Bill Status from Tenant View
    updateBillStatusFromTenantView: async (billId, newStatus, roomNo, tenantName) => {
        const action = newStatus === 'paid' ? 'paid' : 'unpaid';
        if (!confirm(`Mark this bill as ${action}?`)) return;
        
        try {
            await db.collection('soas').doc(billId).update({ status: newStatus });
            adminApp.viewTenantBills(roomNo, tenantName); // Refresh the tenant's bills
            adminApp.loadBilling(); // Also refresh the main billing list
        } catch(e) { 
            alert('Error updating status: ' + e.message); 
        }
    },

    // Add Tenant Function
    addTenant: async () => {
        const name = document.getElementById('tenant-name').value.trim();
        const roomNo = document.getElementById('tenant-room').value.trim();
        const pin = document.getElementById('tenant-pin').value.trim();
        const email = document.getElementById('tenant-email').value.trim();
        const phone = document.getElementById('tenant-phone').value.trim();

        if (!name || !roomNo) {
            return alert('Name and Room Number are required');
        }

        if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            return alert('Please enter a valid 4-digit PIN');
        }

        try {
            const roomNoNormalized = adminApp.normalizeRoomNo(roomNo);

            // Check if room number already exists
            let existingRoom = await db.collection('tenants')
                .where('roomNoNormalized', '==', roomNoNormalized)
                .limit(1)
                .get();

            if (existingRoom.empty) {
                existingRoom = await db.collection('tenants')
                    .where('roomNo', '==', roomNo)
                    .limit(1)
                    .get();
            }

            if (!existingRoom.empty) {
                return alert(`Room ${roomNo} is already occupied!`);
            }

            // Add tenant
            await db.collection('tenants').add({
                name: name,
                roomNo: roomNo,
                roomNoNormalized: roomNoNormalized,
                pin: pin,
                email: email || '',
                phone: phone || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert(`Tenant ${name} added to Room ${roomNo}!`);
            
            // Close modal and reload tenant list
            adminApp.closeAddTenantModal();
            adminApp.loadTenants();
        } catch (e) {
            console.error(e);
            alert('Error adding tenant: ' + e.message);
        }
    },

    // Toggle Tenant Form
    toggleTenantForm: () => {
        const form = document.getElementById('tenant-form');
        if (!form) return;
        form.classList.toggle('hidden');
    },

    // Edit Tenant Function
    editTenant: (tenant) => {
        document.getElementById('edit-tenant-modal').style.display = 'flex';
        document.getElementById('edit-tenant-id').value = tenant.id;
        document.getElementById('edit-tenant-name').value = tenant.name;
        document.getElementById('edit-tenant-room').value = tenant.roomNo;
        document.getElementById('edit-tenant-pin').value = tenant.pin;
        document.getElementById('edit-tenant-email').value = tenant.email;
        document.getElementById('edit-tenant-phone').value = tenant.phone;
    },

    // Close Edit Tenant Modal
    closeEditTenantModal: () => {
        document.getElementById('edit-tenant-modal').style.display = 'none';
    },

    // Update Tenant Function
    updateTenant: async () => {
        const id = document.getElementById('edit-tenant-id').value;
        const name = document.getElementById('edit-tenant-name').value.trim();
        const roomNo = document.getElementById('edit-tenant-room').value.trim();
        const pin = document.getElementById('edit-tenant-pin').value.trim();
        const email = document.getElementById('edit-tenant-email').value.trim();
        const phone = document.getElementById('edit-tenant-phone').value.trim();

        if (!name || !roomNo) {
            return alert('Name and Room Number are required');
        }

        if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            return alert('Please enter a valid 4-digit PIN');
        }

        try {
            const roomNoNormalized = adminApp.normalizeRoomNo(roomNo);

            // Check if room number is taken by another tenant
            let existingRoom = await db.collection('tenants')
                .where('roomNoNormalized', '==', roomNoNormalized)
                .get();

            if (existingRoom.empty) {
                existingRoom = await db.collection('tenants')
                    .where('roomNo', '==', roomNo)
                    .get();
            }

            // Check if any other tenant (not this one) has this room
            const conflict = existingRoom.docs.find(doc => doc.id !== id);
            if (conflict) {
                return alert(`Room ${roomNo} is already occupied by another tenant!`);
            }

            // Update tenant
            await db.collection('tenants').doc(id).update({
                name: name,
                roomNo: roomNo,
                roomNoNormalized: roomNoNormalized,
                pin: pin,
                email: email || '',
                phone: phone || ''
            });

            alert(`Tenant ${name} updated successfully!`);
            adminApp.closeEditTenantModal();
            adminApp.loadTenants();
        } catch (e) {
            console.error(e);
            alert('Error updating tenant: ' + e.message);
        }
    },

    // Remove Tenant Function
    removeTenant: async (tenantId, roomNo) => {
        if (!confirm(`Remove tenant from Room ${roomNo}?`)) return;
        
        try {
            await db.collection('tenants').doc(tenantId).delete();
            alert(`Tenant removed from Room ${roomNo}`);
            adminApp.loadTenants();
        } catch (e) {
            console.error(e);
            alert('Error removing tenant: ' + e.message);
        }
    },

    // Load Billing Management
    loadBilling: async () => {
        const container = document.getElementById('admin-billing-list');
        container.innerHTML = 'Loading...';
        
        try {
            const snap = await db.collection('soas').orderBy('month', 'desc').get();
            
            if (snap.empty) {
                container.innerHTML = '<p>No bills yet. Create one from the tenant list.</p>';
                return;
            }

            let html = '<div style="display: grid; gap: 1rem;">';
            
            snap.forEach(doc => {
                const data = doc.data();
                const id = doc.id;
                const status = data.status || 'unpaid';
                const statusColor = status === 'paid' ? 'green' : 'red';
                const statusText = status === 'paid' ? '✅ Paid' : '❌ Unpaid';
                const paymentType = data.paymentType || '';
                const paymentIcon = paymentType === 'cash' ? '💵' : paymentType === 'gcash' ? '💚' : '';
                const paymentLabel = paymentType === 'cash' ? 'Cash' : paymentType === 'gcash' ? 'GCash' : '';
                const total = data.totalAmount || 0;

                const actionButton = status === 'paid'
                    ? `<button onclick="adminApp.updateBillStatus('${id}', 'unpaid')" class="btn-action danger">Mark Unpaid</button>`
                    : `<button onclick="adminApp.showPaymentTypeModal('${id}')" class="btn-action success">✓ Mark Paid</button>`;

                const paymentTypeDisplay = paymentType ? `<span style="color:var(--text-muted); margin-left:10px; padding:2px 8px; background:#f0f0f0; border-radius:4px; font-size:0.85rem;">${paymentIcon} ${paymentLabel}</span>` : '';

                html += `
                    <div style="border: 1px solid var(--border); border-left: 5px solid ${statusColor}; padding: 15px; border-radius: 8px; background: white;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div>
                                <strong style="font-size:1.1rem;">Room ${data.roomNo}</strong>
                                <span style="color:var(--text-muted); margin-left:10px;">${data.month}</span>
                                ${paymentTypeDisplay}
                            </div>
                            <span style="color:${statusColor}; font-weight:bold;">${statusText}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin:10px 0; font-size:0.9rem;">
                            <div>
                                <small style="color:var(--text-muted);">Rental</small>
                                <div>₱${data.rentalAmount || 0}</div>
                            </div>
                            <div>
                                <small style="color:var(--text-muted);">Water</small>
                                <div>₱${data.waterAmount || 0}</div>
                            </div>
                            <div>
                                <small style="color:var(--text-muted);">Electric</small>
                                <div>₱${data.electricAmount || 0}</div>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">
                            <div>
                                <strong style="font-size:1.2rem;">Total: ₱${total.toFixed(2)}</strong>
                                <small style="color:red; display:block; margin-top:2px;">Due: ${data.dueDate || 'N/A'}</small>
                            </div>
                            <div>
                                ${actionButton}
                                <button onclick='adminApp.editBill(${JSON.stringify({id, ...data})})' class="btn-action warning">✏️ Edit</button>
                                <button onclick="adminApp.deleteBill('${id}', '${data.roomNo}', '${data.month}')" class="btn-action muted">🗑 Delete</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            container.innerHTML = html;
        } catch(e) { 
            console.error(e);
            container.innerHTML = '<p>Could not load bills right now.</p>'; 
        }
    },

    // Update Bill Payment Status
    updateBillStatus: async (billId, newStatus) => {
        const action = newStatus === 'paid' ? 'paid' : 'unpaid';
        if (!confirm(`Mark this bill as ${action}?`)) return;
        
        try {
            await db.collection('soas').doc(billId).update({ status: newStatus });
            adminApp.loadBilling(); // Refresh the list
        } catch(e) { 
            alert('Error updating status: ' + e.message); 
        }
    },

    // Show Payment Type Modal
    showPaymentTypeModal: (billId) => {
        document.getElementById('payment-bill-id').value = billId;
        document.getElementById('payment-type-modal').style.display = 'flex';
    },

    // Close Payment Type Modal
    closePaymentTypeModal: () => {
        document.getElementById('payment-type-modal').style.display = 'none';
        document.getElementById('payment-bill-id').value = '';
    },

    // Confirm Payment with Type
    confirmPayment: async (paymentType) => {
        const billId = document.getElementById('payment-bill-id').value;
        if (!billId) return;

        try {
            await db.collection('soas').doc(billId).update({ 
                status: 'paid',
                paymentType: paymentType
            });
            adminApp.closePaymentTypeModal();
            adminApp.loadBilling(); // Refresh the list
            alert('Bill marked as paid! E-receipt is ready for download.');
        } catch(e) {
            alert('Error updating bill: ' + e.message);
        }
    },

    // Edit Bill Function
    editBill: (bill) => {
        document.getElementById('edit-bill-modal').style.display = 'flex';
        document.getElementById('edit-bill-id').value = bill.id;
        document.getElementById('edit-bill-room').value = bill.roomNo;
        document.getElementById('edit-bill-month').value = bill.month;
        document.getElementById('edit-bill-rental').value = bill.rentalAmount || 0;
        document.getElementById('edit-bill-water').value = bill.waterAmount || 0;
        document.getElementById('edit-bill-electric').value = bill.electricAmount || 0;
        document.getElementById('edit-bill-due').value = bill.dueDate || '';
        document.getElementById('edit-bill-status').value = bill.status || 'unpaid';
    },

    // Close Edit Bill Modal
    closeEditBillModal: () => {
        document.getElementById('edit-bill-modal').style.display = 'none';
    },

    // Update Bill Function
    updateBill: async () => {
        const id = document.getElementById('edit-bill-id').value;
        const rental = parseFloat(document.getElementById('edit-bill-rental').value) || 0;
        const water = parseFloat(document.getElementById('edit-bill-water').value) || 0;
        const electric = parseFloat(document.getElementById('edit-bill-electric').value) || 0;
        const due = document.getElementById('edit-bill-due').value;
        const status = document.getElementById('edit-bill-status').value;

        const total = rental + water + electric;

        try {
            await db.collection('soas').doc(id).update({
                rentalAmount: rental,
                waterAmount: water,
                electricAmount: electric,
                totalAmount: total,
                dueDate: due,
                status: status
            });

            alert('Bill updated successfully!');
            adminApp.closeEditBillModal();
            adminApp.loadBilling();
        } catch (e) {
            console.error(e);
            alert('Error updating bill: ' + e.message);
        }
    },

    // Delete Bill Function
    deleteBill: async (billId, roomNo, month) => {
        if (!confirm(`Permanently delete bill for Room ${roomNo} (${month})?`)) return;
        
        try {
            await db.collection('soas').doc(billId).delete();
            alert('Bill deleted successfully!');
            adminApp.loadBilling();
        } catch (e) {
            console.error(e);
            alert('Error deleting bill: ' + e.message);
        }
    },

    // 3. Load Tickets (Updated with Buttons)
    loadTickets: async () => {
        const container = document.getElementById('admin-tickets-list');
        container.innerHTML = 'Loading tickets…';
        
        try {
            // Get tickets, ordered by newest first
            const snap = await db.collection('tickets').orderBy('createdAt', 'desc').get();

            if (snap.empty) {
                container.innerHTML = '<p>No tickets right now. Great job staying on top of things.</p>';
                return;
            }

            let html = '';
            
            snap.forEach(doc => {
                const data = doc.data();
                const id = doc.id; // We need the ID to update/delete it
                const isResolved = data.status === 'resolved';
                const statusColor = isResolved ? 'green' : 'red';
                const statusText = isResolved ? '✅ Solved' : '🔥 Open';

                // Only show buttons if the ticket is NOT resolved yet
                const actionButtons = isResolved 
                    ? `<button onclick="adminApp.deleteTicket('${id}')" class="btn-action muted">🗑 Delete</button>`
                    : `<button onclick="adminApp.resolveTicket('${id}')" class="btn-action success">✅ Mark Done</button>
                       <button onclick="adminApp.deleteTicket('${id}')" class="btn-action danger">🗑 Delete</button>`;

                // Robust date handling: support Firestore Timestamps and JS Date
                const created = data.createdAt;
                let dateStr = 'N/A';
                if (created) {
                    if (created.seconds) dateStr = new Date(created.seconds * 1000).toLocaleDateString();
                    else dateStr = new Date(created).toLocaleDateString();
                }

                html += `
                    <div class="card" style="border-left: 5px solid ${statusColor}; margin-bottom:10px; padding:15px;">
                        <div style="display:flex; justify-content:space-between;">
                            <strong>Room ${data.roomNo}</strong>
                            <small style="color:${statusColor}; font-weight:bold;">${statusText}</small>
                        </div>
                        <div style="margin-top:6px;">
                            ${data.acknowledged ? '<small style="color:var(--success); font-weight:600">Acknowledged</small>' : ''}
                        </div>
                        <p style="margin: 10px 0;">${data.message || data.description || ''}</p>
                        <div style="display:flex; justify-content:space-between; align-items:end;">
                            <small style="color:grey">${dateStr}</small>
                            <div>${actionButtons}</div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch(e) { 
            console.error(e);
            container.innerHTML = '<p>Could not load tickets right now.</p>'; 
        }
    },

    // Toggle tenant form (deprecated - now uses modal)
    toggleTenantForm: () => {
        const form = document.getElementById('tenant-form');
        if(form) form.classList.toggle('hidden');
    },

    // Open Add Tenant Modal
    openAddTenantModal: () => {
        document.getElementById('add-tenant-modal').style.display = 'flex';
        // Clear form
        document.getElementById('tenant-name').value = '';
        document.getElementById('tenant-room').value = '';
        document.getElementById('tenant-pin').value = '';
        document.getElementById('tenant-email').value = '';
        document.getElementById('tenant-phone').value = '';
    },

    // Close Add Tenant Modal
    closeAddTenantModal: () => {
        document.getElementById('add-tenant-modal').style.display = 'none';
    },

    // Open Add Reading Modal
    openAddReadingModal: () => {
        document.getElementById('add-reading-modal').style.display = 'flex';
        // Set today's date as default
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('reading-date').value = today;
        // Clear other fields
        document.getElementById('reading-room').value = '';
        document.getElementById('reading-water').value = '';
        document.getElementById('reading-electric').value = '';
    },

    // Close Add Reading Modal
    closeAddReadingModal: () => {
        document.getElementById('add-reading-modal').style.display = 'none';
    },

    // Open Announcement Modal
    openAnnouncementModal: () => {
        document.getElementById('announcement-modal').style.display = 'flex';
        // Clear form
        document.getElementById('news-title').value = '';
        document.getElementById('news-body').value = '';
    },

    // Close Announcement Modal
    closeAnnouncementModal: () => {
        document.getElementById('announcement-modal').style.display = 'none';
    },

    // Open readings modal
    openReadingsModal: () => {
        document.getElementById('readings-modal').style.display = 'flex';
        if (!adminApp.allReadings) {
            adminApp.loadReadings();
        }
    },

    // Close readings modal
    closeReadingsModal: () => {
        document.getElementById('readings-modal').style.display = 'none';
    },

    // Load Recent Meter Readings
    loadReadings: async () => {
        const container = document.getElementById('readings-list');
        const filterSelect = document.getElementById('readings-filter-room');
        if (!container) return;
        container.innerHTML = 'Loading recent readings…';

        try {
            const snap = await db.collection('meter_readings')
                .orderBy('readingDate', 'desc')
                .get();

            if (snap.empty) {
                container.innerHTML = 'No readings yet. Add the first one above.';
                return;
            }

            // Store all readings globally for filtering
            adminApp.allReadings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Populate room filter dropdown
            if (filterSelect) {
                const rooms = [...new Set(adminApp.allReadings.map(r => r.roomNo))].sort();
                const currentValue = filterSelect.value;
                filterSelect.innerHTML = '<option value="">All Rooms</option>';
                rooms.forEach(room => {
                    filterSelect.innerHTML += `<option value="${room}"${currentValue === room ? ' selected' : ''}>Room ${room}</option>`;
                });
            }

            // Apply filter
            adminApp.filterReadings();
        } catch (e) {
            console.error(e);
            container.innerHTML = 'Could not load readings right now.';
        }
    },

    // Filter and display readings
    filterReadings: () => {
        const container = document.getElementById('readings-list');
        const filterRoom = document.getElementById('readings-filter-room')?.value || '';
        const limitValue = document.getElementById('readings-limit')?.value || '10';
        
        if (!container || !adminApp.allReadings) return;

        // Filter by room
        let filtered = adminApp.allReadings;
        if (filterRoom) {
            filtered = filtered.filter(r => r.roomNo === filterRoom);
        }

        // Apply limit
        const limit = limitValue === 'all' ? filtered.length : parseInt(limitValue);
        const limited = filtered.slice(0, limit);

        if (limited.length === 0) {
            container.innerHTML = '<div class="empty-state">No readings found.</div>';
            return;
        }

        let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:0.5rem;">';
        limited.forEach(data => {
            html += `
                <div class="card" style="padding:0.4rem 0.6rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                        <strong style="font-size:0.85rem; color:var(--primary);">Room ${data.roomNo || 'N/A'}</strong>
                    </div>
                    <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.3rem;">${data.readingDate || 'N/A'}</div>
                    <div style="display:flex; flex-direction:column; gap:0.25rem; font-size:0.75rem;">
                        <div style="display:flex; justify-content:space-between;">
                            <span>💧 Water</span>
                            <strong style="color:var(--text-main);">${data.waterReading || 0}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span>⚡ Electric</span>
                            <strong style="color:var(--text-main);">${data.electricReading || 0}</strong>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    },

    // Save a meter reading from form
    saveReadingFromForm: async () => {
        const roomNo = document.getElementById('reading-room').value.trim();
        const readingDate = document.getElementById('reading-date').value;
        const waterReading = parseFloat(document.getElementById('reading-water').value) || 0;
        const electricReading = parseFloat(document.getElementById('reading-electric').value) || 0;

        if (!roomNo) return alert('Please enter room number');
        if (!readingDate) return alert('Please select a date');
        if (waterReading === 0 && electricReading === 0) return alert('Please enter at least one meter reading value');

        try {
            const tenantSnap = await db.collection('tenants')
                .where('roomNo', '==', roomNo)
                .limit(1)
                .get();

            if (tenantSnap.empty) {
                return alert(`Room ${roomNo} does not exist in the system.`);
            }

            await db.collection('meter_readings').add({
                roomNo: roomNo,
                waterReading: waterReading,
                electricReading: electricReading,
                readingDate: readingDate,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            alert(`Reading saved for Room ${roomNo} on ${readingDate}!`);
            adminApp.closeAddReadingModal();
            // Reload readings if modal is open
            if (adminApp.allReadings) {
                adminApp.loadReadings();
            }
        } catch (e) {
            console.error(e);
            alert('Error saving reading: ' + e.message);
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
    },

    // 6. Add a new row to readings table
    addReadingRow: () => {
        const tbody = document.getElementById('readings-tbody');
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" placeholder="101" class="reading-input"></td>
            <td><input type="number" placeholder="0.00" class="reading-input"></td>
            <td><input type="number" placeholder="0.00" class="reading-input"></td>
            <td><input type="date" class="reading-input"></td>
            <td><button onclick="adminApp.saveReading(this)" class="btn-small">Save</button></td>
        `;
        tbody.appendChild(row);
    },

    // 7. Save a meter reading row
    saveReading: async (btn) => {
        const row = btn.closest('tr');
        const inputs = row.querySelectorAll('.reading-input');
        
        const roomNo = inputs[0].value.trim();
        const waterReading = parseFloat(inputs[1].value) || 0;
        const electricReading = parseFloat(inputs[2].value) || 0;
        const readingDate = inputs[3].value; // Format: "2026-02-15"

        if (!roomNo) return alert('Please enter room number');
        if (!readingDate) return alert('Please select a date');
        if (waterReading === 0 && electricReading === 0) return alert('Please enter at least one meter reading value');

        try {
            // Validate room exists
            const tenantSnap = await db.collection('tenants')
                .where('roomNo', '==', roomNo)
                .limit(1)
                .get();
            
            if (tenantSnap.empty) {
                return alert(`Room ${roomNo} does not exist in the system.`);
            }

            await db.collection('meter_readings').add({
                roomNo: roomNo,
                waterReading: waterReading,
                electricReading: electricReading,
                readingDate: readingDate, // Stored as string in YYYY-MM-DD format
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert(`Reading saved for Room ${roomNo} on ${readingDate}!`);
            // Clear the row inputs
            inputs.forEach(input => input.value = '');
        } catch (e) {
            console.error(e);
            alert('Error saving reading: ' + e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', adminApp.applyTheme);