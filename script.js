const state = {
    toastTimer: null,
    runtimeReady: false,
    chart: null,
    sortDirection: {} // Tracks sorting orders for tables
};

// ====== SUPABASE CONFIGURATION ======
const SUPABASE_URL = "https://buddebetmmxkxsukvnmp.supabase.co";
const SUPABASE_KEY = "sb_publishable_NhZs593AJfKeORg1xPrZgg_rJwUxNSm";
const SUPABASE_BUCKET = "attendance"; 
// ====================================

// --- UI HELPERS ---

function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.style.background = isError ? "rgba(153, 27, 27, 0.95)" : "rgba(31, 41, 51, 0.94)";
    toast.classList.add("show");

    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2800);
}

// --- WASM FUNCTION WRAPPERS ---

let wasmAddStudent, wasmMarkAttendance, wasmGetStudentsJson, wasmGetRecordsJson, wasmGetSummaryJson, wasmLoadData;
let wasmDeleteStudent, wasmDeleteRecord, wasmDeleteRecordsByDate;

function initWasmWrappers() {
    wasmAddStudent = Module.cwrap('wasmAddStudent', 'number', ['number', 'string']);
    wasmMarkAttendance = Module.cwrap('wasmMarkAttendance', 'number', ['number', 'string', 'string']);
    wasmGetStudentsJson = Module.cwrap('wasmGetStudentsJson', 'string', []);
    wasmGetRecordsJson = Module.cwrap('wasmGetRecordsJson', 'string', []);
    wasmGetSummaryJson = Module.cwrap('wasmGetSummaryJson', 'string', []);
    wasmLoadData = Module.cwrap('wasmLoadData', null, []);
    
    // Delete wrappers
    wasmDeleteStudent = Module.cwrap('wasmDeleteStudent', 'number', ['number']);
    wasmDeleteRecord = Module.cwrap('wasmDeleteRecord', 'number', ['number', 'string']);
    wasmDeleteRecordsByDate = Module.cwrap('wasmDeleteRecordsByDate', 'number', ['string']);
}

// --- SUPABASE PERSISTENCE ---

let supabaseClient = null;
let sbBucket = SUPABASE_BUCKET;

function updateSyncStatus(status, color) {
    const dot = document.querySelector("#sync-status .status-dot");
    const text = document.querySelector("#sync-status .status-text");
    if (dot) dot.style.background = color;
    if (text) text.textContent = status;
}

async function loadFromSupabase() {
    if (!supabaseClient) return;
    updateSyncStatus("Syncing...", "#f59e0b"); // Orange
    try {
        const { data, error } = await supabaseClient.storage.from(sbBucket).download('students.dat');
        if (error) {
            console.log("Remote students.dat not found or download error. Starting fresh.");
            updateSyncStatus("Connected", "#10b981"); // Green
            return;
        }

        const arrayBuffer = await data.arrayBuffer();
        if (arrayBuffer.byteLength > 0) {
            const bytes = new Uint8Array(arrayBuffer);
            if (Module.FS) Module.FS.writeFile('students.dat', bytes);
        }
        
        if (typeof wasmLoadData !== 'undefined') wasmLoadData();
        showToast("Connected to Cloud! Data synced.");
        updateSyncStatus("Synced", "#10b981"); // Green
        await refreshUI();
    } catch (e) {
        console.error("Supabase load error:", e);
        updateSyncStatus("Sync Error", "#ef4444"); // Red
    }
}

async function backupData() {
    try {
        if (!Module.FS || !supabaseClient) return;
        updateSyncStatus("Syncing...", "#f59e0b");
        const data = Module.FS.readFile('students.dat');
        const blob = new Blob([data], { type: 'application/octet-stream' });
        
        const { error } = await supabaseClient.storage
            .from(sbBucket)
            .upload('students.dat', blob, { upsert: true });

        if (error) {
            console.error("Cloud Backup failed:", error.message);
            updateSyncStatus("Sync Error", "#ef4444");
        } else {
            updateSyncStatus("Synced", "#10b981");
        }
    } catch(e) {
        console.error("Error backing up to Supabase.", e);
        updateSyncStatus("Sync Error", "#ef4444");
    }
}

// --- AUTO-LOAD ---

document.addEventListener("DOMContentLoaded", () => {
    if (SUPABASE_URL !== "YOUR_SUPABASE_URL_HERE") {
        tryConnectSupabase(SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET);
    } else {
        showToast("Please update Supabase credentials in script.js", true);
        const overlay = document.getElementById('directory-picker-overlay');
        if (overlay) overlay.style.display = 'none'; // hide placeholder
    }
});

function tryConnectSupabase(url, key, bucket) {
    try {
        supabaseClient = supabase.createClient(url, key);
        sbBucket = bucket;
        updateSyncStatus("Connecting...", "#f59e0b");

        const overlay = document.getElementById('directory-picker-overlay');
        if (overlay) overlay.style.display = 'none';

        if (state.runtimeReady) {
            loadFromSupabase();
        } else {
            const checkReady = setInterval(() => {
                if (state.runtimeReady) {
                    clearInterval(checkReady);
                    loadFromSupabase();
                }
            }, 100);
        }
    } catch (err) {
        console.error("Failed to initialize Supabase:", err);
        updateSyncStatus("Sync Error", "#ef4444");
    }
}

// --- API FUNCTIONS (DELEGATED TO WASM) ---

async function apiAddStudent(regNo, name) {
    const code = wasmAddStudent(regNo, name);
    backupData();
    return code;
}

async function apiGetStudents() {
    try {
        return JSON.parse(wasmGetStudentsJson() || "[]");
    } catch (err) {
        return [];
    }
}

async function apiMarkAttendance(regNo, name, date, status) {
    const code = wasmMarkAttendance(regNo, date, status);
    backupData();
    return code;
}

async function apiGetRecords() {
    try {
        return JSON.parse(wasmGetRecordsJson() || "[]");
    } catch (err) {
        return [];
    }
}

async function apiGetSummary() {
    try {
        return JSON.parse(wasmGetSummaryJson() || '{"totalStudents":0,"shortageCount":0,"classAverage":0}');
    } catch (err) {
        return { totalStudents: 0, shortageCount: 0, classAverage: 0 };
    }
}

async function apiDeleteStudent(regNo) {
    const code = wasmDeleteStudent(regNo);
    backupData();
    return code;
}

async function apiDeleteRecord(regNo, date) {
    const code = wasmDeleteRecord(regNo, date);
    backupData();
    return code;
}

async function apiDeleteRecordsByDate(date) {
    const code = wasmDeleteRecordsByDate(date);
    backupData();
    return code;
}

// --- RENDERERS ---

function renderStudentsTable(students) {
    const tbody = document.getElementById("students-table-body");
    if (!tbody) return;

    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No students added yet.</td></tr>';
        return;
    }

    tbody.innerHTML = students.map((s) => `
        <tr style="cursor: pointer;" onclick="openProfileModal(${s.regNo})">
            <td>${s.regNo}</td>
            <td>${s.name}</td>
            <td>${s.percentage.toFixed(2)}% (${s.attendedClasses}/${s.totalClasses})</td>
            <td>
                <button onclick="event.stopPropagation(); handleDeleteStudent(${s.regNo});" style="background: none; border: none; cursor: pointer; color: #ef4444; padding: 5px;" title="Delete Student">🗑️</button>
            </td>
        </tr>
    `).join("");
}

function renderShortageTable(students) {
    const tbody = document.getElementById("shortage-table-body");
    if (!tbody) return;

    const shortageList = students.filter(s => s.percentage < 75 && s.totalClasses > 0);

    if (!shortageList.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No shortage students to show.</td></tr>';
        return;
    }

    tbody.innerHTML = shortageList.map((s) => `
        <tr style="cursor: pointer;" onclick="openProfileModal(${s.regNo})">
            <td>${s.regNo}</td>
            <td>${s.name}</td>
            <td style="color: #c2410c; font-weight: bold;">${s.percentage.toFixed(2)}% (${s.attendedClasses}/${s.totalClasses})</td>
        </tr>
    `).join("");
}

function renderHistoryTable(records) {
    const tbody = document.getElementById("history-table-body");
    if (!tbody) return;

    if (!records.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No attendance records found.</td></tr>';
        return;
    }

    records.sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = records.map((r) => {
        const statusHtml = r.status === 'P' 
            ? '<span style="color: #16a34a; font-weight: bold;">Present</span>' 
            : '<span style="color: #dc2626; font-weight: bold;">Absent</span>';
        return `
            <tr>
                <td>${r.date}</td>
                <td>${r.regNo}</td>
                <td>${r.name}</td>
                <td>${statusHtml}</td>
                <td><button onclick="handleDeleteRecord(${r.regNo}, '${r.date}')" style="background: none; border: none; cursor: pointer; color: #ef4444;" title="Delete Record">🗑️</button></td>
            </tr>
        `;
    }).join("");
}

function updateDashboard(summary, students = [], records = []) {
    document.getElementById("class-average").textContent = `${Number(summary.classAverage || 0).toFixed(2)}%`;
    document.getElementById("total-students").textContent = `${summary.totalStudents || 0}`;
    document.getElementById("shortage-count").textContent = `${summary.shortageCount || 0}`;
    
    const summaryBlock = document.getElementById("dashboard-summary");
    if (!summaryBlock) return;
    
    if (!summary.totalStudents || students.length === 0) {
        summaryBlock.innerHTML = "Add students and mark attendance to generate a full class summary.";
        return;
    }
    
    let perfectCount = 0;
    let topStudent = students[0];
    let bottomStudent = students[0];
    let classesConducted = new Set(records.map(r => r.date)).size;
    
    students.forEach(s => {
        if (s.percentage === 100 && s.totalClasses > 0) perfectCount++;
        if (s.percentage > topStudent.percentage) topStudent = s;
        if (s.percentage < bottomStudent.percentage) bottomStudent = s;
    });

    let health = "Healthy";
    let healthColor = "#10b981"; // green
    if (summary.classAverage < 75) {
        health = "Critical";
        healthColor = "#ef4444"; // red
    } else if (summary.classAverage < 85) {
        health = "At Risk";
        healthColor = "#f59e0b"; // yellow
    }

    summaryBlock.innerHTML = `
        <span style="display: block; margin-bottom: 8px;"><strong>Health Status:</strong> <span style="color: ${healthColor}; font-weight: bold;">${health}</span></span>
        <span style="display: block; margin-bottom: 8px;"><strong>Perfect Attendance:</strong> ${perfectCount} student(s) maintaining 100%.</span>
        <span style="display: block; margin-bottom: 8px;"><strong>Top Performer:</strong> ${topStudent ? topStudent.name : 'N/A'} (${topStudent ? topStudent.percentage.toFixed(2) : '0.00'}%)</span>
        <span style="display: block; margin-bottom: 8px;"><strong>Most Absent:</strong> ${bottomStudent ? bottomStudent.name : 'N/A'} (${bottomStudent ? bottomStudent.percentage.toFixed(2) : '0.00'}%)</span>
        <span style="display: block;"><strong>Total Sessions:</strong> ${classesConducted} distinct dates tracked.</span>
    `;

    updateChart(students);
}

// --- CORE APP LOGIC ---

async function refreshUI() {
    if (!state.runtimeReady) return;
    const students = await apiGetStudents();
    const records = await apiGetRecords();
    const summary = await apiGetSummary();

    renderStudentsTable(students);
    renderShortageTable(students);
    renderHistoryTable(records);
    updateDashboard(summary, students, records);
}

// --- EVENT HANDLERS ---

async function handleStudentSubmit(e) {
    e.preventDefault();
    if (!state.runtimeReady) return showToast("App initializing, please wait...", true);

    const regNo = Number(document.getElementById("student-regno").value);
    const name = document.getElementById("student-name").value.trim();
    
    const code = await apiAddStudent(regNo, name);
    if (code >= 0) {
        document.getElementById("student-form").reset();
        await refreshUI();
        showToast("Student added successfully.");
    } else {
        showToast("Error adding student. Code: " + code, true);
    }
}

async function handleAttendanceSubmit(e) {
    e.preventDefault();
    if (!state.runtimeReady) return showToast("App initializing, please wait...", true);

    const regNo = Number(document.getElementById("attendance-regno").value);
    const name = document.getElementById("attendance-name")?.value || '';
    const date = document.getElementById("attendance-date").value;
    const status = document.getElementById("attendance-status").value;

    const code = await apiMarkAttendance(regNo, name, date, status);
    if (code >= 0) {
        document.getElementById("attendance-form").reset();
        await refreshUI();
        showToast("Attendance marked.");
    } else {
        showToast("Error marking attendance. Code: " + code, true);
    }
}

function wireNavigation() {
    const navButtons = document.querySelectorAll(".nav-link");
    const pages = document.querySelectorAll(".page");

    navButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.page;
            navButtons.forEach(b => b.classList.remove("active"));
            pages.forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(target)?.classList.add("active");
        });
    });
}

// --- INITIALIZATION ---

document.addEventListener("DOMContentLoaded", () => {
    wireNavigation();

    document.getElementById("student-form")?.addEventListener("submit", handleStudentSubmit);
    document.getElementById("attendance-form")?.addEventListener("submit", handleAttendanceSubmit);

    // Refresh dashboard button
    document.getElementById("refresh-dashboard")?.addEventListener("click", async (e) => {
        if (!state.runtimeReady) return;
        const btn = e.target;
        btn.textContent = "Refreshing...";
        btn.style.opacity = "0.6";
        btn.style.cursor = "wait";

        await refreshUI();

        setTimeout(() => {
            btn.textContent = "Refresh Data";
            btn.style.opacity = "1";
            btn.style.cursor = "pointer";
            showToast("Dashboard refreshed successfully!");
        }, 400);
    });

    // Search Filter Logic
    document.getElementById("student-search")?.addEventListener("keyup", function() {
        const filter = this.value.toLowerCase();
        const rows = document.querySelectorAll("#students-table-body tr");
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(filter) ? "" : "none";
        });
    });

    // --- BATCH ATTENDANCE LISTENERS ---
    document.getElementById("load-batch-btn")?.addEventListener("click", async () => {
        const date = document.getElementById("batch-date").value;
        if (!date) return showToast("Please select a date first.", true);
        const students = await apiGetStudents();
        renderBatchTable(students);
        document.getElementById("save-batch-btn").style.display = students.length ? "inline-block" : "none";
    });

    document.getElementById("save-batch-btn")?.addEventListener("click", saveBatchAttendance);

    // --- EXPORT CSV LISTENER ---
    document.getElementById("export-csv-btn")?.addEventListener("click", exportToCSV);

    // --- BULK DELETE LISTENER ---
    document.getElementById("clear-date-btn")?.addEventListener("click", handleClearDate);
});

// --- GO ANALYTICS: CHART.JS ---
function updateChart(students) {
    const ctx = document.getElementById('attendance-chart')?.getContext('2d');
    if (!ctx || typeof Chart === 'undefined') return;

    const labels = students.map(s => s.name);
    const data = students.map(s => s.percentage);

    if (state.chart) {
        state.chart.data.labels = labels;
        state.chart.data.datasets[0].data = data;
        state.chart.update();
    } else {
        state.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Attendance %',
                    data: data,
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: value => value + "%" } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// --- CSV EXPORTER ---
async function exportToCSV() {
    const records = await apiGetRecords();
    if (!records.length) return showToast("No records to export.", true);

    let csvContent = "Date,Reg No,Name,Status\n";
    records.forEach(r => {
        csvContent += `${r.date},${r.regNo},"${r.name}",${r.status === 'P' ? 'Present' : 'Absent'}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_records_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("CSV exported successfully!");
}

// --- DYNAMIC SORTERS ---
function sortTable(tableBodyId, colIndex) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0 || rows[0].cells.length <= colIndex) return;

    const currentDir = state.sortDirection[tableBodyId + colIndex] || 'asc';
    const nextDir = currentDir === 'asc' ? 'desc' : 'asc';
    state.sortDirection[tableBodyId + colIndex] = nextDir;

    rows.sort((a, b) => {
        let valA = a.cells[colIndex].textContent.trim();
        let valB = b.cells[colIndex].textContent.trim();

        // Check if numeric
        if (colIndex === 0 || colIndex === 2) { 
            valA = parseFloat(valA.replace('%', '').split(' ')[0]) || 0;
            valB = parseFloat(valB.replace('%', '').split(' ')[0]) || 0;
            return nextDir === 'asc' ? valA - valB : valB - valA;
        }

        return nextDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
}

// --- BATCH RENDERING ---
function renderBatchTable(students) {
    const tbody = document.getElementById("batch-table-body");
    if (!tbody) return;

    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No students added yet.</td></tr>';
        return;
    }

    tbody.innerHTML = students.map((s) => `
        <tr>
            <td>${s.regNo}</td>
            <td>${s.name}</td>
            <td>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <label style="cursor: pointer;"><input type="radio" name="batch-status-${s.regNo}" value="P" checked> <span style="color: #16a34a; font-weight: bold;">P</span></label>
                    <label style="cursor: pointer;"><input type="radio" name="batch-status-${s.regNo}" value="A"> <span style="color: #dc2626; font-weight: bold;">A</span></label>
                </div>
            </td>
        </tr>
    `).join("");
}

async function saveBatchAttendance() {
    if (!state.runtimeReady) return;
    const date = document.getElementById("batch-date").value;
    if (!date) return showToast("Select date.", true);

    const students = await apiGetStudents();
    let count = 0;

    for (const s of students) {
        const radios = document.getElementsByName(`batch-status-${s.regNo}`);
        let status = 'P';
        for (const r of radios) {
            if (r.checked) status = r.value;
        }
        await apiMarkAttendance(s.regNo, s.name, date, status);
        count++;
    }

    if (count > 0) {
        showToast(`Saved attendance for ${count} student(s).`);
        await refreshUI();
        document.getElementById("batch-table-body").innerHTML = '<tr><td colspan="3" class="empty-state">Select a date and load members.</td></tr>';
        document.getElementById("save-batch-btn").style.display = "none";
    }
}

// Emscripten hook
var Module = Module || {};
Module.onRuntimeInitialized = async function() {
    initWasmWrappers();
    state.runtimeReady = true;
    // UI elements won't populate until directory is selected via overlay.
};

async function openProfileModal(regNo) {
    const students = await apiGetStudents();
    const records = await apiGetRecords();
    const student = students.find(s => s.regNo === regNo);
    if (!student) return;

    document.getElementById("profile-name").textContent = student.name;
    document.getElementById("profile-id").textContent = `Reg No: #${student.regNo}`;
    const total = student.totalClasses || 0;
    const attended = student.attendedClasses || 0;
    document.getElementById("profile-attended").textContent = `${attended}/${total}`;
    document.getElementById("profile-percent").textContent = `${student.percentage.toFixed(2)}%`;

    const absences = records.filter(r => r.regNo === regNo && r.status === 'A');
    const listDiv = document.getElementById("profile-absence-list");
    
    if (absences.length === 0) {
        listDiv.innerHTML = '<p style="color: #a1a1aa; font-style: italic; font-size: 14px; text-align: center; margin-top: 10px;">No absences recorded! 🎉</p>';
    } else {
        listDiv.innerHTML = absences.map(a => `
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #27272a; padding: 8px 0; font-size: 14px;">
                <span>📅 ${a.date}</span>
                <span style="color: #ef4444; font-weight: bold;">Absent</span>
            </div>
        `).join("");
    }

    const deleteBtn = document.getElementById("delete-student-modal-btn");
    if (deleteBtn) {
        const newBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newBtn, deleteBtn);
        newBtn.addEventListener("click", () => handleDeleteStudent(regNo));
    }

    document.getElementById("student-profile-modal").style.display = "flex";
}

function closeProfileModal() {
    document.getElementById("student-profile-modal").style.display = "none";
}

// --- DELETE HANDLERS ---
async function handleDeleteRecord(regNo, date) {
    if (!confirm(`Are you sure you want to delete the attendance record for student #${regNo} on ${date}?`)) return;
    
    const code = await apiDeleteRecord(regNo, date);
    if (code >= 0) {
        showToast("Record deleted successfully.");
        await refreshUI();
    } else {
        showToast("Error deleting record.", true);
    }
}

async function handleDeleteStudent(regNo) {
    if (!confirm(`Are you sure you want to delete student #${regNo} and ALL their attendance records? This action cannot be undone.`)) return;

    const code = await apiDeleteStudent(regNo);
    if (code >= 0) {
        showToast("Student deleted.");
        closeProfileModal();
        await refreshUI();
    } else {
        showToast("Error deleting student.", true);
    }
}

async function handleClearDate() {
    const date = document.getElementById("clear-date-input").value;
    if (!date) return showToast("Please select a date to clear.", true);

    if (!confirm(`Are you sure you want to delete ALL records for ${date}?`)) return;

    const count = await apiDeleteRecordsByDate(date);
    if (count > 0) {
        showToast(`Cleared ${count} record(s) for ${date}.`);
        await refreshUI();
    } else {
        showToast("No records found for that date.", true);
    }
}