/**
 * Portfolio Tracker - Settings Page Logic
 */

function refreshPageData() {
  updatePortfoliosTable();
  populateBrokerageOptions();
  loadGistSettings();
  updateSettingsUI();
}

function updateSettingsUI() {
  const user = getCurrentUser();
  const usernameEl = document.getElementById('settingsUsername');
  if (usernameEl && user) {
    usernameEl.textContent = user;
  }

  const darkModeBtn = document.getElementById('darkModeToggle');
  if (darkModeBtn) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    darkModeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

function updatePortfoliosTable() {
  const tbody = document.getElementById('portfoliosTable');
  if (!tbody) return;

  if (appData.portfolios.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No portfolios yet. Add a portfolio to get started.</td></tr>`;
    return;
  }

  tbody.innerHTML = appData.portfolios.map(p => {
    const holdings = getPortfolioHoldings(p.id);
    const value = getPortfolioValue(p.id);
    return `
      <tr>
        <td style="font-weight:600;">${p.name}</td>
        <td>${p.brokerage}</td>
        <td>${holdings.length} holding${holdings.length !== 1 ? 's' : ''}</td>
        <td class="text-right" style="font-weight:600;">${formatCurrency(value)}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-ghost" onclick="editPortfolioSettings('${p.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deletePortfolioPrompt('${p.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function populateBrokerageOptions() {
  const select = document.getElementById('portfolioBrokerage');
  if (!select) return;
  select.innerHTML = '<option value="">Select brokerage...</option>';
  BROKERAGES.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
}

function openAddPortfolioModal() {
  document.getElementById('portfolioForm').reset();
  document.getElementById('portfolioId').value = '';
  document.getElementById('portfolioModalTitle').textContent = 'Add Portfolio';
  populateBrokerageOptions();
  showModal('portfolioModal');
}

function editPortfolioSettings(id) {
  const p = getPortfolio(id);
  if (!p) return;
  document.getElementById('portfolioId').value = p.id;
  document.getElementById('portfolioName').value = p.name;
  document.getElementById('portfolioBrokerage').value = p.brokerage;
  document.getElementById('portfolioModalTitle').textContent = 'Edit Portfolio';
  populateBrokerageOptions();
  showModal('portfolioModal');
}

function savePortfolio() {
  const id = document.getElementById('portfolioId').value;
  const name = document.getElementById('portfolioName').value.trim();
  const brokerage = document.getElementById('portfolioBrokerage').value;

  if (!name || !brokerage) {
    showToast('Please fill in all required fields', 'warning');
    return;
  }

  if (id) {
    updatePortfolio(id, { name, brokerage });
    showToast('Portfolio updated successfully', 'success');
  } else {
    addPortfolio({ name, brokerage });
    showToast('Portfolio added successfully', 'success');
  }

  hideModal('portfolioModal');
  refreshPageData();
  populatePortfolioSelector(); // update global selector
}

function deletePortfolioPrompt(id) {
  const p = getPortfolio(id);
  const msg = p
    ? `Are you sure you want to delete "${p.name}"? All holdings and transactions in this portfolio will also be removed.`
    : 'Are you sure you want to delete this portfolio?';
  confirmDialog(msg, () => {
    deletePortfolio(id);
    showToast('Portfolio deleted', 'success');
    refreshPageData();
    populatePortfolioSelector();
  });
}

async function handleExport() {
  const encrypt = document.getElementById('encryptExportCheck').checked;
  if (encrypt) {
    passwordPromptDialog('Enter a backup password to encrypt your data', async (password) => {
      await exportDataToJSON(true, password);
    });
  } else {
    await exportDataToJSON(false);
  }
}

function exportFullPortfolioCSV() {
  const portfolios = appData.portfolios;
  const holdings = appData.holdings;
  const transactions = appData.transactions;

  if (portfolios.length === 0 && holdings.length === 0 && transactions.length === 0) {
    showToast('No data to export. The app is empty.', 'warning');
    return;
  }

  const headers = [
    'recordType', 'portfolio', 'brokerage', 'symbol', 'name',
    'shares', 'avgCost', 'currentPrice', 'date', 'type', 'price', 'amount',
    'dividendType', 'notes'
  ];

  const rows = [];

  // Portfolios
  portfolios.forEach(p => {
    rows.push([
      'portfolio', p.name, p.brokerage, '', '', '', '', '', '', '', '', '', '', ''
    ]);
  });

  // Holdings
  holdings.forEach(h => {
    const p = getPortfolio(h.portfolioId);
    rows.push([
      'holding',
      p ? p.name : '',
      '',
      h.symbol,
      h.name || '',
      formatNumber(h.shares, 4),
      formatNumber(h.avgCost, 2),
      h.currentPrice != null ? formatNumber(h.currentPrice, 2) : '',
      '', '', '', '', '', ''
    ]);
  });

  // Transactions (sorted by date ascending)
  const sortedTxs = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  sortedTxs.forEach(tx => {
    const p = getPortfolio(tx.portfolioId);
    const h = getHolding(tx.holdingId);
    rows.push([
      'transaction',
      p ? p.name : '',
      '',
      h ? h.symbol : '',
      '',
      tx.type === 'dividend' ? '' : formatNumber(tx.shares, 4),
      '',
      '',
      tx.date,
      tx.type,
      tx.type === 'dividend' ? '' : formatNumber(tx.price, 2),
      tx.type === 'dividend' ? formatNumber(tx.amount, 2) : '',
      tx.dividendType || '',
      tx.notes || ''
    ]);
  });

  downloadCSVTemplate(
    'portfolio-full-export.csv',
    headers,
    rows,
    'Full portfolio export'
  );
}

async function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    await importDataFromJSON(file);
    input.value = '';
    refreshPageData();
    populatePortfolioSelector();
  } catch (err) {
    if (err && err.encrypted) {
      passwordPromptDialog('This backup is encrypted. Enter the password to decrypt:', async (password) => {
        try {
          await importDataFromJSON(file, password);
          input.value = '';
          refreshPageData();
          populatePortfolioSelector();
        } catch (e2) {
          input.value = '';
        }
      });
    } else {
      input.value = '';
    }
  }
}

function loadGistSettings() {
  const tokenEl = document.getElementById('gistToken');
  const idEl = document.getElementById('gistId');
  const statusEl = document.getElementById('gistStatus');
  if (tokenEl) tokenEl.value = appData.settings.gistToken || '';
  if (idEl) idEl.value = appData.settings.gistId || '';
  if (statusEl) {
    if (appData.settings.gistId) {
      statusEl.innerHTML = `✅ Gist configured. Gist ID: <code>${appData.settings.gistId}</code>`;
    } else {
      statusEl.textContent = 'No Gist configured yet.';
    }
  }
}

function saveGistSettings() {
  const token = document.getElementById('gistToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  appData.settings.gistToken = token;
  appData.settings.gistId = gistId;
  saveData(appData);
  loadGistSettings();
  showToast('Gist settings saved', 'success');
}

async function exportToGistFromSettings() {
  const token = document.getElementById('gistToken').value.trim();
  if (!token) {
    showToast('Please enter your GitHub token first', 'warning');
    return;
  }
  const encrypt = document.getElementById('encryptGistCheck').checked;
  if (encrypt) {
    passwordPromptDialog('Enter a backup password to encrypt your Gist', async (password) => {
      const result = await exportToGist(token, true, password);
      if (result) {
        loadGistSettings();
      }
    });
  } else {
    const result = await exportToGist(token, false);
    if (result) {
      loadGistSettings();
    }
  }
}

async function importFromGistFromSettings() {
  const token = document.getElementById('gistToken').value.trim();
  const gistId = document.getElementById('gistId').value.trim();
  if (!token || !gistId) {
    showToast('Please enter both GitHub token and Gist ID', 'warning');
    return;
  }

  const result = await importFromGist(token, gistId);
  if (result === true) {
    refreshPageData();
    populatePortfolioSelector();
  } else if (result && result.encrypted) {
    passwordPromptDialog('This Gist is encrypted. Enter the backup password:', async (password) => {
      const success = await importFromGist(token, gistId, password);
      if (success) {
        refreshPageData();
        populatePortfolioSelector();
      }
    });
  }
}

async function changePassword() {
  const current = document.getElementById('currentPassword').value;
  const newPass = document.getElementById('newPassword').value;

  if (!current || !newPass) {
    showToast('Please enter both current and new password', 'warning');
    return;
  }

  if (newPass.length < 6) {
    showToast('New password must be at least 6 characters', 'warning');
    return;
  }

  const user = getCurrentUser();
  const users = getUsers();
  const userData = users[user];

  const hash = await hashPassword(current, userData.salt);
  if (hash !== userData.passwordHash) {
    showToast('Current password is incorrect', 'error');
    return;
  }

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPass, newSalt);
  users[user].passwordHash = newHash;
  users[user].salt = newSalt;
  saveUsers(users);

  document.getElementById('currentPassword').value = '';
  document.getElementById('newPassword').value = '';
  showToast('Password updated successfully', 'success');
}

function deleteAccount() {
  confirmDialog('This will permanently delete your account and ALL your data. This cannot be undone. Are you sure?', () => {
    const user = getCurrentUser();
    if (user) {
      const users = getUsers();
      delete users[user];
      saveUsers(users);
      localStorage.removeItem(getUserDataKey(user));
      localStorage.removeItem(getUserPriceCacheKey(user));
    }
    logoutUser();
  });
}

let pendingFullPortfolioCSV = null;

function handleFullPortfolioCSVImport(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target.result;
      const parsed = parseCSV(content);

      if (!parsed.headers.includes('recordType')) {
        showToast('Invalid CSV: missing recordType column', 'error');
        input.value = '';
        return;
      }

      const hasData = parsed.rows.some(r => r.recordType && ['portfolio', 'holding', 'transaction'].includes(r.recordType.trim().toLowerCase()));
      if (!hasData) {
        showToast('No valid portfolio, holding, or transaction rows found in CSV', 'warning');
        input.value = '';
        return;
      }

      pendingFullPortfolioCSV = parsed;
      previewFullPortfolioCSV(parsed);
      showModal('importFullPortfolioModal');
      input.value = '';
    } catch (err) {
      showToast('Failed to parse CSV: ' + err.message, 'error');
      input.value = '';
    }
  };
  reader.onerror = () => {
    showToast('Failed to read file', 'error');
    input.value = '';
  };
  reader.readAsText(file);
}

function previewFullPortfolioCSV(parsed) {
  const portfolioRows = parsed.rows.filter(r => (r.recordType || '').trim().toLowerCase() === 'portfolio');
  const holdingRows = parsed.rows.filter(r => (r.recordType || '').trim().toLowerCase() === 'holding');
  const transactionRows = parsed.rows.filter(r => (r.recordType || '').trim().toLowerCase() === 'transaction');

  const validPortfolios = portfolioRows.filter(r => r.portfolio && r.brokerage).length;
  const validHoldings = holdingRows.filter(r => r.portfolio && r.symbol && r.shares && r.avgCost).length;
  const validTransactions = transactionRows.filter(r => {
    if (!r.portfolio || !r.symbol || !r.date || !r.type) return false;
    const t = r.type.trim().toLowerCase();
    if (t === 'dividend') return !!r.amount;
    return !!r.shares && !!r.price;
  }).length;

  const previewEl = document.getElementById('importFullPortfolioPreview');
  const rows = parsed.rows.slice(0, 5);
  previewEl.innerHTML = `
    <div class="csv-preview-summary" style="margin-bottom:12px;">
      <p><strong>${parsed.rows.length}</strong> total rows found:</p>
      <ul style="margin:8px 0 12px 20px; color:var(--text-muted); font-size:0.85rem;">
        <li><strong>${portfolioRows.length}</strong> portfolio rows (${validPortfolios} valid)</li>
        <li><strong>${holdingRows.length}</strong> holding rows (${validHoldings} valid)</li>
        <li><strong>${transactionRows.length}</strong> transaction rows (${validTransactions} valid)</li>
      </ul>
    </div>
    <div class="csv-preview-table-container" style="max-height:200px; overflow-y:auto; border:1px solid var(--border); border-radius:var(--radius);">
      <table class="csv-preview-table">
        <thead>
          <tr>
            <th>recordType</th>
            <th>portfolio</th>
            <th>symbol</th>
            <th>type</th>
            <th>date</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(row.recordType)}</td>
              <td>${escapeHtml(row.portfolio)}</td>
              <td>${escapeHtml(row.symbol)}</td>
              <td>${escapeHtml(row.type)}</td>
              <td>${escapeHtml(row.date)}</td>
            </tr>
          `).join('')}
          ${parsed.rows.length > 5 ? `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); font-size:0.8rem;">... and ${parsed.rows.length - 5} more rows</td></tr>` : ''}
        </tbody>
      </table>
    </div>
  `;
}

function confirmImportFullPortfolioCSV() {
  if (!pendingFullPortfolioCSV) return;
  const replace = document.getElementById('importFullPortfolioReplace').checked;
  if (replace) {
    confirmDialog('This will DELETE all existing portfolios, holdings, and transactions and replace them with the imported data. Are you sure?', () => {
      doImportFullPortfolioCSV(true);
    });
  } else {
    doImportFullPortfolioCSV(false);
  }
}

function doImportFullPortfolioCSV(replace) {
  const parsed = pendingFullPortfolioCSV;
  if (!parsed) return;

  if (replace) {
    appData = getDefaultData();
    appData.initialized = true;
  }

  const portfolioRows = parsed.rows.filter(r => (r.recordType || '').trim().toLowerCase() === 'portfolio');
  const holdingRows = parsed.rows.filter(r => (r.recordType || '').trim().toLowerCase() === 'holding');
  const transactionRows = parsed.rows.filter(r => (r.recordType || '').trim().toLowerCase() === 'transaction');

  // Portfolio name (lowercase) -> portfolio ID
  const portfolioMap = {};
  appData.portfolios.forEach(p => {
    portfolioMap[p.name.toLowerCase()] = p.id;
  });

  let portfoliosCreated = 0;
  portfolioRows.forEach(row => {
    const name = (row.portfolio || '').trim();
    const brokerage = (row.brokerage || '').trim() || 'Other';
    if (!name) return;
    const lowerName = name.toLowerCase();
    if (!portfolioMap[lowerName]) {
      const p = { id: createId(), name, brokerage };
      appData.portfolios.push(p);
      portfolioMap[lowerName] = p.id;
      portfoliosCreated++;
    } else if (!replace && row.brokerage) {
      const existing = appData.portfolios.find(p => p.id === portfolioMap[lowerName]);
      if (existing) existing.brokerage = row.brokerage;
    }
  });

  // Holding key: portfolioId + '|' + symbolLower -> holding ID
  const holdingMap = {};
  appData.holdings.forEach(h => {
    holdingMap[h.portfolioId + '|' + h.symbol.toLowerCase()] = h.id;
  });

  let holdingsCreated = 0;
  holdingRows.forEach(row => {
    const portfolioName = (row.portfolio || '').trim();
    const symbol = (row.symbol || '').trim().toUpperCase();
    if (!portfolioName || !symbol) return;

    // Auto-create portfolio if referenced but not in CSV or existing data
    let portfolioId = portfolioMap[portfolioName.toLowerCase()];
    if (!portfolioId) {
      const p = { id: createId(), name: portfolioName, brokerage: 'Other' };
      appData.portfolios.push(p);
      portfolioMap[portfolioName.toLowerCase()] = p.id;
      portfolioId = p.id;
      portfoliosCreated++;
    }

    const shares = parseFloat((row.shares || '').replace(/,/g, ''));
    const avgCost = parseFloat((row.avgCost || '').replace(/,/g, ''));
    if (isNaN(shares) || isNaN(avgCost)) return;

    const key = portfolioId + '|' + symbol.toLowerCase();
    if (!holdingMap[key]) {
      const holding = {
        id: createId(),
        portfolioId,
        symbol,
        name: row.name ? row.name.trim() : symbol,
        shares,
        avgCost,
        currentPrice: row.currentPrice ? parseFloat(row.currentPrice.replace(/,/g, '')) : avgCost
      };
      appData.holdings.push(holding);
      holdingMap[key] = holding.id;
      holdingsCreated++;
    } else if (!replace) {
      const existing = appData.holdings.find(h => h.id === holdingMap[key]);
      if (existing) {
        existing.shares = shares;
        existing.avgCost = avgCost;
        if (row.currentPrice) existing.currentPrice = parseFloat(row.currentPrice.replace(/,/g, ''));
      }
    }
  });

  // Create transactions
  let transactionsCreated = 0;
  const importedHoldingIds = new Set();

  transactionRows.forEach(row => {
    const portfolioName = (row.portfolio || '').trim();
    const symbol = (row.symbol || '').trim().toUpperCase();
    const date = (row.date || '').trim();
    const type = (row.type || '').trim().toLowerCase();

    if (!portfolioName || !symbol || !date || !type) return;
    if (!['initial', 'buy', 'sell', 'dividend'].includes(type)) return;
    if (!isValidDate(date)) return;

    // Auto-create portfolio if referenced but not in CSV or existing data
    let portfolioId = portfolioMap[portfolioName.toLowerCase()];
    if (!portfolioId) {
      const p = { id: createId(), name: portfolioName, brokerage: 'Other' };
      appData.portfolios.push(p);
      portfolioMap[portfolioName.toLowerCase()] = p.id;
      portfolioId = p.id;
      portfoliosCreated++;
    }

    let holdingId = holdingMap[portfolioId + '|' + symbol.toLowerCase()];

    // Create holding if missing (for transactions referencing a symbol not yet in holdings)
    if (!holdingId) {
      const price = parseFloat((row.price || '').replace(/,/g, '')) || parseFloat((row.avgCost || '').replace(/,/g, '')) || 0;
      const holding = {
        id: createId(),
        portfolioId,
        symbol,
        name: symbol,
        shares: 0,
        avgCost: price,
        currentPrice: price
      };
      appData.holdings.push(holding);
      holdingId = holding.id;
      holdingMap[portfolioId + '|' + symbol.toLowerCase()] = holdingId;
    }

    let txData;
    if (type === 'dividend') {
      const amount = parseFloat((row.amount || '').replace(/,/g, ''));
      if (isNaN(amount) || amount <= 0) return;
      const dType = (row.dividendType || '').trim().toLowerCase();
      txData = {
        id: createId(),
        portfolioId,
        holdingId,
        date,
        type,
        shares: 0,
        price: 0,
        amount,
        dividendType: ['qualified', 'ordinary'].includes(dType) ? dType : null,
        notes: row.notes ? row.notes.trim() : ''
      };
    } else {
      const shares = parseFloat((row.shares || '').replace(/,/g, ''));
      const price = parseFloat((row.price || '').replace(/,/g, ''));
      if (isNaN(shares) || shares <= 0 || isNaN(price) || price <= 0) return;
      txData = {
        id: createId(),
        portfolioId,
        holdingId,
        date,
        type,
        shares,
        price,
        amount: 0,
        dividendType: null,
        notes: row.notes ? row.notes.trim() : ''
      };
    }

    // Duplicate check
    const isDuplicate = appData.transactions.some(t =>
      t.portfolioId === txData.portfolioId &&
      t.holdingId === txData.holdingId &&
      t.date === txData.date &&
      t.type === txData.type &&
      (t.amount || 0) === (txData.amount || 0) &&
      (t.shares || 0) === (txData.shares || 0) &&
      (t.notes || '') === (txData.notes || '')
    );

    if (!isDuplicate) {
      appData.transactions.push(txData);
      transactionsCreated++;
      importedHoldingIds.add(holdingId);
    }
  });

  // Recalculate all affected holdings
  importedHoldingIds.forEach(hid => {
    recalcHoldingFromTransactions(hid);
  });

  saveData(appData);
  pendingFullPortfolioCSV = null;
  document.getElementById('importFullPortfolioReplace').checked = false;
  hideModal('importFullPortfolioModal');

  if (portfoliosCreated === 0 && holdingsCreated === 0 && transactionsCreated === 0) {
    showToast('No valid data was imported. Please check your CSV format.', 'warning');
  } else {
    showToast(`Import complete: ${portfoliosCreated} portfolios, ${holdingsCreated} holdings, ${transactionsCreated} transactions`, 'success');
  }
  refreshPageData();
  populatePortfolioSelector();
}

function clearAllData() {
  confirmDialog('This will permanently delete ALL your data and leave the app completely empty. Are you absolutely sure?', () => {
    // Capture counts before clearing
    const portfolioCount = appData.portfolios.length;
    const holdingCount = appData.holdings.length;
    const transactionCount = appData.transactions.length;

    // Use the centralized clearData helper to directly write empty data
    // to the correct localStorage key without relying on saveData's re-evaluation of getCurrentUser()
    clearData();

    showToast(
      `All data cleared. Deleted ${portfolioCount} portfolio${portfolioCount !== 1 ? 's' : ''}, ${holdingCount} holding${holdingCount !== 1 ? 's' : ''}, and ${transactionCount} transaction${transactionCount !== 1 ? 's' : ''}.`,
      'success'
    );
    refreshPageData();
    populatePortfolioSelector();
  });
}

function resetAllData() {
  confirmDialog('This will permanently delete ALL your data and restore sample data. Are you absolutely sure?', () => {
    // Use the centralized clearData helper to directly write empty data
    // to the correct localStorage key, then regenerate sample data
    clearData();
    generateSampleData();
    showToast('All data has been reset with sample data', 'success');
    refreshPageData();
    populatePortfolioSelector();
  });
}

window.refreshPageData = refreshPageData;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshPageData);
} else {
  refreshPageData();
}
