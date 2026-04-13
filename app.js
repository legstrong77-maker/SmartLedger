// ============================================================
// SmartLedger — 前端應用 v2 (快速 + 本地快取)
// ============================================================

// 👇👇👇 如果你不想在每台新設備重新輸入網址，請把你的 API 網址填在這裡 👇👇👇
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwsJ12UiOXgpvlUngD8Ld8OfkaWx0CLwugE_yABDYMuuKgcgIApaZWQTXAUJsnTyisy/exec'; // 例如: 'https://script.google.com/macros/s/AKfyc.../exec'

// ===== 狀態 =====
const state = {
  apiUrl: GAS_API_URL || localStorage.getItem('sl_apiUrl') || '',
  user: JSON.parse(localStorage.getItem('sl_user') || 'null'),
  currentPage: 'record',
  recordType: 'expense',
  selectedCategory: '',
  categories: JSON.parse(localStorage.getItem('sl_categories') || '[]'),
  recentExpenses: JSON.parse(localStorage.getItem('sl_recent') || '[]'),
  allExpenses: [],
  dashboardData: null,
  settings: JSON.parse(localStorage.getItem('sl_settings') || '{}'),
  selectedMonth: new Date().toISOString().slice(0, 7),
  aiResult: null,
  pendingImage: null,
  editType: 'expense',
  editCategory: '',
  addCategoryType: 'expense',
};

const ALL_CURRENCIES = [
  { code: 'TWD', name: '新台幣', symbol: 'NT$' },
  { code: 'USD', name: '美元', symbol: '$' },
  { code: 'JPY', name: '日圓', symbol: '¥' },
  { code: 'CNY', name: '人民幣', symbol: '¥' },
];

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', init);

function init() {
  const now = new Date();
  const dateStr = formatDateLocal(now);
  const timeStr = now.toTimeString().slice(0, 5);
  const dateInput = document.getElementById('manual-date');
  const timeInput = document.getElementById('manual-time');
  if (dateInput) dateInput.value = dateStr;
  if (timeInput) timeInput.value = timeStr;

  const theme = localStorage.getItem('sl_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);

  if (!state.apiUrl) {
    showPage('setup');
  } else if (!state.user) {
    showPage('login');
  } else {
    showPage('main');
  }
}

// ===== 頁面流程 =====
function showPage(page) {
  document.getElementById('setup-page').classList.toggle('hidden', page !== 'setup');
  document.getElementById('login-page').classList.toggle('hidden', page !== 'login');
  document.getElementById('main-app').classList.toggle('hidden', page !== 'main');

  if (page === 'main') {
    document.getElementById('header-greeting').textContent = `嗨，${state.user.name}`;
    // 先用快取立即渲染
    if (state.categories.length > 0) {
      renderCategoryGrid();
      renderCurrencySelector();
    }
    if (state.recentExpenses.length > 0) {
      renderRecentGrouped(state.recentExpenses);
    }
    navigate('record');
    // 背景更新
    loadInitialData();
  }
}

// ===== Setup =====
async function handleSetup() {
  const urlInput = document.getElementById('setup-api-url');
  const url = urlInput.value.trim();
  const errorEl = document.getElementById('setup-error');
  const btn = document.getElementById('setup-connect-btn');

  if (!url) { showError(errorEl, '請輸入 API 網址'); return; }

  setBtnLoading(btn, true);
  errorEl.classList.add('hidden');

  try {
    const res = await apiGet({ action: 'ping' }, url);
    if (res.success) {
      state.apiUrl = url;
      localStorage.setItem('sl_apiUrl', url);
      showPage('login');
      showToast('連接成功！');
    } else {
      showError(errorEl, res.error || '連接失敗');
    }
  } catch (err) {
    showError(errorEl, '無法連接，請確認網址是否正確');
  } finally {
    setBtnLoading(btn, false);
  }
}

function resetApiUrl() {
  localStorage.removeItem('sl_apiUrl');
  state.apiUrl = '';
  showPage('setup');
}

// ===== Login / Register =====
let loginMode = 'login';

function switchLoginTab(mode) {
  loginMode = mode;
  document.querySelectorAll('.login-tabs .tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === mode);
  });
  document.getElementById('login-btn').querySelector('.btn-text').textContent =
    mode === 'login' ? '登入' : '註冊';
}

async function handleAuth() {
  const name = document.getElementById('login-name').value.trim();
  const pin = document.getElementById('login-pin').value.trim();
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  if (!name || !pin) { showError(errorEl, '請填寫所有欄位'); return; }

  setBtnLoading(btn, true);
  errorEl.classList.add('hidden');

  try {
    let res;
    if (loginMode === 'login') {
      res = await apiGet({ action: 'login', name, pin });
    } else {
      res = await apiPost({ action: 'register', name, pin });
    }
    if (res.success && res.user) {
      state.user = res.user;
      localStorage.setItem('sl_user', JSON.stringify(res.user));
      showPage('main');
      showToast(loginMode === 'login' ? '登入成功！' : '註冊成功！');
    } else {
      showError(errorEl, res.error || '操作失敗');
    }
  } catch (err) {
    showError(errorEl, '網路錯誤，請稍後再試');
  } finally {
    setBtnLoading(btn, false);
  }
}

function handleLogout() {
  state.user = null;
  localStorage.removeItem('sl_user');
  localStorage.removeItem('sl_categories');
  localStorage.removeItem('sl_recent');
  localStorage.removeItem('sl_settings');
  showPage('login');
  showToast('已登出');
}

// ===== Navigation =====
function navigate(page) {
  state.currentPage = page;
  ['record', 'dashboard', 'history', 'settings'].forEach((p) => {
    const el = document.getElementById(p + '-page');
    if (el) {
      el.classList.toggle('hidden', p !== page);
      if (p === page) el.classList.add('page-transition');
    }
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  if (page === 'record') {
    renderCategoryGrid();
    renderRecentGrouped(state.recentExpenses);
    loadRecentExpenses(); // background refresh
  } else if (page === 'dashboard') {
    loadDashboard();
  } else if (page === 'history') {
    loadAllExpenses();
    populateFilterCategories();
  } else if (page === 'settings') {
    renderSettings();
  }
}

// ===== 資料載入 =====
async function loadInitialData() {
  try {
    const [catRes, settingsRes] = await Promise.all([
      apiGet({ action: 'getCategories', userId: state.user.id }),
      apiGet({ action: 'getSettings', userId: state.user.id }),
    ]);
    if (catRes.success) {
      state.categories = catRes.categories;
      localStorage.setItem('sl_categories', JSON.stringify(catRes.categories));
      renderCategoryGrid();
    }
    if (settingsRes.success) {
      state.settings = settingsRes.settings;
      localStorage.setItem('sl_settings', JSON.stringify(settingsRes.settings));
    }
    renderCurrencySelector();
  } catch (err) {
    console.error('載入初始資料失敗:', err);
  }
}

async function loadRecentExpenses() {
  try {
    const res = await apiGet({
      action: 'getExpenses',
      userId: state.user.id,
      limit: '20',
    });
    if (res.success) {
      state.recentExpenses = res.expenses;
      localStorage.setItem('sl_recent', JSON.stringify(res.expenses));
      if (state.currentPage === 'record') {
        renderRecentGrouped(res.expenses);
      }
    }
  } catch (err) {
    console.error('載入最近記錄失敗:', err);
  }
}

async function loadAllExpenses() {
  const filterMonth = document.getElementById('filter-month');
  if (filterMonth && !filterMonth.value) filterMonth.value = state.selectedMonth;

  try {
    const month = filterMonth ? filterMonth.value : state.selectedMonth;
    const res = await apiGet({
      action: 'getExpenses', userId: state.user.id, month,
    });
    if (res.success) {
      state.allExpenses = res.expenses;
      filterHistory();
    }
  } catch (err) {
    console.error('載入歷史記錄失敗:', err);
  }
}

async function loadDashboard() {
  updateMonthLabel();

  const cacheKey = `sl_dash_${state.selectedMonth}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      state.dashboardData = JSON.parse(cached);
      renderDashboard();
    } catch (e) {}
  }

  // 顯示 loading 指示
  showDashboardLoading(!cached);

  try {
    const res = await apiGet({
      action: 'getDashboard', userId: state.user.id, month: state.selectedMonth,
    });
    if (res.success) {
      state.dashboardData = res.dashboard;
      localStorage.setItem(cacheKey, JSON.stringify(res.dashboard));
      renderDashboard();
    }
  } catch (err) {
    console.error('載入儀表板失敗:', err);
    if (!cached) showToast('載入儀表板失敗');
  } finally {
    hideDashboardLoading();
  }
}

function showDashboardLoading(showSkeleton) {
  const indicator = document.getElementById('dashboard-loading');
  if (indicator) indicator.classList.remove('hidden');
  if (showSkeleton) {
    // 如果沒有快取，顯示佔位文字
    document.getElementById('summary-expense').textContent = '載入中...';
    document.getElementById('summary-income').textContent = '載入中...';
    document.getElementById('summary-net').textContent = '—';
    document.getElementById('summary-count').textContent = '—';
  }
}

function hideDashboardLoading() {
  const indicator = document.getElementById('dashboard-loading');
  if (indicator) indicator.classList.add('hidden');
}

// ===== Record Type =====
function setRecordType(type) {
  state.recordType = type;
  document.querySelectorAll('.manual-form .toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  state.selectedCategory = '';
  renderCategoryGrid();
}

// ===== Category Grid =====
function renderCategoryGrid() {
  const grid = document.getElementById('category-grid');
  if (!grid) return;
  const cats = state.categories.filter((c) => c.type === state.recordType && c.enabled);
  grid.innerHTML = cats.map((cat) => `
    <button class="cat-btn ${state.selectedCategory === cat.name ? 'selected' : ''}"
            onclick="selectCategory('${escapeHtml(cat.name)}')"
            style="--cat-color: ${cat.color}">
      <span class="cat-emoji">${cat.emoji}</span>
      <span>${cat.name}</span>
    </button>
  `).join('');
}

function selectCategory(name) {
  state.selectedCategory = name;
  renderCategoryGrid();
}

// ===== Manual Expense Submit (Optimistic) =====
async function submitManualExpense() {
  const amount = document.getElementById('manual-amount').value;
  const note = document.getElementById('manual-note').value.trim();
  const date = document.getElementById('manual-date').value;
  const time = document.getElementById('manual-time').value;
  const currency = document.getElementById('manual-currency').value;
  const btn = document.getElementById('manual-submit-btn');

  if (!amount || parseFloat(amount) <= 0) { showToast('請輸入金額'); return; }
  if (!state.selectedCategory) { showToast('請選擇分類'); return; }

  // Optimistic UI: 立即加入列表
  const optimisticExpense = {
    id: 'temp_' + Date.now(),
    userId: state.user.id,
    type: state.recordType,
    category: state.selectedCategory,
    amount: parseFloat(amount),
    currency, note, date, time,
    inputMethod: 'manual',
    imageUrl: '', imageId: '', originalText: '',
  };
  state.recentExpenses.unshift(optimisticExpense);
  renderRecentGrouped(state.recentExpenses);
  showToast('記帳成功！');
  resetForm();

  // 背景提交到 server
  const data = {
    action: 'addExpense', userId: state.user.id,
    type: state.recordType, category: state.selectedCategory,
    amount: parseFloat(amount), currency, note, date, time,
    inputMethod: 'manual',
  };

  if (state.pendingImage) {
    try {
      const imgRes = await apiPost({
        action: 'uploadImage', image: state.pendingImage,
        fileName: `receipt_${Date.now()}.jpg`,
      });
      if (imgRes.success) {
        data.imageUrl = imgRes.imageUrl;
        data.imageId = imgRes.fileId;
      }
    } catch (err) {}
  }

  try {
    await apiPost(data);
    loadRecentExpenses(); // sync with server
  } catch (err) {
    showToast('同步失敗，請檢查網路');
  }
}

function resetForm() {
  document.getElementById('manual-amount').value = '';
  document.getElementById('manual-note').value = '';
  const now = new Date();
  document.getElementById('manual-date').value = formatDateLocal(now);
  document.getElementById('manual-time').value = now.toTimeString().slice(0, 5);
  state.selectedCategory = '';
  state.pendingImage = null;
  renderCategoryGrid();
  const preview = document.querySelector('.photo-preview');
  if (preview) preview.remove();
}

// ===== Voice Input =====
let recognition = null;
let isRecording = false;

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('你的瀏覽器不支援語音輸入，請使用 Chrome 或 Edge'); return null; }
  const rec = new SR();
  rec.lang = 'zh-TW';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  return rec;
}

function startVoice(event) {
  if (event && event.preventDefault) event.preventDefault();
  if (isRecording) return;
  if (!recognition) { recognition = initSpeechRecognition(); if (!recognition) return; }
  isRecording = true;
  const btn = document.getElementById('voice-btn');
  const status = document.getElementById('voice-status');
  const result = document.getElementById('voice-result');
  btn.classList.add('recording');
  status.textContent = '正在聆聽...';
  result.textContent = '';

  recognition.onresult = (event) => {
    let t = '';
    for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript;
    result.textContent = t;
  };
  recognition.onend = () => {
    stopVoiceUI();
    const text = result.textContent.trim();
    if (text) parseVoiceInput(text);
  };
  recognition.onerror = (event) => {
    stopVoiceUI();
    if (event.error === 'not-allowed') showToast('請允許麥克風權限');
    else if (event.error !== 'aborted') showToast('語音辨識錯誤: ' + event.error);
  };
  try { recognition.start(); } catch (err) { stopVoiceUI(); }
}

function stopVoice(event) {
  if (event && event.preventDefault) event.preventDefault();
  if (!isRecording || !recognition) return;
  try { recognition.stop(); } catch (err) {}
}

function stopVoiceUI() {
  isRecording = false;
  document.getElementById('voice-btn').classList.remove('recording');
  document.getElementById('voice-status').textContent = '按住說話';
}

async function parseVoiceInput(text) {
  showLoading('AI 正在解析...');
  try {
    const res = await apiPost({
      action: 'parseNaturalLanguage', userId: state.user.id, text,
    });
    hideLoading();
    if (res.success && res.parsed) {
      state.aiResult = { ...res.parsed, originalText: text };
      showAiResult(res.parsed);
    } else {
      showToast(res.error || '解析失敗');
    }
  } catch (err) {
    hideLoading();
    showToast('網路錯誤');
  }
}

// ===== AI Result =====
function showAiResult(parsed) {
  const card = document.getElementById('ai-result-card');
  const content = document.getElementById('ai-result-content');
  const catObj = state.categories.find((c) => c.name === parsed.category) || {};

  content.innerHTML = `
    <div class="ai-field">
      <span class="ai-field-label">類型</span>
      <span class="ai-field-value">${parsed.type === 'income' ? '💚 收入' : '❤️ 支出'}</span>
    </div>
    <div class="ai-field">
      <span class="ai-field-label">分類</span>
      <span class="ai-field-value">${catObj.emoji || '📌'} ${parsed.category}</span>
    </div>
    <div class="ai-field">
      <span class="ai-field-label">金額</span>
      <span class="ai-field-value" style="font-size:1.2rem">$${formatNumber(parsed.amount)}</span>
    </div>
    <div class="ai-field">
      <span class="ai-field-label">備註</span>
      <span class="ai-field-value">${escapeHtml(parsed.note || '')}</span>
    </div>
    <div class="ai-field">
      <span class="ai-field-label">日期</span>
      <span class="ai-field-value">${parsed.date}</span>
    </div>
  `;
  card.classList.remove('hidden');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function confirmAiResult() {
  if (!state.aiResult) return;

  // Optimistic UI
  const opt = {
    id: 'temp_' + Date.now(),
    userId: state.user.id,
    type: state.aiResult.type || 'expense',
    category: state.aiResult.category,
    amount: state.aiResult.amount,
    currency: 'TWD',
    note: state.aiResult.note || '',
    date: state.aiResult.date,
    time: new Date().toTimeString().slice(0, 5),
    inputMethod: 'voice',
    originalText: state.aiResult.originalText || '',
    imageUrl: state.aiResult.imageUrl || '',
    imageId: state.aiResult.imageId || '',
  };
  state.recentExpenses.unshift(opt);
  renderRecentGrouped(state.recentExpenses);
  showToast('記帳成功！');
  clearAiResult();
  document.getElementById('voice-result').textContent = '';

  // Background sync
  try {
    await apiPost({
      action: 'addExpense', ...opt, userId: state.user.id,
    });
    loadRecentExpenses();
  } catch (err) {
    showToast('同步失敗');
  }
}

function editAiResult() {
  if (!state.aiResult) return;
  const type = state.aiResult.type || 'expense';
  setRecordType(type);
  state.selectedCategory = state.aiResult.category || '';
  renderCategoryGrid();
  document.getElementById('manual-amount').value = state.aiResult.amount || '';
  document.getElementById('manual-note').value = state.aiResult.note || '';
  if (state.aiResult.date) document.getElementById('manual-date').value = state.aiResult.date;
  clearAiResult();
  document.querySelector('.manual-form').scrollIntoView({ behavior: 'smooth' });
}

function clearAiResult() {
  state.aiResult = null;
  document.getElementById('ai-result-card').classList.add('hidden');
}

// ===== Photo / Receipt =====
function capturePhoto() {
  document.getElementById('photo-input').click();
}

async function handlePhotoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;
  const base64 = await compressImage(file, 1024, 0.7);
  state.pendingImage = base64;
  showPhotoPreview(base64);
  event.target.value = '';

  showLoading('AI 正在辨識收據...');
  try {
    const [uploadRes, ocrRes] = await Promise.all([
      apiPost({ action: 'uploadImage', image: base64, fileName: `receipt_${Date.now()}.jpg` }),
      apiPost({ action: 'parseReceipt', userId: state.user.id, image: base64 }),
    ]);
    hideLoading();
    if (ocrRes.success && ocrRes.parsed) {
      state.aiResult = {
        ...ocrRes.parsed, originalText: '收據掃描',
        imageUrl: uploadRes.success ? uploadRes.imageUrl : '',
        imageId: uploadRes.success ? uploadRes.fileId : '',
      };
      showAiResult(ocrRes.parsed);
    } else {
      showToast(ocrRes.error || '辨識失敗，請手動輸入');
    }
  } catch (err) {
    hideLoading();
    showToast('辨識失敗，請手動輸入');
  }
}

function showPhotoPreview(base64) {
  const existing = document.querySelector('.photo-preview');
  if (existing) existing.remove();
  const preview = document.createElement('div');
  preview.className = 'photo-preview';
  preview.innerHTML = `<img src="${base64}" alt="收據預覽" /><button class="remove-photo" onclick="removePhoto()">✕</button>`;
  document.querySelector('.action-row').after(preview);
}

function removePhoto() {
  state.pendingImage = null;
  const p = document.querySelector('.photo-preview');
  if (p) p.remove();
}

function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ===== Recent Expenses — 按日分組 =====
function renderRecentGrouped(expenses) {
  const container = document.getElementById('recent-expenses');
  if (!container) return;

  if (!expenses || expenses.length === 0) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">📝</span><p>還沒有任何記錄</p></div>';
    return;
  }

  // Group by date
  const groups = {};
  expenses.forEach((exp) => {
    const d = normalizeDate(exp.date);
    if (!groups[d]) groups[d] = [];
    groups[d].push(exp);
  });

  let html = '';
  const sortedDates = Object.keys(groups).sort().reverse();

  for (const date of sortedDates) {
    const items = groups[date];
    const dayExpense = items.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const dayIncome = items.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);

    // 日期標題 + 日花費總額
    const displayDate = formatDisplayDate(date);
    html += `<div class="day-group">`;
    html += `<div class="day-header">`;
    html += `<span class="day-date">${displayDate}</span>`;
    html += `<div class="day-totals">`;
    if (dayExpense > 0) html += `<span class="day-expense">-$${formatNumber(dayExpense)}</span>`;
    if (dayIncome > 0) html += `<span class="day-income">+$${formatNumber(dayIncome)}</span>`;
    html += `</div></div>`;

    // 細項
    html += `<div class="day-items">`;
    items.forEach((exp) => {
      const catObj = state.categories.find((c) => c.name === exp.category) || {};
      const sign = exp.type === 'income' ? '+' : '-';
      const amtClass = exp.type === 'income' ? 'income' : 'expense';
      html += `
        <div class="expense-item" 
             onmousedown="handlePressStart(event, '${exp.id}')" 
             onmouseup="handlePressEnd()" 
             onmouseleave="handlePressEnd()"
             ontouchstart="handlePressStart(event, '${exp.id}')" 
             ontouchend="handlePressEnd()" 
             ontouchmove="handlePressMove()"
             oncontextmenu="handleContextMenu(event, '${exp.id}')">
          <div class="expense-emoji" style="background:${catObj.color || '#555'}22">${catObj.emoji || '📌'}</div>
          <div class="expense-info">
            <div class="expense-category">${escapeHtml(exp.category)}</div>
            <div class="expense-note">${escapeHtml(exp.note || '')}</div>
          </div>
          ${exp.imageUrl ? `<img class="expense-thumb" src="${exp.imageUrl}" alt="" loading="lazy" />` : ''}
          <div class="expense-right">
            <div class="expense-amount ${amtClass}">${sign}$${formatNumber(exp.amount)}</div>
          </div>
        </div>`;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html;
}

function normalizeDate(dateStr) {
  if (!dateStr) return '';
  // 如果已經是 YYYY-MM-DD 就直接回傳
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // 嘗試解析
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return formatDateLocal(d);
  } catch (e) {}
  return String(dateStr);
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
    const today = formatDateLocal(new Date());
    const yesterday = formatDateLocal(new Date(Date.now() - 86400000));
    if (dateStr === today) return `今天 (${m}/${d} 週${weekday})`;
    if (dateStr === yesterday) return `昨天 (${m}/${d} 週${weekday})`;
    return `${m}/${d} 週${weekday}`;
  } catch (e) {
    return dateStr;
  }
}

// ===== History — Grouped List =====
function renderGroupedExpenseList(expenses, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const emptyEl = document.getElementById('history-empty');

  if (!expenses || expenses.length === 0) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  const groups = {};
  expenses.forEach((exp) => {
    const d = normalizeDate(exp.date);
    if (!groups[d]) groups[d] = [];
    groups[d].push(exp);
  });

  let html = '';
  for (const date of Object.keys(groups).sort().reverse()) {
    const items = groups[date];
    const dayExpense = items.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
    const dayIncome = items.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const displayDate = formatDisplayDate(date);

    html += `<div class="day-group">`;
    html += `<div class="day-header">`;
    html += `<span class="day-date">${displayDate}</span>`;
    html += `<div class="day-totals">`;
    if (dayExpense > 0) html += `<span class="day-expense">-$${formatNumber(dayExpense)}</span>`;
    if (dayIncome > 0) html += `<span class="day-income">+$${formatNumber(dayIncome)}</span>`;
    html += `</div></div>`;

    html += `<div class="day-items">`;
    items.forEach((exp) => {
      const catObj = state.categories.find((c) => c.name === exp.category) || {};
      const sign = exp.type === 'income' ? '+' : '-';
      html += `
        <div class="expense-item" 
             onmousedown="handlePressStart(event, '${exp.id}')" 
             onmouseup="handlePressEnd()" 
             onmouseleave="handlePressEnd()"
             ontouchstart="handlePressStart(event, '${exp.id}')" 
             ontouchend="handlePressEnd()" 
             ontouchmove="handlePressMove()"
             oncontextmenu="handleContextMenu(event, '${exp.id}')">
          <div class="expense-emoji" style="background:${catObj.color || '#555'}22">${catObj.emoji || '📌'}</div>
          <div class="expense-info">
            <div class="expense-category">${escapeHtml(exp.category)}</div>
            <div class="expense-note">${escapeHtml(exp.note || '')}</div>
          </div>
          <div class="expense-right">
            <div class="expense-amount ${exp.type}">${sign}$${formatNumber(exp.amount)}</div>
            <div class="expense-date">${exp.time || ''}</div>
          </div>
        </div>`;
    });
    html += `</div></div>`;
  }
  container.innerHTML = html;
}

// ===== History Filter =====
function toggleHistoryFilter() {
  document.getElementById('history-filters').classList.toggle('hidden');
}

function populateFilterCategories() {
  const select = document.getElementById('filter-category');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">全部分類</option>';
  state.categories.filter((c) => c.enabled).forEach((cat) => {
    select.innerHTML += `<option value="${escapeHtml(cat.name)}">${cat.emoji} ${cat.name}</option>`;
  });
  select.value = current;
}

function filterHistory() {
  const search = (document.getElementById('history-search')?.value || '').toLowerCase();
  const type = document.getElementById('filter-type')?.value || '';
  const category = document.getElementById('filter-category')?.value || '';
  let filtered = state.allExpenses;
  if (search) filtered = filtered.filter((e) => (e.note || '').toLowerCase().includes(search) || (e.category || '').toLowerCase().includes(search));
  if (type) filtered = filtered.filter((e) => e.type === type);
  if (category) filtered = filtered.filter((e) => e.category === category);
  renderGroupedExpenseList(filtered, 'history-list');
}

// ===== Edit Expense =====
function openEditExpense(id) {
  if (id.startsWith('temp_')) { showToast('此筆正在同步中...'); return; }
  const exp = state.recentExpenses.find((e) => e.id === id) || state.allExpenses.find((e) => e.id === id);
  if (!exp) return;

  document.getElementById('edit-id').value = exp.id;
  document.getElementById('edit-amount').value = exp.amount;
  document.getElementById('edit-note').value = exp.note || '';
  document.getElementById('edit-date').value = exp.date;
  document.getElementById('edit-time').value = exp.time || '';
  state.editType = exp.type || 'expense';
  state.editCategory = exp.category || '';

  document.querySelectorAll('#edit-expense-modal .toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === state.editType);
  });
  renderEditCategoryGrid();
  document.getElementById('edit-expense-modal').classList.remove('hidden');
}

function setEditType(type) {
  state.editType = type;
  state.editCategory = '';
  document.querySelectorAll('#edit-expense-modal .toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  renderEditCategoryGrid();
}

function renderEditCategoryGrid() {
  const grid = document.getElementById('edit-category-grid');
  if (!grid) return;
  const cats = state.categories.filter((c) => c.type === state.editType && c.enabled);
  grid.innerHTML = cats.map((cat) => `
    <button class="cat-btn ${state.editCategory === cat.name ? 'selected' : ''}"
            onclick="state.editCategory='${escapeHtml(cat.name)}';renderEditCategoryGrid();">
      <span class="cat-emoji">${cat.emoji}</span>
      <span>${cat.name}</span>
    </button>
  `).join('');
}

async function saveEditExpense() {
  const id = document.getElementById('edit-id').value;
  const amount = document.getElementById('edit-amount').value;
  const note = document.getElementById('edit-note').value.trim();
  const date = document.getElementById('edit-date').value;
  const time = document.getElementById('edit-time').value;
  if (!amount || !state.editCategory) { showToast('請填寫金額和分類'); return; }

  showLoading('儲存中...');
  try {
    const res = await apiPost({
      action: 'updateExpense', userId: state.user.id, id,
      type: state.editType, category: state.editCategory,
      amount: parseFloat(amount), note, date, time,
    });
    hideLoading();
    if (res.success) {
      showToast('已更新');
      closeModal();
      refreshCurrentPage();
    } else showToast(res.error || '更新失敗');
  } catch (err) { hideLoading(); showToast('網路錯誤'); }
}

async function deleteCurrentExpense() {
  const id = document.getElementById('edit-id').value;
  if (!confirm('確定要刪除這筆記錄嗎？')) return;
  showLoading('刪除中...');
  try {
    const res = await apiPost({ action: 'deleteExpense', userId: state.user.id, id });
    hideLoading();
    if (res.success) { showToast('已刪除'); closeModal(); refreshCurrentPage(); }
    else showToast(res.error || '刪除失敗');
  } catch (err) { hideLoading(); showToast('網路錯誤'); }
}

// ===== Dashboard =====
let dailyChartInstance = null;
let categoryChartInstance = null;

function changeMonth(delta) {
  const [y, m] = state.selectedMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta);
  state.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  loadDashboard();
}

function updateMonthLabel() {
  const [y, m] = state.selectedMonth.split('-');
  const label = document.getElementById('dashboard-month-label');
  if (label) label.textContent = `${y} 年 ${parseInt(m)} 月`;
}

function renderDashboard() {
  const d = state.dashboardData;
  if (!d) return;

  document.getElementById('summary-expense').textContent = `$${formatNumber(d.totalExpense)}`;
  document.getElementById('summary-income').textContent = `$${formatNumber(d.totalIncome)}`;
  const netEl = document.getElementById('summary-net');
  netEl.textContent = `${d.netAmount >= 0 ? '+' : ''}$${formatNumber(Math.abs(d.netAmount))}`;
  netEl.style.color = d.netAmount >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  document.getElementById('summary-count').textContent = d.count;

  renderDailyChart(d);
  renderCategoryChart(d);
  renderCategoryBreakdown(d);
  renderTopExpenses(d);
}

function renderDailyChart(d) {
  const canvas = document.getElementById('daily-chart');
  if (!canvas) return;

  const [y, m] = state.selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const labels = [], expenseData = [], incomeData = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const dayStr = String(i).padStart(2, '0');
    labels.push(`${i}`);
    expenseData.push(d.dailyExpense[dayStr] || 0);
    incomeData.push(d.dailyIncome[dayStr] || 0);
  }
  if (dailyChartInstance) dailyChartInstance.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#8b949e' : '#656d76';

  dailyChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: '支出', data: expenseData, backgroundColor: 'rgba(248, 81, 73, 0.6)', borderRadius: 4, borderSkipped: false },
        { label: '收入', data: incomeData, backgroundColor: 'rgba(63, 185, 80, 0.6)', borderRadius: 4, borderSkipped: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { labels: { color: textColor, usePointStyle: true, pointStyle: 'circle' } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 15 } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, callback: (v) => (v >= 1000 ? `${v / 1000}k` : v) } },
      },
    },
  });
}

function renderCategoryChart(d) {
  const canvas = document.getElementById('category-chart');
  if (!canvas) return;
  const entries = Object.entries(d.categoryExpense).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) { if (categoryChartInstance) categoryChartInstance.destroy(); return; }

  const labels = entries.map((e) => e[0]);
  const data = entries.map((e) => e[1]);
  const colors = entries.map((e) => {
    const cat = state.categories.find((c) => c.name === e[0]);
    return cat ? cat.color : '#95A5A6';
  });
  if (categoryChartInstance) categoryChartInstance.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  categoryChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { color: isDark ? '#8b949e' : '#656d76', usePointStyle: true, pointStyle: 'circle', padding: 12, font: { size: 12 } } },
        tooltip: { callbacks: { label: (ctx) => ` $${formatNumber(ctx.parsed)} (${Math.round((ctx.parsed / data.reduce((a, b) => a + b, 0)) * 100)}%)` } },
      },
    },
  });
}

function renderCategoryBreakdown(d) {
  const container = document.getElementById('category-breakdown');
  if (!container) return;
  const entries = Object.entries(d.categoryExpense).sort((a, b) => b[1] - a[1]);
  const maxAmount = entries.length > 0 ? entries[0][1] : 1;

  container.innerHTML = entries.length === 0
    ? '<div class="empty-state"><p>本月沒有支出記錄</p></div>'
    : entries.map((e) => {
        const cat = state.categories.find((c) => c.name === e[0]) || {};
        const pct = d.totalExpense > 0 ? Math.round((e[1] / d.totalExpense) * 100) : 0;
        const barWidth = Math.round((e[1] / maxAmount) * 100);
        const budget = d.budgets && d.budgets[e[0]];
        let budgetHtml = '';
        if (budget && budget > 0) {
          const bp = Math.round((e[1] / budget) * 100);
          const bc = bp > 100 ? 'var(--accent-red)' : bp > 80 ? 'var(--accent-amber)' : 'var(--accent-green)';
          budgetHtml = `<div class="budget-text" style="color:${bc}">${bp}% 預算 ($${formatNumber(budget)})</div>`;
        }
        return `<div class="breakdown-item">
          <span class="breakdown-emoji">${cat.emoji || '📌'}</span>
          <div class="breakdown-info">
            <div class="breakdown-name">${e[0]}</div>
            <div class="breakdown-bar-track"><div class="breakdown-bar" style="width:${barWidth}%;background:${cat.color || '#95A5A6'}"></div></div>
            ${budgetHtml}
          </div>
          <span class="breakdown-amount">$${formatNumber(e[1])}</span>
          <span class="breakdown-pct">${pct}%</span>
        </div>`;
      }).join('');
}

function renderTopExpenses(d) {
  const container = document.getElementById('top-expenses');
  if (!container) return;
  const top = (d.topExpenses || []).slice(0, 5);
  container.innerHTML = top.length === 0
    ? '<div class="empty-state"><p>本月沒有支出記錄</p></div>'
    : top.map((e, i) => {
        const cat = state.categories.find((c) => c.name === e.category) || {};
        return `<div class="breakdown-item">
          <span class="breakdown-emoji" style="font-size:0.9rem;color:var(--text-muted)">#${i + 1}</span>
          <div class="breakdown-info">
            <div class="breakdown-name">${cat.emoji || ''} ${e.category}</div>
            <div style="font-size:var(--text-xs);color:var(--text-muted)">${e.note || ''} · ${e.date}</div>
          </div>
          <span class="breakdown-amount" style="color:var(--accent-red)">$${formatNumber(e.amount)}</span>
        </div>`;
      }).join('');
}

// ===== Settings =====
function renderSettings() {
  document.getElementById('settings-username').textContent = state.user.name;
  renderCategorySettings();
  renderCurrencySettings();
  renderBudgetSettings();
}

function renderCategorySettings() {
  const expC = document.getElementById('settings-expense-categories');
  const incC = document.getElementById('settings-income-categories');
  expC.innerHTML = state.categories.filter((c) => c.type === 'expense').map(categoryListItem).join('');
  incC.innerHTML = state.categories.filter((c) => c.type === 'income').map(categoryListItem).join('');
}

function categoryListItem(cat) {
  return `<div class="category-list-item">
    <div class="cat-color-dot" style="background:${cat.color}"></div>
    <span class="cat-list-emoji">${cat.emoji}</span>
    <span class="cat-list-name">${cat.name}</span>
    <div class="cat-toggle ${cat.enabled ? 'on' : ''}" onclick="toggleCategoryEnabled('${escapeHtml(cat.name)}','${cat.type}',${!cat.enabled})"></div>
    <button class="cat-delete-btn" onclick="deleteCategoryItem('${escapeHtml(cat.name)}','${cat.type}')">🗑</button>
  </div>`;
}

async function toggleCategoryEnabled(name, type, enabled) {
  const cat = state.categories.find((c) => c.name === name && c.type === type);
  if (cat) cat.enabled = enabled;
  localStorage.setItem('sl_categories', JSON.stringify(state.categories));
  renderCategorySettings();
  try { await apiPost({ action: 'updateCategories', userId: state.user.id, categories: state.categories }); } catch (err) { showToast('更新失敗'); }
}

async function deleteCategoryItem(name, type) {
  if (!confirm(`確定要刪除「${name}」分類嗎？`)) return;
  try {
    const res = await apiPost({ action: 'deleteCategory', userId: state.user.id, name, type });
    if (res.success) {
      state.categories = state.categories.filter((c) => !(c.name === name && c.type === type));
      localStorage.setItem('sl_categories', JSON.stringify(state.categories));
      renderCategorySettings();
      showToast('已刪除');
    }
  } catch (err) { showToast('刪除失敗'); }
}

function showAddCategory(type) {
  state.addCategoryType = type;
  document.getElementById('add-category-title').textContent = `新增${type === 'expense' ? '支出' : '收入'}分類`;
  document.getElementById('new-cat-name').value = '';
  document.getElementById('new-cat-emoji').value = '';
  document.getElementById('new-cat-color').value = '#95A5A6';
  document.getElementById('add-category-modal').classList.remove('hidden');
}

async function submitNewCategory() {
  const name = document.getElementById('new-cat-name').value.trim();
  const emoji = document.getElementById('new-cat-emoji').value.trim() || '📌';
  const color = document.getElementById('new-cat-color').value;
  if (!name) { showToast('請輸入分類名稱'); return; }
  try {
    const res = await apiPost({ action: 'addCategory', userId: state.user.id, type: state.addCategoryType, name, emoji, color });
    if (res.success) {
      state.categories.push({ type: state.addCategoryType, name, emoji, color, sort: 99, enabled: true });
      localStorage.setItem('sl_categories', JSON.stringify(state.categories));
      closeModal();
      renderCategorySettings();
      showToast('分類已新增');
    } else showToast(res.error || '新增失敗');
  } catch (err) { showToast('網路錯誤'); }
}

function renderCurrencySettings() {
  const container = document.getElementById('currency-toggles');
  if (!container) return;
  const enabled = state.settings.enabledCurrencies || ['TWD'];
  container.innerHTML = ALL_CURRENCIES.map((cur) => {
    const isOn = enabled.includes(cur.code);
    return `<div class="currency-row">
      <span class="currency-name">${cur.symbol} ${cur.name} (${cur.code})</span>
      <div class="cat-toggle ${isOn ? 'on' : ''}" onclick="${cur.code === 'TWD' ? '' : `toggleCurrency('${cur.code}',${!isOn})`}" style="${cur.code === 'TWD' ? 'opacity:0.5;cursor:default' : ''}"></div>
    </div>`;
  }).join('');
}

async function toggleCurrency(code, enabled) {
  let currencies = state.settings.enabledCurrencies || ['TWD'];
  if (enabled && !currencies.includes(code)) currencies.push(code);
  else if (!enabled) currencies = currencies.filter((c) => c !== code);
  state.settings.enabledCurrencies = currencies;
  localStorage.setItem('sl_settings', JSON.stringify(state.settings));
  renderCurrencySettings();
  renderCurrencySelector();
  try { await apiPost({ action: 'updateSettings', userId: state.user.id, key: 'enabledCurrencies', value: currencies }); } catch (err) { showToast('更新失敗'); }
}

function renderCurrencySelector() {
  const select = document.getElementById('manual-currency');
  if (!select) return;
  const enabled = state.settings.enabledCurrencies || ['TWD'];
  select.innerHTML = enabled.map((code) => `<option value="${code}">${code}</option>`).join('');
}

function renderBudgetSettings() {
  const container = document.getElementById('budget-settings');
  if (!container) return;
  const budgets = state.settings.budgets || {};
  const expCats = state.categories.filter((c) => c.type === 'expense' && c.enabled);
  container.innerHTML = expCats.map((cat) => `
    <div class="budget-row">
      <span class="budget-cat-name">${cat.emoji} ${cat.name}</span>
      <input type="number" class="budget-input" value="${budgets[cat.name] || ''}" placeholder="不限" inputmode="decimal" onchange="updateBudget('${escapeHtml(cat.name)}', this.value)" />
    </div>
  `).join('');
}

async function updateBudget(category, value) {
  const budgets = state.settings.budgets || {};
  if (value && parseFloat(value) > 0) budgets[category] = parseFloat(value);
  else delete budgets[category];
  state.settings.budgets = budgets;
  localStorage.setItem('sl_settings', JSON.stringify(state.settings));
  try { await apiPost({ action: 'updateSettings', userId: state.user.id, key: 'budgets', value: budgets }); } catch (err) { showToast('更新失敗'); }
}

// ===== Theme =====
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sl_theme', next);
  if (state.currentPage === 'dashboard' && state.dashboardData) renderDashboard();
}

// ===== Modal =====
function closeModal() {
  document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.add('hidden'));
}
function closeModalOnOverlay(event) {
  if (event.target.classList.contains('modal-overlay')) closeModal();
}

// ===== API =====
async function apiGet(params, baseUrl) {
  const url = new URL(baseUrl || state.apiUrl);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.append(k, v); });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(data, baseUrl) {
  const res = await fetch(baseUrl || state.apiUrl, { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ===== UI Helpers =====
function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), duration);
}

function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

function setBtnLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  if (text) text.classList.toggle('hidden', loading);
  if (loader) loader.classList.toggle('hidden', !loading);
  btn.disabled = loading;
}

function showLoading(text) {
  document.getElementById('loading-text').textContent = text || '處理中...';
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

function refreshCurrentPage() {
  if (state.currentPage === 'record') loadRecentExpenses();
  else if (state.currentPage === 'history') loadAllExpenses();
  else if (state.currentPage === 'dashboard') loadDashboard();
}

function formatNumber(n) { return Number(n).toLocaleString('zh-TW', { maximumFractionDigits: 0 }); }

function formatDateLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
