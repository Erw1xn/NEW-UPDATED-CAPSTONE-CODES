document.addEventListener("DOMContentLoaded", () => {
  initializePatientDashboard();
});
const PATIENT_RECORD_API = "../../api/patient_records.php";
const DOCTORS_API = "../../api/doctors.php";
const FINANCE_API = "../../api/finance/transactions.php";
let dashboardDoctors = {};
const patientDashboardData = {
  patient: null,
  appointments: [],
  records: [],
  transactions: [],
  notifications: [],
};
async function initializePatientDashboard() {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  setInterval(updateBookingAccess, 60000);
  await loadPatientDashboardData();
  renderPatientDashboard();
  setupAppointmentInteractions();
  window.addEventListener("focus", () => {
    void loadPatientDashboardData().then(renderPatientDashboard);
    renderPatientDashboard();
  });
  window.addEventListener("appointmentStatusChanged", refreshPatientDashboard);
  window.addEventListener("appointmentsUpdated", refreshPatientDashboard);
  window.addEventListener("patientsUpdated", refreshPatientDashboard);
  window.addEventListener("patientAdded", refreshPatientDashboard);
}
function refreshPatientDashboard() {
  void loadPatientDashboardData().then(renderPatientDashboard);
}
async function loadPatientDashboardData() {
  const [recordResponse, financeResponse, doctorsResponse] = await Promise.all([
    fetch(PATIENT_RECORD_API, {
      credentials: "same-origin",
      cache: "no-store",
    }),
    fetch(FINANCE_API, { credentials: "same-origin", cache: "no-store" }),
    fetch(DOCTORS_API, { credentials: "same-origin", cache: "no-store" }),
  ]);
  const recordResult = await recordResponse.json();
  const financeResult = await financeResponse.json();
  const doctorsResult = await doctorsResponse.json();
  if (!recordResponse.ok || !recordResult.success || !recordResult.data) {
    throw new Error(recordResult.message || "Patient record unavailable.");
  }
  patientDashboardData.patient = recordResult.data;
  patientDashboardData.appointments = Array.isArray(
    recordResult.data.appointments,
  )
    ? recordResult.data.appointments
    : [];
  patientDashboardData.records = [recordResult.data];
  patientDashboardData.transactions =
    financeResponse.ok &&
    financeResult.success &&
    Array.isArray(financeResult.data)
      ? financeResult.data
      : [];
  dashboardDoctors = {};
  if (
    doctorsResponse.ok &&
    doctorsResult.success &&
    Array.isArray(doctorsResult.data)
  ) {
    doctorsResult.data.forEach((doctor) => {
      registerDashboardDoctor(doctor);
    });
  }
  patientDashboardData.appointments = patientDashboardData.appointments.map(
    (appointment) => ({
      ...appointment,
      dentist: resolveDashboardDoctorName(appointment),
      dentistRaw: resolveDashboardDoctorName(appointment),
    }),
  );
  patientDashboardData.notifications = getNotifications();
}
function normalizeDashboardDoctorKey(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return "";
  }
  if (/^doc-\d+$/i.test(text)) {
    return text;
  }
  if (/^doc\d+$/i.test(text)) {
    return `doc-${text.substring(3).padStart(4, "0")}`;
  }
  if (/^\d+$/.test(text)) {
    return `doc-${text.padStart(4, "0")}`;
  }
  return text;
}
function registerDashboardDoctor(doctor) {
  if (!doctor || typeof doctor !== "object") {
    return;
  }
  const firstName = String(
    doctor.firstname || doctor.firstName || doctor.first_name || "",
  ).trim();
  const lastName = String(
    doctor.lastname || doctor.lastName || doctor.last_name || "",
  ).trim();
  const name = String(
    doctor.name ||
      doctor.fullName ||
      doctor.full_name ||
      doctor.doctorName ||
      doctor.dentistName ||
      `${firstName} ${lastName}`,
  ).trim();
  if (!name) {
    return;
  }
  const identifiers = [
    doctor.id,
    doctor.user_id,
    doctor.userId,
    doctor.doctor_id,
    doctor.doctorId,
    doctor.dentist_id,
    doctor.dentistId,
  ];
  identifiers.forEach((identifier) => {
    const key = normalizeDashboardDoctorKey(identifier);
    if (key) {
      dashboardDoctors[key] = name;
    }
  });
}
function resolveDashboardDoctorName(appointment) {
  if (!appointment || typeof appointment !== "object") {
    return "Unassigned";
  }
  const details =
    appointment.appointmentDetails ||
    appointment.details ||
    appointment.appointment_details ||
    {};
  const directName =
    appointment.doctorName ||
    appointment.doctor_name ||
    appointment.dentistName ||
    appointment.dentist_name ||
    details.doctorName ||
    details.doctor_name ||
    details.dentistName ||
    details.dentist_name ||
    "";
  const normalizedDirectName = String(directName).trim();
  if (normalizedDirectName && !/^doc-\d+$/i.test(normalizedDirectName)) {
    return normalizedDirectName;
  }
  const doctorValues = [
    appointment.doctorId,
    appointment.doctor_id,
    appointment.dentistId,
    appointment.dentist_id,
    appointment.dentist,
    appointment.doctor,
    appointment.assignedDoctorId,
    appointment.assignedDentistId,
    appointment.assignedDoctor,
    appointment.assignedDentist,
    details.doctorId,
    details.doctor_id,
    details.dentistId,
    details.dentist_id,
    details.dentist,
    details.doctor,
  ];
  for (const value of doctorValues) {
    const key = normalizeDashboardDoctorKey(value);
    if (key && dashboardDoctors[key]) {
      return dashboardDoctors[key];
    }
  }
  return normalizedDirectName || "Unassigned";
}
function getCurrentPatient() {
  return patientDashboardData.patient || { id: "", fullName: "Patient" };
}
function getPatientName(patient) {
  if (!patient) {
    return "Patient";
  }
  const fullName = patient.fullName || patient.full_name || patient.name || "";
  if (String(fullName).trim()) {
    return String(fullName).trim();
  }
  const firstName = patient.firstName || patient.first_name || "";
  const lastName = patient.lastName || patient.last_name || "";
  const name = `${firstName} ${lastName}`.trim();
  return name || "Patient";
}
function getPatientIdentity(patient) {
  if (!patient || typeof patient !== "object") {
    return "";
  }
  return String(
    patient.patientId ??
      patient.patientID ??
      patient.patient_id ??
      patient.id ??
      patient.recordId ??
      patient.recordID ??
      "",
  )
    .trim()
    .toLowerCase();
}
function getStoredAppointments() {
  return patientDashboardData.appointments
    .map(normalizeAppointment)
    .filter((appointment) => isAppointmentForCurrentPatient(appointment));
}
function normalizeAppointment(appointment) {
  if (!appointment || typeof appointment !== "object") {
    return {
      id: "",
      patientId: "",
      patientName: "",
      dentist: "Unassigned",
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
  const patientId =
    appointment.patientId ??
    appointment.patientID ??
    appointment.patient_id ??
    details.patientId ??
    details.patientID ??
    details.patient_id ??
    "";
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
    getPatientName(patientDashboardData.patient);
  const dentist = resolveDashboardDoctorName(appointment);
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
    appointment.scheduledDate ||
    appointment.scheduled_date ||
    details.appointmentDate ||
    details.appointment_date ||
    details.date ||
    details.scheduledDate ||
    details.scheduled_date ||
    "";
  const time =
    appointment.appointmentTime ||
    appointment.appointment_time ||
    appointment.time ||
    appointment.startTime ||
    appointment.start_time ||
    appointment.start ||
    appointment.scheduledTime ||
    appointment.scheduled_time ||
    details.appointmentTime ||
    details.appointment_time ||
    details.time ||
    details.startTime ||
    details.start_time ||
    details.start ||
    details.scheduledTime ||
    details.scheduled_time ||
    "";
  return {
    ...appointment,
    id:
      appointment.id ??
      appointment.appointmentId ??
      appointment.appointment_id ??
      details.id ??
      details.appointmentId ??
      details.appointment_id ??
      "",
    patientId: String(patientId),
    patientName: String(patientName).trim(),
    dentist: String(dentist).trim() || "Unassigned",
    dentistRaw: String(dentist).trim(),
    service: String(service).trim(),
    date: normalizeAppointmentDate(date),
    time: normalizeAppointmentTime(time),
    status: normalizeAppointmentStatus(
      appointment.status || details.status || "scheduled",
    ),
  };
}
function normalizeAppointmentStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\\\\\\_\\\\-]+/g, " ")
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
  if (value === "checkedin" || value === "checked in" || value === "check in") {
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
    return "complete";
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
function resolveDentistName(value) {
  if (!value) {
    return "Unassigned";
  }
  const original = String(value).trim();
  if (!original) {
    return "Unassigned";
  }
  if (
    /^dr\./i.test(original) ||
    /^dr\s/i.test(original) ||
    /^doctor\s/i.test(original)
  ) {
    return original;
  }
  if (/^doc-\d+$/i.test(original)) {
    return original;
  }
  return capitalizeDentistName(original);
}
function capitalizeDentistName(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) {
        return "";
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}
function isAppointmentForCurrentPatient(appointment) {
  const patient = patientDashboardData.patient;
  if (!patient) {
    return false;
  }
  const currentPatientId = getPatientIdentity(patient);
  const appointmentPatientId = String(appointment.patientId || "")
    .trim()
    .toLowerCase();
  if (currentPatientId && appointmentPatientId) {
    if (currentPatientId === appointmentPatientId) {
      return true;
    }
    return false;
  }
  const currentPatientName = getPatientName(patient).trim().toLowerCase();
  const appointmentPatientName = String(appointment.patientName || "")
    .trim()
    .toLowerCase();
  if (
    currentPatientName &&
    currentPatientName !== "patient" &&
    appointmentPatientName &&
    currentPatientName === appointmentPatientName
  ) {
    return true;
  }
  return false;
}
function renderPatientDashboard() {
  updateWelcome();
  updateSummaryCards();
  renderAppointmentSummary();
  updateBookingAccess();
  renderTodayAppointments();
  updateDashboardTooltips();
}
function updateWelcome() {
  const title = document.getElementById("welcomeTitle");
  if (!title) {
    return;
  }
  const name = getPatientName(patientDashboardData.patient);
  const firstName = name.split(/\s+/)[0] || "Patient";
  title.textContent = `Good day, ${firstName}!`;
}
function updateSummaryCards() {
  const upcoming = getUpcomingAppointments();
  const nextAppointment = upcoming[0] || null;
  const paymentTotals = calculatePaymentTotals();
  const medicalRecordComplete = isMedicalRecordComplete();
  setText(
    "statNextAppointment",
    nextAppointment ? formatAppointmentDate(nextAppointment.date) : "None",
  );
  setText(
    "statNextAppointmentInfo",
    nextAppointment
      ? `${formatDisplayTime(nextAppointment.time)} • ${nextAppointment.service}`
      : "No upcoming appointment",
  );
  setText("statBalance", formatCurrency(paymentTotals.balance));
  setText(
    "statBalanceInfo",
    paymentTotals.balance > 0
      ? "Outstanding payment"
      : "No outstanding balance",
  );
  setText(
    "statMedicalRecord",
    medicalRecordComplete ? "Completed" : "Incomplete",
  );
  setText(
    "statMedicalRecordInfo",
    medicalRecordComplete
      ? "Medical form is completed"
      : "Medical form needs to be completed",
  );
}
function updateDashboardTooltips() {
  const nextAppointmentCard = document.getElementById("nextAppointmentCard");
  const currentBalanceCard = document.getElementById("currentBalanceCard");
  const medicalRecordCard = document.getElementById("medicalRecordCard");
  const nextAppointment = getUpcomingAppointments()[0] || null;
  const paymentTotals = calculatePaymentTotals();
  const medicalRecordComplete = isMedicalRecordComplete();
  if (nextAppointmentCard) {
    nextAppointmentCard.title = nextAppointment
      ? `Next Appointment: ${formatAppointmentDate(nextAppointment.date)} • ${formatDisplayTime(nextAppointment.time)} • ${nextAppointment.service}`
      : "Next Appointment: None • No upcoming appointment";
  }
  if (currentBalanceCard) {
    currentBalanceCard.title = `Current Balance: ${formatCurrency(paymentTotals.balance)} • ${paymentTotals.balance > 0 ? "Outstanding payment" : "No outstanding balance"}`;
  }
  if (medicalRecordCard) {
    medicalRecordCard.title = `Medical Record: ${medicalRecordComplete ? "Completed" : "Incomplete"} • ${medicalRecordComplete ? "Medical form is completed" : "Medical form needs to be completed"}`;
  }
  const appointmentsList = document.getElementById("appointmentsList");
  if (appointmentsList) {
    const today = getTodayDate();
    const appointments = patientDashboardData.appointments.filter(
      (appointment) => {
        const appointmentDate = normalizeAppointmentDate(appointment.date);
        return (
          appointmentDate === today &&
          appointment.status !== "cancelled" &&
          appointment.status !== "no-show"
        );
      },
    );
    appointmentsList.title =
      appointments.length === 0
        ? nextAppointment
          ? "Next scheduled appointment"
          : "No appointments scheduled for today"
        : "Today's Appointments • Today's scheduled patients";
  }
  const summaryTotalCard = document.getElementById("summaryTotalCard");
  const summaryCompletedCard = document.getElementById("summaryCompletedCard");
  const summaryScheduledCard = document.getElementById("summaryScheduledCard");
  const summaryRescheduledCard = document.getElementById(
    "summaryRescheduledCard",
  );
  const summaryCancelledCard = document.getElementById("summaryCancelledCard");
  const summaryNoShowCard = document.getElementById("summaryNoShowCard");
  const summaryTooltips = [
    [
      summaryTotalCard,
      "Total Appointments",
      document.getElementById("summaryTotalAppointments"),
    ],
    [
      summaryCompletedCard,
      "Completed",
      document.getElementById("summaryCompletedAppointments"),
    ],
    [
      summaryScheduledCard,
      "Scheduled",
      document.getElementById("summaryScheduledAppointments"),
    ],
    [
      summaryRescheduledCard,
      "Rescheduled",
      document.getElementById("summaryRescheduledAppointments"),
    ],
    [
      summaryCancelledCard,
      "Cancelled",
      document.getElementById("summaryCancelledAppointments"),
    ],
    [
      summaryNoShowCard,
      "No Show",
      document.getElementById("summaryNoShowAppointments"),
    ],
  ];
  summaryTooltips.forEach(([card, label, valueElement]) => {
    if (card && valueElement) {
      card.title = `${label}: ${valueElement.textContent}`;
    }
  });
}
function renderAppointmentSummary() {
  const appointments = patientDashboardData.appointments;
  const summary = {
    total: appointments.length,
    completed: 0,
    scheduled: 0,
    rescheduled: 0,
    cancelled: 0,
    noShow: 0,
  };
  appointments.forEach((appointment) => {
    const status = normalizeAppointmentStatus(appointment.status);
    if (status === "completed") {
      summary.completed += 1;
    } else if (status === "scheduled") {
      summary.scheduled += 1;
    } else if (status === "cancelled") {
      summary.cancelled += 1;
    } else if (status === "no-show") {
      summary.noShow += 1;
    }
    if (isAppointmentRescheduled(appointment)) {
      summary.rescheduled += 1;
    }
  });
  setText("summaryTotalAppointments", summary.total);
  setText("summaryCompletedAppointments", summary.completed);
  setText("summaryScheduledAppointments", summary.scheduled);
  setText("summaryRescheduledAppointments", summary.rescheduled);
  setText("summaryCancelledAppointments", summary.cancelled);
  setText("summaryNoShowAppointments", summary.noShow);
  renderAppointmentBehavior(summary);
}
function getAppointmentBehavior(summary) {
  const behavior = window.DentaNuevaAppointmentBehavior;
  if (!behavior) return null;
  return behavior.getRestriction(
    patientDashboardData.appointments,
    getPatientIdentity(patientDashboardData.patient),
  );
}
function renderAppointmentBehavior(summary) {
  const label = document.getElementById("appointmentBehaviorLabel");
  const message = document.getElementById("appointmentBehaviorMessage");
  const details = document.getElementById("appointmentRestrictionDetails");
  const status = document.getElementById("appointmentBehaviorStatus");
  if (!label || !message || !details || !status) return;
  const behavior = getAppointmentBehavior(summary);
  if (!behavior) return;
  status.classList.toggle("restricted", behavior.isRestricted);
  status.classList.toggle("warning", behavior.isWarning);
  details.hidden = !behavior.isRestricted;
  if (behavior.isRestricted) {
    label.textContent = "Temporarily Restricted";
    message.textContent =
      "New appointment booking is unavailable due to repeated no-shows.";
    details.textContent = `Booking available again after ${behavior.formatRestrictionEnd ? behavior.formatRestrictionEnd(behavior.restrictedUntil) : behavior.restrictedUntil.toLocaleDateString("en-US")}.`;
    return;
  }
  if (behavior.isWarning) {
    label.textContent = "Attendance Warning";
    message.textContent =
      "You have 2 missed appointments. One more No Show will temporarily restrict new appointment booking for 2 days.";
    return;
  }
  if (behavior.noShowCount === 0 && summary.completed > 0) {
    label.textContent = "Consistent Attendance";
    message.textContent =
      "No missed appointments are recorded in your history.";
  } else if (behavior.noShowCount === 1) {
    label.textContent = "Attendance Warning";
    message.textContent =
      "One missed appointment is recorded. You can still book normally.";
  } else if (behavior.noShowCount > 1) {
    label.textContent = "Attendance Pattern";
    message.textContent = `${behavior.noShowCount} missed appointments are recorded in your history.`;
  } else {
    label.textContent = "Attendance Pattern";
    message.textContent = "No appointment activity recorded yet.";
  }
}
function updateBookingAccess() {
  const button = document.getElementById("dashboardNewAppointmentBtn");
  if (!button) return;
  const behavior = getAppointmentBehavior({
    completed: patientDashboardData.appointments.filter(
      (appointment) => appointment.status === "completed",
    ).length,
  });
  button.title = behavior?.isRestricted
    ? "Appointment booking is temporarily restricted"
    : "Book a new appointment";
}
function isAppointmentRescheduled(appointment) {
  if (!appointment || typeof appointment !== "object") {
    return false;
  }
  const details =
    appointment.appointmentDetails ||
    appointment.details ||
    appointment.appointment_details ||
    {};
  const values = [
    appointment.rescheduled,
    appointment.isRescheduled,
    appointment.is_rescheduled,
    appointment.reschedule,
    appointment.rescheduleStatus,
    appointment.reschedule_status,
    details.rescheduled,
    details.isRescheduled,
    details.is_rescheduled,
    details.reschedule,
    details.rescheduleStatus,
    details.reschedule_status,
  ];
  return values.some((value) => {
    if (value === true) {
      return true;
    }
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    return (
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "rescheduled"
    );
  });
}
function renderTodayAppointments() {
  const container = document.getElementById("appointmentsList");
  if (!container) {
    return;
  }
  const today = getTodayDate();
  let appointments = patientDashboardData.appointments
    .filter((appointment) => {
      const appointmentDate = normalizeAppointmentDate(appointment.date);
      return (
        appointmentDate === today &&
        appointment.status !== "cancelled" &&
        appointment.status !== "no-show"
      );
    })
    .sort(compareAppointments)
    .slice(0, 5);
  if (appointments.length === 0) {
    const nextAppointment = getUpcomingAppointments()[0];
    if (nextAppointment) {
      appointments = [nextAppointment];
    }
  }
  if (appointments.length === 0) {
    container.innerHTML = createEmptyState(
      "fa-calendar-xmark",
      "No appointments scheduled for today",
    );
    return;
  }
  container.innerHTML = appointments
    .map((appointment) => createAppointmentHTML(appointment))
    .join("");
}
function createAppointmentHTML(appointment) {
  const displayPatientName =
    appointment.patientName || getPatientName(patientDashboardData.patient);
  const initials = getInitials(displayPatientName);
  const statusClass = getAppointmentBadgeClass(appointment.status);
  const statusText = getAppointmentStatusLabel(appointment.status);
  const displayDate = formatAppointmentDate(appointment.date);
  const displayTime = formatDisplayTime(appointment.time);
  const displayService = appointment.service || "Appointment";
  const displayDentist = appointment.dentist || "Unassigned";
  return `
    <div class="appt-item" data-appointment-id="${escapeHTML(appointment.id)}" role="button" tabindex="0">
      <div class="appt-avatar">${escapeHTML(initials)}</div>
      <div class="appt-info">
        <div class="appt-service">
          <strong>${escapeHTML(displayService)}</strong>
          <span>•</span>
          <strong>${escapeHTML(displayDentist)}</strong>
        </div>
        <div class="appt-meta">
          <span>${escapeHTML(displayDate)}</span>
          <span>•</span>
          <span>${escapeHTML(displayTime)}</span>
        </div>
      </div>
      <span class="badge ${statusClass}">${escapeHTML(statusText)}</span>
    </div>
    `;
}
function setupAppointmentInteractions() {
  document.addEventListener("click", (event) => {
    const item = event.target.closest(".appt-item");
    if (!item) {
      return;
    }
    openAppointment(item.dataset.appointmentId);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    const item = event.target.closest(".appt-item");
    if (!item) {
      return;
    }
    event.preventDefault();
    openAppointment(item.dataset.appointmentId);
  });
}
function openAppointment(appointmentId) {
  const appointment = patientDashboardData.appointments.find(
    (item) => String(item.id) === String(appointmentId),
  );
  if (!appointment) {
    return;
  }
  const appointmentPage = "../appointment/appointment.html";
  const url = `${appointmentPage}?appointmentId=${encodeURIComponent(appointmentId)}`;
  window.location.href = url;
}
function getAppointmentStatusLabel(status) {
  switch (normalizeAppointmentStatus(status)) {
    case "scheduled":
      return "Scheduled";
    case "checkedin":
      return "Checked In";
    case "in consultation":
      return "In Consultation";
    case "complete":
      return "Complete";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "no-show":
      return "No Show";
    default:
      return "Scheduled";
  }
}
function getAppointmentBadgeClass(status) {
  switch (normalizeAppointmentStatus(status)) {
    case "scheduled":
      return "badge-pending";
    case "checkedin":
      return "badge-checkedin";
    case "in consultation":
      return "badge-consultation";
    case "complete":
      return "badge-completed";
    case "completed":
      return "badge-completed";
    case "cancelled":
      return "badge-cancelled";
    case "no-show":
      return "badge-no-show";
    default:
      return "badge-pending";
  }
}
function getUpcomingAppointments() {
  const today = getTodayDate();
  return patientDashboardData.appointments
    .filter((appointment) => {
      const date = normalizeAppointmentDate(appointment.date);
      return (
        date >= today &&
        appointment.status !== "cancelled" &&
        appointment.status !== "no-show" &&
        appointment.status !== "completed"
      );
    })
    .sort(compareAppointments);
}
function calculatePaymentTotals() {
  let total = 0;
  let paid = 0;
  let discount = 0;
  patientDashboardData.transactions.forEach((transaction) => {
    const transactionTotal = Number(
      transaction.total ??
        transaction.amountDue ??
        transaction.totalAmount ??
        transaction.total_amount ??
        transaction.amount ??
        0,
    );
    const transactionDiscount = Number(
      transaction.discount ??
        transaction.discountAmount ??
        transaction.discount_amount ??
        0,
    );
    const transactionPaid = Number(
      transaction.paid ??
        transaction.amountPaid ??
        transaction.amount_paid ??
        transaction.payment ??
        0,
    );
    if (Number.isFinite(transactionTotal) && transactionTotal > 0) {
      total += transactionTotal;
    }
    if (Number.isFinite(transactionDiscount) && transactionDiscount > 0) {
      discount += transactionDiscount;
    }
    if (Number.isFinite(transactionPaid) && transactionPaid > 0) {
      paid += transactionPaid;
    }
    if (transactionTotal === 0 && transactionPaid > 0) {
      total += transactionPaid;
    }
  });
  return {
    total,
    discount,
    paid,
    balance: Math.max(total - discount - paid, 0),
  };
}
function isMedicalRecordComplete() {
  const patient = patientDashboardData.patient;
  if (!patient || typeof patient !== "object") {
    return false;
  }
  const medicalForm =
    patient.medicalForm ||
    patient.medical_form ||
    patient.medicalRecord ||
    patient.medical_record ||
    null;
  if (medicalForm && typeof medicalForm === "object") {
    if (medicalForm.completed === true) {
      return true;
    }
    const completedValue = String(medicalForm.completed ?? "")
      .trim()
      .toLowerCase();
    if (
      completedValue === "true" ||
      completedValue === "completed" ||
      completedValue === "complete" ||
      completedValue === "done"
    ) {
      return true;
    }
  }
  const directStatus =
    patient.medicalRecordStatus ||
    patient.medical_record_status ||
    patient.medicalFormStatus ||
    patient.medical_form_status ||
    patient.recordStatus ||
    patient.record_status ||
    "";
  if (directStatus) {
    const status = String(directStatus).trim().toLowerCase();
    if (
      status === "completed" ||
      status === "complete" ||
      status === "filled" ||
      status === "filled out" ||
      status === "done"
    ) {
      return true;
    }
    if (
      status === "incomplete" ||
      status === "pending" ||
      status === "not completed" ||
      status === "not filled"
    ) {
      return false;
    }
  }
  const directBoolean =
    patient.medicalRecordCompleted ??
    patient.medical_record_completed ??
    patient.medicalFormCompleted ??
    patient.medical_form_completed ??
    patient.formCompleted ??
    patient.form_completed;
  if (typeof directBoolean === "boolean") {
    return directBoolean;
  }
  return false;
}
function getStoredRecords() {
  return patientDashboardData.records.filter(isRecordForCurrentPatient);
}
function isRecordForCurrentPatient(record) {
  if (!record || typeof record !== "object") {
    return false;
  }
  const currentId = getPatientIdentity(patientDashboardData.patient);
  const recordId = String(
    record.patientId ?? record.patientID ?? record.patient_id ?? "",
  )
    .trim()
    .toLowerCase();
  if (currentId && recordId) {
    return currentId === recordId;
  }
  const currentName = getPatientName(patientDashboardData.patient)
    .trim()
    .toLowerCase();
  const recordName = String(
    record.patientName ||
      record.patient ||
      record.fullName ||
      record.full_name ||
      record.name ||
      "",
  )
    .trim()
    .toLowerCase();
  if (currentName && currentName !== "patient" && recordName) {
    return currentName === recordName;
  }
  return true;
}
function getStoredTransactions() {
  return patientDashboardData.transactions.filter(
    isTransactionForCurrentPatient,
  );
}
function isTransactionForCurrentPatient(transaction) {
  if (!transaction || typeof transaction !== "object") {
    return false;
  }
  const currentId = getPatientIdentity(patientDashboardData.patient);
  const transactionPatientId = String(
    transaction.patientId ??
      transaction.patientID ??
      transaction.patient_id ??
      "",
  )
    .trim()
    .toLowerCase();
  if (currentId && transactionPatientId) {
    return currentId === transactionPatientId;
  }
  const currentName = getPatientName(patientDashboardData.patient)
    .trim()
    .toLowerCase();
  const transactionPatientName = String(
    transaction.patientName ||
      transaction.patient ||
      transaction.fullName ||
      transaction.full_name ||
      transaction.name ||
      "",
  )
    .trim()
    .toLowerCase();
  if (currentName && currentName !== "patient" && transactionPatientName) {
    return currentName === transactionPatientName;
  }
  return true;
}
function getNotifications() {
  const notifications = [];
  const upcoming = getUpcomingAppointments();
  if (upcoming.length > 0) {
    const next = upcoming[0];
    notifications.push({
      icon: "fa-calendar-check",
      title: "Upcoming appointment",
      text: `${next.service} with ${next.dentist} on ${formatAppointmentDate(next.date)} at ${formatDisplayTime(next.time)}.`,
      time: "Appointment reminder",
    });
  }
  const totals = calculatePaymentTotals();
  if (totals.balance > 0) {
    notifications.push({
      icon: "fa-wallet",
      title: "Payment balance",
      text: `You have an outstanding balance of ${formatCurrency(totals.balance)}.`,
      time: "Payment reminder",
    });
  }
  if (patientDashboardData.records.length > 0) {
    notifications.push({
      icon: "fa-file-medical",
      title: "Dental records available",
      text: "Your latest dental records are available in your account.",
      time: "Patient records",
    });
  }
  return notifications;
}
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
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
}
function extractPatients(data) {
  if (!data) {
    return [];
  }
  if (Array.isArray(data)) {
    return data;
  }
  if (typeof data !== "object") {
    return [];
  }
  const properties = [
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
  for (const property of properties) {
    if (Array.isArray(data[property])) {
      return data[property];
    }
  }
  return Object.values(data).filter(
    (value) => value && typeof value === "object" && !Array.isArray(value),
  );
}
function readJSON(key) {
  return null;
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
    return "";
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
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDateForComparison(tomorrowDate);
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
function formatDisplayTime(value) {
  if (!value) {
    return "--:--";
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    return text;
  }
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = (match[4] || (hour >= 12 ? "PM" : "AM")).toUpperCase();
  if (match[4]) {
    if (suffix === "AM" && hour === 12) hour = 0;
    if (suffix === "PM" && hour < 12) hour += 12;
  }
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function compareAppointments(a, b) {
  return getAppointmentTimestamp(a) - getAppointmentTimestamp(b);
}
function getAppointmentTimestamp(appointment) {
  const date = normalizeAppointmentDate(appointment.date);
  const time = convertTimeTo24Hour(appointment.time);
  if (!date) {
    return Number.MAX_SAFE_INTEGER;
  }
  const timestamp = new Date(`${date}T${time}:00`).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}
function convertTimeTo24Hour(time) {
  if (!time) {
    return "00:00";
  }
  const text = String(time).trim();
  const twelveHourMatch = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHourMatch) {
    let hour = parseInt(twelveHourMatch[1], 10);
    const minute = twelveHourMatch[2];
    const period = twelveHourMatch[3].toUpperCase();
    if (period === "PM" && hour !== 12) {
      hour += 12;
    }
    if (period === "AM" && hour === 12) {
      hour = 0;
    }
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }
  const twentyFourHourMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHourMatch) {
    return `${String(parseInt(twentyFourHourMatch[1], 10)).padStart(2, "0")}:${twentyFourHourMatch[2]}`;
  }
  const extractedTimeMatch = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (extractedTimeMatch) {
    let hour = parseInt(extractedTimeMatch[1], 10);
    const minute = extractedTimeMatch[2];
    const period = extractedTimeMatch[3];
    if (period) {
      const normalizedPeriod = period.toUpperCase();
      if (normalizedPeriod === "PM" && hour !== 12) {
        hour += 12;
      }
      if (normalizedPeriod === "AM" && hour === 12) {
        hour = 0;
      }
    }
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }
  return "00:00";
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
function createEmptyState(icon, message) {
  return `
    <div class="empty-state" title="${escapeHTML(message)}">
      <i class="fa-solid ${escapeHTML(icon)}"></i>
      <p>${escapeHTML(message)}</p>
    </div>
    `;
}
function getTodayDate() {
  return formatDateForComparison(new Date());
}
function formatDateForComparison(date) {
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
function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  });
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
window.DentaNuevaPatientDashboard = {
  data: patientDashboardData,
  refresh: refreshPatientDashboard,
  getUpcomingAppointments,
  renderTodayAppointments,
  renderAppointmentSummary,
  calculatePaymentTotals,
  isMedicalRecordComplete,
};
