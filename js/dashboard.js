/**
 * Portfolio Tracker - Dashboard Page Logic
 */

let monthlyChart = null;
let typeChart = null;

function refreshPageData() {
  updateTiles();
  updateMonthlyChart();
  updateDividendTypeChart();
  updateRecentTransactions();
}

function updateTiles() {
  const portfolioId = getSelectedPortfolioId();

  // Portfolio Value
  const value = portfolioId ? getPortfolioValue(portfolioId) : appData.portfolios.reduce((sum, p) => sum + getPortfolioValue(p.id), 0);
  const basis = portfolioId ? getPortfolioCostBasis(portfolioId) : appData.portfolios.reduce((sum, p) => sum + getPortfolioCostBasis(p.id), 0);
  document.getElementById('tilePortfolioValue').textContent = formatCurrency(value);
  document.getElementById('tilePortfolioBasis').textContent = `Cost basis: ${formatCurrency(basis)}`;

  // Total Dividends
  const totalDivs = getTotalDividends(portfolioId);
  const divCount = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend').length
    : appData.transactions.filter(t => t.type === 'dividend').length;
  document.getElementById('tileTotalDividends').textContent = formatCurrency(totalDivs);
  document.getElementById('tileDividendCount').textContent = `${divCount} payment${divCount !== 1 ? 's' : ''}`;

  // This Month
  const thisMonth = getDividendsThisMonth(portfolioId);
  document.getElementById('tileDividendsThisMonth').textContent = formatCurrency(thisMonth);
  const now = new Date();
  document.getElementById('tileMonthName').textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // This Year
  const thisYear = getDividendsThisYear(portfolioId);
  document.getElementById('tileDividendsThisYear').textContent = formatCurrency(thisYear);
  document.getElementById('tileYearName').textContent = now.getFullYear();
}

function updateMonthlyChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const monthlyData = getDividendsByMonth(portfolioId);

  // Sort months and get last 12
  const sortedMonths = Object.keys(monthlyData).sort().slice(-12);
  const labels = sortedMonths.map(m => {
    const [year, month] = m.split('-');
    return `${month}/${year}`;
  });
  const data = sortedMonths.map(m => monthlyData[m]);

  const ctx = document.getElementById('monthlyDividendChart');
  if (!ctx) return;

  if (monthlyChart) {
    monthlyChart.destroy();
  }      monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Dividend Income',
        data,
        backgroundColor: 'rgba(37, 99, 235, 0.7)',
        borderColor: 'rgba(37, 99, 235, 1)',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: applyChartDarkMode({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatCurrency(ctx.raw)
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => '$' + val.toFixed(0)
          }
        },
        x: {
          grid: { display: false }
        }
      }
    })
  });
}

function updateDividendTypeChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const types = getDividendsByType(portfolioId);

  const ctx = document.getElementById('dividendTypeChart');
  if (!ctx) return;

  if (typeChart) {
    typeChart.destroy();
  }

  typeChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Qualified', 'Ordinary'],
      datasets: [{
        data: [types.qualified, types.ordinary],
        backgroundColor: [
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)'
        ],
        borderColor: [
          'rgba(16, 185, 129, 1)',
          'rgba(245, 158, 11, 1)'
        ],
        borderWidth: 1,
      }]
    },
    options: applyChartDarkMode({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            padding: 16
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = types.qualified + types.ordinary;
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
            }
          }
        }
      }
    })
  });
}

function updateRecentTransactions() {
  const portfolioId = getSelectedPortfolioId();
  let txs = portfolioId
    ? getPortfolioTransactions(portfolioId)
    : [...appData.transactions];

  txs.sort((a, b) => b.date.localeCompare(a.date));
  txs = txs.slice(0, 10);

  const tbody = document.getElementById('recentTransactionsTable');
  if (!tbody) return;

  if (txs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No transactions yet</td></tr>`;
    return;
  }

  tbody.innerHTML = txs.map(tx => {
    const portfolio = getPortfolio(tx.portfolioId);
    const holding = getHolding(tx.holdingId);
    const typeClass = tx.type === 'buy' ? 'badge-green' : tx.type === 'sell' ? 'badge-red' : tx.type === 'dividend' ? 'badge-blue' : 'badge-gray';
    const amount = tx.type === 'dividend' ? tx.amount : (tx.shares * tx.price);
    return `
      <tr>
        <td>${formatDate(tx.date)}</td>
        <td>${portfolio ? portfolio.name : 'Unknown'}</td>
        <td class="font-mono">${holding ? holding.symbol : 'Unknown'}</td>
        <td><span class="badge ${typeClass}">${tx.type}</span></td>
        <td class="text-right">${tx.shares ? formatNumber(tx.shares, 2) : '-'}</td>
        <td class="text-right">${tx.price ? formatCurrency(tx.price) : '-'}</td>
        <td class="text-right">${formatCurrency(amount)}</td>
      </tr>
    `;
  }).join('');
}

// Make available globally
window.refreshPageData = refreshPageData;

// Initialize when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshPageData);
} else {
  refreshPageData();
}
