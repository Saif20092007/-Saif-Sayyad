// SPA UI Orchestrator Script for SS Plastotech ERP

const API_BASE = '/api';
let token = localStorage.getItem('token') || '';
let user = JSON.parse(localStorage.getItem('user') || 'null');
let mustChangePassword = localStorage.getItem('must_change_password') === 'true';
let inactivityTimer = null;
let lastActiveTime = Date.now();
let TIMEOUT_MINUTES = 60;

// Initialize Page Load
document.addEventListener('DOMContentLoaded', () => {
  setupApp();

  // Listeners for dynamic inputs
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('company-form').addEventListener('submit', handleCompanySave);
  document.getElementById('customer-modal-form').addEventListener('submit', handleCustomerSave);
  document.getElementById('supplier-modal-form').addEventListener('submit', handleSupplierSave);
  document.getElementById('product-modal-form').addEventListener('submit', handleProductSave);
  document.getElementById('settings-form').addEventListener('submit', handleSettingsSave);
  document.getElementById('password-form').addEventListener('submit', handlePasswordChange);

  // Activity listeners for 1-hour session timeout
  window.addEventListener('mousemove', resetClientTimer);
  window.addEventListener('keypress', resetClientTimer);
});

function setupApp() {
  if (token) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-wrapper').classList.remove('hidden');
    if (mustChangePassword) {
      switchTab('settings');
      showToast('Action Required: Please change your temporary/default password now.', 'exclamation-triangle');
    } else {
      switchTab('dashboard');
    }
    startInactivityCounter();
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-wrapper').classList.add('hidden');
    stopInactivityCounter();
  }
}

// Fetch generic helper
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });

  // Automatically parse refresh token from the server header response on successful request
  const refreshToken = res.headers.get('X-Refresh-Token') || res.headers.get('x-refresh-token');
  if (refreshToken) {
    token = refreshToken;
    localStorage.setItem('token', token);
    lastActiveTime = Date.now(); // Reset inactive timer on successful authenticated transaction
  }

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error('Payload too large.');
    }
    throw new Error(data.error?.message || data.error || 'Server error occurred.');
  }
  return data;
}

// Auth Logics
async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value;
  const password = form.password.value;
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  try {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    token = res.token;
    user = res.user;
    mustChangePassword = !!res.must_change_password;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('must_change_password', mustChangePassword ? 'true' : 'false');
    showToast('Signed in successfully!', 'check');
    setupApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch (e) {}
  token = '';
  user = null;
  mustChangePassword = false;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('must_change_password');
  setupApp();
  showToast('Logged out successfully.');
}

// Tabs Orchestrations
async function switchTab(tabId) {
  if (mustChangePassword && tabId !== 'settings') {
    showToast('Action Required: You must change your temporary password before accessing other modules.', 'exclamation-triangle');
    return;
  }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('bg-indigo-50', 'text-indigo-700', 'border-l-4', 'border-indigo-600'));

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.remove('hidden');

  const navBtn = document.getElementById(`btn-${tabId}`);
  if (navBtn) navBtn.classList.add('bg-indigo-50', 'text-indigo-700', 'border-l-4', 'border-indigo-600');

  // Load appropriate data
  if (tabId === 'dashboard') loadDashboard();
  if (tabId === 'company') loadCompanyProfile();
  if (tabId === 'customers') loadCustomers();
  if (tabId === 'suppliers') loadSuppliers();
  if (tabId === 'products') loadProducts();
  if (tabId === 'settings') loadSettingsAndLogs();
}

// Inactivity Session Tracker
function startInactivityCounter() {
  lastActiveTime = Date.now();
  if (inactivityTimer) clearInterval(inactivityTimer);

  inactivityTimer = setInterval(async () => {
    const elapsedMinutes = (Date.now() - lastActiveTime) / 60000;
    const remainingSec = Math.max(0, Math.floor((TIMEOUT_MINUTES - elapsedMinutes) * 60));

    const minutes = Math.floor(remainingSec / 60);
    const seconds = remainingSec % 60;
    document.getElementById('session-timer').textContent = `Timeout: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    if (elapsedMinutes >= TIMEOUT_MINUTES) {
      showToast('Session expired due to inactivity.', 'exclamation-triangle');
      logout();
    }
  }, 1000);
}

function stopInactivityCounter() {
  if (inactivityTimer) {
    clearInterval(inactivityTimer);
    inactivityTimer = null;
  }
}

function resetClientTimer() {
  lastActiveTime = Date.now();
}

// Dynamic dashboard counters loading
async function loadDashboard() {
  try {
    const [c, s, p] = await Promise.all([
      apiFetch('/customers'),
      apiFetch('/suppliers'),
      apiFetch('/products')
    ]);
    document.getElementById('dash-customers-count').textContent = c.data.length;
    document.getElementById('dash-suppliers-count').textContent = s.data.length;
    document.getElementById('dash-products-count').textContent = p.data.length;
  } catch (err) {
    console.error(err);
  }
}

// Company Profile
async function loadCompanyProfile() {
  try {
    const res = await apiFetch('/company-profile');
    if (res.data) {
      const form = document.getElementById('company-form');
      form.name.value = res.data.name || '';
      form.address.value = res.data.address || '';
      form.gstin.value = res.data.gstin || '';
      form.pan.value = res.data.pan || '';
      form.cin.value = res.data.cin || '';
      form.email.value = res.data.email || '';
      form.phone.value = res.data.phone || '';
      form.bank_name.value = res.data.bank_name || '';
      form.bank_account_no.value = res.data.bank_account_no || '';
      form.bank_ifsc.value = res.data.bank_ifsc || '';
      form.logo_url.value = res.data.logo_url || '';
      form.signature_image_url.value = res.data.signature_image_url || '';
    }
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function handleCompanySave(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    name: form.name.value,
    address: form.address.value,
    gstin: form.gstin.value.toUpperCase(),
    pan: form.pan.value.toUpperCase(),
    cin: form.cin.value,
    email: form.email.value,
    phone: form.phone.value,
    bank_name: form.bank_name.value,
    bank_account_no: form.bank_account_no.value,
    bank_ifsc: form.bank_ifsc.value,
    logo_url: form.logo_url.value,
    signature_image_url: form.signature_image_url.value
  };

  try {
    await apiFetch('/company-profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Company profile saved successfully!');
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// Customers Management
async function loadCustomers() {
  try {
    const res = await apiFetch('/customers');
    const list = document.getElementById('customers-list');
    list.innerHTML = res.data.map(c => `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-semibold text-slate-800">${escapeHTML(c.name)}</td>
        <td class="px-6 py-4 font-mono text-sm">${escapeHTML(c.gstin || 'N/A')}</td>
        <td class="px-6 py-4">${escapeHTML(c.phone)}</td>
        <td class="px-6 py-4">${escapeHTML(c.email || '—')}</td>
        <td class="px-6 py-4 text-right space-x-2">
          <button onclick="editCustomer('${c.id}')" class="text-indigo-600 hover:text-indigo-900 font-medium text-sm">Edit</button>
          <button onclick="deleteCustomer('${c.id}')" class="text-red-600 hover:text-red-900 font-medium text-sm">Delete</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="text-center py-8 text-slate-400">No customers found.</td></tr>`;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

function openCustomerModal(id = '') {
  const modal = document.getElementById('customer-modal');
  const form = document.getElementById('customer-modal-form');
  form.reset();
  form.id.value = id;
  document.getElementById('customer-modal-title').textContent = id ? 'Edit Customer' : 'Add New Customer';
  modal.classList.remove('hidden');
}

function closeCustomerModal() {
  document.getElementById('customer-modal').classList.add('hidden');
}

async function editCustomer(id) {
  try {
    const res = await apiFetch(`/customers/${id}`);
    openCustomerModal(id);
    const form = document.getElementById('customer-modal-form');
    form.name.value = res.data.name;
    form.gstin.value = res.data.gstin || '';
    form.phone.value = res.data.phone;
    form.email.value = res.data.email || '';
    form.billing_address.value = res.data.billing_address;
    form.shipping_address.value = res.data.shipping_address;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function handleCustomerSave(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  const payload = {
    name: form.name.value,
    gstin: form.gstin.value.toUpperCase() || null,
    phone: form.phone.value,
    email: form.email.value || null,
    billing_address: form.billing_address.value,
    shipping_address: form.shipping_address.value
  };

  try {
    await apiFetch(id ? `/customers/${id}` : '/customers', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    showToast(id ? 'Customer updated.' : 'Customer created.');
    closeCustomerModal();
    loadCustomers();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function deleteCustomer(id) {
  if (!confirm('Are you sure you want to delete this customer?')) return;
  try {
    await apiFetch(`/customers/${id}`, { method: 'DELETE' });
    showToast('Customer deleted.');
    loadCustomers();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// Suppliers Management
async function loadSuppliers() {
  try {
    const res = await apiFetch('/suppliers');
    const list = document.getElementById('suppliers-list');
    list.innerHTML = res.data.map(s => `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-semibold text-slate-800">${escapeHTML(s.name)}</td>
        <td class="px-6 py-4 font-mono text-sm">${escapeHTML(s.gstin || 'N/A')}</td>
        <td class="px-6 py-4">${escapeHTML(s.phone)}</td>
        <td class="px-6 py-4">${escapeHTML(s.email || '—')}</td>
        <td class="px-6 py-4 text-right space-x-2">
          <button onclick="editSupplier('${s.id}')" class="text-indigo-600 hover:text-indigo-900 font-medium text-sm">Edit</button>
          <button onclick="deleteSupplier('${s.id}')" class="text-red-600 hover:text-red-900 font-medium text-sm">Delete</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="text-center py-8 text-slate-400">No suppliers found.</td></tr>`;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

function openSupplierModal(id = '') {
  const modal = document.getElementById('supplier-modal');
  const form = document.getElementById('supplier-modal-form');
  form.reset();
  form.id.value = id;
  document.getElementById('supplier-modal-title').textContent = id ? 'Edit Supplier' : 'Add New Supplier';
  modal.classList.remove('hidden');
}

function closeSupplierModal() {
  document.getElementById('supplier-modal').classList.add('hidden');
}

async function editSupplier(id) {
  try {
    const res = await apiFetch(`/suppliers/${id}`);
    openSupplierModal(id);
    const form = document.getElementById('supplier-modal-form');
    form.name.value = res.data.name;
    form.gstin.value = res.data.gstin || '';
    form.phone.value = res.data.phone;
    form.email.value = res.data.email || '';
    form.address.value = res.data.address;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function handleSupplierSave(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  const payload = {
    name: form.name.value,
    gstin: form.gstin.value.toUpperCase() || null,
    phone: form.phone.value,
    email: form.email.value || null,
    address: form.address.value
  };

  try {
    await apiFetch(id ? `/suppliers/${id}` : '/suppliers', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    showToast(id ? 'Supplier updated.' : 'Supplier created.');
    closeSupplierModal();
    loadSuppliers();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function deleteSupplier(id) {
  if (!confirm('Are you sure you want to delete this supplier?')) return;
  try {
    await apiFetch(`/suppliers/${id}`, { method: 'DELETE' });
    showToast('Supplier deleted.');
    loadSuppliers();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// Products Management
async function loadProducts() {
  try {
    const res = await apiFetch('/products');
    const list = document.getElementById('products-list');
    list.innerHTML = res.data.map(p => `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-semibold text-slate-800">${escapeHTML(p.name)}</td>
        <td class="px-6 py-4 font-mono text-sm">${escapeHTML(p.hsn_code)}</td>
        <td class="px-6 py-4">${escapeHTML(p.gst_percent)}%</td>
        <td class="px-6 py-4 font-medium">₹${escapeHTML(p.default_rate)}</td>
        <td class="px-6 py-4"><span class="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-sm font-semibold">${escapeHTML(p.stock)} ${escapeHTML(p.unit)}</span></td>
        <td class="px-6 py-4 text-right space-x-2">
          <button onclick="editProduct('${p.id}')" class="text-indigo-600 hover:text-indigo-900 font-medium text-sm">Edit</button>
          <button onclick="deleteProduct('${p.id}')" class="text-red-600 hover:text-red-900 font-medium text-sm">Delete</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="6" class="text-center py-8 text-slate-400">No products found in catalog.</td></tr>`;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

function openProductModal(id = '') {
  const modal = document.getElementById('product-modal');
  const form = document.getElementById('product-modal-form');
  form.reset();
  form.id.value = id;
  document.getElementById('product-modal-title').textContent = id ? 'Edit Product' : 'Add New Product';
  modal.classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.add('hidden');
}

async function editProduct(id) {
  try {
    const res = await apiFetch(`/products/${id}`);
    openProductModal(id);
    const form = document.getElementById('product-modal-form');
    form.name.value = res.data.name;
    form.hsn_code.value = res.data.hsn_code;
    form.gst_percent.value = res.data.gst_percent;
    form.default_rate.value = res.data.default_rate;
    form.unit.value = res.data.unit;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function handleProductSave(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  const payload = {
    name: form.name.value,
    hsn_code: form.hsn_code.value,
    gst_percent: Number(form.gst_percent.value),
    default_rate: Number(form.default_rate.value),
    unit: form.unit.value
  };

  try {
    await apiFetch(id ? `/products/${id}` : '/products', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });
    showToast(id ? 'Product updated.' : 'Product created.');
    closeProductModal();
    loadProducts();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  try {
    await apiFetch(`/products/${id}`, { method: 'DELETE' });
    showToast('Product deleted.');
    loadProducts();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// System settings & security logs
async function loadSettingsAndLogs() {
  try {
    const settingsRes = await apiFetch('/settings');
    const form = document.getElementById('settings-form');
    form.inactivity_timeout_minutes.value = settingsRes.data.inactivity_timeout_minutes;
    form.invoice_prefix.value = settingsRes.data.invoice_prefix;

    const logsRes = await apiFetch('/settings/audit-logs');
    const logsList = document.getElementById('audit-logs-list');
    logsList.innerHTML = logsRes.data.map(l => `
      <tr>
        <td class="px-6 py-3.5 text-sm text-slate-500 font-mono">${new Date(l.created_at).toLocaleString()}</td>
        <td class="px-6 py-3.5 text-sm"><span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold font-mono uppercase">${escapeHTML(l.module)}</span></td>
        <td class="px-6 py-3.5 text-sm font-semibold text-slate-800">${escapeHTML(l.action)}</td>
        <td class="px-6 py-3.5 text-sm text-slate-400 font-mono">${escapeHTML(l.reference_id || '—')}</td>
      </tr>
    `).join('') || `<tr><td colspan="4" class="text-center py-6 text-slate-400">No security events found.</td></tr>`;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function handleSettingsSave(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    inactivity_timeout_minutes: Number(form.inactivity_timeout_minutes.value),
    invoice_prefix: form.invoice_prefix.value
  };

  try {
    await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Settings saved successfully!');
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    oldPassword: form.oldPassword.value,
    newPassword: form.newPassword.value
  };
  const feedback = document.getElementById('password-feedback');
  feedback.classList.add('hidden');

  try {
    await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    feedback.textContent = 'Password updated successfully!';
    feedback.className = 'text-green-600 bg-green-50 p-2 rounded border border-green-200 text-sm block';

    // Clear the forced password change restriction on success
    mustChangePassword = false;
    localStorage.setItem('must_change_password', 'false');
    showToast('Password changed successfully. Navigations enabled.', 'check');
  } catch (err) {
    feedback.textContent = err.message;
    feedback.className = 'text-red-600 bg-red-50 p-2 rounded border border-red-200 text-sm block';
  }
}

// Utilities Helpers
function showToast(msg, icon = 'circle-check') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  toastMsg.innerHTML = `<i class="fa-solid fa-${icon} text-emerald-400"></i> <span class="ml-2 font-medium">${msg}</span>`;
  toast.classList.remove('hidden', 'translate-y-10');
  setTimeout(() => {
    toast.classList.add('hidden', 'translate-y-10');
  }, 4000);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
