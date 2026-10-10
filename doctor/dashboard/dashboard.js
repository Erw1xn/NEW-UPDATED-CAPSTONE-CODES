const APPOINTMENTS_API = "../../api/appointments.php";
const PATIENT_RECORDS_API = "../../api/patient_records.php";
const FINANCE_API = "../../api/finance/transactions.php";
const CURRENT_USER_API = "../profile/profile.php";
const DAILY_GOAL = 5000;
const WEEKLY_GOAL = 25000;
const SERVICE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#14b8a6",
];
const STATUS = {
  SCHEDULED: "scheduled",
  IN_CONSULTATION: "in_consultation",
  COMPLETED: "completed",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
};
let appointments = [];
let patients = [];
let transactions = [];
let serviceTransactions = [];
let currentUser = null;
let doctorAppointmentIds = new Set();
let doctorPatientIds = new Set();
let weekView = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
};
let selectedService = null;
let procedureSlices = [];
let lastWeeklySignature = "";
let lastProcedureSignature = "";
document.addEventListener("DOMContentLoaded", () => {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  bindDashboardControls();
  void refreshDashboardData();
  setInterval(() => void refreshDashboardData(), 2000);
});
function updateDateTime() {
  const now = new Date();
  const dateElement = document.getElementById("currentDate");
  const timeElement = document.getElementById("currentTime");
  if (dateElement) {
    dateElement.textContent = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (timeElement) {
    timeElement.textContent = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}
function bindDashboardControls() {
  const prevButton = document.getElementById("weekPrevBtn");
  const nextButton = document.getElementById("weekNextBtn");
  const donut = document.getElementById("procedureDonut");
  const legend = document.getElementById("procedureLegend");
  const detail = document.getElementById("procedureDetail");
  if (prevButton) {
    prevButton.addEventListener("click", () => {
      const date = new Date(weekView.year, weekView.month - 1, 1);
      weekView = { year: date.getFullYear(), month: date.getMonth() };
      renderWeeklyChart(loadFinanceTransactions());
    });
  }
  if (nextButton) {
    nextButton.addEventListener("click", () => {
      const now = new Date();
      const date = new Date(weekView.year, weekView.month + 1, 1);
      if (
        date.getFullYear() > now.getFullYear() ||
        (date.getFullYear() === now.getFullYear() &&
          date.getMonth() > now.getMonth())
      ) {
        return;
      }
      weekView = { year: date.getFullYear(), month: date.getMonth() };
      renderWeeklyChart(loadFinanceTransactions());
    });
  }
  if (donut) {
    donut.addEventListener("click", (event) => {
      const slice = getDonutSliceFromEvent(event);
      if (!slice) {
        return;
      }
      toggleSelectedService(slice.name);
    });
    donut.addEventListener("mousemove", (event) => {
      const slice = getDonutSliceFromEvent(event);
      if (!slice) {
        donut.style.cursor = "default";
        hideChartTooltip();
        return;
      }
      donut.style.cursor = "pointer";
      showChartTooltip(
        event,
        `<strong>${escapeHtml(slice.name)}</strong>
<div class="tooltip-row"><span>Amount</span><span>${formatPeso(slice.amount)}</span></div>
<div class="tooltip-row"><span>Share</span><span>${formatPercent(slice.percent)}%</span></div>
<div class="tooltip-row"><span>Transactions</span><span>${slice.count}</span></div>`,
      );
    });
    donut.addEventListener("mouseleave", hideChartTooltip);
  }
  if (legend) {
    legend.addEventListener("click", (event) => {
      const button = event.target.closest("[data-service]");
      if (!button) {
        return;
      }
      toggleSelectedService(button.getAttribute("data-service"));
    });
  }
  if (detail) {
    detail.addEventListener("click", (event) => {
      if (event.target.closest("[data-reset]")) {
        selectedService = null;
        renderProcedureChart(loadDashboardSampleTransactions());
      }
    });
  }
}
function toggleSelectedService(name) {
  selectedService = selectedService === name ? null : name;
  renderProcedureChart(loadDashboardSampleTransactions());
}
function getChartTooltip() {
  let tooltip = document.getElementById("chartTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "chartTooltip";
    tooltip.className = "chart-tooltip";
    document.body.appendChild(tooltip);
  }
  return tooltip;
}
function showChartTooltip(event, html) {
  const tooltip = getChartTooltip();
  tooltip.innerHTML = html;
  tooltip.classList.add("visible");
  moveChartTooltip(event);
}
function moveChartTooltip(event) {
  const tooltip = getChartTooltip();
  const offset = 14;
  let left = event.clientX + offset;
  let top = event.clientY + offset;
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  if (left + width > window.innerWidth - 8) {
    left = event.clientX - width - offset;
  }
  if (top + height > window.innerHeight - 8) {
    top = event.clientY - height - offset;
  }
  tooltip.style.left = `${Math.max(left, 8)}px`;
  tooltip.style.top = `${Math.max(top, 8)}px`;
}
function hideChartTooltip() {
  const tooltip = document.getElementById("chartTooltip");
  if (tooltip) {
    tooltip.classList.remove("visible");
  }
}
function getDonutSliceFromEvent(event) {
  const donut = document.getElementById("procedureDonut");
  if (!donut || procedureSlices.length === 0) {
    return null;
  }
  const rect = donut.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const outerRadius = rect.width / 2;
  const innerRadius = outerRadius * 0.52;
  if (distance > outerRadius || distance < innerRadius) {
    return null;
  }
  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) {
    angle += 360;
  }
  const percent = (angle / 360) * 100;
  return (
    procedureSlices.find(
      (slice) => percent >= slice.start && percent < slice.end,
    ) || procedureSlices[procedureSlices.length - 1]
  );
}
function loadAppointments() {
  return appointments;
}
function loadPatients() {
  return patients;
}
function loadFinanceTransactions() {
  return transactions;
}
function loadDashboardSampleTransactions() {
  return serviceTransactions;
}
function normalizeId(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim().toLowerCase();
}
async function refreshDashboardData() {
  try {
    const [
      appointmentResponse,
      patientResponse,
      userResponse,
      financeResponse,
    ] = await Promise.all([
      fetch(APPOINTMENTS_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch(PATIENT_RECORDS_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch(CURRENT_USER_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch(FINANCE_API, {
        credentials: "include",
        cache: "no-store",
      }),
    ]);
    const appointmentResult = await appointmentResponse.json();
    const patientResult = await patientResponse.json();
    const userResult = await userResponse.json();
    let financeResult = null;
    try {
      financeResult = await financeResponse.json();
    } catch (error) {
      financeResult = null;
    }
    if (!appointmentResponse.ok || !appointmentResult.success) {
      throw new Error(appointmentResult.message || "Appointments unavailable.");
    }
    if (!patientResponse.ok || !patientResult.success) {
      throw new Error(patientResult.message || "Patients unavailable.");
    }
    if (!userResponse.ok || !userResult.success || !userResult.user) {
      throw new Error(userResult.message || "Doctor profile unavailable.");
    }
    currentUser = userResult.user;
    const allAppointments = Array.isArray(appointmentResult.data)
      ? appointmentResult.data
      : [];
    appointments = allAppointments.filter((appointment) =>
      appointmentBelongsToCurrentDoctor(appointment),
    );
    doctorAppointmentIds = new Set();
    doctorPatientIds = new Set();
    appointments.forEach((appointment) => {
      [
        appointment.appointment_id,
        appointment.databaseAppointmentId,
        appointment.appointmentId,
        appointment.appointment_uid,
      ].forEach((value) => {
        const id = normalizeId(value);
        if (id !== "") {
          doctorAppointmentIds.add(id);
        }
      });
      const patientId = normalizeId(
        appointment.patient_id ?? appointment.patientId,
      );
      if (patientId !== "") {
        doctorPatientIds.add(patientId);
      }
    });
    patients = Array.isArray(patientResult.data) ? patientResult.data : [];
    if (
      financeResponse.ok &&
      financeResult &&
      financeResult.success &&
      Array.isArray(financeResult.data)
    ) {
      const doctorFinanceData = financeResult.data.filter((transaction) =>
        transactionBelongsToCurrentDoctor(transaction),
      );
      transactions = flattenFinancePayments(doctorFinanceData);
      serviceTransactions = doctorFinanceData.map((transaction) => ({
        service:
          String(transaction.service_name || "").trim() || "Consultation",
        paid: Math.max(Number(transaction.paid_amount) || 0, 0),
      }));
    } else {
      transactions = [];
      serviceTransactions = [];
    }
    renderDashboard();
  } catch (error) {
    console.error("Unable to load dashboard data from database:", error);
  }
}
function appointmentBelongsToCurrentDoctor(appointment) {
  if (!currentUser || !appointment) {
    return false;
  }
  const currentIdentities = [
    currentUser.user_id,
    currentUser.userId,
    currentUser.id,
    currentUser.doctor_id,
    currentUser.doctorId,
    currentUser.dentist_id,
    currentUser.dentistId,
  ]
    .filter(
      (value) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    )
    .map((value) => String(value).trim().toLowerCase());
  const appointmentIdentities = [
    appointment.doctor_id,
    appointment.doctorId,
    appointment.dentist_id,
    appointment.dentistId,
    appointment.dentist,
  ]
    .filter(
      (value) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    )
    .map((value) => String(value).trim().toLowerCase());
  if (
    currentIdentities.some((identity) =>
      appointmentIdentities.includes(identity),
    )
  ) {
    return true;
  }
  const currentDoctorId = String(
    currentUser.doctor_id ||
      currentUser.doctorId ||
      currentUser.dentist_id ||
      currentUser.dentistId ||
      "",
  )
    .trim()
    .toLowerCase();
  if (currentDoctorId) {
    const numericDoctorMatch = currentDoctorId.match(/^doc-(\d+)$/i);
    if (numericDoctorMatch) {
      const numericId = numericDoctorMatch[1];
      if (appointmentIdentities.includes(numericId)) {
        return true;
      }
    }
  }
  return false;
}
function patientBelongsToCurrentDoctor(patient) {
  if (!currentUser || !patient) {
    return false;
  }
  if (appointmentBelongsToCurrentDoctor(patient)) {
    return true;
  }
  const patientId = normalizeId(
    patient.patient_id ?? patient.patientId ?? patient.id,
  );
  return patientId !== "" && doctorPatientIds.has(patientId);
}
function transactionBelongsToCurrentDoctor(transaction) {
  if (!currentUser || !transaction) {
    return false;
  }
  const patientId = normalizeId(
    transaction.patient_id ?? transaction.patientId,
  );
  return patientId !== "" && doctorPatientIds.has(patientId);
}
function flattenFinancePayments(financeData) {
  const result = [];
  financeData.forEach((transaction) => {
    const paymentHistory = Array.isArray(transaction.paymentHistory)
      ? transaction.paymentHistory
      : Array.isArray(transaction.payment_history)
        ? transaction.payment_history
        : [];
    if (paymentHistory.length > 0) {
      paymentHistory.forEach((payment) => {
        const paymentStatus = String(
          payment.status ||
            payment.payment_status ||
            payment.paymentStatus ||
            "",
        )
          .trim()
          .toLowerCase();
        if (paymentStatus !== "paid") {
          return;
        }
        result.push({
          id:
            payment.payment_uid ||
            payment.payment_id ||
            payment.id ||
            transaction.transaction_uid ||
            transaction.transaction_id ||
            "",
          date:
            payment.paid_at ||
            payment.created_at ||
            transaction.created_at ||
            "",
          service:
            transaction.service_name ||
            transaction.service ||
            transaction.serviceType ||
            transaction.type ||
            "",
          paid: Number(payment.amount) || 0,
        });
      });
      return;
    }
    const paid = Number(
      transaction.paid_amount ??
        transaction.paid ??
        transaction.paymentAmount ??
        0,
    );
    if (paid > 0) {
      result.push({
        id:
          transaction.transaction_uid ||
          transaction.transaction_id ||
          transaction.id ||
          "",
        date: transaction.created_at || transaction.date || "",
        service:
          transaction.service_name ||
          transaction.service ||
          transaction.serviceType ||
          transaction.type ||
          "",
        paid,
      });
    }
  });
  return result;
}
function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function getAppointmentDate(appointment) {
  return (
    appointment.date ||
    appointment.appointmentDate ||
    appointment.appointment_date ||
    ""
  );
}
function getAppointmentTime(appointment) {
  return (
    appointment.start ||
    appointment.time ||
    appointment.appointmentTime ||
    appointment.appointment_time ||
    "10:00"
  );
}
function timeToMinutes(time) {
  if (!time) {
    return 0;
  }
  const parts = String(time).split(":");
  return Number(parts[0]) * 60 + Number(parts[1] || 0);
}
function formatTime(time) {
  if (!time) return "";
  const text = String(time).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return text;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = (match[4] || (hour >= 12 ? "PM" : "AM")).toUpperCase();
  if (match[4]) {
    if (suffix === "AM" && hour === 12) hour = 0;
    if (suffix === "PM" && hour < 12) hour += 12;
  }
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function getInitials(name) {
  return String(name || "Patient")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function normalizeStatus(status) {
  return String(status || STATUS.SCHEDULED)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}
function getTodayAppointments() {
  const today = getTodayKey();
  return loadAppointments()
    .filter((appointment) => {
      const date = getAppointmentDate(appointment);
      const status = normalizeStatus(appointment.status);
      return date === today && status !== STATUS.CANCELLED;
    })
    .sort(
      (a, b) =>
        timeToMinutes(getAppointmentTime(a)) -
        timeToMinutes(getAppointmentTime(b)),
    );
}
function renderDashboard() {
  const patients = loadPatients();
  const transactions = loadFinanceTransactions();
  const dashboardSampleTransactions = loadDashboardSampleTransactions();
  const todayAppointments = getTodayAppointments();
  updatePatientCount(patients);
  updateAppointmentStats(todayAppointments);
  updateClinicSummary(todayAppointments);
  renderTodayAppointments(todayAppointments);
  updateProduction(transactions);
  renderWeeklyChart(transactions);
  renderProcedureChart(dashboardSampleTransactions);
}
function updatePatientCount(patients) {
  const element = document.getElementById("totalPatients");
  if (element) {
    element.textContent = patients.length;
  }
}
function updateAppointmentStats(todayAppointments) {
  const total = todayAppointments.length;
  const scheduled = todayAppointments.filter(
    (appointment) => normalizeStatus(appointment.status) === STATUS.SCHEDULED,
  ).length;
  const appointmentsElement = document.getElementById("appointmentsToday");
  const scheduledElement = document.getElementById("scheduledToday");
  if (appointmentsElement) {
    appointmentsElement.textContent = total;
  }
  if (scheduledElement) {
    scheduledElement.textContent = `${scheduled} scheduled`;
  }
}
function updateClinicSummary(appointments) {
  const scheduled = appointments.filter(
    (appointment) => normalizeStatus(appointment.status) === STATUS.SCHEDULED,
  ).length;
  const consultation = appointments.filter(
    (appointment) =>
      normalizeStatus(appointment.status) === STATUS.IN_CONSULTATION,
  ).length;
  const completed = appointments.filter(
    (appointment) => normalizeStatus(appointment.status) === STATUS.COMPLETED,
  ).length;
  const noShow = appointments.filter(
    (appointment) => normalizeStatus(appointment.status) === STATUS.NO_SHOW,
  ).length;
  setText("summaryScheduled", scheduled);
  setText("summaryConsultation", consultation);
  setText("summaryCompleted", completed);
  setText("summaryNoShow", noShow);
}
function renderTodayAppointments(appointments) {
  const container = document.getElementById("todayAppointmentsList");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  if (appointments.length === 0) {
    container.innerHTML = `
<div class="no-appointments">
<i class="fa-regular fa-calendar-xmark"></i>
<div>
No patient appointments today.
</div>
</div>
`;
    return;
  }
  appointments.forEach((appointment) => {
    const item = document.createElement("div");
    item.className = "appointment-item";
    const patient =
      appointment.patient || appointment.patientName || "Unknown Patient";
    const service =
      appointment.type ||
      appointment.service ||
      appointment.serviceType ||
      "Consultation";
    const time = getAppointmentTime(appointment);
    const status = normalizeStatus(appointment.status);
    item.innerHTML = `
<div class="patient-info">
<div class="patient-avatar">
${getInitials(patient)}
</div>
<div class="patient-details">
<span class="patient-name">
${escapeHtml(patient)}
</span>
<span class="patient-time">
Today · ${formatTime(time)}
</span>
<div class="patient-service">
${escapeHtml(service)}
</div>
</div>
</div>
<span class="status-badge ${getStatusClass(status)}">
${getStatusLabel(status)}
</span>
`;
    container.appendChild(item);
  });
}
function getStatusLabel(status) {
  const normalizedStatus = normalizeStatus(status);
  switch (normalizedStatus) {
    case STATUS.SCHEDULED:
      return "Scheduled";
    case STATUS.IN_CONSULTATION:
      return "In Consultation";
    case STATUS.COMPLETED:
      return "Completed";
    case STATUS.NO_SHOW:
      return "No Show";
    case STATUS.CANCELLED:
      return "Cancelled";
    default:
      return "Scheduled";
  }
}
function getStatusClass(status) {
  const normalizedStatus = normalizeStatus(status);
  switch (normalizedStatus) {
    case STATUS.IN_CONSULTATION:
      return "status-consultation";
    case STATUS.COMPLETED:
      return "status-completed";
    case STATUS.NO_SHOW:
      return "status-no-show";
    case STATUS.CANCELLED:
      return "status-cancelled";
    default:
      return "status-scheduled";
  }
}
function getTransactionDate(transaction) {
  const value =
    transaction.date ||
    transaction.paymentDate ||
    transaction.transactionDate ||
    "";
  return String(value).slice(0, 10);
}
function getTransactionAmount(transaction) {
  const paid = Number(
    transaction.paid ??
      transaction.amountPaid ??
      transaction.paymentAmount ??
      transaction.amount ??
      0,
  );
  return Number.isFinite(paid) ? paid : 0;
}
function getTransactionService(transaction) {
  return String(
    transaction.service ||
      transaction.serviceType ||
      transaction.type ||
      transaction.procedure ||
      "",
  ).trim();
}
function getDateObject(dateValue) {
  if (!dateValue) {
    return null;
  }
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
}
function updateProduction(transactions) {
  const today = getTodayKey();
  const todayRevenue = transactions
    .filter((transaction) => getTransactionDate(transaction) === today)
    .reduce(
      (total, transaction) => total + getTransactionAmount(transaction),
      0,
    );
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyRevenue = transactions
    .filter((transaction) => {
      const date = getDateObject(getTransactionDate(transaction));
      return (
        date &&
        date.getMonth() === currentMonth &&
        date.getFullYear() === currentYear
      );
    })
    .reduce(
      (total, transaction) => total + getTransactionAmount(transaction),
      0,
    );
  const percent = Math.min(100, (todayRevenue / DAILY_GOAL) * 100);
  const value = document.getElementById("productionValue");
  const progress = document.getElementById("productionProgress");
  const label = document.getElementById("productionPercent");
  if (value) {
    value.textContent = `₱${todayRevenue.toLocaleString("en-PH")} / ${DAILY_GOAL.toLocaleString("en-PH")}`;
  }
  if (progress) {
    progress.style.width = `${percent}%`;
  }
  if (label) {
    label.textContent = `${Math.round(percent)}% Complete`;
  }
  setText("todayRevenue", formatPeso(todayRevenue));
  setText("monthlyRevenue", formatPeso(monthlyRevenue));
  const monthLabel = document.getElementById("monthlyRevenueLabel");
  if (monthLabel) {
    monthLabel.textContent = `${new Date().toLocaleDateString("en-US", {
      month: "long",
    })} revenue`;
  }
}
function formatPeso(value) {
  return (
    "₱" +
    Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
function formatPercent(value) {
  const number = Number(value) || 0;
  return number >= 1 || number === 0
    ? String(Math.round(number))
    : number.toFixed(1);
}
function renderWeeklyChart(transactions) {
  const container = document.getElementById("weeklyBars");
  if (!container) {
    return;
  }
  const year = weekView.year;
  const month = weekView.month;
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  setText(
    "weekMonthLabel",
    new Date(year, month, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    }),
  );
  const nextButton = document.getElementById("weekNextBtn");
  if (nextButton) {
    nextButton.disabled = isCurrentMonth;
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const ranges = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, daysInMonth],
  ];
  const weeks = ranges.map(([startDay, endDay], index) => ({
    label: `Week ${index + 1}`,
    startDay,
    endDay,
    total: 0,
    count: 0,
  }));
  transactions.forEach((transaction) => {
    const parts = getTransactionDate(transaction).split("-");
    if (parts.length < 3) {
      return;
    }
    const transactionYear = Number(parts[0]);
    const transactionMonth = Number(parts[1]) - 1;
    const transactionDay = Number(parts[2]);
    if (transactionYear !== year || transactionMonth !== month) {
      return;
    }
    const week = weeks.find(
      (item) =>
        transactionDay >= item.startDay && transactionDay <= item.endDay,
    );
    if (!week) {
      return;
    }
    week.total += getTransactionAmount(transaction);
    week.count += 1;
  });
  const signature = JSON.stringify([
    year,
    month,
    weeks.map((week) => [week.total, week.count]),
  ]);
  if (signature === lastWeeklySignature && container.children.length > 0) {
    return;
  }
  lastWeeklySignature = signature;
  hideChartTooltip();
  container.innerHTML = "";
  const yAxisLabels = document.querySelectorAll(".chart-y-axis span");
  yAxisLabels.forEach((labelElement, index) => {
    const steps = Math.max(yAxisLabels.length - 1, 1);
    labelElement.textContent = Math.round(
      WEEKLY_GOAL * (1 - index / steps),
    ).toLocaleString("en-PH");
  });
  weeks.forEach((week) => {
    const day = document.createElement("div");
    day.className = "day-bar";
    const percent = (week.total / WEEKLY_GOAL) * 100;
    const productionBar = document.createElement("div");
    productionBar.className = "bar production-bar";
    productionBar.style.height = `${Math.min(100, percent)}%`;
    const goalBar = document.createElement("div");
    goalBar.className = "bar goal-bar";
    goalBar.style.height = "100%";
    const startLabel = new Date(year, month, week.startDay).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric" },
    );
    const endLabel = new Date(year, month, week.endDay).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric" },
    );
    const tooltipHtml = `<strong>${week.label}</strong>
<span class="tooltip-sub">${startLabel} - ${endLabel}</span>
<div class="tooltip-row"><span>Service</span><span>${formatPeso(week.total)}</span></div>
<div class="tooltip-row"><span>Goal</span><span>${formatPeso(WEEKLY_GOAL)}</span></div>
<div class="tooltip-row"><span>Progress</span><span>${formatPercent(percent)}%</span></div>
<div class="tooltip-row"><span>Payments</span><span>${week.count}</span></div>`;
    day.addEventListener("mouseenter", (event) =>
      showChartTooltip(event, tooltipHtml),
    );
    day.addEventListener("mousemove", moveChartTooltip);
    day.addEventListener("mouseleave", hideChartTooltip);
    day.appendChild(productionBar);
    day.appendChild(goalBar);
    container.appendChild(day);
  });
}
function renderProcedureChart(transactions) {
  const procedureDonut = document.getElementById("procedureDonut");
  const procedureTotal = document.getElementById("procedureTotal");
  const legend = document.getElementById("procedureLegend");
  const detail = document.getElementById("procedureDetail");
  if (!procedureDonut || !procedureTotal) {
    return;
  }
  const revenueByService = new Map();
  transactions.forEach((transaction) => {
    const service = getTransactionService(transaction) || "Other";
    const amount = Math.max(getTransactionAmount(transaction), 0);
    const existing = revenueByService.get(service) || { amount: 0, count: 0 };
    existing.amount += amount;
    if (amount > 0) {
      existing.count += 1;
    }
    revenueByService.set(service, existing);
  });
  const data = Array.from(revenueByService.entries())
    .map(([name, value]) => ({
      name,
      amount: value.amount,
      count: value.count,
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (selectedService && !data.some((item) => item.name === selectedService)) {
    selectedService = null;
  }
  const signature = JSON.stringify([data, selectedService]);
  if (signature === lastProcedureSignature) {
    return;
  }
  lastProcedureSignature = signature;
  hideChartTooltip();
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  let current = 0;
  procedureSlices = data.map((item, index) => {
    const percent = total > 0 ? (item.amount / total) * 100 : 0;
    const slice = {
      name: item.name,
      amount: item.amount,
      count: item.count,
      percent,
      start: current,
      end: current + percent,
      color: SERVICE_COLORS[index % SERVICE_COLORS.length],
    };
    current += percent;
    return slice;
  });
  const activeSlice = selectedService
    ? procedureSlices.find((slice) => slice.name === selectedService)
    : null;
  procedureTotal.textContent = formatPeso(
    activeSlice ? activeSlice.amount : total,
  ).replace(".00", "");
  if (total === 0) {
    procedureDonut.style.background = "conic-gradient(#dfe5e1 0 100%)";
  } else {
    const segments = procedureSlices.map((slice) => {
      const color =
        activeSlice && slice.name !== activeSlice.name
          ? "#e3e8e5"
          : slice.color;
      return `${color} ${slice.start}% ${slice.end}%`;
    });
    procedureDonut.style.background = `conic-gradient(${segments.join(", ")})`;
  }
  if (legend) {
    legend.innerHTML = procedureSlices
      .map((slice) => {
        const stateClass = activeSlice
          ? slice.name === activeSlice.name
            ? " active"
            : " dimmed"
          : "";
        return `<button type="button" class="procedure-legend-item${stateClass}" data-service="${escapeHtml(slice.name)}" title="${escapeHtml(slice.name)}: ${formatPeso(slice.amount)}"><i style="background:${slice.color}"></i>${escapeHtml(shortenService(slice.name))} ${formatPercent(slice.percent)}%</button>`;
      })
      .join("");
  }
  if (detail) {
    if (activeSlice) {
      detail.innerHTML = `<strong>${escapeHtml(activeSlice.name)}</strong>
<span>${formatPeso(activeSlice.amount)} · ${formatPercent(activeSlice.percent)}% of total · ${activeSlice.count} transaction${activeSlice.count === 1 ? "" : "s"}</span>
<button type="button" class="procedure-reset" data-reset="true">Show all</button>`;
    } else if (total === 0) {
      detail.textContent = "No service revenue recorded yet.";
    } else {
      detail.textContent =
        "Click a slice of the chart or a service below to see its amount.";
    }
  }
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
function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}
function goToAppointments() {
  window.location.href = "Appointment.html";
}
