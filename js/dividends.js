/**
 * Portfolio Tracker - Dividends Page Logic
 */

let annualChart = null;
let typeYearChart = null;
let monthly3YearChart = null;

function refreshPageData() {
  updateDividendSummary();
  updateAnnualChart();
  updateDividendTypeYearChart();
  updateMonthly3YearChart();
  updateDividendsTable();
}

function updateDividendSummary() {
  const portfolioId = getSelectedPortfolioId();
  const total = getTotalDividends(portfolioId);
  const types = getDividendsByType(portfolioId);
  const thisYear = getDividendsThisYear(portfolioId);

  document.getElementById('divTotal').textContent = formatCurrency(total);
  document.getElementById('divQualified').textContent = formatCurrency(types.qualified);
  document.getElementById('divOrdinary').textContent = formatCurrency(types.ordinary);
  document.getElementById('divThisYear').textContent = formatCurrency(thisYear);
}

function updateAnnualChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const annualData = getDividendsByYear(portfolioId);
  const sortedYears = Object.keys(annualData).sort();
  const data = sortedYears.map(y => annualData[y]);

  const ctx = document.getElementById('annualDividendChart');
  if (!ctx) return;
  if (annualChart) annualChart.destroy();

  annualChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedYears,
      datasets: [{
        label: 'Annual Dividend Income',
        data,
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderColor: 'rgba(16, 185, 129, 1)',
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

function updateDividendTypeYearChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');

  const years = {};
  txs.forEach(t => {
    const year = getYearFromDate(t.date);
    if (!years[year]) years[year] = { qualified: 0, ordinary: 0 };
    if (t.dividendType === 'qualified') years[year].qualified += t.amount || 0;
    else years[year].ordinary += t.amount || 0;
  });

  const sortedYears = Object.keys(years).sort();
  const qualifiedData = sortedYears.map(y => years[y].qualified);
  const ordinaryData = sortedYears.map(y => years[y].ordinary);

  const ctx = document.getElementById('dividendTypeYearChart');
  if (!ctx) return;
  if (typeYearChart) typeYearChart.destroy();

  typeYearChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedYears,
      datasets: [
        {
          label: 'Qualified',
          data: qualifiedData,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 1,
          borderRadius: 4,
        },
        {
          label: 'Ordinary',
          data: ordinaryData,
          backgroundColor: 'rgba(245, 158, 11, 0.8)',
          borderColor: 'rgba(245, 158, 11, 1)',
          borderWidth: 1,
          borderRadius: 4,
        }
      ]
    },
    options: applyChartDarkMode({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          stacked: true,
          ticks: {
            callback: (val) => '$' + val.toFixed(0)
          }
        },
        x: {
          stacked: true,
          grid: { display: false }
        }
      }
    })
  });
}

function updateDividendsTable() {
  const portfolioId = getSelectedPortfolioId();
  let txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');
  txs.sort((a, b) => b.date.localeCompare(a.date));

  const tbody = document.getElementById('dividendsTable');
  if (!tbody) return;

  if (txs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No dividend payments yet. Add dividends from the Transactions page.</td></tr>`;
    return;
  }

  tbody.innerHTML = txs.map(tx => {
    const portfolio = getPortfolio(tx.portfolioId);
    const holding = getHolding(tx.holdingId);
    const typeLabel = tx.dividendType === 'qualified'
      ? '<span class="dividend-type qualified">Qualified</span>'
      : '<span class="dividend-type ordinary">Ordinary</span>';

    return `
      <tr>
        <td>${formatDate(tx.date)}</td>
        <td>${portfolio ? portfolio.name : 'Unknown'}</td>
        <td class="font-mono">${holding ? holding.symbol : 'Unknown'}</td>
        <td class="text-right" style="font-weight:600;">${formatCurrency(tx.amount)}</td>
        <td>${typeLabel}</td>
        <td>${tx.notes || ''}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-ghost" onclick="editDividendTransaction('${tx.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteDividendPrompt('${tx.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

function editDividendTransaction(id) {
  // Navigate to transactions page with pre-filled edit
  sessionStorage.setItem('editTransactionId', id);
  window.location.href = 'transactions.html';
}

function updateMonthly3YearChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');

  // Group by year and month
  const yearMonthData = {};
  txs.forEach(t => {
    const year = getYearFromDate(t.date);
    const month = parseInt(t.date.split('-')[1], 10) - 1; // 0-11
    if (!yearMonthData[year]) yearMonthData[year] = new Array(12).fill(0);
    yearMonthData[year][month] += (t.amount || 0);
  });

  // Get the most recent 3 years with data
  const yearsWithData = Object.keys(yearMonthData).sort();
  const recent3Years = yearsWithData.slice(-3);

  const ctx = document.getElementById('monthly3YearChart');
  if (!ctx) return;
  if (monthly3YearChart) monthly3YearChart.destroy();

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Colors for up to 3 years
  const yearColors = [
    { bg: 'rgba(16, 185, 129, 0.7)', border: 'rgba(16, 185, 129, 1)' },
    { bg: 'rgba(37, 99, 235, 0.7)', border: 'rgba(37, 99, 235, 1)' },
    { bg: 'rgba(245, 158, 11, 0.7)', border: 'rgba(245, 158, 11, 1)' },
  ];

  const datasets = recent3Years.map((year, idx) => {
    const color = yearColors[idx % yearColors.length];
    return {
      label: year,
      data: yearMonthData[year],
      backgroundColor: color.bg,
      borderColor: color.border,
      borderWidth: 1,
      borderRadius: 4,
    };
  });

  monthly3YearChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: datasets
    },
    options: applyChartDarkMode({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'rectRounded',
            padding: 20,
            font: {
              size: 13,
              weight: '500'
            }
          },
          onClick: (e, legendItem, legend) => {
            const index = legendItem.datasetIndex;
            const ci = legend.chart;
            if (ci.isDatasetVisible(index)) {
              ci.hide(index);
              legendItem.hidden = true;
            } else {
              ci.show(index);
              legendItem.hidden = false;
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
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

function deleteDividendPrompt(id) {
  confirmDialog('Are you sure you want to delete this dividend payment?', () => {
    deleteTransaction(id);
    showToast('Dividend deleted', 'success');
    refreshPageData();
  });
}

window.refreshPageData = refreshPageData;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshPageData);
} else {
  refreshPageData();
}
