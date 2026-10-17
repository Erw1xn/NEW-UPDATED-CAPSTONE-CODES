(function () {
  "use strict";
  var INVENTORY_API = "../../api/inventory.php?action=list";
  var APPOINTMENTS_API = "../../api/appointments.php";
  var PATIENTS_API = "../../api/patient_records.php";
  var CLINIC_NAME = "DentaNueva Dental Clinic";
  var GREEN = [22, 128, 61];
  var GREEN_DARK = [16, 102, 51];
  var GREEN_SOFT = [234, 247, 239];
  var TEXT = [23, 34, 27];
  var TEXT_SOFT = [104, 117, 109];
  var BORDER = [226, 233, 228];
  var AMBER = [189, 116, 21];
  var RED = [176, 71, 71];
  var toastTimer = null;
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
  function fmtTime(value) {
    var d = value instanceof Date ? value : parseDateTime(value);
    if (!d) return "-";
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  function fmtClock(value) {
    var m = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "-";
    var h = Number(m[1]);
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + m[2] + " " + suffix;
  }
  function fmtQty(value) {
    var n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
  }
  function doctorLabel(name) {
    var n = String(name || "").trim();
    if (!n) return "-";
    return /^dr\.?\s/i.test(n) ? n : "Dr. " + n;
  }
  function timeValue(value) {
    var d = parseDateTime(value);
    return d ? d.getTime() : 0;
  }
  function isStockOut(type) {
    var v = String(type || "").toLowerCase();
    return v === "stock-out" || v === "out";
  }
  function isStockIn(type) {
    var v = String(type || "").toLowerCase();
    return v === "stock-in" || v === "in";
  }
  function stockStatusLabel(item) {
    var stock = Number(item.stock) || 0;
    var minimum = Number(item.minimum) || 0;
    if (stock <= 0) return "Out of Stock";
    if (stock <= minimum) return "Low Stock";
    return "Normal";
  }
  function expiryStatusLabel(item) {
    var category = String(item.category || "").toLowerCase();
    if (
      category.indexOf("instrument") !== -1 ||
      category.indexOf("equipment") !== -1 ||
      !item.expiry
    ) {
      return "No Expiry";
    }
    var expiry = parseDateTime(item.expiry);
    if (!expiry) return "No Expiry";
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
    if (days <= 0) return "Expired";
    if (days <= 7) return "Expiring Soon";
    return "Normal";
  }
  function statusColor(label) {
    var v = String(label || "").toLowerCase();
    if (v === "normal") return GREEN;
    if (v === "low stock" || v === "expiring soon") return AMBER;
    if (v === "out of stock" || v === "expired") return RED;
    return TEXT_SOFT;
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
    var items = data.items || [];
    var movements = data.movements || [];
    var period = data.period || null;
    if (period && (period.start || period.end)) {
      var startMs = period.start ? period.start.getTime() : -Infinity;
      var endMs = period.end ? period.end.getTime() : Infinity;
      movements = movements.filter(function (m) {
        var t = timeValue(m.date || m.createdAt);
        return t > 0 && t >= startMs && t < endMs;
      });
    }
    var batches = data.batches || [];
    var batchUsage = data.batchUsage || [];
    var appointments = data.appointments || [];
    var patients = data.patients || [];
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
    var patientNameById = {};
    appointments.forEach(function (a) {
      var id = String(a.patientId || a.patient_id || "");
      if (id && a.patient) patientNameById[id] = a.patient;
    });
    patients.forEach(function (p) {
      var id = String(p.patientId || p.patient_id || p.id || "");
      var name = String(
        p.name || (p.firstName || "") + " " + (p.lastName || ""),
      ).trim();
      if (id && name) patientNameById[id] = name;
    });
    var itemById = {};
    items.forEach(function (item) {
      itemById[String(item.id)] = item;
    });
    function describeMovement(m) {
      var appt = m.appointmentId ? apptById[String(m.appointmentId)] : null;
      var patientId = String(
        m.patientId || (appt ? appt.patientId || appt.patient_id : "") || "",
      );
      var patientName =
        patientNameById[patientId] || (appt && appt.patient) || "";
      return { appt: appt, patientId: patientId, patientName: patientName };
    }
    function batchOfMovement(m) {
      if (isStockIn(m.type)) {
        var batch = batches.find(function (entry) {
          return String(entry.movementId) === String(m.id);
        });
        return batch || null;
      }
      var usages = batchUsage.filter(function (entry) {
        return String(entry.movementId) === String(m.id);
      });
      return usages.length ? usages : null;
    }
    var sortedMovements = movements.slice().sort(function (a, b) {
      return (
        timeValue(b.date || b.createdAt) - timeValue(a.date || a.createdAt)
      );
    });
    var outMovements = sortedMovements.filter(function (m) {
      return isStockOut(m.type);
    });
    var inMovements = sortedMovements.filter(function (m) {
      return isStockIn(m.type);
    });
    var totalUnitsOut = outMovements.reduce(function (t, m) {
      return t + (Number(m.quantity) || 0);
    }, 0);
    var lowOutCount = items.filter(function (item) {
      return stockStatusLabel(item) !== "Normal";
    }).length;
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
      "Inventory Usage & Stock Report  |  Period: " +
        (period && period.label ? period.label : "All time"),
      M,
      49,
    );
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
    doc.text("Movement records: " + movements.length, W - M, 49, {
      align: "right",
    });
    var y = 70 + 22;
    var cards = [
      { label: "INVENTORY ITEMS", value: String(items.length), color: TEXT },
      {
        label: "STOCK-OUT RECORDS",
        value: String(outMovements.length),
        color: TEXT,
      },
      {
        label: "TOTAL UNITS CONSUMED",
        value: fmtQty(totalUnitsOut),
        color: GREEN,
      },
      {
        label: "LOW / OUT OF STOCK ITEMS",
        value: String(lowOutCount),
        color: lowOutCount > 0 ? AMBER : GREEN,
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
    function colorStatusCells(colIndexes) {
      return function (hook) {
        if (
          hook.section === "body" &&
          colIndexes.indexOf(hook.column.index) !== -1
        ) {
          var raw = hook.cell.raw;
          if (typeof raw === "string") {
            hook.cell.styles.textColor = statusColor(raw);
            hook.cell.styles.fontStyle = "bold";
          }
        }
      };
    }
    section(
      "1. Consumed Items (Stock-Out Log)",
      "Every item deducted from stock, with the date, time, patient, appointment, doctor and batch it was taken from.",
    );
    var outRows = outMovements.map(function (m) {
      var info = describeMovement(m);
      var appt = info.appt;
      var usages = batchOfMovement(m);
      var batchText = Array.isArray(usages)
        ? usages
            .map(function (u) {
              return u.batchNumber + " (" + fmtQty(u.quantity) + ")";
            })
            .join(", ")
        : "-";
      var patientText = info.patientName
        ? info.patientName + (info.patientId ? "\n" + info.patientId : "")
        : info.patientId || "-";
      var apptText = appt
        ? fmtDate(appt.date || appt.appointment_date) +
          " - " +
          fmtClock(appt.time || appt.appointment_time) +
          "\n" +
          (appt.service || "Dental Appointment") +
          " (#" +
          (appt.appointment_id || m.appointmentId) +
          ")"
        : m.appointmentId
          ? "Appointment #" + m.appointmentId
          : "-";
      return [
        fmtDate(m.date || m.createdAt),
        fmtTime(m.date || m.createdAt),
        m.itemName || "-",
        fmtQty(m.quantity) + " " + (m.unit || ""),
        patientText,
        apptText,
        appt ? doctorLabel(appt.doctorName) : "-",
        batchText,
        fmtQty(m.previousStock) + " -> " + fmtQty(m.newStock),
        m.reason || "-",
      ];
    });
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Date",
            "Time",
            "Item",
            "Qty Used",
            "Patient",
            "Appointment",
            "Doctor",
            "Batch Used",
            "Stock",
            "Purpose / Source",
          ],
        ],
        body: outRows.length
          ? outRows
          : emptyRow(10, "No consumed items recorded."),
        columnStyles: {
          0: { cellWidth: 52 },
          1: { cellWidth: 44 },
          2: { cellWidth: 82 },
          3: { cellWidth: 44, halign: "center" },
          4: { cellWidth: 80 },
          5: { cellWidth: 104 },
          6: { cellWidth: 72 },
          7: { cellWidth: 66 },
          8: { cellWidth: 54, halign: "center" },
        },
      }),
    );
    y += 22;
    section(
      "2. Consumption Summary by Item",
      "Total usage of each item across all patient treatments and manual stock-outs.",
    );
    var usageByItem = {};
    outMovements.forEach(function (m) {
      var key = String(m.itemId || m.itemName || "");
      if (!usageByItem[key]) {
        usageByItem[key] = {
          itemId: m.itemId,
          itemName: m.itemName,
          unit: m.unit,
          times: 0,
          qty: 0,
          patients: {},
          appointments: {},
          last: m.date || m.createdAt,
        };
      }
      var entry = usageByItem[key];
      var info = describeMovement(m);
      entry.times += 1;
      entry.qty += Number(m.quantity) || 0;
      if (info.patientId) entry.patients[info.patientId] = true;
      if (m.appointmentId) entry.appointments[String(m.appointmentId)] = true;
      if (timeValue(m.date || m.createdAt) > timeValue(entry.last)) {
        entry.last = m.date || m.createdAt;
      }
    });
    var summaryRows = Object.keys(usageByItem)
      .map(function (key) {
        return usageByItem[key];
      })
      .sort(function (a, b) {
        return b.qty - a.qty;
      })
      .map(function (entry) {
        var item = itemById[String(entry.itemId)];
        return [
          entry.itemName || "-",
          item ? item.category || "-" : "-",
          String(entry.times),
          fmtQty(entry.qty) + " " + (entry.unit || ""),
          String(Object.keys(entry.patients).length),
          String(Object.keys(entry.appointments).length),
          fmtDate(entry.last),
          item ? fmtQty(item.stock) + " " + (item.unit || "") : "-",
        ];
      });
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Item",
            "Category",
            "Times Used",
            "Total Qty Used",
            "Patients",
            "Appointments",
            "Last Used",
            "Current Stock",
          ],
        ],
        body: summaryRows.length
          ? summaryRows
          : emptyRow(8, "No consumption data yet."),
        columnStyles: {
          2: { halign: "center", cellWidth: 60 },
          3: { halign: "center", cellWidth: 80 },
          4: { halign: "center", cellWidth: 58 },
          5: { halign: "center", cellWidth: 72 },
          6: { cellWidth: 70 },
          7: { halign: "center", cellWidth: 80 },
        },
      }),
    );
    y += 22;
    section(
      "3. Stock-In Log (Restocks)",
      "Items added to inventory, with the batch number and batch expiry date.",
    );
    var inRows = inMovements.map(function (m) {
      var batch = batchOfMovement(m);
      return [
        fmtDate(m.date || m.createdAt),
        fmtTime(m.date || m.createdAt),
        m.itemName || "-",
        "+" + fmtQty(m.quantity) + " " + (m.unit || ""),
        batch && batch.batchNumber ? batch.batchNumber : "-",
        batch && batch.expiry ? fmtDate(batch.expiry) : "-",
        fmtQty(m.previousStock) + " -> " + fmtQty(m.newStock),
        m.reason || "-",
      ];
    });
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Date",
            "Time",
            "Item",
            "Qty Added",
            "Batch / Lot No.",
            "Batch Expiry",
            "Stock",
            "Reason / Source",
          ],
        ],
        body: inRows.length ? inRows : emptyRow(8, "No stock-in recorded."),
        columnStyles: {
          0: { cellWidth: 56 },
          1: { cellWidth: 48 },
          3: { halign: "center", cellWidth: 62 },
          4: { cellWidth: 110 },
          5: { cellWidth: 64 },
          6: { halign: "center", cellWidth: 62 },
        },
      }),
    );
    y += 22;
    section(
      "4. Current Stock Levels",
      "Stock on hand as of this report, with stock and expiry status.",
    );
    var stockRows = items
      .slice()
      .sort(function (a, b) {
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .map(function (item) {
        return [
          String(item.id || "-"),
          item.name || "-",
          item.category || "-",
          fmtQty(item.minimum),
          fmtQty(item.stock),
          item.unit || "-",
          item.expiry ? fmtDate(item.expiry) : "No expiry",
          stockStatusLabel(item),
          expiryStatusLabel(item),
        ];
      });
    y = runTable(
      baseTable({
        startY: y,
        head: [
          [
            "Item ID",
            "Item",
            "Category",
            "Minimum",
            "Stock",
            "Unit",
            "Expiry",
            "Stock Status",
            "Expiry Status",
          ],
        ],
        body: stockRows.length
          ? stockRows
          : emptyRow(9, "No inventory items found."),
        columnStyles: {
          0: { cellWidth: 46 },
          3: { halign: "center", cellWidth: 52 },
          4: { halign: "center", cellWidth: 46 },
          5: { cellWidth: 52 },
          6: { cellWidth: 70 },
          7: { halign: "center", cellWidth: 74 },
          8: { halign: "center", cellWidth: 74 },
        },
        didParseCell: colorStatusCells([7, 8]),
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
        CLINIC_NAME + "  |  Inventory usage & stock report  |  Confidential",
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
  function showReportMessage(message, type) {
    var toast = document.getElementById("inventoryToast");
    var icon = document.getElementById("inventoryToastIcon");
    var text = document.getElementById("inventoryToastMessage");
    if (!toast || !icon || !text) return;
    text.textContent = message;
    toast.classList.remove("error");
    if (type === "error") {
      toast.classList.add("error");
      icon.className = "fa-solid fa-circle-exclamation";
    } else {
      icon.className = "fa-solid fa-circle-check";
    }
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 3000);
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
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function monthPeriod(year, monthIndex) {
    return {
      start: new Date(year, monthIndex, 1),
      end: new Date(year, monthIndex + 1, 1),
      label: MONTH_NAMES[monthIndex] + " " + year,
      fileTag: year + "-" + pad2(monthIndex + 1),
    };
  }
  function injectPeriodModalStyles() {
    if (document.getElementById("invReportPeriodStyles")) return;
    var style = document.createElement("style");
    style.id = "invReportPeriodStyles";
    style.textContent =
      ".inv-period-backdrop{position:fixed;inset:0;background:rgba(15,30,22,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}" +
      ".inv-period-modal{background:#fff;border-radius:16px;width:100%;max-width:420px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:inherit;color:#17221b}" +
      ".inv-period-modal h3{margin:0 0 4px;font-size:18px}" +
      ".inv-period-modal p{margin:0 0 16px;font-size:12.5px;color:#68756d}" +
      ".inv-period-modal label{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;color:#68756d;margin:12px 0 6px}" +
      ".inv-period-modal select,.inv-period-modal input{width:100%;box-sizing:border-box;height:42px;border:1px solid #e2e9e4;border-radius:10px;padding:0 12px;font:inherit;font-size:14px;background:#fff;color:#17221b}" +
      ".inv-period-row{display:flex;gap:10px}.inv-period-row>div{flex:1}" +
      ".inv-period-error{color:#b04747;font-size:12px;margin-top:10px;min-height:16px}" +
      ".inv-period-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}" +
      ".inv-period-actions button{height:40px;padding:0 18px;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;border:1px solid #e2e9e4;background:#fff;color:#17221b}" +
      ".inv-period-actions button.primary{background:#16803d;border-color:#16803d;color:#fff}";
    document.head.appendChild(style);
  }
  function openPeriodModal(onConfirm) {
    if (document.getElementById("invReportPeriodBackdrop")) return;
    injectPeriodModalStyles();
    var now = new Date();
    var currentMonth = now.getFullYear() + "-" + pad2(now.getMonth() + 1);
    var today = currentMonth + "-" + pad2(now.getDate());
    var backdrop = document.createElement("div");
    backdrop.className = "inv-period-backdrop";
    backdrop.id = "invReportPeriodBackdrop";
    backdrop.innerHTML =
      '<div class="inv-period-modal" role="dialog" aria-modal="true" aria-labelledby="invPeriodTitle">' +
      '<h3 id="invPeriodTitle">Export Inventory Report</h3>' +
      "<p>Choose which period of stock movements to include. Item stock levels shown are always the current ones.</p>" +
      '<label for="invPeriodType">PERIOD</label>' +
      '<select id="invPeriodType">' +
      '<option value="all">All time</option>' +
      '<option value="this">This month</option>' +
      '<option value="last">Last month</option>' +
      '<option value="month">Specific month</option>' +
      '<option value="range">Custom date range</option>' +
      "</select>" +
      '<div id="invPeriodMonthWrap" hidden><label for="invPeriodMonth">MONTH</label>' +
      '<input type="month" id="invPeriodMonth" value="' +
      currentMonth +
      '" /></div>' +
      '<div id="invPeriodRangeWrap" class="inv-period-row" hidden>' +
      '<div><label for="invPeriodFrom">FROM</label><input type="date" id="invPeriodFrom" value="' +
      currentMonth +
      '-01" max="' +
      today +
      '" /></div>' +
      '<div><label for="invPeriodTo">TO</label><input type="date" id="invPeriodTo" value="' +
      today +
      '" /></div></div>' +
      '<div class="inv-period-error" id="invPeriodError"></div>' +
      '<div class="inv-period-actions">' +
      '<button type="button" id="invPeriodCancel">Cancel</button>' +
      '<button type="button" class="primary" id="invPeriodConfirm">Download PDF</button>' +
      "</div></div>";
    document.body.appendChild(backdrop);
    var typeSel = backdrop.querySelector("#invPeriodType");
    var monthWrap = backdrop.querySelector("#invPeriodMonthWrap");
    var rangeWrap = backdrop.querySelector("#invPeriodRangeWrap");
    var errorBox = backdrop.querySelector("#invPeriodError");
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
    backdrop.querySelector("#invPeriodCancel").onclick = close;
    typeSel.onchange = function () {
      monthWrap.hidden = typeSel.value !== "month";
      rangeWrap.hidden = typeSel.value !== "range";
      errorBox.textContent = "";
    };
    backdrop.querySelector("#invPeriodConfirm").onclick = function () {
      var type = typeSel.value;
      var period = null;
      if (type === "this") {
        period = monthPeriod(now.getFullYear(), now.getMonth());
      } else if (type === "last") {
        var last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        period = monthPeriod(last.getFullYear(), last.getMonth());
      } else if (type === "month") {
        var mv = backdrop.querySelector("#invPeriodMonth").value;
        if (!/^\d{4}-\d{2}$/.test(mv)) {
          errorBox.textContent = "Please select a month.";
          return;
        }
        period = monthPeriod(
          Number(mv.slice(0, 4)),
          Number(mv.slice(5, 7)) - 1,
        );
      } else if (type === "range") {
        var from = backdrop.querySelector("#invPeriodFrom").value;
        var to = backdrop.querySelector("#invPeriodTo").value;
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
        function nice(d) {
          return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }
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
  async function exportInventoryReportPdf(period) {
    var button = document.getElementById("exportInventoryPdfButton");
    if (button && button.disabled) return;
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showReportMessage(
        "PDF library failed to load. Please check your internet connection.",
        "error",
      );
      return;
    }
    setButtonBusy(button, true);
    try {
      var results = await Promise.all([
        loadJson(INVENTORY_API),
        loadJson(APPOINTMENTS_API),
        loadJson(PATIENTS_API),
      ]);
      var inventory = results[0];
      if (!inventory) {
        showReportMessage("Unable to load inventory records.", "error");
        return;
      }
      var items = Array.isArray(inventory.items) ? inventory.items : [];
      var movements = Array.isArray(inventory.movements)
        ? inventory.movements
        : [];
      if (!items.length && !movements.length) {
        showReportMessage(
          "No inventory records available to export yet.",
          "error",
        );
        return;
      }
      var doc = buildReportDoc(window.jspdf.jsPDF, {
        items: items,
        movements: movements,
        batches: Array.isArray(inventory.batches) ? inventory.batches : [],
        batchUsage: Array.isArray(inventory.batchUsage)
          ? inventory.batchUsage
          : [],
        appointments: Array.isArray(results[1]) ? results[1] : [],
        patients: Array.isArray(results[2]) ? results[2] : [],
        period: period || null,
      });
      var now = new Date();
      var today =
        now.getFullYear() +
        "-" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(now.getDate()).padStart(2, "0");
      var periodTag = period && period.fileTag ? "_" + period.fileTag : "";
      doc.save(
        "DentaNueva_Inventory_Report" + periodTag + "_" + today + ".pdf",
      );
      showReportMessage("Inventory PDF report downloaded.");
    } catch (error) {
      console.error("Unable to generate inventory PDF report:", error);
      showReportMessage("Unable to generate the PDF report.", "error");
    } finally {
      setButtonBusy(button, false);
    }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      var button = document.getElementById("exportInventoryPdfButton");
      if (button)
        button.addEventListener("click", function () {
          openPeriodModal(exportInventoryReportPdf);
        });
    });
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildReportDoc: buildReportDoc };
  }
})();
