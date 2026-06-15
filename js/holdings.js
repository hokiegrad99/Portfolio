/**
 * Portfolio Tracker - Holdings Page Logic
 */

function refreshPageData() {
  updateHoldingsTable();
  populatePortfolioOptions();
}

function updateHoldingsTable() {
  const portfolioId = getSelectedPortfolioId();
  let holdings = portfolioId ? getPortfolioHoldings(portfolioId) : [...appData.holdings];

  const tbody = document.getElementById('holdingsTable');
  if (!tbody) return;

  if (holdings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No holdings yet. Add your first holding to get started.</td></tr>`;
    return;
  }

  tbody.innerHTML = holdings.map(h => {
    const portfolio = getPortfolio(h.portfolioId);
    const marketValue = h.shares * (h.currentPrice || h.avgCost || 0);
    const costBasis = h.shares * (h.avgCost || 0);
    const gainLoss = marketValue - costBasis;
    const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
    const gainClass = gainLoss >= 0 ? 'text-success' : 'text-danger';

    return `
      <tr>
        <td class="font-mono" style="font-weight:600;">${h.symbol}</td>
        <td>${h.name || ''}</td>
        <td>${portfolio ? portfolio.name : 'Unknown'}</td>
        <td class="text-right">${formatNumber(h.shares, 4)}</td>
        <td class="text-right">${formatCurrency(h.avgCost)}</td>
        <td class="text-right">${formatCurrency(h.currentPrice || h.avgCost)}</td>
        <td class="text-right" style="font-weight:600;">${formatCurrency(marketValue)}</td>
        <td class="text-right ${gainClass}">
          ${formatCurrency(gainLoss)}<br>
          <small>${gainLossPct >= 0 ? '+' : ''}${formatNumber(gainLossPct, 2)}%</small>
        </td>
        <td class="text-center">
          <button class="btn btn-sm btn-ghost" onclick="editHolding('${h.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteHoldingPrompt('${h.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function populatePortfolioOptions() {
  const select = document.getElementById('holdingPortfolio');
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

function openAddHoldingModal() {
  document.getElementById('holdingForm').reset();
  document.getElementById('holdingId').value = '';
  document.getElementById('holdingModalTitle').textContent = 'Add Holding';
  populatePortfolioOptions();
  // Pre-select from portfolio selector
  const selectedPortfolio = getSelectedPortfolioId();
  if (selectedPortfolio) {
    document.getElementById('holdingPortfolio').value = selectedPortfolio;
  }
  // Reset lookup status and validation
  const symbolInput = document.getElementById('holdingSymbol');
  const spinner = document.getElementById('symbolLookupSpinner');
  const status = document.getElementById('symbolLookupStatus');
  if (symbolInput) {
    symbolInput.classList.remove('input-valid', 'input-invalid');
    symbolInput.dataset.lastSymbol = '';
  }
  if (spinner) spinner.classList.add('hidden');
  if (status) { status.classList.add('hidden'); status.textContent = ''; }
  showModal('holdingModal');
}

let lookupDebounceTimer = null;

async function autoLookupHoldingInfo() {
  const symbolInput = document.getElementById('holdingSymbol');
  const nameInput = document.getElementById('holdingName');
  const priceInput = document.getElementById('holdingCurrentPrice');
  const spinner = document.getElementById('symbolLookupSpinner');
  const status = document.getElementById('symbolLookupStatus');
  const symbol = symbolInput.value.trim().toUpperCase();
  const lastSymbol = symbolInput.dataset.lastSymbol || '';

  if (!symbol || symbol.length > 10) {
    symbolInput.classList.remove('input-valid', 'input-invalid');
    return;
  }

  // If symbol changed from last lookup, clear old name/price and validation so lookup can fill them
  if (symbol !== lastSymbol) {
    nameInput.value = '';
    priceInput.value = '';
    symbolInput.classList.remove('input-valid', 'input-invalid');
  }

  // Clear any pending debounce
  if (lookupDebounceTimer) clearTimeout(lookupDebounceTimer);

  lookupDebounceTimer = setTimeout(async () => {
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
      if (!priceInput.value) {
        priceInput.value = info.price;
      }
      if (status) { status.textContent = 'Found: ' + info.name; }
      setTimeout(() => { if (status) status.classList.add('hidden'); }, 2000);
    } else {
      symbolInput.classList.remove('input-valid');
      symbolInput.classList.add('input-invalid');
      if (status) { status.textContent = 'Symbol not found'; }
      setTimeout(() => { if (status) status.classList.add('hidden'); }, 3000);
    }
  }, 400);
}

function editHolding(id) {
  const h = getHolding(id);
  if (!h) return;
  document.getElementById('holdingId').value = h.id;
  document.getElementById('holdingPortfolio').value = h.portfolioId;
  document.getElementById('holdingSymbol').value = h.symbol;
  document.getElementById('holdingName').value = h.name || '';
  document.getElementById('holdingShares').value = h.shares;
  document.getElementById('holdingAvgCost').value = h.avgCost;
  document.getElementById('holdingCurrentPrice').value = h.currentPrice || '';
  document.getElementById('holdingModalTitle').textContent = 'Edit Holding';
  // Reset lookup status and validation
  const symbolInput = document.getElementById('holdingSymbol');
  const spinner = document.getElementById('symbolLookupSpinner');
  const status = document.getElementById('symbolLookupStatus');
  if (symbolInput) {
    symbolInput.classList.remove('input-valid', 'input-invalid');
    symbolInput.dataset.lastSymbol = '';
  }
  if (spinner) spinner.classList.add('hidden');
  if (status) { status.classList.add('hidden'); status.textContent = ''; }
  populatePortfolioOptions();
  showModal('holdingModal');
}

function saveHolding() {
  const id = document.getElementById('holdingId').value;
  const portfolioId = document.getElementById('holdingPortfolio').value;
  const symbol = document.getElementById('holdingSymbol').value.trim().toUpperCase();
  const name = document.getElementById('holdingName').value.trim();
  const shares = parseFloat(document.getElementById('holdingShares').value);
  const avgCost = parseFloat(document.getElementById('holdingAvgCost').value);
  const currentPrice = parseFloat(document.getElementById('holdingCurrentPrice').value) || avgCost;

  if (!portfolioId || !symbol || isNaN(shares) || isNaN(avgCost)) {
    showToast('Please fill in all required fields', 'warning');
    return;
  }

  const holdingData = { portfolioId, symbol, name, shares, avgCost, currentPrice };

  if (id) {
    updateHolding(id, holdingData);
    showToast('Holding updated successfully', 'success');
  } else {
    addHolding(holdingData);
    showToast('Holding added successfully', 'success');
  }

  hideModal('holdingModal');
  refreshPageData();
}

function deleteHoldingPrompt(id) {
  confirmDialog('Are you sure you want to delete this holding? All associated transactions will also be removed.', () => {
    deleteHolding(id);
    showToast('Holding deleted', 'success');
    refreshPageData();
  });
}

let pendingHoldingsCSV = { headers: [], rows: [] };

function openImportHoldingsCSVModal() {
  document.getElementById('holdingsCSVFile').value = '';
  document.getElementById('holdingsCSVPreview').classList.add('hidden');
  document.getElementById('holdingsCSVResult').classList.add('hidden');
  document.getElementById('holdingsCSVImportBtn').disabled = true;
  pendingHoldingsCSV = { headers: [], rows: [] };
  showModal('importHoldingsCSVModal');
}

function previewHoldingsCSV() {
  const fileInput = document.getElementById('holdingsCSVFile');
  const preview = document.getElementById('holdingsCSVPreview');
  const result = document.getElementById('holdingsCSVResult');
  const importBtn = document.getElementById('holdingsCSVImportBtn');
  const countEl = document.getElementById('holdingsCSVPreviewCount');
  const head = document.getElementById('holdingsCSVPreviewHead');
  const body = document.getElementById('holdingsCSVPreviewBody');

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
    pendingHoldingsCSV = parsed;

    const required = ['portfolio', 'symbol', 'shares', 'avgCost'];
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

    // Show preview table with first 5 rows
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

function exportHoldingsToCSV() {
  const portfolioId = getSelectedPortfolioId();
  const holdings = portfolioId ? getPortfolioHoldings(portfolioId) : [...appData.holdings];
  const headers = ['portfolio', 'symbol', 'shares', 'avgCost', 'name', 'currentPrice'];
  const rows = holdings.map(h => {
    const portfolio = getPortfolio(h.portfolioId);
    return [
      portfolio ? portfolio.name : '',
      h.symbol,
      h.shares.toFixed(4),
      h.avgCost.toFixed(2),
      h.name || '',
      h.currentPrice != null ? h.currentPrice.toFixed(2) : ''
    ];
  });
  if (rows.length === 0) {
    showToast('No holdings to export', 'warning');
    return;
  }
  downloadCSVTemplate('holdings.csv', headers, rows, 'Holdings exported');
}

function downloadHoldingsCSVTemplate() {
  const headers = ['portfolio', 'symbol', 'shares', 'avgCost', 'name', 'currentPrice'];
  const rows = [
    ['My Portfolio', 'AAPL', '10', '150.00', 'Apple Inc.', '175.00'],
    ['My Portfolio', 'MSFT', '5', '300.00', 'Microsoft Corp.', '330.00'],
    ['Retirement', 'VTI', '25', '220.00', 'Vanguard Total Stock', '245.00']
  ];
  downloadCSVTemplate('holdings_template.csv', headers, rows, 'Holdings template');
}

function importHoldingsFromCSV() {
  const { rows } = pendingHoldingsCSV;
  const skipDuplicates = document.getElementById('holdingsCSVSkipDuplicates').checked;
  const result = document.getElementById('holdingsCSVResult');
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  rows.forEach(row => {
    const portfolioName = (row.portfolio || '').trim();
    const symbol = (row.symbol || '').trim().toUpperCase();
    const shares = parseFloat(row.shares);
    const avgCost = parseFloat(row.avgCost);
    const name = (row.name || '').trim();
    const currentPrice = row.currentPrice ? parseFloat(row.currentPrice) : avgCost;

    if (!portfolioName || !symbol || isNaN(shares) || isNaN(avgCost)) {
      errors++;
      return;
    }

    // Find or create portfolio
    let portfolio = appData.portfolios.find(p => p.name.toLowerCase() === portfolioName.toLowerCase());
    if (!portfolio) {
      portfolio = { id: createId(), name: portfolioName, brokerage: 'Other' };
      appData.portfolios.push(portfolio);
    }

    // Check for duplicate symbol in same portfolio
    if (skipDuplicates) {
      const existing = appData.holdings.find(h => h.portfolioId === portfolio.id && h.symbol.toUpperCase() === symbol);
      if (existing) {
        skipped++;
        return;
      }
    }

    const holding = {
      id: createId(),
      portfolioId: portfolio.id,
      symbol,
      name: name || symbol,
      shares,
      avgCost,
      currentPrice: isNaN(currentPrice) ? avgCost : currentPrice
    };
    appData.holdings.push(holding);
    imported++;
  });

  saveData(appData);
  result.classList.remove('hidden');
  result.innerHTML = `
    <span style="color:var(--success);">${imported} imported</span>
    ${skipped > 0 ? `<span style="color:var(--warning);"> &middot; ${skipped} skipped</span>` : ''}
    ${errors > 0 ? `<span style="color:var(--danger);"> &middot; ${errors} errors</span>` : ''}
  `;
  document.getElementById('holdingsCSVImportBtn').disabled = true;
  refreshPageData();
  showToast(`Imported ${imported} holdings`, 'success');
}

window.refreshPageData = refreshPageData;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshPageData);
} else {
  refreshPageData();
}
