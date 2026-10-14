(function () {
  "use strict";
  const CLINIC_ADDRESS =
    "Blk36 Lot3, Ph3, F1 Langaray Ext, Dagat-Dagatan, Caloocan, Metro Manila";
  // TODO: palitan ng actual TIN ng clinic
  const CLINIC_TIN = "XXX-XXX-XXX-XXX";
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  function formatMoney(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.max(toNumber(value), 0));
  }
  function formatDate(value) {
    if (!value) {
      return "-";
    }
    const raw = String(value).trim();
    const date = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw,
    );
    if (Number.isNaN(date.getTime())) {
      return raw;
    }
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  function normalizePaymentHistory(transaction) {
    if (!transaction) {
      return [];
    }
    const history = Array.isArray(transaction.paymentHistory)
      ? transaction.paymentHistory
      : Array.isArray(transaction.payments)
        ? transaction.payments
        : [];
    return history
      .map(function (payment, index) {
        return {
          id:
            payment?.id ||
            payment?.paymentId ||
            payment?.payment_id ||
            `${transaction.id || "TXN"}-${index + 1}`,
          amount: toNumber(
            payment?.amount ??
              payment?.paid ??
              payment?.paymentAmount ??
              payment?.payment_amount,
          ),
          paymentMethod:
            payment?.paymentMethod ||
            payment?.payment_method ||
            payment?.method ||
            "-",
          date:
            payment?.date ||
            payment?.paymentDate ||
            payment?.payment_date ||
            transaction.date ||
            "",
          time:
            payment?.time ||
            payment?.paymentTime ||
            payment?.payment_time ||
            "",
          reference:
            payment?.xenditPaymentId ||
            payment?.xendit_payment_id ||
            payment?.reference ||
            payment?.paymentReference ||
            payment?.payment_reference ||
            "",
        };
      })
      .filter(function (payment) {
        return payment.amount > 0;
      });
  }
  function getTotalCharge(transaction) {
    return Math.max(
      toNumber(
        transaction?.total ??
          transaction?.totalCharge ??
          transaction?.total_charge ??
          transaction?.amount,
      ),
      0,
    );
  }
  function getDiscount(transaction) {
    return Math.max(
      toNumber(
        transaction?.discount ??
          transaction?.discountAmount ??
          transaction?.discount_amount,
      ),
      0,
    );
  }
  function getAmountPaid(transaction, history) {
    if (history.length > 0) {
      return history.reduce(function (sum, payment) {
        return sum + payment.amount;
      }, 0);
    }
    return Math.max(
      toNumber(
        transaction?.paid ??
          transaction?.amountPaid ??
          transaction?.amount_paid,
      ),
      0,
    );
  }
  function getBalance(transaction, netAmount, amountPaid) {
    const transactionBalance = transaction?.balance;
    if (
      transactionBalance !== undefined &&
      transactionBalance !== null &&
      transactionBalance !== ""
    ) {
      return Math.max(toNumber(transactionBalance), 0);
    }
    return Math.max(netAmount - amountPaid, 0);
  }
  function getPaymentStatus(transaction, amountPaid, balance) {
    const rawStatus = String(
      transaction?.status ||
        transaction?.paymentStatus ||
        transaction?.payment_status ||
        "",
    )
      .trim()
      .toLowerCase();
    if (rawStatus === "paid") {
      return "Paid";
    }
    if (rawStatus === "partial" || rawStatus === "partially paid") {
      return "Partial";
    }
    if (rawStatus === "unpaid" || rawStatus === "pending") {
      if (amountPaid > 0 && balance > 0) {
        return "Partial";
      }
      return "Unpaid";
    }
    if (balance <= 0 && netAmountIsValid(amountPaid)) {
      return "Paid";
    }
    if (amountPaid > 0 && balance > 0) {
      return "Partial";
    }
    return "Unpaid";
  }
  function netAmountIsValid(amountPaid) {
    return amountPaid >= 0;
  }
  function getLatestPayment(history) {
    if (!history.length) {
      return null;
    }
    return history[history.length - 1];
  }
  function getPatientName(transaction) {
    return (
      transaction?.patient ||
      transaction?.patientName ||
      transaction?.patient_name ||
      transaction?.fullName ||
      transaction?.full_name ||
      "-"
    );
  }
  function getPatientId(transaction) {
    return (
      transaction?.patientId ||
      transaction?.patient_id ||
      transaction?.patientID ||
      "-"
    );
  }
  function getService(transaction) {
    return (
      transaction?.service ||
      transaction?.serviceName ||
      transaction?.service_name ||
      "-"
    );
  }
  function getPaymentMethod(transaction, latestPayment) {
    return (
      latestPayment?.paymentMethod ||
      transaction?.method ||
      transaction?.paymentMethod ||
      transaction?.payment_method ||
      "-"
    );
  }
  function getPaymentReference(transaction, latestPayment) {
    return (
      latestPayment?.reference ||
      transaction?.xenditPaymentId ||
      transaction?.xendit_payment_id ||
      transaction?.reference ||
      transaction?.paymentReference ||
      transaction?.payment_reference ||
      ""
    );
  }
  function buildReceipt(transaction) {
    const history = normalizePaymentHistory(transaction);
    const latestPayment = getLatestPayment(history);
    const totalCharge = getTotalCharge(transaction);
    const discount = getDiscount(transaction);
    const netAmount = Math.max(totalCharge - discount, 0);
    const amountPaid = Math.min(
      Math.max(getAmountPaid(transaction, history), 0),
      netAmount,
    );
    const remainingBalance = getBalance(transaction, netAmount, amountPaid);
    const status = getPaymentStatus(transaction, amountPaid, remainingBalance);
    const paymentMethod = getPaymentMethod(transaction, latestPayment);
    const paymentReference = getPaymentReference(transaction, latestPayment);
    const patientName = getPatientName(transaction);
    const patientId = getPatientId(transaction);
    const service = getService(transaction);
    const transactionId = transaction?.id || transaction?.transactionId || "-";
    const paymentId =
      latestPayment?.id ||
      transaction?.paymentId ||
      transaction?.payment_id ||
      `${transactionId}-1`;
    const referenceRow = paymentReference
      ? `
          <tr>
            <td class="label">Payment Reference</td>
            <td class="value">${escapeHtml(paymentReference)}</td>
          </tr>
        `
      : "";
    return `
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Payment Receipt - ${escapeHtml(transactionId)}</title>
<style>
* {
  box-sizing: border-box;
}
html,
body {
  width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 0;
}
body {
  background: #f3f5f4;
  color: #1d2822;
  font-family: Arial, Helvetica, sans-serif;
}
.print-page {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8px;
}
.receipt-page {
  width: 100%;
  max-width: 650px;
  margin: 0 auto;
  padding: 26px 38px 24px;
  background: #ffffff;
  border: 1px solid #dfe6e2;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.05);
}
.receipt-header {
  text-align: center;
}
.clinic-name {
  margin: 0;
  color: #17211b;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}
.clinic-address {
  margin: 6px 0 0;
  color: #5f6b64;
  font-size: 11px;
  line-height: 1.4;
}
.clinic-tin {
  margin: 3px 0 0;
  color: #3f4c45;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
}
.clinic-subtitle {
  margin: 8px 0 0;
  color: #78837d;
  font-size: 11px;
  line-height: 1.3;
}
.receipt-title {
  margin: 10px 0 0;
  color: #4c5952;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 1.1px;
  text-transform: uppercase;
}
.divider {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid #dfe5e1;
}
.receipt-info {
  width: 100%;
  border-collapse: collapse;
}
.receipt-info td {
  padding: 6px 0;
  border-bottom: 1px solid #edf1ee;
  vertical-align: top;
  font-size: 12px;
  line-height: 1.25;
}
.receipt-info tr:last-child td {
  border-bottom: 0;
}
.receipt-info .label {
  width: 40%;
  color: #7a857f;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.45px;
  text-transform: uppercase;
}
.receipt-info .value {
  width: 60%;
  color: #202b25;
  font-weight: 600;
  text-align: right;
  word-break: break-word;
}
.status {
  display: inline-block;
  padding: 4px 9px;
  border: 1px solid #d8e1db;
  border-radius: 20px;
  background: #f5faf7;
  color: #16803d;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.summary {
  margin-top: 15px;
  padding-top: 2px;
}
.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 6px 0;
  color: #68746d;
  font-size: 12px;
  line-height: 1.3;
}
.summary-row strong {
  color: #253129;
  font-weight: 600;
  text-align: right;
}
.summary-row.total {
  margin-top: 2px;
  padding-top: 7px;
  border-top: 1px solid #dfe5e1;
  color: #303b34;
  font-weight: 700;
}
.summary-row.paid {
  margin-top: 3px;
  padding-top: 7px;
  border-top: 1px dashed #cfd8d3;
  color: #303b34;
  font-weight: 700;
}
.summary-row.paid strong {
  color: #16803d;
  font-size: 14px;
}
.summary-row.balance {
  padding-top: 5px;
  color: #303b34;
  font-weight: 700;
}
.summary-row.balance strong {
  color: #c67b00;
  font-size: 13px;
}
.receipt-footer {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px dashed #d4dcd7;
  color: #7b867f;
  font-size: 9px;
  line-height: 1.45;
  text-align: center;
}
.receipt-footer strong {
  color: #4c5952;
  font-weight: 600;
}
.receipt-actions {
  margin-top: 10px;
  text-align: center;
}
.receipt-print-button {
  min-width: 130px;
  padding: 8px 17px;
  border: 0;
  border-radius: 6px;
  background: #16803d;
  color: #ffffff;
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
}
.receipt-print-button:hover {
  background: #075f34;
}
@media print {
  html,
  body {
    width: 100%;
    min-height: auto;
    background: #ffffff;
  }
  .print-page {
    min-height: auto;
    padding: 0;
  }
  .receipt-page {
    max-width: none;
    padding: 22px 30px;
    border: 0;
    box-shadow: none;
  }
  .receipt-actions {
    display: none;
  }
}
@media (max-width: 700px) {
  .print-page {
    padding: 6px;
  }
  .receipt-page {
    padding: 24px 30px 22px;
  }
}
@media (max-width: 500px) {
  .receipt-page {
    padding: 20px 16px;
  }
  .clinic-name {
    font-size: 22px;
  }
  .clinic-subtitle {
    font-size: 12px;
  }
  .clinic-address,
  .clinic-tin {
    font-size: 11px;
  }
  .receipt-title {
    font-size: 13px;
  }
  .receipt-info td {
    font-size: 12px;
    padding: 9px 0;
  }
  .receipt-info .label {
    width: 42%;
    font-size: 10px;
  }
  .receipt-info .value {
    width: 58%;
  }
  .status {
    font-size: 10px;
  }
  .summary-row {
    font-size: 12px;
  }
  .summary-row.paid strong {
    font-size: 14px;
  }
  .summary-row.balance strong {
    font-size: 13px;
  }
  .receipt-footer {
    font-size: 10px;
  }
  .receipt-print-button {
    font-size: 12px;
    padding: 11px 20px;
  }
}
</style>
</head>
<body>
<main class="print-page">
<article class="receipt-page">
<header class="receipt-header">
<h1 class="clinic-name">DentaNueva Dental Clinic</h1>
<p class="clinic-address">${escapeHtml(CLINIC_ADDRESS)}</p>
<p class="clinic-tin">TIN: ${escapeHtml(CLINIC_TIN)}</p>
<p class="clinic-subtitle">Official Payment Receipt</p>
<p class="receipt-title">Payment Receipt</p>
</header>
<hr class="divider">
<table class="receipt-info">
<tr>
<td class="label">Transaction ID</td>
<td class="value">${escapeHtml(transactionId)}</td>
</tr>
<tr>
<td class="label">Payment ID</td>
<td class="value">${escapeHtml(paymentId)}</td>
</tr>
<tr>
<td class="label">Patient</td>
<td class="value">${escapeHtml(patientName)}</td>
</tr>
<tr>
<td class="label">Patient ID</td>
<td class="value">${escapeHtml(patientId)}</td>
</tr>
<tr>
<td class="label">Service</td>
<td class="value">${escapeHtml(service)}</td>
</tr>
<tr>
<td class="label">Date</td>
<td class="value">${escapeHtml(formatDate(transaction?.date))}</td>
</tr>
<tr>
<td class="label">Payment Method</td>
<td class="value">${escapeHtml(paymentMethod)}</td>
</tr>
${referenceRow}
<tr>
<td class="label">Status</td>
<td class="value">
<span class="status">${escapeHtml(status)}</span>
</td>
</tr>
</table>
<section class="summary">
<div class="summary-row">
<span>Total Charge</span>
<strong>${formatMoney(totalCharge)}</strong>
</div>
<div class="summary-row">
<span>Discount</span>
<strong>${formatMoney(discount)}</strong>
</div>
<div class="summary-row total">
<span>Net Amount</span>
<strong>${formatMoney(netAmount)}</strong>
</div>
<div class="summary-row paid">
<span>Amount Paid</span>
<strong>${formatMoney(amountPaid)}</strong>
</div>
<div class="summary-row balance">
<span>Remaining Balance</span>
<strong>${formatMoney(remainingBalance)}</strong>
</div>
</section>
<footer class="receipt-footer">
<strong>Thank you for your payment.</strong>
<br>
This receipt represents the recorded payment transaction for DentaNueva Dental Clinic.
</footer>
<div class="receipt-actions">
<button type="button" class="receipt-print-button" onclick="window.focus(); window.print();">Print Receipt</button>
</div>
</article>
</main>
</body>
</html>
    `;
  }
  function openPaymentReceipt(transaction) {
    if (!transaction || typeof transaction !== "object") {
      alert("Unable to generate the payment receipt.");
      return;
    }

    const receiptHtml = buildReceipt(transaction);
    const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const isMobile =
      window.matchMedia("(max-width: 768px)").matches ||
      /Android|iPhone|iPad/i.test(navigator.userAgent);

    const receiptWindow = isMobile
      ? window.open(url, "_blank")
      : window.open(url, "_blank", "width=760,height=760");

    if (!receiptWindow) {
      URL.revokeObjectURL(url);
      alert("Please allow pop-ups to view the receipt.");
      return;
    }

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 60000);
  }
  window.openPaymentReceipt = openPaymentReceipt;
})();
