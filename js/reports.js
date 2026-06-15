/**
 * Portfolio Tracker - Reports Page Logic
 */

let monthlyIncomeChart = null;
let annualIncomeChart = null;
let portfolioComparisonChart = null;
let holdingDividendChart = null;

let currentTab = 'monthly';
let yearSelectorListenerAttached = false;
let compareYears = false;
let comparePortfolios = false;
let trendLine = false;

function refreshPageData() {
  populateYearSelector();
  updateSummaryCards();
  if (currentTab === 'monthly') updateMonthlyIncomeChart();
  if (currentTab === 'annual') updateAnnualIncomeChart();
  if (currentTab === 'portfolio') updatePortfolioComparisonChart();
  if (currentTab === 'holdings') updateHoldingDividendChart();
}

function populateYearSelector() {
  const selector = document.getElementById('yearSelector');
  if (!selector) return;
  const currentValue = selector.value;

  const portfolioId = getSelectedPortfolioId();
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');

  const years = [...new Set(txs.map(t => getYearFromDate(t.date)))].sort();

  selector.innerHTML = '<option value="">All Years</option>';
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    selector.appendChild(opt);
  });

  if (currentValue === '' || years.includes(currentValue)) {
    selector.value = currentValue;
  } else if (years.includes(getCurrentYearStr())) {
    selector.value = getCurrentYearStr();
  } else {
    selector.value = '';
  }

  if (!yearSelectorListenerAttached) {
    selector.addEventListener('change', () => {
      if (typeof window.refreshPageData === 'function') {
        window.refreshPageData();
      }
    });
    yearSelectorListenerAttached = true;
  }
}

function getSelectedYear() {
  const selector = document.getElementById('yearSelector');
  return selector ? selector.value : '';
}

function toggleCompareYears() {
  const checkbox = document.getElementById('compareYearsToggle');
  compareYears = checkbox ? checkbox.checked : false;
  // Mutual exclusivity: uncheck Compare Portfolios
  if (compareYears) {
    comparePortfolios = false;
    const portfolioCheckbox = document.getElementById('comparePortfoliosToggle');
    if (portfolioCheckbox) portfolioCheckbox.checked = false;
  }
  const yearSelector = document.getElementById('yearSelector');
  if (yearSelector) {
    const disable = compareYears && currentTab === 'monthly';
    yearSelector.disabled = disable;
    yearSelector.style.opacity = disable ? '0.5' : '1';
    if (compareYears) {
      yearSelector.value = '';
    }
  }
  if (typeof window.refreshPageData === 'function') {
    window.refreshPageData();
  }
}

function toggleTrendLine() {
  const checkbox = document.getElementById('trendLineToggle');
  trendLine = checkbox ? checkbox.checked : false;
  if (typeof window.refreshPageData === 'function') {
    window.refreshPageData();
  }
}

function toggleComparePortfolios() {
  const checkbox = document.getElementById('comparePortfoliosToggle');
  comparePortfolios = checkbox ? checkbox.checked : false;
  // Mutual exclusivity: uncheck Compare Years
  if (comparePortfolios) {
    compareYears = false;
    const yearsCheckbox = document.getElementById('compareYearsToggle');
    if (yearsCheckbox) yearsCheckbox.checked = false;
  }
  const portfolioSelector = document.getElementById('portfolioSelector');
  if (portfolioSelector) {
    const disable = comparePortfolios && currentTab === 'monthly';
    portfolioSelector.disabled = disable;
    portfolioSelector.style.opacity = disable ? '0.5' : '1';
    if (comparePortfolios) {
      portfolioSelector.value = '';
    }
  }
  const yearSelector = document.getElementById('yearSelector');
  if (yearSelector) {
    yearSelector.disabled = false;
    yearSelector.style.opacity = '1';
  }
  if (typeof window.refreshPageData === 'function') {
    window.refreshPageData();
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  // Only disable selectors on Monthly tab when compare modes are active
  const yearSelector = document.getElementById('yearSelector');
  if (yearSelector) {
    const disableYear = compareYears && tab === 'monthly';
    yearSelector.disabled = disableYear;
    yearSelector.style.opacity = disableYear ? '0.5' : '1';
  }
  const portfolioSelector = document.getElementById('portfolioSelector');
  if (portfolioSelector) {
    const disablePortfolio = comparePortfolios && tab === 'monthly';
    portfolioSelector.disabled = disablePortfolio;
    portfolioSelector.style.opacity = disablePortfolio ? '0.5' : '1';
  }
  refreshPageData();
}

function updateMonthlyIncomeChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const selectedYear = getSelectedYear();
  const ctx = document.getElementById('monthlyIncomeChart');
  if (!ctx) return;
  if (monthlyIncomeChart) monthlyIncomeChart.destroy();

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const chartColors = [
    'rgba(37, 99, 235, 0.7)',
    'rgba(16, 185, 129, 0.7)',
    'rgba(245, 158, 11, 0.7)',
    'rgba(239, 68, 68, 0.7)',
    'rgba(139, 92, 246, 0.7)',
    'rgba(6, 182, 212, 0.7)',
    'rgba(236, 72, 153, 0.7)',
    'rgba(99, 102, 241, 0.7)',
  ];
  const chartBorderColors = chartColors.map(c => c.replace('0.7', '1'));

  if (compareYears) {
    // Compare years: one dataset per year, x-axis = months
    const txs = portfolioId
      ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
      : appData.transactions.filter(t => t.type === 'dividend');

    const years = [...new Set(txs.map(t => getYearFromDate(t.date)))].sort();

    const datasets = years.map((year, idx) => {
      const yearData = new Array(12).fill(0);
      txs.filter(t => getYearFromDate(t.date) === year).forEach(t => {
        const monthIdx = parseInt(t.date.split('-')[1], 10) - 1;
        yearData[monthIdx] += (t.amount || 0);
      });
      return {
        label: year,
        data: yearData,
        backgroundColor: chartColors[idx % chartColors.length],
        borderColor: chartBorderColors[idx % chartBorderColors.length],
        borderWidth: 1,
        borderRadius: 4,
      };
    });

    monthlyIncomeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets,
      },
      options: applyChartDarkMode({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 16,
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
  } else if (comparePortfolios) {
    // Compare portfolios: one dataset per portfolio, x-axis = months
    const allTxs = appData.transactions.filter(t => t.type === 'dividend');
    const portfolios = appData.portfolios;

    const datasets = portfolios.map((portfolio, idx) => {
      const portfolioData = new Array(12).fill(0);
      const portfolioTxs = allTxs.filter(t => t.portfolioId === portfolio.id);
      (selectedYear ? portfolioTxs.filter(t => getYearFromDate(t.date) === selectedYear) : portfolioTxs)
        .forEach(t => {
          const monthIdx = parseInt(t.date.split('-')[1], 10) - 1;
          portfolioData[monthIdx] += (t.amount || 0);
        });
      return {
        label: portfolio.name,
        data: portfolioData,
        backgroundColor: chartColors[idx % chartColors.length],
        borderColor: chartBorderColors[idx % chartBorderColors.length],
        borderWidth: 1,
        borderRadius: 4,
      };
    });

    monthlyIncomeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets,
      },
      options: applyChartDarkMode({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 16,
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
  } else {
    // Normal mode: single dataset
    const monthlyData = getDividendsByMonth(portfolioId);
    let sortedMonths = Object.keys(monthlyData).sort();
    if (selectedYear) {
      sortedMonths = sortedMonths.filter(m => m.startsWith(selectedYear));
    }
    const labels = sortedMonths.map(m => {
      const [year, month] = m.split('-');
      return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    });
    const data = sortedMonths.map(m => monthlyData[m]);

    const datasets = [{
      label: 'Monthly Dividend Income',
      data,
      backgroundColor: 'rgba(37, 99, 235, 0.7)',
      borderColor: 'rgba(37, 99, 235, 1)',
      borderWidth: 1,
      borderRadius: 4,
      order: 2,
    }];

    if (trendLine) {
      const cumulative = [];
      data.reduce((sum, val) => {
        const next = sum + val;
        cumulative.push(next);
        return next;
      }, 0);
      datasets.push({
        label: 'Cumulative Trend',
        data: cumulative,
        type: 'line',
        borderColor: 'rgba(239, 68, 68, 1)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(239, 68, 68, 1)',
        order: 1,
      });
    }

    monthlyIncomeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets,
      },
      options: applyChartDarkMode({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: trendLine,
            position: 'bottom',
            labels: {
              usePointStyle: true,
              padding: 16,
            }
          },
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
}

function updateAnnualIncomeChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const selectedYear = getSelectedYear();
  const annualData = getDividendsByYear(portfolioId);
  let sortedYears = Object.keys(annualData).sort();
  if (selectedYear) {
    sortedYears = sortedYears.filter(y => y === selectedYear);
  }
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
  const selectedYear = getSelectedYear();
  const portfolios = appData.portfolios;
  const labels = portfolios.map(p => p.name);
  const data = portfolios.map(p => {
    if (!selectedYear) return getTotalDividends(p.id);
    const txs = getPortfolioTransactions(p.id).filter(t => t.type === 'dividend' && getYearFromDate(t.date) === selectedYear);
    return txs.reduce((sum, t) => sum + (t.amount || 0), 0);
  });
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

function updateSummaryCards() {
  const portfolioId = getSelectedPortfolioId();
  const selectedYear = getSelectedYear();
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');
  const filteredTxs = selectedYear ? txs.filter(t => getYearFromDate(t.date) === selectedYear) : txs;

  const total = filteredTxs.reduce((sum, t) => sum + (t.amount || 0), 0);
  const qualified = filteredTxs.filter(t => t.dividendType === 'qualified').reduce((sum, t) => sum + (t.amount || 0), 0);
  const ordinary = filteredTxs.filter(t => t.dividendType === 'ordinary').reduce((sum, t) => sum + (t.amount || 0), 0);
  const payments = filteredTxs.length;

  const totalEl = document.getElementById('summaryTotalDividends');
  const qualifiedEl = document.getElementById('summaryQualified');
  const ordinaryEl = document.getElementById('summaryOrdinary');
  const paymentsEl = document.getElementById('summaryPayments');

  if (totalEl) totalEl.textContent = formatCurrency(total);
  if (qualifiedEl) qualifiedEl.textContent = formatCurrency(qualified);
  if (ordinaryEl) ordinaryEl.textContent = formatCurrency(ordinary);
  if (paymentsEl) paymentsEl.textContent = payments;
}

function printReport() {
  // Show a toast to guide the user
  showToast('Preparing print view... Use "Save as PDF" in the print dialog', 'success');

  // Store original states to restore after print
  const originalTab = currentTab;
  const originalCompareYears = compareYears;
  const originalComparePortfolios = comparePortfolios;

  // Temporarily expand all tab content so print includes all charts
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('hidden'));

  // Pre-render all charts so every canvas has a Chart.js instance before printing
  const tabOrder = ['monthly', 'annual', 'portfolio', 'holdings'];
  tabOrder.forEach(tab => {
    if (tab === 'monthly') updateMonthlyIncomeChart();
    if (tab === 'annual') updateAnnualIncomeChart();
    if (tab === 'portfolio') updatePortfolioComparisonChart();
    if (tab === 'holdings') updateHoldingDividendChart();
  });

  // Update the page title for print
  const pageHeader = document.querySelector('.page-header h2');
  if (pageHeader) {
    pageHeader.dataset.originalText = pageHeader.textContent;
    const selectedYear = getSelectedYear();
    const selectedPortfolio = getSelectedPortfolioId();
    const portfolioName = selectedPortfolio ? (getPortfolio(selectedPortfolio)?.name || 'Selected Portfolio') : 'All Portfolios';
    const yearLabel = selectedYear || 'All Years';
    pageHeader.textContent = `Income Report — ${portfolioName} — ${yearLabel}`;
  }

  // After print, restore the original state
  const restore = () => {
    document.querySelectorAll('.tab-content').forEach(el => {
      if (!el.id || el.id !== `tab-${originalTab}`) {
        el.classList.add('hidden');
      }
    });
    if (pageHeader && pageHeader.dataset.originalText) {
      pageHeader.textContent = pageHeader.dataset.originalText;
    }
    compareYears = originalCompareYears;
    comparePortfolios = originalComparePortfolios;
    const yearsCheckbox = document.getElementById('compareYearsToggle');
    const portfoliosCheckbox = document.getElementById('comparePortfoliosToggle');
    if (yearsCheckbox) yearsCheckbox.checked = originalCompareYears;
    if (portfoliosCheckbox) portfoliosCheckbox.checked = originalComparePortfolios;
    // Re-render the active tab chart to restore its state
    refreshPageData();
  };

  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('print');
    const listener = (e) => {
      if (!e.matches) {
        restore();
        mediaQuery.removeEventListener('change', listener);
      }
    };
    mediaQuery.addEventListener('change', listener);
    // Fallback: also restore after a timeout in case the event doesn't fire
    setTimeout(restore, 5000);
  } else {
    setTimeout(restore, 5000);
  }

  window.print();
}

function downloadReportCSV() {
  const portfolioId = getSelectedPortfolioId();
  const selectedYear = getSelectedYear();

  let txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');
  if (selectedYear) {
    txs = txs.filter(t => getYearFromDate(t.date) === selectedYear);
  }
  // Sort by date ascending
  txs.sort((a, b) => a.date.localeCompare(b.date));

  const headers = ['Date', 'Portfolio', 'Symbol', 'Holding Name', 'Amount', 'Dividend Type', 'Notes'];
  const rows = txs.map(t => {
    const portfolio = getPortfolio(t.portfolioId);
    const holding = getHolding(t.holdingId);
    return [
      t.date,
      portfolio ? portfolio.name : '',
      holding ? holding.symbol : '',
      holding ? holding.name : '',
      t.amount || 0,
      t.dividendType || '',
      t.notes || ''
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(field => {
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const portfolioName = portfolioId ? (getPortfolio(portfolioId)?.name || 'portfolio') : 'all-portfolios';
  const yearLabel = selectedYear || 'all-years';
  a.download = `report-${portfolioName}-${yearLabel}-${getTodayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Report downloaded as CSV', 'success');
}

function updateHoldingDividendChart() {
  if (typeof Chart === 'undefined') return;
  const portfolioId = getSelectedPortfolioId();
  const selectedYear = getSelectedYear();
  const txs = portfolioId
    ? getPortfolioTransactions(portfolioId).filter(t => t.type === 'dividend')
    : appData.transactions.filter(t => t.type === 'dividend');
  const filteredTxs = selectedYear ? txs.filter(t => getYearFromDate(t.date) === selectedYear) : txs;
  const divByHolding = {};
  filteredTxs.forEach(t => {
    divByHolding[t.holdingId] = (divByHolding[t.holdingId] || 0) + (t.amount || 0);
  });
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
    populateYearSelector();
    refreshPageData();
  });
} else {
  populateYearSelector();
  refreshPageData();
}
