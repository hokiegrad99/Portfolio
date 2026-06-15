/**
 * Portfolio Tracker - Transactions Page Logic
 */

function refreshPageData() {
  updateTransactionsTable();
  populateTxPortfolioOptions();
}

function updateTransactionsTable() {
  const portfolioId = getSelectedPortfolioId();
  let txs = portfolioId ? getPortfolioTransactions(portfolioId) : [...appData.transactions];
  txs.sort((a, b) => b.date.localeCompare(a.date));

  const tbody = document.getElementById('transactionsTable');
  if (!tbody) return;

  if (txs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted">No transactions yet. Add your first transaction to get started.</td></tr>`;
    return;
  }

  tbody.innerHTML = txs.map(tx => {
    const portfolio = getPortfolio(tx.portfolioId);
    const holding = getHolding(tx.holdingId);
    const typeClass = tx.type === 'buy' ? 'badge-green' : tx.type === 'sell' ? 'badge-red' : tx.type === 'dividend' ? 'badge-blue' : 'badge-gray';
    const amount = tx.type === 'dividend' ? tx.amount : (tx.shares * tx.price);
    const divType = tx.type === 'dividend' ? `<span class="dividend-type ${tx.dividendType}">${tx.dividendType || 'N/A'}</span>` : '-';

    return `
      <tr>
        <td>${formatDate(tx.date)}</td>
        <td>${portfolio ? portfolio.name : 'Unknown'}</td>
        <td class="font-mono">${holding ? holding.symbol : 'Unknown'}</td>
        <td><span class="badge ${typeClass}">${tx.type}</span></td>
        <td class="text-right">${tx.shares ? formatNumber(tx.shares, 4) : '-'}</td>
        <td class="text-right">${tx.price ? formatCurrency(tx.price) : '-'}</td>
        <td class="text-right">${formatCurrency(amount)}</td>
        <td>${divType}</td>
        <td>${tx.notes || ''}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-ghost" onclick="editTransaction('${tx.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTransactionPrompt('${tx.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function populateTxPortfolioOptions() {
  const select = document.getElementById('txPortfolio');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">Select portfolio...</option>';
  appData.portfolios.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  if (currentVal) select.value = currentVal;
}

function populateTxHoldingOptions(portfolioId) {
  const select = document.getElementById('txHolding');
  if (!select) return;
  select.innerHTML = '<option value="">Select holding...</option>';
  if (!portfolioId) return;
  const holdings = getPortfolioHoldings(portfolioId);
  holdings.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.id;
    opt.textContent = `${h.symbol} - ${h.name || ''}`;
    select.appendChild(opt);
  });
}

function onTxHoldingChange() {
  const holdingId = document.getElementById('txHolding').value;
  const symbolInput = document.getElementById('txSymbol');
  const nameInput = document.getElementById('txName');
  if (!holdingId) return;
  const holding = getHolding(holdingId);
  if (holding && symbolInput) {
    symbolInput.value = holding.symbol;
    symbolInput.dataset.lastSymbol = holding.symbol;
    // Clear any invalid validation since this is a known holding
    symbolInput.classList.remove('input-invalid');
    symbolInput.classList.add('input-valid');
  }
  if (holding && nameInput) {
    nameInput.value = holding.name || '';
  }
}

function onTxPortfolioChange() {
  const portfolioId = document.getElementById('txPortfolio').value;
  populateTxHoldingOptions(portfolioId);
}

function onTxTypeChange() {
  const type = document.getElementById('txType').value;
  const sharesPriceRow = document.getElementById('sharesPriceRow');
  const dividendRow = document.getElementById('dividendRow');
  const symbolRow = document.getElementById('txSymbolRow');
  const holdingSelect = document.getElementById('txHolding');

  if (type === 'dividend') {
    sharesPriceRow.classList.add('hidden');
    dividendRow.classList.remove('hidden');
  } else {
    sharesPriceRow.classList.remove('hidden');
    dividendRow.classList.add('hidden');
  }

  // For sell/dividend, require existing holding; hide symbol row
  if (type === 'sell' || type === 'dividend') {
    if (symbolRow) symbolRow.classList.add('hidden');
    if (holdingSelect) holdingSelect.setAttribute('required', 'required');
  } else {
    if (symbolRow) symbolRow.classList.remove('hidden');
    if (holdingSelect) holdingSelect.removeAttribute('required');
  }
}

let txLookupDebounceTimer = null;

async function autoLookupTxSymbol() {
  const symbolInput = document.getElementById('txSymbol');
  const nameInput = document.getElementById('txName');
  const priceInput = document.getElementById('txPrice');
  const holdingSelect = document.getElementById('txHolding');
  const spinner = document.getElementById('txSymbolLookupSpinner');
  const status = document.getElementById('txSymbolLookupStatus');
  const symbol = symbolInput.value.trim().toUpperCase();
  const lastSymbol = symbolInput.dataset.lastSymbol || '';

  if (!symbol || symbol.length > 10) {
    symbolInput.classList.remove('input-valid', 'input-invalid');
    return;
  }

  // If symbol changed from last lookup, clear old name/price and validation so lookup can fill them
  if (symbol !== lastSymbol) {
    nameInput.value = '';
    symbolInput.classList.remove('input-valid', 'input-invalid');
  }

  // Clear any pending debounce
  if (txLookupDebounceTimer) clearTimeout(txLookupDebounceTimer);

  txLookupDebounceTimer = setTimeout(async () => {
    if (spinner) spinner.classList.remove('hidden');
    if (status) { status.classList.remove('hidden'); status.textContent = 'Looking up...'; }

    const info = await fetchStockInfo(symbol);

    if (spinner) spinner.classList.add('hidden');

    if (info) {
      symbolInput.classList.remove('input-invalid');
      symbolInput.classList.add('input-valid');
      symbolInput.dataset.lastSymbol = symbol;
      if (!nameInput.value.trim()) {
        nameInput.value = info.name;
      }
      if (priceInput && !priceInput.value) {
        priceInput.value = info.price;
      }
      if (status) { status.textContent = 'Found: ' + info.name; }
      setTimeout(() => { if (status) status.classList.add('hidden'); }, 2000);

      // Try to auto-select the matching holding in the dropdown
      if (holdingSelect) {
        const portfolioId = document.getElementById('txPortfolio').value;
        const holdings = portfolioId ? getPortfolioHoldings(portfolioId) : appData.holdings;
        const match = holdings.find(h => h.symbol.toUpperCase() === symbol);
        if (match) {
          holdingSelect.value = match.id;
        }
      }
    } else {
      symbolInput.classList.remove('input-valid');
      symbolInput.classList.add('input-invalid');
      if (status) { status.textContent = 'Symbol not found'; }
      setTimeout(() => { if (status) status.classList.add('hidden'); }, 3000);
    }
  }, 400);
}

function openAddTransactionModal() {
  document.getElementById('transactionForm').reset();
  document.getElementById('txId').value = '';
  document.getElementById('txModalTitle').textContent = 'Add Transaction';
  document.getElementById('txDate').value = getTodayStr();
  document.getElementById('sharesPriceRow').classList.remove('hidden');
  document.getElementById('dividendRow').classList.add('hidden');
  populateTxPortfolioOptions();
  populateTxHoldingOptions('');

  // Reset lookup status and validation
  const symbolInput = document.getElementById('txSymbol');
  const spinner = document.getElementById('txSymbolLookupSpinner');
  const status = document.getElementById('txSymbolLookupStatus');
  if (symbolInput) {
    symbolInput.classList.remove('input-valid', 'input-invalid');
    symbolInput.dataset.lastSymbol = '';
  }
  if (spinner) spinner.classList.add('hidden');
  if (status) { status.classList.add('hidden'); status.textContent = ''; }

  const selectedPortfolio = getSelectedPortfolioId();
  if (selectedPortfolio) {
    document.getElementById('txPortfolio').value = selectedPortfolio;
    onTxPortfolioChange();
  }

  showModal('transactionModal');
}

function editTransaction(id) {
  const tx = appData.transactions.find(t => t.id === id);
  if (!tx) return;

  document.getElementById('txId').value = tx.id;
  document.getElementById('txModalTitle').textContent = 'Edit Transaction';
  populateTxPortfolioOptions();
  document.getElementById('txPortfolio').value = tx.portfolioId;
  populateTxHoldingOptions(tx.portfolioId);
  document.getElementById('txHolding').value = tx.holdingId;
  document.getElementById('txDate').value = tx.date;
  document.getElementById('txType').value = tx.type;
  document.getElementById('txShares').value = tx.shares || '';
  document.getElementById('txPrice').value = tx.price || '';
  document.getElementById('txAmount').value = tx.amount || '';
  document.getElementById('txDividendType').value = tx.dividendType || '';
  document.getElementById('txNotes').value = tx.notes || '';

  // Populate symbol/name from the holding
  const holding = getHolding(tx.holdingId);
  const symbolInput = document.getElementById('txSymbol');
  const nameInput = document.getElementById('txName');
  if (holding) {
    if (symbolInput) symbolInput.value = holding.symbol;
    if (nameInput) nameInput.value = holding.name || '';
    if (symbolInput) symbolInput.dataset.lastSymbol = holding.symbol;
  }

  // Reset lookup status and validation
  const spinner = document.getElementById('txSymbolLookupSpinner');
  const status = document.getElementById('txSymbolLookupStatus');
  if (symbolInput) {
    symbolInput.classList.remove('input-valid', 'input-invalid');
  }
  if (spinner) spinner.classList.add('hidden');
  if (status) { status.classList.add('hidden'); status.textContent = ''; }

  onTxTypeChange();
  showModal('transactionModal');
}

function saveTransaction() {
  const id = document.getElementById('txId').value;
  const portfolioId = document.getElementById('txPortfolio').value;
  let holdingId = document.getElementById('txHolding').value;
  const date = document.getElementById('txDate').value;
  const type = document.getElementById('txType').value;
  const notes = document.getElementById('txNotes').value.trim();
  const symbol = document.getElementById('txSymbol').value.trim().toUpperCase();
  const name = document.getElementById('txName').value.trim();

  if (!portfolioId || !date || !type) {
    showToast('Please fill in all required fields', 'warning');
    return;
  }

  // For sell/dividend, a holding must be selected
  if ((type === 'sell' || type === 'dividend') && !holdingId) {
    showToast('Please select an existing holding for Sell/Dividend transactions', 'warning');
    return;
  }

  // If no holding selected but symbol is provided, find or create the holding
  if (!holdingId && symbol) {
    const holdings = getPortfolioHoldings(portfolioId);
    const existing = holdings.find(h => h.symbol.toUpperCase() === symbol);
    if (existing) {
      holdingId = existing.id;
    } else {
      // Create a new holding for this symbol
      const price = parseFloat(document.getElementById('txPrice').value) || 0;
      const newHolding = {
        id: createId(),
        portfolioId,
        symbol,
        name: name || symbol,
        shares: 0,
        avgCost: price,
        currentPrice: price
      };
      appData.holdings.push(newHolding);
      saveData(appData);
      holdingId = newHolding.id;
      showToast('New holding created: ' + symbol, 'success');
    }
  }

  if (!holdingId) {
    showToast('Please select a holding or enter a symbol', 'warning');
    return;
  }

  let txData = { portfolioId, holdingId, date, type, notes };

  if (type === 'dividend') {
    const amount = parseFloat(document.getElementById('txAmount').value);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid dividend amount', 'warning');
      return;
    }
    txData = { ...txData, amount, shares: 0, price: 0, dividendType: document.getElementById('txDividendType').value || null };
  } else {
    const shares = parseFloat(document.getElementById('txShares').value);
    const price = parseFloat(document.getElementById('txPrice').value);
    if (isNaN(shares) || shares <= 0 || isNaN(price) || price <= 0) {
      showToast('Please enter valid shares and price', 'warning');
      return;
    }
    txData = { ...txData, shares, price, amount: 0, dividendType: null };
  }

  if (id) {
    updateTransaction(id, txData);
    showToast('Transaction updated successfully', 'success');
  } else {
    addTransaction(txData);
    showToast('Transaction added successfully', 'success');
  }

  hideModal('transactionModal');
  refreshPageData();
}

function deleteTransactionPrompt(id) {
  confirmDialog('Are you sure you want to delete this transaction?', () => {
    deleteTransaction(id);
    showToast('Transaction deleted', 'success');
    refreshPageData();
  });
}

window.refreshPageData = refreshPageData;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    refreshPageData();
    checkEditFromSession();
  });
} else {
  refreshPageData();
  checkEditFromSession();
}

let pendingTransactionsCSV = { headers: [], rows: [] };

function openImportTransactionsCSVModal() {
  document.getElementById('transactionsCSVFile').value = '';
  document.getElementById('transactionsCSVPreview').classList.add('hidden');
  document.getElementById('transactionsCSVResult').classList.add('hidden');
  document.getElementById('transactionsCSVImportBtn').disabled = true;
  pendingTransactionsCSV = { headers: [], rows: [] };
  showModal('importTransactionsCSVModal');
}

function previewTransactionsCSV() {
  const fileInput = document.getElementById('transactionsCSVFile');
  const preview = document.getElementById('transactionsCSVPreview');
  const result = document.getElementById('transactionsCSVResult');
  const importBtn = document.getElementById('transactionsCSVImportBtn');
  const countEl = document.getElementById('transactionsCSVPreviewCount');
  const head = document.getElementById('transactionsCSVPreviewHead');
  const body = document.getElementById('transactionsCSVPreviewBody');

  const file = fileInput.files[0];
  if (!file) {
    preview.classList.add('hidden');
    result.classList.add('hidden');
    importBtn.disabled = true;
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const parsed = parseCSV(e.target.result);
    pendingTransactionsCSV = parsed;

    const required = ['portfolio', 'symbol', 'date', 'type'];
    const missing = required.filter(h => !parsed.headers.includes(h));
    if (missing.length > 0) {
      result.classList.remove('hidden');
      result.innerHTML = `<span style="color:var(--danger);">Missing required columns: ${missing.join(', ')}</span>`;
      preview.classList.add('hidden');
      importBtn.disabled = true;
      return;
    }

    result.classList.add('hidden');
    preview.classList.remove('hidden');
    countEl.textContent = parsed.rows.length;

    head.innerHTML = `<tr>${parsed.headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
    body.innerHTML = parsed.rows.slice(0, 5).map(row => {
      return `<tr>${parsed.headers.map(h => `<td>${escapeHtml(row[h] || '')}</td>`).join('')}</tr>`;
    }).join('') + (parsed.rows.length > 5 ? `<tr><td colspan="${parsed.headers.length}" style="text-align:center;color:var(--text-muted);">...and ${parsed.rows.length - 5} more rows</td></tr>` : '');

    importBtn.disabled = parsed.rows.length === 0;
  };
  reader.onerror = () => {
    result.classList.remove('hidden');
    result.innerHTML = `<span style="color:var(--danger);">Failed to read file</span>`;
    preview.classList.add('hidden');
    importBtn.disabled = true;
  };
  reader.readAsText(file);
}

function exportTransactionsToCSV() {
  const portfolioId = getSelectedPortfolioId();
  let txs = portfolioId ? getPortfolioTransactions(portfolioId) : [...appData.transactions];
  txs.sort((a, b) => a.date.localeCompare(b.date));
  const headers = ['portfolio', 'symbol', 'date', 'type', 'shares', 'price', 'amount', 'dividendType', 'notes'];
  const rows = txs.map(tx => {
    const portfolio = getPortfolio(tx.portfolioId);
    const holding = getHolding(tx.holdingId);
    const isDividend = tx.type === 'dividend';
    return [
      portfolio ? portfolio.name : '',
      holding ? holding.symbol : '',
      tx.date,
      tx.type,
      !isDividend && tx.shares != null ? tx.shares.toFixed(4) : '',
      !isDividend && tx.price != null ? tx.price.toFixed(2) : '',
      isDividend && tx.amount != null ? tx.amount.toFixed(2) : '',
      tx.dividendType || '',
      tx.notes || ''
    ];
  });
  if (rows.length === 0) {
    showToast('No transactions to export', 'warning');
    return;
  }
  downloadCSVTemplate('transactions.csv', headers, rows, 'Transactions exported');
}

function downloadTransactionsCSVTemplate() {
  const headers = ['portfolio', 'symbol', 'date', 'type', 'shares', 'price', 'amount', 'dividendType', 'notes'];
  const rows = [
    ['My Portfolio', 'AAPL', '2024-01-15', 'buy', '10', '150.00', '', '', 'Initial position'],
    ['My Portfolio', 'AAPL', '2024-03-15', 'dividend', '', '', '12.50', 'qualified', 'Quarterly dividend'],
    ['My Portfolio', 'MSFT', '2024-02-10', 'buy', '5', '300.00', '', '', ''],
    ['Retirement', 'VTI', '2024-01-20', 'buy', '25', '220.00', '', '', 'Monthly contribution']
  ];
  downloadCSVTemplate('transactions_template.csv', headers, rows, 'Transactions template');
}

function importTransactionsFromCSV() {
  const { rows } = pendingTransactionsCSV;
  const skipDuplicates = document.getElementById('transactionsCSVSkipDuplicates').checked;
  const result = document.getElementById('transactionsCSVResult');
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const importedHoldingIds = new Set();

  rows.forEach(row => {
    const portfolioName = (row.portfolio || '').trim();
    const symbol = (row.symbol || '').trim().toUpperCase();
    const date = (row.date || '').trim();
    const type = (row.type || '').trim().toLowerCase();
    const notes = (row.notes || '').trim();
    const dividendType = (row.dividendType || '').trim().toLowerCase() || null;

    if (!portfolioName || !symbol || !date || !type) {
      errors++;
      return;
    }
    if (!isValidDate(date)) {
      errors++;
      return;
    }
    if (!['initial', 'buy', 'sell', 'dividend'].includes(type)) {
      errors++;
      return;
    }

    // Find or create portfolio
    let portfolio = appData.portfolios.find(p => p.name.toLowerCase() === portfolioName.toLowerCase());
    if (!portfolio) {
      portfolio = { id: createId(), name: portfolioName, brokerage: 'Other' };
      appData.portfolios.push(portfolio);
    }

    // Find or create holding
    let holding = appData.holdings.find(h => h.portfolioId === portfolio.id && h.symbol.toUpperCase() === symbol);
    if (!holding) {
      const price = parseFloat(row.price) || parseFloat(row.avgCost) || 0;
      holding = {
        id: createId(),
        portfolioId: portfolio.id,
        symbol,
        name: symbol,
        shares: 0,
        avgCost: price,
        currentPrice: price
      };
      appData.holdings.push(holding);
    }

    // Build transaction data
    let txData = {
      portfolioId: portfolio.id,
      holdingId: holding.id,
      date,
      type,
      notes,
      dividendType: type === 'dividend' ? dividendType : null,
      shares: 0,
      price: 0,
      amount: 0
    };

    if (type === 'dividend') {
      const amount = parseFloat(row.amount);
      if (isNaN(amount) || amount <= 0) {
        errors++;
        return;
      }
      txData.amount = amount;
      txData.shares = 0;
      txData.price = 0;
    } else {
      const shares = parseFloat(row.shares);
      const price = parseFloat(row.price);
      if (isNaN(shares) || shares <= 0 || isNaN(price) || price <= 0) {
        errors++;
        return;
      }
      txData.shares = shares;
      txData.price = price;
    }

    // Check for duplicates (include notes for a more precise fingerprint)
    if (skipDuplicates) {
      const duplicate = appData.transactions.find(t =>
        t.portfolioId === txData.portfolioId &&
        t.holdingId === txData.holdingId &&
        t.date === txData.date &&
        t.type === txData.type &&
        (t.amount || 0) === (txData.amount || 0) &&
        (t.shares || 0) === (txData.shares || 0) &&
        (t.notes || '') === (txData.notes || '')
      );
      if (duplicate) {
        skipped++;
        return;
      }
    }

    txData.id = createId();
    appData.transactions.push(txData);
    importedHoldingIds.add(holding.id);
    imported++;
  });

  // Recalc only holdings affected by the import
  importedHoldingIds.forEach(hid => recalcHoldingFromTransactions(hid));

  saveData(appData);
  result.classList.remove('hidden');
  result.innerHTML = `
    <span style="color:var(--success);">${imported} imported</span>
    ${skipped > 0 ? `<span style="color:var(--warning);"> &middot; ${skipped} skipped</span>` : ''}
    ${errors > 0 ? `<span style="color:var(--danger);"> &middot; ${errors} errors</span>` : ''}
  `;
  document.getElementById('transactionsCSVImportBtn').disabled = true;
  refreshPageData();
  showToast(`Imported ${imported} transactions`, 'success');
}

function checkEditFromSession() {
  const editId = sessionStorage.getItem('editTransactionId');
  if (editId) {
    sessionStorage.removeItem('editTransactionId');
    editTransaction(editId);
  }
}
