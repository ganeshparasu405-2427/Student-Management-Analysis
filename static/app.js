/**
 * St. Joseph's College of Engineering Academic Management System - Client Engine
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

const DEPARTMENT_SUBJECTS = {
  'Computer Science & Engineering': [
    'Data Structures & Algorithms', 'Computer Architecture', 'Operating Systems', 'Database Management Systems',
    'Software Engineering', 'Artificial Intelligence', 'Data Structures Lab', 'Object-Oriented Programming Lab',
    'DBMS Lab', 'Operating Systems Lab'
  ],
  'Information Technology': [
    'Discrete Mathematics', 'Web Technologies', 'Computer Networks', 'Cloud Computing', 'Database Management Systems',
    'Software Engineering', 'Web Technologies Lab', 'Computer Networks Lab', 'Cloud Computing Lab', 'IT Project Lab'
  ],
  'Data Science': [
    'Probability and Statistics', 'Linear Algebra', 'Programming for Data Science', 'Data Structures for Data Science',
    'Data Management Systems', 'Data Visualization', 'Machine Learning', 'Data Mining', 'Big Data Analytics', 'Data Science Project'
  ],
  'Electronics & Communication Engineering': [
    'Electronic Circuits', 'Digital Logic Design', 'VLSI Design', 'Signal Processing', 'Communication Systems',
    'Microprocessors & Microcontrollers', 'Electronic Devices Lab', 'Digital Signal Processing Lab', 'Communication Lab', 'VLSI Lab'
  ],
  'Electrical & Electronics Engineering': [
    'Electric Circuits', 'Electrical Machines', 'Power Electronics', 'Control Systems', 'Power Systems',
    'Electrical Measurements', 'Electrical Machines Lab', 'Power Electronics Lab', 'Simulation Lab', 'Measurements Lab'
  ],
  'Civil Engineering': [
    'Mechanics of Solids', 'Structural Analysis', 'Environmental Engineering', 'Surveying', 'Construction Materials',
    'Geotechnical Engineering', 'Surveying Lab', 'Materials Testing Lab', 'Hydraulics Lab', 'Concrete Lab'
  ],
  'Mechanical Engineering': [
    'Thermodynamics', 'Engineering Mechanics', 'Machine Dynamics', 'Manufacturing Technology', 'CAD/CAM',
    'Fluid Mechanics', 'Thermal Engineering Lab', 'Manufacturing Lab', 'CAD Lab', 'Design Lab'
  ],
  'Chemical Engineering': [
    'Process Calculations', 'Chemical Engineering Thermodynamics', 'Mass Transfer', 'Heat Transfer',
    'Chemical Reaction Engineering', 'Fluid Mechanics', 'Process Equipment Lab', 'Chemical Engineering Lab', 'Heat Transfer Lab', 'Mass Transfer Lab'
  ],
  'Biotechnology': [
    'Cell Biology', 'Biochemistry', 'Molecular Biology', 'Microbiology', 'Bioprocess Engineering',
    'Genetic Engineering', 'Cell Biology Lab', 'Biochemistry Lab', 'Microbiology Lab', 'Bioprocess Lab'
  ],
  'Master of Business Administration': [
    'Principles of Management', 'Financial Accounting', 'Marketing Management', 'Human Resource Management',
    'Strategic Management', 'Business Analytics', 'Operations Management', 'Internship', 'Business Project', 'Leadership Lab'
  ]
};

function formatCgpa(value) {
  const number = Number(value || 0);
  return `${number.toFixed(2)} / 10.00`;
}

function getDepartmentSubjects(dept) {
  const normalized = String(dept || 'Computer Science & Engineering').trim();
  if (DEPARTMENT_SUBJECTS[normalized]) return DEPARTMENT_SUBJECTS[normalized];
  const directMatch = Object.keys(DEPARTMENT_SUBJECTS).find(key => key.toLowerCase() === normalized.toLowerCase());
  if (directMatch) return DEPARTMENT_SUBJECTS[directMatch];
  return DEPARTMENT_SUBJECTS['Computer Science & Engineering'];
}

function calculateLocalCGPA(scores) {
  const entries = Object.entries(scores || {});
  if (!entries.length) return 0.0;
  const avg = entries.reduce((sum, [, val]) => sum + Number(val || 0), 0) / entries.length;
  return parseFloat((avg / 10.0).toFixed(2));
}

function determineLocalStatus(gpa, attendance) {
  if (gpa < 5.0 || attendance < 75) return 'At-Risk';
  if (gpa >= 8.5 && attendance >= 90) return 'Honor Roll';
  return 'Good Standing';
}

function generateStudentQRCodeUrl(studentId) {
  const profileUrl = new URL('/student-verify.html', window.location.origin);
  profileUrl.searchParams.set('id', studentId || 'STU000');
  return generateQRCodeUrl(profileUrl.toString());
}

function generateQRCodeUrl(data) {
  const qrUrl = new URL('/api/qr.png', window.location.origin);
  qrUrl.searchParams.set('data', data);
  return qrUrl.toString();
}

// Chart.js Instances
let chartSubjectAvg = null;
let chartGradeDist = null;
let chartScatter = null;
let chartDeptGpa = null;
let chartSemesterProgress = null;
let assignmentReminderInterval = null;

// Initialize Application on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  initStudentNavigation();
  initTheme();
  initApp();
});

function initStudentNavigation() {
  const links = document.querySelectorAll('.student-header-nav a, .student-mobile-tabs a');
  const syncActiveLink = (hash = window.location.hash || '#student-overview') => {
    links.forEach(link => link.classList.toggle('active', link.hash === hash));
  };
  links.forEach(link => link.addEventListener('click', () => syncActiveLink(link.hash)));
  window.addEventListener('hashchange', () => syncActiveLink());
  syncActiveLink();
}

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
    renderAdminProfile();
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

function renderAdminProfile() {
  if (!state.currentAuth || state.currentAuth.role !== 'admin') return;
  const savedProfile = JSON.parse(localStorage.getItem('sju_admin_profile') || '{}');
  const user = state.currentAuth.user || {};
  const profile = {
    name: savedProfile.name || user.name || 'Administrator',
    email: savedProfile.email || user.email || ''
  };
  const nameElement = document.getElementById('admin-display-name');
  const avatarElement = document.getElementById('admin-avatar-box');
  if (nameElement) nameElement.textContent = profile.name;
  if (avatarElement) avatarElement.textContent = profile.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function openProfileModal(role) {
  if (!state.currentAuth || state.currentAuth.role !== role) return;
  const nameInput = document.getElementById('profile-name');
  const emailInput = document.getElementById('profile-email');
  const note = document.getElementById('profile-id-note');
  const isStudent = role === 'student';
  const profile = isStudent ? state._portalStudent : JSON.parse(localStorage.getItem('sju_admin_profile') || '{}');
  const user = isStudent ? profile : { ...(state.currentAuth.user || {}), ...profile };
  if (!user) return;

  document.getElementById('profile-modal-title').textContent = isStudent ? 'Edit Student Profile' : 'Edit Administrator Profile';
  nameInput.value = user.name || '';
  emailInput.value = user.email || '';
  note.textContent = isStudent ? `Student ID: ${user.id}` : 'Administrator profile is saved in this browser.';
  note.hidden = false;
  document.getElementById('profile-modal').classList.add('active');
}

function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('active');
}

async function handleProfileSave(event) {
  event.preventDefault();
  const name = document.getElementById('profile-name').value.trim();
  const email = document.getElementById('profile-email').value.trim();
  if (!name || !email) return;

  if (state.currentAuth.role === 'admin') {
    const profile = { name, email };
    localStorage.setItem('sju_admin_profile', JSON.stringify(profile));
    state.currentAuth.user = { ...state.currentAuth.user, ...profile };
    sessionStorage.setItem('sju_auth', JSON.stringify(state.currentAuth));
    renderAdminProfile();
    closeProfileModal();
    showToast('Administrator profile saved in this browser.', 'success');
    return;
  }

  const student = state._portalStudent;
  if (!student) return;
  try {
    const response = await fetch(`/api/students/${encodeURIComponent(student.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Profile could not be saved.');
    }
    closeProfileModal();
    await fetchStudentPortalData(student.id);
    showToast('Student profile updated.', 'success');
  } catch (error) {
    showToast(error.message || 'Profile could not be saved.', 'danger');
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
      { id: 'STU001', name: 'Alex Johnson', email: 'alex.j@stjosephs.edu', department: 'Computer Science & Engineering', grade_level: 'Sophomore', attendance: 92.5, scores: { 'Data Structures & Algorithms': 88, 'Operating Systems': 82, 'Database Management Systems': 95, 'Software Engineering': 78, 'Artificial Intelligence': 84 }, gpa: 8.53, status: 'Good Standing', qr_code: generateStudentQRCodeUrl('STU001') },
      { id: 'STU002', name: 'Sophia Martinez', email: 'sophia.m@stjosephs.edu', department: 'Information Technology', grade_level: 'Junior', attendance: 96.0, scores: { 'Discrete Mathematics': 94, 'Web Technologies': 90, 'Computer Networks': 98, 'Cloud Computing': 88, 'Database Management Systems': 91 }, gpa: 9.20, status: 'Honor Roll', qr_code: generateStudentQRCodeUrl('STU002') },
      { id: 'STU003', name: 'Ethan Brown', email: 'ethan.b@stjosephs.edu', department: 'Electrical & Electronics Engineering', grade_level: 'Freshman', attendance: 68.0, scores: { 'Electric Circuits': 45, 'Electrical Machines': 48, 'Power Electronics': 70, 'Control Systems': 65, 'Power Systems': 60 }, gpa: 5.76, status: 'At-Risk', qr_code: generateStudentQRCodeUrl('STU003') },
      { id: 'STU004', name: 'Emma Wilson', email: 'emma.w@stjosephs.edu', department: 'Computer Science & Engineering', grade_level: 'Senior', attendance: 88.0, scores: { 'Data Structures & Algorithms': 76, 'Operating Systems': 80, 'Database Management Systems': 89, 'Software Engineering': 92, 'Artificial Intelligence': 85 }, gpa: 8.44, status: 'Good Standing', qr_code: generateStudentQRCodeUrl('STU004') },
      { id: 'STU005', name: 'Liam Davis', email: 'liam.d@stjosephs.edu', department: 'Information Technology', grade_level: 'Sophomore', attendance: 71.5, scores: { 'Discrete Mathematics': 64, 'Web Technologies': 42, 'Computer Networks': 72, 'Cloud Computing': 68, 'Database Management Systems': 62 }, gpa: 6.16, status: 'At-Risk', qr_code: generateStudentQRCodeUrl('STU005') },
      { id: 'STU006', name: 'Olivia Taylor', email: 'olivia.t@stjosephs.edu', department: 'Civil Engineering', grade_level: 'Senior', attendance: 94.0, scores: { 'Mechanics of Solids': 92, 'Structural Analysis': 88, 'Environmental Engineering': 96, 'Surveying': 90, 'Geotechnical Engineering': 87 }, gpa: 9.06, status: 'Honor Roll', qr_code: generateStudentQRCodeUrl('STU006') },
      { id: 'STU007', name: 'Noah Anderson', email: 'noah.a@stjosephs.edu', department: 'Mechanical Engineering', grade_level: 'Junior', attendance: 85.5, scores: { 'Thermodynamics': 81, 'Engineering Mechanics': 85, 'Machine Dynamics': 78, 'Manufacturing Technology': 82, 'Fluid Mechanics': 79 }, gpa: 8.10, status: 'Good Standing', qr_code: generateStudentQRCodeUrl('STU007') },
      { id: 'STU008', name: 'Ava Thomas', email: 'ava.t@stjosephs.edu', department: 'Biotechnology', grade_level: 'Freshman', attendance: 91.0, scores: { 'Cell Biology': 85, 'Biochemistry': 79, 'Molecular Biology': 88, 'Microbiology': 94, 'Genetic Engineering': 90 }, gpa: 8.72, status: 'Good Standing', qr_code: generateStudentQRCodeUrl('STU008') },
      { id: 'STU009', name: 'Lucas White', email: 'lucas.w@stjosephs.edu', department: 'Computer Science & Engineering', grade_level: 'Junior', attendance: 62.0, scores: { 'Data Structures & Algorithms': 42, 'Operating Systems': 45, 'Database Management Systems': 68, 'Software Engineering': 60, 'Artificial Intelligence': 58 }, gpa: 5.42, status: 'At-Risk', qr_code: generateStudentQRCodeUrl('STU009') },
      { id: 'STU010', name: 'Isabella Harris', email: 'isabella.h@stjosephs.edu', department: 'Master of Business Administration', grade_level: 'Sophomore', attendance: 98.5, scores: { 'Principles of Management': 96, 'Financial Accounting': 92, 'Marketing Management': 99, 'Strategic Management': 95, 'Business Analytics': 93 }, gpa: 9.50, status: 'Honor Roll', qr_code: generateStudentQRCodeUrl('STU010') }
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

  const gpaDist = { "8.5 - 10.0 (Honor Roll)": 0, "7.0 - 8.49 (Strong)": 0, "5.0 - 6.99 (Developing)": 0, "< 5.0 (At-Risk)": 0 };
  state.students.forEach(s => {
    const gpa = s.gpa || 0;
    if (gpa >= 8.5) gpaDist["8.5 - 10.0 (Honor Roll)"]++;
    else if (gpa >= 7.0) gpaDist["7.0 - 8.49 (Strong)"]++;
    else if (gpa >= 5.0) gpaDist["5.0 - 6.99 (Developing)"]++;
    else gpaDist["< 5.0 (At-Risk)"]++;
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
  if (student.gpa >= 8.5) achievements.push({ title: "Dean's List Honor Roll", description: "Earned a cumulative CGPA of 8.50 or higher at St. Joseph's College of Engineering", icon: "fa-award", certKey: "deans-list" });
  if (student.gpa >= 8.0) achievements.push({ title: "Academic Excellence Certificate", description: "Maintained a cumulative CGPA of 8.00 or higher across enrolled subjects", icon: "fa-medal", certKey: "academic-excellence" });
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
  document.getElementById('student-card-id').textContent = `Student ID: ${student.id}`;
  document.getElementById('student-card-dept').innerHTML = `<i class="fa-solid fa-building-columns"></i> ${escapeHtml(student.department)}`;
  document.getElementById('student-card-level').innerHTML = `<i class="fa-solid fa-layer-group"></i> ${escapeHtml(student.grade_level)}`;
  document.getElementById('student-card-email').innerHTML = `<i class="fa-solid fa-envelope"></i> ${escapeHtml(student.email)}`;
  document.getElementById('student-info-id').textContent = student.id;
  document.getElementById('student-info-department').textContent = student.department;
  document.getElementById('student-info-level').textContent = student.grade_level;
  document.getElementById('student-info-email').textContent = student.email;
  document.getElementById('student-info-attendance').textContent = `${student.attendance}%`;
  document.getElementById('student-info-status').textContent = student.status;
  state._portalStudent = student;

  const statusBadge = document.getElementById('student-card-status-badge');
  let statusClass = 'status-good';
  if (student.status === 'Honor Roll') statusClass = 'status-honor';
  else if (student.status === 'At-Risk') statusClass = 'status-risk';
  statusBadge.className = `status-pill ${statusClass}`;
  statusBadge.innerHTML = `<span class="status-dot"></span> ${student.status}`;

  document.getElementById('student-kpi-gpa').textContent = formatCgpa(student.gpa);
  document.getElementById('student-kpi-attendance').textContent = `${student.attendance}%`;
  document.getElementById('student-kpi-arrears').textContent = student.arrear_count || 0;

  const qrImg = document.getElementById('student-qr-image');
  if (qrImg) {
    const qrSrc = student.qr_code || generateStudentQRCodeUrl(student.id);
    qrImg.src = qrSrc;
    qrImg.alt = `${student.name} QR code`;
  }
  const qrLink = document.getElementById('student-qr-link');
  if (qrLink) {
    const profileUrl = new URL(student.profile_url || '/student-verify.html', window.location.origin);
    profileUrl.searchParams.set('id', student.id);
    qrLink.href = profileUrl.toString();
  }

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

  const markList = student.subject_marksheet || [];
  if (document.getElementById('subject-performance-summary')) {
    document.getElementById('subject-performance-summary').innerHTML = `
      <div class="small-stat-box">
        <span class="small-stat-label">CGPA</span>
        <strong>${formatCgpa(student.gpa)}</strong>
      </div>
      <div class="small-stat-box">
        <span class="small-stat-label">Subjects</span>
        <strong>${markList.length}</strong>
      </div>
      <div class="small-stat-box">
        <span class="small-stat-label">Attendance</span>
        <strong>${student.attendance}%</strong>
      </div>
    `;
  }

  renderStudyCoach(student, markList);
  initializeStudentTools(student);
}

function buildStudyPlan(student, markList) {
  const focusSubjects = [...markList].sort((first, second) => first.score - second.score).slice(0, 3);
  const activities = [
    'Review lecture notes and write a short concept summary.',
    'Work through three practice questions without looking at solutions.',
    'Revisit mistakes and explain the key idea in your own words.',
    'Complete one timed exercise, then check each step.',
    'Connect this topic to another subject or real-world example.',
    'Take a short self-test and list anything still unclear.',
    'Review the week and prepare questions for your next class.'
  ];
  const days = ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];

  return {
    focusSubjects,
    days: days.map((day, index) => ({
      day,
      subject: focusSubjects[index % Math.max(focusSubjects.length, 1)]?.subject || 'All enrolled subjects',
      activity: activities[index],
      minutes: index === 6 ? 30 : 45
    }))
  };
}

function renderStudyCoach(student, markList) {
  const { focusSubjects, days } = buildStudyPlan(student, markList);
  const priorities = [];
  const attendance = Number(student.attendance || 0);
  const gpa = Number(student.gpa || 0);

  focusSubjects.forEach((subject, index) => {
    const label = subject.score < 50 ? 'Urgent support' : subject.score < 65 ? 'Build fundamentals' : 'Maintain progress';
    priorities.push({
      title: `${index + 1}. ${subject.subject}`,
      detail: `${label}: ${subject.score}% recorded. Schedule a focused 45-minute review.`
    });
  });

  if (attendance < 75) {
    priorities.push({ title: 'Attendance needs attention', detail: `${attendance}% recorded. Attend upcoming classes and contact your advisor about missed sessions.` });
  } else if (attendance < 85) {
    priorities.push({ title: 'Build an attendance routine', detail: `${attendance}% recorded. Aim to attend every class this week and track any missed sessions.` });
  }
  if (gpa > 0 && gpa < 5) {
    priorities.push({ title: 'Meet your academic advisor', detail: 'Review course support options and agree on a practical recovery plan.' });
  }
  if (!priorities.length) {
    priorities.push({ title: 'Keep your momentum', detail: 'Your current indicators are on track. Use this plan to reinforce your strongest habits.' });
  }
  if (!focusSubjects.length) {
    priorities.unshift({ title: 'Add current subject marks', detail: 'Your weekly plan is ready. Updated marks will make its subject priorities more specific.' });
  }

  const summary = focusSubjects.length
    ? `Your plan starts with ${focusSubjects[0].subject}, your lowest recorded subject score. Short, focused sessions are easier to review and adjust.`
    : 'Your plan uses a balanced review routine. Add subject marks to personalize its priorities.';
  document.getElementById('study-coach-summary').textContent = summary;
  document.getElementById('study-coach-priorities').innerHTML = priorities.map(item => `
    <div class="coach-priority">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
    </div>
  `).join('');
  document.getElementById('study-plan-preview').innerHTML = days.map(item => `
    <li class="study-plan-day">
      <span class="study-plan-day-label">${item.day} · ${item.minutes} min</span>
      <strong>${escapeHtml(item.subject)}</strong>
      <span>${escapeHtml(item.activity)}</span>
    </li>
  `).join('');
}

function downloadStudyPlan() {
  const student = state._portalStudent;
  if (!student) return;

  const markList = student.subject_marksheet || [];
  const { focusSubjects, days } = buildStudyPlan(student, markList);
  const lines = [
    `7-Day Study Plan - ${student.name}`,
    `Student ID: ${student.id}`,
    `CGPA: ${formatCgpa(student.gpa)} | Attendance: ${student.attendance}%`,
    '',
    'Priority subjects:',
    ...(focusSubjects.length ? focusSubjects.map(item => `- ${item.subject}: ${item.score}%`) : ['- Add subject marks to personalize priorities.']),
    '',
    'Weekly schedule:',
    ...days.map(item => `${item.day} (${item.minutes} min) - ${item.subject}: ${item.activity}`)
  ];
  const file = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${student.id}-7-day-study-plan.txt`;
  link.click();
  URL.revokeObjectURL(downloadUrl);
  showToast('Your 7-day study plan was downloaded.', 'success');
}

function studentToolsStorageKey(studentId) {
  return `sju_student_tools_${studentId}`;
}

function persistStudentTools() {
  if (!state._portalStudent || !state._studentTools) return;
  try {
    localStorage.setItem(studentToolsStorageKey(state._portalStudent.id), JSON.stringify(state._studentTools));
  } catch (error) {
    showToast('Your changes could not be saved in this browser.', 'danger');
  }
}

function currentSemesterLabel(student) {
  const details = [student.academic_year, student.semester ? `Semester ${student.semester}` : '']
    .filter(Boolean);
  return details.length ? details.join(' · ') : 'Current term';
}

function initializeStudentTools(student) {
  try {
    state._studentTools = JSON.parse(localStorage.getItem(studentToolsStorageKey(student.id)) || 'null');
  } catch (error) {
    state._studentTools = null;
  }

  if (!state._studentTools || typeof state._studentTools !== 'object') {
    state._studentTools = { timetable: [], assignments: [], semesters: [] };
  }
  if (!Array.isArray(state._studentTools.timetable)) state._studentTools.timetable = [];
  if (!Array.isArray(state._studentTools.assignments)) state._studentTools.assignments = [];
  if (!Array.isArray(state._studentTools.semesters)) state._studentTools.semesters = [];

  if (!state._studentTools.semesters.length) {
    state._studentTools.semesters.push({
      id: `current-${student.id}`,
      term: currentSemesterLabel(student),
      cgpa: Number(student.gpa || 0),
      attendance: Number(student.attendance || 0),
      current: true
    });
  }

  persistStudentTools();
  renderClassSchedule();
  renderAssignments();
  renderSemesterProgress();
  updateReminderButton();
  checkAssignmentReminders();
  if (assignmentReminderInterval) clearInterval(assignmentReminderInterval);
  assignmentReminderInterval = setInterval(checkAssignmentReminders, 60000);

  const progressCgpa = document.getElementById('progress-cgpa');
  const progressAttendance = document.getElementById('progress-attendance');
  if (progressCgpa) progressCgpa.value = Number(student.gpa || 0).toFixed(2);
  if (progressAttendance) progressAttendance.value = Number(student.attendance || 0).toFixed(1);
}

function createStudentToolId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderClassSchedule() {
  const tbody = document.getElementById('student-timetable-list');
  if (!tbody) return;
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const classes = [...(state._studentTools?.timetable || [])].sort((first, second) =>
    dayOrder.indexOf(first.day) - dayOrder.indexOf(second.day) || first.start.localeCompare(second.start)
  );
  if (!classes.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="student-tool-empty">No classes added yet.</td></tr>';
    return;
  }
  tbody.innerHTML = classes.map(item => `
    <tr>
      <td>${escapeHtml(item.day)}</td>
      <td>${escapeHtml(item.start)} - ${escapeHtml(item.end)}</td>
      <td><strong>${escapeHtml(item.course)}</strong></td>
      <td>${escapeHtml(item.location || '-')}</td>
      <td class="student-tool-actions"><button class="btn btn-danger btn-sm" type="button" onclick="deleteClassSchedule('${item.id}')" aria-label="Remove ${escapeHtml(item.course)}"><i class="fa-solid fa-trash-can"></i></button></td>
    </tr>
  `).join('');
}

function saveClassSchedule(event) {
  event.preventDefault();
  const start = document.getElementById('class-start').value;
  const end = document.getElementById('class-end').value;
  if (start >= end) {
    showToast('Class end time must be later than its start time.', 'warning');
    return;
  }
  state._studentTools.timetable.push({
    id: createStudentToolId(),
    course: document.getElementById('class-course').value.trim(),
    day: document.getElementById('class-day').value,
    start,
    end,
    location: document.getElementById('class-location').value.trim()
  });
  persistStudentTools();
  renderClassSchedule();
  document.getElementById('class-schedule-form').reset();
  showToast('Class added to your timetable.', 'success');
}

function deleteClassSchedule(id) {
  state._studentTools.timetable = state._studentTools.timetable.filter(item => item.id !== id);
  persistStudentTools();
  renderClassSchedule();
}

function renderAssignments() {
  const container = document.getElementById('student-assignment-list');
  if (!container) return;
  const assignments = [...(state._studentTools?.assignments || [])]
    .sort((first, second) => new Date(first.dueAt) - new Date(second.dueAt));
  if (!assignments.length) {
    container.innerHTML = '<p class="student-tool-empty">No assignments yet. Add a deadline to start your task list.</p>';
    return;
  }

  const now = Date.now();
  container.innerHTML = assignments.map(item => {
    const dueTime = new Date(item.dueAt).getTime();
    const overdue = !item.completed && dueTime < now;
    const dueSoon = !item.completed && !overdue && dueTime - now < 24 * 60 * 60 * 1000;
    const status = item.completed ? 'Completed' : overdue ? 'Overdue' : dueSoon ? 'Due soon' : 'Upcoming';
    const statusClass = item.completed ? 'task-complete' : overdue ? 'task-overdue' : dueSoon ? 'task-due-soon' : 'task-upcoming';
    return `
      <article class="student-assignment-item ${item.completed ? 'is-complete' : ''}">
        <button class="task-check-btn" type="button" onclick="toggleAssignmentComplete('${item.id}')" aria-label="${item.completed ? 'Reopen' : 'Mark complete'}: ${escapeHtml(item.title)}">
          <i class="fa-solid ${item.completed ? 'fa-circle-check' : 'fa-circle'}"></i>
        </button>
        <div class="student-assignment-main">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.course)} · Due ${escapeHtml(new Date(item.dueAt).toLocaleString())}</span>
        </div>
        <span class="assignment-status ${statusClass}">${status}</span>
        <button class="btn btn-danger btn-sm" type="button" onclick="deleteAssignment('${item.id}')" aria-label="Delete ${escapeHtml(item.title)}"><i class="fa-solid fa-trash-can"></i></button>
      </article>
    `;
  }).join('');
}

function saveAssignment(event) {
  event.preventDefault();
  const dueAt = new Date(document.getElementById('assignment-due').value);
  if (Number.isNaN(dueAt.getTime())) {
    showToast('Choose a valid assignment deadline.', 'warning');
    return;
  }
  const reminderEnabled = document.getElementById('assignment-remind').checked;
  state._studentTools.assignments.push({
    id: createStudentToolId(),
    title: document.getElementById('assignment-title').value.trim(),
    course: document.getElementById('assignment-course').value.trim(),
    dueAt: dueAt.toISOString(),
    reminderAt: reminderEnabled ? new Date(dueAt.getTime() - 60 * 60 * 1000).toISOString() : null,
    completed: false,
    notified: false
  });
  persistStudentTools();
  renderAssignments();
  document.getElementById('assignment-form').reset();
  showToast('Assignment deadline saved.', 'success');
  checkAssignmentReminders();
}

function toggleAssignmentComplete(id) {
  const assignment = state._studentTools.assignments.find(item => item.id === id);
  if (!assignment) return;
  assignment.completed = !assignment.completed;
  persistStudentTools();
  renderAssignments();
}

function deleteAssignment(id) {
  state._studentTools.assignments = state._studentTools.assignments.filter(item => item.id !== id);
  persistStudentTools();
  renderAssignments();
}

async function enableAssignmentReminders() {
  if (!('Notification' in window)) {
    showToast('This browser does not support desktop notifications.', 'warning');
    return;
  }
  const permission = await Notification.requestPermission();
  updateReminderButton();
  if (permission === 'granted') {
    showToast('Deadline reminders are enabled while this portal is open.', 'success');
    checkAssignmentReminders();
  } else {
    showToast('Notification permission was not granted. Deadlines still appear in your task list.', 'warning');
  }
}

function updateReminderButton() {
  const button = document.getElementById('enable-reminders-btn');
  if (!button || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    button.innerHTML = '<i class="fa-solid fa-bell"></i> Reminders enabled';
    button.disabled = true;
  } else if (Notification.permission === 'denied') {
    button.innerHTML = '<i class="fa-solid fa-bell-slash"></i> Notifications blocked';
    button.disabled = true;
  }
}

function checkAssignmentReminders() {
  if (!state._studentTools || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  let changed = false;
  state._studentTools.assignments.forEach(item => {
    if (item.completed || item.notified || !item.reminderAt || new Date(item.reminderAt).getTime() > now) return;
    if (new Date(item.dueAt).getTime() <= now) return;
    const notification = new Notification(`Assignment due soon: ${item.title}`, {
      body: `${item.course} is due ${new Date(item.dueAt).toLocaleString()}.`,
      tag: `assignment-${item.id}`
    });
    notification.onclick = () => window.focus();
    item.notified = true;
    changed = true;
  });
  if (changed) persistStudentTools();
}

function compareSemesterLabels(first, second) {
  const firstCurrent = first.term.toLowerCase() === 'current term';
  const secondCurrent = second.term.toLowerCase() === 'current term';
  if (firstCurrent !== secondCurrent) return firstCurrent ? 1 : -1;
  return first.term.localeCompare(second.term, undefined, { numeric: true, sensitivity: 'base' });
}

function renderSemesterProgress() {
  const records = [...(state._studentTools?.semesters || [])].sort(compareSemesterLabels);
  const tbody = document.getElementById('semester-progress-list');
  if (tbody) {
    tbody.innerHTML = records.map(item => `
      <tr>
        <td>${escapeHtml(item.term)}${item.current ? ' <span class="current-term-label">Current</span>' : ''}</td>
        <td>${Number(item.cgpa).toFixed(2)} / 10</td>
        <td>${Number(item.attendance).toFixed(1)}%</td>
        <td class="student-tool-actions">${item.current ? '' : `<button class="btn btn-danger btn-sm" type="button" onclick="deleteSemesterProgress('${item.id}')" aria-label="Remove ${escapeHtml(item.term)}"><i class="fa-solid fa-trash-can"></i></button>`}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="student-tool-empty">No term results recorded yet.</td></tr>';
  }
  if (typeof Chart === 'undefined') return;

  const canvas = document.getElementById('chartSemesterProgress');
  if (!canvas) return;
  if (chartSemesterProgress) chartSemesterProgress.destroy();
  const isDark = state.theme === 'dark';
  chartSemesterProgress = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: records.map(item => item.term),
      datasets: [
        { label: 'CGPA', data: records.map(item => Number(item.cgpa)), yAxisID: 'cgpa', borderColor: '#087f73', backgroundColor: 'rgba(8, 127, 115, 0.12)', pointBackgroundColor: '#087f73', fill: true, tension: 0.25 },
        { label: 'Attendance (%)', data: records.map(item => Number(item.attendance)), yAxisID: 'attendance', borderColor: '#d17b21', backgroundColor: '#d17b21', pointBackgroundColor: '#d17b21', tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { color: isDark ? '#cbd5e1' : '#475569' } } },
      scales: {
        x: { ticks: { color: isDark ? '#cbd5e1' : '#475569' }, grid: { display: false } },
        cgpa: { type: 'linear', position: 'left', min: 0, max: 10, title: { display: true, text: 'CGPA', color: isDark ? '#cbd5e1' : '#475569' }, ticks: { color: isDark ? '#cbd5e1' : '#475569' } },
        attendance: { type: 'linear', position: 'right', min: 0, max: 100, title: { display: true, text: 'Attendance (%)', color: isDark ? '#cbd5e1' : '#475569' }, ticks: { color: isDark ? '#cbd5e1' : '#475569' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

function saveSemesterProgress(event) {
  event.preventDefault();
  const term = document.getElementById('progress-term').value.trim();
  const cgpa = Number(document.getElementById('progress-cgpa').value);
  const attendance = Number(document.getElementById('progress-attendance').value);
  if (!term || cgpa < 0 || cgpa > 10 || attendance < 0 || attendance > 100) {
    showToast('Enter a term, CGPA from 0 to 10, and attendance from 0 to 100.', 'warning');
    return;
  }
  const existing = state._studentTools.semesters.find(item => item.term.toLowerCase() === term.toLowerCase());
  if (existing) {
    existing.cgpa = cgpa;
    existing.attendance = attendance;
  } else {
    state._studentTools.semesters.push({ id: createStudentToolId(), term, cgpa, attendance, current: false });
  }
  persistStudentTools();
  renderSemesterProgress();
  document.getElementById('semester-progress-form').reset();
  showToast('Semester results saved to your progress tracker.', 'success');
}

function deleteSemesterProgress(id) {
  state._studentTools.semesters = state._studentTools.semesters.filter(item => item.id !== id || item.current);
  persistStudentTools();
  renderSemesterProgress();
}

/**
 * Admin KPIs & Charts Rendering
 */
function renderKPIs() {
  if (!state.analytics || !state.analytics.kpis) return;
  const kpis = state.analytics.kpis;
  document.getElementById('kpi-total-students').textContent = kpis.total_students || 0;
  document.getElementById('kpi-avg-gpa').textContent = formatCgpa(kpis.avg_gpa || 0);
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
        y: { title: { display: true, text: 'CGPA (10.00 Scale)', color: textColor }, min: 0, max: 10, ticks: { color: textColor }, grid: { color: gridColor } }
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
        y: { min: 0, max: 10, ticks: { color: textColor }, grid: { color: gridColor } },
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 3rem; color: var(--text-muted);">No student records found.</td></tr>`;
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
        <td><span class="gpa-badge">${formatCgpa(student.gpa)}</span></td>
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

function renderDepartmentSubjectFields(defaultScores = {}) {
  const container = document.getElementById('department-subjects-container');
  if (!container) return;

  const department = document.getElementById('form-department').value || 'Computer Science & Engineering';
  const subjects = getDepartmentSubjects(department);

  container.innerHTML = subjects.map((subject, index) => {
    const value = defaultScores[subject] ?? defaultScores[index] ?? '';
    const inputId = `subject-input-${subject.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    return `
      <div class="form-group">
        <label for="${inputId}">${escapeHtml(subject)}</label>
        <input type="number" id="${inputId}" class="form-control department-subject-input" min="0" max="100" step="0.1" value="${value === '' ? '' : Number(value).toFixed(1)}">
      </div>
    `;
  }).join('');
}

function collectDepartmentScoresFromForm() {
  const container = document.getElementById('department-subjects-container');
  if (!container) return {};

  const entries = [...container.querySelectorAll('.department-subject-input')];
  const scores = {};
  entries.forEach((input) => {
    const label = input.closest('.form-group')?.querySelector('label')?.textContent || '';
    if (!label || input.value.trim() === '') return;
    const value = Number(input.value);
    scores[label] = Number.isFinite(value) ? value : 0;
  });
  return scores;
}

function renderAtRiskIntervention() {
  const container = document.getElementById('at-risk-container');
  if (!container) return;

  const atRisk = state.students.filter(s => s.status === 'At-Risk' || s.gpa < 5.0 || s.attendance < 75);

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
          if (s.gpa < 5.0) reasons.push(`CGPA Warning (${formatCgpa(s.gpa)})`);
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
              <td><span style="color: var(--danger); font-weight: 700;">${formatCgpa(s.gpa)}</span></td>
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
  document.getElementById('form-department').value = 'Computer Science & Engineering';
  document.getElementById('form-academic-year').value = '';
  document.getElementById('form-year').value = '';
  document.getElementById('form-semester').value = '';
  document.getElementById('form-section').value = '';
  renderDepartmentSubjectFields();
  document.getElementById('student-modal').classList.add('active');
}

function openEditStudentModal(id) {
  const student = state.students.find(s => s.id === id);
  if (!student) return;

  state.editingStudentId = id;
  document.getElementById('modal-title').textContent = `Edit Student Record (${id})`;

  document.getElementById('form-name').value = student.name;
  document.getElementById('form-email').value = student.email;
  document.getElementById('form-department').value = student.department || 'Computer Science & Engineering';
  document.getElementById('form-grade-level').value = student.grade_level;
  document.getElementById('form-academic-year').value = student.academic_year || '';
  document.getElementById('form-year').value = student.year || '';
  document.getElementById('form-semester').value = student.semester || '';
  document.getElementById('form-section').value = student.section || '';
  document.getElementById('form-attendance').value = student.attendance;

  const scores = student.scores || {};
  renderDepartmentSubjectFields(scores);
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
  const academic_year = document.getElementById('form-academic-year').value.trim();
  const year = document.getElementById('form-year').value;
  const semester = document.getElementById('form-semester').value;
  const section = document.getElementById('form-section').value.trim();
  const attendance = parseFloat(document.getElementById('form-attendance').value);
  const scores = collectDepartmentScoresFromForm();

  const payload = { name, email, department, grade_level, academic_year, year, semester, section, attendance, scores };

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
      state.students[idx] = { ...state.students[idx], ...payload, gpa, status, qr_code: generateStudentQRCodeUrl(state.students[idx].id) };
    }
    showToast('Student record updated locally!', 'info');
  } else {
    const nextNum = state.students.length + 1;
    const id = `STU${String(nextNum).padStart(3, '0')}`;
    state.students.push({ id, ...payload, gpa, status, qr_code: generateStudentQRCodeUrl(id), profile_url: `/student-verify.html?id=${id}` });
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
  const vals = Object.values(scores || {});
  if (!vals.length) return 0.0;
  const avg = vals.reduce((sum, value) => sum + Number(value || 0), 0) / vals.length;
  return parseFloat((avg / 10.0).toFixed(2));
}

function determineLocalStatus(gpa, attendance) {
  if (gpa < 5.0 || attendance < 75) return 'At-Risk';
  if (gpa >= 8.5 && attendance >= 90) return 'Honor Roll';
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
      for achieving a cumulative CGPA of at least 8.50 at St. Joseph's College of Engineering.
      This recognition is awarded to students who demonstrate outstanding intellectual achievement,
      exceptional commitment to academic excellence, and exemplary conduct throughout the academic year.`
  },
  'academic-excellence': {
    label:      'Academic Excellence Certificate',
    typeLabel:  'Certificate of Academic Excellence',
    icon:       'fa-medal',
    theme:      'cert-theme-blue',
    medalIcon:  'fa-medal',
    description: `has successfully maintained a <strong>Cumulative CGPA of 8.00 or higher</strong>
      across all enrolled subjects and has demonstrated consistent academic performance
      throughout the enrollment period at St. Joseph's College of Engineering.`
  },
  'perfect-attendance': {
    label:      '100% Attendance Award',
    typeLabel:  'Certificate of Perfect Attendance',
    icon:       'fa-calendar-check',
    theme:      'cert-theme-green',
    medalIcon:  'fa-calendar-check',
    description: `has achieved a <strong>perfect 100% attendance rate</strong>, demonstrating
      exemplary dedication, punctuality, and commitment to every scheduled academic session
      at St. Joseph's College of Engineering throughout the academic year.`
  },
  'clear-standing': {
    label:      'Clear Academic Standing',
    typeLabel:  'Certificate of Clear Academic Standing',
    icon:       'fa-circle-check',
    theme:      'cert-theme-purple',
    medalIcon:  'fa-circle-check',
    description: `has maintained a <strong>Clear Academic Standing</strong> with zero arrears or backlogs
      across all enrolled subjects, fulfilling the academic requirements of St. Joseph's
      College of Engineering.`
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

  // Issue info
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('cert-issue-info').textContent = `Issued ${dateStr}  |  Certificate ID: SJCE/${student.id}/${certKey.toUpperCase()}`;
  const academicYearStart = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  document.getElementById('cert-academic-term').textContent = `Academic Year ${academicYearStart} – ${academicYearStart + 1}`;
  const verificationBase = student.profile_url || window.location.origin;
  const verificationUrl = new URL('/certificate-verify.html', verificationBase);
  verificationUrl.searchParams.set('id', student.id);
  verificationUrl.searchParams.set('type', certKey);
  const verificationLink = document.getElementById('cert-verify-link');
  const verificationQr = document.getElementById('cert-qr-image');
  verificationLink.href = verificationUrl.toString();
  verificationQr.src = generateQRCodeUrl(verificationUrl.toString());
  verificationQr.alt = `Verify ${config.label} certificate`;

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
