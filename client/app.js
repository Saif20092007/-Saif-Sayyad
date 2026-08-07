// SPA UI Orchestrator Script for SS Plastotech ERP

const API_BASE = '/api';
let token = localStorage.getItem('token') || '';
let user = JSON.parse(localStorage.getItem('user') || 'null');
let mustChangePassword = localStorage.getItem('must_change_password') === 'true';
let inactivityTimer = null;
let lastActiveTime = Date.now();
let TIMEOUT_MINUTES = 60;

// Global state lookups for rapid UI conversions
let customersListGlobal = [];
let suppliersListGlobal = [];
let productsListGlobal = [];
let invoiceListGlobal = [];

// Initialize Page Load
document.addEventListener('DOMContentLoaded', () => {
  setupApp();

  // Listeners for forms
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

// Fetch generic helper with headers & token refreshing
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

  // Handle file downloads
  const contentType = res.headers.get('content-type');
  if (res.ok && contentType && contentType.includes('application/vnd.openxmlformats-officedocument')) {
    return res.blob();
  }
  if (res.ok && contentType && contentType.includes('application/json') && res.headers.get('content-disposition')) {
    return res.blob();
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
  if (tabId === 'invoices') loadInvoices();
  if (tabId === 'purchases') loadPurchases();
  if (tabId === 'ledger') loadLedgerScreen();
  if (tabId === 'reports') loadReportsScreen();
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
    const [c, s, p, invoicesData] = await Promise.all([
      apiFetch('/customers'),
      apiFetch('/suppliers'),
      apiFetch('/products'),
      apiFetch('/invoices')
    ]);

    customersListGlobal = c.data;
    suppliersListGlobal = s.data;
    productsListGlobal = p.data;
    invoiceListGlobal = invoicesData.data;

    document.getElementById('dash-customers-count').textContent = c.data.length;
    document.getElementById('dash-suppliers-count').textContent = s.data.length;
    document.getElementById('dash-products-count').textContent = p.data.length;

    // Calculate Outstanding Balances across all active invoices
    // Let's retrieve all payments to subtract
    const paymentsData = await apiFetch('/payments');

    const activeInvoices = invoicesData.data.filter(i => i.invoice_status !== 'Cancelled');
    const totalBilled = activeInvoices.reduce((sum, i) => sum + Number(i.grand_total), 0);
    const totalPaid = paymentsData.data.reduce((sum, p) => sum + Number(p.amount), 0);

    const netOutstanding = Math.max(0, totalBilled - totalPaid);
    document.getElementById('dash-outstanding-balance').textContent = `₹${netOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    customersListGlobal = res.data;
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
    suppliersListGlobal = res.data;
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
    productsListGlobal = res.data;
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

// INVOICES & BILLING
async function loadInvoices() {
  try {
    const res = await apiFetch('/invoices');
    invoiceListGlobal = res.data;
    renderInvoicesTable(res.data);

    // Fetch master customers & products to populate modal dropdowns
    const [custRes, prodRes] = await Promise.all([
      apiFetch('/customers'),
      apiFetch('/products')
    ]);
    customersListGlobal = custRes.data;
    productsListGlobal = prodRes.data;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

function renderInvoicesTable(invoices) {
  const list = document.getElementById('invoices-list');
  list.innerHTML = invoices.map(i => {
    const isCancelled = i.invoice_status === 'Cancelled';
    const statusClass = isCancelled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800';
    const payStatusClass = i.payment_status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                           i.payment_status === 'Partially Paid' ? 'bg-yellow-100 text-yellow-800' :
                           'bg-slate-100 text-slate-800';

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-bold font-mono text-indigo-700 text-sm">${escapeHTML(i.invoice_no)}</td>
        <td class="px-6 py-4 font-mono text-xs">${new Date(i.invoice_date).toLocaleDateString('en-GB')}</td>
        <td class="px-6 py-4 font-semibold text-slate-800 text-xs">${escapeHTML(i.snapshot_customer_name)}</td>
        <td class="px-6 py-4 font-mono font-semibold text-xs">₹${Number(i.grand_total).toFixed(2)}</td>
        <td class="px-6 py-4 text-xs"><span class="${payStatusClass} px-2 py-1 rounded font-bold">${escapeHTML(i.payment_status)}</span></td>
        <td class="px-6 py-4 text-xs"><span class="${statusClass} px-2 py-1 rounded font-bold">${escapeHTML(i.invoice_status)}</span></td>
        <td class="px-6 py-4 text-right space-x-2 text-xs font-semibold">
          <button onclick="viewInvoicePDF('${i.id}')" class="text-indigo-600 hover:text-indigo-900">View PDF</button>
          ${!isCancelled ? `
            <button onclick="openPaymentRecordModal('${i.id}')" class="text-emerald-600 hover:text-emerald-900">Payment</button>
            <button onclick="emailInvoice('${i.id}')" class="text-amber-600 hover:text-amber-900">Email</button>
            <button onclick="cancelInvoice('${i.id}')" class="text-red-600 hover:text-red-900">Cancel</button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="7" class="text-center py-8 text-slate-400">No invoices match your selection.</td></tr>`;
}

function applyInvoiceFilters() {
  const invNoVal = document.getElementById('filter-invoice-no').value.toLowerCase();
  const custVal = document.getElementById('filter-customer').value.toLowerCase();
  const poVal = document.getElementById('filter-po-number').value.toLowerCase();
  const statusVal = document.getElementById('filter-status').value;

  const filtered = invoiceListGlobal.filter(i => {
    const matchesInv = i.invoice_no.toLowerCase().includes(invNoVal);
    const matchesCust = i.snapshot_customer_name.toLowerCase().includes(custVal);
    const matchesPo = (i.po_number || '').toLowerCase().includes(poVal);
    const matchesStatus = statusVal === '' || i.invoice_status === statusVal;
    return matchesInv && matchesCust && matchesPo && matchesStatus;
  });

  renderInvoicesTable(filtered);
}

// Create Invoice
function openInvoiceCreateModal() {
  const modal = document.getElementById('invoice-create-modal');
  const form = document.getElementById('invoice-create-form');
  form.reset();

  // Pre-populate customer dropdown
  const custSelect = form.customer_id;
  custSelect.innerHTML = '<option value="">-- Choose Customer --</option>' +
    customersListGlobal.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');

  // Set default date to today
  form.invoice_date.value = new Date().toISOString().split('T')[0];

  document.getElementById('invoice-lines-body').innerHTML = '';
  addInvoiceLineRow(); // Add initial blank row

  recalculateInvoiceLines();
  modal.classList.remove('hidden');
}

function closeInvoiceCreateModal() {
  document.getElementById('invoice-create-modal').classList.add('hidden');
}

function addInvoiceLineRow() {
  const body = document.getElementById('invoice-lines-body');
  const rowCount = body.children.length;

  const row = document.createElement('tr');
  row.className = 'invoice-line-row';
  row.innerHTML = `
    <td class="p-2">
      <select name="product_id" onchange="handleProductSelectChange(this)" required class="w-full border rounded p-1 text-sm">
        <option value="">-- Select Product --</option>
        ${productsListGlobal.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}
      </select>
    </td>
    <td class="p-2">
      <input type="number" name="qty" required value="1" min="1" step="1" oninput="recalculateInvoiceLines()" class="w-full border rounded p-1 text-sm font-mono">
    </td>
    <td class="p-2">
      <input type="number" name="rate" required value="0.00" min="0" step="0.01" oninput="recalculateInvoiceLines()" class="w-full border rounded p-1 text-sm font-mono">
    </td>
    <td class="p-2 font-mono text-sm font-bold text-slate-700 py-4" name="line_total">
      ₹0.00
    </td>
    <td class="p-2 text-right">
      <button type="button" onclick="removeInvoiceLineRow(this)" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash-can"></i></button>
    </td>
  `;
  body.appendChild(row);
  recalculateInvoiceLines();
}

function removeInvoiceLineRow(btn) {
  const row = btn.closest('tr');
  row.remove();
  recalculateInvoiceLines();
}

function handleProductSelectChange(select) {
  const prodId = select.value;
  const row = select.closest('tr');
  if (prodId) {
    const product = productsListGlobal.find(p => p.id === prodId);
    if (product) {
      row.querySelector('input[name="rate"]').value = product.default_rate;
    }
  }
  recalculateInvoiceLines();
}

function recalculateInvoiceLines() {
  const rows = document.querySelectorAll('.invoice-line-row');
  const taxType = document.querySelector('select[name="tax_type"]').value;

  let taxableTotal = 0;
  let gstTotal = 0;

  rows.forEach(row => {
    const prodId = row.querySelector('select[name="product_id"]').value;
    const qty = Number(row.querySelector('input[name="qty"]').value) || 0;
    const rate = Number(row.querySelector('input[name="rate"]').value) || 0;

    let lineTotalVal = qty * rate;
    row.querySelector('td[name="line_total"]').textContent = `₹${lineTotalVal.toFixed(2)}`;

    if (prodId) {
      const product = productsListGlobal.find(p => p.id === prodId);
      if (product) {
        const gstPercent = Number(product.gst_percent) || 18;
        const lineGst = lineTotalVal * (gstPercent / 100);
        taxableTotal += lineTotalVal;
        gstTotal += lineGst;
      }
    }
  });

  const grandRaw = taxableTotal + gstTotal;
  const grandRounded = Math.round(grandRaw);
  const roundOff = grandRounded - grandRaw;

  document.getElementById('create-taxable-val').textContent = `₹${taxableTotal.toFixed(2)}`;
  document.getElementById('create-gst-val').textContent = `₹${gstTotal.toFixed(2)}`;
  document.getElementById('create-round-val').textContent = `${roundOff >= 0 ? '+' : ''}${roundOff.toFixed(2)}`;
  document.getElementById('create-grand-val').textContent = `₹${grandRounded.toFixed(2)}`;
}

async function handleInvoiceSave(e) {
  e.preventDefault();
  const form = e.target;

  const items = [];
  const rows = document.querySelectorAll('.invoice-line-row');
  rows.forEach(row => {
    const product_id = row.querySelector('select[name="product_id"]').value;
    const qty = Number(row.querySelector('input[name="qty"]').value);
    const rate = Number(row.querySelector('input[name="rate"]').value);
    if (product_id) {
      items.push({ product_id, qty, rate });
    }
  });

  if (items.length === 0) {
    showToast('Please add at least one line item product.', 'exclamation-triangle');
    return;
  }

  const payload = {
    customer_id: form.customer_id.value,
    invoice_date: form.invoice_date.value,
    po_number: form.po_number.value || null,
    place_of_supply: form.place_of_supply.value,
    tax_type: form.tax_type.value,
    copy_type: form.copy_type.value,
    signature_mode: form.signature_mode.value,
    items
  };

  try {
    await apiFetch('/invoices', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Invoice saved & finalized successfully!');
    closeInvoiceCreateModal();
    loadInvoices();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// Payment Recording Modal
function openPaymentRecordModal(invoiceId) {
  const modal = document.getElementById('payment-record-modal');
  const form = document.getElementById('payment-record-form');
  form.reset();

  const invoice = invoiceListGlobal.find(i => i.id === invoiceId);
  if (!invoice) return;

  form.invoice_id.value = invoiceId;
  form.customer_id.value = invoice.customer_id;
  form.payment_date.value = new Date().toISOString().split('T')[0];

  document.getElementById('payment-customer-name').value = invoice.snapshot_customer_name;
  document.getElementById('payment-invoice-no').value = invoice.invoice_no;

  // Set default payment amount to invoice grand total
  form.amount.value = invoice.grand_total;

  modal.classList.remove('hidden');
}

function closePaymentRecordModal() {
  document.getElementById('payment-record-modal').classList.add('hidden');
}

async function handlePaymentSave(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    customer_id: form.customer_id.value,
    invoice_id: form.invoice_id.value || null,
    payment_date: form.payment_date.value,
    amount: Number(form.amount.value),
    mode: form.mode.value
  };

  try {
    await apiFetch('/payments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Receipt recorded & invoice payment tracking updated!');
    closePaymentRecordModal();
    loadInvoices();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// Reprint PDF View modal
async function viewInvoicePDF(id) {
  try {
    const res = await apiFetch(`/invoices/${id}/pdf`);
    let url = res.pdf_url;
    if (!url || res.pdf_generation_status !== 'success') {
      // Synchronously trigger generation
      const regenRes = await apiFetch(`/invoices/${id}/regenerate-pdf`, { method: 'POST' });
      url = regenRes.pdf_url;
    }

    const modal = document.getElementById('pdf-view-modal');
    const iframe = document.getElementById('pdf-viewer-iframe');
    iframe.src = url;
    modal.classList.remove('hidden');
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

function closePdfViewModal() {
  document.getElementById('pdf-view-modal').classList.add('hidden');
  document.getElementById('pdf-viewer-iframe').src = '';
}

async function cancelInvoice(id) {
  if (!confirm('Are you sure you want to CANCEL this tax invoice? Stock quantities will be returned/restored automatically. This action cannot be undone.')) return;
  try {
    await apiFetch(`/invoices/${id}/cancel`, { method: 'PUT' });
    showToast('Invoice cancelled and stock quantities restored!');
    loadInvoices();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function emailInvoice(id) {
  showToast('Processing email dispatch...', 'envelope');
  try {
    const res = await apiFetch(`/invoices/${id}/email`, { method: 'POST' });
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// PURCHASES RECEIPT
async function loadPurchases() {
  try {
    const res = await apiFetch('/purchases');
    const list = document.getElementById('purchases-list');
    list.innerHTML = res.data.map(p => `
      <tr class="hover:bg-slate-50 transition">
        <td class="px-6 py-4 font-mono text-xs">${new Date(p.purchase_date).toLocaleDateString('en-GB')}</td>
        <td class="px-6 py-4 font-semibold text-slate-800 text-sm">${escapeHTML(p.supplier_name)}</td>
        <td class="px-6 py-4 font-mono font-semibold text-xs">${escapeHTML(p.invoice_ref)}</td>
        <td class="px-6 py-4 font-mono font-semibold text-xs">₹${Number(p.total_amount).toFixed(2)}</td>
        <td class="px-6 py-4 text-right">
          <button onclick="viewPurchaseDetails('${p.id}')" class="text-indigo-600 hover:text-indigo-900 font-medium text-xs">View Details</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="5" class="text-center py-8 text-slate-400">No purchase entries recorded yet.</td></tr>`;

    // Fetch master suppliers & products
    const [supRes, prodRes] = await Promise.all([
      apiFetch('/suppliers'),
      apiFetch('/products')
    ]);
    suppliersListGlobal = supRes.data;
    productsListGlobal = prodRes.data;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

function openPurchaseCreateModal() {
  const modal = document.getElementById('purchase-create-modal');
  const form = document.getElementById('purchase-create-form');
  form.reset();

  const supSelect = form.supplier_id;
  supSelect.innerHTML = '<option value="">-- Choose Supplier --</option>' +
    suppliersListGlobal.map(s => `<option value="${s.id}">${escapeHTML(s.name)}</option>`).join('');

  form.purchase_date.value = new Date().toISOString().split('T')[0];

  document.getElementById('purchase-lines-body').innerHTML = '';
  addPurchaseLineRow();

  recalculatePurchaseTotal();
  modal.classList.remove('hidden');
}

function closePurchaseCreateModal() {
  document.getElementById('purchase-create-modal').classList.add('hidden');
}

function addPurchaseLineRow() {
  const body = document.getElementById('purchase-lines-body');
  const row = document.createElement('tr');
  row.className = 'purchase-line-row';
  row.innerHTML = `
    <td class="p-2">
      <select name="product_id" onchange="handlePurchaseProductSelect(this)" required class="w-full border rounded p-1 text-sm">
        <option value="">-- Select Product --</option>
        ${productsListGlobal.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}
      </select>
    </td>
    <td class="p-2">
      <input type="number" name="qty" required value="1" min="1" step="1" oninput="recalculatePurchaseTotal()" class="w-full border rounded p-1 text-sm font-mono">
    </td>
    <td class="p-2">
      <input type="number" name="rate" required value="0.00" min="0" step="0.01" oninput="recalculatePurchaseTotal()" class="w-full border rounded p-1 text-sm font-mono">
    </td>
    <td class="p-2 font-mono text-sm font-bold text-slate-700 py-4" name="line_total">
      ₹0.00
    </td>
    <td class="p-2 text-right">
      <button type="button" onclick="removePurchaseLineRow(this)" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-trash-can"></i></button>
    </td>
  `;
  body.appendChild(row);
  recalculatePurchaseTotal();
}

function removePurchaseLineRow(btn) {
  btn.closest('tr').remove();
  recalculatePurchaseTotal();
}

function handlePurchaseProductSelect(select) {
  const prodId = select.value;
  const row = select.closest('tr');
  if (prodId) {
    const product = productsListGlobal.find(p => p.id === prodId);
    if (product) {
      row.querySelector('input[name="rate"]').value = product.default_rate;
    }
  }
  recalculatePurchaseTotal();
}

function recalculatePurchaseTotal() {
  const rows = document.querySelectorAll('.purchase-line-row');
  let total = 0;

  rows.forEach(row => {
    const qty = Number(row.querySelector('input[name="qty"]').value) || 0;
    const rate = Number(row.querySelector('input[name="rate"]').value) || 0;
    const lineTotal = qty * rate;
    row.querySelector('td[name="line_total"]').textContent = `₹${lineTotal.toFixed(2)}`;
    total += lineTotal;
  });

  document.getElementById('create-purchase-total').textContent = `₹${total.toFixed(2)}`;
}

async function handlePurchaseSave(e) {
  e.preventDefault();
  const form = e.target;

  const items = [];
  const rows = document.querySelectorAll('.purchase-line-row');
  rows.forEach(row => {
    const product_id = row.querySelector('select[name="product_id"]').value;
    const qty = Number(row.querySelector('input[name="qty"]').value);
    const rate = Number(row.querySelector('input[name="rate"]').value);
    if (product_id) {
      items.push({ product_id, qty, rate });
    }
  });

  if (items.length === 0) {
    showToast('Please add at least one line item product.', 'exclamation-triangle');
    return;
  }

  const payload = {
    supplier_id: form.supplier_id.value,
    purchase_date: form.purchase_date.value,
    invoice_ref: form.invoice_ref.value,
    items
  };

  try {
    await apiFetch('/purchases', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Purchase recorded successfully! Product stock increased.');
    closePurchaseCreateModal();
    loadPurchases();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function viewPurchaseDetails(id) {
  try {
    const res = await apiFetch(`/purchases/${id}`);
    const p = res.data;
    const detailsHtml = p.items.map(it => `
      ${escapeHTML(it.product_name)}: Qty ${it.qty} @ ₹${Number(it.rate).toFixed(2)} (Total: ₹${Number(it.amount).toFixed(2)})
    `).join('\n');

    alert(`Supplier Ref: ${p.invoice_ref}\nDate: ${new Date(p.purchase_date).toLocaleDateString('en-GB')}\nTotal: ₹${Number(p.total_amount).toFixed(2)}\n\nItems Recieved:\n${detailsHtml}`);
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// CUSTOMER LEDGER STATEMENT
async function loadLedgerScreen() {
  try {
    const res = await apiFetch('/customers');
    const select = document.getElementById('ledger-customer-select');
    select.innerHTML = '<option value="">-- Choose Customer --</option>' +
      res.data.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');

    document.getElementById('ledger-summary').classList.add('hidden');
    document.getElementById('ledger-transactions-list').innerHTML = `
      <tr><td colspan="6" class="text-center py-8 text-slate-400">Select a customer above to generate a statement.</td></tr>
    `;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function loadCustomerLedger() {
  const customerId = document.getElementById('ledger-customer-select').value;
  if (!customerId) {
    showToast('Please select a customer first.', 'exclamation-triangle');
    return;
  }

  try {
    const res = await apiFetch(`/ledger/${customerId}`);
    const ledger = res.data;

    // Show summary cards
    document.getElementById('ledger-summary').classList.remove('hidden');
    document.getElementById('ledger-total-billed').textContent = `₹${ledger.summary.total_invoiced.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('ledger-total-paid').textContent = `₹${ledger.summary.total_paid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('ledger-net-outstanding').textContent = `₹${ledger.summary.outstanding_balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const list = document.getElementById('ledger-transactions-list');
    list.innerHTML = ledger.transactions.map(t => {
      const isInvoice = t.type === 'Invoice';
      const typeClass = isInvoice ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="px-6 py-4 font-mono text-xs">${new Date(t.date).toLocaleDateString('en-GB')}</td>
          <td class="px-6 py-4 text-xs font-bold"><span class="${typeClass} px-2 py-0.5 rounded border">${t.type}</span></td>
          <td class="px-6 py-4 text-slate-800 text-xs font-medium">${escapeHTML(t.reference)}</td>
          <td class="px-6 py-4 font-mono text-xs text-indigo-600 font-semibold">${t.debit > 0 ? '₹' + t.debit.toFixed(2) : '—'}</td>
          <td class="px-6 py-4 font-mono text-xs text-emerald-600 font-semibold">${t.credit > 0 ? '₹' + t.credit.toFixed(2) : '—'}</td>
          <td class="px-6 py-4 font-mono text-xs font-bold text-slate-800">₹${t.running_balance.toFixed(2)}</td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="6" class="text-center py-8 text-slate-400">No transactions recorded for this customer yet.</td></tr>`;
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// TAX SUMMARY & EXPORTS
function loadReportsScreen() {
  document.getElementById('reports-gst-summary').classList.add('hidden');
}

async function loadGSTReport() {
  const year = document.getElementById('report-year').value;
  const month = document.getElementById('report-month').value;

  try {
    const res = await apiFetch(`/reports/gst?year=${year}&month=${month}`);
    const report = res.data;

    document.getElementById('reports-gst-summary').classList.remove('hidden');
    document.getElementById('reports-taxable-total').textContent = `₹${report.summary.taxable_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('reports-cgst-total').textContent = `₹${report.summary.cgst_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('reports-sgst-total').textContent = `₹${report.summary.sgst_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('reports-igst-total').textContent = `₹${report.summary.igst_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('reports-grand-total').textContent = `₹${report.summary.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    showToast(`GST Report fetched for ${year}-${month}. Ready for export.`);
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function downloadGSTReportExcel() {
  const year = document.getElementById('report-year').value;
  const month = document.getElementById('report-month').value;

  try {
    const blob = await apiFetch(`/reports/gst/export?year=${year}&month=${month}`);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GST_Report_${year}_${month}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

async function downloadSalesExcel() {
  try {
    const blob = await apiFetch('/reports/sales/export');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Sales_Ledger_Export.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    showToast(err.message, 'circle-xmark');
  }
}

// BACKUPS & RESTORE SYSTEM
function triggerManualBackup() {
  window.open(`${API_BASE}/settings/backup?token=${encodeURIComponent(token)}`);
  showToast('Database backup file download triggered.');
}

async function triggerRestoreBackup() {
  const input = document.getElementById('restore-file-input');
  if (!input.files || input.files.length === 0) {
    showToast('Please select a JSON backup file first.', 'exclamation-triangle');
    return;
  }

  const file = input.files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const json = JSON.parse(e.target.result);

      await apiFetch('/settings/restore', {
        method: 'POST',
        body: JSON.stringify(json)
      });

      showToast('Database backup file restored successfully!');
      input.value = '';
      loadSettingsAndLogs();
    } catch (err) {
      showToast('Invalid backup file payload format: ' + err.message, 'circle-xmark');
    }
  };

  reader.readAsText(file);
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
    const res = await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // Save updated token
    if (res.token) {
      token = res.token;
      localStorage.setItem('token', token);
    }

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
