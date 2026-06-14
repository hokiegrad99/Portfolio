/**
 * Portfolio Tracker - Dividend Calendar Page Logic
 */

let calendarCurrentDate = new Date();

function refreshPageData() {
  updateCalendarSummary();
  renderCalendar();
  updateUpcomingPaymentsTable();
}

// ============================================
// Dividend Prediction Logic
// ============================================

function getDividendHistoryForHolding(holdingId) {
  return appData.transactions
    .filter(t => t.holdingId === holdingId && t.type === 'dividend')
    .sort((a, b) => a.date.localeCompare(b.date));
}

function predictDividendPattern(history) {
  if (history.length === 0) return null;
  if (history.length === 1) {
    // Single payment - assume annual (lowest confidence)
    return {
      frequency: 'annual (estimate)',
      intervalDays: 365,
      avgAmount: history[0].amount,
      lastDate: history[history.length - 1].date,
      dividendType: history[history.length - 1].dividendType,
      confidence: 1
    };
  }

  // Calculate intervals between consecutive payments
  const intervals = [];
  for (let i = 1; i < history.length; i++) {
    const d1 = new Date(history[i - 1].date + 'T00:00:00');
    const d2 = new Date(history[i].date + 'T00:00:00');
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    intervals.push(diff);
  }

  const avgInterval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);

  // Determine frequency label with tighter ranges
  let frequency = 'irregular';
  if (avgInterval >= 25 && avgInterval <= 35) frequency = 'monthly';
  else if (avgInterval >= 80 && avgInterval <= 100) frequency = 'quarterly';
  else if (avgInterval >= 160 && avgInterval <= 200) frequency = 'semi-annual';
  else if (avgInterval >= 350 && avgInterval <= 380) frequency = 'annual';

  // Average amount from last 4 payments (or all if fewer)
  const recentPayments = history.slice(-4);
  const avgAmount = recentPayments.reduce((sum, t) => sum + (t.amount || 0), 0) / recentPayments.length;

  return {
    frequency,
    intervalDays: avgInterval,
    avgAmount,
    lastDate: history[history.length - 1].date,
    dividendType: history[history.length - 1].dividendType,
    confidence: history.length
  };
}

function predictUpcomingDividends(holdingId, monthsAhead = 12) {
  const history = getDividendHistoryForHolding(holdingId);
  const pattern = predictDividendPattern(history);
  if (!pattern) return [];

  const holding = getHolding(holdingId);
  if (!holding || holding.shares <= 0) return [];

  const predictions = [];
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth() + monthsAhead, today.getDate());

  // Start from last known payment date
  let nextDate = new Date(pattern.lastDate + 'T00:00:00');

  // Sanity check: prevent infinite loop if interval is 0 or negative
  if (!pattern.intervalDays || pattern.intervalDays <= 0) return predictions;

  // Advance to the first future date
  while (nextDate <= today) {
    nextDate = new Date(nextDate.getTime() + pattern.intervalDays * 24 * 60 * 60 * 1000);
  }

  // Generate all future payments within the window
  while (nextDate <= cutoff) {
    predictions.push({
      date: nextDate.toISOString().split('T')[0],
      holdingId,
      symbol: holding.symbol,
      name: holding.name,
      portfolioId: holding.portfolioId,
      expectedAmount: pattern.avgAmount,
      dividendType: pattern.dividendType,
      frequency: pattern.frequency,
      confidence: pattern.confidence
    });
    nextDate = new Date(nextDate.getTime() + pattern.intervalDays * 24 * 60 * 60 * 1000);
  }

  return predictions;
}

function getAllUpcomingDividends(portfolioId, monthsAhead = 12) {
  const holdings = portfolioId ? getPortfolioHoldings(portfolioId) : [...appData.holdings];
  let allPredictions = [];
  holdings.forEach(h => {
    const predictions = predictUpcomingDividends(h.id, monthsAhead);
    allPredictions = allPredictions.concat(predictions);
  });
  allPredictions.sort((a, b) => a.date.localeCompare(b.date));
  return allPredictions;
}

// ============================================
// Calendar Summary
// ============================================

function updateCalendarSummary() {
  const portfolioId = getSelectedPortfolioId();
  const today = new Date();
  const cutoff3 = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
  const cutoff6 = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());

  // Calculate once for 12 months and filter for shorter periods
  const next12 = getAllUpcomingDividends(portfolioId, 12);
  const next3 = next12.filter(p => new Date(p.date + 'T00:00:00') <= cutoff3);
  const next6 = next12.filter(p => new Date(p.date + 'T00:00:00') <= cutoff6);

  const total3 = next3.reduce((sum, p) => sum + (p.expectedAmount || 0), 0);
  const total6 = next6.reduce((sum, p) => sum + (p.expectedAmount || 0), 0);
  const total12 = next12.reduce((sum, p) => sum + (p.expectedAmount || 0), 0);

  document.getElementById('calendarNext3Months').textContent = formatCurrency(total3);
  document.getElementById('calendarNext6Months').textContent = formatCurrency(total6);
  document.getElementById('calendarNext12Months').textContent = formatCurrency(total12);
  document.getElementById('calendarUpcomingCount').textContent = next12.length;
}

// ============================================
// Calendar Grid Rendering
// ============================================

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();

  document.getElementById('calendarMonthTitle').textContent =
    calendarCurrentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  const portfolioId = getSelectedPortfolioId();
  const upcoming = getAllUpcomingDividends(portfolioId, 12);
  const monthEvents = upcoming.filter(p => {
    const d = new Date(p.date + 'T00:00:00');
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = lastDay.getDate();

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let html = '<div class="calendar-header">';
  dayNames.forEach(d => {
    html += `<div class="calendar-day-name">${d}</div>`;
  });
  html += '</div><div class="calendar-days">';

  // Empty cells before the first day
  for (let i = 0; i < startOffset; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const events = monthEvents.filter(e => e.date === dateStr);

    let dayClass = 'calendar-day';
    if (isToday) dayClass += ' today';
    if (events.length > 0) dayClass += ' has-events';

    html += `<div class="${dayClass}">
      <div class="calendar-day-number">${day}</div>`;

    if (events.length > 0) {
      html += '<div class="calendar-events">';
      events.forEach(e => {
        const typeClass = e.dividendType === 'qualified' ? 'qualified' : 'ordinary';
        html += `<div class="calendar-event ${typeClass}" title="${e.name || e.symbol}: ${formatCurrency(e.expectedAmount)}">
          <span class="calendar-event-symbol">${e.symbol}</span>
          <span class="calendar-event-amount">${formatCurrency(e.expectedAmount)}</span>
        </div>`;
      });
      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';
  grid.innerHTML = html;
}

function changeCalendarMonth(delta) {
  calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
  renderCalendar();
}

// ============================================
// Upcoming Payments Table
// ============================================

function updateUpcomingPaymentsTable() {
  const portfolioId = getSelectedPortfolioId();
  const upcoming = getAllUpcomingDividends(portfolioId, 12);

  const tbody = document.getElementById('upcomingPaymentsTable');
  if (!tbody) return;

  if (upcoming.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No dividend history to predict upcoming payments</td></tr>`;
    return;
  }

  tbody.innerHTML = upcoming.map(p => {
    const portfolio = getPortfolio(p.portfolioId);
    const typeLabel = p.dividendType === 'qualified'
      ? '<span class="dividend-type qualified">Qualified</span>'
      : '<span class="dividend-type ordinary">Ordinary</span>';
    const confidenceLabel = p.confidence < 3 ? '<span title="Based on limited history" style="cursor:help; color:var(--warning);">⚠</span>' : '';

    return `
      <tr>
        <td>${formatDate(p.date)}</td>
        <td class="font-mono" style="font-weight:600;">${p.symbol} ${confidenceLabel}</td>
        <td>${portfolio ? portfolio.name : 'Unknown'}</td>
        <td class="text-right" style="font-weight:600;">${formatCurrency(p.expectedAmount)}</td>
        <td>${typeLabel}</td>
        <td><span class="badge badge-gray">${p.frequency}</span></td>
      </tr>
    `;
  }).join('');
}

window.refreshPageData = refreshPageData;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refreshPageData);
} else {
  refreshPageData();
}
