/**
 * St. Joseph's University Academic Management System - Client Engine
 * ==================================================================
 * Multi-Role Client Engine (Admin Control Center & Student Self-Service Portal)
 */

// Global Application State
let state = {
  students: [],
  filteredStudents: [],
  analytics: null,
  activeTab: 'analytics',
  editingStudentId: null,
  theme: localStorage.getItem('sju_portal_theme') || 'light',
  loginRole: 'admin',
  currentAuth: JSON.parse(sessionStorage.getItem('sju_auth') || 'null')
};

// Chart.js Instances
let chartSubjectAvg = null;
let chartGradeDist = null;
let chartScatter = null;
let chartDeptGpa = null;

// Initialize Application on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initApp();
});

function initTheme() {
  document.body.setAttribute('data-theme', state.theme);
  updateThemeToggleIcon();
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('sju_portal_theme', state.theme);
  document.body.setAttribute('data-theme', state.theme);
  updateThemeToggleIcon();
  if (state.currentAuth && state.currentAuth.role === 'admin') {
    renderCharts();
  }
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  if (state.theme === 'dark') {
    btn.innerHTML = `<i class="fa-solid fa-sun" style="color: #fcd34d;"></i>`;
    btn.setAttribute('title', 'Switch to Formal Light Mode');
  } else {
    btn.innerHTML = `<i class="fa-solid fa-moon"></i>`;
    btn.setAttribute('title', 'Switch to Formal Dark Mode');
  }
}

/**
 * View Management Router
 */
function showView(viewId) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
  }
}

async function initApp() {
  if (!state.currentAuth) {
    showView('view-login');
    return;
  }

  if (state.currentAuth.role === 'admin') {
    showView('view-admin');
    await fetchAllAdminData();
    renderKPIs();
    renderCharts();
    renderStudentTable();
    renderAtRiskIntervention();
  } else if (state.currentAuth.role === 'student') {
    showView('view-student');
    await fetchStudentPortalData(state.currentAuth.student.id);
  }
}

/**
 * Login Role Switcher
 */
function switchLoginRole(role) {
  state.loginRole = role;
  const btnAdmin = document.getElementById('btn-role-admin');
  const btnStudent = document.getElementById('btn-role-student');
  const formAdmin = document.getElementById('form-login-admin');
  const formStudent = document.getElementById('form-login-student');

  if (role === 'admin') {
    btnAdmin.classList.add('active');
    btnStudent.classList.remove('active');
    formAdmin.classList.add('active');
    formStudent.classList.remove('active');
  } else {
    btnStudent.classList.add('active');
    btnAdmin.classList.remove('active');
    formStudent.classList.add('active');
    formAdmin.classList.remove('active');
  }
}

/**
 * Quick Demo Login Helper
 */
function quickDemoLogin(role, identifier) {
  switchLoginRole(role);
  if (role === 'admin') {
    document.getElementById('admin-username').value = identifier;
    document.getElementById('admin-password').value = 'admin123';
    document.getElementById('form-login-admin').requestSubmit();
  } else {
    document.getElementById('student-login-id').value = identifier;
    document.getElementById('student-password').value = 'student123';
    document.getElementById('form-login-student').requestSubmit();
  }
}

/**
 * Login Submission Handler
 */
async function handleLoginSubmit(event, role) {
  event.preventDefault();

  let payload = { role };
  if (role === 'admin') {
    payload.username = document.getElementById('admin-username').value.trim();
    payload.password = document.getElementById('admin-password').value.trim();
  } else {
    payload.student_id = document.getElementById('student-login-id').value.trim();
    payload.password = document.getElementById('student-password').value.trim();
  }

  // Try API Login Endpoint
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      state.currentAuth = data;
      sessionStorage.setItem('sju_auth', JSON.stringify(data));
      showToast(`Welcome back, ${data.role === 'admin' ? data.user.name : data.student.name}!`, 'success');
      await initApp();
      return;
    } else {
      const err = await res.json();
      showToast(err.error || 'Authentication failed', 'danger');
      return;
    }
  } catch (err) {
    console.warn('API authentication offline. Falling back to local verification.');
  }

  // Fallback Offline Verification
  if (role === 'admin') {
    if (payload.username.toLowerCase() === 'ganeshmoorthy' || payload.username.toLowerCase() === 'admin') {
      const authObj = {
        role: 'admin',
        user: { name: 'GANESHMOORTHY', role: 'System Administrator', email: 'admin@stjosephs.edu' }
      };
      state.currentAuth = authObj;
      sessionStorage.setItem('sju_auth', JSON.stringify(authObj));
      showToast('Welcome Administrator GANESHMOORTHY!', 'success');
      await initApp();
    } else {
      showToast('Invalid admin credentials', 'danger');
    }
  } else {
    // Local student lookup
    if (!state.students.length) loadFallbackData();
    const student = state.students.find(s => s.id.toLowerCase() === payload.student_id.toLowerCase());
    if (student) {
      const enriched = enrichStudentLocalDetails(student);
      const authObj = { role: 'student', student: enriched };
      state.currentAuth = authObj;
      sessionStorage.setItem('sju_auth', JSON.stringify(authObj));
      showToast(`Welcome to Student Portal, ${student.name}!`, 'success');
      await initApp();
    } else {
      showToast(`Student ID [${payload.student_id}] not found`, 'danger');
    }
  }
}

/**
 * Logout Handler
 */
function handleLogout() {
  sessionStorage.removeItem('sju_auth');
  state.currentAuth = null;
  showToast('Logged out of system successfully', 'info');
  showView('view-login');
}

/**
 * Data Fetching for Admin View
 */
async function fetchAllAdminData() {
  try {
    const [studentsRes, analyticsRes] = await Promise.all([
      fetch('/api/students'),
      fetch('/api/analytics')
    ]);

    if (studentsRes.ok && analyticsRes.ok) {
      const studentsData = await studentsRes.json();
      const analyticsData = await analyticsRes.json();
      state.students = studentsData.students || [];
      state.filteredStudents = [...state.students];
      state.analytics = analyticsData;
      return;
    }
  } catch (err) {
    console.warn('API backend offline. Using offline fallback.');
  }

  loadFallbackData();
}

function loadFallbackData() {
  const local = localStorage.getItem('sms_students_data');
  if (local) {
    state.students = JSON.parse(local);
  } else {
    state.students = [
      { id: "STU001", name: "Alex Johnson", email: "alex.j@stjosephs.edu", department: "Computer Science", grade_level: "Sophomore", attendance: 92.5, scores: { Mathematics: 88, Physics: 82, "Computer Science": 95, English: 78, History: 84 }, gpa: 3.65, status: "Good Standing" },
      { id: "STU002", name: "Sophia Martinez", email: "sophia.m@stjosephs.edu", department: "Data Science", grade_level: "Junior", attendance: 96.0, scores: { Mathematics: 94, Physics: 90, "Computer Science": 98, English: 88, History: 91 }, gpa: 3.92, status: "Honor Roll" },
      { id: "STU003", name: "Ethan Brown", email: "ethan.b@stjosephs.edu", department: "Electrical Engineering", grade_level: "Freshman", attendance: 68.0, scores: { Mathematics: 45, Physics: 48, "Computer Science": 70, English: 65, History: 60 }, gpa: 2.15, status: "At-Risk" },
      { id: "STU004", name: "Emma Wilson", email: "emma.w@stjosephs.edu", department: "Computer Science", grade_level: "Senior", attendance: 88.0, scores: { Mathematics: 76, Physics: 80, "Computer Science": 89, English: 92, History: 85 }, gpa: 3.44, status: "Good Standing" },
      { id: "STU005", name: "Liam Davis", email: "liam.d@stjosephs.edu", department: "Information Technology", grade_level: "Sophomore", attendance: 71.5, scores: { Mathematics: 64, Physics: 42, "Computer Science": 72, English: 68, History: 62 }, gpa: 2.38, status: "At-Risk" },
      { id: "STU006", name: "Olivia Taylor", email: "olivia.t@stjosephs.edu", department: "Data Science", grade_level: "Senior", attendance: 94.0, scores: { Mathematics: 92, Physics: 88, "Computer Science": 96, English: 90, History: 87 }, gpa: 3.81, status: "Honor Roll" },
      { id: "STU007", name: "Noah Anderson", email: "noah.a@stjosephs.edu", department: "Electrical Engineering", grade_level: "Junior", attendance: 85.5, scores: { Mathematics: 81, Physics: 85, "Computer Science": 78, English: 82, History: 79 }, gpa: 3.25, status: "Good Standing" },
      { id: "STU008", name: "Ava Thomas", email: "ava.t@stjosephs.edu", department: "Information Technology", grade_level: "Freshman", attendance: 91.0, scores: { Mathematics: 85, Physics: 79, "Computer Science": 88, English: 94, History: 90 }, gpa: 3.58, status: "Good Standing" },
      { id: "STU009", name: "Lucas White", email: "lucas.w@stjosephs.edu", department: "Computer Science", grade_level: "Junior", attendance: 62.0, scores: { Mathematics: 42, Physics: 45, "Computer Science": 68, English: 60, History: 58 }, gpa: 1.95, status: "At-Risk" },
      { id: "STU010", name: "Isabella Harris", email: "isabella.h@stjosephs.edu", department: "Data Science", grade_level: "Sophomore", attendance: 98.5, scores: { Mathematics: 96, Physics: 92, "Computer Science": 99, English: 95, History: 93 }, gpa: 3.98, status: "Honor Roll" }
    ];
    saveFallbackData();
  }
  state.filteredStudents = [...state.students];
  computeLocalAnalytics();
}

function saveFallbackData() {
  localStorage.setItem('sms_students_data', JSON.stringify(state.students));
}

function computeLocalAnalytics() {
  const total = state.students.length;
  if (total === 0) {
    state.analytics = { kpis: { total_students: 0, avg_gpa: 0, avg_attendance: 0, at_risk_count: 0 } };
    return;
  }

  const avgGpa = (state.students.reduce((acc, s) => acc + (s.gpa || 0), 0) / total).toFixed(2);
  const avgAtt = (state.students.reduce((acc, s) => acc + (s.attendance || 0), 0) / total).toFixed(1);
  const atRisk = state.students.filter(s => s.status === 'At-Risk' || s.gpa < 2.5 || s.attendance < 75);

  const subjectTotals = {};
  const subjectCounts = {};
  state.students.forEach(s => {
    Object.entries(s.scores || {}).forEach(([subj, score]) => {
      subjectTotals[subj] = (subjectTotals[subj] || 0) + score;
      subjectCounts[subj] = (subjectCounts[subj] || 0) + 1;
    });
  });
  const subjectAverages = {};
  Object.keys(subjectTotals).forEach(subj => {
    subjectAverages[subj] = +(subjectTotals[subj] / subjectCounts[subj]).toFixed(1);
  });

  const gpaDist = { "3.5 - 4.0 (A)": 0, "3.0 - 3.49 (B)": 0, "2.5 - 2.99 (C)": 0, "< 2.5 (D/F)": 0 };
  state.students.forEach(s => {
    const gpa = s.gpa || 0;
    if (gpa >= 3.5) gpaDist["3.5 - 4.0 (A)"]++;
    else if (gpa >= 3.0) gpaDist["3.0 - 3.49 (B)"]++;
    else if (gpa >= 2.5) gpaDist["2.5 - 2.99 (C)"]++;
    else gpaDist["< 2.5 (D/F)"]++;
  });

  const deptData = {};
  state.students.forEach(s => {
    const d = s.department || 'Other';
    if (!deptData[d]) deptData[d] = { count: 0, gpas: [] };
    deptData[d].count++;
    deptData[d].gpas.push(s.gpa || 0);
  });
  const deptAnalysis = {};
  Object.keys(deptData).forEach(d => {
    const avg = deptData[d].gpas.reduce((a, b) => a + b, 0) / deptData[d].count;
    deptAnalysis[d] = { student_count: deptData[d].count, avg_gpa: +avg.toFixed(2) };
  });

  state.analytics = {
    kpis: {
      total_students: total,
      avg_gpa: parseFloat(avgGpa),
      avg_attendance: parseFloat(avgAtt),
      at_risk_count: atRisk.length
    },
    subject_averages: subjectAverages,
    gpa_distribution: gpaDist,
    department_analysis: deptAnalysis,
    at_risk_students: atRisk,
    attendance_gpa_scatter: state.students.map(s => ({ x: s.attendance, y: s.gpa, name: s.name, status: s.status }))
  };
}

/**
 * Data Fetching for Student Self-Service Portal
 */
async function fetchStudentPortalData(studentId) {
  try {
    const res = await fetch(`/api/students/${studentId}`);
    if (res.ok) {
      const data = await res.json();
      renderStudentPortal(data.student);
      return;
    }
  } catch (err) {
    console.warn('API student fetch offline. Using local lookup.');
  }

  if (!state.students.length) loadFallbackData();
  const student = state.students.find(s => s.id.toLowerCase() === studentId.toLowerCase());
  if (student) {
    const enriched = enrichStudentLocalDetails(student);
    renderStudentPortal(enriched);
  }
}

function enrichStudentLocalDetails(student) {
  const res = { ...student };
  const scores = student.scores || {};
  const subject_marksheet = [];
  let arrear_count = 0;

  Object.entries(scores).forEach(([subject, score]) => {
    const isArrear = score < 50.0;
    if (isArrear) arrear_count++;
    let gradeLetter = 'F (Arrear)';
    if (score >= 90) gradeLetter = 'A+';
    else if (score >= 80) gradeLetter = 'A';
    else if (score >= 70) gradeLetter = 'B';
    else if (score >= 60) gradeLetter = 'C';
    else if (score >= 50) gradeLetter = 'D';

    subject_marksheet.push({
      subject,
      score,
      grade: gradeLetter,
      status: isArrear ? 'Arrear' : 'Passed'
    });
  });

  res.subject_marksheet = subject_marksheet;
  res.arrear_count = arrear_count;

  const achievements = [];
  if (student.gpa >= 3.75) achievements.push({ title: "Dean's List Honor Roll", description: "Earned a cumulative GPA of 3.75 or higher at St. Joseph's University", icon: "fa-award", certKey: "deans-list" });
  if (student.gpa >= 3.5)  achievements.push({ title: "Academic Excellence Certificate", description: "Maintained a cumulative GPA of 3.50 or higher across enrolled subjects", icon: "fa-medal", certKey: "academic-excellence" });
  if (student.attendance >= 100.0) achievements.push({ title: "100% Attendance Award", description: "Maintained a perfect 100% classroom attendance record", icon: "fa-calendar-check", certKey: "perfect-attendance" });
  if (arrear_count === 0) achievements.push({ title: "Clear Academic Standing", description: "Zero Standing Arrears / Backlogs — fully cleared academic record", icon: "fa-circle-check", certKey: "clear-standing" });

  res.achievements = achievements;
  return res;
}

/**
 * Render Student Self-Service Portal View
 */
function renderStudentPortal(student) {
  if (!student) return;

  const initials = student.name.split(' ').map(n => n[0]).join('').toUpperCase();
  document.getElementById('student-avatar-box').textContent = initials;
  document.getElementById('student-portal-name').textContent = student.name;
  document.getElementById('student-portal-id').textContent = `ID: ${student.id}`;

  document.getElementById('student-large-avatar').textContent = initials;
  document.getElementById('student-card-name').textContent = student.name;
  document.getElementById('student-card-dept').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${escapeHtml(student.department)}`;
  document.getElementById('student-card-level').innerHTML = `<i class="fa-solid fa-layer-group"></i> ${escapeHtml(student.grade_level)}`;
  document.getElementById('student-card-email').innerHTML = `<i class="fa-solid fa-envelope"></i> ${escapeHtml(student.email)}`;

  const statusBadge = document.getElementById('student-card-status-badge');
  let statusClass = 'status-good';
  if (student.status === 'Honor Roll') statusClass = 'status-honor';
  else if (student.status === 'At-Risk') statusClass = 'status-risk';
  statusBadge.className = `status-pill ${statusClass}`;
  statusBadge.innerHTML = `<span class="status-dot"></span> ${student.status}`;

  document.getElementById('student-kpi-gpa').textContent = student.gpa.toFixed(2);
  document.getElementById('student-kpi-attendance').textContent = `${student.attendance}%`;
  document.getElementById('student-kpi-arrears').textContent = student.arrear_count || 0;

  const arrearSubtext = document.getElementById('student-arrear-subtext');
  if (student.arrear_count > 0) {
    arrearSubtext.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i> ${student.arrear_count} Backlog(s) to Clear`;
  } else {
    arrearSubtext.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Clear Standing`;
  }

  // Marksheet Table
  const tbody = document.getElementById('student-marksheet-body');
  if (tbody) {
    const markList = student.subject_marksheet || [];
    tbody.innerHTML = markList.map(item => `
      <tr>
        <td><strong>${escapeHtml(item.subject)}</strong></td>
        <td><strong>${item.score}%</strong></td>
        <td><span class="gpa-badge">${item.grade}</span></td>
        <td>
          <span class="status-pill ${item.status === 'Arrear' ? 'status-arrear' : 'status-pass'}">
            <span class="status-dot"></span> ${item.status}
          </span>
        </td>
      </tr>
    `).join('');
  }

  // Achievements List — with View & Download certificate buttons
  const achContainer = document.getElementById('student-achievements-list');
  if (achContainer) {
    const list = student.achievements || [];
    if (!list.length) {
      achContainer.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); padding: 1rem;">No current honors listed. Keep up the academic effort!</p>`;
    } else {
      // Store student on state for use by certificate functions
      state._portalStudent = student;
      achContainer.innerHTML = list.map(item => `
        <div class="achievement-item">
          <div class="achievement-icon">
            <i class="fa-solid ${item.icon}"></i>
          </div>
          <div class="achievement-details">
            <h5>${escapeHtml(item.title)}</h5>
            <p>${escapeHtml(item.description)}</p>
            <div class="achievement-cert-actions">
              <button class="btn-cert-view" onclick="openCertificate('${item.certKey || getCertKeyFromTitle(item.title)}')">
                <i class="fa-solid fa-eye"></i> View Certificate
              </button>
              <button class="btn-cert-download" onclick="downloadCertificateDirect('${item.certKey || getCertKeyFromTitle(item.title)}')">
                <i class="fa-solid fa-download"></i> Download PDF
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }
  }
}

/**
 * Admin KPIs & Charts Rendering
 */
function renderKPIs() {
  if (!state.analytics || !state.analytics.kpis) return;
  const kpis = state.analytics.kpis;
  document.getElementById('kpi-total-students').textContent = kpis.total_students || 0;
  document.getElementById('kpi-avg-gpa').textContent = (kpis.avg_gpa || 0).toFixed(2);
  document.getElementById('kpi-avg-att').textContent = `${(kpis.avg_attendance || 0)}%`;
  document.getElementById('kpi-risk-count').textContent = kpis.at_risk_count || 0;
}

function renderCharts() {
  if (!state.analytics) return;

  const isDark = state.theme === 'dark';
  const textColor = isDark ? '#cbd5e1' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const chartFont = { family: 'Inter', size: 12 };

  const ctxSubj = document.getElementById('chartSubjectAvg').getContext('2d');
  const subjData = state.analytics.subject_averages || {};
  if (chartSubjectAvg) chartSubjectAvg.destroy();
  chartSubjectAvg = new Chart(ctxSubj, {
    type: 'bar',
    data: {
      labels: Object.keys(subjData),
      datasets: [{
        label: 'Average Score (%)',
        data: Object.values(subjData),
        backgroundColor: ['#1e40af', '#2563eb', '#0284c7', '#059669', '#d97706'],
        borderWidth: 0,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, ticks: { color: textColor, font: chartFont }, grid: { color: gridColor } },
        x: { ticks: { color: textColor, font: chartFont }, grid: { display: false } }
      }
    }
  });

  const ctxGrade = document.getElementById('chartGradeDist').getContext('2d');
  const gpaDist = state.analytics.gpa_distribution || {};
  if (chartGradeDist) chartGradeDist.destroy();
  chartGradeDist = new Chart(ctxGrade, {
    type: 'doughnut',
    data: {
      labels: Object.keys(gpaDist),
      datasets: [{
        data: Object.values(gpaDist),
        backgroundColor: ['#15803d', '#2563eb', '#b45309', '#b91c1c'],
        borderWidth: 2,
        borderColor: isDark ? '#1e293b' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor, font: chartFont } } }
    }
  });

  const ctxScatter = document.getElementById('chartScatter').getContext('2d');
  const scatterData = state.analytics.attendance_gpa_scatter || [];
  if (chartScatter) chartScatter.destroy();
  chartScatter = new Chart(ctxScatter, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Students',
        data: scatterData,
        backgroundColor: scatterData.map(d => d.y < 2.5 || d.x < 75 ? '#b91c1c' : '#1e40af'),
        pointRadius: 6,
        pointHoverRadius: 9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: (ctx) => `${ctx.raw.name}: ${ctx.raw.x}% Attnd, CGPA ${ctx.raw.y}` } },
        legend: { display: false }
      },
      scales: {
        x: { title: { display: true, text: 'Attendance Rate (%)', color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } },
        y: { title: { display: true, text: 'CGPA (4.0 Scale)', color: textColor }, min: 0, max: 4.0, ticks: { color: textColor }, grid: { color: gridColor } }
      }
    }
  });

  const ctxDept = document.getElementById('chartDeptGpa').getContext('2d');
  const deptMap = state.analytics.department_analysis || {};
  if (chartDeptGpa) chartDeptGpa.destroy();
  chartDeptGpa = new Chart(ctxDept, {
    type: 'bar',
    data: {
      labels: Object.keys(deptMap),
      datasets: [{
        label: 'Average CGPA',
        data: Object.values(deptMap).map(d => d.avg_gpa),
        backgroundColor: '#0284c7',
        borderWidth: 0,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 4.0, ticks: { color: textColor }, grid: { color: gridColor } },
        x: { ticks: { color: textColor }, grid: { display: false } }
      }
    }
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
  if (activeBtn) activeBtn.classList.add('active');

  const activeTabContent = document.getElementById(`tab-${tabId}`);
  if (activeTabContent) activeTabContent.classList.add('active');

  if (tabId === 'analytics') {
    setTimeout(renderCharts, 100);
  }
}

function renderStudentTable() {
  const tbody = document.getElementById('student-table-body');
  const countLabel = document.getElementById('table-record-count');
  if (!tbody) return;

  if (countLabel) {
    countLabel.textContent = `Showing ${state.filteredStudents.length} of ${state.students.length} student records`;
  }

  if (state.filteredStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">No student records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.filteredStudents.map(student => {
    let statusPillClass = 'status-good';
    let statusText = 'Good Standing';

    if (student.status === 'Honor Roll') {
      statusPillClass = 'status-honor';
      statusText = 'Honor Roll';
    } else if (student.status === 'At-Risk') {
      statusPillClass = 'status-risk';
      statusText = 'At-Risk';
    }

    let attFillClass = 'medium';
    if (student.attendance >= 90) attFillClass = 'high';
    else if (student.attendance < 75) attFillClass = 'low';

    return `
      <tr>
        <td class="student-id-cell">${student.id}</td>
        <td>
          <div class="student-info-cell">
            <span class="student-name-text">${escapeHtml(student.name)}</span>
            <span class="student-email-text">${escapeHtml(student.email)}</span>
          </div>
        </td>
        <td>${escapeHtml(student.department)}</td>
        <td>${escapeHtml(student.grade_level)}</td>
        <td>
          <div class="attendance-cell">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill ${attFillClass}" style="width: ${Math.min(student.attendance, 100)}%;"></div>
            </div>
            <span><strong>${student.attendance}%</strong></span>
          </div>
        </td>
        <td><span class="gpa-badge">${student.gpa.toFixed(2)}</span></td>
        <td>
          <span class="status-pill ${statusPillClass}">
            <span class="status-dot"></span> ${statusText}
          </span>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal('${student.id}')" title="Edit Student">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="handleDeleteStudent('${student.id}')" title="Delete Student">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function handleSearchFilter() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  const dept = document.getElementById('filter-dept').value;
  const level = document.getElementById('filter-level').value;
  const status = document.getElementById('filter-status').value;

  state.filteredStudents = state.students.filter(student => {
    if (q) {
      const matchName = student.name.toLowerCase().includes(q);
      const matchId = student.id.toLowerCase().includes(q);
      const matchEmail = student.email.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchEmail) return false;
    }
    if (dept && student.department !== dept) return false;
    if (level && student.grade_level !== level) return false;
    if (status && student.status !== status) return false;
    return true;
  });

  renderStudentTable();
}

function resetFilters() {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-dept').value = '';
  document.getElementById('filter-level').value = '';
  document.getElementById('filter-status').value = '';
  state.filteredStudents = [...state.students];
  renderStudentTable();
  showToast('Search filters cleared', 'info');
}

function renderAtRiskIntervention() {
  const container = document.getElementById('at-risk-container');
  if (!container) return;

  const atRisk = state.students.filter(s => s.status === 'At-Risk' || s.gpa < 2.5 || s.attendance < 75);

  if (atRisk.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3.5rem 1.5rem; color: var(--success-text);">
        <i class="fa-solid fa-circle-check" style="font-size: 2.8rem; margin-bottom: 0.75rem; color: var(--success);"></i>
        <h4 style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 700;">Zero At-Risk Alerts Flagged</h4>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">All active students currently meet academic GPA and attendance thresholds.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Student ID</th>
          <th>Student Name & Department</th>
          <th>Current CGPA</th>
          <th>Attendance Rate</th>
          <th>Risk Diagnostic Reason</th>
          <th style="text-align: right;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${atRisk.map(s => {
          const reasons = [];
          if (s.gpa < 2.5) reasons.push(`CGPA Warning (${s.gpa.toFixed(2)})`);
          if (s.attendance < 75) reasons.push(`Low Attendance (${s.attendance}%)`);
          return `
            <tr>
              <td class="student-id-cell">${s.id}</td>
              <td>
                <div class="student-info-cell">
                  <span class="student-name-text">${escapeHtml(s.name)}</span>
                  <span class="student-email-text">${escapeHtml(s.department)} &bull; ${escapeHtml(s.grade_level)}</span>
                </div>
              </td>
              <td><span style="color: var(--danger); font-weight: 700;">${s.gpa.toFixed(2)}</span></td>
              <td><span style="color: var(--danger); font-weight: 700;">${s.attendance}%</span></td>
              <td>
                <span class="status-pill status-risk">
                  <span class="status-dot"></span> ${reasons.join(' & ') || 'Academic Warning'}
                </span>
              </td>
              <td style="text-align: right;">
                <button class="btn btn-primary btn-sm" onclick="openEditStudentModal('${s.id}')">
                  <i class="fa-solid fa-user-pen"></i> Update Grades
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function openAddStudentModal() {
  state.editingStudentId = null;
  document.getElementById('modal-title').textContent = 'Add New Student Record';
  document.getElementById('student-form').reset();
  document.getElementById('student-modal').classList.add('active');
}

function openEditStudentModal(id) {
  const student = state.students.find(s => s.id === id);
  if (!student) return;

  state.editingStudentId = id;
  document.getElementById('modal-title').textContent = `Edit Student Record (${id})`;

  document.getElementById('form-name').value = student.name;
  document.getElementById('form-email').value = student.email;
  document.getElementById('form-department').value = student.department;
  document.getElementById('form-grade-level').value = student.grade_level;
  document.getElementById('form-attendance').value = student.attendance;

  const scores = student.scores || {};
  document.getElementById('score-math').value = scores.Mathematics || 75;
  document.getElementById('score-physics').value = scores.Physics || 75;
  document.getElementById('score-cs').value = scores['Computer Science'] || 75;
  document.getElementById('score-english').value = scores.English || 75;
  document.getElementById('score-history').value = scores.History || 75;

  document.getElementById('student-modal').classList.add('active');
}

function closeStudentModal() {
  document.getElementById('student-modal').classList.remove('active');
}

async function handleSaveStudent(event) {
  event.preventDefault();

  const name = document.getElementById('form-name').value.trim();
  const email = document.getElementById('form-email').value.trim();
  const department = document.getElementById('form-department').value;
  const grade_level = document.getElementById('form-grade-level').value;
  const attendance = parseFloat(document.getElementById('form-attendance').value);

  const scores = {
    "Mathematics": parseFloat(document.getElementById('score-math').value),
    "Physics": parseFloat(document.getElementById('score-physics').value),
    "Computer Science": parseFloat(document.getElementById('score-cs').value),
    "English": parseFloat(document.getElementById('score-english').value),
    "History": parseFloat(document.getElementById('score-history').value)
  };

  const payload = { name, email, department, grade_level, attendance, scores };

  try {
    const isEdit = !!state.editingStudentId;
    const url = isEdit ? `/api/students/${state.editingStudentId}` : '/api/students';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast(isEdit ? 'Student record updated successfully!' : 'New student record created!', 'success');
      closeStudentModal();
      await fetchAllAdminData();
      renderKPIs();
      renderCharts();
      renderStudentTable();
      renderAtRiskIntervention();
      return;
    }
  } catch (err) {
    console.warn('API save unavailable. Saving locally.');
  }

  const gpa = calculateLocalGPA(scores);
  const status = determineLocalStatus(gpa, attendance);

  if (state.editingStudentId) {
    const idx = state.students.findIndex(s => s.id === state.editingStudentId);
    if (idx !== -1) {
      state.students[idx] = { ...state.students[idx], ...payload, gpa, status };
    }
    showToast('Student record updated locally!', 'info');
  } else {
    const nextNum = state.students.length + 1;
    const id = `STU${String(nextNum).padStart(3, '0')}`;
    state.students.push({ id, ...payload, gpa, status });
    showToast('New student record added locally!', 'success');
  }

  saveFallbackData();
  closeStudentModal();
  state.filteredStudents = [...state.students];
  computeLocalAnalytics();
  renderKPIs();
  renderCharts();
  renderStudentTable();
  renderAtRiskIntervention();
}

async function handleDeleteStudent(id) {
  if (!confirm(`Are you sure you want to delete student record [${id}]?`)) return;

  try {
    const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast(`Student record ${id} removed successfully`, 'danger');
      await fetchAllAdminData();
      renderKPIs();
      renderCharts();
      renderStudentTable();
      renderAtRiskIntervention();
      return;
    }
  } catch (err) {
    console.warn('API delete unavailable. Removing locally.');
  }

  state.students = state.students.filter(s => s.id !== id);
  saveFallbackData();
  handleSearchFilter();
  computeLocalAnalytics();
  renderKPIs();
  renderCharts();
  renderAtRiskIntervention();
  showToast(`Student record ${id} removed locally`, 'info');
}

function calculateLocalGPA(scores) {
  const vals = Object.values(scores);
  if (!vals.length) return 0.0;
  const pts = vals.map(s => {
    if (s >= 90) return 4.0;
    if (s >= 80) return 3.0 + (s - 80) * 0.09;
    if (s >= 70) return 2.0 + (s - 70) * 0.09;
    if (s >= 60) return 1.0 + (s - 60) * 0.09;
    return (s / 60) * 1.0;
  });
  return parseFloat((pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(2));
}

function determineLocalStatus(gpa, attendance) {
  if (gpa < 2.5 || attendance < 75) return 'At-Risk';
  if (gpa >= 3.75 && attendance >= 90) return 'Honor Roll';
  return 'Good Standing';
}

function exportDataCSV() {
  if (!state.students.length) {
    showToast('No student records available for export', 'warning');
    return;
  }

  const headers = ['ID', 'Name', 'Email', 'Department', 'Grade Level', 'Attendance %', 'GPA', 'Status'];
  const rows = state.students.map(s => [
    s.id,
    `"${s.name}"`,
    `"${s.email}"`,
    `"${s.department}"`,
    `"${s.grade_level}"`,
    s.attendance,
    s.gpa,
    `"${s.status}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `St_Josephs_University_Student_Report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Official CSV Student Report Generated!', 'success');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'danger') icon = 'fa-circle-exclamation';
  if (type === 'warning') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* ============================================================
   CERTIFICATE SYSTEM
   ============================================================ */

// Define each certificate type's content, theme, and icon
const CERT_CONFIG = {
  'deans-list': {
    label:      "Dean's List Honor Roll",
    typeLabel:  "Certificate of Academic Distinction",
    icon:       'fa-award',
    theme:      'cert-theme-gold',
    medalIcon:  'fa-award',
    description: `has been honored with the <strong>Dean's List Honor Roll</strong> distinction
      for achieving a cumulative GPA of at least 3.75 at St. Joseph's University.
      This recognition is awarded to students who demonstrate outstanding intellectual achievement,
      exceptional commitment to academic excellence, and exemplary conduct throughout the academic year.
      <br><br>
      Organized by the Office of the Registrar &amp; Academic Affairs, St. Joseph's University
      in recognition of outstanding academic merit.`
  },
  'academic-excellence': {
    label:      'Academic Excellence Certificate',
    typeLabel:  'Certificate of Academic Excellence',
    icon:       'fa-medal',
    theme:      'cert-theme-blue',
    medalIcon:  'fa-medal',
    description: `has successfully maintained a <strong>Cumulative GPA of 3.50 or higher</strong>
      across all enrolled subjects and has demonstrated consistent academic performance
      throughout the enrollment period at St. Joseph's University.
      <br><br>
      This certificate is conferred by the Department of Academic Affairs as an official
      acknowledgement of scholarly dedication, persistence, and high academic attainment
      during the current academic year.`
  },
  'perfect-attendance': {
    label:      '100% Attendance Award',
    typeLabel:  'Certificate of Perfect Attendance',
    icon:       'fa-calendar-check',
    theme:      'cert-theme-green',
    medalIcon:  'fa-calendar-check',
    description: `has achieved a <strong>perfect 100% attendance rate</strong>, demonstrating
      exemplary dedication, punctuality, and commitment to every scheduled academic session
      at St. Joseph's University throughout the academic year.
      <br><br>
      This award is presented by the Department of Student Affairs in recognition
      of outstanding class presence and academic responsibility.`
  },
  'clear-standing': {
    label:      'Clear Academic Standing',
    typeLabel:  'Certificate of Clear Academic Standing',
    icon:       'fa-circle-check',
    theme:      'cert-theme-purple',
    medalIcon:  'fa-circle-check',
    description: `has maintained a <strong>Clear Academic Standing</strong> with zero arrears or backlogs
      across all enrolled subjects, fulfilling all academic requirements set by the University
      curriculum and examination board.
      <br><br>
      This certificate is issued by the Office of the Registrar, St. Joseph's University,
      confirming full academic clearance and compliance for the current academic year.`
  }
};

// Map achievement title → cert key
function getCertKeyFromTitle(title) {
  if (title.toLowerCase().includes("dean")) return 'deans-list';
  if (title.toLowerCase().includes("excellence")) return 'academic-excellence';
  if (title.toLowerCase().includes("attendance")) return 'perfect-attendance';
  if (title.toLowerCase().includes("clear")) return 'clear-standing';
  return null;
}

// Enrich achievements with certKey so buttons can reference it
function enrichAchievementKeys(achievements) {
  return (achievements || []).map(a => ({
    ...a,
    certKey: getCertKeyFromTitle(a.title) || 'academic-excellence'
  }));
}

// Populate the certificate modal with student's data and open it
function openCertificate(certKey) {
  const student = state._portalStudent;
  if (!student) return;

  const config = CERT_CONFIG[certKey];
  if (!config) return;

  // Set modal label
  document.getElementById('cert-modal-label').textContent = config.label;

  // Certificate type heading
  document.getElementById('cert-type-label').textContent = config.typeLabel;

  // Student info
  document.getElementById('cert-student-name').textContent = student.name;
  document.getElementById('cert-student-id-line').textContent =
    `${student.id}  ·  ${student.department}  ·  ${student.grade_level}`;

  // Description (allow HTML in the cert body)
  document.getElementById('cert-description').innerHTML = config.description;

  // Medal icon
  document.getElementById('cert-medal-icon').innerHTML =
    `<i class="fa-solid ${config.medalIcon}"></i>`;

  // Issue info
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('cert-issue-info').textContent = `Issued: ${dateStr}  |  Ref: SJU/${student.id}/${certKey.toUpperCase()}`;
  const academicYearStart = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const semester = today.getMonth() >= 6 ? 'Fall' : 'Spring';
  document.getElementById('cert-academic-term').textContent = `Academic Year ${academicYearStart}–${academicYearStart + 1} • ${semester} Semester`;

  // Theme class
  const paper = document.getElementById('certificate-canvas');
  paper.className = 'certificate-paper';
  paper.classList.add(config.theme);

  // Store active cert key for download
  state._activeCertKey = certKey;

  // Open the modal
  document.getElementById('certificate-modal').classList.add('active');
}

function closeCertificateModal(event) {
  // Close only if clicking the overlay backdrop (not the wrapper)
  if (event && event.target !== document.getElementById('certificate-modal')) return;
  document.getElementById('certificate-modal').classList.remove('active');
}

// Download PDF using html2canvas + jsPDF
async function downloadActiveCertificate() {
  await _exportCertPDF(state._activeCertKey || 'academic-excellence');
}

async function downloadCertificateDirect(certKey) {
  // Open first so the certificate is populated, then download
  openCertificate(certKey);
  // Small delay to allow render
  await new Promise(r => setTimeout(r, 350));
  await _exportCertPDF(certKey);
}

async function _exportCertPDF(certKey) {
  const student = state._portalStudent;
  const config  = CERT_CONFIG[certKey];
  if (!student || !config) return;

  showToast('Generating certificate PDF...', 'info');

  try {
    const paper = document.getElementById('certificate-canvas');

    // Temporarily force white bg for capture
    const prevBg = paper.style.background;
    paper.style.background = '#ffffff';

    const canvas = await html2canvas(paper, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    paper.style.background = prevBg;

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;

    // Landscape A4
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);

    const filename = `SJU_${student.id}_${certKey}_Certificate.pdf`;
    pdf.save(filename);

    showToast(`Certificate downloaded: ${filename}`, 'success');
  } catch (err) {
    console.error('Certificate PDF export failed:', err);
    showToast('PDF export failed. Try again.', 'danger');
  }
}
