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

function resetAllData() {
  confirmDialog('This will permanently delete ALL your data. Are you absolutely sure?', () => {
    const user = getCurrentUser();
    if (user) {
      localStorage.removeItem(getUserDataKey(user));
      localStorage.removeItem(getUserPriceCacheKey(user));
    } else {
      localStorage.removeItem('portfolioTrackerData');
      localStorage.removeItem('portfolioTrackerPriceCache');
    }
    appData = getDefaultData();
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
