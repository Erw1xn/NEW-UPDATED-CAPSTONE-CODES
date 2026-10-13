(function () {
  "use strict";
  var TRANSACTIONS_API = "../../api/finance/transactions.php";
  var APPOINTMENTS_API = "../../api/appointments.php";
  var CLINIC_NAME = "DentaNueva Dental Clinic";
  var DISCOUNT_LABELS = {
    none: "No Discount",
    senior: "Senior Citizen",
    pwd: "PWD",
    promo: "Clinic Promotional",
    other: "Other Authorized",
  };
  var METHODS = ["Cash", "GCash", "Bank Transfer"];
  var GREEN = [22, 128, 61];
  var GREEN_DARK = [16, 102, 51];
  var GREEN_SOFT = [234, 247, 239];
  var TEXT = [23, 34, 27];
  var TEXT_SOFT = [104, 117, 109];
  var BORDER = [226, 233, 228];
  var AMBER = [189, 116, 21];
  var RED = [176, 71, 71];
  function money(value) {
    var n = Number(value) || 0;
    return (
      "PHP " +
      n.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  function parseDateTime(value) {
    if (!value) return null;
    var text = String(value);
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text.slice(10))) {
      var zoned = new Date(text);
      return isNaN(zoned.getTime()) ? null : zoned;
    }
    var m = text.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
    if (m) {
      return new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4] || 0),
        Number(m[5] || 0),
        Number(m[6] || 0),
      );
    }
    var d = new Date(text);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(value) {
    var d = value instanceof Date ? value : parseDateTime(value);
    if (!d) return "N/A";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  function fmtDateTime(value) {
    var d = parseDateTime(value);
    if (!d) return "N/A";
    return (
      fmtDate(d) +
      "  " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  }
  function dateKey(value) {
    var d = value instanceof Date ? value : parseDateTime(value);
    if (!d) return "";
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }
  function timeValue(value) {
    var d = parseDateTime(value);
    return d ? d.getTime() : 0;
  }
  function doctorLabel(name) {
    var n = String(name || "").trim();
    if (!n) return "-";
    return /^dr\.?\s/i.test(n) ? n : "Dr. " + n;
  }
  function titleCase(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }
  function normalizeMethod(method) {
    var v = String(method || "")
      .trim()
      .toLowerCase();
    if (v === "cash") return "Cash";
    if (v === "gcash") return "GCash";
    if (v === "bank_transfer" || v === "bank transfer") return "Bank Transfer";
    return method || "-";
  }
  function statusColor(label) {
    var v = String(label || "").toLowerCase();
    if (v === "paid") return GREEN;
    if (v === "partial") return AMBER;
    if (v === "unpaid" || v === "cancelled") return RED;
    return TEXT_SOFT;
  }
  function normalizeTransaction(raw) {
    var history = Array.isArray(raw.paymentHistory)
      ? raw.paymentHistory
      : Array.isArray(raw.payment_history)
        ? raw.payment_history
        : [];
    var payments = history.map(function (p) {
      return {
        uid: p.payment_uid || p.id || "",
        reference: p.reference_number || p.payment_uid || p.id || "",
        amount: Number(p.amount) || 0,
        method: normalizeMethod(p.payment_method || p.paymentMethod),
        source: p.payment_source || p.paymentSource || "",
        status: String(p.status || p.payment_status || "").toLowerCase(),
        date: p.paid_at || p.created_at || raw.created_at || "",
      };
    });
    var confirmed = payments.filter(function (p) {
      return p.status === "paid";
    });
    var total = Number(raw.total_amount) || 0;
    var discount = Number(raw.discount_amount) || 0;
    var net = Math.max(total - discount, 0);
    var paid = payments.length
      ? confirmed.reduce(function (sum, p) {
          return sum + p.amount;
        }, 0)
      : Number(raw.paid_amount) || 0;
    var balance = payments.length
      ? Math.max(net - paid, 0)
      : Math.max(Number(raw.balance_amount) || 0, 0);
    var cancelled = String(raw.status || "").toLowerCase() === "cancelled";
    var status = cancelled
      ? "Cancelled"
      : balance <= 0 && paid > 0
        ? "Paid"
        : paid > 0
          ? "Partial"
          : "Unpaid";
    return {
      id: raw.transaction_uid || String(raw.transaction_id || ""),
      patientId: raw.patient_id || "",
      patientName: raw.patient_name || "",
      service: raw.service_name || "Dental Service",
      appointmentId: raw.appointment_id || "",
      date: raw.created_at || "",
      total: total,
      discount: discount,
      discountType: raw.discount_type || "none",
      net: net,
      paid: paid,
      balance: balance,
      status: status,
      cancelled: cancelled,
      payments: payments,
      confirmed: confirmed,
    };
  }
  function buildReportDoc(jsPDFCtor, data) {
    var doc = new jsPDFCtor({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 36;
    var CW = W - M * 2;
    var appointments = data.appointments || [];
    function runTable(opts) {
      if (typeof doc.autoTable === "function") doc.autoTable(opts);
      else throw new Error("jsPDF-AutoTable is not loaded.");
      return doc.lastAutoTable.finalY;
    }
    var apptById = {};
    appointments.forEach(function (a) {
      [a.appointment_id, a.databaseAppointmentId].forEach(function (key) {
        if (key !== undefined && key !== null && key !== "") {
          apptById[String(key)] = a;
        }
      });
    });
    var transactions = (data.transactions || [])
      .map(normalizeTransaction)
      .sort(function (a, b) {
        return timeValue(b.date) - timeValue(a.date);
      });
    var active = transactions.filter(function (t) {
      return !t.cancelled;
    });
    function doctorOf(t) {
      var appt = t.appointmentId ? apptById[String(t.appointmentId)] : null;
      return appt ? doctorLabel(appt.doctorName) : "-";
    }
    var allPayments = [];
    active.forEach(function (t) {
      t.confirmed.forEach(function (p) {
        allPayments.push({ payment: p, transaction: t });
      });
    });
    allPayments.sort(function (a, b) {
      return timeValue(b.payment.date) - timeValue(a.payment.date);
    });
    var now = new Date();
    var todayKey = dateKey(now);
    var monthKey = todayKey.slice(0, 7);
    function collect(filterFn) {
      var result = { total: 0, count: 0 };
      METHODS.forEach(function (m) {
        result[m] = { amount: 0, count: 0 };
      });
      allPayments.forEach(function (entry) {
        if (!filterFn(dateKey(entry.payment.date))) return;
        var bucket = result[entry.payment.method];
        if (bucket) {
          bucket.amount += entry.payment.amount;
          bucket.count += 1;
        }
        result.total += entry.payment.amount;
        result.count += 1;
      });
      return result;
    }
    var todayTotals = collect(function (key) {
      return key === todayKey;
    });
    var monthTotals = collect(function (key) {
      return key.slice(0, 7) === monthKey;
    });
    var allTotals = collect(function () {
      return true;
    });
    var totals = active.reduce(
      function (t, x) {
        t.total += x.total;
        t.discount += x.discount;
        t.net += x.net;
        t.paid += x.paid;
        t.balance += x.balance;
        return t;
      },
      { total: 0, discount: 0, net: 0, paid: 0, balance: 0 },
    );
    doc.setFillColor(GREEN[0], GREEN[1], GREEN[2]);
    doc.rect(0, 0, W, 70, "F");
    doc.setFillColor(GREEN_DARK[0], GREEN_DARK[1], GREEN_DARK[2]);
    doc.rect(0, 66, W, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(CLINIC_NAME, M, 31);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Finance & Collections Report", M, 49);
    doc.setFontSize(8.5);
    doc.text(
      "Generated: " +
        now.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }) +
        " at " +
        now.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      W - M,
      31,
      { align: "right" },
    );
    doc.text("Transactions: " + transactions.length, W - M, 49, {
      align: "right",
    });
    var y = 70 + 22;
    var cards = [
      {
        label: "TODAY'S COLLECTION",
        value: money(todayTotals.total),
        color: GREEN,
      },
      {
        label: "THIS MONTH",
        value: money(monthTotals.total),
        color: TEXT,
      },
      {
        label: "TOTAL COLLECTED",
        value: money(allTotals.total),
        color: GREEN,
      },
      {
        label: "OUTSTANDING BALANCE",
        value: money(totals.balance),
        color: totals.balance > 0 ? AMBER : GREEN,
      },
    ];
    var gap = 10;
    var cardW = (CW - gap * 3) / 4;
    cards.forEach(function (c, i) {
      var x = M + i * (cardW + gap);
      doc.setFillColor(GREEN_SOFT[0], GREEN_SOFT[1], GREEN_SOFT[2]);
      doc.setDrawColor(213, 234, 220);
      doc.roundedRect(x, y, cardW, 46, 6, 6, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(TEXT_SOFT[0], TEXT_SOFT[1], TEXT_SOFT[2]);
      doc.text(c.label, x + 12, y + 16);
      doc.setFontSize(14);
      doc.setTextColor(c.color[0], c.color[1], c.color[2]);
      doc.text(c.value, x + 12, y + 35);
    });
    y += 46 + 22;
    function baseTable(extra) {
      return Object.assign(
        {
          margin: { top: 40, left: M, right: M, bottom: 40 },
          theme: "grid",
          styles: {
            font: "helvetica",
            fontSize: 7.5,
            cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
            textColor: TEXT,
            lineColor: BORDER,
            lineWidth: 0.5,
            valign: "middle",
            overflow: "linebreak",
          },
          headStyles: {
            fillColor: GREEN,
            textColor: 255,
            fontStyle: "bold",
            fontSize: 7.5,
          },
          footStyles: {
            fillColor: GREEN_SOFT,
            textColor: TEXT,
            fontStyle: "bold",
          },
          alternateRowStyles: { fillColor: [249, 252, 250] },
        },
        extra,
      );
    }
    function emptyRow(cols, text) {
      return [
        [
          {
            content: text,
            colSpan: cols,
            styles: {
              halign: "center",
              textColor: TEXT_SOFT,
              fontStyle: "italic",
            },
          },
        ],
      ];
    }
    function section(title, subtitle) {
      if (y > H - 110) {
        doc.addPage();
        y = 40;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      doc.text(title, M, y);
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(TEXT_SOFT[0], TEXT_SOFT[1], TEXT_SOFT[2]);
        doc.text(subtitle, M, y + 11);
      }
      y += subtitle ? 18 : 10;
    }
    function colorStatusCell(colIndex) {
      return function (hook) {
        if (hook.section === "body" && hook.column.index === colIndex) {
          var raw = hook.cell.raw;
          if (typeof raw === "string") {
            hook.cell.styles.textColor = statusColor(raw);
            hook.cell.styles.fontStyle = "bold";
          }
        }
      };
    }
    section(
      "1. Collection Summary",
      "Confirmed payments collected, grouped by payment method.",
    );
    function summaryRow(label, t) {
      return [
        label,
        money(t.Cash.amount) + "\n" + t.Cash.count + " payment(s)",
        money(t.GCash.amount) + "\n" + t.GCash.count + " payment(s)",
        money(t["Bank Transfer"].amount) +
          "\n" +
          t["Bank Transfer"].count +
          " payment(s)",
        money(t.total),
        String(t.count),
      ];
    }
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Period",
            "Cash",
            "GCash",
            "Bank Transfer",
            "Total Collected",
            "Payments",
          ],
        ],
        body: [
          summaryRow("Today (" + fmtDate(now) + ")", todayTotals),
          summaryRow(
            "This Month (" +
              now.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              }) +
              ")",
            monthTotals,
          ),
          summaryRow("All Time", allTotals),
        ],
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right", fontStyle: "bold" },
          5: { halign: "center", cellWidth: 60 },
        },
      }),
    );
    y += 22;
    section(
      "2. Transactions",
      "All charges with discount, amount paid, remaining balance and the doctor of the linked appointment. Cancelled transactions are excluded from totals.",
    );
    var txnRows = transactions.map(function (t) {
      return [
        t.id || "N/A",
        t.patientName
          ? t.patientName + (t.patientId ? "\n" + t.patientId : "")
          : t.patientId || "-",
        t.service,
        doctorOf(t),
        fmtDate(t.date),
        money(t.total),
        t.discount > 0
          ? money(t.discount) +
            (t.discountType && t.discountType !== "none"
              ? "\n" + (DISCOUNT_LABELS[t.discountType] || t.discountType)
              : "")
          : money(0),
        money(t.net),
        money(t.paid),
        money(t.balance),
        t.status,
      ];
    });
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Transaction ID",
            "Patient",
            "Service",
            "Doctor",
            "Date",
            "Total",
            "Discount",
            "Net",
            "Paid",
            "Balance",
            "Status",
          ],
        ],
        body: txnRows.length
          ? txnRows
          : emptyRow(11, "No transactions recorded."),
        foot: txnRows.length
          ? [
              [
                { content: "TOTAL", colSpan: 5 },
                money(totals.total),
                money(totals.discount),
                money(totals.net),
                money(totals.paid),
                money(totals.balance),
                "",
              ],
            ]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 104 },
          1: { cellWidth: 76 },
          3: { cellWidth: 66 },
          4: { cellWidth: 52 },
          5: { halign: "right", cellWidth: 58 },
          6: { halign: "right", cellWidth: 62 },
          7: { halign: "right", cellWidth: 58 },
          8: { halign: "right", cellWidth: 58 },
          9: { halign: "right", cellWidth: 58 },
          10: { halign: "center", cellWidth: 44 },
        },
        didParseCell: colorStatusCell(10),
      }),
    );
    y += 22;
    section(
      "3. Payment History",
      "Confirmed payments only (pending, failed or expired online payments are not included).",
    );
    var payRows = allPayments.map(function (entry) {
      var p = entry.payment;
      var t = entry.transaction;
      return [
        fmtDateTime(p.date),
        p.reference || "-",
        t.id || "-",
        t.patientName || t.patientId || "-",
        t.service,
        p.method,
        p.source ? titleCase(p.source) : "-",
        money(p.amount),
      ];
    });
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Date & Time",
            "Payment Ref.",
            "Transaction ID",
            "Patient",
            "Service",
            "Method",
            "Recorded By",
            "Amount",
          ],
        ],
        body: payRows.length
          ? payRows
          : emptyRow(8, "No confirmed payments yet."),
        foot: payRows.length
          ? [
              [
                { content: "TOTAL COLLECTED", colSpan: 7 },
                money(allTotals.total),
              ],
            ]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 92 },
          1: { cellWidth: 118 },
          2: { cellWidth: 118 },
          5: { cellWidth: 62 },
          6: { cellWidth: 56 },
          7: { halign: "right", cellWidth: 68 },
        },
      }),
    );
    y += 22;
    section(
      "4. Outstanding Balances",
      "Transactions that still have a remaining balance.",
    );
    var openRows = active
      .filter(function (t) {
        return t.balance > 0;
      })
      .sort(function (a, b) {
        return b.balance - a.balance;
      })
      .map(function (t) {
        var last = t.confirmed.slice().sort(function (a, b) {
          return timeValue(b.date) - timeValue(a.date);
        })[0];
        return [
          t.patientName
            ? t.patientName + (t.patientId ? "\n" + t.patientId : "")
            : t.patientId || "-",
          t.id || "-",
          t.service,
          doctorOf(t),
          money(t.net),
          money(t.paid),
          money(t.balance),
          last ? fmtDate(last.date) : "No payment yet",
        ];
      });
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Patient",
            "Transaction ID",
            "Service",
            "Doctor",
            "Net Amount",
            "Paid",
            "Balance",
            "Last Payment",
          ],
        ],
        body: openRows.length
          ? openRows
          : emptyRow(8, "No outstanding balances."),
        foot: openRows.length
          ? [
              [
                { content: "TOTAL OUTSTANDING", colSpan: 6 },
                money(totals.balance),
                "",
              ],
            ]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 100 },
          1: { cellWidth: 118 },
          3: { cellWidth: 80 },
          4: { halign: "right", cellWidth: 64 },
          5: { halign: "right", cellWidth: 64 },
          6: { halign: "right", cellWidth: 64 },
          7: { cellWidth: 70 },
        },
      }),
    );
    var pages = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.line(M, H - 28, W - M, H - 28);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(TEXT_SOFT[0], TEXT_SOFT[1], TEXT_SOFT[2]);
      doc.text(
        CLINIC_NAME + "  |  Finance & collections report  |  Confidential",
        M,
        H - 16,
      );
      doc.text("Page " + i + " of " + pages, W - M, H - 16, { align: "right" });
    }
    return doc;
  }
  async function loadJson(url) {
    try {
      var response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      var result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load " + url);
      }
      return result.data;
    } catch (error) {
      console.error("Unable to load report data:", url, error);
      return null;
    }
  }
  function showReportMessage(message) {
    var toast = document.getElementById("financeToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "financeToast";
      toast.className = "finance-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showReportMessage.timer);
    showReportMessage.timer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 2600);
  }
  function setButtonBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    var label = button.querySelector("span");
    if (label) label.textContent = busy ? "Generating..." : "Export PDF";
  }
  async function exportFinanceReportPdf() {
    var button = document.getElementById("exportPdfBtn");
    if (button && button.disabled) return;
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showReportMessage(
        "PDF library failed to load. Please check your internet connection.",
      );
      return;
    }
    setButtonBusy(button, true);
    try {
      var results = await Promise.all([
        loadJson(TRANSACTIONS_API),
        loadJson(APPOINTMENTS_API),
      ]);
      if (!Array.isArray(results[0])) {
        showReportMessage("Unable to load finance records.");
        return;
      }
      if (!results[0].length) {
        showReportMessage("No transactions available to export.");
        return;
      }
      var doc = buildReportDoc(window.jspdf.jsPDF, {
        transactions: results[0],
        appointments: Array.isArray(results[1]) ? results[1] : [],
      });
      doc.save("DentaNueva_Finance_Report_" + dateKey(new Date()) + ".pdf");
      showReportMessage("Finance PDF report downloaded.");
    } catch (error) {
      console.error("Unable to generate finance PDF report:", error);
      showReportMessage("Unable to generate the PDF report.");
    } finally {
      setButtonBusy(button, false);
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      var button = document.getElementById("exportPdfBtn");
      if (button) button.addEventListener("click", exportFinanceReportPdf);
    });
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildReportDoc: buildReportDoc };
  }
})();
