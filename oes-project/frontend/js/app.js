// ─── API Client ───────────────────────────────────────────────
const API_BASE = 'https://oes-backend-api.onrender.com/api';

const api = {
  async request(method, path, body, isFormData = false) {
    const token = localStorage.getItem('oes_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    if (!res.ok) throw { status: res.status, message: data.message || 'Request failed', data };
    return data;
  },
  get: (path) => api.request('GET', path),
  post: (path, body) => api.request('POST', path, body),
  put: (path, body) => api.request('PUT', path, body),
  delete: (path) => api.request('DELETE', path),
};

// ─── Auth helpers ─────────────────────────────────────────────
const Auth = {
  save(token, user) {
    localStorage.setItem('oes_token', token);
    localStorage.setItem('oes_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('oes_token');
    localStorage.removeItem('oes_user');
  },
  getUser() {
    try { return JSON.parse(localStorage.getItem('oes_user')); } catch { return null; }
  },
  getToken() { return localStorage.getItem('oes_token'); },
  isLoggedIn() { return !!this.getToken(); },
  requireAuth(allowedRoles) {
    const user = this.getUser();
    if (!user || !this.isLoggedIn()) { window.location.href = '/index.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      this.redirectToDashboard(user.role); return null;
    }
    return user;
  },
  redirectToDashboard(role) {
    const map = { student: '/student/dashboard.html', examiner: '/examiner/dashboard.html', administrator: '/admin/dashboard.html' };
    window.location.href = map[role] || '/index.html';
  },
};

// ─── Toast notifications ──────────────────────────────────────
const Toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 4000) {
    this.init();
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span style="flex-shrink:0">${icons[type]}</span><span style="flex:1">${message}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text3);cursor:pointer;padding:0 4px;font-size:1rem">×</button>`;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut .3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success: (msg) => Toast.show(msg, 'success'),
  error: (msg) => Toast.show(msg, 'error'),
  warning: (msg) => Toast.show(msg, 'warning'),
  info: (msg) => Toast.show(msg, 'info'),
};

// ─── Modal helpers ────────────────────────────────────────────
const Modal = {
  open(id) { document.getElementById(id)?.classList.add('show'); },
  close(id) { document.getElementById(id)?.classList.remove('show'); },
  closeAll() { document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show')); },
  confirm(message, title = 'Confirm') {
    return new Promise(resolve => {
      const id = 'confirm-modal-' + Date.now();
      const el = document.createElement('div');
      el.className = 'modal-overlay show';
      el.id = id;
      el.innerHTML = `
        <div class="modal" style="max-width:400px">
          <div class="modal-header"><div class="modal-title">${title}</div></div>
          <div class="modal-body"><p>${message}</p></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="${id}-cancel">Cancel</button>
            <button class="btn btn-danger" id="${id}-ok">Confirm</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      document.getElementById(`${id}-cancel`).onclick = () => { el.remove(); resolve(false); };
      document.getElementById(`${id}-ok`).onclick = () => { el.remove(); resolve(true); };
    });
  },
};

// ─── Loading state ────────────────────────────────────────────
const Loading = {
  show(btn, text = 'Loading...') {
    if (!btn) return;
    btn._origText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span>${text}`;
    btn.disabled = true;
  },
  hide(btn) {
    if (!btn || !btn._origText) return;
    btn.innerHTML = btn._origText;
    btn.disabled = false;
  },
};

// ─── Format helpers ───────────────────────────────────────────
const Format = {
  date(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; },
  datetime(d) { return d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; },
  time(d) { return d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'; },
  duration(s) { const m = Math.floor(s / 60), sec = s % 60; return `${m}m ${sec}s`; },
  percent(v) { return `${parseFloat(v || 0).toFixed(1)}%`; },
  marks(v, max) { return `${parseFloat(v || 0).toFixed(1)}/${parseFloat(max || 0).toFixed(1)}`; },
  countdown(endTime) {
    const diff = new Date(endTime) - new Date();
    if (diff <= 0) return '00:00:00';
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
  },
  badge(status) {
    const map = {
      active: 'success', scheduled: 'info', completed: 'gray', cancelled: 'danger', draft: 'warning',
      submitted: 'success', auto_submitted: 'warning', in_progress: 'primary', flagged: 'danger',
      easy: 'success', medium: 'warning', hard: 'danger',
      mcq: 'primary', true_false: 'info', short_answer: 'purple',
    };
    return `<span class="badge badge-${map[status] || 'gray'}">${status?.replace(/_/g, ' ') || 'N/A'}</span>`;
  },
};

// ─── Apply theme ──────────────────────────────────────────────
const applyTheme = () => {
  const user = Auth.getUser();
  const theme = user?.theme || localStorage.getItem('oes_theme') || 'dark';
  document.body.classList.toggle('light', theme === 'light');
};

// ─── Navbar notifications badge ───────────────────────────────
const loadNotifBadge = async () => {
  try {
    const res = await api.get('/notifications?limit=1');
    const badge = document.getElementById('notif-badge');
    if (badge && res.data?.unreadCount > 0) {
      badge.textContent = res.data.unreadCount;
      badge.classList.remove('hidden');
    }
  } catch {}
};

// ─── Render navbar user info ──────────────────────────────────
const renderNavUser = () => {
  const user = Auth.getUser();
  if (!user) return;
  const nameEl = document.getElementById('nav-user-name');
  const avatarEl = document.getElementById('nav-avatar');
  const roleEl = document.getElementById('nav-user-role');
  if (nameEl) nameEl.textContent = user.fullName || user.full_name || 'User';
  if (roleEl) roleEl.textContent = user.role?.charAt(0).toUpperCase() + user.role?.slice(1);
  if (avatarEl) avatarEl.textContent = (user.fullName || user.full_name || 'U')[0].toUpperCase();
};

// ─── Logout ───────────────────────────────────────────────────
const logout = async () => {
  try { await api.post('/auth/logout', {}); } catch {}
  Auth.clear();
  window.location.href = '/index.html';
};

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  renderNavUser();
  loadNotifBadge();

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
      document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    }
  });

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });
});
