document.addEventListener("DOMContentLoaded", () => {
  initializeDashboard();
});
const APPOINTMENTS_API = "../../api/appointments.php";
const PATIENT_RECORD_API = "../../api/patient_records.php";
const DOCTORS_API = "../../api/doctors.php";
const FINANCE_API = "../../api/finance/transactions.php";
const INVENTORY_API = "../../api/inventory.php?action=list";
let dashboardLoaded = false;
async function initializeDashboard() {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  setInterval(() => {
    renderDentistAvailability();
  }, 1000);
  await renderDashboard();
  setupRefreshButton();
  setupQuickActions();
  setupInventoryInteractions();
  setupDentistInteractions();
  window.addEventListener("focus", () => {
    void renderDashboard();
  });
  window.addEventListener("inventory:data-changed", () => {
    renderDashboard();
  });
  window.addEventListener("appointmentStatusChanged", () => {
    renderDashboard();
  });
  window.addEventListener("appointmentsUpdated", () => {
    renderDashboard();
  });
  window.addEventListener("patientsUpdated", () => {
    renderDashboard();
  });
  window.addEventListener("patientAdded", () => {
    renderDashboard();
  });
  window.addEventListener("patientUpdated", () => {
    renderDashboard();
  });
  window.addEventListener("patientDeleted", () => {
    renderDashboard();
  });
}
const dashboardData = {
  patients: [],
  appointments: [],
  dentists: [],
  inventory: [],
  transactions: [],
};
async function loadDashboardData() {
  const responses = await Promise.all([
    fetch(APPOINTMENTS_API, { credentials: "same-origin", cache: "no-store" }),
    fetch(PATIENT_RECORD_API, {
      credentials: "same-origin",
      cache: "no-store",
    }),
    fetch(DOCTORS_API, { credentials: "same-origin", cache: "no-store" }),
    fetch(FINANCE_API, { credentials: "same-origin", cache: "no-store" }),
    fetch(INVENTORY_API, { credentials: "same-origin", cache: "no-store" }),
  ]);
  responses.forEach((response, index) => {
    if (!response.ok) {
      throw new Error(`Dashboard API request ${index + 1} failed.`);
    }
  });
  const results = await Promise.all(
    responses.map((response) => response.json()),
  );
  dashboardData.appointments = Array.isArray(results[0].data)
    ? results[0].data.map(normalizeDashboardAppointment)
    : [];
  dashboardData.patients = Array.isArray(results[1].data)
    ? results[1].data
    : [];
  const doctorRecords = extractDoctorCollection(results[2].data);
  dashboardData.dentists = removeDuplicateDentists(
    doctorRecords.map(normalizeDashboardDentist),
  );
  dashboardData.transactions = Array.isArray(results[3].data)
    ? results[3].data
    : [];
  dashboardData.inventory = Array.isArray(results[4].data?.items)
    ? results[4].data.items
    : [];
  dashboardLoaded = true;
}
function getStoredAppointments() {
  return dashboardData.appointments;
}
function normalizeDashboardAppointment(appointment) {
  if (!appointment || typeof appointment !== "object") {
    return {
      id: "",
      patientName: "Unknown Patient",
      dentist: "Unassigned",
      dentistRaw: "",
      service: "Appointment",
      date: "",
      time: "",
      status: "scheduled",
    };
  }
  const details =
    appointment.appointmentDetails ||
    appointment.details ||
    appointment.appointment_details ||
    {};
  const patientName =
    appointment.patientName ||
    appointment.patient ||
    appointment.patient_name ||
    appointment.name ||
    appointment.fullName ||
    appointment.full_name ||
    details.patientName ||
    details.patient ||
    details.patient_name ||
    details.name ||
    details.fullName ||
    "Unknown Patient";
  const service =
    appointment.serviceType ||
    appointment.service ||
    appointment.service_type ||
    appointment.type ||
    appointment.procedure ||
    appointment.procedureType ||
    appointment.treatment ||
    details.serviceType ||
    details.service ||
    details.service_type ||
    details.type ||
    details.procedure ||
    details.procedureType ||
    details.treatment ||
    "Appointment";
  const date =
    appointment.appointmentDate ||
    appointment.appointment_date ||
    appointment.date ||
    details.appointmentDate ||
    details.appointment_date ||
    details.date ||
    "";
  const time =
    appointment.appointmentTime ||
    appointment.appointment_time ||
    appointment.time ||
    appointment.startTime ||
    appointment.start_time ||
    appointment.start ||
    details.appointmentTime ||
    details.appointment_time ||
    details.time ||
    details.startTime ||
    details.start_time ||
    details.start ||
    "";
  const rawStatus = appointment.status || details.status || "scheduled";
  const status = normalizeAppointmentStatus(rawStatus);
  const dentistRaw =
    appointment.dentistRaw ||
    appointment.dentist ||
    appointment.doctor ||
    appointment.doctorName ||
    appointment.doctor_name ||
    appointment.doctorId ||
    appointment.doctor_id ||
    details.dentist ||
    details.doctor ||
    details.doctorName ||
    details.doctor_name ||
    details.doctorId ||
    details.doctor_id ||
    "";
  return {
    ...appointment,
    id:
      appointment.id ??
      appointment.appointmentId ??
      appointment.appointment_id ??
      details.id ??
      details.appointmentId ??
      "",
    patientName: String(patientName).trim(),
    dentist: String(dentistRaw).trim(),
    dentistRaw: String(dentistRaw).trim(),
    service: String(service).trim(),
    date: normalizeAppointmentDate(date),
    time: normalizeAppointmentTime(time),
    status,
  };
}
function normalizeAppointmentStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (
    value === "" ||
    value === "scheduled" ||
    value === "schedule" ||
    value === "waiting" ||
    value === "pending" ||
    value === "confirmed"
  ) {
    return "scheduled";
  }
  if (
    value === "checkedin" ||
    value === "checked in" ||
    value === "check in" ||
    value === "check-in"
  ) {
    return "checkedin";
  }
  if (value === "in consultation" || value === "inconsultation") {
    return "in consultation";
  }
  if (
    value === "complete" ||
    value === "ready complete" ||
    value === "readycomplete"
  ) {
    return "completed";
  }
  if (value === "completed" || value === "done") {
    return "completed";
  }
  if (value === "cancelled" || value === "canceled") {
    return "cancelled";
  }
  if (value === "no show" || value === "noshow") {
    return "no-show";
  }
  return "scheduled";
}
function extractDoctorCollection(data) {
  if (!data) {
    return [];
  }
  if (Array.isArray(data)) {
    return data.filter(isDoctorRecord);
  }
  if (typeof data !== "object") {
    return [];
  }
  const preferredProperties = [
    "doctors",
    "doctorRecords",
    "doctor_records",
    "doctorList",
    "doctorsList",
    "records",
    "data",
    "items",
    "list",
  ];
  for (const property of preferredProperties) {
    if (Array.isArray(data[property])) {
      const doctors = data[property].filter(isDoctorRecord);
      if (doctors.length > 0) {
        return doctors;
      }
      if (data[property].length === 0) {
        return [];
      }
    }
  }
  const objectValues = Object.values(data);
  const directDoctorValues = objectValues.filter(isDoctorRecord);
  if (directDoctorValues.length > 0) {
    return directDoctorValues;
  }
  let bestNestedCollection = [];
  for (const value of objectValues) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const nestedDoctors = extractDoctorCollection(value);
    if (nestedDoctors.length > bestNestedCollection.length) {
      bestNestedCollection = nestedDoctors;
    }
  }
  return bestNestedCollection;
}
function isDoctorRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }
  const doctorFields = [
    "user_id",
    "userId",
    "doctor_id",
    "doctorId",
    "firstname",
    "firstName",
    "lastname",
    "lastName",
    "name",
    "fullName",
    "email",
    "specialization",
    "status",
  ];
  return doctorFields.some(
    (field) =>
      Object.prototype.hasOwnProperty.call(record, field) &&
      record[field] !== null &&
      record[field] !== undefined &&
      String(record[field]).trim() !== "",
  );
}
function normalizeDashboardDentist(dentist) {
  if (!dentist || typeof dentist !== "object") {
    return {
      id: "",
      name: "Unknown Dentist",
      specialization: "Dentist",
      email: "",
      status: "active",
    };
  }
  const firstName =
    dentist.firstname ?? dentist.firstName ?? dentist.first_name ?? "";
  const lastName =
    dentist.lastname ?? dentist.lastName ?? dentist.last_name ?? "";
  const fullName =
    dentist.name ??
    dentist.fullName ??
    dentist.full_name ??
    `${firstName} ${lastName}`;
  const name =
    String(fullName).trim() ||
    `${firstName} ${lastName}`.trim() ||
    "Unknown Dentist";
  return {
    ...dentist,
    id:
      dentist.user_id ??
      dentist.userId ??
      dentist.doctor_id ??
      dentist.doctorId ??
      dentist.id ??
      "",
    name,
    specialization:
      String(dentist.specialization ?? dentist.specialty ?? "Dentist").trim() ||
      "Dentist",
    email: String(dentist.email ?? "").trim(),
    status: String(dentist.status ?? "active").trim(),
  };
}
function removeDuplicateDentists(dentists) {
  const unique = [];
  const seen = new Set();
  dentists.forEach((dentist) => {
    if (!dentist || typeof dentist !== "object") {
      return;
    }
    const identity = String(dentist.id || dentist.name || "")
      .trim()
      .toLowerCase();
    if (!identity || seen.has(identity)) {
      return;
    }
    seen.add(identity);
    unique.push(dentist);
  });
  return unique;
}
function resolveDentistName(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "Unassigned";
  }
  const normalized = text.toLowerCase();
  const matchedDentist = dashboardData.dentists.find((dentist) => {
    const id = String(dentist.id || "")
      .trim()
      .toLowerCase();
    const doctorId = String(dentist.doctor_id || dentist.doctorId || "")
      .trim()
      .toLowerCase();
    const userId = String(dentist.user_id || dentist.userId || "")
      .trim()
      .toLowerCase();
    const name = String(dentist.name || "")
      .trim()
      .toLowerCase();
    return (
      normalized === id ||
      normalized === doctorId ||
      normalized === userId ||
      normalized === name
    );
  });
  return matchedDentist ? matchedDentist.name : text;
}
function getDentistStatus(dentist) {
  const accountStatus = String(dentist?.status || "")
    .trim()
    .toLowerCase();
  if (
    accountStatus === "inactive" ||
    accountStatus === "off duty" ||
    accountStatus === "offduty"
  ) {
    return {
      label: "Off Duty",
      className: "status-offduty",
    };
  }
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const clinicClosingMinutes = 19 * 60;
  if (currentMinutes >= clinicClosingMinutes) {
    return {
      label: "Off Duty",
      className: "status-offduty",
    };
  }
  const todayAppointments = getTodayAppointments()
    .filter((appointment) => appointmentBelongsToDentist(appointment, dentist))
    .filter(isDentistAppointmentActive)
    .sort(compareAppointments);
  const currentAppointment = todayAppointments.find((appointment) => {
    const startMinutes = getAppointmentMinutes(appointment.time);
    const duration = Math.max(
      1,
      Number(appointment.duration || appointment.duration_minutes || 60),
    );
    const endMinutes = startMinutes + duration;
    return (
      startMinutes !== null &&
      currentMinutes >= startMinutes &&
      currentMinutes < endMinutes
    );
  });
  if (currentAppointment) {
    return {
      label: "With Patient",
      className: "status-withpatient",
    };
  }
  const nextAppointment = todayAppointments.find((appointment) => {
    const startMinutes = getAppointmentMinutes(appointment.time);
    return startMinutes !== null && startMinutes > currentMinutes;
  });
  if (nextAppointment) {
    return {
      label: `Next: ${formatDentistTime(nextAppointment.time)}`,
      className: "status-next",
    };
  }
  return {
    label: "Available",
    className: "status-available",
  };
}
function appointmentBelongsToDentist(appointment, dentist) {
  const appointmentValues = [
    appointment.dentistRaw,
    appointment.dentist,
    appointment.dentistId,
    appointment.dentist_id,
    appointment.doctorId,
    appointment.doctor_id,
    appointment.doctorName,
    appointment.doctor_name,
    appointment.dentistName,
    appointment.dentist_name,
  ]
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const dentistValues = [
    dentist.id,
    dentist.user_id,
    dentist.userId,
    dentist.doctor_id,
    dentist.doctorId,
    dentist.name,
    dentist.fullName,
  ]
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  return appointmentValues.some((appointmentValue) =>
    dentistValues.includes(appointmentValue),
  );
}
function isDentistAppointmentActive(appointment) {
  const status = normalizeAppointmentStatus(appointment.status);
  return (
    status !== "completed" &&
    status !== "cancelled" &&
    status !== "no-show" &&
    appointment.manualReadyComplete !== true &&
    !appointment.cancelledAt
  );
}
function getAppointmentMinutes(time) {
  const normalizedTime = convertTimeTo24Hour(time);
  if (!/^\d{2}:\d{2}$/.test(normalizedTime)) {
    return null;
  }
  const [hour, minute] = normalizedTime.split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return hour * 60 + minute;
}
function formatDentistTime(time) {
  const normalizedTime = convertTimeTo24Hour(time);
  const match = normalizedTime.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return String(time || "");
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
function renderDentistAvailability() {
  const container = document.getElementById("dentistList");
  if (!container) {
    return;
  }
  if (
    !Array.isArray(dashboardData.dentists) ||
    dashboardData.dentists.length === 0
  ) {
    container.innerHTML = createEmptyState(
      "fa-user-doctor",
      "No dentist information available",
    );
    return;
  }
  container.innerHTML = dashboardData.dentists.map(createDentistHTML).join("");
}
function createDentistHTML(dentist) {
  const status = getDentistStatus(dentist);
  const initials = getInitials(dentist.name);
  return `<div class="dentist-item" data-dentist-id="${escapeHTML(dentist.id)}"><div class="dentist-left"><div class="dentist-avatar">${escapeHTML(initials)}</div><div class="dentist-info"><div class="dentist-name">${escapeHTML(dentist.name)}</div><div class="dentist-spec">${escapeHTML(dentist.specialization)}</div></div></div><div class="dentist-status ${status.className}"><span class="status-dot"></span><span>${escapeHTML(status.label)}</span></div></div>`;
}
function setupDentistInteractions() {
  document.addEventListener("click", (event) => {
    const item = event.target.closest(".dentist-item");
    if (!item) {
      return;
    }
  });
}
function getStoredPatients() {
  return dashboardData.patients;
}
function extractPatientCollection(data) {
  if (!data) {
    return [];
  }
  if (Array.isArray(data)) {
    return data.filter(isPatientRecord);
  }
  if (typeof data !== "object") {
    return [];
  }
  const preferredProperties = [
    "patients",
    "patientRecords",
    "patient_records",
    "patientList",
    "patientsList",
    "records",
    "data",
    "items",
    "list",
  ];
  for (const property of preferredProperties) {
    if (Array.isArray(data[property])) {
      const patients = data[property].filter(isPatientRecord);
      if (patients.length > 0) {
        return patients;
      }
      if (data[property].length === 0) {
        return [];
      }
    }
  }
  const objectValues = Object.values(data);
  const directPatientValues = objectValues.filter(isPatientRecord);
  if (directPatientValues.length > 0) {
    return directPatientValues;
  }
  let bestNestedCollection = [];
  for (const value of objectValues) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const nestedPatients = extractPatientCollection(value);
    if (nestedPatients.length > bestNestedCollection.length) {
      bestNestedCollection = nestedPatients;
    }
  }
  return bestNestedCollection;
}
function isPatientRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }
  const patientFields = [
    "patient_id",
    "patientId",
    "id",
    "firstname",
    "firstName",
    "lastname",
    "lastName",
    "name",
    "fullName",
    "email",
  ];
  return patientFields.some(
    (field) =>
      Object.prototype.hasOwnProperty.call(record, field) &&
      record[field] !== null &&
      record[field] !== undefined &&
      String(record[field]).trim() !== "",
  );
}
function removeDuplicatePatients(patients) {
  const unique = [];
  const seen = new Set();
  patients.forEach((patient) => {
    if (!patient || typeof patient !== "object") {
      return;
    }
    const identity = getPatientIdentity(patient);
    if (!identity || seen.has(identity)) {
      return;
    }
    seen.add(identity);
    unique.push(patient);
  });
  return unique;
}
function getPatientIdentity(patient) {
  const id =
    patient.patient_id ??
    patient.patientId ??
    patient.id ??
    patient.user_id ??
    patient.userId ??
    "";
  if (String(id).trim() !== "") {
    return String(id).trim().toLowerCase();
  }
  const name =
    patient.name ??
    patient.fullName ??
    patient.full_name ??
    `${patient.firstname ?? patient.firstName ?? ""} ${patient.lastname ?? patient.lastName ?? ""}`;
  return String(name).trim().toLowerCase();
}
function getStoredInventory() {
  return dashboardData.inventory;
}
function getStoredTransactions() {
  return dashboardData.transactions;
}
async function renderDashboard() {
  await loadDashboardData();
  updateSummaryCards();
  renderInventoryAlerts();
  renderDentistAvailability();
}
function updateSummaryCards() {
  setText("statTotalPatients", formatNumber(getTotalPatients()));
  const todayAppointments = getTodayAppointments();
  setText("statTodayAppointments", formatNumber(todayAppointments.length));
  setText(
    "statAppointmentsTrend",
    todayAppointments.length > 0
      ? `${todayAppointments.length} scheduled`
      : "No Appointments Today",
  );
  updatePatientTrend();
  updateClinicSummary();
  updateTodayRevenueTrend();
  updateMonthlyRevenueTrend();
  updateAppointmentTrend(todayAppointments);
}
function updateClinicSummary() {
  const todayAppointments = getTodayAppointments();
  const completed = todayAppointments.filter(
    (appointment) =>
      normalizeAppointmentStatus(appointment.status) === "completed",
  ).length;
  const waiting = todayAppointments.filter((appointment) => {
    const status = normalizeAppointmentStatus(appointment.status);
    return status === "scheduled" || status === "checkedin";
  }).length;
  const inConsultation = todayAppointments.filter(
    (appointment) =>
      normalizeAppointmentStatus(appointment.status) === "in consultation",
  ).length;
  const noShows = todayAppointments.filter(
    (appointment) =>
      normalizeAppointmentStatus(appointment.status) === "no-show",
  ).length;
  setText("summaryCompleted", formatNumber(completed));
  setText("summaryWaiting", formatNumber(waiting));
  setText("summaryInConsultation", formatNumber(inConsultation));
  setText("summaryNoShows", formatNumber(noShows));
}
function getTotalPatients() {
  return getStoredPatients().length;
}
function updatePatientTrend() {
  const total = getTotalPatients();
  setText(
    "statPatientsTrend",
    total === 1 ? "Patient in system" : "Patients in system",
  );
}
function getTodayAppointments() {
  const today = getTodayDate();
  return dashboardData.appointments.filter(
    (appointment) => normalizeAppointmentDate(appointment.date) === today,
  );
}
function isExcludedFromToday(appointment) {
  const status = normalizeAppointmentStatus(appointment.status);
  return status === "cancelled" || status === "no-show";
}
function renderInventoryAlerts() {
  const container = document.getElementById("inventoryAlerts");

  if (!container) {
    return;
  }

  const inventory = getStoredInventory();

  if (!Array.isArray(inventory) || inventory.length === 0) {
    container.innerHTML = createEmptyState(
      "fa-box-open",
      "All inventory levels are normal",
    );
    return;
  }

  const getUpdatedTime = (item) => {
    const value =
      item.updated_at ||
      item.updatedAt ||
      item.modified_at ||
      item.modifiedAt ||
      item.created_at ||
      item.createdAt ||
      "";

    const time = value ? new Date(value).getTime() : 0;

    return Number.isNaN(time) ? 0 : time;
  };

  const alerts = inventory
    .filter((item) => {
      const status = getInventoryStatus(item);
      return status === "out" || status === "critical" || status === "low";
    })
    .sort((a, b) => {
      const priority = {
        out: 0,
        critical: 1,
        low: 2,
      };

      const statusDifference =
        priority[getInventoryStatus(a)] - priority[getInventoryStatus(b)];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return getUpdatedTime(b) - getUpdatedTime(a);
    });

  const normalItems = inventory
    .filter((item) => getInventoryStatus(item) === "normal")
    .sort((a, b) => {
      const stockA = Number(
        a.quantity ?? a.stock ?? a.current_stock ?? a.currentStock ?? 0,
      );

      const stockB = Number(
        b.quantity ?? b.stock ?? b.current_stock ?? b.currentStock ?? 0,
      );

      const reorderA = Number(
        a.reorder_level ??
          a.reorderLevel ??
          a.minimum_stock ??
          a.minimumStock ??
          0,
      );

      const reorderB = Number(
        b.reorder_level ??
          b.reorderLevel ??
          b.minimum_stock ??
          b.minimumStock ??
          0,
      );

      return stockA - reorderA - (stockB - reorderB);
    });

  const selectedItems = [
    ...alerts.slice(0, 2),
    ...normalItems.slice(0, Math.max(0, 2 - alerts.length)),
  ];

  if (selectedItems.length === 0) {
    container.innerHTML = createEmptyState(
      "fa-box-open",
      "All inventory levels are normal",
    );
    return;
  }

  container.innerHTML = selectedItems.map(createInventoryHTML).join("");
}
function createInventoryHTML(item) {
  const name = String(
    item.name ??
      item.item_name ??
      item.itemName ??
      item.product_name ??
      item.productName ??
      "Inventory Item",
  ).trim();
  const stock = Number(
    item.quantity ?? item.stock ?? item.current_stock ?? item.currentStock ?? 0,
  );
  const reorderLevel = Number(
    item.reorder_level ??
      item.reorderLevel ??
      item.minimum_stock ??
      item.minimumStock ??
      0,
  );
  const status = getInventoryStatus(item);
  const priority = getInventoryPriority(status);
  return `<div class="inv-item"><div class="inv-left"><div class="inv-icon"><i class="fa-solid fa-box"></i></div><div class="inv-info"><div class="inv-name">${escapeHTML(name)}</div><div class="inv-sub">Stock: ${formatNumber(stock)} · Minimum: ${formatNumber(reorderLevel)}</div></div></div><span class="badge ${priority.className}">${escapeHTML(priority.label)}</span></div>`;
}
function getInventoryStatus(item) {
  const stock = Number(
    item.quantity ?? item.stock ?? item.current_stock ?? item.currentStock ?? 0,
  );
  const reorderLevel = Number(
    item.reorder_level ??
      item.reorderLevel ??
      item.minimum_stock ??
      item.minimumStock ??
      0,
  );
  if (stock <= 0) {
    return "out";
  }
  if (stock <= Math.max(1, reorderLevel * 0.5)) {
    return "critical";
  }
  if (stock <= reorderLevel) {
    return "low";
  }
  return "normal";
}
function getInventoryPriority(status) {
  if (status === "out") {
    return {
      label: "Out of Stock",
      className: "status-out",
    };
  }

  if (status === "critical") {
    return {
      label: "Critical",
      className: "status-critical",
    };
  }

  if (status === "low") {
    return {
      label: "Low Stock",
      className: "status-low",
    };
  }

  return {
    label: "Normal",
    className: "status-normal",
  };
}

function getDashboardPaymentHistory(transaction) {
  if (!transaction || typeof transaction !== "object") {
    return [];
  }

  let paymentHistory =
    transaction.paymentHistory || transaction.payment_history || [];

  if (typeof paymentHistory === "string") {
    try {
      paymentHistory = JSON.parse(paymentHistory);
    } catch (error) {
      paymentHistory = [];
    }
  }

  if (Array.isArray(paymentHistory) && paymentHistory.length > 0) {
    return paymentHistory
      .map((payment) => ({
        amount: Number(payment.amount ?? payment.payment_amount ?? 0),
        date: normalizeAppointmentDate(
          payment.paid_at ||
            payment.created_at ||
            payment.date ||
            transaction.created_at ||
            transaction.date ||
            "",
        ),
        status: String(
          payment.status ||
            payment.payment_status ||
            payment.paymentStatus ||
            "",
        )
          .trim()
          .toLowerCase(),
      }))
      .filter((payment) => payment.amount > 0);
  }

  const hasDatabasePaidAmount =
    transaction.paid_amount !== undefined && transaction.paid_amount !== null;

  const amount = Number(
    transaction.paid_amount ??
      transaction.paidAmount ??
      transaction.paid ??
      transaction.amount ??
      0,
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    return [];
  }

  const isDatabasePaidAmount =
    hasDatabasePaidAmount ||
    transaction.paidAmount !== undefined ||
    transaction.paid !== undefined;

  const status = isDatabasePaidAmount
    ? "paid"
    : String(
        transaction.payment_status ||
          transaction.paymentStatus ||
          transaction.status ||
          "",
      )
        .trim()
        .toLowerCase();

  return [
    {
      amount,
      date: normalizeAppointmentDate(
        transaction.paid_at ||
          transaction.payment_date ||
          transaction.updated_at ||
          transaction.created_at ||
          transaction.date ||
          "",
      ),
      status,
    },
  ];
}

function getTodayPaidTransactions() {
  const today = getTodayDate();

  return getStoredTransactions()
    .flatMap((transaction) => getDashboardPaymentHistory(transaction))
    .filter((payment) => payment.date === today && payment.status === "paid");
}

function getTodayRevenue() {
  return getTodayPaidTransactions().reduce(
    (total, payment) => total + payment.amount,
    0,
  );
}

function getMonthlyRevenue() {
  const currentMonth = getCurrentMonth();

  return getStoredTransactions()
    .flatMap((transaction) => getDashboardPaymentHistory(transaction))
    .filter(
      (payment) =>
        payment.date.slice(0, 7) === currentMonth && payment.status === "paid",
    )
    .reduce((total, payment) => total + payment.amount, 0);
}

function updateTodayRevenueTrend() {
  setText("statTodayRevenue", formatCurrency(getTodayRevenue()));
  setText("statTodayRevenueTrend", "Today's collection");
}
function updateMonthlyRevenueTrend() {
  setText("statMonthlyRevenue", formatCurrency(getMonthlyRevenue()));
  setText("statMonthlyRevenueTrend", "Monthly collection");
}
function updateAppointmentTrend(todayAppointments) {
  const activeCount = todayAppointments.filter(
    (appointment) => !isExcludedFromToday(appointment),
  ).length;
  setText(
    "statAppointmentsTrend",
    activeCount > 0 ? `${activeCount} scheduled` : "No Appointments Today",
  );
}
function updateDateTime() {
  const now = new Date();
  setText(
    "currentDate",
    now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
  );
  setText(
    "currentTime",
    now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  );
}
function setupRefreshButton() {
  const refreshButton = document.getElementById("dashboardRefresh");
  if (!refreshButton) {
    return;
  }
  refreshButton.addEventListener("click", () => {
    void refreshDashboardData();
  });
}
async function refreshDashboardData() {
  try {
    await renderDashboard();
    showDashboardNotification("Dashboard refreshed.", "success");
  } catch (error) {
    console.error(error);
    showDashboardNotification("Unable to refresh dashboard.", "error");
  }
}
function setupQuickActions() {
  document.querySelectorAll("[data-dashboard-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.dashboardAction;
      navigateTo(action);
    });
  });
}
function navigateTo(action) {
  const routes = {
    appointment: "../appointment/appointment.html",
    patients: "../patients/patients.html",
    inventory: "../inventory/inventory.html",
    finance: "../finance/finance.html",
  };
  if (routes[action]) {
    window.location.href = routes[action];
  }
}
function setupInventoryInteractions() {
  document.addEventListener("click", (event) => {
    const item = event.target.closest(".inv-item");
    if (!item) {
      return;
    }
    openInventoryItem(item);
  });
}
function openInventoryItem(item) {
  const name = item.querySelector(".inv-name")?.textContent?.trim();
  if (!name) {
    return;
  }
  window.location.href = `../inventory/inventory.html?search=${encodeURIComponent(name)}`;
}
function createEmptyState(icon, message) {
  return `<div class="empty-state"><i class="fa-solid ${escapeHTML(icon)}"></i><p>${escapeHTML(message)}</p></div>`;
}
function showDashboardNotification(message, type = "success") {
  const existing = document.querySelector(".dashboard-notification");
  if (existing) {
    existing.remove();
  }
  const notification = document.createElement("div");
  notification.className = `dashboard-notification ${type}`;
  const icon = type === "success" ? "fa-circle-check" : "fa-circle-exclamation";
  notification.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHTML(message)}</span>`;
  document.body.appendChild(notification);
  requestAnimationFrame(() => {
    notification.classList.add("show");
  });
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      notification.remove();
    }, 250);
  }, 2500);
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}
function formatNumber(number) {
  return Number(number || 0).toLocaleString("en-US");
}
function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
}
function getTodayDate() {
  return formatDateForComparison(new Date());
}
function getTomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDateForComparison(tomorrow);
}
function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
function formatDateForComparison(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function normalizeAppointmentDate(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const text = String(value).trim();
  const directMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (directMatch) {
    return `${directMatch[1]}-${directMatch[2]}-${directMatch[3]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return formatDateForComparison(date);
}
function normalizeAppointmentTime(value) {
  if (!value) {
    return "";
  }
  return String(value).trim();
}
function formatAppointmentDate(dateString) {
  if (!dateString) {
    return "No date";
  }
  const normalized = normalizeAppointmentDate(dateString);
  const today = getTodayDate();
  const tomorrow = getTomorrowDate();
  if (normalized === today) {
    return "Today";
  }
  if (normalized === tomorrow) {
    return "Tomorrow";
  }
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function compareAppointments(a, b) {
  const dateA = getAppointmentTimestamp(a);
  const dateB = getAppointmentTimestamp(b);
  return dateA - dateB;
}
function getAppointmentTimestamp(appointment) {
  const date = normalizeAppointmentDate(appointment.date);
  const time = convertTimeTo24Hour(appointment.time);
  const timestamp = new Date(`${date}T${time}:00`).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}
function convertTimeTo24Hour(time) {
  if (!time) {
    return "00:00";
  }
  const text = String(time).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/i);
  if (!match) {
    if (/^\d{1,2}:\d{2}$/.test(text)) {
      return text;
    }
    return "00:00";
  }
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = match[3].toUpperCase();
  if (period === "PM" && hour !== 12) {
    hour += 12;
  }
  if (period === "AM" && hour === 12) {
    hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${minute}`;
}
function getInitials(name) {
  if (!name) {
    return "?";
  }
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function escapeHTML(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
window.DentalClinicDashboard = {
  data: dashboardData,
  refresh: () => {
    loadDashboardData();
    renderDashboard();
  },
  update: () => {
    loadDashboardData();
    renderDashboard();
  },
  getTodayAppointments,
  getTodayRevenue,
  getMonthlyRevenue,
  getTotalPatients,
  updateClinicSummary,
};
