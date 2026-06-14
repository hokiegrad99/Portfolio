/**
 * Portfolio Tracker - Core Application Module
 * Handles data persistence, shared utilities, global state, auth, encryption, and dark mode.
 */

// ============================================
// Auth & User Management
// ============================================

const USERS_KEY = 'portfolioTrackerUsers';
const SESSION_KEY = 'portfolioTrackerSession';
const THEME_KEY = 'portfolioTrackerTheme';

function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password, salt) {
  // Use PBKDF2 for password hashing (more secure than simple SHA-256)
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt.match(/.{2}/g).map(b => parseInt(b, 16))),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );
  const exported = await crypto.subtle.exportKey('raw', key);
  const hashArray = Array.from(new Uint8Array(exported));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getUserDataKey(username) {
  return 'portfolioTrackerData_' + username.toLowerCase();
}

function getUserPriceCacheKey(username) {
  return 'portfolioTrackerPriceCache_' + username.toLowerCase();
}

function getCurrentUser() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;
  try {
    const parsed = JSON.parse(session);
    return parsed.username || null;
  } catch (e) {
    return null;
  }
}

function isLoggedIn() {
  return !!getCurrentUser();
}

function logoutUser() {
  localStorage.removeItem(SESSION_KEY);
  appData = getDefaultData();
  window.location.href = 'login.html';
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

async function registerUser(username, password) {
  const users = getUsers();
  const lower = username.toLowerCase().trim();

  if (!lower || !password) {
    return { success: false, message: 'Username and password are required' };
  }

  if (users[lower]) {
    return { success: false, message: 'Username already exists' };
  }

  if (password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters' };
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);

  users[lower] = { passwordHash, salt, createdAt: Date.now() };
  saveUsers(users);

  // Set session
  localStorage.setItem(SESSION_KEY, JSON.stringify({ username: lower }));

  // Check for existing legacy data and migrate it
  const legacyData = localStorage.getItem('portfolioTrackerData');
  if (legacyData) {
    try {
      const parsed = JSON.parse(legacyData);
      if (parsed.portfolios && parsed.portfolios.length > 0) {
        appData = { ...getDefaultData(), ...parsed };
        saveData(appData);
        showToast('Existing data migrated to your new account', 'success');
        return { success: true };
      }
    } catch (e) {
      // ignore invalid legacy data
    }
  }

  // Create default data for this user
  const dataKey = getUserDataKey(lower);
  const defaultData = getDefaultData();
  defaultData.initialized = true;
  localStorage.setItem(dataKey, JSON.stringify(defaultData));

  // Generate sample data
  appData = loadData();
  generateSampleData();

  return { success: true };
}

async function loginUser(username, password) {
  const users = getUsers();
  const lower = username.toLowerCase().trim();
  const user = users[lower];

  if (!user) {
    return { success: false, message: 'Invalid username or password' };
  }

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return { success: false, message: 'Invalid username or password' };
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify({ username: lower }));
  appData = loadData();

  return { success: true };
}

// ============================================
// Encryption (Web Crypto API)
// ============================================

async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const encoded = encoder.encode(JSON.stringify(data));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const result = {
    salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
    data: Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('')
  };

  return JSON.stringify(result);
}

async function decryptData(encryptedJson, password) {
  const parsed = JSON.parse(encryptedJson);
  const salt = new Uint8Array(parsed.salt.match(/.{2}/g).map(b => parseInt(b, 16)));
  const iv = new Uint8Array(parsed.iv.match(/.{2}/g).map(b => parseInt(b, 16)));
  const data = new Uint8Array(parsed.data.match(/.{2}/g).map(b => parseInt(b, 16)));

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

function isEncryptedData(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed && parsed.salt && parsed.iv && parsed.data;
  } catch (e) {
    return false;
  }
}

// ============================================
// Dark Mode
// ============================================

function initTheme() {
  const theme = localStorage.getItem(THEME_KEY) || 'light';
  setTheme(theme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  if (typeof window.refreshPageData === 'function') {
    window.refreshPageData();
  }
}

function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    gridColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    textColor: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipText: isDark ? '#f8fafc' : '#1e293b'
  };
}

function applyChartDarkMode(options) {
  const colors = getChartColors();
  // Clone to avoid mutating the original
  const cloned = JSON.parse(JSON.stringify(options));
  if (cloned.scales) {
    if (cloned.scales.x) {
      if (cloned.scales.x.ticks) cloned.scales.x.ticks.color = colors.textColor;
      if (cloned.scales.x.grid) cloned.scales.x.grid.color = colors.gridColor;
    }
    if (cloned.scales.y) {
      if (cloned.scales.y.ticks) cloned.scales.y.ticks.color = colors.textColor;
      if (cloned.scales.y.grid) cloned.scales.y.grid.color = colors.gridColor;
    }
  }
  if (cloned.plugins && cloned.plugins.legend && cloned.plugins.legend.labels) {
    cloned.plugins.legend.labels.color = colors.textColor;
  }
  if (cloned.plugins && cloned.plugins.tooltip) {
    if (!cloned.plugins.tooltip.backgroundColor) cloned.plugins.tooltip.backgroundColor = colors.tooltipBg;
    if (!cloned.plugins.tooltip.titleColor) cloned.plugins.tooltip.titleColor = colors.tooltipText;
    if (!cloned.plugins.tooltip.bodyColor) cloned.plugins.tooltip.bodyColor = colors.tooltipText;
    if (!cloned.plugins.tooltip.borderColor) cloned.plugins.tooltip.borderColor = colors.gridColor;
    if (!cloned.plugins.tooltip.borderWidth) cloned.plugins.tooltip.borderWidth = 1;
  }
  return cloned;
}

// ============================================
// Data Model
// ============================================

const BROKERAGES = [
  'Vanguard', 'Fidelity', 'Schwab', 'E*Trade', 'Robinhood',
  'TD Ameritrade', 'Merrill Edge', 'Interactive Brokers', 'Other'
];

const TRANSACTION_TYPES = ['initial', 'buy', 'sell', 'dividend'];

const DIVIDEND_TYPES = ['ordinary', 'qualified'];

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function getDefaultData() {
  return {
    portfolios: [],
    holdings: [],
    transactions: [],
    settings: {
      defaultPortfolioId: null,
      gistToken: '',
      gistId: '',
      currency: 'USD'
    },
    initialized: false
  };
}

function loadData() {
  const user = getCurrentUser();
  if (user) {
    const key = getUserDataKey(user);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return getDefaultData();
      const parsed = JSON.parse(raw);
      return { ...getDefaultData(), ...parsed };
    } catch (e) {
      console.error('Failed to load data:', e);
      return getDefaultData();
    }
  }

  // Legacy fallback for non-auth users
  try {
    const raw = localStorage.getItem('portfolioTrackerData');
    if (!raw) return getDefaultData();
    const parsed = JSON.parse(raw);
    return { ...getDefaultData(), ...parsed };
  } catch (e) {
    return getDefaultData();
  }
}

function saveData(data) {
  const user = getCurrentUser();
  if (user) {
    const key = getUserDataKey(user);
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save data:', e);
      showToast('Failed to save data. Storage may be full.', 'error');
    }
  } else {
    // Legacy fallback
    try {
      localStorage.setItem('portfolioTrackerData', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save data:', e);
      showToast('Failed to save data. Storage may be full.', 'error');
    }
  }
}

// Global data reference
let appData = loadData();

// ============================================
// Sample Data
// ============================================

function generateSampleData() {
  const portfolio1 = {
    id: createId(),
    name: 'Retirement - Vanguard',
    brokerage: 'Vanguard'
  };
  const portfolio2 = {
    id: createId(),
    name: 'Taxable - Fidelity',
    brokerage: 'Fidelity'
  };

  const holdings = [
    { id: createId(), portfolioId: portfolio1.id, symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', shares: 150, avgCost: 198.50, currentPrice: 245.30 },
    { id: createId(), portfolioId: portfolio1.id, symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', shares: 200, avgCost: 52.10, currentPrice: 58.75 },
    { id: createId(), portfolioId: portfolio1.id, symbol: 'BND', name: 'Vanguard Total Bond Market ETF', shares: 100, avgCost: 72.30, currentPrice: 68.90 },
    { id: createId(), portfolioId: portfolio2.id, symbol: 'AAPL', name: 'Apple Inc.', shares: 50, avgCost: 145.00, currentPrice: 178.50 },
    { id: createId(), portfolioId: portfolio2.id, symbol: 'MSFT', name: 'Microsoft Corp.', shares: 30, avgCost: 280.00, currentPrice: 335.20 },
    { id: createId(), portfolioId: portfolio2.id, symbol: 'JNJ', name: 'Johnson & Johnson', shares: 40, avgCost: 155.00, currentPrice: 148.30 },
    { id: createId(), portfolioId: portfolio2.id, symbol: 'SCHD', name: 'Schwab US Dividend Equity ETF', shares: 120, avgCost: 65.00, currentPrice: 72.40 },
  ];

  const transactions = [
    // Initial positions
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2022-01-15', type: 'initial', shares: 100, price: 195.00, amount: 0, dividendType: null, notes: 'Opening position' },
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[1].id, date: '2022-01-15', type: 'initial', shares: 150, price: 50.00, amount: 0, dividendType: null, notes: 'Opening position' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2022-03-10', type: 'initial', shares: 30, price: 140.00, amount: 0, dividendType: null, notes: 'Opening position' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2022-03-10', type: 'initial', shares: 20, price: 275.00, amount: 0, dividendType: null, notes: 'Opening position' },

    // Buys
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2023-06-20', type: 'buy', shares: 50, price: 210.00, amount: 0, dividendType: null, notes: 'Added to position' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2023-08-15', type: 'buy', shares: 20, price: 160.00, amount: 0, dividendType: null, notes: 'Added to position' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2023-09-01', type: 'buy', shares: 120, price: 65.00, amount: 0, dividendType: null, notes: 'New position' },

    // Sells
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2024-01-10', type: 'sell', shares: 10, price: 330.00, amount: 0, dividendType: null, notes: 'Trimmed position' },

    // Dividends - VTI
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2023-03-28', type: 'dividend', shares: 0, price: 0, amount: 85.50, dividendType: 'qualified', notes: 'Q1 dividend' },
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2023-06-28', type: 'dividend', shares: 0, price: 0, amount: 92.30, dividendType: 'qualified', notes: 'Q2 dividend' },
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2023-09-27', type: 'dividend', shares: 0, price: 0, amount: 88.75, dividendType: 'qualified', notes: 'Q3 dividend' },
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2023-12-20', type: 'dividend', shares: 0, price: 0, amount: 105.40, dividendType: 'qualified', notes: 'Q4 dividend' },
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2024-03-27', type: 'dividend', shares: 0, price: 0, amount: 95.20, dividendType: 'qualified', notes: 'Q1 dividend' },
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2024-06-26', type: 'dividend', shares: 0, price: 0, amount: 102.50, dividendType: 'qualified', notes: 'Q2 dividend' },
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2025-03-28', type: 'dividend', shares: 0, price: 0, amount: 98.00, dividendType: 'qualified', notes: 'Q1 dividend' },
    { id: createId(), portfolioId: portfolio1.id, holdingId: holdings[0].id, date: '2025-06-13', type: 'dividend', shares: 0, price: 0, amount: 110.25, dividendType: 'qualified', notes: 'Q2 dividend' },

    // Dividends - AAPL
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2023-02-10', type: 'dividend', shares: 0, price: 0, amount: 20.50, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2023-05-12', type: 'dividend', shares: 0, price: 0, amount: 22.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2023-08-11', type: 'dividend', shares: 0, price: 0, amount: 21.50, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2023-11-10', type: 'dividend', shares: 0, price: 0, amount: 23.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2024-02-09', type: 'dividend', shares: 0, price: 0, amount: 24.50, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2024-05-10', type: 'dividend', shares: 0, price: 0, amount: 25.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2025-02-10', type: 'dividend', shares: 0, price: 0, amount: 26.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[3].id, date: '2025-05-12', type: 'dividend', shares: 0, price: 0, amount: 27.00, dividendType: 'qualified', notes: 'Quarterly dividend' },

    // Dividends - MSFT
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2023-03-09', type: 'dividend', shares: 0, price: 0, amount: 18.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2023-06-08', type: 'dividend', shares: 0, price: 0, amount: 19.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2023-09-14', type: 'dividend', shares: 0, price: 0, amount: 20.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2023-12-14', type: 'dividend', shares: 0, price: 0, amount: 21.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2024-03-14', type: 'dividend', shares: 0, price: 0, amount: 22.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2024-06-13', type: 'dividend', shares: 0, price: 0, amount: 23.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2025-03-13', type: 'dividend', shares: 0, price: 0, amount: 24.00, dividendType: 'qualified', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[4].id, date: '2025-06-12', type: 'dividend', shares: 0, price: 0, amount: 25.00, dividendType: 'qualified', notes: 'Quarterly dividend' },

    // Dividends - JNJ (Ordinary)
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[5].id, date: '2023-02-14', type: 'dividend', shares: 0, price: 0, amount: 45.20, dividendType: 'ordinary', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[5].id, date: '2023-05-16', type: 'dividend', shares: 0, price: 0, amount: 46.00, dividendType: 'ordinary', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[5].id, date: '2023-08-15', type: 'dividend', shares: 0, price: 0, amount: 46.80, dividendType: 'ordinary', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[5].id, date: '2023-11-14', type: 'dividend', shares: 0, price: 0, amount: 47.60, dividendType: 'ordinary', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[5].id, date: '2024-02-13', type: 'dividend', shares: 0, price: 0, amount: 48.40, dividendType: 'ordinary', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[5].id, date: '2024-05-14', type: 'dividend', shares: 0, price: 0, amount: 49.20, dividendType: 'ordinary', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[5].id, date: '2025-02-14', type: 'dividend', shares: 0, price: 0, amount: 50.00, dividendType: 'ordinary', notes: 'Quarterly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[5].id, date: '2025-05-15', type: 'dividend', shares: 0, price: 0, amount: 50.80, dividendType: 'ordinary', notes: 'Quarterly dividend' },

    // Dividends - SCHD
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2023-09-28', type: 'dividend', shares: 0, price: 0, amount: 72.00, dividendType: 'qualified', notes: 'Monthly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2023-10-30', type: 'dividend', shares: 0, price: 0, amount: 74.00, dividendType: 'qualified', notes: 'Monthly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2023-11-29', type: 'dividend', shares: 0, price: 0, amount: 76.00, dividendType: 'qualified', notes: 'Monthly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2023-12-28', type: 'dividend', shares: 0, price: 0, amount: 78.00, dividendType: 'qualified', notes: 'Monthly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2024-03-28', type: 'dividend', shares: 0, price: 0, amount: 80.00, dividendType: 'qualified', notes: 'Monthly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2024-06-28', type: 'dividend', shares: 0, price: 0, amount: 82.00, dividendType: 'qualified', notes: 'Monthly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2025-03-28', type: 'dividend', shares: 0, price: 0, amount: 85.00, dividendType: 'qualified', notes: 'Monthly dividend' },
    { id: createId(), portfolioId: portfolio2.id, holdingId: holdings[6].id, date: '2025-06-13', type: 'dividend', shares: 0, price: 0, amount: 87.00, dividendType: 'qualified', notes: 'Monthly dividend' },
  ];

  appData.portfolios = [portfolio1, portfolio2];
  appData.holdings = holdings;
  appData.transactions = transactions;
  appData.settings.defaultPortfolioId = portfolio1.id;
  appData.settings.currency = 'USD';
  appData.initialized = true;
  saveData(appData);
}

// ============================================
// Utilities
// ============================================

function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
}

function formatNumber(num, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(num || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMonthYear(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}

function formatYear(dateStr) {
  return dateStr ? dateStr.split('-')[0] : '';
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentYearStr() {
  return String(new Date().getFullYear());
}

function getMonthFromDate(dateStr) {
  return dateStr.substring(0, 7);
}

function getYearFromDate(dateStr) {
  return dateStr.substring(0, 4);
}

// ============================================
// Portfolio Helpers
// ============================================

function getPortfolio(id) {
  return appData.portfolios.find(p => p.id === id);
}

function getPortfolioHoldings(portfolioId) {
  return appData.holdings.filter(h => h.portfolioId === portfolioId);
}

function getPortfolioTransactions(portfolioId) {
  return appData.transactions.filter(t => t.portfolioId === portfolioId);
}

function getHoldingTransactions(holdingId) {
  return appData.transactions.filter(t => t.holdingId === holdingId);
}

function getHolding(holdingId) {
  return appData.holdings.find(h => h.id === holdingId);
}

function getPortfolioValue(portfolioId) {
  return getPortfolioHoldings(portfolioId).reduce((sum, h) => {
    return sum + (h.shares * (h.currentPrice || h.avgCost || 0));
  }, 0);
}

function getPortfolioCostBasis(portfolioId) {
  const txs = getPortfolioTransactions(portfolioId);
  return txs
    .filter(t => t.type === 'buy' || t.type === 'initial')
    .reduce((sum, t) => sum + (t.shares * t.price), 0)
    - txs
    .filter(t => t.type === 'sell')
    .reduce((sum, t) => sum + (t.shares * t.price), 0);
}

function getTotalDividends(portfolioId) {
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');
  return txs.reduce((sum, t) => sum + (t.amount || 0), 0);
}

function getDividendsByMonth(portfolioId) {
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');

  const map = {};
  txs.forEach(t => {
    const month = getMonthFromDate(t.date);
    map[month] = (map[month] || 0) + (t.amount || 0);
  });
  return map;
}

function getDividendsByYear(portfolioId) {
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');

  const map = {};
  txs.forEach(t => {
    const year = getYearFromDate(t.date);
    map[year] = (map[year] || 0) + (t.amount || 0);
  });
  return map;
}

function getDividendsByType(portfolioId) {
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');

  return {
    qualified: txs.filter(t => t.dividendType === 'qualified').reduce((s, t) => s + (t.amount || 0), 0),
    ordinary: txs.filter(t => t.dividendType === 'ordinary').reduce((s, t) => s + (t.amount || 0), 0)
  };
}

function getDividendsThisMonth(portfolioId) {
  const currentMonth = getCurrentMonthStr();
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');
  return txs
    .filter(t => getMonthFromDate(t.date) === currentMonth)
    .reduce((sum, t) => sum + (t.amount || 0), 0);
}

function getDividendsThisYear(portfolioId) {
  const currentYear = getCurrentYearStr();
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');
  return txs
    .filter(t => getYearFromDate(t.date) === currentYear)
    .reduce((sum, t) => sum + (t.amount || 0), 0);
}

function getDividendsByHolding(portfolioId) {
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');

  const map = {};
  txs.forEach(t => {
    const hid = t.holdingId;
    map[hid] = (map[hid] || 0) + (t.amount || 0);
  });
  return map;
}

// ============================================
// UI Utilities
// ============================================

function initNavigation() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  // Mobile toggle
  const mobileToggle = document.querySelector('.mobile-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (mobileToggle && sidebar) {
    mobileToggle.setAttribute('aria-label', 'Toggle navigation menu');
    mobileToggle.setAttribute('aria-expanded', 'false');
    mobileToggle.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  // Update user info in sidebar
  const userInfo = document.getElementById('userInfo');
  if (userInfo) {
    const user = getCurrentUser();
    if (user) {
      userInfo.textContent = user;
      userInfo.style.display = 'block';
    } else {
      userInfo.style.display = 'none';
    }
  }
}

let portfolioSelectorListenerAttached = false;

function populatePortfolioSelector() {
  const selector = document.getElementById('portfolioSelector');
  if (!selector) return;

  const currentValue = selector.value || appData.settings.defaultPortfolioId;
  selector.innerHTML = '<option value="">All Portfolios</option>';
  appData.portfolios.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    selector.appendChild(option);
  });

  // Restore selection
  if (currentValue && appData.portfolios.some(p => p.id === currentValue)) {
    selector.value = currentValue;
  } else {
    selector.value = '';
  }

  if (!portfolioSelectorListenerAttached) {
    selector.addEventListener('change', (e) => {
      appData.settings.defaultPortfolioId = e.target.value || null;
      saveData(appData);
      if (typeof window.refreshPageData === 'function') {
        window.refreshPageData();
      }
    });
    portfolioSelectorListenerAttached = true;
  }
}

function getSelectedPortfolioId() {
  const selector = document.getElementById('portfolioSelector');
  return selector ? selector.value : appData.settings.defaultPortfolioId;
}

function showModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function hideModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
}

// Mobile sidebar: close on click outside or Escape key
document.addEventListener('click', (e) => {
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('.mobile-toggle');
  if (sidebar && sidebar.classList.contains('open') && toggle && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
    sidebar.classList.remove('open');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
    }
    closeAllModals();
  }
});

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '!' : 'ℹ';
  toast.innerHTML = `
    <span style="font-weight:700;">${icon}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function confirmDialog(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '400';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-body" style="text-align:center;">
        <div style="font-size:2.5rem; margin-bottom:12px;">⚠️</div>
        <h3 style="margin-bottom:8px;">Confirm Action</h3>
        <p style="color:var(--text-muted); margin-bottom:20px;">${message}</p>
        <div style="display:flex; gap:12px; justify-content:center;">
          <button class="btn btn-secondary" id="confirmCancel">Cancel</button>
          <button class="btn btn-danger" id="confirmOk">Confirm</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  overlay.querySelector('#confirmCancel').addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = '';
  });
  overlay.querySelector('#confirmOk').addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = '';
    onConfirm();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      document.body.style.overflow = '';
    }
  });
}

// Password prompt dialog for encrypted backups
function passwordPromptDialog(title, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.style.zIndex = '400';
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-body" style="text-align:center;">
        <h3 style="margin-bottom:12px;">${title}</h3>
        <div class="form-group" style="text-align:left;">
          <label for="promptPassword">Password</label>
          <input type="password" id="promptPassword" placeholder="Enter password" style="width:100%;">
        </div>
        <div style="display:flex; gap:12px; justify-content:center; margin-top:20px;">
          <button class="btn btn-secondary" id="promptCancel">Cancel</button>
          <button class="btn btn-primary" id="promptOk">Confirm</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const input = overlay.querySelector('#promptPassword');
  input.focus();

  function close() {
    overlay.remove();
    document.body.style.overflow = '';
  }

  overlay.querySelector('#promptCancel').addEventListener('click', close);
  overlay.querySelector('#promptOk').addEventListener('click', () => {
    const password = input.value;
    if (!password) {
      showToast('Please enter a password', 'warning');
      return;
    }
    close();
    onConfirm(password);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const password = input.value;
      if (!password) {
        showToast('Please enter a password', 'warning');
        return;
      }
      close();
      onConfirm(password);
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

// ============================================
// CRUD Operations
// ============================================

function addPortfolio(portfolio) {
  portfolio.id = createId();
  appData.portfolios.push(portfolio);
  saveData(appData);
  return portfolio;
}

function updatePortfolio(id, updates) {
  const idx = appData.portfolios.findIndex(p => p.id === id);
  if (idx !== -1) {
    appData.portfolios[idx] = { ...appData.portfolios[idx], ...updates };
    saveData(appData);
    return appData.portfolios[idx];
  }
  return null;
}

function deletePortfolio(id) {
  appData.portfolios = appData.portfolios.filter(p => p.id !== id);
  appData.holdings = appData.holdings.filter(h => h.portfolioId !== id);
  appData.transactions = appData.transactions.filter(t => t.portfolioId !== id);
  if (appData.settings.defaultPortfolioId === id) {
    appData.settings.defaultPortfolioId = appData.portfolios[0]?.id || null;
  }
  saveData(appData);
}

function addHolding(holding) {
  holding.id = createId();
  appData.holdings.push(holding);
  saveData(appData);
  return holding;
}

function updateHolding(id, updates) {
  const idx = appData.holdings.findIndex(h => h.id === id);
  if (idx !== -1) {
    appData.holdings[idx] = { ...appData.holdings[idx], ...updates };
    saveData(appData);
    return appData.holdings[idx];
  }
  return null;
}

function deleteHolding(id) {
  appData.holdings = appData.holdings.filter(h => h.id !== id);
  appData.transactions = appData.transactions.filter(t => t.holdingId !== id);
  saveData(appData);
}

function addTransaction(transaction) {
  transaction.id = createId();
  appData.transactions.push(transaction);
  saveData(appData);
  recalcHoldingFromTransactions(transaction.holdingId);
  return transaction;
}

function updateTransaction(id, updates) {
  const idx = appData.transactions.findIndex(t => t.id === id);
  if (idx !== -1) {
    const oldHoldingId = appData.transactions[idx].holdingId;
    appData.transactions[idx] = { ...appData.transactions[idx], ...updates };
    saveData(appData);
    recalcHoldingFromTransactions(oldHoldingId);
    if (updates.holdingId && updates.holdingId !== oldHoldingId) {
      recalcHoldingFromTransactions(updates.holdingId);
    }
    return appData.transactions[idx];
  }
  return null;
}

function deleteTransaction(id) {
  const tx = appData.transactions.find(t => t.id === id);
  if (tx) {
    appData.transactions = appData.transactions.filter(t => t.id !== id);
    saveData(appData);
    recalcHoldingFromTransactions(tx.holdingId);
  }
}

function recalcHoldingFromTransactions(holdingId) {
  const holding = getHolding(holdingId);
  if (!holding) return;

  const txs = getHoldingTransactions(holdingId).sort((a, b) => a.date.localeCompare(b.date));
  let shares = 0;
  let totalCost = 0;

  txs.forEach(tx => {
    if (tx.type === 'initial' || tx.type === 'buy') {
      shares += tx.shares;
      totalCost += tx.shares * tx.price;
    } else if (tx.type === 'sell') {
      shares -= tx.shares;
      // For simplicity, reduce cost proportionally
      if (shares > 0) {
        totalCost = totalCost * (shares / (shares + tx.shares));
      } else {
        totalCost = 0;
      }
    }
  });

  holding.shares = Math.max(0, shares);
  holding.avgCost = shares > 0 ? totalCost / shares : 0;
  saveData(appData);
}

// ============================================
// Live Stock Price Fetching
// ============================================

function getPriceCacheKey() {
  const user = getCurrentUser();
  return user ? getUserPriceCacheKey(user) : 'portfolioTrackerPriceCache';
}

const PRICE_FETCH_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const PRICE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadPriceCache() {
  try {
    const raw = localStorage.getItem(getPriceCacheKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function savePriceCache(cache) {
  try {
    localStorage.setItem(getPriceCacheKey(), JSON.stringify(cache));
  } catch (e) {
    console.error('Failed to save price cache:', e);
  }
}

const STOCK_INFO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for instant modal lookups

async function fetchStockInfo(symbol) {
  const cleanSymbol = symbol.trim().toUpperCase();
  const cache = loadPriceCache();
  const cached = cache[cleanSymbol];

  // Return cached data instantly if it's fresh enough and has a name
  if (cached && cached.name && cached.price && (Date.now() - cached.timestamp) < STOCK_INFO_CACHE_TTL_MS) {
    return {
      symbol: cleanSymbol,
      name: cached.name,
      price: cached.price,
      timestamp: cached.timestamp
    };
  }

  const proxyUrl = `https://corsproxy.io/?https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=1d&range=1d`;

  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error('No data in response');
    }
    const meta = result.meta;
    const price = meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose;
    if (price === undefined || price === null) {
      throw new Error('No price found');
    }
    const info = {
      symbol: cleanSymbol,
      name: meta.shortName || meta.longName || meta.symbol || cleanSymbol,
      price: parseFloat(price),
      timestamp: Date.now()
    };
    // Save to cache so subsequent lookups are instant
    cache[cleanSymbol] = info;
    savePriceCache(cache);
    return info;
  } catch (err) {
    console.error(`Failed to fetch info for ${cleanSymbol}:`, err);
    return null;
  }
}

async function refreshAllPrices() {
  const cache = loadPriceCache();
  const lastFetch = cache._lastFetch || 0;
  const now = Date.now();

  if (now - lastFetch < PRICE_FETCH_COOLDOWN_MS) {
    const remaining = Math.ceil((PRICE_FETCH_COOLDOWN_MS - (now - lastFetch)) / 1000);
    showToast(`Please wait ${remaining}s before refreshing prices again.`, 'warning');
    return { success: false, cooldown: true };
  }

  const uniqueSymbols = [...new Set(appData.holdings.map(h => h.symbol.toUpperCase()))];
  if (uniqueSymbols.length === 0) {
    showToast('No holdings to refresh prices for.', 'warning');
    return { success: false, empty: true };
  }

  showToast(`Fetching prices for ${uniqueSymbols.length} symbol(s)...`, 'info');

  let updated = 0;
  let failed = 0;

  for (const symbol of uniqueSymbols) {
    const info = await fetchStockInfo(symbol);
    if (info) {
      // fetchStockInfo already caches the full result (name + price)
      // Update all holdings with this symbol
      appData.holdings.forEach(h => {
        if (h.symbol.toUpperCase() === symbol) {
          h.currentPrice = info.price;
        }
      });
      updated++;
    } else {
      failed++;
    }
    // Small delay to avoid rate limiting
    if (uniqueSymbols.length > 1) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  cache._lastFetch = now;
  savePriceCache(cache);
  saveData(appData);

  if (updated > 0) {
    showToast(`Updated ${updated} price(s). ${failed > 0 ? `${failed} failed.` : ''}`, 'success');
  } else {
    showToast('All price fetches failed. You may have hit a rate limit.', 'error');
  }

  return { success: updated > 0, updated, failed };
}

function getPriceLastUpdated() {
  const cache = loadPriceCache();
  const lastFetch = cache._lastFetch;
  if (!lastFetch) return null;
  return new Date(lastFetch).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function canRefreshPrices() {
  const cache = loadPriceCache();
  const lastFetch = cache._lastFetch || 0;
  return (Date.now() - lastFetch) >= PRICE_FETCH_COOLDOWN_MS;
}

// ============================================
// Export / Import (with optional encryption)
// ============================================

async function exportDataToJSON(encrypt = false, password = null) {
  let dataStr;
  if (encrypt && password) {
    dataStr = await encryptData(appData, password);
  } else {
    dataStr = JSON.stringify(appData, null, 2);
  }

  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = encrypt ? '-encrypted' : '';
  a.download = `portfolio-tracker-backup${suffix}-${getTodayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(encrypt ? 'Encrypted backup exported successfully' : 'Data exported successfully', 'success');
}

async function importDataFromJSON(file, password = null) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let data;
        const content = e.target.result.trim();

        if (isEncryptedData(content)) {
          if (!password) {
            reject({ encrypted: true });
            return;
          }
          data = await decryptData(content, password);
        } else {
          data = JSON.parse(content);
        }

        if (data.portfolios && data.holdings && data.transactions && data.settings) {
          appData = data;
          saveData(appData);
          showToast('Data imported successfully', 'success');
          resolve(true);
        } else {
          throw new Error('Invalid data format');
        }
      } catch (err) {
        if (err.encrypted) {
          reject({ encrypted: true });
        } else {
          showToast('Failed to import: ' + err.message, 'error');
          reject(err);
        }
      }
    };
    reader.readAsText(file);
  });
}

// ============================================
// GitHub Gist Integration (with optional encryption)
// ============================================

async function exportToGist(token, encrypt = false, password = null) {
  if (!token) {
    showToast('GitHub token is required', 'error');
    return false;
  }

  const filename = 'portfolio-tracker-data.json';
  let dataStr;
  if (encrypt && password) {
    dataStr = await encryptData(appData, password);
  } else {
    dataStr = JSON.stringify(appData, null, 2);
  }

  const payload = {
    description: 'Portfolio Tracker Data Backup',
    public: false,
    files: {
      [filename]: {
        content: dataStr
      }
    }
  };

  try {
    let url = 'https://api.github.com/gists';
    let method = 'POST';

    if (appData.settings.gistId) {
      url = `https://api.github.com/gists/${appData.settings.gistId}`;
      method = 'PATCH';
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    appData.settings.gistId = result.id;
    appData.settings.gistToken = token;
    saveData(appData);
    showToast(encrypt ? 'Encrypted backup exported to Gist successfully' : 'Data exported to Gist successfully', 'success');
    return result;
  } catch (err) {
    showToast('Gist export failed: ' + err.message, 'error');
    return false;
  }
}

async function importFromGist(token, gistId, password = null) {
  if (!token || !gistId) {
    showToast('GitHub token and Gist ID are required', 'error');
    return false;
  }

  try {
    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    const file = Object.values(result.files)[0];

    if (!file) {
      throw new Error('No files found in Gist');
    }

    let content = file.content;
    if (file.truncated) {
      const rawResponse = await fetch(file.raw_url);
      content = await rawResponse.text();
    }

    let data;
    if (isEncryptedData(content)) {
      if (!password) {
        showToast('This backup is encrypted. Please enter the backup password.', 'warning');
        return { encrypted: true };
      }
      data = await decryptData(content, password);
    } else {
      data = JSON.parse(content);
    }

    if (data.portfolios && data.holdings && data.transactions && data.settings) {
      appData = data;
      appData.settings.gistToken = token;
      appData.settings.gistId = gistId;
      saveData(appData);
      showToast('Data imported from Gist successfully', 'success');
      return true;
    } else {
      throw new Error('Invalid data format in Gist');
    }
  } catch (err) {
    if (err.encrypted) {
      return { encrypted: true };
    }
    showToast('Gist import failed: ' + err.message, 'error');
    return false;
  }
}

// ============================================
// Initialization
// ============================================

function initApp() {
  initTheme();

  // Require auth on all pages except login
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  if (currentPage !== 'login.html' && !requireAuth()) {
    return;
  }

  if (!appData.initialized) {
    generateSampleData();
  }
  // Restore cached prices into holdings (only if less than 24 hours old)
  const cache = loadPriceCache();
  const now = Date.now();
  appData.holdings.forEach(h => {
    const cached = cache[h.symbol.toUpperCase()];
    if (cached && cached.price && (now - cached.timestamp) < PRICE_CACHE_MAX_AGE_MS) {
      h.currentPrice = cached.price;
    }
  });
  initNavigation();
  populatePortfolioSelector();
}

// ============================================
// Page-Agnostic Price Refresh
// ============================================

function updatePriceStatus() {
  const lastUpdated = getPriceLastUpdated();
  const btn = document.getElementById('refreshPricesBtn');
  const statusEl = document.getElementById('tilePriceStatus');
  if (btn) {
    btn.title = lastUpdated ? `Last updated: ${lastUpdated}` : 'No prices fetched yet';
  }
  if (statusEl) {
    statusEl.textContent = lastUpdated ? `Prices updated: ${lastUpdated}` : 'Prices: manual';
  }
}

async function refreshPricesOnPage() {
  const btn = document.getElementById('refreshPricesBtn');
  if (btn) btn.disabled = true;
  try {
    const result = await refreshAllPrices();
    if (result.success && typeof window.refreshPageData === 'function') {
      window.refreshPageData();
    }
  } catch (err) {
    console.error('Price refresh failed:', err);
    showToast('An unexpected error occurred during price refresh.', 'error');
  } finally {
    updatePriceStatus();
    if (btn) btn.disabled = false;
  }
}

// Run init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
