"use strict";
const TRANSACTIONS_API = "../../api/finance/transactions.php";
const EXPENSES_API = "../../api/finance/expenses.php";
const PATIENTS_KEY = "dentanueva_patients";
const PATIENT_API = "../../api/patient_records.php";
const APPOINTMENTS_API = "../../api/appointments.php?scope=doctor_appointments";
let transactions = [];
let patients = [];
let revenueMode = "today";
let expenseReport = null;
let auditEvents = [];
let expensesModalReport = null;
let currentDetailsTransaction = null;
const TRANSACTION_PAGE_SIZE = 10;
let transactionCurrentPage = 1;
const EXPENSE_COLORS = {
  utilities: "#2F80ED",
  maintenance: "#A855F7",
  rent_facilities: "#F59E0B",
  other: "#8A9690",
};
document.addEventListener("DOMContentLoaded", async () => {
  await loadPatients();
  setupEvents();
  await Promise.all([
    loadTransactions(),
    loadExpenseReport(),
    loadAuditTrail(),
  ]);
  renderFinance();
  openTreatmentChargeFromQuery();
});
function setupEvents() {
  setupPatientSelector();
  document
    .getElementById("procedureChartFilter")
    ?.addEventListener("change", renderProcedureChart);
  document
    .getElementById("transactionSearch")
    ?.addEventListener("input", () => {
      transactionCurrentPage = 1;
      renderTransactions();
    });
  document
    .getElementById("paymentMethodFilter")
    ?.addEventListener("change", () => {
      transactionCurrentPage = 1;
      renderTransactions();
    });
  document
    .getElementById("transactionDateFilter")
    ?.addEventListener("change", () => {
      transactionCurrentPage = 1;
      renderTransactions();
    });
  document
    .getElementById("transactionPrevPageBtn")
    ?.addEventListener("click", () => {
      if (transactionCurrentPage > 1) {
        transactionCurrentPage--;
        renderTransactions();
      }
    });
  document
    .getElementById("transactionNextPageBtn")
    ?.addEventListener("click", () => {
      const filteredTransactions = getFilteredTransactions();
      const totalPages = Math.max(
        Math.ceil(filteredTransactions.length / TRANSACTION_PAGE_SIZE),
        1,
      );
      if (transactionCurrentPage < totalPages) {
        transactionCurrentPage++;
        renderTransactions();
      }
    });
  document
    .getElementById("revenueSwitch")
    ?.addEventListener("click", toggleRevenueMode);
  document
    .getElementById("monthlyExpensesButton")
    ?.addEventListener("click", openExpensesModal);
  document
    .getElementById("closeExpensesBtn")
    ?.addEventListener("click", closeExpensesModal);
  document
    .getElementById("expensesCloseButton")
    ?.addEventListener("click", closeExpensesModal);
  document
    .getElementById("expensesModal")
    ?.addEventListener("click", (event) => {
      if (event.target === document.getElementById("expensesModal")) {
        closeExpensesModal();
      }
    });
  document
    .getElementById("viewAllAuditButton")
    ?.addEventListener("click", openAuditModal);
  document
    .getElementById("closeAuditBtn")
    ?.addEventListener("click", closeAuditModal);
  document
    .getElementById("auditCloseButton")
    ?.addEventListener("click", closeAuditModal);
  document.getElementById("auditModal")?.addEventListener("click", (event) => {
    if (event.target === document.getElementById("auditModal")) {
      closeAuditModal();
    }
  });
  document
    .getElementById("expensesMonthSelect")
    ?.addEventListener("change", (event) => {
      loadExpensesModal(event.target.value);
    });
  document
    .getElementById("addExpenseButton")
    ?.addEventListener("click", addManualExpense);
  document
    .getElementById("recordPaymentButton")
    ?.addEventListener("click", openPaymentModal);
  document
    .getElementById("closePaymentModal")
    ?.addEventListener("click", closePaymentModal);
  document
    .getElementById("cancelPaymentButton")
    ?.addEventListener("click", closePaymentModal);
  document
    .getElementById("savePaymentButton")
    ?.addEventListener("click", savePayment);
  document
    .getElementById("paymentModal")
    ?.addEventListener("click", (event) => {
      if (event.target === document.getElementById("paymentModal")) {
        closePaymentModal();
      }
    });
  document
    .getElementById("closeDetailsBtn")
    ?.addEventListener("click", closeDetailsModal);
  document
    .getElementById("detailsCloseButton")
    ?.addEventListener("click", closeDetailsModal);
  document
    .getElementById("printReceiptBtn")
    ?.addEventListener("click", printReceipt);
  document
    .getElementById("detailsModal")
    ?.addEventListener("click", (event) => {
      if (event.target === document.getElementById("detailsModal")) {
        closeDetailsModal();
      }
    });
  window.addEventListener("resize", renderRevenueExpenseChart);
}
async function loadTransactions() {
  try {
    const response = await fetch(TRANSACTIONS_API, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load finance transactions.");
    }
    const doctorPatientIds = new Set(
      patients.map((patient) => getPatientId(patient)).filter(Boolean),
    );
    transactions = (Array.isArray(result.data) ? result.data : [])
      .map(normalizeDatabaseTransaction)
      .filter((transaction) =>
        doctorPatientIds.has(String(transaction.patientId || "").trim()),
      );
    renderFinance();
  } catch (error) {
    console.error("Unable to load finance transactions:", error);
    transactions = [];
    renderFinance();
  }
}
function normalizePaymentMethod(method) {
  const value = String(method || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (value === "cash") {
    return "Cash";
  }
  if (value === "gcash") {
    return "GCash";
  }
  if (value === "bank_transfer" || value === "bank transfer") {
    return "Bank Transfer";
  }
  return "";
}
function normalizeDatabaseTransaction(item) {
  const total = Number(item.total_amount) || 0;
  const discount = Number(item.discount_amount) || 0;
  const paid = Math.max(Number(item.paid_amount) || 0, 0);
  const databaseBalance = Number(item.balance_amount);
  const finalBalance = Number.isFinite(databaseBalance)
    ? Math.max(databaseBalance, 0)
    : Math.max(total - discount - paid, 0);
  const patientName =
    String(item.patient_name || "").trim() ||
    String(item.patient_id || "Unknown Patient");
  const paymentHistory = Array.isArray(item.paymentHistory)
    ? item.paymentHistory.map((payment) => ({
        id: payment.payment_uid || payment.payment_id || "",
        paymentId: Number(payment.payment_id) || 0,
        paymentUid: payment.payment_uid || "",
        transactionId: Number(payment.transaction_id) || 0,
        patientId: payment.patient_id || item.patient_id || "",
        amount: Number(payment.amount) || 0,
        paymentMethod: normalizePaymentMethod(
          payment.payment_method || payment.paymentMethod,
        ),
        paymentSource: String(payment.payment_source || "")
          .trim()
          .toLowerCase(),
        status: String(payment.status || "")
          .trim()
          .toLowerCase(),
        paidAt: payment.paid_at || payment.created_at || "",
        createdAt: payment.created_at || "",
        date: payment.paid_at
          ? String(payment.paid_at).slice(0, 10)
          : payment.created_at
            ? String(payment.created_at).slice(0, 10)
            : item.created_at
              ? String(item.created_at).slice(0, 10)
              : getTodayKey(),
        time: payment.paid_at
          ? String(payment.paid_at).slice(11, 16)
          : payment.created_at
            ? String(payment.created_at).slice(11, 16)
            : "",
      }))
    : [];
  const paidPayments = paymentHistory.filter(
    (payment) => payment.status === "paid" && payment.amount > 0,
  );
  const methods = [
    ...new Set(
      paidPayments.map((payment) => payment.paymentMethod).filter(Boolean),
    ),
  ];
  return {
    id: item.transaction_uid || String(item.transaction_id || ""),
    transactionId: Number(item.transaction_id) || 0,
    transactionUid: item.transaction_uid || "",
    invoice: item.transaction_uid || String(item.transaction_id || ""),
    patientId: item.patient_id || "",
    patient: patientName,
    patientName,
    service: item.service_name || "Consultation",
    date: item.created_at
      ? String(item.created_at).slice(0, 10)
      : getTodayKey(),
    time: item.created_at ? String(item.created_at).slice(11, 16) : "00:00",
    total,
    discount,
    paid,
    balance: finalBalance,
    method: methods[0] || "",
    paymentMethod: methods.join(" + "),
    status:
      item.status === "paid"
        ? "Paid"
        : item.status === "partial"
          ? "Partial"
          : "Unpaid",
    paymentHistory,
    createdAt: item.created_at || "",
    updatedAt: item.updated_at || "",
  };
}
async function loadPatients() {
  try {
    const response = await fetch(PATIENT_API, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load patients.");
    }
    const records = Array.isArray(result.data)
      ? result.data
      : Array.isArray(result.records)
        ? result.records
        : [];
    patients = records;
  } catch (error) {
    console.error("Unable to load DentaNueva patients:", error);
    try {
      const stored = localStorage.getItem(PATIENTS_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      patients = Array.isArray(parsed) ? parsed : [];
    } catch (storageError) {
      patients = [];
    }
  }
  await loadDoctorPatients();
}
async function loadDoctorPatients() {
  try {
    const response = await fetch(APPOINTMENTS_API, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load doctor patients.");
    }
    const appointments = Array.isArray(result.data) ? result.data : [];
    const doctorPatientIds = new Set(
      appointments
        .map((appointment) =>
          String(
            appointment.patientId ||
              appointment.patient_id ||
              appointment.patient ||
              "",
          ).trim(),
        )
        .filter(Boolean),
    );
    patients = patients.filter((patient) =>
      doctorPatientIds.has(getPatientId(patient)),
    );
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
  } catch (error) {
    console.error("Unable to load doctor patients:", error);
    patients = [];
  }
  setupPatientSelector();
}
function getPatientFullName(patient) {
  if (!patient) {
    return "";
  }
  return (
    [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim() ||
    String(patient.fullName || patient.name || "").trim()
  );
}
function getPatientId(patient) {
  return String(
    patient?.patientId || patient?.patient_id || patient?.id || "",
  ).trim();
}
function findPatientById(patientId) {
  if (!patientId) {
    return null;
  }
  return (
    patients.find(
      (patient) => getPatientId(patient) === String(patientId).trim(),
    ) || null
  );
}
function findPatientByName(name) {
  if (!name) {
    return null;
  }
  const target = String(name).trim().toLowerCase();
  return (
    patients.find(
      (patient) => getPatientFullName(patient).toLowerCase() === target,
    ) || null
  );
}
function findPatientByNameOrId(value) {
  return findPatientById(value) || findPatientByName(value);
}
function setupPatientSelector() {
  const patientInput = document.getElementById("paymentPatient");
  const datalist = document.getElementById("paymentPatientList");
  if (!patientInput || !datalist) {
    return;
  }
  datalist.innerHTML = "";
  patients
    .slice()
    .sort((a, b) => getPatientFullName(a).localeCompare(getPatientFullName(b)))
    .forEach((patient) => {
      const option = document.createElement("option");
      const name = getPatientFullName(patient);
      const patientId = getPatientId(patient);
      option.value = name;
      option.label = `${name} · ${patientId}`;
      datalist.appendChild(option);
    });
  patientInput.setAttribute("list", "paymentPatientList");
  patientInput.oninput = syncPaymentPatientId;
  patientInput.onchange = syncPaymentPatientId;
}
function syncPaymentPatientId() {
  const patientInput = document.getElementById("paymentPatient");
  const patientIdInput = document.getElementById("paymentPatientId");
  if (!patientInput || !patientIdInput) {
    return;
  }
  const patient = findPatientByNameOrId(patientInput.value);
  patientIdInput.value = patient ? getPatientId(patient) : "";
  if (patient) {
    patientInput.value = getPatientFullName(patient);
  }
}
function getPaymentPatient() {
  const patientInput = document.getElementById("paymentPatient");
  const patientIdInput = document.getElementById("paymentPatientId");
  const patient =
    findPatientById(patientIdInput?.value) ||
    findPatientByNameOrId(patientInput?.value);
  if (!patient) {
    return null;
  }
  if (patientIdInput) {
    patientIdInput.value = getPatientId(patient);
  }
  if (patientInput) {
    patientInput.value = getPatientFullName(patient);
  }
  return patient;
}
function renderFinance() {
  renderRevenueCard();
  renderSummaryCards();
  renderTransactions();
  renderProcedureChart();
  renderRevenueExpenseChart();
  renderExpenseChart();
  renderAuditTrail();
}
function toggleRevenueMode() {
  revenueMode = revenueMode === "today" ? "month" : "today";
  renderRevenueCard();
}
function renderRevenueCard() {
  const title = document.getElementById("revenueCardTitle");
  const amount = document.getElementById("revenueAmount");
  const subtitle = document.getElementById("revenueSubtitle");
  const switchText = document.getElementById("revenueSwitchText");
  const todayRevenue = getTodayRevenue();
  const monthRevenue = getMonthlyRevenue();
  if (title) {
    title.textContent =
      revenueMode === "today" ? "Today's Revenue" : "Monthly Revenue";
  }
  if (amount) {
    amount.textContent = formatMoney(
      revenueMode === "today" ? todayRevenue : monthRevenue,
    );
  }
  if (subtitle) {
    subtitle.textContent =
      revenueMode === "today" ? "Today's collection" : getCurrentMonthLabel();
  }
  if (switchText) {
    switchText.textContent = revenueMode === "today" ? "Today" : "This Month";
  }
  const monthlyRevenue = document.getElementById("monthlyRevenueAmount");
  if (monthlyRevenue) {
    monthlyRevenue.textContent = formatMoney(
      monthRevenue - getMonthlyExpenses(),
    );
  }
}
function renderSummaryCards() {
  const outstanding = transactions.reduce(
    (sum, transaction) => sum + getBalance(transaction),
    0,
  );
  const outstandingElement = document.getElementById("outstandingBalance");
  if (outstandingElement) {
    outstandingElement.textContent = formatMoney(outstanding);
  }
  const count = transactions.filter(
    (transaction) => getBalance(transaction) > 0,
  ).length;
  const subtitle = document.getElementById("outstandingSubtitle");
  if (subtitle) {
    subtitle.textContent = `${count} active balance${count === 1 ? "" : "s"}`;
  }
  const expenses = getMonthlyExpenses();
  const expensesElement = document.getElementById("monthlyExpenses");
  if (expensesElement) {
    expensesElement.textContent = formatMoney(expenses);
  }
  renderExpenseChange();
}
function getFilteredTransactions() {
  const search = (document.getElementById("transactionSearch")?.value || "")
    .trim()
    .toLowerCase();
  const selectedMethod = normalizePaymentMethod(
    document.getElementById("paymentMethodFilter")?.value || "",
  );
  const dateFilter =
    document.getElementById("transactionDateFilter")?.value || "all";
  const doctorPatientIds = new Set(
    patients.map((patient) => getPatientId(patient)).filter(Boolean),
  );
  return transactions
    .filter((transaction) => {
      return doctorPatientIds.has(String(transaction.patientId || "").trim());
    })
    .filter((transaction) => {
      if (!search) {
        return true;
      }
      return (
        transaction.patient.toLowerCase().includes(search) ||
        transaction.invoice.toLowerCase().includes(search) ||
        transaction.service.toLowerCase().includes(search)
      );
    })
    .filter((transaction) => {
      if (!selectedMethod) {
        return true;
      }
      return getPaymentHistory(transaction).some(
        (payment) => payment.paymentMethod === selectedMethod,
      );
    })
    .filter((transaction) => {
      if (dateFilter === "all") {
        return true;
      }
      if (dateFilter === "today") {
        return transaction.date === getTodayKey();
      }
      const date = new Date(
        `${transaction.date}T${transaction.time || "00:00"}`,
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateFilter === "month") {
        return (
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth()
        );
      }
      if (dateFilter === "week") {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        return date >= sevenDaysAgo;
      }
      return true;
    })
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function renderTransactions() {
  const body = document.getElementById("transactionsTableBody");
  if (!body) {
    return;
  }
  body.innerHTML = "";
  const filtered = getFilteredTransactions();
  const count = document.getElementById("transactionCount");
  if (count) {
    count.textContent = `${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`;
  }
  const totalTransactions = filtered.length;
  const totalPages = Math.max(
    Math.ceil(totalTransactions / TRANSACTION_PAGE_SIZE),
    1,
  );
  if (transactionCurrentPage > totalPages) {
    transactionCurrentPage = totalPages;
  }
  if (transactionCurrentPage < 1) {
    transactionCurrentPage = 1;
  }
  const startIndex = (transactionCurrentPage - 1) * TRANSACTION_PAGE_SIZE;
  const pageTransactions = filtered.slice(
    startIndex,
    startIndex + TRANSACTION_PAGE_SIZE,
  );
  renderTransactionPagination(totalTransactions, totalPages);
  if (!filtered.length) {
    body.innerHTML =
      '<tr><td colspan="9" class="empty-table">No transactions found.</td></tr>';
    return;
  }
  pageTransactions.forEach((transaction) => {
    const row = document.createElement("tr");
    const status = getPaymentStatus(transaction);
    row.innerHTML = `<td><div class="patient-cell"><div class="patient-avatar">${getInitials(transaction.patient)}</div><div><span class="patient-name">${escapeHtml(transaction.patient)}</span><span class="invoice-number">${escapeHtml(transaction.id)}</span></div></div></td><td>${escapeHtml(transaction.service)}</td><td><span class="date-main">${formatShortDate(transaction.date)}</span><span class="date-time">${formatTime(transaction.time)}</span></td><td class="money">${formatMoney(transaction.total)}</td><td class="discount-money">${formatMoney(transaction.discount)}</td><td class="money">${formatMoney(transaction.paid)}</td><td class="balance-money">${formatMoney(getBalance(transaction))}</td><td><span class="status-badge ${getStatusClass(status)}">${status}</span></td><td><div class="action-buttons"><button type="button" class="table-action" title="View" onclick="viewTransaction('${escapeJs(transaction.id)}')"><i class="fa-regular fa-eye"></i></button></div></td>`;
    body.appendChild(row);
  });
}
function renderTransactionPagination(totalTransactions, totalPages) {
  const pagination = document.getElementById("transactionPagination");
  const summary = document.getElementById("transactionPaginationSummary");
  const pageInfo = document.getElementById("transactionPaginationPageInfo");
  const prevButton = document.getElementById("transactionPrevPageBtn");
  const nextButton = document.getElementById("transactionNextPageBtn");
  if (!pagination || !summary || !pageInfo || !prevButton || !nextButton) {
    return;
  }
  if (totalTransactions <= TRANSACTION_PAGE_SIZE) {
    pagination.style.display = "none";
    prevButton.disabled = true;
    nextButton.disabled = true;
    return;
  }
  pagination.style.display = "flex";
  const startItem = (transactionCurrentPage - 1) * TRANSACTION_PAGE_SIZE + 1;
  const endItem = Math.min(
    transactionCurrentPage * TRANSACTION_PAGE_SIZE,
    totalTransactions,
  );
  summary.textContent = `Showing ${startItem}–${endItem} of ${totalTransactions} transactions`;
  pageInfo.textContent = `Page ${transactionCurrentPage} of ${totalPages}`;
  prevButton.disabled = transactionCurrentPage <= 1;
  nextButton.disabled = transactionCurrentPage >= totalPages;
}
function renderProcedureChart() {
  const container = document.getElementById("procedureChart");
  const filter = document.getElementById("procedureChartFilter");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  const revenueByProcedure = new Map();
  transactions.forEach((transaction) => {
    const service = String(transaction.service || "Other").trim() || "Other";
    const revenue = Math.max(Number(transaction.paid) || 0, 0);
    revenueByProcedure.set(
      service,
      (revenueByProcedure.get(service) || 0) + revenue,
    );
  });
  let data = Array.from(revenueByProcedure.entries())
    .map(([name, amount]) => ({ name, amount }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (!data.length) {
    container.innerHTML =
      '<div class="procedure-chart-empty">No procedure revenue data available.</div>';
    return;
  }
  const totalRevenue = data.reduce((sum, item) => sum + item.amount, 0);
  const selectedLimit = filter?.value || "10";
  if (selectedLimit !== "all") {
    data = data.slice(0, Number(selectedLimit));
  }
  const max = Math.max(...data.map((item) => item.amount), 1);
  data.forEach((item) => {
    const row = document.createElement("div");
    row.className = "procedure-row";
    const percentage = (item.amount / max) * 100;
    const share = totalRevenue > 0 ? (item.amount / totalRevenue) * 100 : 0;
    row.innerHTML = `
      <span class="procedure-name" title="${escapeHtml(item.name)}">${escapeHtml(shortenService(item.name))}</span>
      <div class="procedure-bar-bg">
        <div class="procedure-bar" style="width:${Math.max(percentage, 1.5)}%"></div>
      </div>
      <span class="procedure-value">${formatMoney(item.amount)}</span>
      <div class="procedure-tooltip">
        <strong>${escapeHtml(item.name)}</strong>
        <span>Revenue · ${share.toFixed(1)}% share</span>
        <b>${formatMoney(item.amount)}</b>
      </div>
    `;
    container.appendChild(row);
  });
}
function renderRevenueExpenseChart() {
  const svg = document.getElementById("revenueExpenseChart");
  const wrapper = svg?.closest(".line-chart-wrapper");
  if (!svg || !wrapper) {
    return;
  }
  svg.innerHTML = "";
  wrapper.querySelector(".revenue-expense-tooltip")?.remove();
  const months = Array.from({ length: 12 }, (_, index) =>
    new Date(new Date().getFullYear(), index, 1).toLocaleDateString("en-US", {
      month: "short",
    }),
  );
  const revenue = months.map((_, index) => getRevenueForMonth(index));
  const expenses = months.map((_, index) =>
    Number(expenseReport?.yearly?.[index] || 0),
  );
  const allValues = [...revenue, ...expenses];
  const maxValue = Math.max(...allValues, 1000);
  const width = Math.max(svg.clientWidth || 640, 320);
  const height = Math.max(svg.clientHeight || 230, 180);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const left = 56;
  const right = 24;
  const top = 16;
  const bottom = 34;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const xStep = chartWidth / (months.length - 1);
  const svgNamespace = "http://www.w3.org/2000/svg";
  function yPosition(value) {
    return top + chartHeight - (value / maxValue) * chartHeight;
  }
  for (let i = 0; i <= 5; i++) {
    const y = top + (chartHeight / 5) * i;
    const line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", left);
    line.setAttribute("x2", width - right);
    line.setAttribute("y1", y);
    line.setAttribute("y2", y);
    line.setAttribute("class", "chart-grid-line");
    svg.appendChild(line);
    const label = document.createElementNS(svgNamespace, "text");
    label.setAttribute("x", left - 10);
    label.setAttribute("y", y + 3);
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "chart-axis-label");
    label.textContent = formatCompactMoney(maxValue - (maxValue / 5) * i);
    svg.appendChild(label);
  }
  months.forEach((month, index) => {
    const x = left + xStep * index;
    const label = document.createElementNS(svgNamespace, "text");
    label.setAttribute("x", x);
    label.setAttribute("y", height - 10);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "chart-axis-label");
    label.textContent = month;
    svg.appendChild(label);
  });
  function makePoints(data) {
    return data.map((value, index) => ({
      x: left + xStep * index,
      y: yPosition(value),
    }));
  }
  function makePath(points) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  }
  function makeAreaPath(points) {
    const baseline = top + chartHeight;
    return `${makePath(points)} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
  }
  const revenuePoints = makePoints(revenue);
  const expensePoints = makePoints(expenses);
  const expenseArea = document.createElementNS(svgNamespace, "path");
  expenseArea.setAttribute("d", makeAreaPath(expensePoints));
  expenseArea.setAttribute("class", "expense-area");
  svg.appendChild(expenseArea);
  const revenueArea = document.createElementNS(svgNamespace, "path");
  revenueArea.setAttribute("d", makeAreaPath(revenuePoints));
  revenueArea.setAttribute("class", "revenue-area");
  svg.appendChild(revenueArea);
  const revenuePath = document.createElementNS(svgNamespace, "path");
  revenuePath.setAttribute("d", makePath(revenuePoints));
  revenuePath.setAttribute("class", "revenue-line");
  svg.appendChild(revenuePath);
  const expensePath = document.createElementNS(svgNamespace, "path");
  expensePath.setAttribute("d", makePath(expensePoints));
  expensePath.setAttribute("class", "expense-line");
  svg.appendChild(expensePath);
  const tooltip = document.createElement("div");
  tooltip.className = "revenue-expense-tooltip";
  wrapper.appendChild(tooltip);
  function showTooltip(point, month, type, value, seriesClass) {
    const pointRect = point.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    tooltip.innerHTML = `<span class="revenue-expense-tooltip-month">${escapeHtml(month)}</span><span class="revenue-expense-tooltip-type"><span class="revenue-expense-tooltip-dot ${seriesClass}"></span>${escapeHtml(type)}</span><span class="revenue-expense-tooltip-value">${escapeHtml(formatMoney(value))}</span>`;
    tooltip.classList.add("show");
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    let left =
      pointRect.left -
      wrapperRect.left +
      pointRect.width / 2 -
      tooltipWidth / 2;
    let top = pointRect.top - wrapperRect.top - tooltipHeight - 9;
    const minLeft = 4;
    const maxLeft = wrapperRect.width - tooltipWidth - 4;
    left = Math.max(minLeft, Math.min(left, maxLeft));
    if (top < 4) {
      top = pointRect.bottom - wrapperRect.top + 9;
    }
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  function hideTooltip() {
    tooltip.classList.remove("show");
  }
  revenuePoints.forEach((point, index) => {
    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", 4);
    circle.setAttribute("class", "revenue-point");
    circle.addEventListener("mouseenter", () => {
      showTooltip(circle, months[index], "Revenue", revenue[index], "revenue");
    });
    circle.addEventListener("mouseleave", hideTooltip);
    svg.appendChild(circle);
  });
  expensePoints.forEach((point, index) => {
    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", 4);
    circle.setAttribute("class", "expense-point");
    circle.addEventListener("mouseenter", () => {
      showTooltip(
        circle,
        months[index],
        "Expenses",
        expenses[index],
        "expense",
      );
    });
    circle.addEventListener("mouseleave", hideTooltip);
    svg.appendChild(circle);
  });
}
function renderExpenseChart() {
  const list = document.getElementById("expenseCategoryList");
  const pie = document.getElementById("expensePieChart");
  if (!list || !pie) {
    return;
  }
  list.innerHTML = "";
  pie.innerHTML = "";
  const categories = Array.isArray(expenseReport?.categories)
    ? expenseReport.categories
    : [];
  const total = categories.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  let currentPercent = 0;
  const gradients = [];
  categories.forEach((item) => {
    const amount = Number(item.amount || 0);
    const percentage = total > 0 ? (amount / total) * 100 : 0;
    const color = EXPENSE_COLORS[item.key] || EXPENSE_COLORS.other;
    if (amount > 0) {
      const end = currentPercent + percentage;
      gradients.push(`${color} ${currentPercent}% ${end}%`);
      currentPercent = end;
    }
    const itemElement = document.createElement("div");
    itemElement.className = "expense-category";
    itemElement.innerHTML = `<span class="expense-color" style="background:${color}"></span><span class="expense-category-label">${escapeHtml(item.label)}</span><span class="expense-category-amount">${formatMoney(amount)}</span><span class="expense-category-percent">${percentage.toFixed(1)}%</span>`;
    list.appendChild(itemElement);
  });
  if (!categories.length || total <= 0) {
    pie.style.background = "#edf1ef";
    pie.innerHTML =
      '<div class="expense-pie-empty">No expenses<br />this month</div>';
    return;
  }
  pie.style.background = `conic-gradient(${gradients.join(",")})`;
  pie.innerHTML = `<div class="expense-pie-center"><span>Total</span><strong>${formatMoney(total)}</strong></div>`;
}
function getAuditItemHtml(event) {
  const icons = {
    payment: "fa-peso-sign",
    charge: "fa-file-invoice-dollar",
    expense: "fa-receipt",
  };
  const stamp = String(event.timestamp || "");
  const when = `${formatShortDate(stamp.slice(0, 10))} · ${formatTime(stamp.slice(11, 16))}`;
  const sign = event.type === "expense" ? "-" : "";
  const amountClass = sign
    ? "amount-out"
    : event.type === "payment"
      ? "amount-in"
      : "";
  return `<div class="audit-item"><div class="audit-item-icon ${escapeHtml(event.type)}"><i class="fa-solid ${icons[event.type] || "fa-circle-info"}"></i></div><div class="audit-item-body"><strong>${escapeHtml(event.title)}</strong><span title="${escapeHtml(event.detail)}">${escapeHtml(event.detail)}</span><span>${escapeHtml(event.reference || "")} · by ${escapeHtml(event.actor || "System")}</span></div><div class="audit-item-meta"><strong class="${amountClass}">${sign}${formatMoney(event.amount)}</strong><span>${escapeHtml(when)}</span></div></div>`;
}
function renderAuditTrail() {
  const container = document.getElementById("auditTrail");
  const viewAllButton = document.getElementById("viewAllAuditButton");
  if (!container) {
    return;
  }
  if (!auditEvents.length) {
    container.innerHTML =
      '<div class="audit-content">No financial activity recorded yet.</div>';
    if (viewAllButton) {
      viewAllButton.style.display = "none";
    }
    return;
  }
  if (viewAllButton) {
    viewAllButton.style.display = "";
  }
  container.innerHTML = `<div class="audit-list">${auditEvents.slice(0, 3).map(getAuditItemHtml).join("")}</div>`;
  renderAuditModalList();
}
function renderAuditModalList() {
  const list = document.getElementById("auditModalList");
  if (!list) {
    return;
  }
  list.innerHTML = auditEvents.length
    ? `<div class="audit-list">${auditEvents.map(getAuditItemHtml).join("")}</div>`
    : '<div class="audit-content">No financial activity recorded yet.</div>';
}
function openAuditModal() {
  renderAuditModalList();
  document.getElementById("auditModal")?.classList.add("show");
}
function closeAuditModal() {
  document.getElementById("auditModal")?.classList.remove("show");
}
async function loadAuditTrail() {
  try {
    const response = await fetch(`${EXPENSES_API}?action=audit&limit=100`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load audit trail.");
    }
    auditEvents = Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    console.error("Unable to load audit trail:", error);
    auditEvents = [];
  }
}
function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
async function fetchExpenseReport(month) {
  const response = await fetch(
    `${EXPENSES_API}?month=${encodeURIComponent(month)}`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || "Unable to load monthly expenses.");
  }
  return result.data;
}
async function loadExpenseReport() {
  try {
    expenseReport = await fetchExpenseReport(getMonthKey());
  } catch (error) {
    console.error("Unable to load monthly expenses:", error);
    expenseReport = null;
  }
}
function renderExpenseChange() {
  const element = document.getElementById("expenseChange");
  if (!element) {
    return;
  }
  const wrapper = element.closest(".expense-change");
  const icon = wrapper?.querySelector("i");
  const current = Number(expenseReport?.total || 0);
  const previous = Number(expenseReport?.previous_total || 0);
  let text = "0% vs last month";
  let direction = "up";
  if (previous > 0) {
    const change = ((current - previous) / previous) * 100;
    direction = change > 0 ? "up" : "down";
    text = `${Math.abs(change).toFixed(1)}% vs last month`;
  } else if (current > 0) {
    text = "New vs last month";
  }
  element.textContent = text;
  wrapper?.classList.toggle("down", direction === "down" && previous > 0);
  if (icon) {
    icon.className = `fa-solid fa-arrow-${direction}`;
  }
}
function getMonthLabel(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
function openExpensesModal() {
  const select = document.getElementById("expensesMonthSelect");
  if (select) {
    select.innerHTML = "";
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    for (let monthIndex = currentMonth; monthIndex >= 0; monthIndex--) {
      const date = new Date(currentYear, monthIndex, 1);
      const option = document.createElement("option");
      option.value = getMonthKey(date);
      option.textContent = getMonthLabel(option.value);
      select.appendChild(option);
    }
  }
  const dateInput = document.getElementById("expenseDate");
  if (dateInput) {
    dateInput.value = getTodayKey();
  }
  document.getElementById("expensesModal")?.classList.add("show");
  loadExpensesModal(select?.value || getMonthKey());
}
function closeExpensesModal() {
  document.getElementById("expensesModal")?.classList.remove("show");
}
async function loadExpensesModal(month) {
  try {
    expensesModalReport = await fetchExpenseReport(month);
  } catch (error) {
    console.error("Unable to load monthly expenses:", error);
    expensesModalReport = null;
  }
  renderExpensesModal(month);
}
function renderExpensesModal(month) {
  const report = expensesModalReport;
  const total = Number(report?.total || 0);
  const previous = Number(report?.previous_total || 0);
  document.getElementById("expensesModalTotal").textContent =
    formatMoney(total);
  document.getElementById("expensesModalCompare").textContent = report
    ? previous > 0
      ? `${getMonthLabel(month)} · ${(((total - previous) / previous) * 100).toFixed(1)}% vs previous month`
      : `${getMonthLabel(month)} · no expenses in the previous month`
    : "Unable to load expenses.";
  const categories = Array.isArray(report?.categories) ? report.categories : [];
  document.getElementById("expensesBreakdown").innerHTML = categories
    .map((item) => {
      const amount = Number(item.amount || 0);
      const percent = total > 0 ? (amount / total) * 100 : 0;
      const color = EXPENSE_COLORS[item.key] || EXPENSE_COLORS.other;
      return `<div class="breakdown-row"><span class="breakdown-name"><span class="expense-color" style="background:${color}"></span>${escapeHtml(item.label)}</span><div class="breakdown-bar-bg"><div class="breakdown-bar" style="width:${percent}%;background:${color}"></div></div><span class="breakdown-amount">${formatMoney(amount)}</span></div>`;
    })
    .join("");
  const canEdit = Boolean(report?.can_edit);
  document
    .getElementById("expenseAddSection")
    ?.classList.toggle("hidden", !canEdit);
  const entries = Array.isArray(report?.manual_entries)
    ? report.manual_entries
    : [];
  document.getElementById("overviewOtherTotal").textContent =
    formatMoney(total);
  document.getElementById("overviewOtherCount").textContent = entries.length
    ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`
    : "No entries";
  document.getElementById("manualExpenseList").innerHTML = entries.length
    ? entries
        .map(
          (entry) =>
            `<div class="expense-entry"><div class="expense-entry-info"><strong>${escapeHtml(entry.category_label)}${entry.description ? ` · ${escapeHtml(entry.description)}` : ""}</strong><span>${escapeHtml(formatLongDate(entry.expense_date))}</span></div><div class="expense-entry-right">${formatMoney(entry.amount)}${canEdit ? `<button type="button" class="expense-delete" title="Delete" data-uid="${escapeHtml(entry.expense_uid)}"><i class="fa-solid fa-trash-can"></i></button>` : ""}</div></div>`,
        )
        .join("")
    : '<div class="expense-empty">No other expenses recorded this month.</div>';
  document.querySelectorAll(".expense-delete").forEach((button) => {
    button.addEventListener("click", () =>
      deleteManualExpense(button.dataset.uid),
    );
  });
}
async function refreshAfterExpenseChange() {
  const month =
    document.getElementById("expensesMonthSelect")?.value || getMonthKey();
  await Promise.all([
    loadExpenseReport(),
    loadAuditTrail(),
    loadExpensesModal(month),
  ]);
  renderFinance();
}
async function addManualExpense() {
  const category = document.getElementById("expenseCategory")?.value || "";
  const description = (
    document.getElementById("expenseDescription")?.value || ""
  ).trim();
  const amount = Number(document.getElementById("expenseAmount")?.value) || 0;
  const date = document.getElementById("expenseDate")?.value || "";
  if (amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }
  if (!date) {
    alert("Please select the expense date.");
    return;
  }
  const button = document.getElementById("addExpenseButton");
  try {
    if (button) {
      button.disabled = true;
    }
    const response = await fetch(EXPENSES_API, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ category, description, amount, date }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to save expense.");
    }
    document.getElementById("expenseDescription").value = "";
    document.getElementById("expenseAmount").value = "";
    const select = document.getElementById("expensesMonthSelect");
    if (
      select &&
      Array.from(select.options).some((o) => o.value === date.slice(0, 7))
    ) {
      select.value = date.slice(0, 7);
    }
    await refreshAfterExpenseChange();
  } catch (error) {
    console.error("Unable to save expense:", error);
    alert(error.message || "Unable to save expense.");
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}
async function deleteManualExpense(uid) {
  if (!uid || !confirm("Delete this expense?")) {
    return;
  }
  try {
    const response = await fetch(
      `${EXPENSES_API}?expense_uid=${encodeURIComponent(uid)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to delete expense.");
    }
    await refreshAfterExpenseChange();
  } catch (error) {
    console.error("Unable to delete expense:", error);
    alert(error.message || "Unable to delete expense.");
  }
}
function openPaymentModal() {
  const modal = document.getElementById("paymentModal");
  if (!modal) {
    return;
  }
  window.__treatmentChargeContext = null;
  const patientInput = document.getElementById("paymentPatient");
  const serviceInput = document.getElementById("paymentService");
  const patientIdInput = document.getElementById("paymentPatientId");
  const paymentDateInput = document.getElementById("paymentDate");
  setupPatientSelector();
  if (patientIdInput) {
    patientIdInput.value = "";
  }
  if (patientInput) {
    patientInput.disabled = false;
    patientInput.readOnly = false;
    patientInput.value = "";
  }
  if (serviceInput) {
    serviceInput.readOnly = false;
    serviceInput.value = "";
  }
  if (paymentDateInput) {
    paymentDateInput.value = getTodayKey();
  }
  document.getElementById("paymentTotal").value = "";
  document.getElementById("paymentDiscount").value = "0";
  modal.classList.add("show");
}
function openTreatmentChargeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const patientId = String(params.get("patient_id") || "").trim();
  const treatmentId = String(params.get("treatment_id") || "").trim();
  const appointmentId = String(params.get("appointment_id") || "").trim();
  const service = String(params.get("service") || "").trim();
  if (!patientId || !treatmentId) {
    return;
  }
  const patient = findPatientById(patientId);
  if (!patient) {
    return;
  }
  const patientName = getPatientFullName(patient);
  const transactionDate = getTodayKey();
  const patientInput = document.getElementById("paymentPatient");
  const patientIdInput = document.getElementById("paymentPatientId");
  const serviceInput = document.getElementById("paymentService");
  const patientIdGroup = document.getElementById("paymentPatientIdGroup");
  const paymentDateGroup = document.getElementById("paymentDateGroup");
  const patientIdDisplay = document.getElementById("paymentPatientIdDisplay");
  const paymentDateInput = document.getElementById("paymentDate");
  if (patientInput) {
    patientInput.value = patientName;
    patientInput.readOnly = true;
  }
  if (patientIdInput) {
    patientIdInput.value = patientId;
  }
  if (patientIdDisplay) {
    patientIdDisplay.value = patientId;
  }
  if (serviceInput) {
    serviceInput.value = service || "Dental Treatment";
    serviceInput.readOnly = true;
  }
  if (patientIdGroup) {
    patientIdGroup.style.display = "";
  }
  if (paymentDateGroup) {
    paymentDateGroup.style.display = "";
  }
  if (paymentDateInput) {
    paymentDateInput.value = transactionDate;
  }
  const totalInput = document.getElementById("paymentTotal");
  const discountInput = document.getElementById("paymentDiscount");
  if (totalInput) {
    totalInput.value = "";
    totalInput.focus();
  }
  if (discountInput) {
    discountInput.value = "0";
  }
  window.__treatmentChargeContext = {
    patientId,
    treatmentId,
    appointmentId,
    service: service || "Dental Treatment",
    transactionDate,
  };
  const modal = document.getElementById("paymentModal");
  if (modal) {
    modal.classList.add("show");
  }
  window.history.replaceState({}, document.title, window.location.pathname);
}
function closePaymentModal() {
  document.getElementById("paymentModal")?.classList.remove("show");
}
async function savePayment() {
  const treatmentContext = window.__treatmentChargeContext || null;
  const treatmentFlow = Boolean(
    treatmentContext &&
    treatmentContext.patientId &&
    treatmentContext.treatmentId,
  );
  let patientId = "";
  let treatmentId = "";
  let appointmentId = "";
  let service = "";
  if (treatmentFlow) {
    patientId = String(treatmentContext.patientId || "").trim();
    treatmentId = String(treatmentContext.treatmentId || "").trim();
    appointmentId = String(treatmentContext.appointmentId || "").trim();
    service = String(
      treatmentContext.service ||
        document.getElementById("paymentService")?.value ||
        "",
    ).trim();
  } else {
    const patientRecord = getPaymentPatient();
    patientId = String(
      patientRecord?.patientId || patientRecord?.id || "",
    ).trim();
    service = String(
      document.getElementById("paymentService")?.value || "",
    ).trim();
  }
  const total = Number(document.getElementById("paymentTotal")?.value) || 0;
  const discount =
    Number(document.getElementById("paymentDiscount")?.value) || 0;
  if (!patientId) {
    alert("Please select a valid patient.");
    return;
  }
  if (!service) {
    alert(
      treatmentFlow
        ? "Treatment information is missing."
        : "Please enter the service.",
    );
    return;
  }
  if (total <= 0) {
    alert("Please enter a valid treatment price.");
    return;
  }
  if (discount < 0) {
    alert("Discount cannot be negative.");
    return;
  }
  if (discount > total) {
    alert("Discount cannot be greater than the treatment price.");
    return;
  }
  const saveButton = document.getElementById("savePaymentButton");
  const originalText = saveButton?.textContent || "Create Charge";
  try {
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Creating...";
    }
    const response = await fetch(TRANSACTIONS_API, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        patientId,
        appointmentId: appointmentId || null,
        treatmentId: treatmentId || null,
        service,
        total,
        discount,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to create treatment charge.");
    }
    await loadTransactions();
    await loadAuditTrail();
    renderAuditTrail();
    window.__treatmentChargeContext = null;
    closePaymentModal();
  } catch (error) {
    console.error("Unable to create treatment charge:", error);
    alert(error.message || "Unable to create treatment charge.");
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = originalText;
    }
  }
}
function viewTransaction(id) {
  const transaction = transactions.find((item) => item.id === id);
  if (transaction) {
    showTransactionDetails(transaction);
  }
}
function getPaymentHistory(transaction) {
  const history = Array.isArray(transaction.paymentHistory)
    ? transaction.paymentHistory
    : [];
  return history
    .filter(
      (payment) =>
        String(payment.status || "").toLowerCase() === "paid" &&
        Number(payment.amount) > 0,
    )
    .map((payment, index) => ({
      id:
        payment.paymentUid ||
        payment.paymentId ||
        `${transaction.id}-${index + 1}`,
      amount: Number(payment.amount) || 0,
      paymentMethod: normalizePaymentMethod(payment.paymentMethod),
      date: payment.paidAt
        ? String(payment.paidAt).slice(0, 10)
        : payment.date || transaction.date,
      time: payment.paidAt
        ? String(payment.paidAt).slice(11, 16)
        : payment.time || transaction.time || "",
      status: "paid",
    }))
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}
function showTransactionDetails(transaction) {
  currentDetailsTransaction = transaction;
  const balance = getBalance(transaction);
  document.getElementById("detailTransactionId").textContent =
    transaction.id || "-";
  document.getElementById("detailPatient").textContent =
    transaction.patient || "-";
  document.getElementById("detailService").textContent =
    transaction.service || "-";
  document.getElementById("detailTotal").textContent = formatMoney(
    transaction.total,
  );
  document.getElementById("detailDiscount").textContent = formatMoney(
    transaction.discount,
  );
  document.getElementById("detailPaid").textContent = formatMoney(
    transaction.paid,
  );
  document.getElementById("detailBalance").textContent = formatMoney(balance);
  const history = getPaymentHistory(transaction);
  const methods = [
    ...new Set(history.map((payment) => payment.paymentMethod).filter(Boolean)),
  ];
  document.getElementById("detailMethod").textContent =
    methods.join(" + ") ||
    transaction.paymentMethod ||
    transaction.method ||
    "-";
  document.getElementById("detailDate").textContent = formatLongDate(
    transaction.date,
  );
  const status = getPaymentStatus(transaction);
  const detailStatus = document.getElementById("detailStatus");
  detailStatus.textContent = status;
  detailStatus.className = `status-badge ${getStatusClass(status)}`;
  renderPaymentHistory(transaction);
  document.getElementById("detailsModal").classList.add("show");
}
function renderPaymentHistory(transaction) {
  const history = getPaymentHistory(transaction);
  const list = document.getElementById("paymentHistoryList");
  const count = document.getElementById("paymentHistoryCount");
  if (!list || !count) {
    return;
  }
  count.textContent = `${history.length} payment${history.length === 1 ? "" : "s"}`;
  list.innerHTML = history.length
    ? history
        .map((payment, index) => {
          const method = payment.paymentMethod;
          const icon =
            method === "GCash"
              ? "fa-mobile-screen-button"
              : method === "Bank Transfer"
                ? "fa-building-columns"
                : "fa-money-bill-wave";
          return `<div class="payment-history-item"><div class="payment-history-item-left"><div class="payment-history-method-icon"><i class="fa-solid ${icon}"></i></div><div class="payment-history-item-info"><strong>${escapeHtml(method || "-")}</strong><span>${escapeHtml(formatLongDate(payment.date))}${payment.time ? ` · ${escapeHtml(formatTime(payment.time))}` : ""}</span></div></div><div class="payment-history-item-right"><strong>${escapeHtml(formatMoney(payment.amount))}</strong><span>Payment ${history.length - index}</span></div></div>`;
        })
        .join("")
    : `<div class="payment-history-empty"><div class="payment-history-empty-icon"><i class="fa-solid fa-clock-rotate-left"></i></div><strong>No payment history</strong><p>Additional payments will appear here.</p></div>`;
}
function closeDetailsModal() {
  document.getElementById("detailsModal")?.classList.remove("show");
  currentDetailsTransaction = null;
}
function printReceipt() {
  const transaction = currentDetailsTransaction;
  if (!transaction) {
    return;
  }
  openPaymentReceipt(transaction);
}
function getTodayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function isCurrentMonth(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth()
  );
}
function getTodayRevenue() {
  return transactions
    .filter((transaction) => transaction.date === getTodayKey())
    .reduce((sum, transaction) => sum + transaction.paid, 0);
}
function getMonthlyRevenue() {
  return transactions
    .filter((transaction) => isCurrentMonth(transaction.date))
    .reduce((sum, transaction) => sum + transaction.paid, 0);
}
function getMonthlyExpenses() {
  return Number(expenseReport?.total || 0);
}
function getRevenueForMonth(monthIndex) {
  const currentYear = new Date().getFullYear();
  return transactions
    .filter((transaction) => {
      const date = new Date(`${transaction.date}T00:00:00`);
      return (
        date.getFullYear() === currentYear && date.getMonth() === monthIndex
      );
    })
    .reduce((sum, transaction) => sum + transaction.paid, 0);
}
function getBalance(transaction) {
  const databaseBalance = Number(transaction.balance);
  if (Number.isFinite(databaseBalance)) {
    return Math.max(databaseBalance, 0);
  }
  const totalAfterDiscount = Math.max(
    transaction.total - transaction.discount,
    0,
  );
  return Math.max(totalAfterDiscount - transaction.paid, 0);
}
function getPaymentStatus(transaction) {
  const balance = getBalance(transaction);
  const total = Math.max(transaction.total - transaction.discount, 0);
  if (balance <= 0) {
    return "Paid";
  }
  if (transaction.paid > 0 && transaction.paid < total) {
    return "Partial";
  }
  return "Unpaid";
}
function getStatusClass(status) {
  if (status === "Paid") {
    return "status-paid";
  }
  if (status === "Partial") {
    return "status-partial";
  }
  return "status-unpaid";
}
function formatMoney(amount) {
  return `₱${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function formatCompactMoney(amount) {
  if (amount >= 1000000) {
    return `₱${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `₱${(amount / 1000).toFixed(0)}K`;
  }
  return `₱${Math.round(amount)}`;
}
function formatShortDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
function formatLongDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function formatTime(time) {
  if (!time) {
    return "";
  }
  const parts = String(time).split(":");
  let hour = Number(parts[0]);
  const minute = parts[1] || "00";
  const suffix = hour >= 12 ? "PM" : "AM";
  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }
  return `${hour}:${minute} ${suffix}`;
}
function getCurrentMonthLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
function getInitials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
function shortenService(service) {
  const replacements = {
    "Dental Cleaning": "Cleaning",
    "Tooth Filling / Pasta": "Composite",
    "Tooth Extraction": "Extraction",
    "Braces Adjustment": "Braces",
  };
  return replacements[service] || service;
}
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeJs(value) {
  return String(value).replace(/\\/g, "\\\\\\\\").replace(/'/g, "\\'");
}
