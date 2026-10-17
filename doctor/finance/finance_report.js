(function () {
  "use strict";
  var TRANSACTIONS_API = "../../api/finance/transactions.php";
  var EXPENSES_API = "../../api/finance/expenses.php";
  var PATIENT_API = "../../api/patient_records.php";
  var APPOINTMENTS_API = "../../api/appointments.php?scope=doctor_appointments";
  var CLINIC_NAME = "DentaNueva Dental Clinic";
  var DISCOUNT_LABELS = {
    none: "No Discount",
    senior: "Senior Citizen",
    pwd: "PWD",
    promo: "Clinic Promotional",
    other: "Other Authorized",
  };
  var METHODS = ["Cash", "GCash", "Bank Transfer"];
  var MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
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
  function monthKey(date) {
    return (
      date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0")
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
      .toLowerCase()
      .replace(/-/g, "_");
    if (v === "cash") return "Cash";
    if (v === "gcash") return "GCash";
    if (v === "bank_transfer" || v === "bank transfer") return "Bank Transfer";
    return method || "-";
  }
  function statusColor(label) {
    var v = String(label || "").toLowerCase();
    if (v === "paid") return GREEN;
    if (v === "partial") return AMBER;
    if (v === "unpaid") return RED;
    return TEXT_SOFT;
  }
  function appointmentPatientId(appointment) {
    return String(
      appointment.patientId ||
        appointment.patient_id ||
        appointment.patient ||
        "",
    ).trim();
  }
  function recordPatientId(record) {
    return String(
      (record && (record.patientId || record.patient_id || record.id)) || "",
    ).trim();
  }
  function buildDoctorPatientIds(appointments, records) {
    var fromAppointments = {};
    appointments.forEach(function (a) {
      var pid = appointmentPatientId(a);
      if (pid) fromAppointments[pid] = true;
    });
    if (!Array.isArray(records)) return fromAppointments;
    var result = {};
    records.forEach(function (r) {
      var pid = recordPatientId(r);
      if (pid && fromAppointments[pid]) result[pid] = true;
    });
    return result;
  }
  function normalizeTransaction(raw) {
    var history = Array.isArray(raw.paymentHistory) ? raw.paymentHistory : [];
    var payments = history.map(function (p) {
      return {
        reference: p.reference_number || p.payment_uid || p.payment_id || "",
        amount: Number(p.amount) || 0,
        method: normalizeMethod(p.payment_method || p.paymentMethod),
        source: p.payment_source || p.paymentSource || "",
        status: String(p.status || "")
          .trim()
          .toLowerCase(),
        date: p.paid_at || p.created_at || raw.created_at || "",
      };
    });
    var confirmed = payments.filter(function (p) {
      return p.status === "paid" && p.amount > 0;
    });
    var total = Number(raw.total_amount) || 0;
    var discount = Number(raw.discount_amount) || 0;
    var net = Math.max(total - discount, 0);
    var paid = Math.max(Number(raw.paid_amount) || 0, 0);
    var dbBalance = Number(raw.balance_amount);
    var balance = Number.isFinite(dbBalance)
      ? Math.max(dbBalance, 0)
      : Math.max(net - paid, 0);
    var status =
      balance <= 0 ? "Paid" : paid > 0 && paid < net ? "Partial" : "Unpaid";
    return {
      id: raw.transaction_uid || String(raw.transaction_id || ""),
      patientId: raw.patient_id || "",
      patientName: raw.patient_name || "",
      service: raw.service_name || "Consultation",
      date: raw.created_at || "",
      dayKey: String(raw.created_at || "").slice(0, 10),
      total: total,
      discount: discount,
      discountType: raw.discount_type || "none",
      net: net,
      paid: paid,
      balance: balance,
      status: status,
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
    var expenseReport = data.expenses || null;
    var auditEvents = Array.isArray(data.audit) ? data.audit : [];
    var doctorPatientIds = data.patientIds || {};
    function runTable(opts) {
      if (typeof doc.autoTable === "function") doc.autoTable(opts);
      else throw new Error("jsPDF-AutoTable is not loaded.");
      return doc.lastAutoTable.finalY;
    }
    var doctorName = "";
    appointments.forEach(function (a) {
      if (!doctorName && a.doctorName) doctorName = a.doctorName;
    });
    var period = data.period || null;
    var hasPeriod = !!(period && (period.start || period.end));
    var periodStartMs =
      hasPeriod && period.start ? period.start.getTime() : -Infinity;
    var periodEndMs = hasPeriod && period.end ? period.end.getTime() : Infinity;
    function inPeriod(value) {
      if (!hasPeriod) return true;
      var t = timeValue(value);
      return t > 0 && t >= periodStartMs && t < periodEndMs;
    }
    var allTransactions = (data.transactions || [])
      .filter(function (raw) {
        return doctorPatientIds[String(raw.patient_id || "").trim()] === true;
      })
      .map(normalizeTransaction)
      .sort(function (a, b) {
        return timeValue(b.date) - timeValue(a.date);
      });
    // Transactions created in the period; payments received in the period.
    var transactions = allTransactions.filter(function (t) {
      return inPeriod(t.date);
    });
    auditEvents = auditEvents.filter(function (e) {
      return inPeriod(e.timestamp);
    });
    var allPayments = [];
    allTransactions.forEach(function (t) {
      t.confirmed.forEach(function (p) {
        if (!inPeriod(p.date)) return;
        allPayments.push({ payment: p, transaction: t });
      });
    });
    allPayments.sort(function (a, b) {
      return timeValue(b.payment.date) - timeValue(a.payment.date);
    });
    var now = new Date();
    var todayKey = dateKey(now);
    var currentMonthKey =
      period && period.monthKey ? period.monthKey : todayKey.slice(0, 7);
    var currentYear = Number(currentMonthKey.slice(0, 4));
    var currentMonthIndex = Number(currentMonthKey.slice(5, 7)) - 1;
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
      return key.slice(0, 7) === currentMonthKey;
    });
    var allTotals = collect(function () {
      return true;
    });
    var totals = transactions.reduce(
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
    var todayRevenue = transactions
      .filter(function (t) {
        return t.dayKey === todayKey;
      })
      .reduce(function (s, t) {
        return s + t.paid;
      }, 0);
    var monthRevenue = transactions
      .filter(function (t) {
        return t.dayKey.slice(0, 7) === currentMonthKey;
      })
      .reduce(function (s, t) {
        return s + t.paid;
      }, 0);
    var monthExpenses = Number(expenseReport && expenseReport.total) || 0;
    var previousExpenses =
      Number(expenseReport && expenseReport.previous_total) || 0;
    var netIncome = monthRevenue - monthExpenses;
    var yearlyExpenses =
      expenseReport && Array.isArray(expenseReport.yearly)
        ? expenseReport.yearly
        : [];
    var monthlyRevenue = [];
    for (var mi = 0; mi < 12; mi++) {
      monthlyRevenue.push(0);
    }
    allTransactions.forEach(function (t) {
      var d = parseDateTime(t.date);
      if (d && d.getFullYear() === currentYear) {
        monthlyRevenue[d.getMonth()] += t.paid;
      }
    });
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
    doc.text(
      "Doctor Finance & Collections Report" +
        (doctorName ? "  |  " + doctorLabel(doctorName) : "") +
        "  |  Period: " +
        (hasPeriod && period.label ? period.label : "All time"),
      M,
      49,
    );
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
        label: hasPeriod ? "COLLECTED IN PERIOD" : "TODAY'S REVENUE",
        value: money(hasPeriod ? allTotals.total : todayRevenue),
        color: GREEN,
      },
      {
        label:
          period && period.monthKey
            ? "NET INCOME (" +
              MONTH_NAMES[currentMonthIndex].toUpperCase() +
              ")"
            : "NET INCOME (THIS MONTH)",
        value: money(netIncome),
        color: netIncome < 0 ? RED : GREEN,
      },
      {
        label: "OUTSTANDING BALANCE",
        value: money(totals.balance),
        color: totals.balance > 0 ? AMBER : GREEN,
      },
      {
        label: "MONTHLY EXPENSES",
        value: money(monthExpenses),
        color: TEXT,
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
    function colorNetCell(colIndex) {
      return function (hook) {
        if (hook.section === "body" && hook.column.index === colIndex) {
          var raw = hook.cell.raw;
          if (typeof raw === "string" && raw.indexOf("-") !== -1) {
            hook.cell.styles.textColor = RED;
            hook.cell.styles.fontStyle = "bold";
          }
        }
      };
    }
    section(
      "1. Collection Summary",
      "Confirmed payments collected from your patients, grouped by payment method.",
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
      "All charges of your patients with discount, amount paid and remaining balance.",
    );
    var txnRows = transactions.map(function (t) {
      return [
        t.id || "N/A",
        t.patientName
          ? t.patientName + (t.patientId ? "\n" + t.patientId : "")
          : t.patientId || "-",
        t.service,
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
          : emptyRow(10, "No transactions recorded."),
        foot: txnRows.length
          ? [
              [
                { content: "TOTAL", colSpan: 4 },
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
          0: { cellWidth: 118 },
          1: { cellWidth: 84 },
          3: { cellWidth: 56 },
          4: { halign: "right", cellWidth: 62 },
          5: { halign: "right", cellWidth: 66 },
          6: { halign: "right", cellWidth: 62 },
          7: { halign: "right", cellWidth: 62 },
          8: { halign: "right", cellWidth: 62 },
          9: { halign: "center", cellWidth: 46 },
        },
        didParseCell: colorStatusCell(9),
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
      "Transactions of your patients that still have a remaining balance.",
    );
    var openRows = transactions
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
            "Net Amount",
            "Paid",
            "Balance",
            "Last Payment",
          ],
        ],
        body: openRows.length
          ? openRows
          : emptyRow(7, "No outstanding balances."),
        foot: openRows.length
          ? [
              [
                { content: "TOTAL OUTSTANDING", colSpan: 5 },
                money(totals.balance),
                "",
              ],
            ]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 110 },
          1: { cellWidth: 130 },
          3: { halign: "right", cellWidth: 70 },
          4: { halign: "right", cellWidth: 70 },
          5: { halign: "right", cellWidth: 70 },
          6: { cellWidth: 80 },
        },
      }),
    );
    y += 22;
    section(
      "5. Revenue by Service",
      "Amount paid per treatment or service from your patients.",
    );
    var serviceMap = {};
    transactions.forEach(function (t) {
      var name = String(t.service || "Other").trim() || "Other";
      if (!serviceMap[name]) serviceMap[name] = { amount: 0, count: 0 };
      serviceMap[name].amount += Math.max(t.paid, 0);
      serviceMap[name].count += 1;
    });
    var serviceList = Object.keys(serviceMap)
      .map(function (name) {
        return {
          name: name,
          amount: serviceMap[name].amount,
          count: serviceMap[name].count,
        };
      })
      .filter(function (item) {
        return item.amount > 0;
      })
      .sort(function (a, b) {
        return b.amount - a.amount;
      });
    var serviceTotal = serviceList.reduce(function (s, item) {
      return s + item.amount;
    }, 0);
    var serviceRows = serviceList.map(function (item) {
      return [
        item.name,
        String(item.count),
        money(item.amount),
        (serviceTotal > 0 ? (item.amount / serviceTotal) * 100 : 0).toFixed(1) +
          "%",
      ];
    });
    y = runTable(
      baseTable({
        startY: y,
        head: [["Service", "Transactions", "Revenue", "Share"]],
        body: serviceRows.length
          ? serviceRows
          : emptyRow(4, "No procedure revenue data available."),
        foot: serviceRows.length
          ? [["TOTAL", "", money(serviceTotal), "100.0%"]]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          1: { halign: "center", cellWidth: 90 },
          2: { halign: "right", cellWidth: 130 },
          3: { halign: "right", cellWidth: 80 },
        },
      }),
    );
    y += 22;
    section(
      "6. Revenue vs Expenses",
      "Monthly revenue and expenses for " + currentYear + ".",
    );
    var monthRows = [];
    var yearRevenueTotal = 0;
    var yearExpenseTotal = 0;
    for (var i = 0; i < 12; i++) {
      var rev = monthlyRevenue[i] || 0;
      var exp = Number(yearlyExpenses[i]) || 0;
      yearRevenueTotal += rev;
      yearExpenseTotal += exp;
      monthRows.push([
        MONTH_NAMES[i] + " " + currentYear,
        money(rev),
        money(exp),
        money(rev - exp),
      ]);
    }
    y = runTable(
      baseTable({
        startY: y,
        head: [["Month", "Revenue", "Expenses", "Net Income"]],
        body: monthRows,
        foot: [
          [
            "TOTAL",
            money(yearRevenueTotal),
            money(yearExpenseTotal),
            money(yearRevenueTotal - yearExpenseTotal),
          ],
        ],
        showFoot: "lastPage",
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right", fontStyle: "bold" },
        },
        didParseCell: colorNetCell(3),
      }),
    );
    y += 22;
    var expenseSubtitle =
      "Expense categories for " +
      MONTH_NAMES[currentMonthIndex] +
      " " +
      currentYear;
    if (previousExpenses > 0) {
      expenseSubtitle +=
        "  |  " +
        (((monthExpenses - previousExpenses) / previousExpenses) * 100).toFixed(
          1,
        ) +
        "% vs previous month";
    }
    section("7. Monthly Expenses Overview", expenseSubtitle + ".");
    var categories =
      expenseReport && Array.isArray(expenseReport.categories)
        ? expenseReport.categories
        : [];
    var categoryRows = categories.map(function (item) {
      var amount = Number(item.amount) || 0;
      return [
        item.label || "-",
        money(amount),
        (monthExpenses > 0 ? (amount / monthExpenses) * 100 : 0).toFixed(1) +
          "%",
      ];
    });
    y = runTable(
      baseTable({
        startY: y,
        head: [["Category", "Amount", "Share"]],
        body: categoryRows.length
          ? categoryRows
          : emptyRow(3, "No expenses this month."),
        foot: categoryRows.length
          ? [["TOTAL", money(monthExpenses), "100.0%"]]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          1: { halign: "right", cellWidth: 140 },
          2: { halign: "right", cellWidth: 80 },
        },
      }),
    );
    var manualEntries =
      expenseReport && Array.isArray(expenseReport.manual_entries)
        ? expenseReport.manual_entries
        : [];
    y += 14;
    section(
      "Other Expenses",
      "Manually recorded expense entries for this month.",
    );
    var manualTotal = manualEntries.reduce(function (s, e) {
      return s + (Number(e.amount) || 0);
    }, 0);
    var manualRows = manualEntries.map(function (e) {
      return [
        fmtDate(e.expense_date),
        e.category_label || "-",
        e.description || "-",
        money(e.amount),
      ];
    });
    y = runTable(
      baseTable({
        startY: y,
        head: [["Date", "Category", "Description", "Amount"]],
        body: manualRows.length
          ? manualRows
          : emptyRow(4, "No other expenses recorded this month."),
        foot: manualRows.length
          ? [[{ content: "TOTAL", colSpan: 3 }, money(manualTotal)]]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 150 },
          3: { halign: "right", cellWidth: 100 },
        },
      }),
    );
    y += 22;
    section(
      "8. Financial Audit Trail",
      "Latest recorded financial activity (payments, treatment charges and expenses).",
    );
    var auditRows = auditEvents.map(function (e) {
      var sign = e.type === "expense" ? "-" : "";
      return [
        fmtDateTime(e.timestamp),
        titleCase(e.type),
        e.title || "-",
        e.detail || "-",
        e.reference || "-",
        e.actor || "System",
        sign + money(e.amount),
      ];
    });
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Date & Time",
            "Type",
            "Activity",
            "Details",
            "Reference",
            "By",
            "Amount",
          ],
        ],
        body: auditRows.length
          ? auditRows
          : emptyRow(7, "No financial activity recorded yet."),
        columnStyles: {
          0: { cellWidth: 92 },
          1: { cellWidth: 54 },
          2: { cellWidth: 100 },
          4: { cellWidth: 118 },
          5: { cellWidth: 70 },
          6: { halign: "right", cellWidth: 70 },
        },
        didParseCell: colorNetCell(6),
      }),
    );
    var pages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.line(M, H - 28, W - M, H - 28);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(TEXT_SOFT[0], TEXT_SOFT[1], TEXT_SOFT[2]);
      doc.text(
        CLINIC_NAME +
          "  |  Doctor finance & collections report" +
          (doctorName ? "  |  " + doctorLabel(doctorName) : "") +
          "  |  Confidential",
        M,
        H - 16,
      );
      doc.text("Page " + p + " of " + pages, W - M, H - 16, {
        align: "right",
      });
    }
    return doc;
  }
  async function loadJson(url) {
    try {
      var response = await fetch(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      var result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load " + url);
      }
      return result;
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
      toast.style.cssText =
        "position:fixed;right:24px;bottom:24px;z-index:99999;min-width:300px;max-width:calc(100vw - 48px);padding:18px 26px;border-radius:14px;background:#16803d;color:#fff;font-size:15px;font-weight:600;box-shadow:0 8px 22px rgba(0,0,0,0.18);transition:opacity 0.2s ease;opacity:0;pointer-events:none;";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    toast.style.opacity = "1";
    window.clearTimeout(showReportMessage.timer);
    showReportMessage.timer = window.setTimeout(function () {
      toast.classList.remove("show");
      toast.style.opacity = "0";
    }, 2600);
  }
  function setButtonBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    var label = button.querySelector("span");
    if (label) label.textContent = busy ? "Generating..." : "Export PDF";
  }
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function monthPeriod(year, monthIndex) {
    return {
      start: new Date(year, monthIndex, 1),
      end: new Date(year, monthIndex + 1, 1),
      label: MONTH_NAMES[monthIndex] + " " + year,
      fileTag: year + "-" + pad2(monthIndex + 1),
      monthKey: year + "-" + pad2(monthIndex + 1),
    };
  }
  function injectPeriodModalStyles() {
    if (document.getElementById("finReportPeriodStyles")) return;
    var style = document.createElement("style");
    style.id = "finReportPeriodStyles";
    style.textContent =
      ".fin-period-backdrop{position:fixed;inset:0;background:rgba(15,30,22,.45);display:flex;align-items:center;justify-content:center;z-index:99998;padding:16px}" +
      ".fin-period-modal{background:#fff;border-radius:16px;width:100%;max-width:420px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:inherit;color:#17221b}" +
      ".fin-period-modal h3{margin:0 0 4px;font-size:18px}" +
      ".fin-period-modal p{margin:0 0 16px;font-size:12.5px;color:#68756d;line-height:1.5}" +
      ".fin-period-modal label{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;color:#68756d;margin:12px 0 6px}" +
      ".fin-period-modal select,.fin-period-modal input{width:100%;box-sizing:border-box;height:42px;border:1px solid #e2e9e4;border-radius:10px;padding:0 12px;font:inherit;font-size:14px;background:#fff;color:#17221b}" +
      ".fin-period-row{display:flex;gap:10px}.fin-period-row>div{flex:1}" +
      ".fin-period-error{color:#b04747;font-size:12px;margin-top:10px;min-height:16px}" +
      ".fin-period-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}" +
      ".fin-period-actions button{height:40px;padding:0 18px;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;border:1px solid #e2e9e4;background:#fff;color:#17221b}" +
      ".fin-period-actions button.primary{background:#16803d;border-color:#16803d;color:#fff}";
    document.head.appendChild(style);
  }
  function openPeriodModal(onConfirm) {
    if (document.getElementById("finReportPeriodBackdrop")) return;
    injectPeriodModalStyles();
    var now = new Date();
    var currentMonth = now.getFullYear() + "-" + pad2(now.getMonth() + 1);
    var today = currentMonth + "-" + pad2(now.getDate());
    var backdrop = document.createElement("div");
    backdrop.className = "fin-period-backdrop";
    backdrop.id = "finReportPeriodBackdrop";
    backdrop.innerHTML =
      '<div class="fin-period-modal" role="dialog" aria-modal="true" aria-labelledby="finPeriodTitle">' +
      '<h3 id="finPeriodTitle">Export Finance Report</h3>' +
      "<p>Choose which period to include. Transactions are filtered by their date and payments by the date they were received.</p>" +
      '<label for="finPeriodType">PERIOD</label>' +
      '<select id="finPeriodType">' +
      '<option value="all">All time</option>' +
      '<option value="this">This month</option>' +
      '<option value="last">Last month</option>' +
      '<option value="month">Specific month</option>' +
      '<option value="range">Custom date range</option>' +
      "</select>" +
      '<div id="finPeriodMonthWrap" hidden><label for="finPeriodMonth">MONTH</label>' +
      '<input type="month" id="finPeriodMonth" value="' +
      currentMonth +
      '" /></div>' +
      '<div id="finPeriodRangeWrap" class="fin-period-row" hidden>' +
      '<div><label for="finPeriodFrom">FROM</label><input type="date" id="finPeriodFrom" value="' +
      currentMonth +
      '-01" max="' +
      today +
      '" /></div>' +
      '<div><label for="finPeriodTo">TO</label><input type="date" id="finPeriodTo" value="' +
      today +
      '" /></div></div>' +
      '<div class="fin-period-error" id="finPeriodError"></div>' +
      '<div class="fin-period-actions">' +
      '<button type="button" id="finPeriodCancel">Cancel</button>' +
      '<button type="button" class="primary" id="finPeriodConfirm">Download PDF</button>' +
      "</div></div>";
    document.body.appendChild(backdrop);
    var typeSel = backdrop.querySelector("#finPeriodType");
    var monthWrap = backdrop.querySelector("#finPeriodMonthWrap");
    var rangeWrap = backdrop.querySelector("#finPeriodRangeWrap");
    var errorBox = backdrop.querySelector("#finPeriodError");
    function close() {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector("#finPeriodCancel").onclick = close;
    typeSel.onchange = function () {
      monthWrap.hidden = typeSel.value !== "month";
      rangeWrap.hidden = typeSel.value !== "range";
      errorBox.textContent = "";
    };
    backdrop.querySelector("#finPeriodConfirm").onclick = function () {
      var type = typeSel.value;
      var period = null;
      if (type === "this") {
        period = monthPeriod(now.getFullYear(), now.getMonth());
      } else if (type === "last") {
        var last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        period = monthPeriod(last.getFullYear(), last.getMonth());
      } else if (type === "month") {
        var mv = backdrop.querySelector("#finPeriodMonth").value;
        if (!/^\d{4}-\d{2}$/.test(mv)) {
          errorBox.textContent = "Please select a month.";
          return;
        }
        period = monthPeriod(
          Number(mv.slice(0, 4)),
          Number(mv.slice(5, 7)) - 1,
        );
      } else if (type === "range") {
        var from = backdrop.querySelector("#finPeriodFrom").value;
        var to = backdrop.querySelector("#finPeriodTo").value;
        if (!from || !to) {
          errorBox.textContent = "Please select both dates.";
          return;
        }
        if (from > to) {
          errorBox.textContent = "The start date must be before the end date.";
          return;
        }
        var f = from.split("-").map(Number);
        var t = to.split("-").map(Number);
        var nice = function (d) {
          return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        };
        var startDate = new Date(f[0], f[1] - 1, f[2]);
        var endDate = new Date(t[0], t[1] - 1, t[2]);
        period = {
          start: startDate,
          end: new Date(t[0], t[1] - 1, t[2] + 1),
          label: nice(startDate) + " - " + nice(endDate),
          fileTag: from + "_to_" + to,
        };
      }
      close();
      onConfirm(period);
    };
  }
  async function exportFinanceReportPdf(period) {
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
        loadJson(PATIENT_API),
        loadJson(
          EXPENSES_API +
            "?month=" +
            encodeURIComponent(
              period && period.monthKey
                ? period.monthKey
                : monthKey(new Date()),
            ),
        ),
        loadJson(EXPENSES_API + "?action=audit&limit=100"),
      ]);
      var transactionsData =
        results[0] && Array.isArray(results[0].data) ? results[0].data : null;
      var appointmentsData =
        results[1] && Array.isArray(results[1].data) ? results[1].data : [];
      var recordsData = null;
      if (results[2]) {
        recordsData = Array.isArray(results[2].data)
          ? results[2].data
          : Array.isArray(results[2].records)
            ? results[2].records
            : null;
      }
      var expensesData = results[3] ? results[3].data : null;
      var auditData =
        results[4] && Array.isArray(results[4].data) ? results[4].data : [];
      if (!transactionsData) {
        showReportMessage("Unable to load finance records.");
        return;
      }
      var patientIds = buildDoctorPatientIds(appointmentsData, recordsData);
      if (!Object.keys(patientIds).length) {
        showReportMessage("No patient records found for this doctor.");
        return;
      }
      var hasTransactions = transactionsData.some(function (raw) {
        return patientIds[String(raw.patient_id || "").trim()] === true;
      });
      if (!hasTransactions) {
        showReportMessage("No transactions available to export.");
        return;
      }
      var doc = buildReportDoc(window.jspdf.jsPDF, {
        transactions: transactionsData,
        appointments: appointmentsData,
        patientIds: patientIds,
        expenses: expensesData,
        audit: auditData,
        period: period || null,
      });
      doc.save(
        "DentaNueva_Doctor_Finance_Report" +
          (period && period.fileTag ? "_" + period.fileTag : "") +
          "_" +
          dateKey(new Date()) +
          ".pdf",
      );
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
      if (button)
        button.addEventListener("click", function () {
          openPeriodModal(exportFinanceReportPdf);
        });
    });
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildReportDoc: buildReportDoc };
  }
})();
