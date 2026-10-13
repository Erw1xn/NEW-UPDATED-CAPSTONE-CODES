/*
 * Patient Payment & Treatment Report (PDF)
 * ---------------------------------------
 * Gumagawa ng PDF report para sa naka-login na patient:
 *   1. Patient information + summary
 *   2. All transactions (charges, discount, paid, balance, status)
 *   3. Appointment details (date, time, doctor, service, status)
 *   4. Payment history (confirmed payments lang)
 *
 * Gumagamit ng jsPDF + jsPDF-AutoTable (nilo-load sa payments.html).
 * Umaasa sa globals ng payments.js: payments, CURRENT_PATIENT, CURRENT_PATIENT_ID,
 * CURRENT_PATIENT_NAME, resolveCurrentPatient, syncPaymentsFromFinance,
 * getTransactionGroups, showPaymentMessage.
 */
(function () {
  "use strict";

  var APPOINTMENTS_API = "../../api/appointments.php";
  var CLINIC_NAME = "DentaNueva Dental Clinic";

  var GREEN = [22, 128, 61];
  var GREEN_DARK = [16, 102, 51];
  var GREEN_SOFT = [234, 247, 239];
  var TEXT = [23, 34, 27];
  var TEXT_SOFT = [104, 117, 109];
  var BORDER = [226, 233, 228];
  var AMBER = [189, 116, 21];
  var RED = [176, 71, 71];

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  // Helvetica (built-in PDF font) walang ₱ glyph, kaya "PHP" ang gamit.
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

  function parseDateOnly(value) {
    if (!value) return null;
    var m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(value) {
    var d = parseDateOnly(value);
    if (!d) return "N/A";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function fmtTime(value) {
    var m = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "-";
    var h = Number(m[1]);
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + m[2] + " " + suffix;
  }

  function fmtDateTime(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return "N/A";
    return (
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      "  " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
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

  function doctorLabel(name) {
    var n = String(name || "").trim();
    if (!n) return "-";
    return /^dr\.?\s/i.test(n) ? n : "Dr. " + n;
  }

  function sortByDateDesc(list, getter) {
    return list.slice().sort(function (a, b) {
      return new Date(getter(b) || 0) - new Date(getter(a) || 0);
    });
  }

  function statusColor(label) {
    var v = String(label || "").toLowerCase();
    if (v === "paid" || v === "completed") return GREEN;
    if (v === "partial" || v === "scheduled" || v === "pending") return AMBER;
    if (v === "cancelled" || v === "canceled" || v === "no show") return RED;
    return TEXT_SOFT;
  }

  /* ------------------------------------------------------------------ */
  /* PDF builder (pure function - walang DOM / fetch)                   */
  /* ------------------------------------------------------------------ */

  /**
   * data = {
   *   patient:      { name, patientId, dateOfBirth, gender, phone, email, address },
   *   groups:       [ { transactionId, appointmentId, service, totalCharge,
   *                     discount, amountPaid, balance, payments: [...] } ],
   *   appointments: [ { appointment_id, date, time, doctorName, service,
   *                     duration, status, paymentStatus } ]
   * }
   */
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

    var patient = data.patient || {};
    var groups = data.groups || [];
    var appointments = data.appointments || [];

    function runTable(opts) {
      if (typeof doc.autoTable === "function") doc.autoTable(opts);
      else throw new Error("jsPDF-AutoTable is not loaded.");
      return doc.lastAutoTable.finalY;
    }

    // Appointment lookup (DB appointment_id -> appointment)
    var apptById = {};
    appointments.forEach(function (a) {
      var key = String(a.appointment_id || a.databaseAppointmentId || "");
      if (key) apptById[key] = a;
    });

    // Appointment -> transaction lookup
    var txnByAppt = {};
    groups.forEach(function (g) {
      var key = String(g.appointmentId || "");
      if (key) txnByAppt[key] = g;
    });

    var totals = groups.reduce(
      function (t, g) {
        t.charge += Number(g.totalCharge) || 0;
        t.discount += Number(g.discount) || 0;
        t.paid += Number(g.amountPaid) || 0;
        t.balance += Number(g.balance) || 0;
        return t;
      },
      { charge: 0, discount: 0, paid: 0, balance: 0 },
    );

    /* ---------- Header band ---------- */
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
    doc.text("Patient Payment & Treatment Report", M, 49);

    doc.setFontSize(8.5);
    doc.text(
      "Generated: " +
        new Date().toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        }) +
        " at " +
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      W - M,
      31,
      { align: "right" },
    );
    doc.text("Patient ID: " + (patient.patientId || "-"), W - M, 49, {
      align: "right",
    });

    var y = 70 + 22;

    /* ---------- Patient information ---------- */
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    doc.text("Patient Information", M, y);
    y += 8;

    var info = [
      ["Name", patient.name || "-"],
      ["Patient ID", patient.patientId || "-"],
      [
        "Date of Birth",
        patient.dateOfBirth ? fmtDate(patient.dateOfBirth) : "-",
      ],
      ["Gender", patient.gender || "-"],
      ["Contact No.", patient.phone || "-"],
      ["Email", patient.email || "-"],
    ];
    var colW = CW / 3;
    var boxH = 60;
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.setFillColor(251, 252, 251);
    doc.roundedRect(M, y, CW, boxH + (patient.address ? 18 : 0), 6, 6, "FD");
    info.forEach(function (pair, i) {
      var col = i % 3;
      var row = Math.floor(i / 3);
      var x = M + 12 + col * colW;
      var yy = y + 16 + row * 24;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(TEXT_SOFT[0], TEXT_SOFT[1], TEXT_SOFT[2]);
      doc.text(pair[0].toUpperCase(), x, yy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      doc.text(doc.splitTextToSize(String(pair[1]), colW - 20)[0], x, yy + 11);
    });
    if (patient.address) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(TEXT_SOFT[0], TEXT_SOFT[1], TEXT_SOFT[2]);
      doc.text("ADDRESS", M + 12, y + boxH + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      doc.text(
        doc.splitTextToSize(String(patient.address), CW - 100)[0],
        M + 62,
        y + boxH + 6,
      );
    }
    y += boxH + (patient.address ? 18 : 0) + 18;

    /* ---------- Summary cards ---------- */
    var cards = [
      { label: "TRANSACTIONS", value: String(groups.length), color: TEXT },
      {
        label: "TOTAL BILLED (NET)",
        value: money(totals.charge - totals.discount),
        color: TEXT,
      },
      { label: "TOTAL PAID", value: money(totals.paid), color: GREEN },
      {
        label: "REMAINING BALANCE",
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

    /* ---------- Shared table styling ---------- */
    function baseTable(extra) {
      return Object.assign(
        {
          margin: { top: 40, left: M, right: M, bottom: 40 },
          theme: "grid",
          styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
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
            var c = statusColor(raw);
            hook.cell.styles.textColor = c;
            hook.cell.styles.fontStyle = "bold";
          }
        }
      };
    }

    /* ---------- 1. Transactions ---------- */
    section(
      "1. Transactions",
      "All charges and their payment status, with the doctor assigned to the linked appointment.",
    );

    var txnRows = sortByDateDesc(groups, function (g) {
      return g.payments && g.payments[0] ? g.payments[0].date : "";
    }).map(function (g) {
      var appt = apptById[String(g.appointmentId || "")];
      var statusLabel =
        g.balance <= 0 ? "Paid" : g.amountPaid > 0 ? "Partial" : "Pending";
      return [
        g.transactionId || "N/A",
        fmtDate(g.payments && g.payments[0] ? g.payments[0].date : ""),
        g.service || "Dental Service",
        appt ? doctorLabel(appt.doctorName) : "-",
        money(g.totalCharge),
        money(g.discount),
        money(g.amountPaid),
        money(g.balance),
        statusLabel,
      ];
    });

    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Transaction ID",
            "Date",
            "Service",
            "Doctor",
            "Total",
            "Discount",
            "Paid",
            "Balance",
            "Status",
          ],
        ],
        body: txnRows.length
          ? txnRows
          : emptyRow(9, "No transactions recorded."),
        foot: txnRows.length
          ? [
              [
                { content: "TOTAL", colSpan: 4 },
                money(totals.charge),
                money(totals.discount),
                money(totals.paid),
                money(totals.balance),
                "",
              ],
            ]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 150 },
          1: { cellWidth: 62 },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "center", cellWidth: 50 },
        },
        didParseCell: colorStatusCell(8),
      }),
    );
    y += 22;

    /* ---------- 2. Appointments ---------- */
    section(
      "2. Appointment Details",
      "Scheduled, completed and cancelled visits, with the attending doctor and service.",
    );

    var apptRows = appointments
      .slice()
      .sort(function (a, b) {
        var da = (a.date || "") + " " + (a.time || "");
        var db = (b.date || "") + " " + (b.time || "");
        return da < db ? 1 : da > db ? -1 : 0;
      })
      .map(function (a) {
        var linked = txnByAppt[String(a.appointment_id || "")];
        return [
          fmtDate(a.date),
          fmtTime(a.time),
          doctorLabel(a.doctorName),
          a.service || "Dental Appointment",
          a.duration ? a.duration + " min" : "-",
          titleCase(a.status || "scheduled"),
          linked
            ? titleCase(
                linked.balance <= 0
                  ? "paid"
                  : linked.amountPaid > 0
                    ? "partial"
                    : "unpaid",
              )
            : titleCase(a.paymentStatus || "unpaid"),
          linked ? linked.transactionId : "-",
        ];
      });

    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Date",
            "Time",
            "Doctor",
            "Service",
            "Duration",
            "Appt. Status",
            "Payment",
            "Transaction ID",
          ],
        ],
        body: apptRows.length
          ? apptRows
          : emptyRow(8, "No appointments found."),
        columnStyles: {
          0: { cellWidth: 62 },
          1: { cellWidth: 52 },
          4: { cellWidth: 52, halign: "center" },
          5: { cellWidth: 70, halign: "center" },
          6: { cellWidth: 56, halign: "center" },
          7: { cellWidth: 150 },
        },
        didParseCell: function (hook) {
          colorStatusCell(5)(hook);
          colorStatusCell(6)(hook);
        },
      }),
    );
    y += 22;

    /* ---------- 3. Payment history ---------- */
    section(
      "3. Payment History",
      "Confirmed payments only (pending or unconfirmed online payments are not included).",
    );

    var payRows = [];
    var payTotal = 0;
    var allPayments = [];
    groups.forEach(function (g) {
      (g.payments || []).forEach(function (p) {
        if (p.isPlaceholder) return;
        if (p.status !== "paid" && p.status !== "partial") return;
        allPayments.push(p);
      });
    });
    sortByDateDesc(allPayments, function (p) {
      return p.date;
    }).forEach(function (p) {
      payTotal += Number(p.amount) || 0;
      payRows.push([
        fmtDateTime(p.date),
        p.id || "-",
        p.transactionId || "-",
        p.service || "-",
        p.paymentMethod || "-",
        money(p.amount),
      ]);
    });

    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Date & Time",
            "Payment Ref.",
            "Transaction ID",
            "Service",
            "Method",
            "Amount",
          ],
        ],
        body: payRows.length
          ? payRows
          : emptyRow(6, "No confirmed payments yet."),
        foot: payRows.length
          ? [[{ content: "TOTAL PAID", colSpan: 5 }, money(payTotal)]]
          : undefined,
        showFoot: "lastPage",
        columnStyles: {
          0: { cellWidth: 110 },
          1: { cellWidth: 160 },
          2: { cellWidth: 150 },
          5: { halign: "right", cellWidth: 80 },
        },
      }),
    );

    /* ---------- Footer on every page ---------- */
    var pages = doc.internal.getNumberOfPages();
    for (var i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      doc.line(M, H - 28, W - M, H - 28);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(TEXT_SOFT[0], TEXT_SOFT[1], TEXT_SOFT[2]);
      doc.text(
        CLINIC_NAME +
          "  |  Confidential patient record  |  " +
          (patient.name || ""),
        M,
        H - 16,
      );
      doc.text("Page " + i + " of " + pages, W - M, H - 16, { align: "right" });
    }

    return doc;
  }

  /* ------------------------------------------------------------------ */
  /* Browser glue                                                       */
  /* ------------------------------------------------------------------ */

  async function loadPatientAppointments(patientId) {
    try {
      var response = await fetch(APPOINTMENTS_API, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      var result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load appointments.");
      }
      var list = Array.isArray(result.data) ? result.data : [];
      return list.filter(function (a) {
        return !patientId || String(a.patient_id || a.patientId) === patientId;
      });
    } catch (error) {
      console.error("Unable to load appointments for report:", error);
      return [];
    }
  }

  function setButtonBusy(button, busy) {
    if (!button) return;
    button.disabled = busy;
    var label = button.querySelector("span");
    var icon = button.querySelector("i");
    if (label) label.textContent = busy ? "Generating..." : "Export PDF";
    if (icon)
      icon.className = busy
        ? "fa-solid fa-spinner fa-spin"
        : "fa-solid fa-file-pdf";
  }

  async function exportPatientReportPdf() {
    var button = document.getElementById("exportPdfButton");
    if (button && button.disabled) return;

    if (!window.jspdf || !window.jspdf.jsPDF) {
      showPaymentMessage(
        "PDF library failed to load. Please check your internet connection.",
      );
      return;
    }

    setButtonBusy(button, true);
    try {
      // Siguraduhing latest ang data
      await resolveCurrentPatient();
      await syncPaymentsFromFinance();

      var groups = Object.values(getTransactionGroups());
      if (!CURRENT_PATIENT_ID) {
        showPaymentMessage("Unable to load your patient record.");
        return;
      }

      var rawAppointments = await loadPatientAppointments(CURRENT_PATIENT_ID);
      var appointments = rawAppointments.map(function (a) {
        return {
          appointment_id: a.appointment_id || a.databaseAppointmentId || "",
          date: a.date || a.appointment_date || "",
          time: a.time || a.appointment_time || a.start || "",
          doctorName: a.doctorName || a.doctor_name || a.dentistName || "",
          service: a.service || a.service_type || a.type || "",
          duration: a.duration || "",
          status: a.status || "",
          paymentStatus: a.paymentStatus || "",
        };
      });

      if (!groups.length && !appointments.length) {
        showPaymentMessage("No records available to export yet.");
        return;
      }

      var p = CURRENT_PATIENT || {};
      var patient = {
        name: CURRENT_PATIENT_NAME || "Patient",
        patientId: CURRENT_PATIENT_ID,
        dateOfBirth: p.dateOfBirth || p.date_of_birth || "",
        gender: p.gender || "",
        phone: p.phone || "",
        email: p.email || "",
        address: p.address || "",
      };

      var doc = buildReportDoc(window.jspdf.jsPDF, {
        patient: patient,
        groups: groups,
        appointments: appointments,
      });

      var today = new Date().toISOString().slice(0, 10);
      doc.save(
        "DentaNueva_Report_" + CURRENT_PATIENT_ID + "_" + today + ".pdf",
      );
      showPaymentMessage("PDF report downloaded.");
    } catch (error) {
      console.error("Unable to generate PDF report:", error);
      showPaymentMessage("Unable to generate the PDF report.");
    } finally {
      setButtonBusy(button, false);
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      var button = document.getElementById("exportPdfButton");
      if (button) button.addEventListener("click", exportPatientReportPdf);
    });
  }

  // Para ma-test sa Node
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildReportDoc: buildReportDoc };
  }
})();
