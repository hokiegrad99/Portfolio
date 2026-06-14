/**
 * Portfolio Tracker - Reports Page Logic
 */

let monthlyIncomeChart = null;
let annualIncomeChart = null;
let portfolioComparisonChart = null;
let holdingDividendChart = null;

let currentTab = 'monthly';

function refreshPageData() {
  if (currentTab === 'monthly') updateMonthlyIncomeChart();
  if (currentTab === 'annual') updateAnnualIncomeChart();
  if (currentTab === 'portfolio') updatePortfolioComparisonChart();
  if (currentTab === 'holdings') updateHoldingDividendChart();
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  refreshPageData();
}

function updateMonthlyIncomeChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const monthlyData = getDividendsByMonth(portfolioId);
  const sortedMonths = Object.keys(monthlyData).sort();
  const labels = sortedMonths.map(m => {
    const [year, month] = m.split('-');
    return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });
  const data = sortedMonths.map(m => monthlyData[m]);

  const ctx = document.getElementById('monthlyIncomeChart');
  if (!ctx) return;
  if (monthlyIncomeChart) monthlyIncomeChart.destroy();

  monthlyIncomeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Monthly Dividend Income',
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

function updateAnnualIncomeChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const annualData = getDividendsByYear(portfolioId);
  const sortedYears = Object.keys(annualData).sort();
  const data = sortedYears.map(y => annualData[y]);

  const ctx = document.getElementById('annualIncomeChart');
  if (!ctx) return;
  if (annualIncomeChart) annualIncomeChart.destroy();

  annualIncomeChart = new Chart(ctx, {
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

function updatePortfolioComparisonChart() {
  if (typeof Chart === 'undefined') return;
  const portfolios = appData.portfolios;
  const labels = portfolios.map(p => p.name);
  const data = portfolios.map(p => getTotalDividends(p.id));
  const bgColors = [
    'rgba(37, 99, 235, 0.7)',
    'rgba(16, 185, 129, 0.7)',
    'rgba(245, 158, 11, 0.7)',
    'rgba(239, 68, 68, 0.7)',
    'rgba(139, 92, 246, 0.7)',
    'rgba(6, 182, 212, 0.7)',
  ];

  const ctx = document.getElementById('portfolioComparisonChart');
  if (!ctx) return;
  if (portfolioComparisonChart) portfolioComparisonChart.destroy();

  portfolioComparisonChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors.slice(0, labels.length),
        borderColor: bgColors.slice(0, labels.length).map(c => c.replace('0.7', '1')),
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
              const total = data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
            }
          }
        }
      }
    })
  });
}

function updateHoldingDividendChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const divByHolding = getDividendsByHolding(portfolioId);
  const entries = Object.entries(divByHolding)
    .map(([hid, amount]) => ({ holding: getHolding(hid), amount }))
    .filter(e => e.holding)
    .sort((a, b) => b.amount - a.amount);

  const labels = entries.map(e => e.holding.symbol);
  const data = entries.map(e => e.amount);

  const ctx = document.getElementById('holdingDividendChart');
  if (!ctx) return;
  if (holdingDividendChart) holdingDividendChart.destroy();

  holdingDividendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Dividends',
        data,
        backgroundColor: 'rgba(139, 92, 246, 0.7)',
        borderColor: 'rgba(139, 92, 246, 1)',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: applyChartDarkMode({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatCurrency(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: (val) => '$' + val.toFixed(0)
          }
        },
        y: {
          grid: { display: false }
        }
      }
    })
  });
}

window.refreshPageData = refreshPageData;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    refreshPageData();
  });
} else {
  refreshPageData();
}
