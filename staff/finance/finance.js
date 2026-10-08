document.addEventListener("DOMContentLoaded", function () {
  const STORAGE_KEY = "dentaNuevaFinanceTransactions";
  const PATIENT_STORAGE_KEY = "dentanuueva_patients";
  const PATIENT_API = "../../api/patient_records.php";
  const TRANSACTIONS_API = "../../api/finance/transactions.php";
  const XENDIT_CREATE_PAYMENT_API = "../../api/xendit/create_payment.php";
  const PAGE_SIZE = 10;

  // Discount types: value stored in tbl_finance_transactions.discount_type
  const DISCOUNT_TYPES = {
    none: { label: "No Discount", rate: 0 },
    senior: { label: "Senior Citizen", rate: 20 },
    pwd: { label: "PWD", rate: 20 },
    promo: { label: "Clinic Promotional", rate: 10 },
    other: { label: "Other Authorized", rate: 0 },
  };

  let transactions = [];
  let patients = [];
  let currentPage = 1;
  let selectedPatientId = "";
  let currentTransaction = null;
  let pendingAppointmentPayment = null;
  let currentStep = 1;
  let discountLocked = false;

  const recordPaymentBtn = document.getElementById("recordPaymentBtn");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const cancelPaymentBtn = document.getElementById("cancelPaymentBtn");
  const paymentModal = document.getElementById("paymentModal");
  const paymentForm = document.getElementById("paymentForm");
  const patientNameInput = document.getElementById("patientName");
  const patientDropdown = document.getElementById("patientDropdown");
  const patientSelectWrapper = document.getElementById("patientSelectWrapper");
  const serviceNameInput = document.getElementById("serviceName");
  const serviceDropdown = document.getElementById("serviceDropdown");
  const serviceSelectWrapper = document.getElementById("serviceSelectWrapper");
  const paymentDateInput = document.getElementById("paymentDate");
  const paymentTotalInput = document.getElementById("paymentTotal");
  const paymentDiscountInput = document.getElementById("paymentDiscount");
  const paymentMethodInput = document.getElementById("paymentMethod");
  const paymentPaidInput = document.getElementById("paymentPaid");
  const paymentBalanceInput = document.getElementById("paymentBalance");
  const paymentProcessWrapper = document.getElementById(
    "paymentProcessWrapper",
  );
  const paymentProcessBox = document.getElementById("paymentProcessBox");

  // New: 2-step flow elements
  const discountTypeInput = document.getElementById("discountType");
  const discountRateInput = document.getElementById("discountRate");
  const paymentNetInput = document.getElementById("paymentNet");
  const paymentAmountDueInput = document.getElementById("paymentAmountDue");
  const paymentChangeInput = document.getElementById("paymentChange");
  const paymentStep1 = document.getElementById("paymentStep1");
  const paymentStep2 = document.getElementById("paymentStep2");
  const paymentActionsStep1 = document.getElementById("paymentActionsStep1");
  const paymentActionsStep2 = document.getElementById("paymentActionsStep2");
  const paymentStepLabel = document.getElementById("paymentStepLabel");
  const nextPaymentStepBtn = document.getElementById("nextPaymentStepBtn");
  const backPaymentStepBtn = document.getElementById("backPaymentStepBtn");
  const discountLockedNote = document.getElementById("discountLockedNote");

  let paymentProcessConfirmed = false;
  let xenditPaymentState = { status: "idle", paymentId: "", action: null };
  const paymentStatusInput = document.getElementById("paymentStatus");
  const transactionIdInput = document.getElementById("transactionId");
  const savePaymentBtn = document.getElementById("savePaymentBtn");
  const searchInput = document.getElementById("searchInput");
  const paymentMethodFilter = document.getElementById("paymentMethodFilter");
  const statusFilter = document.getElementById("statusFilter");
  const tableBody = document.getElementById("transactionsTableBody");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const emptyState = document.getElementById("emptyState");
  const transactionCount = document.getElementById("transactionCount");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const paginationInfo = document.getElementById("paginationInfo");
  const paginationBar = document.getElementById("paginationBar");
  const openCollectionDrawerBtn = document.getElementById(
    "openCollectionDrawerBtn",
  );
  const closeCollectionDrawerBtn = document.getElementById(
    "closeCollectionDrawerBtn",
  );
  const collectionDrawer = document.getElementById("collectionDrawer");
  const collectionDrawerOverlay = document.getElementById(
    "collectionDrawerOverlay",
  );
  const showTodayCollectionBtn = document.getElementById(
    "showTodayCollectionBtn",
  );
  const showMonthlyCollectionBtn = document.getElementById(
    "showMonthlyCollectionBtn",
  );
  const showCustomCollectionBtnToday = document.getElementById(
    "showCustomCollectionBtnToday",
  );
  const showCustomCollectionBtnMonthly = document.getElementById(
    "showCustomCollectionBtnMonthly",
  );
  const backToTodayFromCustomBtn = document.getElementById(
    "backToTodayFromCustomBtn",
  );
  const backToMonthlyFromCustomBtn = document.getElementById(
    "backToMonthlyFromCustomBtn",
  );
  const applyCustomRangeBtn = document.getElementById("applyCustomRangeBtn");
  const todayCollectionPage = document.getElementById("todayCollectionPage");
  const monthlyCollectionPage = document.getElementById(
    "monthlyCollectionPage",
  );
  const customCollectionPage = document.getElementById("customCollectionPage");
  const customDateFrom = document.getElementById("customDateFrom");
  const customDateTo = document.getElementById("customDateTo");
  const todayCollectionDescription = document.getElementById(
    "todayCollectionDescription",
  );
  const monthlyCollectionDescription = document.getElementById(
    "monthlyCollectionDescription",
  );
  const customCollectionDescription = document.getElementById(
    "customCollectionDescription",
  );
  const detailsModal = document.getElementById("detailsModal");
  const closeDetailsBtn = document.getElementById("closeDetailsBtn");
  const detailsCloseButton = document.getElementById("detailsCloseButton");
  const printReceiptBtn = document.getElementById("printReceiptBtn");

  initialize();

  function initialize() {
    const fromAppointment = loadAppointmentPaymentFromURL();
    loadTransactions();
    loadPatientsFromLocalStorage();
    setupDate();
    setupEvents();
    renderTransactions();
    renderCollections();
    if (window.lucide) {
      lucide.createIcons();
    }
    loadPatientsFromDatabase();

    if (fromAppointment && pendingAppointmentPayment) {
      setTimeout(() => {
        openPaymentModal();
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
      }, 150);
    }
  }

  function loadPatientsFromLocalStorage() {
    try {
      const stored = localStorage.getItem(PATIENT_STORAGE_KEY);
      if (!stored) {
        patients = [];
        return;
      }
      const parsed = JSON.parse(stored);
      patients = Array.isArray(parsed) ? parsed.map(normalizePatient) : [];
    } catch (error) {
      console.error("Unable to load local patients:", error);
      patients = [];
    }
  }

  async function loadPatientsFromDatabase() {
    try {
      const response = await fetch(PATIENT_API, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Patient API returned ${response.status}`);
      }
      const result = await response.json();
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(result.message || "Unable to load patient records.");
      }
      patients = result.data.map(normalizePatient);
      console.log(`Finance loaded ${patients.length} patient record(s).`);
    } catch (error) {
      console.warn(
        "Finance could not load patient records from API. Local patient records will be used.",
        error,
      );
    }
  }

  function normalizePatient(patient) {
    const normalized = { ...patient };
    normalized.patientId =
      normalized.patientId || normalized.patient_id || normalized.id || "";
    normalized.id = normalized.id || normalized.patientId || "";
    normalized.fullName =
      normalized.fullName || normalized.full_name || normalized.name || "";
    return normalized;
  }

  function getPatientName(patient) {
    if (!patient) {
      return "";
    }
    if (patient.firstName || patient.lastName) {
      return [patient.firstName, patient.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    return String(
      patient.fullName || patient.name || patient.patientName || "",
    ).trim();
  }

  function getPatientId(patient) {
    return String(
      patient?.patientId || patient?.patient_id || patient?.id || "",
    );
  }

  function findPatientById(patientId) {
    if (!patientId) {
      return null;
    }
    return (
      patients.find(function (patient) {
        return (
          getPatientId(patient).toLowerCase() ===
          String(patientId).trim().toLowerCase()
        );
      }) || null
    );
  }

  function getPatientMatches(query) {
    const value = String(query || "")
      .trim()
      .toLowerCase();
    if (!value) {
      return patients.slice(0, 10);
    }
    return patients.filter(function (patient) {
      const name = getPatientName(patient).toLowerCase();
      const id = getPatientId(patient).toLowerCase();
      return name.includes(value) || id.includes(value);
    });
  }

  function renderPatientDropdown(query) {
    if (!patientDropdown) {
      return;
    }
    const matches = getPatientMatches(query);
    patientDropdown.innerHTML = "";
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "patient-dropdown-empty";
      empty.textContent = "No matching patient found.";
      patientDropdown.appendChild(empty);
      return;
    }
    matches.forEach(function (patient) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "patient-dropdown-item";
      const patientId = getPatientId(patient);
      const patientName = getPatientName(patient);
      button.innerHTML = `<span class="patient-dropdown-name">${escapeHtml(patientName)}</span><span class="patient-dropdown-id">${escapeHtml(patientId)}</span>`;
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
        selectPatient(patient);
      });
      patientDropdown.appendChild(button);
    });
  }

  function selectPatient(patient) {
    const patientId = getPatientId(patient);
    const patientName = getPatientName(patient);
    selectedPatientId = patientId;
    patientNameInput.value =
      patientName && patientId
        ? `${patientName} · ${patientId}`
        : patientName || patientId;
    patientNameInput.dataset.patientId = patientId;
    closePatientDropdown();
    updateSaveButton();
  }

  function openPatientDropdown() {
    if (!patientDropdown || !patientSelectWrapper) {
      return;
    }
    renderPatientDropdown(patientNameInput.value);
    patientSelectWrapper.classList.add("open");
    patientNameInput.setAttribute("aria-expanded", "true");
  }

  function closePatientDropdown() {
    if (!patientDropdown || !patientSelectWrapper) {
      return;
    }
    patientSelectWrapper.classList.remove("open");
    patientNameInput.setAttribute("aria-expanded", "false");
  }

  function getServiceMatches(query) {
    const services = [
      "Consultation",
      "Dental Cleaning",
      "Tooth Filling",
      "Tooth Extraction",
      "Root Canal",
      "Braces Adjustment",
    ];
    const value = String(query || "")
      .trim()
      .toLowerCase();
    if (!value) {
      return services;
    }
    return services.filter(function (service) {
      return service.toLowerCase().includes(value);
    });
  }

  function renderServiceDropdown(query) {
    if (!serviceDropdown) {
      return;
    }
    const matches = getServiceMatches(query);
    serviceDropdown.innerHTML = "";
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "service-dropdown-empty";
      empty.textContent = "No matching service found.";
      serviceDropdown.appendChild(empty);
      return;
    }
    matches.forEach(function (service) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "service-dropdown-item";
      button.textContent = service;
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
        serviceNameInput.value = service;
        closeServiceDropdown();
        updateSaveButton();
      });
      serviceDropdown.appendChild(button);
    });
  }

  function openServiceDropdown() {
    if (!serviceDropdown || !serviceSelectWrapper) {
      return;
    }
    renderServiceDropdown(serviceNameInput.value);
    serviceSelectWrapper.classList.add("open");
    serviceNameInput.setAttribute("aria-expanded", "true");
  }

  function closeServiceDropdown() {
    if (!serviceDropdown || !serviceSelectWrapper) {
      return;
    }
    serviceSelectWrapper.classList.remove("open");
    serviceNameInput.setAttribute("aria-expanded", "false");
  }

  function getTodayString() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getCurrentTime() {
    const date = new Date();
    return date.toTimeString().slice(0, 8);
  }

  function getTodayKey() {
    return getTodayString();
  }

  function formatCurrency(value) {
    return `₱${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatDate(value) {
    if (!value) {
      return "-";
    }
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function generateTransactionId() {
    return `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  function generatePaymentId() {
    return `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  function getStatus(paid, balance) {
    const normalizedPaid = Number(paid) || 0;
    const normalizedBalance = Number(balance) || 0;
    if (normalizedBalance <= 0 && normalizedPaid > 0) {
      return "Paid";
    }
    if (normalizedPaid > 0) {
      return "Partial";
    }
    return "Unpaid";
  }

  function getLatestPaymentMethod(transaction) {
    if (
      !transaction ||
      !Array.isArray(transaction.paymentHistory) ||
      !transaction.paymentHistory.length
    ) {
      return transaction?.paymentMethod || "-";
    }
    return (
      transaction.paymentHistory[transaction.paymentHistory.length - 1]
        .paymentMethod || "-"
    );
  }

  function isSuccessfulPayment(payment) {
    const status = String(
      payment?.status || payment?.paymentStatus || "",
    ).toLowerCase();
    return status === "paid";
  }

  function getTransactionPaid(transaction) {
    if (!transaction) {
      return 0;
    }
    if (Array.isArray(transaction.paymentHistory)) {
      return transaction.paymentHistory.reduce(function (sum, payment) {
        if (!isSuccessfulPayment(payment)) {
          return sum;
        }
        return sum + (Number(payment.amount) || 0);
      }, 0);
    }
    return Number(transaction.paid) || 0;
  }

  function getTransactionBalance(transaction) {
    if (!transaction) {
      return 0;
    }
    const total = Number(transaction.total) || 0;
    const discount = Number(transaction.discount) || 0;
    return Math.max(total - discount - getTransactionPaid(transaction), 0);
  }

  function normalizeTransaction(transaction) {
    const normalized = { ...transaction };
    normalized.id =
      normalized.id || normalized.transactionId || generateTransactionId();
    normalized.patientId = normalized.patientId || "";
    normalized.patientName = normalized.patientName || normalized.patient || "";
    normalized.service = normalized.service || "";
    normalized.date = normalized.date || getTodayString();
    normalized.total = Number(normalized.total) || 0;
    normalized.discount = Number(normalized.discount) || 0;
    normalized.discountType = normalized.discountType || "none";
    normalized.discountRate = Number(normalized.discountRate) || 0;
    if (!Array.isArray(normalized.paymentHistory)) {
      normalized.paymentHistory = [];
    }
    if (normalized.paymentHistory.length === 0 && Number(normalized.paid) > 0) {
      normalized.paymentHistory.push({
        id: generatePaymentId(),
        amount: Number(normalized.paid),
        paymentMethod: normalized.paymentMethod || "Cash",
        date: normalized.date || getTodayString(),
        xenditPaymentId: normalized.xenditPaymentId || "",
        xenditStatus: normalized.xenditStatus || "",
      });
    }
    normalized.paymentHistory = normalized.paymentHistory.map(
      function (payment) {
        return {
          ...payment,
          id: payment.id || generatePaymentId(),
          transactionId: payment.transactionId || normalized.id,
          patientId: payment.patientId || normalized.patientId,
          patientName: payment.patientName || normalized.patientName,
          service: payment.service || normalized.service,
          amount: Number(payment.amount) || 0,
          paymentMethod:
            payment.paymentMethod || normalized.paymentMethod || "Cash",
          date: payment.date || normalized.date || getTodayString(),
          status: payment.status || payment.paymentStatus || "paid",
          xenditPaymentId:
            payment.xenditPaymentId || normalized.xenditPaymentId || "",
          xenditStatus: payment.xenditStatus || normalized.xenditStatus || "",
        };
      },
    );
    normalized.paid = normalized.paymentHistory.reduce(function (sum, payment) {
      if (!isSuccessfulPayment(payment)) {
        return sum;
      }
      return sum + (Number(payment.amount) || 0);
    }, 0);
    normalized.balance = Math.max(
      normalized.total - normalized.discount - normalized.paid,
      0,
    );
    normalized.status = getStatus(normalized.paid, normalized.balance);
    normalized.paymentMethod = getLatestPaymentMethod(normalized);
    normalized.xenditPaymentId = normalized.xenditPaymentId || "";
    normalized.xenditStatus = normalized.xenditStatus || "";
    normalized.updatedTime =
      normalized.updatedTime || normalized.createdTime || "";
    return normalized;
  }

  function normalizeDatabaseTransaction(transaction) {
    const total = Number(transaction.total_amount) || 0;
    const discount = Number(transaction.discount_amount) || 0;
    const paid = Number(transaction.paid_amount) || 0;
    const balance = Math.max(Number(transaction.balance_amount) || 0, 0);
    const status = String(transaction.status || "unpaid").toLowerCase();
    const rawPaymentHistory = Array.isArray(transaction.paymentHistory)
      ? transaction.paymentHistory
      : Array.isArray(transaction.payment_history)
        ? transaction.payment_history
        : [];
    const paymentHistory = rawPaymentHistory.map(function (payment) {
      return {
        ...payment,
        id:
          payment.id ||
          payment.payment_uid ||
          payment.payment_id ||
          generatePaymentId(),
        paymentId: payment.payment_id || null,
        paymentUid: payment.payment_uid || "",
        transactionId:
          payment.transaction_id || transaction.transaction_id || null,
        patientId: payment.patient_id || transaction.patient_id || "",
        amount: Number(payment.amount) || 0,
        paymentMethod: normalizePaymentMethod(
          payment.payment_method || payment.paymentMethod || "Cash",
        ),
        paymentSource:
          payment.payment_source || payment.paymentSource || "staff",
        status: payment.status || payment.payment_status || "",
        date:
          payment.paid_at ||
          payment.created_at ||
          transaction.created_at ||
          getTodayString(),
        referenceNumber: payment.reference_number || "",
        xenditReferenceId: payment.xendit_reference_id || "",
        xenditPaymentRequestId: payment.xendit_payment_request_id || "",
        xenditPaymentId: payment.xendit_payment_id || "",
        xenditStatus: payment.xendit_status || "",
        xenditChannelCode: payment.xendit_channel_code || "",
        xenditActionType: payment.xendit_action_type || "",
        xenditActionValue: payment.xendit_action_value || "",
      };
    });
    const successfulPayments = paymentHistory.filter(isSuccessfulPayment);
    const calculatedPaid = successfulPayments.reduce(function (sum, payment) {
      return sum + (Number(payment.amount) || 0);
    }, 0);
    const latestPayment = paymentHistory.length
      ? paymentHistory[paymentHistory.length - 1]
      : null;
    return {
      id:
        transaction.transaction_uid || String(transaction.transaction_id || ""),
      transactionId: transaction.transaction_id || null,
      transactionUid: transaction.transaction_uid || "",
      patientId: transaction.patient_id || "",
      patientName: transaction.patient_name || "",
      service: transaction.service_name || "",
      date: transaction.created_at
        ? String(transaction.created_at).slice(0, 10)
        : getTodayString(),
      total,
      discount,
      discountType: transaction.discount_type || "none",
      discountRate: Number(transaction.discount_rate) || 0,
      paid: paymentHistory.length ? calculatedPaid : paid,
      balance: paymentHistory.length
        ? Math.max(total - discount - calculatedPaid, 0)
        : balance,
      status:
        status === "paid"
          ? "Paid"
          : status === "partial"
            ? "Partial"
            : status === "cancelled"
              ? "Cancelled"
              : "Unpaid",
      paymentMethod:
        latestPayment?.paymentMethod || transaction.payment_method || "-",
      paymentHistory,
      appointmentId: transaction.appointment_id || null,
      treatmentId: transaction.treatment_id || null,
      createdBy: transaction.created_by || null,
      createdTime: transaction.created_at || "",
      updatedTime: transaction.updated_at || "",
      xenditPaymentId:
        latestPayment?.xenditPaymentId || transaction.xendit_payment_id || "",
      xenditStatus:
        latestPayment?.xenditStatus || transaction.xendit_status || "",
    };
  }

  function normalizePaymentMethod(method) {
    const normalized = String(method || "")
      .trim()
      .toLowerCase();
    if (normalized === "gcash") {
      return "GCash";
    }
    if (normalized === "bank_transfer" || normalized === "bank transfer") {
      return "Bank Transfer";
    }
    if (normalized === "cash") {
      return "Cash";
    }
    return method || "-";
  }

  async function loadTransactions() {
    try {
      const response = await fetch(TRANSACTIONS_API, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Finance API returned ${response.status}`);
      }
      const result = await response.json();
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(
          result.message || "Unable to load finance transactions.",
        );
      }
      transactions = result.data.map(normalizeDatabaseTransaction);
      console.log(
        `Finance loaded ${transactions.length} transaction(s) from database.`,
      );
      renderTransactions();
      renderCollections();
    } catch (error) {
      console.error("Unable to load finance transactions:", error);
      transactions = [];
      renderTransactions();
      renderCollections();
    }
  }

  function saveTransactions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  function renderTransactions() {
    const filtered = getFilteredTransactions();
    const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);
    tableBody.innerHTML = "";
    if (!pageItems.length) {
      emptyState.style.display = "flex";
      transactionCount.textContent = "0 transactions";
      paginationBar.style.display = "none";
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      if (window.lucide) {
        lucide.createIcons();
      }
      return;
    }
    emptyState.style.display = "none";
    transactionCount.textContent = `${filtered.length} transaction${filtered.length === 1 ? "" : "s"}`;
    pageItems.forEach(function (transaction) {
      const normalized = normalizeTransaction(transaction);
      const row = document.createElement("tr");
      const statusClass = normalized.status.toLowerCase().replace(/\s+/g, "-");
      const method = normalized.paymentMethod || "-";
      const balance = normalized.balance;
      const discountTitle =
        normalized.discount > 0
          ? `${getDiscountLabel(normalized.discountType)}${normalized.discountRate > 0 ? ` (${normalized.discountRate}%)` : ""}`
          : "";
      row.innerHTML = `<td><div class="patient-cell"><strong>${escapeHtml(normalized.patientName || "-")}</strong><span>${escapeHtml(normalized.patientId || "-")}</span></div></td><td><span class="service-cell">${escapeHtml(normalized.service || "-")}</span></td><td>${escapeHtml(formatDate(normalized.date))}</td><td>${formatCurrency(normalized.total)}</td><td title="${escapeHtml(discountTitle)}">${formatCurrency(normalized.discount)}</td><td>${formatCurrency(normalized.paid)}</td><td><span class="payment-method-badge ${escapeHtml(method.toLowerCase().replace(/\s+/g, "-"))}">${escapeHtml(method)}</span></td><td class="${balance > 0 ? "balance-due" : "balance-clear"}">${formatCurrency(balance)}</td><td><span class="status-badge ${statusClass}">${escapeHtml(normalized.status)}</span></td><td class="action-cell"><button type="button" class="table-action-button view-details-btn" data-transaction-id="${escapeHtml(normalized.id)}" title="View details"><i data-lucide="eye"></i></button>${balance > 0 ? `<button type="button" class="table-action-button record-payment-btn" data-transaction-id="${escapeHtml(normalized.id)}" title="Record payment"><i data-lucide="plus"></i></button>` : ""}</td>`;
      tableBody.appendChild(row);
    });
    if (totalPages > 1) {
      paginationBar.style.display = "flex";
      paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    } else {
      paginationBar.style.display = "none";
    }
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function getFilteredTransactions() {
    const searchValue = searchInput.value.trim().toLowerCase();
    const methodValue = paymentMethodFilter.value;
    const statusValue = statusFilter.value;
    return transactions.filter(function (transaction) {
      const normalized = normalizeTransaction(transaction);
      const matchesSearch =
        !searchValue ||
        normalized.patientName.toLowerCase().includes(searchValue) ||
        normalized.patientId.toLowerCase().includes(searchValue) ||
        normalized.id.toLowerCase().includes(searchValue) ||
        normalized.service.toLowerCase().includes(searchValue);
      const matchesMethod =
        methodValue === "all" || normalized.paymentMethod === methodValue;
      const matchesStatus =
        statusValue === "all" ||
        normalized.status.toLowerCase() === statusValue.toLowerCase();
      return matchesSearch && matchesMethod && matchesStatus;
    });
  }

  function renderCollections() {
    renderTodayCollection();
    renderMonthlyCollection();
    renderCollectionsSummary();
  }

  function getCollectionTotals(from, to) {
    const totals = {
      Cash: { amount: 0, count: 0 },
      GCash: { amount: 0, count: 0 },
      "Bank Transfer": { amount: 0, count: 0 },
      total: 0,
    };
    transactions.forEach(function (transaction) {
      const normalized = normalizeTransaction(transaction);
      normalized.paymentHistory.forEach(function (payment) {
        if (payment.date < from || payment.date > to) {
          return;
        }
        if (!isSuccessfulPayment(payment)) {
          return;
        }
        const amount = Number(payment.amount) || 0;
        const method = payment.paymentMethod || "";
        if (!totals[method]) {
          return;
        }
        totals[method].amount += amount;
        totals[method].count += 1;
        totals.total += amount;
      });
    });
    return totals;
  }

  function renderTodayCollection() {
    const today = getTodayKey();
    const totals = getCollectionTotals(today, today);
    setText("todayCashAmount", formatCurrency(totals.Cash.amount));
    setText("todayGcashAmount", formatCurrency(totals.GCash.amount));
    setText("todayBankAmount", formatCurrency(totals["Bank Transfer"].amount));
    setText("todayCashCount", transactionText(totals.Cash.count));
    setText("todayGcashCount", transactionText(totals.GCash.count));
    setText("todayBankCount", transactionText(totals["Bank Transfer"].count));
    setText("todayPaymentMethodTotal", formatCurrency(totals.total));
    if (todayCollectionDescription) {
      todayCollectionDescription.textContent = `Payment collection for ${formatDate(today)}.`;
    }
  }

  function renderMonthlyCollection() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const from = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}-${String(firstDay.getDate()).padStart(2, "0")}`;
    const to = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
    const totals = getCollectionTotals(from, to);
    setText("monthlyCashAmount", formatCurrency(totals.Cash.amount));
    setText("monthlyGcashAmount", formatCurrency(totals.GCash.amount));
    setText(
      "monthlyBankAmount",
      formatCurrency(totals["Bank Transfer"].amount),
    );
    setText("monthlyCashCount", transactionText(totals.Cash.count));
    setText("monthlyGcashCount", transactionText(totals.GCash.count));
    setText("monthlyBankCount", transactionText(totals["Bank Transfer"].count));
    setText("monthlyPaymentMethodTotal", formatCurrency(totals.total));
  }

  function calculateCollectionTotals(from, to) {
    return getCollectionTotals(from, to);
  }

  function loadAppointmentPaymentFromURL() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "appointment") {
      return false;
    }

    const appointmentId = params.get("appointmentId");
    if (!appointmentId) {
      return false;
    }

    pendingAppointmentPayment = {
      appointmentId,
      appointmentUid: params.get("appointmentUid") || "",
      patientId: params.get("patientId") || "",
      patientName: params.get("patientName") || "",
      dentistId: params.get("dentistId") || "",
      dentistName: params.get("dentistName") || "",
      service: params.get("service") || "",
      appointmentDate: params.get("appointmentDate") || "",
      appointmentTime: params.get("appointmentTime") || "",
      duration: Number(params.get("duration")) || 0,
      amount: Number(params.get("amount")) || 0,
      paymentStatus: params.get("paymentStatus") || "unpaid",
    };

    return true;
  }

  function formatAppointmentDateTime(dateString, timeString, durationMinutes) {
    if (!dateString || !timeString) {
      return "-";
    }
    const [year, month, day] = dateString.split("-").map(Number);
    const [hours, minutes] = timeString.split(":").map(Number);
    if (
      !year ||
      !month ||
      !day ||
      Number.isNaN(hours) ||
      Number.isNaN(minutes)
    ) {
      return `${dateString} · ${timeString}`;
    }
    const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const endDate = new Date(
      startDate.getTime() + (Number(durationMinutes) || 0) * 60000,
    );
    const dateFormatter = new Intl.DateTimeFormat("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const timeFormatter = new Intl.DateTimeFormat("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dateFormatter.format(startDate)} · ${timeFormatter.format(startDate)} – ${timeFormatter.format(endDate)}`;
  }

  function populateAppointmentPaymentInfo() {
    if (!pendingAppointmentPayment) {
      return;
    }
    const data = pendingAppointmentPayment;
    const infoDate = document.getElementById("appointmentInfoDate");
    const infoDentist = document.getElementById("appointmentInfoDentist");
    const infoPanel = document.getElementById("appointmentPaymentInfo");
    if (infoDate) {
      infoDate.textContent = formatAppointmentDateTime(
        data.appointmentDate,
        data.appointmentTime,
        data.duration,
      );
    }
    if (infoDentist) {
      infoDentist.textContent = data.dentistName || "-";
    }
    if (infoPanel) {
      infoPanel.style.display = "block";
    }
  }

  function applyAppointmentPaymentToForm() {
    if (!pendingAppointmentPayment) {
      return;
    }
    const data = pendingAppointmentPayment;
    selectedPatientId = data.patientId || "";
    patientNameInput.value = data.patientName || "";
    patientNameInput.dataset.patientId = data.patientId || "";
    serviceNameInput.value = data.service || "";
    paymentDateInput.value = data.appointmentDate || getTodayString();
    if (data.amount > 0) {
      paymentTotalInput.value = data.amount.toFixed(2);
    }
    patientNameInput.disabled = true;
    serviceNameInput.disabled = true;
    paymentDateInput.disabled = true;
    populateAppointmentPaymentInfo();
    updateDiscountCalculation();
    updatePaymentCalculation();
    renderPaymentProcessSection();
    updateSaveButton();
  }

  // ======================================================================
  // STEP 1 — DISCOUNT
  // ======================================================================
  function getDiscountLabel(type) {
    return (DISCOUNT_TYPES[type] || DISCOUNT_TYPES.none).label;
  }

  function getSelectedDiscountType() {
    const value = discountTypeInput ? discountTypeInput.value : "none";
    return DISCOUNT_TYPES[value] ? value : "none";
  }

  function getDiscountRateValue() {
    if (getSelectedDiscountType() === "none") {
      return 0;
    }
    return Math.min(Math.max(Number(discountRateInput.value) || 0, 0), 100);
  }

  function syncDiscountRateState() {
    const isNone = getSelectedDiscountType() === "none";
    discountRateInput.disabled = isNone || discountLocked;
  }

  function setDiscountLocked(locked) {
    discountLocked = Boolean(locked);
    discountTypeInput.disabled = discountLocked;
    paymentTotalInput.disabled = discountLocked;
    syncDiscountRateState();
    if (discountLockedNote) {
      discountLockedNote.classList.toggle(
        "payment-status-hidden",
        !discountLocked,
      );
    }
  }

  // Discount applies ONCE per transaction: when locked we never recompute.
  function updateDiscountCalculation() {
    const total = Math.max(Number(paymentTotalInput.value) || 0, 0);
    if (!discountLocked) {
      const rate = getDiscountRateValue();
      const amount = Math.round(total * rate) / 100;
      paymentDiscountInput.value = amount.toFixed(2);
    }
    const discount = Math.min(
      Math.max(Number(paymentDiscountInput.value) || 0, 0),
      total,
    );
    paymentNetInput.value = Math.max(total - discount, 0).toFixed(2);
    updatePaymentCalculation();
  }

  function handleDiscountTypeChange() {
    const type = getSelectedDiscountType();
    discountRateInput.value = Number(DISCOUNT_TYPES[type].rate).toFixed(2);
    syncDiscountRateState();
    updateDiscountCalculation();
  }

  function normalizeDiscountRateInput() {
    const rate = getDiscountRateValue();
    discountRateInput.value = rate.toFixed(2);
    updateDiscountCalculation();
  }

  function getDiscountPayload() {
    const type = getSelectedDiscountType();
    return {
      discountType: type,
      discountRate: type === "none" ? 0 : getDiscountRateValue(),
      discountAmount: Math.max(Number(paymentDiscountInput.value) || 0, 0),
    };
  }

  // ======================================================================
  // Step navigation
  // ======================================================================
  function showStep(step) {
    currentStep = step === 2 ? 2 : 1;
    paymentStep1.classList.toggle("payment-status-hidden", currentStep !== 1);
    paymentActionsStep1.classList.toggle(
      "payment-status-hidden",
      currentStep !== 1,
    );
    paymentStep2.classList.toggle("payment-status-hidden", currentStep !== 2);
    paymentActionsStep2.classList.toggle(
      "payment-status-hidden",
      currentStep !== 2,
    );
    if (paymentStepLabel) {
      paymentStepLabel.textContent = `FINANCE · STEP ${currentStep} OF 2`;
    }
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function validateStep1() {
    const patientId =
      selectedPatientId || patientNameInput.dataset.patientId || "";
    if (!patientId) {
      showToast("Please select a registered patient.");
      return false;
    }
    if (!serviceNameInput.value.trim()) {
      showToast("Please select a service.");
      return false;
    }
    if (!paymentDateInput.value) {
      showToast("Please select a payment date.");
      return false;
    }
    const total = Number(paymentTotalInput.value) || 0;
    if (total <= 0) {
      showToast("Please enter a valid total amount.");
      return false;
    }
    if (!discountLocked && getSelectedDiscountType() !== "none") {
      const rate = Number(discountRateInput.value) || 0;
      if (rate <= 0 || rate > 100) {
        showToast("Discount rate must be between 0.01% and 100%.");
        return false;
      }
    }
    if (getPaymentAmountDue() <= 0) {
      showToast("This payment is already fully paid.");
      return false;
    }
    return true;
  }

  function fillPaymentSummary() {
    const total = Math.max(Number(paymentTotalInput.value) || 0, 0);
    const discount = Math.max(Number(paymentDiscountInput.value) || 0, 0);
    const type =
      discountLocked && currentTransaction
        ? currentTransaction.discountType || "none"
        : getSelectedDiscountType();
    const rate =
      discountLocked && currentTransaction
        ? Number(currentTransaction.discountRate) || 0
        : getDiscountRateValue();
    const discountText =
      discount > 0
        ? `-${formatCurrency(discount)}${type !== "none" ? ` (${getDiscountLabel(type)}${rate > 0 ? ` ${rate}%` : ""})` : ""}`
        : formatCurrency(0);
    setText("sumPatient", patientNameInput.value || "-");
    setText("sumService", serviceNameInput.value || "-");
    setText("sumTotal", formatCurrency(total));
    setText("sumDiscount", discountText);
    setText("sumNet", formatCurrency(Math.max(total - discount, 0)));
    setText("sumBalance", formatCurrency(getPaymentAmountDue()));
  }

  function goToPaymentStep2() {
    if (!validateStep1()) {
      return;
    }
    fillPaymentSummary();
    showStep(2);
    renderPaymentProcessSection();
    updatePaymentCalculation();
  }

  function goToPaymentStep1() {
    // Leaving Step 2: discard any unfinished payment-process UI.
    paymentPaidInput.value = "";
    resetPaymentProcess();
    setOnlinePaymentMode(false);
    updatePaymentCalculation();
    showStep(1);
  }

  function openPaymentModal(transaction = null) {
    currentTransaction = transaction;
    paymentModal.classList.add("active");
    resetPaymentForm();
    if (transaction) {
      loadTransactionIntoForm(transaction);
    } else if (pendingAppointmentPayment) {
      applyAppointmentPaymentToForm();
    } else {
      paymentDateInput.value = getTodayString();
    }
    updateDiscountCalculation();
    renderPaymentProcessSection();
    updateSaveButton();
  }

  function closePaymentModal() {
    paymentModal.classList.remove("active");
    currentTransaction = null;
    pendingAppointmentPayment = null;
    selectedPatientId = "";
    resetPaymentForm();
    closePatientDropdown();
    closeServiceDropdown();
  }

  function resetPaymentForm() {
    paymentForm.reset();
    patientNameInput.disabled = false;
    serviceNameInput.disabled = false;
    paymentDateInput.disabled = false;
    paymentTotalInput.disabled = false;
    transactionIdInput.value = "";
    selectedPatientId = "";
    patientNameInput.value = "";
    patientNameInput.dataset.patientId = "";
    serviceNameInput.value = "";
    paymentDateInput.value = getTodayString();
    paymentTotalInput.value = "";
    discountTypeInput.value = "none";
    discountRateInput.value = "0.00";
    paymentDiscountInput.value = "0.00";
    paymentNetInput.value = "0.00";
    setDiscountLocked(false);
    paymentPaidInput.value = "";
    paymentBalanceInput.value = "0.00";
    if (paymentAmountDueInput) paymentAmountDueInput.value = "0.00";
    if (paymentChangeInput) paymentChangeInput.value = "0.00";
    paymentMethodInput.value = "";
    paymentStatusInput.value = "Unpaid";
    const appointmentPaymentInfo = document.getElementById(
      "appointmentPaymentInfo",
    );
    if (appointmentPaymentInfo) {
      appointmentPaymentInfo.style.display = "none";
    }
    resetPaymentProcess();
    setOnlinePaymentMode(false);
    updatePaymentActionButton();
    showStep(1);
    if (savePaymentBtn) {
      savePaymentBtn.disabled = true;
    }
  }

  function loadTransactionIntoForm(transaction) {
    const normalized = normalizeTransaction(transaction);
    transactionIdInput.value = normalized.id;
    selectedPatientId = normalized.patientId;
    const patient = findPatientById(normalized.patientId);
    if (patient) {
      selectPatient(patient);
    } else {
      patientNameInput.value =
        normalized.patientName || normalized.patientId || "";
      patientNameInput.dataset.patientId = normalized.patientId || "";
    }
    serviceNameInput.value = normalized.service || "";
    paymentDateInput.value = getTodayString();
    paymentTotalInput.value = Number(normalized.total || 0).toFixed(2);

    // Discount was already applied on this transaction -> show it, locked.
    discountTypeInput.value = DISCOUNT_TYPES[normalized.discountType]
      ? normalized.discountType
      : "none";
    discountRateInput.value = Number(normalized.discountRate || 0).toFixed(2);
    paymentDiscountInput.value = Number(normalized.discount || 0).toFixed(2);
    setDiscountLocked(true);

    paymentPaidInput.value = "0.00";
    paymentMethodInput.value = getLatestPaymentMethod(normalized);
    patientNameInput.disabled = true;
    serviceNameInput.disabled = true;
    paymentDateInput.disabled = true;
    updateDiscountCalculation();
    if (["GCash", "Bank Transfer"].includes(paymentMethodInput.value)) {
      const remaining = getPaymentAmountDue();
      paymentPaidInput.value = remaining > 0 ? remaining.toFixed(2) : "";
    }
  }

  function updatePaymentCalculation() {
    const total = Math.max(Number(paymentTotalInput.value) || 0, 0);
    const discount = Math.min(
      Math.max(Number(paymentDiscountInput.value) || 0, 0),
      total,
    );
    const existingPaid = currentTransaction
      ? Math.max(Number(currentTransaction.paid) || 0, 0)
      : 0;
    const amountReceived = Math.max(Number(paymentPaidInput.value) || 0, 0);
    const netTotal = Math.max(total - discount, 0);
    const remainingBeforePayment = Math.max(netTotal - existingPaid, 0);
    const newPayment = Math.min(amountReceived, remainingBeforePayment);
    const totalPaidAfterPayment = Math.min(existingPaid + newPayment, netTotal);
    const balance = Math.max(netTotal - totalPaidAfterPayment, 0);
    paymentBalanceInput.value = balance.toFixed(2);
    if (paymentAmountDueInput) {
      paymentAmountDueInput.value = remainingBeforePayment.toFixed(2);
    }
    if (paymentChangeInput) {
      paymentChangeInput.value = Math.max(
        amountReceived - remainingBeforePayment,
        0,
      ).toFixed(2);
    }
    if (balance <= 0 && netTotal > 0) {
      paymentStatusInput.value = "Paid";
    } else if (totalPaidAfterPayment > 0) {
      paymentStatusInput.value = "Partial";
    } else {
      paymentStatusInput.value = "Unpaid";
    }
    updateSaveButton();
  }

  function getPaymentBalanceGroup() {
    return paymentBalanceInput?.closest(".form-group") || null;
  }

  function setPaymentGroupVisible(element, visible) {
    const group = element?.closest(".form-group");
    if (group) {
      group.style.display = visible ? "" : "none";
    }
  }

  function setOnlinePaymentMode(isOnline) {
    setPaymentGroupVisible(paymentPaidInput, !isOnline);
    setPaymentGroupVisible(paymentStatusInput, !isOnline);
    setPaymentGroupVisible(paymentAmountDueInput, !isOnline);
    setPaymentGroupVisible(paymentChangeInput, !isOnline);
    if (paymentBalanceInput) {
      const balanceGroup = getPaymentBalanceGroup();
      if (balanceGroup) {
        balanceGroup.style.display = "";
      }
      const balanceLabel = balanceGroup?.querySelector("label");
      if (balanceLabel) {
        balanceLabel.textContent = "Balance After Payment";
      }
    }
  }

  function syncOnlinePaymentAmount() {
    const input = document.getElementById("onlinePaymentAmount");
    if (!input) {
      return;
    }
    const remaining = getPaymentAmountDue();
    let amount = Math.max(Number(input.value) || 0, 0);
    if (remaining <= 0) {
      amount = 0;
    } else if (amount > remaining) {
      amount = remaining;
    }
    input.value = amount > 0 ? amount.toFixed(2) : "";
    paymentPaidInput.value = amount > 0 ? amount.toFixed(2) : "";
  }

  function updatePaymentActionButton() {
    if (!savePaymentBtn) {
      return;
    }
    const method = paymentMethodInput?.value || "";
    if (method === "GCash" || method === "Bank Transfer") {
      savePaymentBtn.innerHTML =
        '<i data-lucide="arrow-right"></i><span>Continue to Payment</span>';
    } else {
      savePaymentBtn.innerHTML =
        '<i data-lucide="check"></i><span>Save Payment</span>';
    }
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function resetPaymentProcess() {
    paymentProcessConfirmed = false;
    xenditPaymentState = { status: "idle", paymentId: "", action: null };
    if (paymentProcessBox) {
      paymentProcessBox.innerHTML = "";
    }
    if (paymentProcessWrapper) {
      paymentProcessWrapper.style.display = "none";
    }
  }

  function getPaymentAmountDue() {
    const total = Math.max(Number(paymentTotalInput.value) || 0, 0);
    const discount = Math.min(
      Math.max(Number(paymentDiscountInput.value) || 0, 0),
      total,
    );
    let alreadyPaid = 0;
    if (currentTransaction) {
      alreadyPaid = Math.max(Number(currentTransaction.paid) || 0, 0);
    }
    return Math.max(total - discount - alreadyPaid, 0);
  }

  function updatePaymentProcessAmounts() {
    if (!paymentProcessBox || !paymentProcessWrapper) {
      return;
    }
    const method = paymentMethodInput?.value || "";
    if (!method || paymentProcessWrapper.style.display === "none") {
      return;
    }
    const amountDue = getPaymentAmountDue();
    const amountReceived = Math.max(Number(paymentPaidInput.value) || 0, 0);
    const amountDueElement = document.getElementById("processAmountDue");
    const amountReceivedElement = document.getElementById(
      "processAmountReceived",
    );
    const changeElement = document.getElementById("processChange");
    if (amountDueElement) {
      amountDueElement.textContent = formatCurrency(amountDue);
    }
    if (amountReceivedElement) {
      amountReceivedElement.textContent = formatCurrency(amountReceived);
    }
    if (changeElement) {
      changeElement.textContent = formatCurrency(
        Math.max(amountReceived - amountDue, 0),
      );
    }
    const onlineAmountInput = document.getElementById("onlinePaymentAmount");
    if (onlineAmountInput) {
      const currentAmount = Math.max(Number(paymentPaidInput.value) || 0, 0);
      onlineAmountInput.max = amountDue.toFixed(2);
      if (currentAmount > amountDue) {
        onlineAmountInput.value = amountDue > 0 ? amountDue.toFixed(2) : "";
        paymentPaidInput.value = amountDue > 0 ? amountDue.toFixed(2) : "";
      }
    }
  }

  function renderPaymentProcessSection() {
    if (!paymentProcessWrapper || !paymentProcessBox) {
      return;
    }
    const method = paymentMethodInput?.value || "";
    paymentProcessConfirmed = false;
    updatePaymentActionButton();
    if (!method) {
      paymentProcessWrapper.style.display = "none";
      paymentProcessBox.innerHTML = "";
      setOnlinePaymentMode(false);
      updateSaveButton();
      return;
    }
    const onlineMethods = ["GCash", "Bank Transfer"];
    if (onlineMethods.includes(method)) {
      const amountDue = getPaymentAmountDue();
      const currentAmount = Math.max(Number(paymentPaidInput.value) || 0, 0);
      const amount =
        currentAmount > 0 ? Math.min(currentAmount, amountDue) : amountDue;
      paymentPaidInput.value = amount > 0 ? amount.toFixed(2) : "";
      updatePaymentCalculation();
      setOnlinePaymentMode(true);
      paymentProcessWrapper.style.display = "block";
      paymentProcessBox.dataset.method = method;
      paymentProcessBox.innerHTML = `
          <div class="payment-process-header">
            <i data-lucide="${method === "GCash" ? "smartphone" : "building-2"}"></i>
            <span>${escapeHtml(method)} Payment</span>
          </div>
          <div class="process-row">
            <div class="process-field">
              <label for="onlinePaymentAmount">Amount to Pay</label>
              <div class="amount-input">
                <span>₱</span>
                <input type="number" id="onlinePaymentAmount" min="0.01" max="${amountDue.toFixed(2)}" step="0.01" value="${amount > 0 ? amount.toFixed(2) : ""}" placeholder="0.00" required>
              </div>
            </div>
          </div>
          <div class="payment-process-status">
            <div>
              <i data-lucide="lock"></i>
              <span>${escapeHtml(method)} payment will continue securely through Xendit. The payment will only be recorded in Finance after Xendit confirms it.</span>
            </div>
          </div>
        `;
      const onlineAmountInput = document.getElementById("onlinePaymentAmount");
      if (onlineAmountInput) {
        onlineAmountInput.addEventListener("input", function () {
          const remaining = getPaymentAmountDue();
          let amount = Math.max(Number(onlineAmountInput.value) || 0, 0);
          if (amount > remaining) {
            amount = remaining;
            onlineAmountInput.value = remaining.toFixed(2);
          }
          paymentPaidInput.value = amount > 0 ? amount.toFixed(2) : "";
          updatePaymentCalculation();
        });
        onlineAmountInput.addEventListener("blur", function () {
          const remaining = getPaymentAmountDue();
          let amount = Math.max(Number(onlineAmountInput.value) || 0, 0);
          if (amount > remaining) {
            amount = remaining;
          }
          onlineAmountInput.value = amount > 0 ? amount.toFixed(2) : "";
          paymentPaidInput.value = amount > 0 ? amount.toFixed(2) : "";
          updatePaymentCalculation();
        });
      }
      if (window.lucide) {
        lucide.createIcons();
      }
      updatePaymentProcessAmounts();
      updateSaveButton();
      return;
    }
    setOnlinePaymentMode(false);
    paymentProcessWrapper.style.display = "none";
    paymentProcessBox.innerHTML = "";
    updateSaveButton();
  }

  async function startStaffXenditPayment() {
    const method = paymentMethodInput?.value || "";
    const allowedMethods = ["GCash", "Bank Transfer"];
    if (!allowedMethods.includes(method)) {
      showToast("Please select a supported online payment method.");
      return;
    }
    const patientId =
      selectedPatientId || patientNameInput.dataset.patientId || "";
    const patient = findPatientById(patientId);
    if (!patientId || !patient) {
      showToast("Please select a registered patient.");
      return;
    }
    const service = serviceNameInput.value.trim();
    if (!service) {
      showToast("Please select a service.");
      return;
    }
    const total = Math.max(Number(paymentTotalInput.value) || 0, 0);
    const amount = Math.max(Number(paymentPaidInput.value) || 0, 0);
    const remaining = getPaymentAmountDue();
    if (total <= 0) {
      showToast("Please enter a valid total amount.");
      return;
    }
    if (amount <= 0) {
      showToast("Please enter the payment amount.");
      return;
    }
    if (remaining <= 0) {
      showToast("This payment is already fully paid.");
      return;
    }
    if (amount > remaining) {
      showToast(
        `Payment amount cannot exceed the remaining balance of ${formatCurrency(remaining)}.`,
      );
      return;
    }
    const button = savePaymentBtn;
    if (button) {
      button.disabled = true;
      button.innerHTML = `<i data-lucide="loader-circle"></i><span>Connecting to Xendit...</span>`;
      if (window.lucide) {
        lucide.createIcons();
      }
    }
    xenditPaymentState = { status: "processing", paymentId: "", action: null };
    try {
      if (!currentTransaction) {
        const discountPayload = getDiscountPayload();
        const transactionResponse = await fetch(TRANSACTIONS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            patientId,
            appointmentId: pendingAppointmentPayment?.appointmentId || null,
            service,
            totalAmount: total,
            discountType: discountPayload.discountType,
            discountRate: discountPayload.discountRate,
            discountAmount: discountPayload.discountAmount,
          }),
        });
        const transactionResult = await transactionResponse.json();
        if (!transactionResponse.ok || !transactionResult.success) {
          throw new Error(
            transactionResult.message ||
              "Unable to create finance transaction.",
          );
        }
        const createdTransaction = Array.isArray(transactionResult.data)
          ? transactionResult.data[0]
          : transactionResult.data ||
            transactionResult.transaction ||
            transactionResult;
        if (!createdTransaction || typeof createdTransaction !== "object") {
          throw new Error("Unable to read the created finance transaction.");
        }
        currentTransaction = normalizeDatabaseTransaction(createdTransaction);
        transactionIdInput.value =
          currentTransaction.transactionUid || currentTransaction.id || "";
        // Transaction now exists with this discount -> it can't change anymore.
        paymentDiscountInput.value = Number(
          currentTransaction.discount || 0,
        ).toFixed(2);
        setDiscountLocked(true);
      }
      const transactionUid =
        currentTransaction?.transactionUid ||
        currentTransaction?.transaction_uid ||
        "";
      if (!transactionUid) {
        throw new Error("Finance transaction UID was not found.");
      }
      const response = await fetch(XENDIT_CREATE_PAYMENT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          transactionUid,
          patientId,
          patientName: getPatientName(patient),
          amount,
          paymentMethod: method,
          paymentSource: "staff",
          currency: "PHP",
          returnUrl: window.location.href,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to create Xendit payment.");
      }
      xenditPaymentState = {
        status: result.status || "REQUIRES_ACTION",
        paymentId:
          result.payment_request_id ||
          result.payment_id ||
          result.xendit_payment_request_id ||
          "",
        action:
          Array.isArray(result.actions) && result.actions.length
            ? result.actions[0]
            : null,
      };
      const action = xenditPaymentState.action;
      if (action && action.type === "REDIRECT_CUSTOMER" && action.value) {
        window.location.href = action.value;
        return;
      }
      renderXenditPendingState(method, result);
    } catch (error) {
      console.error("Staff Xendit payment error:", error);
      xenditPaymentState = { status: "FAILED", paymentId: "", action: null };
      renderXenditErrorState(
        error.message || "Unable to start Xendit payment.",
      );
    }
  }

  function renderXenditPendingState(method, result) {
    if (!paymentProcessWrapper || !paymentProcessBox) {
      return;
    }
    const paymentId = result?.payment_id || xenditPaymentState.paymentId || "";
    const status =
      result?.status || xenditPaymentState.status || "REQUIRES_ACTION";
    const action = xenditPaymentState.action;
    const icon = method === "GCash" ? "smartphone" : "building-2";
    const actionValue =
      action && action.type === "PRESENT_TO_CUSTOMER" && action.value
        ? String(action.value)
        : "";
    paymentProcessWrapper.style.display = "block";
    paymentProcessBox.innerHTML = `
      <div class="payment-process-status">
        <div class="payment-process-status-main">
          <div class="payment-process-status-icon">
            <i data-lucide="clock-3"></i>
          </div>
          <div>
            <strong>Waiting for Xendit Confirmation</strong>
            <span>${escapeHtml(method)} payment is currently ${escapeHtml(status)}.</span>
          </div>
        </div>
      </div>
      <div class="payment-process-instructions">
        <div class="payment-process-instructions-header">
          <i data-lucide="${icon}"></i>
          <span>Complete the ${escapeHtml(method)} payment using the instructions below.</span>
        </div>
        ${
          actionValue
            ? `<div class="process-static-amount">${escapeHtml(actionValue)}</div>`
            : `<div class="payment-process-description">Complete the payment using the instructions provided by Xendit.</div>`
        }
      </div>
      ${paymentId ? `<div class="payment-process-meta">Xendit Payment ID: ${escapeHtml(paymentId)}</div>` : ""}
      <div class="payment-process-meta">
        Do not save this online payment manually. Finance will record it after Xendit confirmation.
      </div>
    `;
    if (window.lucide) {
      lucide.createIcons();
    }
    setOnlinePaymentMode(true);
    if (savePaymentBtn) {
      savePaymentBtn.disabled = true;
      savePaymentBtn.innerHTML =
        '<i data-lucide="hourglass-half"></i><span>Payment Pending</span>';
      if (window.lucide) {
        lucide.createIcons();
      }
    }
  }

  function renderXenditErrorState(message) {
    if (!paymentProcessWrapper || !paymentProcessBox) {
      return;
    }
    paymentProcessWrapper.style.display = "block";
    paymentProcessBox.innerHTML = `
        <div class="payment-process-status">
          <div>
            <i data-lucide="circle-alert"></i>
            <span>Xendit could not start the ${escapeHtml(paymentMethodInput.value || "online")} payment.</span>
          </div>
        </div>
      `;
    setOnlinePaymentMode(true);
    if (savePaymentBtn) {
      savePaymentBtn.disabled = false;
      savePaymentBtn.innerHTML =
        '<i data-lucide="rotate-cw"></i><span>Try Again</span>';
    }
    if (window.lucide) {
      lucide.createIcons();
    }
    if (message) {
      showToast(message);
    }
  }

  function updateSaveButton() {
    if (!savePaymentBtn) {
      return;
    }
    const patientId =
      selectedPatientId || patientNameInput.dataset.patientId || "";
    const service = serviceNameInput.value.trim();
    const date = paymentDateInput.value;
    const total = Number(paymentTotalInput.value) || 0;
    const paid = Number(paymentPaidInput.value) || 0;
    const method = paymentMethodInput.value;
    const remaining = getPaymentAmountDue();
    updatePaymentActionButton();
    if (method === "GCash" || method === "Bank Transfer") {
      const valid =
        Boolean(patientId) &&
        Boolean(service) &&
        Boolean(date) &&
        total > 0 &&
        remaining > 0 &&
        paid > 0 &&
        paid <= remaining;
      savePaymentBtn.disabled = !valid;
      return;
    }
    // Cash: amount received may exceed the amount due (change is returned).
    const valid =
      Boolean(patientId) &&
      Boolean(service) &&
      Boolean(date) &&
      total > 0 &&
      remaining > 0 &&
      paid > 0 &&
      Boolean(method);
    savePaymentBtn.disabled = !valid;
  }

  async function savePayment() {
    const method = paymentMethodInput.value;
    if (!method) {
      showToast("Please select a payment method.");
      return;
    }
    if (method === "GCash" || method === "Bank Transfer") {
      syncOnlinePaymentAmount();
      startStaffXenditPayment();
      return;
    }
    const patientId =
      selectedPatientId || patientNameInput.dataset.patientId || "";
    const patient = findPatientById(patientId);
    if (!patientId) {
      showToast("Please select a registered patient.");
      return;
    }
    if (!patient) {
      showToast("Patient ID was not found.");
      return;
    }
    const service = serviceNameInput.value.trim();
    if (!service) {
      showToast("Please select a service.");
      return;
    }
    const total = Math.max(Number(paymentTotalInput.value) || 0, 0);
    const discount = Math.min(
      Math.max(Number(paymentDiscountInput.value) || 0, 0),
      total,
    );
    const amountReceived = Math.max(Number(paymentPaidInput.value) || 0, 0);
    const remainingBeforePayment = currentTransaction
      ? Number(currentTransaction.balance) || 0
      : Math.max(total - discount, 0);
    if (amountReceived <= 0) {
      showToast("Please enter the amount received.");
      return;
    }
    if (remainingBeforePayment <= 0) {
      showToast("This payment is already fully paid.");
      return;
    }
    // Anything above the amount due is change, not payment.
    const amountPaid =
      Math.round(Math.min(amountReceived, remainingBeforePayment) * 100) / 100;
    try {
      let transactionUid = currentTransaction?.transactionUid || "";
      if (!currentTransaction) {
        const discountPayload = getDiscountPayload();
        const createResponse = await fetch(TRANSACTIONS_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({
            patientId,
            appointmentId: pendingAppointmentPayment?.appointmentId || null,
            service,
            totalAmount: total,
            discountType: discountPayload.discountType,
            discountRate: discountPayload.discountRate,
            discountAmount: discountPayload.discountAmount,
          }),
        });
        const createResult = await createResponse.json();
        if (!createResponse.ok || !createResult.success) {
          throw new Error(
            createResult.message || "Unable to create transaction.",
          );
        }
        const created = Array.isArray(createResult.data)
          ? createResult.data[0]
          : createResult.data || createResult.transaction || createResult;
        if (!created || typeof created !== "object") {
          throw new Error("Unable to read the created finance transaction.");
        }
        currentTransaction = normalizeDatabaseTransaction(created);
        transactionUid =
          currentTransaction.transactionUid || currentTransaction.id || "";
      }
      if (!transactionUid) {
        throw new Error("Finance transaction was not found.");
      }
      const paymentResponse = await fetch(TRANSACTIONS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          action: "record_payment",
          transactionUid,
          patientId,
          amount: amountPaid,
          paymentMethod: method,
          date: paymentDateInput.value,
        }),
      });
      const paymentResult = await paymentResponse.json();
      if (!paymentResponse.ok || !paymentResult.success) {
        throw new Error(paymentResult.message || "Unable to save payment.");
      }
      closePaymentModal();
      await loadTransactions();
      showToast("Payment saved successfully.");
    } catch (error) {
      showToast(error.message || "Unable to save payment.");
    }
  }

  function exportTransactionsToCsv() {
    const filteredTransactions = getFilteredTransactions();
    if (!filteredTransactions.length) {
      showToast("No transactions available to export.");
      return;
    }
    const headers = [
      "Transaction ID",
      "Patient ID",
      "Patient Name",
      "Service",
      "Date",
      "Total Amount",
      "Discount Type",
      "Discount Rate (%)",
      "Discount",
      "Net Amount",
      "Paid",
      "Balance",
      "Payment Method",
      "Status",
      "Payment Count",
      "Xendit Payment ID",
      "Xendit Status",
    ];
    const escapeCsvValue = function (value) {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = filteredTransactions.map(function (item) {
      const transaction = normalizeTransaction(item);
      const netAmount = Math.max(
        Number(transaction.total || 0) - Number(transaction.discount || 0),
        0,
      );
      const latestPayment =
        Array.isArray(transaction.paymentHistory) &&
        transaction.paymentHistory.length
          ? transaction.paymentHistory[transaction.paymentHistory.length - 1]
          : null;
      return [
        transaction.id,
        transaction.patientId,
        transaction.patientName,
        transaction.service,
        transaction.date,
        transaction.total,
        getDiscountLabel(transaction.discountType),
        transaction.discountRate,
        transaction.discount,
        netAmount,
        transaction.paid,
        transaction.balance,
        latestPayment?.paymentMethod || transaction.paymentMethod || "-",
        transaction.status,
        transaction.paymentHistory.length,
        latestPayment?.xenditPaymentId || transaction.xenditPaymentId || "",
        latestPayment?.xenditStatus || transaction.xenditStatus || "",
      ]
        .map(escapeCsvValue)
        .join(",");
    });
    const csv = [headers.map(escapeCsvValue).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `denta-nueva-finance-${getTodayString()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(
      `${filteredTransactions.length} transaction${filteredTransactions.length === 1 ? "" : "s"} exported successfully.`,
    );
  }

  function setupEvents() {
    recordPaymentBtn.addEventListener("click", function () {
      currentTransaction = null;
      pendingAppointmentPayment = null;
      openPaymentModal();
    });
    exportCsvBtn?.addEventListener("click", exportTransactionsToCsv);
    closeModalBtn.addEventListener("click", closePaymentModal);
    cancelPaymentBtn.addEventListener("click", closePaymentModal);

    // Step navigation
    nextPaymentStepBtn.addEventListener("click", goToPaymentStep2);
    backPaymentStepBtn.addEventListener("click", goToPaymentStep1);

    paymentForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (currentStep === 1) {
        goToPaymentStep2();
        return;
      }
      savePayment();
    });

    // Step 1: discount
    discountTypeInput.addEventListener("change", handleDiscountTypeChange);
    discountRateInput.addEventListener("input", updateDiscountCalculation);
    discountRateInput.addEventListener("blur", normalizeDiscountRateInput);
    paymentTotalInput.addEventListener("input", function () {
      paymentProcessConfirmed = false;
      updateDiscountCalculation();
    });

    // Step 2: payment
    paymentPaidInput.addEventListener("input", function () {
      paymentProcessConfirmed = false;
      updatePaymentCalculation();
      updatePaymentProcessAmounts();
    });
    paymentMethodInput.addEventListener("change", function () {
      paymentProcessConfirmed = false;
      renderPaymentProcessSection();
    });
    patientNameInput.addEventListener("input", function () {
      selectedPatientId = "";
      patientNameInput.dataset.patientId = "";
      paymentProcessConfirmed = false;
      renderPatientDropdown(patientNameInput.value);
      openPatientDropdown();
      updateSaveButton();
    });
    patientNameInput.addEventListener("focus", function () {
      openPatientDropdown();
    });
    serviceNameInput.addEventListener("input", function () {
      paymentProcessConfirmed = false;
      renderServiceDropdown(serviceNameInput.value);
      openServiceDropdown();
      updateSaveButton();
    });
    serviceNameInput.addEventListener("focus", function () {
      openServiceDropdown();
    });
    searchInput.addEventListener("input", function () {
      currentPage = 1;
      renderTransactions();
    });
    paymentMethodFilter.addEventListener("change", function () {
      currentPage = 1;
      renderTransactions();
    });
    statusFilter.addEventListener("change", function () {
      currentPage = 1;
      renderTransactions();
    });
    prevPageBtn.addEventListener("click", function () {
      if (currentPage > 1) {
        currentPage--;
        renderTransactions();
      }
    });
    nextPageBtn.addEventListener("click", function () {
      const totalPages = Math.max(
        Math.ceil(getFilteredTransactions().length / PAGE_SIZE),
        1,
      );
      if (currentPage < totalPages) {
        currentPage++;
        renderTransactions();
      }
    });
    openCollectionDrawerBtn.addEventListener("click", function () {
      collectionDrawer.classList.add("active");
      collectionDrawerOverlay.classList.add("active");
    });
    closeCollectionDrawerBtn.addEventListener("click", closeCollectionDrawer);
    collectionDrawerOverlay.addEventListener("click", closeCollectionDrawer);
    showTodayCollectionBtn.addEventListener("click", showTodayCollection);
    showMonthlyCollectionBtn.addEventListener("click", showMonthlyCollection);
    showCustomCollectionBtnToday?.addEventListener(
      "click",
      showCustomCollection,
    );
    showCustomCollectionBtnMonthly?.addEventListener(
      "click",
      showCustomCollection,
    );
    backToTodayFromCustomBtn?.addEventListener("click", showTodayCollection);
    backToMonthlyFromCustomBtn?.addEventListener(
      "click",
      showMonthlyCollection,
    );
    applyCustomRangeBtn?.addEventListener("click", applyCustomCollection);
    closeDetailsBtn?.addEventListener("click", closeDetails);
    detailsCloseButton?.addEventListener("click", closeDetails);
    printReceiptBtn?.addEventListener("click", printReceipt);
    paymentModal.addEventListener("click", function (event) {
      if (event.target === paymentModal) {
        closePaymentModal();
      }
    });
    detailsModal.addEventListener("click", function (event) {
      if (event.target === detailsModal) {
        closeDetails();
      }
    });
    document.addEventListener("mousedown", function (event) {
      if (
        patientSelectWrapper &&
        !patientSelectWrapper.contains(event.target)
      ) {
        closePatientDropdown();
      }
      if (
        serviceSelectWrapper &&
        !serviceSelectWrapper.contains(event.target)
      ) {
        closeServiceDropdown();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closePaymentModal();
        closeDetails();
        closeCollectionDrawer();
      }
    });
  }

  function closeCollectionDrawer() {
    collectionDrawer.classList.remove("active");
    collectionDrawerOverlay.classList.remove("active");
  }

  function showTodayCollection() {
    todayCollectionPage.classList.add("active");
    monthlyCollectionPage.classList.remove("active");
    customCollectionPage.classList.remove("active");
  }

  function showMonthlyCollection() {
    todayCollectionPage.classList.remove("active");
    monthlyCollectionPage.classList.add("active");
    customCollectionPage.classList.remove("active");
  }

  function showCustomCollection() {
    todayCollectionPage.classList.remove("active");
    monthlyCollectionPage.classList.remove("active");
    customCollectionPage.classList.add("active");
  }

  function applyCustomCollection() {
    const from = customDateFrom.value;
    const to = customDateTo.value;
    if (!from || !to) {
      showToast("Please select both dates.");
      return;
    }
    if (from > to) {
      showToast("The From date must be before the To date.");
      return;
    }
    const totals = calculateCollectionTotals(from, to);
    setText("customCashAmount", formatCurrency(totals.Cash.amount));
    setText("customGcashAmount", formatCurrency(totals.GCash.amount));
    setText("customBankAmount", formatCurrency(totals["Bank Transfer"].amount));
    setText("customCashCount", transactionText(totals.Cash.count));
    setText("customGcashCount", transactionText(totals.GCash.count));
    setText("customBankCount", transactionText(totals["Bank Transfer"].count));
    setText("customPaymentMethodTotal", formatCurrency(totals.total));
    if (customCollectionDescription) {
      customCollectionDescription.textContent = `Payment collection from ${formatDate(from)} to ${formatDate(to)}.`;
    }
  }

  function setupDate() {
    const today = getTodayString();
    paymentDateInput.value = today;
    if (customDateFrom) {
      customDateFrom.value = today;
    }
    if (customDateTo) {
      customDateTo.value = today;
    }
    if (customDateFrom && customDateTo) {
      customDateFrom.max = today;
      customDateTo.max = today;
    }
    if (todayCollectionDescription) {
      todayCollectionDescription.textContent = `Payment collection for ${formatDate(today)}.`;
    }
    if (monthlyCollectionDescription) {
      monthlyCollectionDescription.textContent =
        "Payment collection for the current month.";
    }
    if (customCollectionDescription) {
      customCollectionDescription.textContent =
        "Select a date range to view payment collection.";
    }
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function transactionText(count) {
    return `${count} transaction${count === 1 ? "" : "s"}`;
  }

  function showToast(message) {
    let toast = document.getElementById("financeToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "financeToast";
      toast.className = "finance-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2600);
  }

  function renderCollectionsSummary() {
    const totals = getCollectionTotals(getTodayKey(), getTodayKey());
    setText("overviewTodayCollection", formatCurrency(totals.total));
    setText(
      "overviewTodayTransactions",
      totals.Cash.count + totals.GCash.count + totals["Bank Transfer"].count,
    );
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const from = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}-01`;
    const to = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
    const monthly = getCollectionTotals(from, to);
    setText("overviewMonthlyCollection", formatCurrency(monthly.total));
    const outstanding = transactions.reduce(function (sum, transaction) {
      return sum + getTransactionBalance(transaction);
    }, 0);
    setText("overviewOutstandingBalance", formatCurrency(outstanding));
  }

  function getPaymentDetails(transactionId) {
    const transaction = transactions.find(function (item) {
      return String(item.id) === String(transactionId);
    });
    if (!transaction) {
      return null;
    }
    const normalized = normalizeTransaction(transaction);
    if (
      (!Array.isArray(normalized.paymentHistory) ||
        normalized.paymentHistory.length === 0) &&
      Number(normalized.paid) > 0
    ) {
      normalized.paymentHistory = [
        {
          id: generatePaymentId(),
          amount: Number(normalized.paid) || 0,
          paymentMethod: normalized.paymentMethod || "Cash",
          date: normalized.date || getTodayString(),
          xenditPaymentId: normalized.xenditPaymentId || "",
          xenditStatus: normalized.xenditStatus || "",
        },
      ];
    }
    normalized.paid = normalized.paymentHistory.reduce(function (sum, payment) {
      if (!isSuccessfulPayment(payment)) {
        return sum;
      }
      return sum + (Number(payment.amount) || 0);
    }, 0);
    normalized.balance = Math.max(
      Number(normalized.total || 0) -
        Number(normalized.discount || 0) -
        normalized.paid,
      0,
    );
    normalized.status = getStatus(normalized.paid, normalized.balance);
    normalized.paymentMethod = getLatestPaymentMethod(normalized);
    return normalized;
  }

  function openDetails(transactionId) {
    const transaction = getPaymentDetails(transactionId);
    if (!transaction) {
      return;
    }
    detailsModal.dataset.transactionId = transaction.id;
    const detailTransactionId = document.getElementById("detailTransactionId");
    const detailPatient = document.getElementById("detailPatient");
    const detailPatientId = document.getElementById("detailPatientId");
    const detailService = document.getElementById("detailService");
    const detailDate = document.getElementById("detailDate");
    const detailTotal = document.getElementById("detailTotal");
    const detailDiscount = document.getElementById("detailDiscount");
    const detailPaid = document.getElementById("detailPaid");
    const detailBalance = document.getElementById("detailBalance");
    const detailStatus = document.getElementById("detailStatus");
    const detailMethod = document.getElementById("detailMethod");
    if (detailTransactionId) {
      detailTransactionId.textContent = transaction.id || "-";
    }
    if (detailPatient) {
      detailPatient.textContent = transaction.patientName || "-";
    }
    if (detailPatientId) {
      detailPatientId.textContent = transaction.patientId || "-";
    }
    if (detailService) {
      detailService.textContent = transaction.service || "-";
    }
    if (detailDate) {
      detailDate.textContent = formatDate(transaction.date);
    }
    if (detailTotal) {
      detailTotal.textContent = formatCurrency(transaction.total);
    }
    if (detailDiscount) {
      const hasType =
        transaction.discountType && transaction.discountType !== "none";
      detailDiscount.textContent = hasType
        ? `${formatCurrency(transaction.discount)} (${getDiscountLabel(transaction.discountType)}${transaction.discountRate > 0 ? ` ${transaction.discountRate}%` : ""})`
        : formatCurrency(transaction.discount);
    }
    if (detailPaid) {
      detailPaid.textContent = formatCurrency(transaction.paid);
    }
    if (detailBalance) {
      detailBalance.textContent = formatCurrency(transaction.balance);
    }
    if (detailStatus) {
      detailStatus.textContent = transaction.status;
    }
    if (detailMethod) {
      detailMethod.textContent = transaction.paymentMethod || "-";
    }
    const paymentHistoryList = document.getElementById("paymentHistoryList");
    const paymentHistoryCount = document.getElementById("paymentHistoryCount");
    const history = Array.isArray(transaction.paymentHistory)
      ? transaction.paymentHistory.filter(function (payment) {
          return Number(payment.amount) > 0;
        })
      : [];
    if (paymentHistoryCount) {
      paymentHistoryCount.textContent = `${history.length} payment${history.length === 1 ? "" : "s"}`;
    }
    if (paymentHistoryList) {
      paymentHistoryList.innerHTML = history.length
        ? history
            .slice()
            .reverse()
            .map(function (payment, index) {
              const icon =
                payment.paymentMethod === "GCash"
                  ? "smartphone"
                  : payment.paymentMethod === "Bank Transfer"
                    ? "building-2"
                    : "banknote";
              const paymentNumber = history.length - index;
              return `<div class="payment-history-item"><div class="payment-history-item-left"><div class="payment-history-method-icon"><i data-lucide="${icon}"></i></div><div class="payment-history-item-info"><strong>${escapeHtml(payment.paymentMethod || "Cash")}</strong><span>${escapeHtml(formatDate(payment.date))}${payment.time ? ` · ${escapeHtml(payment.time)}` : ""}</span></div></div><div class="payment-history-item-right"><strong>${escapeHtml(formatCurrency(payment.amount))}</strong><span>Payment ${paymentNumber}</span></div></div>`;
            })
            .join("")
        : `<div class="payment-history-empty"><div class="payment-history-empty-icon"><i data-lucide="history"></i></div><strong>No payment history</strong><p>Additional payments will appear here.</p></div>`;
    }
    detailsModal.classList.add("active");
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function closeDetails() {
    detailsModal.classList.remove("active");
  }

  function printReceipt() {
    const transactionId = detailsModal?.dataset.transactionId || "";
    const transaction = getPaymentDetails(transactionId);
    if (!transaction) {
      alert("Unable to find the selected transaction.");
      return;
    }
    window.openPaymentReceipt(transaction);
  }

  tableBody.addEventListener("click", function (event) {
    const viewButton = event.target.closest(".view-details-btn");
    const paymentButton = event.target.closest(".record-payment-btn");
    if (viewButton) {
      openDetails(viewButton.dataset.transactionId);
      return;
    }
    if (paymentButton) {
      const transactionId = paymentButton.dataset.transactionId;
      const transaction = transactions.find(function (item) {
        return String(item.id) === String(transactionId);
      });
      if (transaction) {
        pendingAppointmentPayment = null;
        openPaymentModal(transaction);
      }
    }
  });
});
