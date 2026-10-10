const PATIENT_RECORD_API = "../../api/patient_records.php";
const DOCTORS_API = "../../api/doctors.php";
const UNAVAILABILITY_API = "../../api/doctor_unavailability.php";
const SERVICES = [
  { id: "consultation", name: "Consultation", duration: 30 },
  { id: "dental_cleaning", name: "Dental Cleaning", duration: 45 },
  { id: "tooth_filling", name: "Tooth Filling / Pasta", duration: 45 },
  { id: "tooth_extraction", name: "Tooth Extraction", duration: 60 },
  { id: "root_canal", name: "Root Canal", duration: 90 },
  { id: "braces_adjustment", name: "Braces Adjustment", duration: 30 },
  { id: "teeth_whitening", name: "Teeth Whitening", duration: 60 },
  { id: "dental_xray", name: "Dental X-Ray", duration: 15 },
  { id: "scaling_polishing", name: "Scaling and Polishing", duration: 45 },
  { id: "denture_fitting", name: "Denture Fitting", duration: 60 },
  {
    id: "wisdom_tooth_extraction",
    name: "Wisdom Tooth Extraction",
    duration: 75,
  },
  {
    id: "dental_implant_consultation",
    name: "Dental Implant Consultation",
    duration: 30,
  },
  { id: "oral_prophylaxis", name: "Oral Prophylaxis", duration: 45 },
  { id: "retainer_fitting", name: "Retainer Fitting", duration: 30 },
];
let DENTISTS = {};
let doctors = [];
const CLINIC_SCHEDULE = { startHour: 10, endHour: 17.5, slotMinutes: 30 };
let patients = [];
let appointments = [];
let rescheduleRequests = [];
let doctorScheduleAppointments = [];
let doctorUnavailability = [];
let calendarUnavailability = [];
let currentPatient = null;
let currentUser = null;
let selectedDate = new Date();
let selectedTime = "";
let detailAppointmentId = null;
let requestAppointmentId = null;
let requestTime = "";
let staffRequestTargetId = null;
let staffRequestTime = "";
let rescheduleDetailsRequestId = null;
let bookingStep = 1;
let calendarDate = new Date();
let currentUserFromDatabase = null;
document.addEventListener("DOMContentLoaded", initializePage);
function setupUnavailabilityStyles() {
  if (document.getElementById("dentaNuevaPatientUnavailabilityStyles")) {
    return;
  }
  const style = document.createElement("style");
  style.id = "dentaNuevaPatientUnavailabilityStyles";
  style.textContent = `.day.has-unavailable:not(.selected){background:#fff0f0;color:#dc3838}.day.selected.has-unavailable{background:#dc3838!important;color:#fff!important;box-shadow:0 4px 10px rgba(220,56,56,.25)}.time-picker-unavailable-note{display:flex;align-items:flex-start;gap:6px;margin:0 0 8px;padding:8px 10px;background:#fff0f0;border:1px solid #f2caca;border-radius:8px;color:#dc3838;font-size:9px;font-weight:600;line-height:1.4}.time-picker-unavailable-note i{margin-top:2px;font-size:9px}#dateSelect.date-unavailable{border-color:#dc3838!important;background:#fff0f0!important;color:#dc3838!important}.time-picker-option.doctor-unavailable,.time-picker-option.doctor-unavailable.selected,.time-option.doctor-unavailable{background:#fff0f0!important;color:#dc3838!important;border-color:#f2caca!important;cursor:not-allowed;text-decoration:line-through}`;
  document.head.appendChild(style);
}
async function initializePage() {
  setupUnavailabilityStyles();
  await hydrateCurrentUser();
  currentUser = getCurrentUser();
  loadPatients();
  normalizeSelectedDate();
  normalizeCalendarDate();
  setupEvents();
  await loadDoctors();
  await loadCalendarUnavailability();
  await loadAppointments();
  await hydrateRescheduleRequestsFromDatabase();
  resolveCurrentPatient();
  await hydrateCurrentPatientFromDatabase();
  setInitialAppointmentDate();
  renderAll();
  setInterval(async () => {
    currentUser = getCurrentUser();
    loadPatients();
    await loadDoctors();
    await loadCalendarUnavailability();
    await loadAppointments();
    await hydrateRescheduleRequestsFromDatabase();
    resolveCurrentPatient();
    await hydrateCurrentPatientFromDatabase();
    normalizeSelectedDate();
    renderAll();
  }, 30000);
}
async function hydrateCurrentUser() {
  try {
    const response = await fetch(PATIENT_RECORD_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.message || "Patient account unavailable.");
    }
    currentUserFromDatabase = result.data;
  } catch (error) {
    console.error("Unable to load authenticated patient:", error);
    currentUserFromDatabase = null;
  }
}
function setupEvents() {
  document
    .getElementById("openBookingBtn")
    ?.addEventListener("click", () => openBookingModal());
  document
    .getElementById("closeBookingModal")
    ?.addEventListener("click", closeBookingModal);
  document
    .getElementById("cancelBooking")
    ?.addEventListener("click", closeBookingModal);
  document
    .getElementById("confirmBooking")
    ?.addEventListener("click", confirmBooking);
  document
    .getElementById("continueBooking")
    ?.addEventListener("click", goToBookingStep2);
  document
    .getElementById("backBooking")
    ?.addEventListener("click", goToBookingStep1);
  document
    .getElementById("updateMedicalRecordBtn")
    ?.addEventListener("click", openMedicalRecordForUpdate);
  document
    .getElementById("closeRecordEditModal")
    ?.addEventListener("click", closeMedicalRecordEditor);
  document
    .getElementById("cancelRecordEdit")
    ?.addEventListener("click", closeMedicalRecordEditor);
  document
    .getElementById("saveRecordEdit")
    ?.addEventListener("click", saveMedicalRecordEditor);
  document
    .getElementById("closeAppointmentModal")
    ?.addEventListener("click", closeAppointmentDetail);
  document
    .getElementById("closeAppointmentDetail")
    ?.addEventListener("click", closeAppointmentDetail);
  document
    .getElementById("deleteAppointmentBtn")
    ?.addEventListener("click", deleteAppointment);
  document
    .getElementById("cancelAppointmentBtn")
    ?.addEventListener("click", cancelAppointment);
  document
    .getElementById("closeCancelAppointmentConfirm")
    ?.addEventListener("click", closeCancelAppointmentConfirmation);
  document
    .getElementById("keepAppointmentBtn")
    ?.addEventListener("click", closeCancelAppointmentConfirmation);
  document
    .getElementById("confirmCancelAppointmentBtn")
    ?.addEventListener("click", confirmCancelAppointment);
  document
    .getElementById("requestRescheduleBtn")
    ?.addEventListener("click", openRescheduleRequestModal);
  document
    .getElementById("closeRescheduleRequestModal")
    ?.addEventListener("click", closeRescheduleRequestModal);
  document
    .getElementById("cancelRescheduleRequest")
    ?.addEventListener("click", closeRescheduleRequestModal);
  document
    .getElementById("sendRescheduleRequest")
    ?.addEventListener("click", sendRescheduleRequest);
  document
    .getElementById("closeStaffRescheduleModal")
    ?.addEventListener("click", closeStaffRescheduleModal);
  document
    .getElementById("cancelStaffReschedule")
    ?.addEventListener("click", closeStaffRescheduleModal);
  document
    .getElementById("confirmStaffReschedule")
    ?.addEventListener("click", confirmStaffRescheduleResponse);
  document
    .getElementById("staffRequestDate")
    ?.addEventListener("change", handleStaffRequestDateChange);
  document
    .getElementById("rescheduleAlertButton")
    ?.addEventListener("click", handleRescheduleAlert);
  document
    .getElementById("closeRescheduleDetails")
    ?.addEventListener("click", closeRescheduleDetailsModal);
  document
    .getElementById("confirmRescheduleDetails")
    ?.addEventListener("click", confirmRescheduleDetails);
  document
    .getElementById("serviceInput")
    ?.addEventListener("input", handleServiceInput);
  document
    .getElementById("serviceInput")
    ?.addEventListener("focus", () => openServiceDropdown());
  document.getElementById("dateSelect")?.addEventListener("change", (event) => {
    const value = event.target.value;
    if (!value || isPastDate(value)) {
      event.target.value = dateToKey(new Date());
      selectedDate = new Date();
    } else {
      selectedDate = keyToDate(value);
    }
    selectedTime = "";
    calendarDate = new Date(selectedDate);
    calendarDate.setDate(1);
    renderCalendar();
    updateAvailableTimeSlots();
    updateBookingButton();
  });
  document
    .getElementById("dentistSelect")
    ?.addEventListener("change", async () => {
      selectedTime = "";
      await loadCalendarUnavailability();
      renderCalendar();
      updateAvailableTimeSlots();
      updateBookingButton();
    });
  document
    .getElementById("timeTrigger")
    ?.addEventListener("click", toggleTimePicker);
  document
    .getElementById("requestDate")
    ?.addEventListener("change", handleRequestDateChange);
  document
    .getElementById("calendarPrevBtn")
    ?.addEventListener("click", () => shiftCalendarMonth(-1));
  document
    .getElementById("calendarNextBtn")
    ?.addEventListener("click", () => shiftCalendarMonth(1));
  document.addEventListener("click", handleDocumentClick);
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target !== overlay) return;
      if (overlay.id === "bookingModal") closeBookingModal();
      if (overlay.id === "appointmentModal") closeAppointmentDetail();
      if (overlay.id === "cancelAppointmentConfirmModal")
        closeCancelAppointmentConfirmation();
      if (overlay.id === "rescheduleRequestModal")
        closeRescheduleRequestModal();
      if (overlay.id === "staffRescheduleModal") closeStaffRescheduleModal();
      if (overlay.id === "recordEditModal") closeMedicalRecordEditor();
      if (overlay.id === "rescheduleDetailsModal")
        closeRescheduleDetailsModal();
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeServiceDropdown();
    closeTimePicker();
    closeMedicalRecordEditor();
  });
}
function renderAll() {
  renderPatientContext();
  renderCalendar();
  renderUpcomingAppointment();
  renderRescheduleAlert();
  renderBookingRestrictionAlert();
}
function renderPatientContext() {
  return;
}
function normalizeSelectedDate() {
  if (!(selectedDate instanceof Date) || Number.isNaN(selectedDate.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selectedDate = today;
  }
}
function setInitialAppointmentDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingAppointments = getPatientAppointments()
    .filter((appointment) => {
      const appointmentDate = getAppointmentDate(appointment);
      if (!appointmentDate) return false;
      if (!isActiveAppointment(appointment)) return false;
      return !isPastDate(appointmentDate);
    })
    .sort((a, b) => {
      const dateA = getAppointmentDate(a);
      const dateB = getAppointmentDate(b);
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      return String(getAppointmentTime(a)).localeCompare(
        String(getAppointmentTime(b)),
      );
    });
  if (!upcomingAppointments.length) {
    selectedDate = today;
    calendarDate = new Date(today);
    calendarDate.setDate(1);
    return;
  }
  const appointmentDate = getAppointmentDate(upcomingAppointments[0]);
  selectedDate = keyToDate(dateToKey(keyToDate(appointmentDate)));
  calendarDate = new Date(selectedDate);
  calendarDate.setDate(1);
}
function normalizeCalendarDate() {
  if (!(calendarDate instanceof Date) || Number.isNaN(calendarDate.getTime())) {
    calendarDate = new Date();
  }
  calendarDate.setDate(1);
}
function dateToKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function keyToDate(value) {
  if (!value) return new Date();
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
function isPastDate(value) {
  const date = value instanceof Date ? new Date(value) : keyToDate(value);
  const today = new Date();
  date.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return date < today;
}
function isTodayDate(value) {
  const date = value instanceof Date ? new Date(value) : keyToDate(value);
  return dateToKey(date) === dateToKey(new Date());
}
function isClinicClosedDate(value) {
  if (!value) return false;
  const date = value instanceof Date ? new Date(value) : keyToDate(value);
  return date.getDay() === 0;
}
function formatDate(dateValue) {
  const date =
    dateValue instanceof Date ? dateValue : keyToDate(String(dateValue));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function formatShortDate(dateValue) {
  const date =
    dateValue instanceof Date ? dateValue : keyToDate(String(dateValue));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatTime(timeValue) {
  if (!timeValue) return "";
  const text = String(timeValue).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return String(timeValue);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = (match[4] || (hour >= 12 ? "PM" : "AM")).toUpperCase();
  if (match[4]) {
    if (suffix === "AM" && hour === 12) hour = 0;
    if (suffix === "PM" && hour < 12) hour += 12;
  }
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function getAppointmentEndTime(appointment) {
  const time = getAppointmentTime(appointment);
  const duration = Number(
    appointment?.duration ||
      appointment?.duration_minutes ||
      appointment?.durationMinutes ||
      0,
  );
  if (!time || !duration) return "";
  const [hour, minute] = String(time).split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return "";
  const totalMinutes = hour * 60 + minute + duration;
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = totalMinutes % 60;
  return formatTime(
    `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`,
  );
}
function getAppointmentDate(appointment) {
  return (
    appointment?.appointment_date ||
    appointment?.appointmentDate ||
    appointment?.date ||
    ""
  );
}
function getAppointmentTime(appointment) {
  return (
    appointment?.appointment_time ||
    appointment?.appointmentTime ||
    appointment?.time ||
    appointment?.start ||
    ""
  );
}
function isBookingConflictAppointment(appointment) {
  const status = normalizeStatus(getAppointmentStatus(appointment));
  return status !== "cancelled" && status !== "canceled" && status !== "noshow";
}
function getAppointmentService(appointment) {
  return (
    appointment?.service ||
    appointment?.service_type ||
    appointment?.serviceType ||
    appointment?.treatment ||
    appointment?.type ||
    "Dental Appointment"
  );
}
function getDentistId(appointment) {
  return (
    appointment?.dentist_id ||
    appointment?.dentistId ||
    appointment?.dentist ||
    appointment?.doctor_id ||
    appointment?.doctorId ||
    appointment?.doctor ||
    appointment?.assignedDentistId ||
    appointment?.assignedDoctorId ||
    ""
  );
}
function normalizeDentistId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^doctor\s+/i, "")
    .replace(/^dr\.?\s*/i, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function sameDentist(left, right) {
  const normalizedLeft = normalizeDentistId(left);
  const normalizedRight = normalizeDentistId(right);
  const resolveKnownDentist = (value) => {
    const normalizedValue = normalizeDentistId(value);
    const matchedDoctor = doctors.find((doctor) =>
      [
        doctor.id,
        doctor.dentistId,
        doctor.dentist_id,
        doctor.doctorId,
        doctor.doctor_id,
        doctor.name,
        doctor.fullName,
        doctor.full_name,
        doctor.email,
      ].some((identity) => normalizeDentistId(identity) === normalizedValue),
    );
    return matchedDoctor?.id || normalizedValue;
  };
  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    resolveKnownDentist(normalizedLeft) ===
      resolveKnownDentist(normalizedRight),
  );
}
function getDentistName(appointment) {
  const dentistId = getDentistId(appointment);
  if (DENTISTS[dentistId]) return DENTISTS[dentistId].name;
  if (
    appointment?.dentist_name ||
    appointment?.dentistName ||
    appointment?.doctor_name ||
    appointment?.doctorName
  ) {
    return (
      appointment.dentist_name ||
      appointment.dentistName ||
      appointment.doctor_name ||
      appointment.doctorName
    );
  }
  if (typeof dentistId === "string" && dentistId.startsWith("Dr."))
    return dentistId;
  return "Assigned Dentist";
}
function getAppointmentStatus(appointment) {
  return appointment?.status || appointment?.appointment_status || "Pending";
}
function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "");
}
function getPatientStatusLabel(status, appointmentDate) {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return "Completed";
  if (normalized === "cancelled" || normalized === "canceled")
    return "Cancelled";
  if (normalized === "noshow") return "No Show";
  if (normalized === "inconsultation" || normalized === "readycomplete")
    return "In Consultation";
  if (
    appointmentDate &&
    isTodayDate(appointmentDate) &&
    !isPastDate(appointmentDate)
  )
    return "Check In";
  return "Scheduled";
}
function getCurrentUser() {
  return currentUserFromDatabase;
}
function loadPatients() {
  patients = [];
}
function loadDoctors() {
  return hydrateDoctorsFromDatabase();
}
async function hydrateDoctorsFromDatabase() {
  try {
    const response = await fetch(DOCTORS_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Doctor list unavailable.");
    }
    doctors = result.data
      .map(normalizeDoctor)
      .filter((doctor) => doctor.id && doctor.name);
    DENTISTS = doctors.reduce((result, doctor) => {
      result[doctor.id] = doctor;
      return result;
    }, {});
    renderDentistSelector();
    renderAll();
  } catch (error) {
    console.warn("Database doctors unavailable.", error);
    doctors = [];
    DENTISTS = {};
  }
}
function normalizeDoctor(doctor) {
  const id = String(
    doctor.dentistId ||
      doctor.dentist_id ||
      doctor.doctorId ||
      doctor.doctor_id ||
      doctor.id ||
      "",
  )
    .trim()
    .toLowerCase();
  const firstName = String(doctor.firstName || doctor.first_name || "").trim();
  const lastName = String(doctor.lastName || doctor.last_name || "").trim();
  const name = String(
    doctor.fullName ||
      doctor.full_name ||
      doctor.name ||
      doctor.doctorName ||
      doctor.dentistName ||
      `${firstName} ${lastName}`,
  ).trim();
  const specialization = String(
    doctor.specialization ||
      doctor.specialty ||
      doctor.speciality ||
      doctor.department ||
      "Dental Care",
  ).trim();
  const initials =
    name
      .replace(/^Dr\.?\s+/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "DR";
  return {
    ...doctor,
    role: String(doctor.role || "doctor")
      .trim()
      .toLowerCase(),
    id,
    dentistId: id,
    name,
    specialization,
    initials,
    avatarClass: doctor.avatarClass || "avatar-green",
  };
}
function renderDentistSelector() {
  const select = document.getElementById("dentistSelect");
  if (!select) return;
  const currentValue = String(select.value || "")
    .trim()
    .toLowerCase();
  select.innerHTML = "";
  if (!doctors.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No registered dentist available";
    option.disabled = true;
    option.selected = true;
    select.appendChild(option);
    return;
  }
  doctors.forEach((doctor) => {
    const option = document.createElement("option");
    option.value = doctor.id;
    option.textContent = doctor.name;
    option.dataset.dentistId = doctor.id;
    option.dataset.specialization = doctor.specialization;
    select.appendChild(option);
  });
  select.value = doctors.some((doctor) => doctor.id === currentValue)
    ? currentValue
    : doctors[0].id;
}
async function loadAppointments() {
  appointments = [];
  await hydrateAppointmentsFromDatabase();
  return appointments;
}
async function hydrateAppointmentsFromDatabase() {
  if (!window.DentaNuevaAppointmentDatabase) {
    console.error("Appointment database module is unavailable.");
    return;
  }
  try {
    const remoteAppointments =
      await window.DentaNuevaAppointmentDatabase.load();
    appointments = Array.isArray(remoteAppointments) ? remoteAppointments : [];
    renderAll();
  } catch (error) {
    console.error("Unable to load appointments from database.", error);
    appointments = [];
  }
}
async function saveAppointments() {
  try {
    const payload = Array.isArray(appointments) ? appointments : [];
    if (!window.DentaNuevaAppointmentDatabase) {
      throw new Error("Appointment database module is unavailable.");
    }
    const savedAppointments =
      await window.DentaNuevaAppointmentDatabase.save(payload);
    appointments = Array.isArray(savedAppointments)
      ? savedAppointments
      : payload;
    return true;
  } catch (error) {
    console.error("Unable to save appointments:", error);
    return false;
  }
}
function getPatientIdentifiers(patient) {
  return [
    patient?.patient_id,
    patient?.patientId,
    patient?.id,
    patient?.user_id,
    patient?.userId,
  ]
    .filter(
      (value) => value !== undefined && value !== null && String(value).trim(),
    )
    .map((value) => String(value).trim());
}
function getCanonicalPatientId(patient) {
  if (!patient) return "";
  const ids = getPatientIdentifiers(patient);
  const prefixedId = ids.find((value) => /^PN-\d+$/i.test(value));
  return prefixedId || ids[0] || "";
}
function findPatientByIdentifier(identifier) {
  if (
    identifier === undefined ||
    identifier === null ||
    String(identifier).trim() === ""
  )
    return null;
  const value = String(identifier).trim().toLowerCase();
  return (
    patients.find((patient) =>
      getPatientIdentifiers(patient).some((id) => id.toLowerCase() === value),
    ) || null
  );
}
function resolveCurrentPatient() {
  const userId = String(
    currentUser?.id || currentUser?.userId || currentUser?.user_id || "",
  ).trim();
  const email = String(
    currentUser?.email || currentUser?.emailAddress || "",
  ).trim();
  const patientId = String(
    currentUser?.patientId ||
      currentUser?.patient_id ||
      currentUser?.patientID ||
      currentUser?.id ||
      "",
  ).trim();
  currentPatient = null;
  if (patientId && /^PN-/i.test(patientId)) {
    currentPatient = findPatientByIdentifier(patientId) || {
      patientId,
      id: patientId,
      patient_id: patientId,
      fullName: currentUser?.name || currentUser?.fullName || "Patient",
      email,
      userId: userId || currentUser?.userId || currentUser?.user_id || "",
    };
  }
  if (!currentPatient && userId) {
    currentPatient =
      patients.find((patient) => {
        const patientUserId = String(
          patient?.user_id || patient?.userId || patient?.userIdRef || "",
        ).trim();
        return (
          patientUserId && patientUserId.toLowerCase() === userId.toLowerCase()
        );
      }) || null;
  }
  if (!currentPatient && email) {
    currentPatient =
      patients.find((patient) => {
        const patientEmail = String(
          patient?.email || patient?.emailAddress || "",
        ).trim();
        return (
          patientEmail && patientEmail.toLowerCase() === email.toLowerCase()
        );
      }) || null;
  }
  if (!currentPatient && patientId) {
    currentPatient = findPatientByIdentifier(patientId) || {
      patientId,
      id: patientId,
      patient_id: patientId,
      fullName: currentUser?.name || currentUser?.fullName || "Patient",
      email,
      userId: userId || currentUser?.userId || currentUser?.user_id || "",
    };
  }
  if (currentPatient && currentUser) {
    const resolvedPatientId = getCanonicalPatientId(currentPatient);
    if (resolvedPatientId) {
      currentUser.patientId = resolvedPatientId;
      currentUser.patient_id = resolvedPatientId;
    }
  }
}
async function hydrateCurrentPatientFromDatabase() {
  if (!currentUser) return;
  try {
    const response = await fetch(PATIENT_RECORD_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.data) return;
    const remotePatient = result.data;
    const remotePatientId = getCanonicalPatientId(remotePatient);
    const localIndex = patients.findIndex(
      (patient) => getCanonicalPatientId(patient) === remotePatientId,
    );
    currentPatient = {
      ...(localIndex >= 0 ? patients[localIndex] : {}),
      ...remotePatient,
      patientId: remotePatientId,
      id: remotePatientId,
    };
    if (localIndex >= 0) {
      patients[localIndex] = currentPatient;
    } else {
      patients.push(currentPatient);
    }
    currentUser.patientId = remotePatientId;
    renderAll();
  } catch (error) {
    console.warn(
      "Database patient record unavailable; using local record.",
      error,
    );
  }
}
async function savePatientRecordToDatabase() {
  if (!currentPatient) {
    return false;
  }
  try {
    const response = await fetch(PATIENT_RECORD_API, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId: currentPatient.patientId || currentPatient.id,
        patient: currentPatient,
        medicalForm: currentPatient.medicalForm || null,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Patient record was not saved.");
    }
    if (result.data) {
      const savedPatient = result.data;
      const savedPatientId = getCanonicalPatientId(savedPatient);
      currentPatient = {
        ...currentPatient,
        ...savedPatient,
        patientId: savedPatientId,
        id: savedPatientId,
      };
      const patientIndex = patients.findIndex(
        (patient) => getCanonicalPatientId(patient) === savedPatientId,
      );
      if (patientIndex !== -1) {
        patients[patientIndex] = {
          ...patients[patientIndex],
          ...currentPatient,
        };
      } else {
        patients.push(currentPatient);
      }
      if (currentUser) {
        currentUser.patientId = savedPatientId;
        currentUser.patient_id = savedPatientId;
      }
    }
    return true;
  } catch (error) {
    console.error("Unable to save patient record to database:", error);
    showToast(
      error.message ||
        "The medical record could not be saved. Please try again.",
    );
    return false;
  }
}
function getCurrentPatientId() {
  if (currentPatient) {
    const patientId = getCanonicalPatientId(currentPatient);
    if (patientId) return patientId;
  }
  const currentUserPatientId = String(
    currentUser?.patientId ||
      currentUser?.patient_id ||
      currentUser?.patientID ||
      "",
  ).trim();
  if (currentUserPatientId) {
    const patient = findPatientByIdentifier(currentUserPatientId);
    return getCanonicalPatientId(patient) || currentUserPatientId;
  }
  const fallbackUserId = String(
    currentUser?.id || currentUser?.userId || currentUser?.user_id || "",
  ).trim();
  if (fallbackUserId) {
    const patient = patients.find((item) => {
      const patientUserId = String(
        item?.user_id || item?.userId || item?.userIdRef || "",
      ).trim();
      return (
        patientUserId &&
        patientUserId.toLowerCase() === fallbackUserId.toLowerCase()
      );
    });
    if (patient) {
      return getCanonicalPatientId(patient);
    }
  }
  return "";
}
function getCurrentPatientName() {
  if (!currentPatient) return "Unknown Patient";
  return (
    currentPatient.full_name ||
    currentPatient.fullName ||
    currentPatient.name ||
    [currentPatient.first_name, currentPatient.last_name]
      .filter(Boolean)
      .join(" ") ||
    "Unknown Patient"
  );
}
function getPatientAppointments() {
  const patientId = String(getCurrentPatientId() || "")
    .trim()
    .toLowerCase();
  if (!patientId) {
    const fallbackPatientId = String(
      currentUser?.patientId ||
        currentUser?.patient_id ||
        currentUser?.patientID ||
        "",
    ).trim();
    if (!fallbackPatientId) return [];
    return appointments.filter((appointment) => {
      const appointmentPatientId = String(
        appointment?.patient_id ||
          appointment?.patientId ||
          appointment?.patientID ||
          "",
      )
        .trim()
        .toLowerCase();
      return appointmentPatientId === fallbackPatientId.trim().toLowerCase();
    });
  }
  return appointments.filter((appointment) => {
    const appointmentPatientId = String(
      appointment?.patient_id ||
        appointment?.patientId ||
        appointment?.patientID ||
        "",
    )
      .trim()
      .toLowerCase();
    if (!appointmentPatientId) {
      return false;
    }
    return appointmentPatientId === patientId;
  });
}
function getDateAppointments(dateKey) {
  return getPatientAppointments().filter(
    (appointment) =>
      dateToKey(keyToDate(getAppointmentDate(appointment))) === dateKey,
  );
}
function getCalendarDentistId() {
  return (
    document.getElementById("dentistSelect")?.value || doctors[0]?.id || ""
  );
}
async function loadCalendarUnavailability() {
  const dentist = getCalendarDentistId();
  if (!dentist) {
    calendarUnavailability = [];
    return;
  }
  try {
    const response = await fetch(
      `${UNAVAILABILITY_API}?doctor_id=${encodeURIComponent(dentist)}`,
      { credentials: "same-origin", cache: "no-store" },
    );
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Unavailability unavailable.");
    }
    calendarUnavailability = result.data.map(normalizeUnavailabilityBlock);
  } catch (error) {
    console.warn("Unable to load calendar unavailability.", error);
    calendarUnavailability = [];
  }
}
function getCalendarUnavailabilityForDate(dateKey) {
  const dentist = getCalendarDentistId();
  if (!dentist || !dateKey) return [];
  return calendarUnavailability
    .filter(
      (block) => block.date === dateKey && sameDentist(block.dentist, dentist),
    )
    .sort((a, b) => unavTimeToMinutes(a.start) - unavTimeToMinutes(b.start));
}
function updateDateUnavailableState() {
  const dateInput = document.getElementById("dateSelect");
  if (!dateInput) return;
  const dentist = document.getElementById("dentistSelect")?.value || "";
  const block = findAllDayUnavailability(dateInput.value, dentist);
  if (block) {
    const name = DENTISTS[dentist]?.name || "The dentist";
    dateInput.classList.add("date-unavailable");
    dateInput.title = `This day is not available. ${name} is unavailable all day.`;
  } else {
    dateInput.classList.remove("date-unavailable");
    dateInput.title = "";
  }
}
function renderCalendar() {
  const grid = document.getElementById("calGrid");
  const monthLabel = document.getElementById("calendarMonthLabel");
  if (!grid || !monthLabel) return;
  normalizeCalendarDate();
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  monthLabel.textContent = calendarDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  grid.innerHTML = "";
  const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  weekdays.forEach((day) => {
    const header = document.createElement("div");
    header.className = "dow";
    header.textContent = day;
    grid.appendChild(header);
  });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const patientAppointments = getPatientAppointments();
  const appointmentKeys = new Set(
    patientAppointments
      .map((appointment) => getAppointmentDate(appointment))
      .filter(Boolean)
      .map((date) => dateToKey(keyToDate(date))),
  );
  for (let index = 0; index < 42; index++) {
    let dayNumber;
    let cellDate;
    let muted = false;
    if (index < firstDay) {
      dayNumber = previousMonthDays - firstDay + index + 1;
      cellDate = new Date(year, month - 1, dayNumber);
      muted = true;
    } else if (index >= firstDay + daysInMonth) {
      dayNumber = index - firstDay - daysInMonth + 1;
      cellDate = new Date(year, month + 1, dayNumber);
      muted = true;
    } else {
      dayNumber = index - firstDay + 1;
      cellDate = new Date(year, month, dayNumber);
    }
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day";
    cell.textContent = dayNumber;
    const cellKey = dateToKey(cellDate);
    const todayKey = dateToKey(new Date());
    const selectedKey = dateToKey(selectedDate);
    if (muted) cell.classList.add("muted");
    if (cellKey < todayKey) cell.classList.add("past");
    if (cellKey === todayKey) cell.classList.add("today");
    if (cellKey === selectedKey) cell.classList.add("selected");
    if (appointmentKeys.has(cellKey)) cell.classList.add("has-appt");
    cell.setAttribute("data-date", cellKey);
    cell.addEventListener("click", () => {
      selectedDate = keyToDate(cellKey);
      const dateInput = document.getElementById("dateSelect");
      if (dateInput && !isPastDate(cellKey)) dateInput.value = cellKey;
      selectedTime = "";
      calendarDate = new Date(selectedDate);
      calendarDate.setDate(1);
      renderCalendar();
      renderUpcomingAppointment();
      updateAvailableTimeSlots();
      updateBookingButton();
    });
    grid.appendChild(cell);
  }
}
function shiftCalendarMonth(direction) {
  const current = new Date(calendarDate);
  current.setDate(1);
  current.setMonth(current.getMonth() + direction);
  calendarDate = current;
  renderCalendar();
}
function renderUpcomingAppointment() {
  const container = document.getElementById("upcomingAppointment");
  if (!container) return;
  const selectedKey = dateToKey(selectedDate);
  const selectedDateAppointments = getPatientAppointments()
    .filter((appointment) => {
      const appointmentDate = String(getAppointmentDate(appointment) || "");
      return (
        appointmentDate && dateToKey(keyToDate(appointmentDate)) === selectedKey
      );
    })
    .sort((a, b) => {
      const dateA = String(getAppointmentDate(a));
      const dateB = String(getAppointmentDate(b));
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const timeA = String(getAppointmentTime(a));
      const timeB = String(getAppointmentTime(b));
      return timeA.localeCompare(timeB);
    });
  const appointment =
    selectedDateAppointments.find((item) => isActiveAppointment(item)) ||
    selectedDateAppointments[0];
  if (!appointment) {
    if (isClinicClosedDate(selectedKey)) {
      container.innerHTML = `
    <div class="empty-upcoming">
    <div class="empty-upcoming-icon">
    <i class="fa-solid fa-door-closed"></i>
    </div>
    <p><strong>Clinic is closed</strong><br>The clinic is closed on Sundays. Open Monday to Saturday, 10:00 AM to 6:00 PM.</p>
    </div>
    `;
      return;
    }
    container.innerHTML = `
    <div class="empty-upcoming">
    <div class="empty-upcoming-icon">
    <i class="fa-regular fa-calendar-xmark"></i>
    </div>
    <p>No appointment recorded on this date.</p>
    </div>
    `;
    return;
  }
  const date = getAppointmentDate(appointment);
  const time = getAppointmentTime(appointment);
  const endTime = getAppointmentEndTime(appointment);
  const service = getAppointmentService(appointment);
  const dentist = getDentistName(appointment);
  const patientName = getCurrentPatientName();
  const patientParts = patientName.trim().split(/\s+/).filter(Boolean);
  const initials =
    patientParts.length > 1
      ? `${patientParts[0][0]}${patientParts[patientParts.length - 1][0]}`
      : patientParts[0]?.slice(0, 2) || "PT";
  const rawStatus = getAppointmentStatus(appointment);
  const statusLabel = getPatientStatusLabel(rawStatus, date);
  const statusClass = getStatusClass(rawStatus);
  container.innerHTML = `
    <div class="upcoming-card-content">
    <div>
    <div class="upcoming-patient-avatar">${escapeHtml(initials.toUpperCase())}</div>
    <div class="upcoming-patient-info">
    <strong>${escapeHtml(patientName)}</strong>
    <span>${escapeHtml(service)} • ${escapeHtml(dentist)}</span>
    <span class="detail-status ${statusClass}">${escapeHtml(statusLabel)}</span>
    </div>
    </div>
    <div class="upcoming-schedule">
    <div class="upcoming-date">
    <span class="upcoming-schedule-label">Appointment Date</span>
    <strong>${escapeHtml(formatDate(date))}</strong>
    </div>
    <div class="upcoming-time-range">
    <div>
    <span class="upcoming-schedule-label">Start Time</span>
    <strong>${escapeHtml(formatTime(time))}</strong>
    </div>
    <div class="upcoming-time-arrow">
    <i class="fa-solid fa-arrow-right"></i>
    </div>
    <div>
    <span class="upcoming-schedule-label">End Time</span>
    <strong>${escapeHtml(endTime)}</strong>
    </div>
    </div>
    </div>
    <div class="upcoming-divider"></div>
    <div class="upcoming-actions">
    <button type="button" class="btn-secondary" data-appointment-action="details" data-appointment-id="${escapeHtml(getAppointmentId(appointment))}">
    View Details
    </button>
    </div>
    </div>
    `;
}
function updateServiceDurationInfo() {
  const info = document.getElementById("serviceDurationInfo");
  if (!info) return;
  const serviceName =
    document.getElementById("serviceInput")?.value.trim() || "";
  const service = SERVICES.find(
    (item) => item.name.toLowerCase() === serviceName.toLowerCase(),
  );
  info.textContent = service
    ? `${service.name} follows a fixed duration of ${service.duration} minutes.`
    : "Each service type follows a fixed, non-editable duration.";
}
async function openBookingModal(date = null, dentist = null) {
  currentUser = getCurrentUser();
  await loadAppointments();
  await loadDoctors();
  renderDentistSelector();
  resolveCurrentPatient();
  await hydrateCurrentPatientFromDatabase();
  resolveCurrentPatient();
  const modal = document.getElementById("bookingModal");
  if (!modal) return;
  const serviceInput = document.getElementById("serviceInput");
  const dentistInput = document.getElementById("dentistSelect");
  const durationInput = document.getElementById("durationInput");
  const dateInput = document.getElementById("dateSelect");
  const selectedKey =
    date && !isPastDate(date)
      ? date
      : !isPastDate(selectedDate)
        ? dateToKey(selectedDate)
        : dateToKey(new Date());
  if (serviceInput) serviceInput.value = "Consultation";
  if (durationInput) {
    durationInput.value = 30;
    durationInput.disabled = true;
  }
  if (dentistInput) {
    renderDentistSelector();
    dentistInput.value = DENTISTS[dentist] ? dentist : doctors[0]?.id || "";
  }
  if (dateInput) {
    dateInput.min = dateToKey(new Date());
    dateInput.value = selectedKey;
  }
  if (dateInput && isPastDate(selectedKey)) {
    dateInput.value = dateToKey(new Date());
    selectedDate = new Date();
  } else {
    selectedDate = keyToDate(selectedKey);
  }
  calendarDate = new Date(selectedDate);
  calendarDate.setDate(1);
  selectedTime = "";
  bookingStep = 1;
  loadBookingPatientInformation();
  loadBookingMedicalInformation();
  closeServiceDropdown();
  closeTimePicker();
  renderServiceDropdown("");
  updateServiceDurationInfo();
  await loadCalendarUnavailability();
  renderCalendar();
  updateAvailableTimeSlots();
  updateBookingButton();
  updateBookingStepUI();
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function loadBookingPatientInformation() {
  const patientIdInput = document.getElementById("bookingPatientId");
  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const dateOfBirthInput = document.getElementById("dateOfBirth");
  const genderInput = document.getElementById("gender");
  const phoneInput = document.getElementById("phone");
  const emailInput = document.getElementById("email");
  const addressInput = document.getElementById("address");
  const emergencyNameInput = document.getElementById("emergencyName");
  const emergencyContactInput = document.getElementById("emergencyContact");
  const patientId = getCurrentPatientId();
  if (patientIdInput) {
    patientIdInput.value = patientId || "";
  }
  if (!currentPatient) {
    if (firstNameInput) firstNameInput.value = "";
    if (lastNameInput) lastNameInput.value = "";
    if (dateOfBirthInput) dateOfBirthInput.value = "";
    if (genderInput) genderInput.value = "";
    if (phoneInput) phoneInput.value = "";
    if (emailInput) emailInput.value = "";
    if (addressInput) addressInput.value = "";
    if (emergencyNameInput) emergencyNameInput.value = "";
    if (emergencyContactInput) emergencyContactInput.value = "";
    return;
  }
  if (firstNameInput) {
    firstNameInput.value =
      currentPatient.first_name || currentPatient.firstName || "";
  }
  if (lastNameInput) {
    lastNameInput.value =
      currentPatient.last_name || currentPatient.lastName || "";
  }
  if (dateOfBirthInput) {
    dateOfBirthInput.value =
      currentPatient.date_of_birth || currentPatient.dateOfBirth || "";
  }
  if (genderInput) {
    genderInput.value = currentPatient.gender || "";
  }
  if (phoneInput) {
    phoneInput.value =
      currentPatient.phone ||
      currentPatient.phone_number ||
      currentPatient.contact_number ||
      "";
  }
  if (emailInput) {
    emailInput.value = currentPatient.email || "";
  }
  if (addressInput) {
    addressInput.value = currentPatient.address || "";
  }
  if (emergencyNameInput) {
    emergencyNameInput.value =
      currentPatient.emergency_name || currentPatient.emergencyName || "";
  }
  if (emergencyContactInput) {
    emergencyContactInput.value =
      currentPatient.emergency_contact || currentPatient.emergencyContact || "";
  }
}
function loadBookingMedicalInformation() {
  if (!currentPatient || !currentPatient.medicalForm) {
    const checkboxes = document.querySelectorAll(
      '#bookingModal input[type="checkbox"][name="dentalConcern"], #bookingModal input[type="checkbox"][name="medicalHistory"], #bookingModal input[type="checkbox"][name="allergies"]',
    );
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    const radioGroups = document.querySelectorAll(
      '#bookingModal input[type="radio"]',
    );
    radioGroups.forEach((radio) => {
      radio.checked = false;
    });
    const textFields = [
      "dentalConcernOther",
      "negativeExperienceNote",
      "lastDentalVisit",
      "lastDentalTreatment",
      "medicationList",
      "medicalOther",
      "allergyOther",
    ];
    textFields.forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = "";
    });
    return;
  }
  const medicalForm = currentPatient.medicalForm;
  const setCheckboxValues = (name, values) => {
    const selectedValues = Array.isArray(values) ? values : [];
    document
      .querySelectorAll(`#bookingModal input[name="${name}"]`)
      .forEach((checkbox) => {
        checkbox.checked = selectedValues.includes(checkbox.value);
      });
  };
  setCheckboxValues("dentalConcern", medicalForm.dentalConcern);
  setCheckboxValues("medicalHistory", medicalForm.medicalHistory);
  setCheckboxValues("allergies", medicalForm.allergies);
  const dentalConcernOtherCheck = document.getElementById(
    "dentalConcernOtherCheck",
  );
  const medicalOtherCheck = document.getElementById("medicalOtherCheck");
  const allergyOtherCheck = document.getElementById("allergyOtherCheck");
  if (dentalConcernOtherCheck) {
    dentalConcernOtherCheck.checked = !!medicalForm.dentalConcernOther;
  }
  if (medicalOtherCheck) {
    medicalOtherCheck.checked = !!medicalForm.medicalOther;
  }
  if (allergyOtherCheck) {
    allergyOtherCheck.checked = !!medicalForm.allergyOther;
  }
  const dentalConcernOther = document.getElementById("dentalConcernOther");
  const negativeExperience = document.querySelector(
    '#bookingModal input[name="negativeExperience"]:checked',
  );
  const negativeExperienceNote = document.getElementById(
    "negativeExperienceNote",
  );
  const lastDentalVisit = document.getElementById("lastDentalVisit");
  const lastDentalTreatment = document.getElementById("lastDentalTreatment");
  const currentMedications = document.querySelector(
    '#bookingModal input[name="currentMedications"]:checked',
  );
  const medicationList = document.getElementById("medicationList");
  const medicalOther = document.getElementById("medicalOther");
  const allergyOther = document.getElementById("allergyOther");
  if (dentalConcernOther) {
    dentalConcernOther.value = medicalForm.dentalConcernOther || "";
  }
  document
    .querySelectorAll('#bookingModal input[name="negativeExperience"]')
    .forEach((radio) => {
      radio.checked = radio.value === medicalForm.negativeExperience;
    });
  if (negativeExperienceNote) {
    negativeExperienceNote.value = medicalForm.negativeExperienceNote || "";
  }
  if (lastDentalVisit) {
    lastDentalVisit.value = medicalForm.medLastVisit || "";
  }
  if (lastDentalTreatment) {
    lastDentalTreatment.value = medicalForm.medLastTreatment || "";
  }
  document
    .querySelectorAll('#bookingModal input[name="currentMedications"]')
    .forEach((radio) => {
      radio.checked = radio.value === medicalForm.currentMedications;
    });
  if (medicationList) {
    medicationList.value = medicalForm.currentMedicationsList || "";
  }
  if (medicalOther) {
    medicalOther.value = medicalForm.medicalOther || "";
  }
  if (allergyOther) {
    allergyOther.value = medicalForm.allergyOther || "";
  }
  document
    .querySelectorAll('#bookingModal input[name="currentMedications"]')
    .forEach((radio) => {
      radio.checked = radio.value === medicalForm.currentMedications;
    });
}
function closeBookingModal() {
  const modal = document.getElementById("bookingModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  closeServiceDropdown();
  closeTimePicker();
  bookingStep = 1;
  updateBookingStepUI();
}
function handleServiceInput(event) {
  renderServiceDropdown(event.target.value);
  openServiceDropdown();
  updateServiceDurationInfo();
}
function renderServiceDropdown(searchTerm = "") {
  const dropdown = document.getElementById("serviceDropdown");
  if (!dropdown) return;
  const term = String(searchTerm || "")
    .trim()
    .toLowerCase();
  const filtered = SERVICES.filter((service) =>
    service.name.toLowerCase().includes(term),
  );
  if (!filtered.length) {
    dropdown.innerHTML = `<div class="service-dropdown-empty">No service found.</div>`;
    return;
  }
  dropdown.innerHTML = "";
  filtered.forEach((service) => {
    const item = document.createElement("div");
    item.className = "service-dropdown-item";
    item.innerHTML = `<span class="service-dropdown-name">${escapeHtml(service.name)}</span><span class="service-dropdown-duration">${service.duration} min</span>`;
    item.addEventListener("click", () => {
      const input = document.getElementById("serviceInput");
      const duration = document.getElementById("durationInput");
      if (input) input.value = service.name;
      if (duration) {
        duration.value = service.duration;
        duration.disabled = true;
      }
      selectedTime = "";
      closeServiceDropdown();
      updateServiceDurationInfo();
      updateAvailableTimeSlots();
      updateBookingButton();
    });
    dropdown.appendChild(item);
  });
}
function openServiceDropdown() {
  document.getElementById("serviceSelectWrapper")?.classList.add("open");
}
function closeServiceDropdown() {
  document.getElementById("serviceSelectWrapper")?.classList.remove("open");
}
function toggleTimePicker() {
  const trigger = document.getElementById("timeTrigger");
  const dropdown = document.getElementById("timeDropdown");
  if (!trigger || !dropdown || trigger.disabled) return;
  dropdown.classList.toggle("open");
  trigger.classList.toggle("open");
}
function closeTimePicker() {
  document.getElementById("timeDropdown")?.classList.remove("open");
  document.getElementById("timeTrigger")?.classList.remove("open");
}
function classifyBookingPeriod(minutes) {
  if (minutes < 12 * 60) return "Morning";
  if (minutes < 18 * 60) return "Afternoon";
  return "Evening";
}
function unavTimeToMinutes(time) {
  const [h, m] = String(time || "")
    .split(":")
    .map(Number);
  return (h || 0) * 60 + (m || 0);
}
function normalizeUnavailabilityBlock(block) {
  const start = String(block.start || block.start_time || "").slice(0, 5);
  const end = String(block.end || block.end_time || "").slice(0, 5);
  const flag = block.allDay ?? block.all_day;
  const flagged =
    flag === true || flag === 1 || flag === "1" || flag === "true";
  const coversDay =
    !!start &&
    !!end &&
    unavTimeToMinutes(start) <= CLINIC_SCHEDULE.startHour * 60 &&
    unavTimeToMinutes(end) >= 18 * 60;
  return {
    ...block,
    date: String(block.date || block.unavailable_date || "").slice(0, 10),
    start,
    end,
    allDay: flagged || coversDay,
    reason: block.reason ?? "",
    dentist: block.doctorId || block.doctor_id || "",
  };
}
async function loadDoctorUnavailabilityForDate(date, dentist) {
  if (!date || !dentist) {
    doctorUnavailability = [];
    return;
  }
  try {
    const response = await fetch(
      `${UNAVAILABILITY_API}?doctor_id=${encodeURIComponent(dentist)}&date=${encodeURIComponent(date)}`,
      { credentials: "same-origin", cache: "no-store" },
    );
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Unavailability unavailable.");
    }
    doctorUnavailability = result.data.map(normalizeUnavailabilityBlock);
  } catch (error) {
    console.warn("Unable to load doctor unavailability.", error);
    doctorUnavailability = [];
  }
}
function getUnavailabilityBlocks(date, dentist) {
  return doctorUnavailability.filter(
    (block) => block.date === date && sameDentist(block.dentist, dentist),
  );
}
function findAllDayUnavailability(date, dentist) {
  return (
    getUnavailabilityBlocks(date, dentist).find((block) => block.allDay) || null
  );
}
function findUnavailabilityConflict(date, dentist, time, duration) {
  if (!date || !dentist || !time) return null;
  const start = unavTimeToMinutes(time);
  const end = start + (Number(duration) || CLINIC_SCHEDULE.slotMinutes);
  return (
    getUnavailabilityBlocks(date, dentist).find(
      (block) =>
        block.allDay ||
        (unavTimeToMinutes(block.start) < end &&
          unavTimeToMinutes(block.end) > start),
    ) || null
  );
}
function formatUnavailabilityRange(block) {
  return block.allDay
    ? "all day"
    : `from ${formatTime(block.start)} to ${formatTime(block.end)}`;
}
function getUnavailabilityMessage(date, dentist, time, duration) {
  const name = DENTISTS[dentist]?.name || "The dentist";
  const allDay = findAllDayUnavailability(date, dentist);
  if (allDay) {
    return `${name} is unavailable all day on ${formatDate(date)}${allDay.reason ? ` (${allDay.reason})` : ""}.`;
  }
  const block = findUnavailabilityConflict(date, dentist, time, duration);
  return block
    ? `${name} is unavailable ${formatUnavailabilityRange(block)} on ${formatDate(date)}.`
    : "";
}
function appendUnavailabilityGridNote(grid, date, dentist, dentistName) {
  const blocks = getUnavailabilityBlocks(date, dentist);
  if (!blocks.length) return;
  const note = document.createElement("div");
  note.className = "time-empty warning";
  note.style.gridColumn = "1 / -1";
  note.innerHTML = `<i class="fa-solid fa-user-slash"></i><span>${blocks
    .map(
      (block) =>
        `${escapeHtml(dentistName)} is unavailable ${escapeHtml(formatUnavailabilityRange(block))}${block.reason ? ` · ${escapeHtml(block.reason)}` : ""}`,
    )
    .join("<br>")}</span>`;
  grid.appendChild(note);
}
function getDoctorScheduleAppointmentsForDate(date, dentist) {
  const combined = [...appointments, ...doctorScheduleAppointments];
  return combined.filter((appointment) => {
    if (!date || !dentist || !getAppointmentDate(appointment)) return false;
    const appointmentDate = getAppointmentDate(appointment);
    return (
      dateToKey(keyToDate(appointmentDate)) === date &&
      sameDentist(getDentistId(appointment), dentist) &&
      isBookingConflictAppointment(appointment)
    );
  });
}
function generateBookingSlotStatuses(
  date,
  dentist,
  duration,
  ignoredAppointmentId = null,
) {
  const result = [];
  const dateObject = keyToDate(date);
  const today = new Date();
  const existingAppointments = getDoctorScheduleAppointmentsForDate(
    date,
    dentist,
  );
  for (
    let minutes = CLINIC_SCHEDULE.startHour * 60;
    minutes <= CLINIC_SCHEDULE.endHour * 60;
    minutes += CLINIC_SCHEDULE.slotMinutes
  ) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const slotStart = new Date(
      dateObject.getFullYear(),
      dateObject.getMonth(),
      dateObject.getDate(),
      hour,
      minute,
      0,
      0,
    );
    const slotEnd = new Date(slotStart.getTime() + duration * 60000);
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const isPast = date === dateToKey(today) && slotStart <= today;
    const isScheduled = existingAppointments.some((appointment) => {
      if (
        ignoredAppointmentId &&
        String(getAppointmentId(appointment)) === String(ignoredAppointmentId)
      ) {
        return false;
      }
      const appointmentTime = getAppointmentTime(appointment);
      if (!appointmentTime) return false;
      const [appointmentHour, appointmentMinute] = appointmentTime
        .split(":")
        .map(Number);
      const appointmentStart = new Date(
        dateObject.getFullYear(),
        dateObject.getMonth(),
        dateObject.getDate(),
        appointmentHour,
        appointmentMinute || 0,
        0,
        0,
      );
      const appointmentDuration = Number(
        appointment.duration ||
          appointment.duration_minutes ||
          appointment.durationMinutes ||
          30,
      );
      const appointmentEnd = new Date(
        appointmentStart.getTime() + appointmentDuration * 60000,
      );
      return slotStart < appointmentEnd && slotEnd > appointmentStart;
    });
    const isUnavailable = !!findUnavailabilityConflict(
      date,
      dentist,
      value,
      duration,
    );
    result.push({
      value,
      label: formatTime(value),
      period: classifyBookingPeriod(hour * 60 + minute),
      isPast,
      isScheduled: isScheduled || isUnavailable,
      isUnavailable,
    });
  }
  return result;
}
function appendBookingTimeGroup(container, label, slots) {
  const groupLabel = document.createElement("div");
  groupLabel.className = "time-picker-group-label";
  groupLabel.textContent = label;
  container.appendChild(groupLabel);
  const grid = document.createElement("div");
  grid.className = "time-picker-grid";
  slots.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-picker-option";
    if (slot.value === selectedTime) button.classList.add("selected");
    if (slot.isScheduled) {
      button.classList.add("scheduled");
      button.disabled = true;
      if (slot.isUnavailable) {
        const unavailableDentistName =
          DENTISTS[document.getElementById("dentistSelect")?.value]?.name ||
          "The dentist";
        button.classList.add("doctor-unavailable");
        button.title = `Not available because ${unavailableDentistName} is unavailable at this time.`;
        button.innerHTML = `<i class="fa-solid fa-user-slash time-unavailable-icon"></i><span>${slot.label}</span>`;
      } else {
        button.title = "This time is already scheduled.";
        button.innerHTML = `<i class="fa-solid fa-ban time-unavailable-icon"></i><span>${slot.label}</span>`;
      }
    } else if (slot.isPast) {
      button.classList.add("disabled");
      button.disabled = true;
      button.title = "This time has already passed.";
      button.innerHTML = `<i class="fa-solid fa-clock time-past-icon"></i><span>${slot.label}</span>`;
    } else {
      button.textContent = slot.label;
      button.addEventListener("click", () => {
        selectedTime = slot.value;
        const triggerLabel = document.getElementById("timeTriggerLabel");
        if (triggerLabel) triggerLabel.textContent = slot.label;
        closeTimePicker();
        updateAvailableTimeSlots();
        updateBookingButton();
      });
    }
    grid.appendChild(button);
  });
  container.appendChild(grid);
}
async function loadDoctorScheduleForSelectedDate(date, dentist) {
  await loadDoctorUnavailabilityForDate(date, dentist);
  if (!date || !dentist || !window.DentaNuevaAppointmentDatabase) {
    doctorScheduleAppointments = [];
    return;
  }
  try {
    const schedule = await window.DentaNuevaAppointmentDatabase.load({
      scope: "doctor_schedule",
      doctor_id: dentist,
      date,
    });
    doctorScheduleAppointments = Array.isArray(schedule) ? schedule : [];
  } catch (error) {
    console.warn("Unable to load doctor schedule for conflict checks.", error);
    doctorScheduleAppointments = [];
  }
}
async function updateAvailableTimeSlots() {
  const dropdown = document.getElementById("timeDropdown");
  const trigger = document.getElementById("timeTrigger");
  const triggerLabel = document.getElementById("timeTriggerLabel");
  const summary = document.getElementById("availableTimeSummary");
  if (!dropdown || !trigger || !triggerLabel) return;
  await loadAppointments();
  const date =
    document.getElementById("dateSelect")?.value || dateToKey(selectedDate);
  const dentist =
    document.getElementById("dentistSelect")?.value || doctors[0]?.id || "";
  const duration = Number(document.getElementById("durationInput")?.value || 0);
  await loadDoctorScheduleForSelectedDate(date, dentist);
  updateDateUnavailableState();
  dropdown.innerHTML = "";
  if (!date || isPastDate(date)) {
    trigger.disabled = true;
    triggerLabel.textContent = "Select a valid date";
    if (summary) {
      summary.textContent = "";
      summary.classList.remove("warning");
    }
    return;
  }
  if (isClinicClosedDate(date)) {
    selectedTime = "";
    trigger.disabled = true;
    closeTimePicker();
    triggerLabel.textContent = "Clinic closed";
    if (summary) {
      summary.textContent =
        "The clinic is closed on Sundays. Please choose Monday to Saturday.";
      summary.classList.add("warning");
    }
    updateBookingButton();
    return;
  }
  if (!duration || duration < 5) {
    trigger.disabled = true;
    triggerLabel.textContent = "Enter duration first";
    if (summary) {
      summary.textContent = "";
      summary.classList.remove("warning");
    }
    return;
  }
  const allDayBlock = findAllDayUnavailability(date, dentist);
  if (allDayBlock) {
    selectedTime = "";
    trigger.disabled = true;
    closeTimePicker();
    triggerLabel.textContent = "Dentist unavailable all day";
    if (summary) {
      summary.textContent = getUnavailabilityMessage(
        date,
        dentist,
        "",
        duration,
      );
      summary.classList.add("warning");
    }
    updateBookingButton();
    return;
  }
  const slots = generateBookingSlotStatuses(date, dentist, duration);
  trigger.disabled = false;
  const availableSlots = slots.filter(
    (slot) => !slot.isPast && !slot.isScheduled,
  );
  if (!slots.length) {
    triggerLabel.textContent = "No available time";
    dropdown.innerHTML = `<div class="time-picker-empty">No available time slots for this date.</div>`;
    if (summary) {
      summary.textContent =
        "The selected dentist has no available time for this duration.";
      summary.classList.add("warning");
    }
    selectedTime = "";
    updateBookingButton();
    return;
  }
  if (selectedTime) {
    const stillAvailable = availableSlots.some(
      (slot) => slot.value === selectedTime,
    );
    if (!stillAvailable) selectedTime = "";
  }
  triggerLabel.textContent = selectedTime
    ? formatTime(selectedTime)
    : "Select an available time";
  if (summary) {
    if (availableSlots.length) {
      summary.classList.remove("warning");
      summary.textContent = `${availableSlots.length} available time ${availableSlots.length === 1 ? "slot" : "slots"}`;
    } else {
      summary.classList.add("warning");
      summary.textContent =
        "No available slots for this dentist, date, and duration.";
    }
  }
  const morning = slots.filter((slot) => slot.period === "Morning");
  const afternoon = slots.filter((slot) => slot.period === "Afternoon");
  const evening = slots.filter((slot) => slot.period === "Evening");
  const dayBlocks = getUnavailabilityBlocks(date, dentist);
  if (dayBlocks.length) {
    const noteDentistName = DENTISTS[dentist]?.name || "The dentist";
    const note = document.createElement("div");
    note.className = "time-picker-unavailable-note";
    note.innerHTML = `<i class="fa-solid fa-user-slash"></i><span>${dayBlocks
      .map(
        (block) =>
          `${escapeHtml(noteDentistName)} is unavailable ${escapeHtml(formatUnavailabilityRange(block))}${block.reason ? ` · ${escapeHtml(block.reason)}` : ""}`,
      )
      .join("<br>")}</span>`;
    dropdown.appendChild(note);
  }
  if (morning.length) appendBookingTimeGroup(dropdown, "Morning", morning);
  if (afternoon.length)
    appendBookingTimeGroup(dropdown, "Afternoon", afternoon);
  if (evening.length) appendBookingTimeGroup(dropdown, "Evening", evening);
  updateBookingButton();
}
function generateAvailableSlots(
  date,
  dentist,
  duration,
  ignoredAppointmentId = null,
) {
  const result = [];
  const dateObject = keyToDate(date);
  const today = new Date();
  const existingAppointments = getDoctorScheduleAppointmentsForDate(
    date,
    dentist,
  );
  for (
    let minutes = CLINIC_SCHEDULE.startHour * 60;
    minutes + duration <= CLINIC_SCHEDULE.endHour * 60;
    minutes += CLINIC_SCHEDULE.slotMinutes
  ) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const slotStart = new Date(
      dateObject.getFullYear(),
      dateObject.getMonth(),
      dateObject.getDate(),
      hour,
      minute,
      0,
      0,
    );
    const slotEnd = new Date(slotStart.getTime() + duration * 60000);
    if (date === dateToKey(today) && slotStart <= today) continue;
    const conflict = existingAppointments.some((appointment) => {
      if (
        ignoredAppointmentId &&
        String(getAppointmentId(appointment)) === String(ignoredAppointmentId)
      ) {
        return false;
      }
      const appointmentTime = getAppointmentTime(appointment);
      if (!appointmentTime) return false;
      const [appointmentHour, appointmentMinute] = appointmentTime
        .split(":")
        .map(Number);
      const appointmentStart = new Date(
        dateObject.getFullYear(),
        dateObject.getMonth(),
        dateObject.getDate(),
        appointmentHour,
        appointmentMinute || 0,
        0,
        0,
      );
      const appointmentDuration = Number(
        appointment.duration ||
          appointment.duration_minutes ||
          appointment.durationMinutes ||
          30,
      );
      const appointmentEnd = new Date(
        appointmentStart.getTime() + appointmentDuration * 60000,
      );
      return slotStart < appointmentEnd && slotEnd > appointmentStart;
    });
    if (conflict) continue;
    const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    result.push({ value, label: formatTime(value) });
  }
  return result;
}
function getPatientBookingBlockMessage(
  patientId,
  date,
  ignoreAppointmentId = null,
) {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) return "";
  const restriction = getPatientBookingRestriction();
  if (restriction.isRestricted) {
    return getBookingRestrictionMessage(restriction);
  }
  const existingAppointment = appointments.find((appointment) => {
    if (String(getAppointmentId(appointment)) === String(ignoreAppointmentId)) {
      return false;
    }
    const appointmentPatientId = String(
      appointment?.patientId ||
        appointment?.patient_id ||
        appointment?.patientID ||
        "",
    )
      .trim()
      .toLowerCase();
    if (appointmentPatientId !== normalizedPatientId.toLowerCase()) {
      return false;
    }
    const status = normalizeStatus(getAppointmentStatus(appointment));
    if (
      status === "completed" ||
      status === "cancelled" ||
      status === "canceled" ||
      status === "noshow"
    ) {
      return false;
    }
    const appointmentDate = getAppointmentDate(appointment);
    if (!appointmentDate) {
      return false;
    }
    return true;
  });
  if (!existingAppointment) return "";
  const dateLabel = formatDate(existingAppointment.date);
  const timeLabel = formatTime(getAppointmentTime(existingAppointment));
  return `You already have an active appointment scheduled on ${dateLabel} at ${timeLabel}. Please complete your existing appointment before booking a new one.`;
}
function getPatientBookingRestriction() {
  const behavior = window.DentaNuevaAppointmentBehavior;
  if (!behavior) {
    return { isRestricted: false, noShowCount: 0, restrictedUntil: null };
  }
  return behavior.getRestriction(appointments, getCurrentPatientId());
}
function getBookingRestrictionMessage(restriction) {
  const behavior = window.DentaNuevaAppointmentBehavior;
  const endDate = behavior?.formatRestrictionEnd
    ? behavior.formatRestrictionEnd(restriction.restrictedUntil)
    : restriction.restrictedUntil?.toLocaleDateString("en-US");
  return `Booking is temporarily restricted due to repeated missed appointments. You may book again after ${endDate || "the restriction ends"}.`;
}
function renderBookingRestrictionAlert() {
  const alert = document.getElementById("bookingRestrictionAlert");
  const message = document.getElementById("bookingRestrictionMessage");
  const warning = document.getElementById("bookingWarningAlert");
  const warningMessage = document.getElementById("bookingWarningMessage");
  if (!alert || !message || !warning || !warningMessage) return;
  const restriction = getPatientBookingRestriction();
  alert.hidden = !restriction.isRestricted;
  warning.hidden = !restriction.isWarning;
  if (restriction.isRestricted) {
    message.textContent = getBookingRestrictionMessage(restriction);
  } else if (restriction.isWarning) {
    warningMessage.textContent =
      "You have 2 missed appointments. One more No Show will temporarily restrict new appointment booking for 2 days.";
  }
}
function updateBookingButton() {
  const button = document.getElementById(
    bookingStep === 1 ? "continueBooking" : "confirmBooking",
  );
  if (!button) return;
  const service = document.getElementById("serviceInput")?.value.trim() || "";
  const date = document.getElementById("dateSelect")?.value || "";
  const dentist = document.getElementById("dentistSelect")?.value || "";
  const duration = Number(document.getElementById("durationInput")?.value || 0);
  const patientBlockMessage = getCurrentPatientId()
    ? getPatientBookingBlockMessage(getCurrentPatientId(), date)
    : "";
  const conflict = selectedTime
    ? hasScheduleConflict(date, dentist, selectedTime, duration)
    : false;
  const allDayUnavailable = !!findAllDayUnavailability(date, dentist);
  const clinicClosed = isClinicClosedDate(date);
  button.disabled =
    !service ||
    !date ||
    isPastDate(date) ||
    clinicClosed ||
    !dentist ||
    !duration ||
    duration < 5 ||
    !selectedTime ||
    !!conflict ||
    allDayUnavailable ||
    !!patientBlockMessage;
  const unavailableMessage = getUnavailabilityMessage(
    date,
    dentist,
    selectedTime,
    duration,
  );
  const closedMessage = clinicClosed
    ? "The clinic is closed on Sundays. Please choose Monday to Saturday."
    : "";
  updateConflictNotice(
    conflict || !!unavailableMessage || clinicClosed,
    patientBlockMessage || closedMessage || unavailableMessage,
  );
}
function hasScheduleConflict(
  date,
  dentist,
  time,
  duration,
  ignoredAppointmentId = null,
) {
  if (!date || !dentist || !time || !duration) return false;
  if (findUnavailabilityConflict(date, dentist, time, duration)) return true;
  const dateObject = keyToDate(date);
  const [hour, minute] = time.split(":").map(Number);
  const start = new Date(
    dateObject.getFullYear(),
    dateObject.getMonth(),
    dateObject.getDate(),
    hour,
    minute || 0,
    0,
    0,
  );
  const end = new Date(start.getTime() + duration * 60000);
  return getDoctorScheduleAppointmentsForDate(date, dentist).some(
    (appointment) => {
      if (
        ignoredAppointmentId &&
        String(getAppointmentId(appointment)) === String(ignoredAppointmentId)
      ) {
        return false;
      }
      if (!isBookingConflictAppointment(appointment)) return false;
      const appointmentTime = getAppointmentTime(appointment);
      if (!appointmentTime) return false;
      const [appointmentHour, appointmentMinute] = appointmentTime
        .split(":")
        .map(Number);
      const appointmentStart = new Date(
        dateObject.getFullYear(),
        dateObject.getMonth(),
        dateObject.getDate(),
        appointmentHour,
        appointmentMinute || 0,
        0,
        0,
      );
      const appointmentDuration = Number(
        appointment.duration ||
          appointment.duration_minutes ||
          appointment.durationMinutes ||
          30,
      );
      const appointmentEnd = new Date(
        appointmentStart.getTime() + appointmentDuration * 60000,
      );
      return start < appointmentEnd && end > appointmentStart;
    },
  );
}
function updateConflictNotice(conflict, customMessage = "") {
  const notice = document.getElementById("scheduleConflictNotice");
  if (!notice) return;
  const text = document.getElementById("scheduleConflictText");
  if (customMessage && text) {
    text.textContent = customMessage;
  } else if (text && conflict) {
    text.textContent = "This time slot is unavailable.";
  }
  notice.classList.toggle("show", Boolean(conflict || customMessage));
}
function validateAppointmentDetails() {
  const service = document.getElementById("serviceInput")?.value.trim() || "";
  const date = document.getElementById("dateSelect")?.value || "";
  const dentist = document.getElementById("dentistSelect")?.value || "";
  const duration = Number(document.getElementById("durationInput")?.value || 0);
  const selectedService = SERVICES.find(
    (item) => item.name.toLowerCase() === service.toLowerCase(),
  );
  if (date && isClinicClosedDate(date)) {
    showToast("The clinic is closed on Sundays.");
    return false;
  }
  if (
    !selectedService ||
    duration !== selectedService.duration ||
    !date ||
    isPastDate(date) ||
    !dentist ||
    !DENTISTS[dentist] ||
    !selectedTime
  ) {
    showToast("Please complete all appointment details.");
    return false;
  }
  const patientBlockMessage = getCurrentPatientId()
    ? getPatientBookingBlockMessage(getCurrentPatientId(), date)
    : "";
  if (patientBlockMessage) {
    showToast(patientBlockMessage);
    updateConflictNotice(true, patientBlockMessage);
    return false;
  }
  if (hasScheduleConflict(date, dentist, selectedTime, duration)) {
    showToast("The selected time is no longer available.");
    updateAvailableTimeSlots();
    return false;
  }
  return true;
}
function updateBookingStepUI() {
  const step1 = document.getElementById("bookingStep1");
  const step2 = document.getElementById("bookingStep2");
  const continueButton = document.getElementById("continueBooking");
  const confirmButton = document.getElementById("confirmBooking");
  const backButton = document.getElementById("backBooking");
  const modalTitle = document.getElementById("modalTitle");
  const modalSubtitle = document.getElementById("modalSubtitle");
  const stepLabel = document.getElementById("bookingStepLabel");
  if (step1) step1.hidden = bookingStep !== 1;
  if (step2) step2.hidden = bookingStep !== 2;
  if (continueButton) continueButton.hidden = bookingStep !== 1;
  if (confirmButton) confirmButton.hidden = bookingStep !== 2;
  if (backButton) backButton.hidden = bookingStep !== 2;
  if (modalTitle)
    modalTitle.textContent =
      bookingStep === 1 ? "New Appointment" : "Patient Information";
  if (modalSubtitle)
    modalSubtitle.textContent =
      bookingStep === 1
        ? "Create a new appointment"
        : "Review and update your information before booking";
  if (stepLabel) stepLabel.textContent = `Step ${bookingStep} of 2`;
  const progressStep1 = document.getElementById("bookingProgressStep1");
  const progressStep2 = document.getElementById("bookingProgressStep2");
  if (progressStep1)
    progressStep1.classList.toggle("active", bookingStep === 1);
  if (progressStep2)
    progressStep2.classList.toggle("active", bookingStep === 2);
  if (bookingStep === 2) updateMedicalRecordSummary();
  updateBookingButton();
}
function goToBookingStep2() {
  currentUser = getCurrentUser();
  resolveCurrentPatient();
  if (!validateAppointmentDetails()) return;
  bookingStep = 2;
  updateBookingStepUI();
}
function goToBookingStep1() {
  bookingStep = 1;
  updateBookingStepUI();
}
function openMedicalRecordForUpdate() {
  if (!currentPatient) {
    showToast("Your patient record could not be loaded.");
    return;
  }
  populateMedicalRecordEditor();
  const modal = document.getElementById("recordEditModal");
  if (!modal) return;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}
function closeMedicalRecordEditor() {
  const modal = document.getElementById("recordEditModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}
function getRecordEditorValues(name) {
  return Array.from(
    document.querySelectorAll(`#recordEditModal input[name="${name}"]:checked`),
  ).map((input) => input.value);
}
function setRecordEditorValues(name, values) {
  const selectedValues = Array.isArray(values) ? values : [];
  document
    .querySelectorAll(`#recordEditModal input[name="${name}"]`)
    .forEach((input) => {
      input.checked = selectedValues.includes(input.value);
    });
}
function populateMedicalRecordEditor() {
  const medical = currentPatient?.medicalForm || {};
  document.getElementById("recordEditFirstName").value =
    currentPatient?.firstName || "";
  document.getElementById("recordEditLastName").value =
    currentPatient?.lastName || "";
  document.getElementById("recordEditDateOfBirth").value =
    currentPatient?.dateOfBirth || "";
  document.getElementById("recordEditGender").value =
    currentPatient?.gender || currentPatient?.patientGender || "";
  document.getElementById("recordEditPhone").value =
    currentPatient?.phone || "";
  document.getElementById("recordEditEmail").value =
    currentPatient?.email || "";
  document.getElementById("recordEditAddress").value =
    currentPatient?.address || "";
  document.getElementById("recordEditEmergencyName").value =
    currentPatient?.emergencyName || "";
  document.getElementById("recordEditEmergencyContact").value =
    currentPatient?.emergencyContact || "";
  setRecordEditorValues("recordEditDentalConcern", medical.dentalConcern);
  setRecordEditorValues("recordEditMedicalHistory", medical.medicalHistory);
  setRecordEditorValues("recordEditAllergies", medical.allergies);
  document.getElementById("recordEditDentalConcernOther").value =
    medical.dentalConcernOther || "";
  document.getElementById("recordEditMedicalOther").value =
    medical.medicalOther || "";
  document.getElementById("recordEditAllergyOther").value =
    medical.allergyOther || "";
  document.getElementById("recordEditDentalConcernOtherCheck").checked =
    Boolean(medical.dentalConcernOther);
  document.getElementById("recordEditMedicalOtherCheck").checked = Boolean(
    medical.medicalOther,
  );
  document.getElementById("recordEditAllergyOtherCheck").checked = Boolean(
    medical.allergyOther,
  );
  document
    .querySelectorAll('input[name="recordEditNegativeExperience"]')
    .forEach(
      (input) =>
        (input.checked = input.value === (medical.negativeExperience || "No")),
    );
  document.getElementById("recordEditNegativeExperienceNote").value =
    medical.negativeExperienceNote || "";
  document.getElementById("recordEditLastDentalVisit").value =
    medical.medLastVisit || "";
  document.getElementById("recordEditLastDentalTreatment").value =
    medical.medLastTreatment || "";
  document
    .querySelectorAll('input[name="recordEditCurrentMedications"]')
    .forEach(
      (input) =>
        (input.checked = input.value === (medical.currentMedications || "No")),
    );
  document.getElementById("recordEditMedicationList").value =
    medical.currentMedicationsList || "";
  document.getElementById("recordEditConsent").checked =
    medical.consent === true;
}
async function saveMedicalRecordEditor() {
  if (!currentPatient) return;
  const consent = document.getElementById("recordEditConsent")?.checked;
  if (!consent) {
    showToast("Please confirm that your medical information is accurate.");
    return;
  }
  const firstName =
    document.getElementById("recordEditFirstName")?.value.trim() || "";
  const lastName =
    document.getElementById("recordEditLastName")?.value.trim() || "";
  const dateOfBirth =
    document.getElementById("recordEditDateOfBirth")?.value || "";
  const gender = document.getElementById("recordEditGender")?.value || "";
  const phone = document.getElementById("recordEditPhone")?.value.trim() || "";
  const email = document.getElementById("recordEditEmail")?.value.trim() || "";
  const address =
    document.getElementById("recordEditAddress")?.value.trim() || "";
  const emergencyName =
    document.getElementById("recordEditEmergencyName")?.value.trim() || "";
  const emergencyContact =
    document.getElementById("recordEditEmergencyContact")?.value.trim() || "";
  if (
    !firstName ||
    !lastName ||
    !dateOfBirth ||
    !gender ||
    !phone ||
    !email ||
    !address ||
    !emergencyName ||
    !emergencyContact
  ) {
    showToast("Please complete all personal information.");
    return;
  }
  currentPatient.firstName = firstName;
  currentPatient.lastName = lastName;
  currentPatient.fullName = `${firstName} ${lastName}`.trim();
  currentPatient.dateOfBirth = dateOfBirth;
  currentPatient.gender = gender;
  currentPatient.patientGender = gender;
  currentPatient.phone = phone;
  currentPatient.email = email;
  currentPatient.address = address;
  currentPatient.emergencyName = emergencyName;
  currentPatient.emergencyContact = emergencyContact;
  const allergies = getRecordEditorValues("recordEditAllergies");
  const otherAllergy =
    document.getElementById("recordEditAllergyOther")?.value.trim() || "";
  if (
    allergies.includes("No Known Allergies") &&
    (allergies.length > 1 || otherAllergy)
  ) {
    showToast("No Known Allergies cannot be selected with another allergy.");
    return;
  }
  const now = new Date().toISOString();
  const existingMedical = currentPatient.medicalForm || {};
  const updatedMedicalForm = {
    ...existingMedical,
    dentalConcern: getRecordEditorValues("recordEditDentalConcern"),
    dentalConcernOther:
      document.getElementById("recordEditDentalConcernOther")?.value.trim() ||
      "",
    negativeExperience:
      document.querySelector(
        'input[name="recordEditNegativeExperience"]:checked',
      )?.value || "No",
    negativeExperienceNote:
      document
        .getElementById("recordEditNegativeExperienceNote")
        ?.value.trim() || "",
    medLastVisit:
      document.getElementById("recordEditLastDentalVisit")?.value || "",
    medLastTreatment:
      document.getElementById("recordEditLastDentalTreatment")?.value.trim() ||
      "",
    currentMedications:
      document.querySelector(
        'input[name="recordEditCurrentMedications"]:checked',
      )?.value || "No",
    currentMedicationsList:
      document.getElementById("recordEditMedicationList")?.value.trim() || "",
    medicalHistory: getRecordEditorValues("recordEditMedicalHistory"),
    medicalOther:
      document.getElementById("recordEditMedicalOther")?.value.trim() || "",
    allergies,
    allergyOther: otherAllergy,
    consent: true,
    completed: true,
    submittedBy: existingMedical.submittedBy || "patient",
    createdAt: existingMedical.createdAt || now,
    updatedAt: now,
  };
  currentPatient.medicalForm = updatedMedicalForm;
  currentPatient.updatedAt = now;
  const patientId = getCanonicalPatientId(currentPatient);
  const patientIndex = patients.findIndex(
    (patient) => getCanonicalPatientId(patient) === patientId,
  );
  if (patientIndex !== -1) {
    patients[patientIndex] = {
      ...patients[patientIndex],
      ...currentPatient,
    };
  } else {
    patients.push(currentPatient);
  }
  const saved = await savePatientRecordToDatabase();
  if (!saved) {
    showToast("The medical record could not be saved. Please try again.");
    return;
  }
  updateMedicalRecordSummary();
  loadBookingMedicalInformation();
  closeMedicalRecordEditor();
  showToast("Medical record updated successfully.");
}
function updateMedicalRecordSummary() {
  const summary = document.getElementById("medicalRecordSummary");
  if (!summary) return;
  const medicalForm = currentPatient?.medicalForm;
  if (!medicalForm) {
    summary.innerHTML = `<div class="medical-record-summary-empty"><i class="fa-regular fa-file-lines"></i><div><strong>No medical record yet</strong><span>Complete your medical record before confirming this appointment.</span></div></div>`;
    return;
  }
  const concerns = Array.isArray(medicalForm.dentalConcern)
    ? [...medicalForm.dentalConcern.filter(Boolean)]
    : [];
  const history = Array.isArray(medicalForm.medicalHistory)
    ? [...medicalForm.medicalHistory.filter(Boolean)]
    : [];
  const allergies = Array.isArray(medicalForm.allergies)
    ? [...medicalForm.allergies.filter(Boolean)]
    : [];
  if (medicalForm.dentalConcernOther) {
    concerns.push(`Other: ${medicalForm.dentalConcernOther}`);
  }
  if (medicalForm.medicalOther) {
    history.push(`Other: ${medicalForm.medicalOther}`);
  }
  if (medicalForm.allergyOther) {
    allergies.push(`Other: ${medicalForm.allergyOther}`);
  }
  const medication =
    medicalForm.currentMedications === "Yes"
      ? medicalForm.currentMedicationsList || "Currently taking medications"
      : medicalForm.currentMedications === "No"
        ? "No current medications"
        : "Not specified";
  const concernText = concerns.length
    ? concerns.join(", ")
    : "No recorded concern";
  const historyText = history.length
    ? history.join(", ")
    : "No recorded medical history";
  const allergyText = allergies.length
    ? allergies.join(", ")
    : "No recorded allergies";
  const lastVisit = medicalForm.medLastVisit || "Not specified";
  const lastTreatment = medicalForm.medLastTreatment || "Not specified";
  const dentalExperience =
    medicalForm.negativeExperience === "Yes"
      ? medicalForm.negativeExperienceNote ||
        "Previous negative experience reported"
      : "None reported";
  summary.innerHTML = `<div class="medical-record-summary-grid"><div><span>Dental Concern</span><strong>${escapeHtml(concernText)}</strong></div><div><span>Medical History</span><strong>${escapeHtml(historyText)}</strong></div><div><span>Allergies</span><strong>${escapeHtml(allergyText)}</strong></div><div><span>Medication Status</span><strong>${escapeHtml(medication)}</strong></div><div><span>Last Dental Visit</span><strong>${escapeHtml(lastVisit)}</strong></div><div><span>Last Treatment</span><strong>${escapeHtml(lastTreatment)}</strong></div><div class="medical-record-summary-item-wide"><span>Dental Experience</span><strong>${escapeHtml(dentalExperience)}</strong></div></div><div class="medical-record-summary-status"><i class="fa-solid fa-circle-check"></i><span>Record available for this appointment</span></div>`;
}
async function confirmBooking() {
  currentUser = getCurrentUser();
  await loadAppointments();
  resolveCurrentPatient();
  if (!validateAppointmentDetails()) return;
  const patientId = getCurrentPatientId();
  if (!patientId) {
    showToast("Unable to identify your patient account.");
    return;
  }
  const firstName =
    currentPatient?.firstName || currentPatient?.first_name || "";
  const lastName = currentPatient?.lastName || currentPatient?.last_name || "";
  const dateOfBirth =
    currentPatient?.dateOfBirth || currentPatient?.date_of_birth || "";
  const gender = currentPatient?.gender || currentPatient?.patientGender || "";
  const phone = currentPatient?.phone || currentPatient?.phone_number || "";
  const email = currentPatient?.email || "";
  const address = currentPatient?.address || "";
  const emergencyName =
    currentPatient?.emergencyName || currentPatient?.emergency_name || "";
  const emergencyContact =
    currentPatient?.emergencyContact || currentPatient?.emergency_contact || "";
  if (
    !firstName ||
    !lastName ||
    !dateOfBirth ||
    !gender ||
    !phone ||
    !email ||
    !address ||
    !emergencyName ||
    !emergencyContact
  ) {
    showToast("Please complete all patient information.");
    return;
  }
  const medicalForm = currentPatient?.medicalForm;
  if (!medicalForm?.completed) {
    showToast("Please complete your medical record before booking.");
    return;
  }
  if (!medicalForm.consent) {
    showToast(
      "Please confirm your consent in your medical record before booking.",
    );
    return;
  }
  const service = document.getElementById("serviceInput")?.value.trim() || "";
  const date = document.getElementById("dateSelect")?.value || "";
  const dentist = document.getElementById("dentistSelect")?.value || "";
  const patientBlockMessage = getPatientBookingBlockMessage(patientId, date);
  if (patientBlockMessage) {
    showToast(patientBlockMessage);
    updateConflictNotice(true, patientBlockMessage);
    return;
  }
  const now = new Date().toISOString();
  const updatedMedicalForm = { ...medicalForm, updatedAt: now };
  const selectedService = SERVICES.find(
    (item) => item.name.toLowerCase() === service.toLowerCase(),
  );
  const duration = selectedService ? selectedService.duration : 0;
  const durationInput = document.getElementById("durationInput");
  if (durationInput) {
    durationInput.value = duration;
    durationInput.disabled = true;
  }
  loadPatients();
  let patient = patients.find(
    (item) =>
      String(getCanonicalPatientId(item)).toLowerCase() ===
      String(patientId).toLowerCase(),
  );
  if (!patient && currentPatient) patient = currentPatient;
  if (!patient) {
    patient = {
      patientId,
      id: patientId,
      userId: currentUser?.id || null,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      email,
      phone,
      dateOfBirth,
      gender,
      address,
      emergencyName,
      emergencyContact,
      appointments: [],
    };
    patients.push(patient);
  }
  patient.patientId = patientId;
  patient.id = patientId;
  patient.userId =
    patient.userId || currentUser?.id || currentUser?.userId || null;
  patient.firstName = firstName;
  patient.lastName = lastName;
  patient.fullName = `${firstName} ${lastName}`.trim();
  patient.email = email;
  patient.phone = phone;
  patient.dateOfBirth = dateOfBirth;
  patient.gender = gender;
  patient.address = address;
  patient.emergencyName = emergencyName;
  patient.emergencyContact = emergencyContact;
  patient.medicalForm = updatedMedicalForm;
  patient.appointments = Array.isArray(patient.appointments)
    ? patient.appointments
    : [];
  currentPatient = patient;
  const appointment = {
    id: `appt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    patientId,
    patient_id: patientId,
    patient: `${firstName} ${lastName}`.trim(),
    date,
    appointment_date: date,
    start: selectedTime,
    appointment_time: selectedTime,
    type: service,
    service_type: service,
    dentist,
    dentist_id: dentist,
    duration,
    status: "Scheduled",
    checkedIn: false,
    checkedInAt: null,
    consultationStarted: false,
    manualReadyComplete: false,
    paymentStatus: "unpaid",
    paymentAmount: 0,
  };
  appointments.push(appointment);
  const saved = await saveAppointments();
  if (!saved) {
    appointments = appointments.filter(
      (item) => getAppointmentId(item) !== getAppointmentId(appointment),
    );
    showToast("Appointment could not be saved. Please try again.");
    return;
  }
  syncAppointmentToPatient(appointment);
  selectedDate = keyToDate(date);
  calendarDate = new Date(selectedDate);
  calendarDate.setDate(1);
  closeBookingModal();
  renderAll();
  showToast("Appointment scheduled successfully.");
}
function syncAppointmentToPatient(appointment) {
  if (!currentPatient || !appointment) return;
  const patientId = getCurrentPatientId();
  if (!patientId) return;
  const updatedPatients = patients.map((patient) => {
    const id = String(
      patient?.patient_id ||
        patient?.patientId ||
        patient?.id ||
        patient?.user_id ||
        patient?.userId ||
        "",
    );
    if (
      getCanonicalPatientId(findPatientByIdentifier(id)) !== patientId &&
      id !== patientId
    )
      return patient;
    const existing = Array.isArray(patient.appointments)
      ? patient.appointments
      : [];
    const index = existing.findIndex(
      (item) => getAppointmentId(item) === getAppointmentId(appointment),
    );
    const updatedAppointments = [...existing];
    if (index === -1) updatedAppointments.push(appointment);
    else updatedAppointments[index] = appointment;
    return { ...patient, appointments: updatedAppointments };
  });
  patients = updatedPatients;
}
function handleDocumentClick(event) {
  const serviceWrapper = document.getElementById("serviceSelectWrapper");
  const timeWrapper = document.getElementById("timeFieldWrapper");
  if (serviceWrapper && !serviceWrapper.contains(event.target))
    closeServiceDropdown();
  if (timeWrapper && !timeWrapper.contains(event.target)) closeTimePicker();
  const action = event.target.closest("[data-appointment-action]");
  if (action) {
    const appointmentId = action.getAttribute("data-appointment-id");
    if (action.dataset.appointmentAction === "details")
      openAppointmentDetail(appointmentId);
  }
}
function openAppointmentDetail(appointmentId) {
  const appointment = findAppointmentById(appointmentId);
  if (!appointment) {
    showToast("Appointment could not be found.");
    return;
  }
  detailAppointmentId = appointmentId;
  const modal = document.getElementById("appointmentModal");
  const body = document.getElementById("appointmentDetailBody");
  const subtitle = document.getElementById("appointmentModalSubtitle");
  if (!modal || !body) return;
  const service = getAppointmentService(appointment);
  const dentist = getDentistName(appointment);
  const date = getAppointmentDate(appointment);
  const time = getAppointmentTime(appointment);
  const status = getAppointmentStatus(appointment);
  const duration = Number(
    appointment.duration ||
      appointment.duration_minutes ||
      appointment.durationMinutes ||
      0,
  );
  if (subtitle)
    subtitle.textContent = `${formatShortDate(date)} · ${formatTime(time)}`;
  body.innerHTML = `
    <div class="detail-grid">
    <div class="detail-card full">
    <span>Service</span>
    <strong>${escapeHtml(service)}</strong>
    </div>
    <div class="detail-card">
    <span>Date</span>
    <strong>${escapeHtml(formatDate(date))}</strong>
    </div>
    <div class="detail-card">
    <span>Time</span>
    <strong>${escapeHtml(formatTime(time))}</strong>
    </div>
    <div class="detail-card">
    <span>Dentist</span>
    <strong>${escapeHtml(dentist)}</strong>
    </div>
    <div class="detail-card">
    <span>Duration</span>
    <strong>${duration ? `${duration} minutes` : "Not specified"}</strong>
    </div>
    <div class="detail-card full">
    <span>Status</span>
    <strong>
    <span class="detail-status ${getStatusClass(status)}">${escapeHtml(getPatientStatusLabel(status, date))}</span>
    </strong>
    </div>
    </div>
    `;
  const requestButton = document.getElementById("requestRescheduleBtn");
  const cancelButton = document.getElementById("cancelAppointmentBtn");
  const deleteButton = document.getElementById("deleteAppointmentBtn");
  const normalizedStatus = normalizeStatus(status);
  const isCancelled =
    normalizedStatus === "cancelled" || normalizedStatus === "canceled";
  if (cancelButton) {
    cancelButton.style.display = isCancelled ? "none" : "inline-flex";
  }
  if (deleteButton) {
    deleteButton.style.display = isCancelled ? "inline-flex" : "none";
    deleteButton.title = isCancelled
      ? "Delete this cancelled appointment for testing."
      : "Delete appointment";
  }
  if (requestButton) {
    const limitReached = hasReachedAppointmentRescheduleLimit(appointment);
    const isDisabled =
      normalizedStatus === "completed" ||
      isCancelled ||
      normalizedStatus === "noshow" ||
      limitReached;
    requestButton.style.display = isDisabled ? "inline-flex" : "inline-flex";
    requestButton.disabled = limitReached;
    requestButton.textContent = limitReached
      ? "Reschedule Limit Reached"
      : "Reschedule";
    requestButton.title = limitReached
      ? "This appointment has reached the maximum of 2 approved reschedules."
      : "Request a different schedule for this appointment.";
    if (
      normalizedStatus === "completed" ||
      isCancelled ||
      normalizedStatus === "noshow"
    ) {
      requestButton.style.display = "none";
    }
  }
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function cancelAppointment() {
  if (!detailAppointmentId) {
    showToast("Appointment could not be identified.");
    return;
  }
  const appointment = findAppointmentById(detailAppointmentId);
  if (!appointment) {
    showToast("Appointment could not be found.");
    return;
  }
  const appointmentLabel = `${getAppointmentService(appointment)} on ${formatDate(getAppointmentDate(appointment))} at ${formatTime(getAppointmentTime(appointment))}`;
  const message = document.getElementById("cancelAppointmentConfirmMessage");
  if (message) {
    message.textContent = `${appointmentLabel}. The time slot will become available again and this appointment will stay in your history.`;
  }
  const modal = document.getElementById("cancelAppointmentConfirmModal");
  if (!modal) return;
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeCancelAppointmentConfirmation() {
  const modal = document.getElementById("cancelAppointmentConfirmModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function confirmCancelAppointment() {
  const appointment = findAppointmentById(detailAppointmentId);
  if (!appointment) {
    closeCancelAppointmentConfirmation();
    showToast("Appointment could not be found.");
    return;
  }
  const appointmentId = getAppointmentId(appointment);
  const cancelledAt = new Date().toISOString();
  appointments = appointments.map((item) => {
    if (getAppointmentId(item) !== appointmentId) {
      return item;
    }
    return {
      ...item,
      status: "cancelled",
      cancelledAt,
      cancelled_at: cancelledAt,
      reason: "patient_cancelled",
      cancelReason: "patient_cancelled",
    };
  });
  saveAppointments();
  if (currentPatient) {
    currentPatient.appointments = Array.isArray(currentPatient.appointments)
      ? currentPatient.appointments.map((item) => {
          if (getAppointmentId(item) !== appointmentId) {
            return item;
          }
          return {
            ...item,
            status: "cancelled",
            cancelledAt,
            cancelled_at: cancelledAt,
            reason: "patient_cancelled",
            cancelReason: "patient_cancelled",
          };
        })
      : [];
    patients = patients.map((patient) => {
      const patientId = getCanonicalPatientId(patient);
      return patientId &&
        patientId.toLowerCase() === getCurrentPatientId().toLowerCase()
        ? currentPatient
        : patient;
    });
  }
  const requests = loadRescheduleRequests();
  const remainingRequests = requests.filter(
    (request) =>
      String(request?.appointment_id || request?.appointmentId || "") !==
      appointmentId,
  );
  detailAppointmentId = null;
  closeCancelAppointmentConfirmation();
  closeAppointmentDetail();
  renderAll();
  showToast("Appointment cancelled successfully.");
}
function deleteAppointment() {
  if (!detailAppointmentId) {
    showToast("Appointment could not be identified.");
    return;
  }
  const appointment = findAppointmentById(detailAppointmentId);
  if (!appointment) {
    showToast("Appointment could not be found.");
    return;
  }
  const appointmentId = getAppointmentId(appointment);
  const appointmentLabel = `${getAppointmentService(appointment)} on ${formatDate(getAppointmentDate(appointment))} at ${formatTime(getAppointmentTime(appointment))}`;
  const confirmed = window.confirm(
    `Delete this appointment permanently?\n\n${appointmentLabel}\n\nThis removes it from the appointment history for testing.`,
  );
  if (!confirmed) return;
  appointments = appointments.filter(
    (item) => getAppointmentId(item) !== appointmentId,
  );
  saveAppointments();
  void window.DentaNuevaAppointmentDatabase?.remove(appointmentId).catch(
    (error) => {
      console.error("Unable to delete appointment from database:", error);
    },
  );
  if (currentPatient) {
    currentPatient.appointments = Array.isArray(currentPatient.appointments)
      ? currentPatient.appointments.filter(
          (item) => getAppointmentId(item) !== appointmentId,
        )
      : [];
    patients = patients.map((patient) => {
      const patientId = getCanonicalPatientId(patient);
      return patientId &&
        patientId.toLowerCase() === getCurrentPatientId().toLowerCase()
        ? currentPatient
        : patient;
    });
  }
  const remainingRequests = loadRescheduleRequests().filter(
    (request) =>
      String(request?.appointment_id || request?.appointmentId || "") !==
      appointmentId,
  );
  detailAppointmentId = null;
  closeAppointmentDetail();
  renderAll();
  showToast("Appointment deleted successfully.");
}
function closeAppointmentDetail() {
  const modal = document.getElementById("appointmentModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  detailAppointmentId = null;
  document.body.style.overflow = "";
}
function openRescheduleRequestModal() {
  if (!detailAppointmentId) return;
  const appointment = findAppointmentById(detailAppointmentId);
  if (!appointment) {
    showToast("Appointment could not be found.");
    return;
  }
  if (hasReachedAppointmentRescheduleLimit(appointment)) {
    showToast(
      "This appointment has reached the maximum of 2 approved reschedules.",
    );
    return;
  }
  requestAppointmentId = getAppointmentId(appointment);
  requestTime = "";
  const modal = document.getElementById("rescheduleRequestModal");
  const current = document.getElementById("requestCurrentAppointment");
  const requestDate = document.getElementById("requestDate");
  if (!modal || !current) return;
  current.innerHTML = `
    <strong>${escapeHtml(getAppointmentService(appointment))}</strong>
    <span>${escapeHtml(formatDate(getAppointmentDate(appointment)))} · ${escapeHtml(formatTime(getAppointmentTime(appointment)))} · ${escapeHtml(getDentistName(appointment))}</span>
    `;
  if (requestDate) {
    requestDate.min = dateToKey(new Date());
    requestDate.value = "";
  }
  renderRequestTimeGrid("");
  closeAppointmentDetail();
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}
function closeRescheduleRequestModal() {
  const modal = document.getElementById("rescheduleRequestModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  requestAppointmentId = null;
  requestTime = "";
  document.body.style.overflow = "";
}
function handleRequestDateChange(event) {
  const date = event.target.value;
  requestTime = "";
  renderRequestTimeGrid(date);
}
async function renderRequestTimeGrid(date) {
  const grid = document.getElementById("requestTimeGrid");
  const count = document.getElementById("requestAvailabilityCount");
  if (!grid) return;
  if (!date) {
    grid.innerHTML = `<div class="time-empty"><i class="fa-regular fa-clock"></i><span>Select a preferred date to view available times.</span></div>`;
    if (count) count.textContent = "Select a date";
    return;
  }
  if (isPastDate(date)) {
    grid.innerHTML = `<div class="time-empty warning"><i class="fa-solid fa-triangle-exclamation"></i><span>Please select a current or future date.</span></div>`;
    if (count) count.textContent = "Invalid date";
    return;
  }
  if (isClinicClosedDate(date)) {
    requestTime = "";
    grid.innerHTML = `<div class="time-empty warning"><i class="fa-solid fa-door-closed"></i><span>The clinic is closed on Sundays. Please choose Monday to Saturday.</span></div>`;
    if (count) count.textContent = "Clinic closed";
    return;
  }
  const appointment = findAppointmentById(requestAppointmentId);
  if (!appointment) return;
  const dentist = getDentistId(appointment);
  const duration = Number(
    appointment.duration ||
      appointment.duration_minutes ||
      appointment.durationMinutes ||
      30,
  );
  await loadDoctorScheduleForSelectedDate(date, dentist);
  const allDayBlock = findAllDayUnavailability(date, dentist);
  if (allDayBlock) {
    requestTime = "";
    grid.innerHTML = `<div class="time-empty warning"><i class="fa-solid fa-user-slash"></i><span>${escapeHtml(getDentistName(appointment))} is unavailable all day on ${escapeHtml(formatDate(date))}${allDayBlock.reason ? ` (${escapeHtml(allDayBlock.reason)})` : ""}.</span></div>`;
    if (count) count.textContent = "Dentist unavailable";
    return;
  }
  const slots = generateBookingSlotStatuses(
    date,
    dentist,
    duration,
    requestAppointmentId,
  );
  const availableSlots = slots.filter(
    (slot) => !slot.isPast && !slot.isScheduled,
  );
  if (count)
    count.textContent = `${availableSlots.length} available ${availableSlots.length === 1 ? "time" : "times"}`;
  if (!slots.length) {
    grid.innerHTML = `<div class="time-empty warning"><i class="fa-regular fa-clock"></i><span>No available times for the selected date.</span></div>`;
    return;
  }
  grid.innerHTML = "";
  appendUnavailabilityGridNote(
    grid,
    date,
    dentist,
    getDentistName(appointment),
  );
  slots.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-option";
    if (slot.value === requestTime) button.classList.add("selected");
    if (slot.isScheduled || slot.isPast) {
      button.disabled = true;
      button.classList.add(slot.isScheduled ? "scheduled" : "disabled");
      if (slot.isUnavailable) button.classList.add("doctor-unavailable");
      button.dataset.tooltip = slot.isUnavailable
        ? "The dentist is unavailable at this time."
        : slot.isScheduled
          ? "This time is already booked."
          : "This time has already passed.";
      button.innerHTML = `<i class="fa-solid ${slot.isUnavailable ? "fa-user-slash time-unavailable-icon" : slot.isScheduled ? "fa-ban time-unavailable-icon" : "fa-clock time-past-icon"}"></i><span>${slot.label}</span>`;
    } else {
      button.textContent = slot.label;
      button.addEventListener("click", () => {
        requestTime = slot.value;
        void renderRequestTimeGrid(date);
      });
    }
    grid.appendChild(button);
  });
}
async function sendRescheduleRequest() {
  if (!requestAppointmentId) {
    showToast("No appointment selected.");
    return;
  }
  const appointment = findAppointmentById(requestAppointmentId);
  if (!appointment) {
    showToast("Appointment could not be found.");
    return;
  }
  if (hasReachedAppointmentRescheduleLimit(appointment)) {
    showToast(
      "This appointment has reached the maximum of 2 approved reschedules.",
    );
    return;
  }
  const preferredDate = document.getElementById("requestDate")?.value || "";
  if (!preferredDate) {
    showToast("Please select a preferred new date.");
    return;
  }
  if (isClinicClosedDate(preferredDate)) {
    showToast("The clinic is closed on Sundays.");
    return;
  }
  if (!requestTime) {
    showToast("Please select a preferred new time.");
    return;
  }
  if (isPastDate(preferredDate)) {
    showToast("The selected date has already passed.");
    return;
  }
  const duration = Number(
    appointment.duration ||
      appointment.duration_minutes ||
      appointment.durationMinutes ||
      30,
  );
  await loadAppointments();
  await loadDoctorScheduleForSelectedDate(
    preferredDate,
    getDentistId(appointment),
  );
  const refreshedAppointment = findAppointmentById(requestAppointmentId);
  if (!refreshedAppointment) {
    showToast("The appointment could not be refreshed.");
    return;
  }
  if (
    hasScheduleConflict(
      preferredDate,
      getDentistId(refreshedAppointment),
      requestTime,
      duration,
      requestAppointmentId,
    )
  ) {
    showToast("The selected time is already occupied.");
    renderRequestTimeGrid(preferredDate);
    return;
  }
  const nextCount = getAppointmentRescheduleCount(refreshedAppointment) + 1;
  if (nextCount > 2) {
    showToast("This appointment has reached the maximum of 2 reschedules.");
    return;
  }
  const now = new Date().toISOString();
  const history = Array.isArray(refreshedAppointment.rescheduleHistory)
    ? refreshedAppointment.rescheduleHistory
    : [];
  history.push({
    oldDate: getAppointmentDate(refreshedAppointment),
    oldTime: getAppointmentTime(refreshedAppointment),
    newDate: preferredDate,
    newTime: requestTime,
    requestedBy: "patient",
    changedAt: now,
  });
  refreshedAppointment.date = preferredDate;
  refreshedAppointment.appointment_date = preferredDate;
  refreshedAppointment.appointmentDate = preferredDate;
  refreshedAppointment.start = requestTime;
  refreshedAppointment.time = requestTime;
  refreshedAppointment.appointment_time = requestTime;
  refreshedAppointment.appointmentTime = requestTime;
  refreshedAppointment.status = "scheduled";
  refreshedAppointment.rescheduleCount = nextCount;
  refreshedAppointment.reschedule_count = nextCount;
  refreshedAppointment.approvedRescheduleCount = nextCount;
  refreshedAppointment.rescheduleHistory = history;
  refreshedAppointment.reschedule_history = history;
  let savedAppointments;
  try {
    savedAppointments =
      await window.DentaNuevaAppointmentDatabase.reschedule(
        refreshedAppointment,
      );
  } catch (error) {
    console.error("Unable to reschedule appointment:", error);
    showToast("Unable to reschedule the appointment. Please try again.");
    return;
  }
  if (Array.isArray(savedAppointments)) {
    appointments = savedAppointments;
  }
  await hydrateAppointmentsFromDatabase();
  const persistedAppointment = findAppointmentById(requestAppointmentId);
  if (
    !persistedAppointment ||
    getAppointmentDate(persistedAppointment) !== preferredDate ||
    String(getAppointmentTime(persistedAppointment)).slice(0, 5) !==
      String(requestTime).slice(0, 5)
  ) {
    showToast("The new schedule was not confirmed by the database.");
    return;
  }
  closeRescheduleRequestModal();
  selectedDate = keyToDate(preferredDate);
  calendarDate = new Date(selectedDate);
  calendarDate.setDate(1);
  renderAll();
}
function openStaffRescheduleModal(request) {
  staffRequestTargetId = request?.id || request?.request_id || null;
  staffRequestTime = "";
  const modal = document.getElementById("staffRescheduleModal");
  const current = document.getElementById("staffRequestCurrentAppointment");
  const reasonInput = document.getElementById("staffRequestReason");
  const messageInput = document.getElementById("staffRequestMessage");
  const dateInput = document.getElementById("staffRequestDate");
  if (!modal || !current) return;
  let appointment = findAppointmentById(
    request?.appointmentId || request?.appointment_id,
  );
  const serviceName =
    request?.service ||
    (appointment ? getAppointmentService(appointment) : "Dental Appointment");
  const dentistName =
    request?.currentDentistName ||
    (appointment ? getDentistName(appointment) : "Assigned Dentist");
  const currentDate =
    request?.currentDate ||
    (appointment ? getAppointmentDate(appointment) : "");
  const currentTime =
    request?.currentTime ||
    (appointment ? getAppointmentTime(appointment) : "");
  current.innerHTML = `
    <strong>${escapeHtml(serviceName)}</strong>
    <span>${escapeHtml(formatDate(currentDate))} · ${escapeHtml(formatTime(currentTime))} · ${escapeHtml(dentistName)}</span>
    `;
  if (reasonInput)
    reasonInput.value = request?.reasonLabel || request?.reason || "";
  if (messageInput) messageInput.value = request?.message || "";
  if (dateInput) {
    dateInput.min = dateToKey(new Date());
    dateInput.value = "";
  }
  updateStaffRescheduleConfirmState();
  renderStaffRequestTimeGrid("");
  closeAppointmentDetail();
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function updateStaffRescheduleConfirmState() {
  const confirmButton = document.getElementById("confirmStaffReschedule");
  const dateInput = document.getElementById("staffRequestDate");
  if (!confirmButton || !dateInput) return;
  const hasSelection = Boolean(dateInput.value && staffRequestTime);
  confirmButton.disabled = !hasSelection;
  confirmButton.classList.toggle("is-disabled", !hasSelection);
  confirmButton.setAttribute("aria-disabled", String(!hasSelection));
}
function closeStaffRescheduleModal() {
  const modal = document.getElementById("staffRescheduleModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  staffRequestTargetId = null;
  staffRequestTime = "";
  document.body.style.overflow = "";
  const confirmButton = document.getElementById("confirmStaffReschedule");
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.classList.add("is-disabled");
    confirmButton.setAttribute("aria-disabled", "true");
  }
}
function handleStaffRequestDateChange(event) {
  const date = event.target.value;
  staffRequestTime = "";
  updateStaffRescheduleConfirmState();
  renderStaffRequestTimeGrid(date);
}
async function renderStaffRequestTimeGrid(date) {
  const grid = document.getElementById("staffRequestTimeGrid");
  const count = document.getElementById("staffRequestAvailabilityCount");
  if (!grid) return;
  if (!date) {
    grid.innerHTML = `<div class="time-empty"><i class="fa-regular fa-clock"></i><span>Select a preferred date to view available times.</span></div>`;
    if (count) count.textContent = "Select a date";
    return;
  }
  if (isPastDate(date)) {
    grid.innerHTML = `<div class="time-empty warning"><i class="fa-solid fa-triangle-exclamation"></i><span>Please select a current or future date.</span></div>`;
    if (count) count.textContent = "Invalid date";
    return;
  }
  if (isClinicClosedDate(date)) {
    staffRequestTime = "";
    grid.innerHTML = `<div class="time-empty warning"><i class="fa-solid fa-door-closed"></i><span>The clinic is closed on Sundays. Please choose Monday to Saturday.</span></div>`;
    if (count) count.textContent = "Clinic closed";
    updateStaffRescheduleConfirmState();
    return;
  }
  const request = loadRescheduleRequests().find(
    (item) =>
      String(item?.id || item?.request_id) === String(staffRequestTargetId),
  );
  if (!request) return;
  let appointment = findAppointmentById(
    request?.appointmentId || request?.appointment_id,
  );
  if (!appointment) return;
  const dentist = getDentistId(appointment);
  const duration = Number(
    appointment?.duration ||
      appointment?.duration_minutes ||
      appointment?.durationMinutes ||
      30,
  );
  await loadDoctorScheduleForSelectedDate(date, dentist);
  const allDayBlock = findAllDayUnavailability(date, dentist);
  if (allDayBlock) {
    staffRequestTime = "";
    grid.innerHTML = `<div class="time-empty warning"><i class="fa-solid fa-user-slash"></i><span>${escapeHtml(getDentistName(appointment))} is unavailable all day on ${escapeHtml(formatDate(date))}${allDayBlock.reason ? ` (${escapeHtml(allDayBlock.reason)})` : ""}.</span></div>`;
    if (count) count.textContent = "Dentist unavailable";
    updateStaffRescheduleConfirmState();
    return;
  }
  const appointmentId = getAppointmentId(appointment);
  const slots = generateBookingSlotStatuses(
    date,
    dentist,
    duration,
    appointmentId,
  );
  const availableSlots = slots.filter(
    (slot) => !slot.isPast && !slot.isScheduled,
  );
  if (count)
    count.textContent = `${availableSlots.length} available ${availableSlots.length === 1 ? "time" : "times"}`;
  if (!slots.length) {
    grid.innerHTML = `<div class="time-empty warning"><i class="fa-regular fa-clock"></i><span>No available times for the selected date.</span></div>`;
    return;
  }
  grid.innerHTML = "";
  appendUnavailabilityGridNote(
    grid,
    date,
    dentist,
    getDentistName(appointment),
  );
  slots.forEach((slot) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-option";
    if (slot.value === staffRequestTime) button.classList.add("selected");
    if (slot.isScheduled || slot.isPast) {
      button.disabled = true;
      button.classList.add(slot.isScheduled ? "scheduled" : "disabled");
      if (slot.isUnavailable) button.classList.add("doctor-unavailable");
      button.dataset.tooltip = slot.isUnavailable
        ? "The dentist is unavailable at this time."
        : slot.isScheduled
          ? "This time is already booked."
          : "This time has already passed.";
      button.innerHTML = `<i class="fa-solid ${slot.isUnavailable ? "fa-user-slash time-unavailable-icon" : slot.isScheduled ? "fa-ban time-unavailable-icon" : "fa-clock time-past-icon"}"></i><span>${slot.label}</span>`;
    } else {
      button.textContent = slot.label;
      button.addEventListener("click", () => {
        staffRequestTime = slot.value;
        updateStaffRescheduleConfirmState();
        void renderStaffRequestTimeGrid(date);
      });
    }
    grid.appendChild(button);
  });
  updateStaffRescheduleConfirmState();
}
async function confirmStaffRescheduleResponse() {
  if (!staffRequestTargetId) return;
  const request = loadRescheduleRequests().find(
    (item) =>
      String(item?.id || item?.request_id) === String(staffRequestTargetId),
  );
  if (!request) {
    closeStaffRescheduleModal();
    return;
  }
  const dateInput = document.getElementById("staffRequestDate");
  const newDate = dateInput?.value || "";
  if (!newDate || !staffRequestTime) {
    showToast("Please select a new date and time.");
    return;
  }
  if (isClinicClosedDate(newDate)) {
    showToast("The clinic is closed on Sundays.");
    return;
  }
  let appointment = findAppointmentById(
    request?.appointmentId || request?.appointment_id,
  );
  if (!appointment) {
    showToast("The appointment could not be found.");
    return;
  }
  const duration = Number(
    appointment.duration ||
      appointment.duration_minutes ||
      appointment.durationMinutes ||
      30,
  );
  if (isPastDate(newDate)) {
    showToast("The selected date has already passed.");
    return;
  }
  await loadAppointments();
  appointment = findAppointmentById(
    request?.appointmentId || request?.appointment_id,
  );
  if (!appointment) {
    showToast("The appointment could not be refreshed.");
    return;
  }
  await loadDoctorScheduleForSelectedDate(newDate, getDentistId(appointment));
  if (
    hasScheduleConflict(
      newDate,
      getDentistId(appointment),
      staffRequestTime,
      duration,
      getAppointmentId(appointment),
    )
  ) {
    showToast("The selected time is already occupied.");
    return;
  }
  const requests = loadRescheduleRequests();
  const index = requests.findIndex(
    (item) =>
      String(item?.id || item?.request_id) === String(staffRequestTargetId),
  );
  if (index === -1) {
    showToast("The reschedule request could not be found.");
    return;
  }
  const updatedAt = new Date().toISOString();
  const nextApprovedCount =
    getApprovedRescheduleCountForAppointment(appointment.id) + 1;
  appointment.id = appointment.id;
  appointment.appointment_id = appointment.id;
  appointment.appointmentId = appointment.id;
  appointment.date = newDate;
  appointment.appointment_date = newDate;
  appointment.appointmentDate = newDate;
  appointment.start = staffRequestTime;
  appointment.time = staffRequestTime;
  appointment.appointment_time = staffRequestTime;
  appointment.appointmentTime = staffRequestTime;
  appointment.status = "scheduled";
  appointment.approvedRescheduleCount = nextApprovedCount;
  appointment.rescheduleCount = nextApprovedCount;
  appointment.reschedule_count = nextApprovedCount;
  appointment.rescheduleRequest = null;
  requests[index] = {
    ...requests[index],
    id:
      requests[index].id || requests[index].request_id || staffRequestTargetId,
    request_id:
      requests[index].request_id ||
      requests[index].id ||
      String(staffRequestTargetId),
    appointment_id:
      requests[index].appointment_id || requests[index].appointmentId,
    appointmentId:
      requests[index].appointmentId ||
      requests[index].appointment_id ||
      appointment.id,
    patient_id:
      requests[index].patient_id ||
      requests[index].patientId ||
      getCurrentPatientId(),
    patientId:
      requests[index].patientId ||
      requests[index].patient_id ||
      getCurrentPatientId(),
    preferred_date: newDate,
    preferred_time: staffRequestTime,
    preferredDate: newDate,
    preferredTime: staffRequestTime,
    approved_date: newDate,
    approved_time: staffRequestTime,
    approvedDate: newDate,
    approvedTime: staffRequestTime,
    initiatedBy: requests[index].initiatedBy || "staff",
    initiated_by:
      requests[index].initiated_by || requests[index].initiatedBy || "staff",
    patientResponseAt: updatedAt,
    patient_response_at: updatedAt,
    patientAcknowledged: true,
    patientAcknowledgedAt: updatedAt,
    approved_at: updatedAt,
    updatedAt,
    updated_at: updatedAt,
    status: "Approved",
    approved_reschedule_count: nextApprovedCount,
  };
  await saveRescheduleRequests(requests);
  let savedAppointments;
  try {
    savedAppointments =
      await window.DentaNuevaAppointmentDatabase.reschedule(appointment);
  } catch (error) {
    console.error("Unable to update staff reschedule:", error);
    showToast("Unable to update the appointment. Please try again.");
    return;
  }
  if (Array.isArray(savedAppointments)) {
    appointments = savedAppointments;
  }
  syncAppointmentToPatient(appointment);
  closeStaffRescheduleModal();
  renderAll();
  renderRescheduleAlert();
  showToast("New schedule confirmed and the appointment has been updated.");
  setTimeout(() => {
    openAppointmentDetail(String(appointment.id));
  }, 50);
}
function loadRescheduleRequests() {
  return Array.isArray(rescheduleRequests) ? rescheduleRequests : [];
}
async function saveRescheduleRequests(requests) {
  try {
    if (!window.DentaNuevaAppointmentDatabase) {
      throw new Error("Appointment database module is unavailable.");
    }
    const savedRequests =
      await window.DentaNuevaAppointmentDatabase.saveRescheduleRequests(
        Array.isArray(requests) ? requests : [],
      );
    rescheduleRequests = Array.isArray(savedRequests)
      ? savedRequests
      : Array.isArray(requests)
        ? requests
        : [];
    return true;
  } catch (error) {
    console.error("Unable to save reschedule requests:", error);
    return false;
  }
}
async function hydrateRescheduleRequestsFromDatabase() {
  try {
    if (!window.DentaNuevaAppointmentDatabase) {
      throw new Error("Appointment database module is unavailable.");
    }
    const requests =
      await window.DentaNuevaAppointmentDatabase.loadRescheduleRequests();
    rescheduleRequests = Array.isArray(requests) ? requests : [];
    renderAll();
  } catch (error) {
    console.error("Unable to load reschedule requests from database.", error);
    rescheduleRequests = [];
  }
}
function renderRescheduleAlert() {
  const alert = document.getElementById("rescheduleAlert");
  const requests = loadRescheduleRequests();
  const patientId = String(getCurrentPatientId()).trim().toLowerCase();
  if (!alert || !patientId) {
    if (alert) {
      alert.hidden = true;
      alert.classList.remove("show");
    }
    return;
  }
  const patientRequests = requests.filter((request) => {
    const requestPatientId = String(
      request?.patient_id || request?.patientId || "",
    )
      .trim()
      .toLowerCase();
    const requestAppointmentId =
      request?.appointment_id || request?.appointmentId || "";
    const appointmentExists = appointments.some(
      (appointment) =>
        String(getAppointmentId(appointment)) === String(requestAppointmentId),
    );
    return requestPatientId === patientId && appointmentExists;
  });
  const visibleRequests = patientRequests.filter((request) => {
    const status = normalizeStatus(request?.status || "");
    if (
      status === "approved" &&
      (request?.patientAcknowledged === true ||
        Number(request?.patient_acknowledged) === 1)
    )
      return false;
    return status === "pending" || status === "approved";
  });
  if (!visibleRequests.length) {
    alert.hidden = true;
    alert.classList.remove("show");
    return;
  }
  const latest = [...visibleRequests].sort(
    (a, b) =>
      new Date(
        a?.updated_at || a?.updatedAt || a?.created_at || a?.createdAt || 0,
      ).getTime() -
      new Date(
        b?.updated_at || b?.updatedAt || b?.created_at || b?.createdAt || 0,
      ).getTime(),
  )[visibleRequests.length - 1];
  const badge = document.getElementById("rescheduleReasonBadge");
  const message = document.getElementById("rescheduleMessage");
  const details = document.getElementById("rescheduleAlertDetails");
  const button = document.getElementById("rescheduleAlertButton");
  const status = normalizeStatus(latest?.status || "");
  const preferredDate = latest?.preferred_date || latest?.preferredDate || "";
  const preferredTime = latest?.preferred_time || latest?.preferredTime || "";
  const staffInitiated =
    latest?.initiatedBy === "staff" ||
    latest?.initiated_by === "staff" ||
    (!preferredDate && !preferredTime);
  if (badge) {
    badge.textContent =
      status === "pending"
        ? "Pending"
        : status === "approved"
          ? "Approved"
          : "Rejected";
  }
  if (message) {
    if (
      status === "pending" &&
      staffInitiated &&
      !preferredDate &&
      !preferredTime
    ) {
      message.textContent =
        "The clinic requested a schedule change. Please select a new preferred date and time.";
    } else if (status === "pending") {
      message.textContent = "Your preferred schedule is awaiting staff review.";
    } else if (status === "approved") {
      const date = latest?.approved_date || latest?.approvedDate || "";
      const time = latest?.approved_time || latest?.approvedTime || "";
      const appointment = appointments.find(
        (item) =>
          String(getAppointmentId(item)) ===
          String(latest?.appointment_id || latest?.appointmentId || ""),
      );
      const dentist = appointment
        ? getDentistName(appointment)
        : "your dentist";
      message.textContent =
        date && time
          ? `Your reschedule request was approved for ${formatDate(date)} at ${formatTime(time)} with ${dentist}.`
          : "Your reschedule request was approved.";
    } else {
      message.textContent = "Your reschedule request was rejected.";
    }
  }
  if (details) {
    details.textContent =
      status === "pending" && staffInitiated && !preferredDate && !preferredTime
        ? "Please choose a new preferred appointment schedule."
        : preferredDate && preferredTime
          ? `Requested schedule: ${formatDate(preferredDate)} · ${formatTime(preferredTime)}`
          : "";
  }
  if (button) {
    button.textContent =
      status === "pending" && staffInitiated && !preferredDate && !preferredTime
        ? "Choose New Schedule"
        : "View Request";
    button.style.display = "inline-flex";
  }
  alert.hidden = false;
  alert.classList.add("show");
}
function handleRescheduleAlert() {
  const requests = loadRescheduleRequests();
  const patientId = String(getCurrentPatientId()).trim().toLowerCase();
  const patientRequests = requests.filter((request) => {
    const requestPatientId = String(
      request?.patient_id || request?.patientId || "",
    )
      .trim()
      .toLowerCase();
    const requestAppointmentId =
      request?.appointment_id || request?.appointmentId || "";
    const appointmentExists = appointments.some(
      (appointment) =>
        String(getAppointmentId(appointment)) === String(requestAppointmentId),
    );
    return requestPatientId === patientId && appointmentExists;
  });
  const validRequests = patientRequests.filter((request) => {
    const status = normalizeStatus(request?.status || "");
    if (
      status === "approved" &&
      (request?.patientAcknowledged === true ||
        Number(request?.patient_acknowledged) === 1)
    )
      return false;
    return (
      status === "pending" || status === "approved" || status === "rejected"
    );
  });
  if (!validRequests.length) {
    showToast("No reschedule request details are available.");
    return;
  }
  const latest = [...validRequests].sort(
    (a, b) =>
      new Date(
        a?.updated_at || a?.updatedAt || a?.created_at || a?.createdAt || 0,
      ).getTime() -
      new Date(
        b?.updated_at || b?.updatedAt || b?.created_at || b?.createdAt || 0,
      ).getTime(),
  )[validRequests.length - 1];
  const preferredDate = latest?.preferred_date || latest?.preferredDate || "";
  const preferredTime = latest?.preferred_time || latest?.preferredTime || "";
  const staffInitiated =
    latest?.initiatedBy === "staff" ||
    latest?.initiated_by === "staff" ||
    (!preferredDate && !preferredTime);
  if (
    normalizeStatus(latest?.status || "") === "pending" &&
    staffInitiated &&
    !preferredDate &&
    !preferredTime
  ) {
    openStaffRescheduleModal(latest);
    return;
  }
  const modal = document.getElementById("rescheduleDetailsModal");
  const statusElement = document.getElementById("rescheduleDetailsStatus");
  const content = document.getElementById("rescheduleDetailsContent");
  if (!modal || !statusElement || !content) return;
  const status = normalizeStatus(latest?.status || "");
  const statusLabel =
    status === "pending"
      ? "Pending"
      : status === "approved"
        ? "Approved"
        : "Rejected";
  const appointment = findAppointmentById(
    latest?.appointment_id || latest?.appointmentId,
  );
  const service = appointment
    ? getAppointmentService(appointment)
    : latest?.service || "Dental Appointment";
  const dentist = appointment
    ? getDentistName(appointment)
    : latest?.currentDentistName || "Assigned Dentist";
  const currentDate = appointment
    ? getAppointmentDate(appointment)
    : latest?.currentDate || "";
  const currentTime = appointment
    ? getAppointmentTime(appointment)
    : latest?.currentTime || "";
  const approvedDate = latest?.approved_date || latest?.approvedDate || "";
  const approvedTime = latest?.approved_time || latest?.approvedTime || "";
  statusElement.className = `reschedule-details-status ${status}`;
  statusElement.textContent = statusLabel;
  content.innerHTML = `
        <div class="reschedule-detail-item">
          <span>Reason</span>
          <strong>${escapeHtml(latest?.reasonLabel || latest?.reason || "Reschedule Request")}</strong>
        </div>
        <div class="reschedule-detail-item">
          <span>Service</span>
          <strong>${escapeHtml(service)}</strong>
        </div>
        <div class="reschedule-detail-item full">
          <span>Current Appointment</span>
          <strong>${escapeHtml(formatDate(currentDate))} · ${escapeHtml(formatTime(currentTime))} · ${escapeHtml(dentist)}</strong>
        </div>
        <div class="reschedule-detail-item full">
          <span>Requested New Schedule</span>
          <strong>${preferredDate && preferredTime ? `${escapeHtml(formatDate(preferredDate))} · ${escapeHtml(formatTime(preferredTime))}` : "No preferred schedule provided"}</strong>
        </div>
        ${
          status === "approved" && approvedDate && approvedTime
            ? `
        <div class="reschedule-detail-item full">
          <span>Approved Schedule</span>
          <strong>${escapeHtml(formatDate(approvedDate))} · ${escapeHtml(formatTime(approvedTime))}</strong>
        </div>
        `
            : ""
        }
        <div class="reschedule-detail-item full">
          <span>Message to Clinic</span>
          <p>${escapeHtml(latest?.message || "No message provided.")}</p>
        </div>
      `;
  rescheduleDetailsRequestId = latest?.id || latest?.request_id || null;
  const confirmButton = document.getElementById("confirmRescheduleDetails");
  if (confirmButton) {
    confirmButton.hidden = status !== "approved";
    confirmButton.style.display =
      status === "approved" ? "inline-flex" : "none";
  }
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
async function confirmRescheduleDetails() {
  if (!rescheduleDetailsRequestId) return;
  const requests = loadRescheduleRequests();
  const index = requests.findIndex(
    (request) =>
      String(request?.id || request?.request_id) ===
      String(rescheduleDetailsRequestId),
  );
  if (index === -1) {
    closeRescheduleDetailsModal();
    renderRescheduleAlert();
    return;
  }
  const request = requests[index];
  if (normalizeStatus(request?.status || "") !== "approved") {
    closeRescheduleDetailsModal();
    renderRescheduleAlert();
    return;
  }
  requests[index] = {
    ...request,
    patientAcknowledged: true,
    patientAcknowledgedAt: new Date().toISOString(),
    patient_acknowledged: 1,
    patient_acknowledged_at: new Date().toISOString(),
    status: "Approved",
  };
  const saved = await saveRescheduleRequests(requests);
  if (!saved) {
    showToast("Unable to dismiss the notification. Please try again.");
    return;
  }
  rescheduleDetailsRequestId = null;
  closeRescheduleDetailsModal();
  renderAll();
  renderRescheduleAlert();
  showToast("Reschedule notification marked as read.");
}
function closeRescheduleDetailsModal() {
  const modal = document.getElementById("rescheduleDetailsModal");
  if (!modal) return;
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  rescheduleDetailsRequestId = null;
  const confirmButton = document.getElementById("confirmRescheduleDetails");
  if (confirmButton) {
    confirmButton.hidden = true;
    confirmButton.style.display = "none";
  }
  document.body.style.overflow = "";
}
function findAppointmentById(id) {
  if (!id) return null;
  const targetId = String(id);
  return (
    appointments.find((appointment) =>
      [
        appointment?.id,
        appointment?.appointmentId,
        appointment?.appointment_id,
        appointment?.appointment_uid,
        appointment?.databaseAppointmentId,
      ]
        .filter((value) => value !== undefined && value !== null)
        .some((value) => String(value) === targetId),
    ) || null
  );
}
function getApprovedRescheduleCountForAppointment(appointmentId) {
  if (!appointmentId) return 0;
  return loadRescheduleRequests().filter((request) => {
    const requestAppointmentId =
      request?.appointment_id || request?.appointmentId || "";
    const status = String(request?.status || "")
      .trim()
      .toLowerCase();
    return (
      String(requestAppointmentId) === String(appointmentId) &&
      status === "approved"
    );
  }).length;
}
function getAppointmentRescheduleCount(appointment) {
  if (!appointment) return 0;
  const explicitCount = Number(
    appointment?.approvedRescheduleCount ??
      appointment?.rescheduleCount ??
      appointment?.reschedule_count ??
      0,
  );
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return explicitCount;
  }
  return getApprovedRescheduleCountForAppointment(
    getAppointmentId(appointment),
  );
}
function hasReachedAppointmentRescheduleLimit(appointment) {
  return getAppointmentRescheduleCount(appointment) >= 2;
}
function getAppointmentId(appointment) {
  return (
    appointment?.id ||
    appointment?.appointmentId ||
    appointment?.appointment_uid ||
    appointment?.appointment_id ||
    ""
  );
}
function isActiveAppointment(appointment) {
  const status = normalizeStatus(getAppointmentStatus(appointment));
  return (
    status !== "completed" &&
    status !== "cancelled" &&
    status !== "canceled" &&
    status !== "noshow"
  );
}
function getStatusClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return "status-completed";
  if (normalized === "cancelled" || normalized === "canceled")
    return "status-cancelled";
  if (normalized === "noshow") return "status-no-show";
  if (normalized === "inconsultation" || normalized === "readycomplete")
    return "status-consultation";
  return "status-scheduled";
}
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}
