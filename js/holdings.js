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

window.refreshPageData = refreshPageData;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshPageData);
} else {
  refreshPageData();
}
