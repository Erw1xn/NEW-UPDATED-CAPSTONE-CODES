const FINANCE_TRANSACTIONS_API = "../../api/finance/transactions.php";
const XENDIT_CREATE_PAYMENT_API = "../../api/xendit/create_payment.php";
let CURRENT_PATIENT_ID = "";
let CURRENT_PATIENT_NAME = "";
let CURRENT_PATIENT = null;
let payments = [];
let currentFilter = "all";
let currentPayTransaction = null;
let xenditPaymentState = { status: "idle", paymentId: "", action: null };
document.addEventListener("DOMContentLoaded", async function () {
  await resolveCurrentPatient();
  await syncPaymentsFromFinance();
  bindPaymentEvents();
  renderSummary();
  renderPaymentHistory();
});
window.addEventListener("focus", async function () {
  await resolveCurrentPatient();
  await syncPaymentsFromFinance();
  renderSummary();
  renderPaymentHistory();
});
async function resolveCurrentPatient() {
  CURRENT_PATIENT_ID = "";
  CURRENT_PATIENT_NAME = "";
  CURRENT_PATIENT = null;
  try {
    const response = await fetch("../../api/patient_records.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load patient record.");
    }
    const data = result.data;
    const patient = Array.isArray(data) ? data[0] : data;
    if (!patient || typeof patient !== "object") {
      throw new Error("Patient record was not found.");
    }
    CURRENT_PATIENT = patient;
    CURRENT_PATIENT_ID = String(
      patient.patientId || patient.patient_id || patient.id || "",
    ).trim();
    CURRENT_PATIENT_NAME = String(
      patient.name ||
        `${patient.firstName || ""} ${patient.lastName || ""}`.trim() ||
        "Patient",
    ).trim();
    if (!CURRENT_PATIENT_ID) {
      throw new Error("Patient ID was not found.");
    }
  } catch (error) {
    console.error("Unable to resolve current patient:", error);
    showPaymentMessage("Unable to load your patient record.");
  }
}
async function loadPatientTransactions() {
  if (!CURRENT_PATIENT_ID) return null;
  try {
    const response = await fetch(
      `${FINANCE_TRANSACTIONS_API}?patient_id=${encodeURIComponent(CURRENT_PATIENT_ID)}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      },
    );
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load finance transactions.");
    }
    return Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    console.error("Unable to load patient transactions:", error);
    showPaymentMessage("Unable to load your payment records.");
    return null;
  }
}
async function syncPaymentsFromFinance() {
  const transactions = await loadPatientTransactions();
  if (!Array.isArray(transactions)) return false;
  const nextPayments = [];
  transactions.forEach(function (transaction) {
    nextPayments.push(...normalizeDatabaseTransaction(transaction));
  });
  nextPayments.sort(function (a, b) {
    const dateA = new Date(a.date || "");
    const dateB = new Date(b.date || "");
    return dateB - dateA;
  });
  payments = nextPayments;
  return true;
}
function normalizeDatabaseTransaction(transaction) {
  const total = Number(transaction.total_amount) || 0;
  const discount = Number(transaction.discount_amount) || 0;
  const paid = Number(transaction.paid_amount) || 0;
  const patientName = String(
    transaction.patient_name || CURRENT_PATIENT_NAME || "Patient",
  ).trim();
  const transactionId = transaction.transaction_uid || "";
  const paymentHistory = Array.isArray(transaction.paymentHistory)
    ? transaction.paymentHistory
    : Array.isArray(transaction.payment_history)
      ? transaction.payment_history
      : [];
  const records = paymentHistory.length
    ? paymentHistory
    : [
        {
          payment_uid: transactionId,
          amount: paid,
          payment_method: transaction.payment_method || "-",
          status: paid > 0 ? "paid" : transaction.status || "unpaid",
          paid_at: transaction.created_at,
          isPlaceholder: true,
        },
      ];
  return records.map(function (payment, index) {
    const paymentId =
      payment.payment_uid ||
      payment.payment_id ||
      payment.id ||
      `${transactionId || "PAY"}-${index + 1}`;
    return normalizePayment({
      id: String(paymentId),
      patientId:
        payment.patient_id || transaction.patient_id || CURRENT_PATIENT_ID,
      patientName,
      transactionId,
      appointmentId: transaction.appointment_id || "",
      date:
        payment.paid_at ||
        payment.created_at ||
        payment.date ||
        transaction.created_at ||
        new Date().toISOString(),
      service: transaction.service_name || "Dental Service",
      amount: Number(payment.amount) || 0,
      totalCharge: total,
      discount,
      paymentMethod: normalizePaymentMethod(
        payment.payment_method || payment.paymentMethod || "-",
      ),
      status: payment.status || payment.payment_status || "pending",
      reference: String(payment.payment_uid || payment.payment_id || paymentId),
      createdTime: "",
      createdAt: payment.created_at || transaction.created_at || "",
      cashReceived: 0,
      change: 0,
      gcashReference: "",
      bankReference: "",
      xenditPaymentId:
        payment.xendit_payment_id || payment.xendit_payment_request_id || "",
      xenditStatus: payment.xendit_status || "",
      isPlaceholder: Boolean(payment.isPlaceholder),
    });
  });
}
function normalizePaymentMethod(method) {
  const value = String(method || "")
    .trim()
    .toLowerCase();
  if (value === "gcash") return "GCash";
  if (value === "bank_transfer" || value === "bank transfer")
    return "Bank Transfer";
  return method || "-";
}
function normalizePayment(payment) {
  return {
    id: payment.id || `PAY-${Date.now()}`,
    patientId: payment.patientId || CURRENT_PATIENT_ID,
    patientName: payment.patientName || CURRENT_PATIENT_NAME || "Patient",
    transactionId: payment.transactionId || "",
    appointmentId: payment.appointmentId || "",
    date: payment.date || new Date().toISOString(),
    service: payment.service || "Dental Service",
    amount: Number(payment.amount) || 0,
    totalCharge: Number(payment.totalCharge) || 0,
    discount: Number(payment.discount) || 0,
    paymentMethod: payment.paymentMethod || "Unpaid",
    status: normalizeStatus(payment.status),
    reference: payment.reference || "N/A",
    createdTime: payment.createdTime || "",
    createdAt: payment.createdAt || "",
    cashReceived: Number(payment.cashReceived) || 0,
    change: Number(payment.change) || 0,
    gcashReference: payment.gcashReference || "",
    bankReference: payment.bankReference || "",
    xenditPaymentId: payment.xenditPaymentId || "",
    xenditStatus: payment.xenditStatus || "",
    isPlaceholder: Boolean(payment.isPlaceholder),
  };
}
function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["paid", "completed", "succeeded", "success"].includes(value))
    return "paid";
  if (value === "partial" || value === "partially_paid") return "partial";
  return "pending";
}
function savePayments() {}
function bindPaymentEvents() {
  document.querySelectorAll(".payment-filter").forEach(function (button) {
    button.addEventListener("click", async function () {
      document.querySelectorAll(".payment-filter").forEach(function (item) {
        item.classList.remove("active");
      });
      button.classList.add("active");
      currentFilter = button.dataset.filter || "all";
      await resolveCurrentPatient();
      await syncPaymentsFromFinance();
      renderPaymentHistory();
    });
  });
  const tableBody = document.getElementById("paymentTableBody");
  if (tableBody) {
    tableBody.addEventListener("click", function (event) {
      const viewButton = event.target.closest(".view-payment-btn");
      const payButton = event.target.closest(".pay-payment-btn");
      if (viewButton) {
        openTransactionDetails(viewButton.dataset.transactionId);
        return;
      }
      if (payButton) openPayModalByTransaction(payButton.dataset.transactionId);
    });
  }
  const mobileList = document.getElementById("paymentMobileList");
  if (mobileList) {
    mobileList.addEventListener("click", function (event) {
      const viewButton = event.target.closest(".view-payment-btn");
      const payButton = event.target.closest(".pay-payment-btn");
      if (viewButton) {
        openTransactionDetails(viewButton.dataset.transactionId);
        return;
      }
      if (payButton) openPayModalByTransaction(payButton.dataset.transactionId);
    });
  }
  const closeButton = document.getElementById("paymentModalClose");
  const overlay = document.getElementById("paymentModalOverlay");
  const payClose = document.getElementById("patientPayClose");
  const payOverlay = document.getElementById("patientPayOverlay");
  const payCancel = document.getElementById("patientPayCancel");
  const payMethod = document.getElementById("patientPayMethod");
  const payMethodOptions = document.querySelectorAll(
    ".patient-payment-method-option",
  );
  const payAmount = document.getElementById("patientPayAmount");
  const payForm = document.getElementById("patientPayForm");
  if (closeButton) closeButton.addEventListener("click", closePaymentModal);
  if (overlay) overlay.addEventListener("click", closePaymentModal);
  if (payClose) payClose.addEventListener("click", closePatientPayModal);
  if (payOverlay) payOverlay.addEventListener("click", closePatientPayModal);
  if (payCancel) payCancel.addEventListener("click", closePatientPayModal);
  if (payMethod) {
    payMethod.addEventListener("change", function () {
      syncPatientPaymentMethodOptions();
      renderPatientPaymentProcess();
      updatePatientPaySubmitState();
    });
  }
  payMethodOptions.forEach(function (option) {
    option.addEventListener("click", function () {
      if (!payMethod) return;
      payMethod.value = option.dataset.paymentMethod || "";
      payMethod.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  if (payAmount) {
    payAmount.addEventListener("input", function () {
      const remaining = getCurrentPayRemainingBalance();
      const value = Number(payAmount.value) || 0;
      if (value > remaining) payAmount.value = remaining.toFixed(2);
      renderPatientPaymentProcess();
      updatePatientPaySubmitState();
    });
  }
  if (payForm) {
    payForm.addEventListener("submit", function (event) {
      event.preventDefault();
      submitPatientPayment();
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closePaymentModal();
      closePatientPayModal();
    }
  });
}
async function renderPayments() {
  await resolveCurrentPatient();
  await syncPaymentsFromFinance();
  renderSummary();
  renderPaymentHistory();
}
function getTransactionGroups() {
  const groups = {};
  payments.forEach(function (payment) {
    const id = payment.transactionId;
    if (!id) return;
    if (!groups[id]) {
      groups[id] = {
        transactionId: id,
        appointmentId: payment.appointmentId || "",
        patientId: payment.patientId || CURRENT_PATIENT_ID,
        patientName: payment.patientName || CURRENT_PATIENT_NAME || "Patient",
        service: payment.service,
        totalCharge: Number(payment.totalCharge) || 0,
        discount: Number(payment.discount) || 0,
        payments: [],
      };
    }
    groups[id].payments.push(payment);
    groups[id].totalCharge = Math.max(
      groups[id].totalCharge,
      Number(payment.totalCharge) || 0,
    );
    groups[id].discount = Math.max(
      groups[id].discount,
      Number(payment.discount) || 0,
    );
    if (!groups[id].patientName || groups[id].patientName === "Patient") {
      groups[id].patientName =
        payment.patientName || CURRENT_PATIENT_NAME || "Patient";
    }
  });
  Object.values(groups).forEach(function (group) {
    group.amountPaid = group.payments.reduce(function (total, payment) {
      return ["paid", "partial"].includes(payment.status)
        ? total + (Number(payment.amount) || 0)
        : total;
    }, 0);
    group.balance = Math.max(
      group.totalCharge - group.discount - group.amountPaid,
      0,
    );
    group.payments.sort(function (a, b) {
      return new Date(b.date || "") - new Date(a.date || "");
    });
  });
  return groups;
}
function getTransactionGroup(transactionId) {
  return getTransactionGroups()[transactionId] || null;
}
function renderSummary() {
  const groups = getTransactionGroups();
  const totalPaid = Object.values(groups).reduce(function (total, group) {
    return total + (Number(group.amountPaid) || 0);
  }, 0);
  const balance = Object.values(groups).reduce(function (total, group) {
    return total + (Number(group.balance) || 0);
  }, 0);
  const transactionCount = Object.keys(groups).length;
  setText("totalPaid", formatCurrency(totalPaid));
  setText("paymentCount", transactionCount);
  setText("currentBalance", formatCurrency(balance));
  const balanceStatus = document.getElementById("balanceStatus");
  if (balanceStatus) {
    balanceStatus.textContent =
      balance > 0
        ? formatCurrency(balance) + " remaining"
        : "No outstanding balance";
  }
}
function renderPaymentHistory() {
  const tableBody = document.getElementById("paymentTableBody");
  const mobileList = document.getElementById("paymentMobileList");
  const emptyState = document.getElementById("paymentEmptyState");
  const count = document.getElementById("transactionCount");
  const filtered = getFilteredPayments();
  if (count)
    count.textContent =
      filtered.length +
      (filtered.length === 1 ? " transaction" : " transactions");
  if (filtered.length === 0) {
    if (tableBody) tableBody.innerHTML = "";
    if (mobileList) mobileList.innerHTML = "";
    if (emptyState) emptyState.hidden = false;
    return;
  }
  if (emptyState) emptyState.hidden = true;
  if (tableBody) tableBody.innerHTML = filtered.map(createDesktopRow).join("");
  if (mobileList)
    mobileList.innerHTML = filtered.map(createMobileItem).join("");
}
function getFilteredPayments() {
  const transactions = Object.values(getTransactionGroups()).map(
    function (group) {
      const latestPayment = group.payments[0] || {};
      return {
        ...group,
        latestPayment,
        date: latestPayment.date || "",
        service: latestPayment.service || group.service,
        paymentMethod:
          [
            ...new Set(
              group.payments
                .map(function (payment) {
                  return payment.paymentMethod;
                })
                .filter(Boolean),
            ),
          ].join(" + ") || "-",
        status: getTransactionStatus(group).label.toLowerCase(),
      };
    },
  );
  const sorted = transactions.sort(function (a, b) {
    return new Date(b.date || "") - new Date(a.date || "");
  });
  if (currentFilter === "all") return sorted;
  return sorted.filter(function (transaction) {
    return transaction.status === currentFilter;
  });
}
function getPaymentBalance(payment) {
  const group = getTransactionGroup(payment.transactionId);
  if (!group) {
    return Math.max(
      Number(payment.totalCharge || 0) -
        Number(payment.discount || 0) -
        Number(payment.amount || 0),
      0,
    );
  }
  const transactionTotal = Math.max(
    (Number(group.totalCharge) || 0) - (Number(group.discount) || 0),
    0,
  );
  return Math.max(transactionTotal - (Number(group.amountPaid) || 0), 0);
}
function getPaymentRecordStatus(payment, balance, transactionPaid) {
  if (payment.status === "pending") return getStatusData("pending");
  if (balance <= 0) return getStatusData("paid");
  if (transactionPaid > 0) return getStatusData("partial");
  return getStatusData("pending");
}
function getTransactionStatus(transaction) {
  if (transaction.balance <= 0) return getStatusData("paid");
  if (transaction.amountPaid > 0) return getStatusData("partial");
  return getStatusData("pending");
}
function getPatientInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "NA";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function createDesktopRow(transaction) {
  const totalCharge = transaction.totalCharge;
  const discount = transaction.discount;
  const amountPaid = transaction.amountPaid;
  const balance = transaction.balance;
  const status = getTransactionStatus(transaction);
  const patientName =
    transaction.patientName || CURRENT_PATIENT_NAME || "Patient";
  return `<tr><td><div class="transaction-patient"><div class="transaction-avatar">${escapeHtml(getPatientInitials(patientName))}</div><div class="transaction-patient-info"><span class="transaction-patient-name">${escapeHtml(patientName)}</span><span class="transaction-id">${escapeHtml(transaction.transactionId || "N/A")}</span></div></div></td><td><span class="service-name">${escapeHtml(transaction.service)}</span></td><td>${formatDate(transaction.date)}</td><td><span class="payment-amount">${formatCurrency(totalCharge)}</span></td><td><span class="payment-discount">${formatCurrency(discount)}</span></td><td><span class="payment-amount">${formatCurrency(amountPaid)}</span></td><td><span class="payment-method"><i class="${getPaymentMethodIcon(transaction.paymentMethod)}"></i>${escapeHtml(transaction.paymentMethod)}</span></td><td><span class="payment-balance">${formatCurrency(balance)}</span></td><td><span class="payment-status-badge ${status.className}">${status.label}</span></td><td><div class="payment-action-group"><button type="button" class="view-payment-btn" data-transaction-id="${escapeAttribute(transaction.transactionId)}" title="View transaction and payment history"><i class="fa-regular fa-eye"></i></button>${balance > 0 ? `<button type="button" class="pay-payment-btn" data-transaction-id="${escapeAttribute(transaction.transactionId)}" title="Pay remaining balance"><i class="fa-solid fa-plus"></i></button>` : ""}</div></td></tr>`;
}
function createMobileItem(transaction) {
  const totalCharge = transaction.totalCharge;
  const discount = transaction.discount;
  const amountPaid = transaction.amountPaid;
  const balance = transaction.balance;
  const status = getTransactionStatus(transaction);
  const patientName =
    transaction.patientName || CURRENT_PATIENT_NAME || "Patient";
  return `<article class="mobile-payment-item"><div class="mobile-payment-top"><div><div class="mobile-payment-id">${escapeHtml(transaction.transactionId || "N/A")}</div><div class="mobile-payment-patient">${escapeHtml(patientName)}</div><div class="mobile-payment-date">${formatDate(transaction.date)}</div></div><span class="payment-status-badge ${status.className}">${status.label}</span></div><div class="mobile-payment-service">${escapeHtml(transaction.service)}</div><div class="mobile-payment-details"><div class="mobile-payment-detail"><span>Total</span><strong>${formatCurrency(totalCharge)}</strong></div><div class="mobile-payment-detail"><span>Discount</span><strong>${formatCurrency(discount)}</strong></div><div class="mobile-payment-detail"><span>Paid</span><strong>${formatCurrency(amountPaid)}</strong></div><div class="mobile-payment-detail"><span>Balance</span><strong>${formatCurrency(balance)}</strong></div><div class="mobile-payment-detail"><span>Payment Method</span><strong>${escapeHtml(transaction.paymentMethod)}</strong></div></div><div class="mobile-payment-bottom"><span class="transaction-reference">${
    transaction.payments.filter(function (payment) {
      return !payment.isPlaceholder;
    }).length
  } payment${
    transaction.payments.filter(function (payment) {
      return !payment.isPlaceholder;
    }).length === 1
      ? ""
      : "s"
  }</span><div class="mobile-payment-actions"><button type="button" class="view-payment-btn" data-transaction-id="${escapeAttribute(transaction.transactionId)}" title="View transaction and payment history"><i class="fa-regular fa-eye"></i></button>${balance > 0 ? `<button type="button" class="pay-payment-btn" data-transaction-id="${escapeAttribute(transaction.transactionId)}" title="Pay remaining balance"><i class="fa-solid fa-plus"></i></button>` : ""}</div></div></article>`;
}
function openTransactionDetails(transactionId) {
  const transaction = getTransactionGroup(transactionId);
  if (transaction) openPaymentModal(transaction);
}
function openPaymentModal(transaction) {
  const modal = document.getElementById("paymentModal");
  const body = document.getElementById("paymentModalBody");
  if (!modal || !body) return;
  const status = getTransactionStatus(transaction);
  const methods = [
    ...new Set(
      transaction.payments
        .map(function (payment) {
          return payment.paymentMethod;
        })
        .filter(Boolean),
    ),
  ];
  const patientName =
    transaction.patientName || CURRENT_PATIENT_NAME || "Patient";
  const actualPayments = transaction.payments.filter(function (payment) {
    return !payment.isPlaceholder;
  });
  const paymentHistory = actualPayments.length
    ? actualPayments
        .map(function (payment, index) {
          const icon = getPaymentMethodIcon(payment.paymentMethod)
            .replace("fa-solid ", "")
            .replace("fa-regular ", "");
          return `<div class="payment-history-item"><div class="payment-history-item-left"><div class="payment-history-method-icon"><i class="fa-solid ${icon}"></i></div><div class="payment-history-item-info"><strong>${escapeHtml(payment.paymentMethod || "-")}</strong><span>${escapeHtml(formatPaymentHistoryDateTime(payment.date))}</span></div></div><div class="payment-history-item-right"><strong>${formatCurrency(payment.amount)}</strong><span>Payment ${actualPayments.length - index}</span></div></div>`;
        })
        .join("")
    : `<div class="payment-history-empty"><strong>No payment history</strong><p>Additional payments will appear here.</p></div>`;
  body.innerHTML = `<div class="modal-payment-id"><div><span>TRANSACTION ID</span><strong>${escapeHtml(transaction.transactionId || "N/A")}</strong></div><span class="payment-status-badge ${status.className}">${status.label}</span></div><div class="modal-section-label">Transaction Overview</div><div class="modal-detail-grid"><div class="modal-detail-item"><span>DATE</span><strong>${formatDate(transaction.payments?.[0]?.date || "")}</strong></div><div class="modal-detail-item"><span>PATIENT</span><strong>${escapeHtml(patientName)}</strong></div><div class="modal-detail-item"><span>SERVICE</span><strong>${escapeHtml(transaction.service || "Dental Service")}</strong></div><div class="modal-detail-item"><span>PAYMENT METHOD</span><strong>${escapeHtml(methods.join(" + ") || "-")}</strong></div></div><div class="modal-section-label">Amount Breakdown</div><div class="modal-detail-grid"><div class="modal-detail-item"><span>TOTAL CHARGE</span><strong>${formatCurrency(transaction.totalCharge)}</strong></div><div class="modal-detail-item"><span>DISCOUNT</span><strong>${formatCurrency(transaction.discount)}</strong></div><div class="modal-detail-item"><span>AMOUNT PAID</span><strong>${formatCurrency(transaction.amountPaid)}</strong></div><div class="modal-detail-item"><span>REMAINING BALANCE</span><strong>${formatCurrency(transaction.balance)}</strong></div></div><div class="payment-history-section"><div class="payment-history-header"><div><span>PAYMENT HISTORY</span><h3>Payment History</h3><p>View all payments recorded for this transaction.</p></div><div class="payment-history-count">${actualPayments.length} payment${actualPayments.length === 1 ? "" : "s"}</div></div><div class="payment-history-list">${paymentHistory}</div></div><div class="modal-receipt-action"><button type="button" class="modal-receipt-button" id="viewReceiptButton"><i class="fa-solid fa-receipt"></i>View Receipt</button></div>`;
  const viewReceiptButton = document.getElementById("viewReceiptButton");

  if (viewReceiptButton) {
    viewReceiptButton.addEventListener("click", function () {
      const receiptTransaction = {
        ...transaction,
        id: transaction.transactionId || "",
        transactionId: transaction.transactionId || "",
        patient: patientName,
        patientName: patientName,
        patientId: transaction.patientId || CURRENT_PATIENT_ID || "",
        service: transaction.service || "Dental Service",
        total: Number(transaction.totalCharge) || 0,
        totalCharge: Number(transaction.totalCharge) || 0,
        discount: Number(transaction.discount) || 0,
        paid: Number(transaction.amountPaid) || 0,
        amountPaid: Number(transaction.amountPaid) || 0,
        balance: Number(transaction.balance) || 0,
        paymentMethod: methods.join(" + ") || "-",
        status: status.label,
        date:
          transaction.date ||
          transaction.latestPayment?.date ||
          transaction.payments?.find(function (payment) {
            return payment.date;
          })?.date ||
          "",
        paymentHistory: transaction.payments || [],
      };
      openPaymentReceipt(receiptTransaction);
    });
  }
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}
function formatPaymentHistoryDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const dateLabel = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateLabel} · ${timeLabel}`;
}
async function openPayModalByTransaction(transactionId) {
  await syncPaymentsFromFinance();
  const group = getTransactionGroup(transactionId);
  if (!group || group.balance <= 0) return;
  currentPayTransaction = group;
  xenditPaymentState = { status: "idle", paymentId: "", action: null };
  setText("payService", group.service);
  setText("payTotal", formatCurrency(group.totalCharge));
  setText("payAlreadyPaid", formatCurrency(group.amountPaid));
  setText("payRemainingBalance", formatCurrency(group.balance));
  const amountInput = document.getElementById("patientPayAmount");
  const methodInput = document.getElementById("patientPayMethod");
  const processBox = document.getElementById("patientPayProcess");
  if (amountInput) {
    amountInput.value = group.balance.toFixed(2);
    amountInput.max = group.balance.toFixed(2);
    amountInput.disabled = false;
  }
  if (methodInput) methodInput.value = "";
  syncPatientPaymentMethodOptions();
  if (processBox) {
    processBox.hidden = true;
    processBox.innerHTML = "";
  }
  const hint = document.getElementById("patientPayAmountHint");
  if (hint)
    hint.textContent =
      "You may pay any amount up to " + formatCurrency(group.balance) + ".";
  updatePatientPaySubmitState();
  const modal = document.getElementById("patientPayModal");
  if (modal) {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
}
function syncPatientPaymentMethodOptions() {
  const selectedMethod =
    document.getElementById("patientPayMethod")?.value || "";
  document
    .querySelectorAll(".patient-payment-method-option")
    .forEach(function (option) {
      const isSelected = option.dataset.paymentMethod === selectedMethod;
      option.classList.toggle("is-selected", isSelected);
      option.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
}
function renderPatientPaymentProcess() {
  const wrapper = document.getElementById("patientPayProcess");
  const methodInput = document.getElementById("patientPayMethod");
  const amountInput = document.getElementById("patientPayAmount");
  if (!wrapper || !methodInput || !amountInput || !currentPayTransaction)
    return;
  const method = methodInput.value;
  const amount = Number(amountInput.value) || 0;
  if (!method || amount <= 0) {
    wrapper.hidden = true;
    wrapper.innerHTML = "";
    return;
  }
  wrapper.hidden = false;
  const methodDetails =
    method === "GCash"
      ? {
          icon: "fa-mobile-screen-button",
          className: "gcash",
          message:
            "Continue to GCash through Xendit to authorize this payment.",
        }
      : {
          icon: "fa-building-columns",
          className: "bank-transfer",
          message: "Continue to Xendit for secure bank transfer instructions.",
        };
  wrapper.innerHTML = `<div class="patient-payment-process-panel ${methodDetails.className}"><div class="patient-payment-process-heading"><span class="patient-payment-process-icon"><i class="fa-solid ${methodDetails.icon}"></i></span><div><strong>${escapeHtml(method)} Payment</strong><small>Secure online payment via Xendit</small></div></div><p class="patient-payment-process-message"><i class="fa-solid fa-lock"></i><span>${escapeHtml(methodDetails.message)} Your payment will be recorded after confirmation.</span></p></div>`;
}
function updatePatientPaySubmitState() {
  const submit = document.getElementById("patientPaySubmit");
  const amountInput = document.getElementById("patientPayAmount");
  const methodInput = document.getElementById("patientPayMethod");
  if (!submit || !amountInput || !methodInput) return;
  const amount = Number(amountInput.value) || 0;
  const remaining = getCurrentPayRemainingBalance();
  const validMethod = ["GCash", "Bank Transfer"].includes(methodInput.value);
  submit.disabled = !(
    currentPayTransaction &&
    amount > 0 &&
    amount <= remaining &&
    validMethod
  );
}
function getCurrentPayRemainingBalance() {
  return currentPayTransaction ? Number(currentPayTransaction.balance) || 0 : 0;
}
function renderXenditPendingState() {
  const processBox = document.getElementById("patientPayProcess");
  const submitButton = document.getElementById("patientPaySubmit");
  if (processBox) {
    processBox.hidden = false;
    processBox.innerHTML = `<div class="patient-payment-process-status processing"><div><i class="fa-solid fa-hourglass-half"></i><span>Your payment is being processed by Xendit. Your balance will update after the payment is confirmed.</span></div></div>`;
  }
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML =
      '<i class="fa-solid fa-hourglass-half"></i> Payment Pending';
  }
}
async function submitPatientPayment() {
  if (!currentPayTransaction) return;
  const amountInput = document.getElementById("patientPayAmount");
  const methodInput = document.getElementById("patientPayMethod");
  const submitButton = document.getElementById("patientPaySubmit");
  const amount = Number(amountInput?.value) || 0;
  const method = methodInput?.value || "";
  const remaining = Number(currentPayTransaction.balance) || 0;
  if (amount <= 0) {
    showPaymentMessage("Please enter a valid payment amount.");
    return;
  }
  if (amount > remaining) {
    showPaymentMessage("Payment amount cannot exceed the remaining balance.");
    return;
  }
  if (!["GCash", "Bank Transfer"].includes(method)) {
    showPaymentMessage("Please select GCash or Bank Transfer.");
    return;
  }
  if (!currentPayTransaction.transactionId) {
    showPaymentMessage("The Finance transaction could not be found.");
    return;
  }
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to Xendit...';
  }
  const processBox = document.getElementById("patientPayProcess");
  if (processBox) {
    processBox.hidden = false;
    processBox.innerHTML = `<div class="patient-payment-process-status processing"><div><i class="fa-solid fa-spinner fa-spin"></i><span>Preparing your ${escapeHtml(method)} payment securely through Xendit...</span></div></div>`;
  }
  try {
    const response = await fetch(XENDIT_CREATE_PAYMENT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        transactionUid: currentPayTransaction.transactionId || "",
        patientId: CURRENT_PATIENT_ID,
        patientName: currentPayTransaction.patientName || CURRENT_PATIENT_NAME,
        amount: amount,
        paymentMethod: method,
        currency: "PHP",
        returnUrl: window.location.href,
      }),
    });
    const result = await response.json().catch(function () {
      return {};
    });
    if (!response.ok || !result.success) {
      const xenditResponse = result.xendit_response || {};
      const failureCode =
        xenditResponse.failure_code ||
        xenditResponse.error_code ||
        xenditResponse.code ||
        "";
      const failureMessage =
        xenditResponse.message || xenditResponse.error_message || "";
      const detail = [failureCode, failureMessage].filter(Boolean).join(" - ");
      throw new Error(
        detail
          ? `${result.message || "Xendit payment could not be created."} ${detail}`
          : result.message || "Xendit payment could not be created.",
      );
    }
    xenditPaymentState = {
      status: result.status || "REQUIRES_ACTION",
      paymentId: result.payment_id || result.paymentId || "",
      action: Array.isArray(result.actions) ? result.actions[0] : null,
    };
    const action = xenditPaymentState.action;
    if (action && action.type === "REDIRECT_CUSTOMER" && action.value) {
      if (processBox) {
        processBox.innerHTML = `<div class="patient-payment-process-status success"><div><i class="fa-solid fa-circle-check"></i><span>Payment session created. Redirecting to secure Xendit checkout...</span></div></div>`;
      }
      setTimeout(function () {
        window.location.href = action.value;
      }, 250);
      return;
    }
    if (action && action.type === "PRESENT_TO_CUSTOMER") {
      renderXenditPendingState();
      renderXenditCustomerAction(action);
      return;
    }
    renderXenditPendingState();
  } catch (error) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML =
        '<i class="fa-solid fa-arrow-right"></i> Continue to Payment';
    }
    if (processBox) {
      processBox.hidden = false;
      processBox.innerHTML = `<div class="patient-payment-process-status error"><div><i class="fa-solid fa-circle-exclamation"></i><span>${escapeHtml(error.message || "Unable to start the online payment.")}</span></div></div>`;
    }
  }
}
function renderXenditCustomerAction(action) {
  const processBox = document.getElementById("patientPayProcess");
  if (!processBox || !action) return;
  const value = action.value || "";
  processBox.hidden = false;
  processBox.innerHTML = `<div class="patient-payment-process-status success stacked"><div><i class="fa-solid fa-building-columns"></i><span>Follow the payment instructions provided by Xendit to complete this transaction.</span></div>${value ? `<div class="xendit-action-value">${escapeHtml(value)}</div>` : ""}</div>`;
}
function closePaymentModal() {
  const modal = document.getElementById("paymentModal");
  if (!modal) return;
  modal.hidden = true;
  if (
    document.getElementById("receiptModal")?.hidden !== false &&
    document.getElementById("patientPayModal")?.hidden !== false
  )
    document.body.style.overflow = "";
}
function closePatientPayModal() {
  const modal = document.getElementById("patientPayModal");
  if (!modal) return;
  modal.hidden = true;
  currentPayTransaction = null;
  xenditPaymentState = { status: "idle", paymentId: "", action: null };
  if (
    document.getElementById("paymentModal")?.hidden !== false &&
    document.getElementById("receiptModal")?.hidden !== false
  )
    document.body.style.overflow = "";
}
function getStatusData(status) {
  if (status === "paid") return { className: "paid", label: "Paid" };
  if (status === "partial") return { className: "partial", label: "Partial" };
  return { className: "pending", label: "Pending" };
}
function getPaymentMethodIcon(method) {
  const value = String(method || "").toLowerCase();
  if (value.includes("gcash")) return "fa-solid fa-mobile-screen-button";
  if (value.includes("cash")) return "fa-solid fa-money-bill-wave";
  if (value.includes("bank")) return "fa-solid fa-building-columns";
  if (value.includes("unpaid")) return "fa-regular fa-clock";
  if (value === "-") return "fa-regular fa-clock";
  return "fa-solid fa-wallet";
}
function showPaymentMessage(message) {
  let toast = document.getElementById("paymentToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "paymentToast";
    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.bottom = "25px";
    toast.style.transform = "translateX(-50%)";
    toast.style.zIndex = "10001";
    toast.style.padding = "11px 16px";
    toast.style.borderRadius = "8px";
    toast.style.background = "#16803d";
    toast.style.color = "#fff";
    toast.style.fontFamily = "Inter,sans-serif";
    toast.style.fontSize = "12px";
    toast.style.fontWeight = "600";
    toast.style.boxShadow = "0 8px 25px rgba(0,0,0,.15)";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.style.display = "none";
  }, 3000);
}
function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function escapeAttribute(value) {
  return escapeHtml(value);
}
window.DentaNuevaPayments = {
  patientId: CURRENT_PATIENT_ID,
  patientName: CURRENT_PATIENT_NAME,
  getPatient: function () {
    return { patientId: CURRENT_PATIENT_ID, patientName: CURRENT_PATIENT_NAME };
  },
  getPayments: function () {
    return [...payments];
  },
  addPayment: function (payment) {
    const newPayment = normalizePayment({
      ...payment,
      patientId: CURRENT_PATIENT_ID,
      patientName: CURRENT_PATIENT_NAME,
    });
    payments.unshift(newPayment);
    savePayments();
    renderPayments();
    return newPayment;
  },
  refresh: function () {
    syncPaymentsFromFinance().then(function () {
      renderSummary();
      renderPaymentHistory();
    });
  },
  payRemaining: function (transactionId) {
    openPayModalByTransaction(transactionId);
  },
};
