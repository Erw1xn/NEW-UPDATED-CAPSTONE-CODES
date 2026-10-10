const START_HOUR = 10;
const END_HOUR = 20;
const SLOT_MIN = 30;
const UNAVAILABILITY_API = "../../api/doctor_unavailability.php";
const APPOINTMENT_STATUS = {
  SCHEDULED: "scheduled",
  IN_CONSULTATION: "in_consultation",
  COMPLETED: "completed",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
};
let appointments = [];
let rescheduleRequests = [];
let doctorUnavailability = [];
let currentCalendarDate = new Date();
let selectedDate = new Date();
let selectedAppointmentId = null;
let selectedUnavailabilityId = null;
let statusActionTargetId = null;
let statusActionType = null;
let toastTimer = null;
let currentDoctorDentistId = null;
let currentDoctor = null;
let doctorRegistry = [];
let currentUserFromDatabase = null;
document.addEventListener("DOMContentLoaded", async () => {
  await initializeCurrentDoctor();
  initializeDate();
  await hydrateAppointmentsFromDatabase();
  await hydrateRescheduleRequestsFromDatabase();
  await hydrateUnavailabilityFromDatabase();
  setupEvents();
  renderAll();
  setInterval(() => {
    const changed = updateAutomaticAppointmentStatuses();
    if (changed) {
      renderAll();
    } else {
      renderCalendar();
      renderTimeline();
      renderWaitingQueue();
    }
  }, 1000);
});
async function hydrateCurrentUser() {
  try {
    const response = await fetch("../profile/profile.php", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.user) {
      throw new Error(result.message || "Doctor profile unavailable.");
    }
    currentUserFromDatabase = result.user;
  } catch (error) {
    console.error("Unable to load the authenticated doctor:", error);
    currentUserFromDatabase = null;
  }
}
function getCurrentUser() {
  return currentUserFromDatabase;
}
function getStoredDoctors() {
  return doctorRegistry;
}
function getDoctorIdFromUser(user) {
  if (!user || typeof user !== "object") {
    return "";
  }
  return String(
    user.dentistId ||
      user.dentist_id ||
      user.dentistID ||
      user.doctorId ||
      user.doctor_id ||
      user.doctorID ||
      "",
  )
    .trim()
    .toLowerCase();
}
function getDoctorNameFromUser(user) {
  if (!user || typeof user !== "object") {
    return "";
  }
  const firstName = user.firstname || user.firstName || "";
  const lastName = user.lastname || user.lastName || "";
  return String(
    user.name ||
      user.fullName ||
      user.full_name ||
      user.fullname ||
      `${firstName} ${lastName}`.trim() ||
      "",
  ).trim();
}
function normalizeDoctorName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^doctor\s+/i, "")
    .replace(/^dr\.\s*/i, "")
    .replace(/^dr\s+/i, "")
    .replace(/[.\_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function findDoctorAccount(currentUser, doctors = getStoredDoctors()) {
  if (!currentUser) {
    return null;
  }
  const currentDoctorId = getDoctorIdFromUser(currentUser);
  if (currentDoctorId) {
    const byDoctorId = doctors.find((doctor) => {
      return getDoctorIdFromUser(doctor) === currentDoctorId;
    });
    if (byDoctorId) {
      return byDoctorId;
    }
  }
  const currentUserId = String(
    currentUser.id || currentUser.userId || currentUser.user_id || "",
  )
    .trim()
    .toLowerCase();
  if (currentUserId) {
    const byUserId = doctors.find((doctor) => {
      const doctorUserId = String(
        doctor.id || doctor.userId || doctor.user_id || "",
      )
        .trim()
        .toLowerCase();
      return doctorUserId === currentUserId;
    });
    if (byUserId) {
      return byUserId;
    }
  }
  const currentEmail = String(currentUser.email || "")
    .trim()
    .toLowerCase();
  if (currentEmail) {
    const byEmail = doctors.find((doctor) => {
      const doctorEmail = String(doctor.email || "")
        .trim()
        .toLowerCase();
      return doctorEmail === currentEmail;
    });
    if (byEmail) {
      return byEmail;
    }
  }
  const currentName = normalizeDoctorName(getDoctorNameFromUser(currentUser));
  if (currentName) {
    const byName = doctors.find((doctor) => {
      return normalizeDoctorName(getDoctorNameFromUser(doctor)) === currentName;
    });
    if (byName) {
      return byName;
    }
  }
  return null;
}
function registerCurrentDoctor() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return;
  }
  const doctorId = getDoctorIdFromUser(currentUser);
  if (!doctorId) {
    return;
  }
  const doctorName = getDoctorNameFromUser(currentUser);
  if (!doctorName) {
    return;
  }
  const specialization = String(
    currentUser.specialization ||
      currentUser.specialty ||
      currentUser.speciality ||
      currentUser.department ||
      "Dental Care",
  ).trim();
  const doctors = getStoredDoctors();
  const doctorRecord = {
    ...currentUser,
    doctorId:
      currentUser.doctorId ||
      currentUser.doctor_id ||
      currentUser.doctorID ||
      doctorId,
    dentistId:
      currentUser.dentistId ||
      currentUser.dentist_id ||
      currentUser.dentistID ||
      doctorId,
    name: doctorName,
    fullName: currentUser.fullName || currentUser.full_name || doctorName,
    specialization,
    role: "doctor",
  };
  const existingIndex = doctors.findIndex((doctor) => {
    return getDoctorIdFromUser(doctor) === doctorId;
  });
  if (existingIndex === -1) {
    doctors.push(doctorRecord);
  } else {
    doctors[existingIndex] = {
      ...doctors[existingIndex],
      ...doctorRecord,
    };
  }
  doctorRegistry = doctors;
}
function getCurrentDoctorDentistId() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return null;
  }
  const currentUserDoctorId = getDoctorIdFromUser(currentUser);
  if (currentUserDoctorId) {
    return currentUserDoctorId;
  }
  const doctorAccount = findDoctorAccount(currentUser);
  if (doctorAccount) {
    const doctorId = getDoctorIdFromUser(doctorAccount);
    if (doctorId) {
      return doctorId;
    }
  }
  return null;
}
async function refreshDoctorRegistryFromDatabase() {
  try {
    const response = await fetch("../../api/doctors.php", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Doctors unavailable.");
    }
    doctorRegistry = result.data;
    return result.data;
  } catch (error) {
    console.warn("Unable to reload doctor registry from database.", error);
    return doctorRegistry;
  }
}
async function initializeCurrentDoctor() {
  await hydrateCurrentUser();
  const currentUser = getCurrentUser();
  const doctors = await refreshDoctorRegistryFromDatabase();
  registerCurrentDoctor();
  const doctorAccount = findDoctorAccount(currentUser, doctors);
  currentDoctor = doctorAccount || currentUser;
  currentDoctorDentistId = getCurrentDoctorDentistId();
}
function getDoctorIdentityValues(doctor) {
  if (!doctor || typeof doctor !== "object") {
    return [];
  }
  const values = [
    doctor.doctorId,
    doctor.doctor_id,
    doctor.doctorID,
    doctor.dentistId,
    doctor.dentist_id,
    doctor.dentistID,
    doctor.id,
    doctor.userId,
    doctor.user_id,
    doctor.username,
    doctor.email,
    doctor.name,
    doctor.fullName,
    doctor.full_name,
    doctor.fullname,
    getDoctorNameFromUser(doctor),
  ];
  return values
    .filter(
      (value) => value !== null && value !== undefined && String(value).trim(),
    )
    .map((value) => String(value).trim().toLowerCase());
}
function resolveAppointmentDoctorId(value, appointment = null) {
  const doctors = getStoredDoctors();
  const original = String(value || "").trim();
  const normalizedOriginal = original.toLowerCase();
  if (!original && appointment) {
    const appointmentDoctorId = String(
      appointment.doctorId ||
        appointment.doctor_id ||
        appointment.doctorID ||
        appointment.dentistId ||
        appointment.dentist_id ||
        appointment.dentistID ||
        "",
    ).trim();
    if (appointmentDoctorId) {
      return appointmentDoctorId.toLowerCase();
    }
  }
  if (!original && !appointment) {
    return "";
  }
  const directDoctor = doctors.find((doctor) => {
    const identities = getDoctorIdentityValues(doctor);
    return identities.includes(normalizedOriginal);
  });
  if (directDoctor) {
    return getDoctorIdFromUser(directDoctor);
  }
  const normalizedName = normalizeDoctorName(original);
  if (normalizedName) {
    const doctorByName = doctors.find((doctor) => {
      return (
        normalizeDoctorName(getDoctorNameFromUser(doctor)) === normalizedName
      );
    });
    if (doctorByName) {
      return getDoctorIdFromUser(doctorByName);
    }
  }
  return normalizedOriginal;
}
function getDoctorDisplayName(doctorId) {
  const doctors = getStoredDoctors();
  const normalizedId = String(doctorId || "")
    .trim()
    .toLowerCase();
  if (!normalizedId) {
    return "Unassigned";
  }
  const doctor = doctors.find((item) => {
    return getDoctorIdFromUser(item) === normalizedId;
  });
  if (doctor) {
    const name = getDoctorNameFromUser(doctor);
    if (name) {
      return /^dr\./i.test(name) ? name : `Dr. ${name}`;
    }
  }
  return "Unassigned";
}
function initializeDate() {
  const today = new Date();
  selectedDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  currentCalendarDate = new Date(selectedDate);
}
function setupEvents() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderTimeline();
      renderWaitingQueue();
    });
  }
}
function loadAppointments() {
  return appointments;
}
async function hydrateAppointmentsFromDatabase() {
  if (!window.DentaNuevaAppointmentDatabase) {
    console.error("Appointment database API is unavailable.");
    return;
  }
  try {
    const remoteAppointments = await window.DentaNuevaAppointmentDatabase.load({
      scope: "doctor_appointments",
    });
    appointments = Array.isArray(remoteAppointments)
      ? remoteAppointments.map(normalizeAppointment)
      : [];
    renderCalendar();
    renderTimeline();
    renderWaitingQueue();
  } catch (error) {
    console.error("Unable to load doctor appointments from database:", error);
    appointments = [];
  }
}
async function saveAppointmentsToDatabase() {
  if (!window.DentaNuevaAppointmentDatabase?.save) {
    console.error("Appointment database API is unavailable.");
    return false;
  }
  try {
    await window.DentaNuevaAppointmentDatabase.save(appointments);
    return true;
  } catch (error) {
    console.error("Unable to sync appointments to database:", error);
    return false;
  }
}
function normalizeUnavailabilityBlock(block) {
  const endKey =
    ["end", "end_time", "endTime"].find((key) => block[key]) ||
    Object.keys(block).find((key) => /end/i.test(key) && block[key]);
  const start = String(
    block.start || block.start_time || block.startTime || "",
  );
  const end = endKey ? String(block[endKey]) : "";
  const flag = block.allDay ?? block.all_day ?? block.is_all_day;
  const flagged =
    flag === true || flag === 1 || flag === "1" || flag === "true";
  const coversDay =
    !!start &&
    !!end &&
    timeToMinutes(start) <= START_HOUR * 60 &&
    timeToMinutes(end) >= 18 * 60;
  return {
    ...block,
    id: block.id ?? block.unavailability_id ?? block.unavailability_uid,
    date: String(block.date || block.unavailable_date || "").slice(0, 10),
    start,
    end,
    allDay: flagged || coversDay,
    reason: block.reason ?? "",
  };
}
async function hydrateUnavailabilityFromDatabase() {
  try {
    const response = await fetch(UNAVAILABILITY_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Unavailability unavailable.");
    }
    doctorUnavailability = result.data.map(normalizeUnavailabilityBlock);
  } catch (error) {
    console.error("Unable to load unavailability from database:", error);
    doctorUnavailability = [];
  }
}
function getUnavailabilityForDate(dateKey) {
  return doctorUnavailability
    .filter((block) => block.date === dateKey)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}
function isAllDayBlock(block) {
  return block.allDay === true;
}
function getBlockEnd(block) {
  return block.end || "";
}
function formatUnavailabilityRange(block) {
  if (isAllDayBlock(block)) {
    return "All Day";
  }
  if (!getBlockEnd(block)) {
    return `From ${fmtTime(block.start)}`;
  }
  return `${fmtTime(block.start)} – ${fmtTime(getBlockEnd(block))}`;
}
function findUnavailabilityForAppointment(appt) {
  const apptStart = timeToMinutes(appt.start);
  const apptEnd = getAppointmentEnd(appt);
  return (
    doctorUnavailability.find((block) => {
      if (block.date !== appt.date) {
        return false;
      }
      if (isAllDayBlock(block)) {
        return true;
      }
      return (
        timeToMinutes(block.start) < apptEnd &&
        timeToMinutes(getBlockEnd(block)) > apptStart
      );
    }) || null
  );
}
function normalizeAppointment(appt) {
  const appointmentDoctorId = resolveAppointmentDoctorId(
    appt.dentist ||
      appt.dentistId ||
      appt.dentist_id ||
      appt.dentistID ||
      appt.doctorId ||
      appt.doctor_id ||
      appt.doctorID ||
      appt.doctor ||
      appt.doctorName ||
      "",
    appt,
  );
  const normalized = {
    ...appt,
    id:
      appt.id || `appt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    patient: appt.patient || appt.patientName || "Unknown Patient",
    patientId: appt.patientId || appt.patient_id || "",
    date: appt.date || appt.appointment_date || appt.appointmentDate || "",
    start:
      appt.start ||
      appt.time ||
      appt.appointment_time ||
      appt.appointmentTime ||
      "10:00",
    type:
      appt.type ||
      appt.service ||
      appt.service_type ||
      appt.serviceType ||
      "Consultation",
    dentist: appointmentDoctorId,
    dentistId: appointmentDoctorId,
    dentist_id: appointmentDoctorId,
    duration:
      Number(appt.duration) || getDefaultDuration(appt.type || appt.service),
    status: appt.status || APPOINTMENT_STATUS.SCHEDULED,
    rescheduleCount: Number(appt.rescheduleCount || appt.reschedule_count) || 0,
    approvedRescheduleCount:
      Number(appt.approvedRescheduleCount || appt.approved_reschedule_count) ||
      0,
    rescheduleHistory: Array.isArray(appt.rescheduleHistory)
      ? appt.rescheduleHistory
      : Array.isArray(appt.reschedule_history)
        ? appt.reschedule_history
        : [],
  };
  if (!Number.isFinite(normalized.duration) || normalized.duration <= 0) {
    normalized.duration = 30;
  }
  const validStatuses = Object.values(APPOINTMENT_STATUS);
  if (!validStatuses.includes(normalized.status)) {
    normalized.status = APPOINTMENT_STATUS.SCHEDULED;
  }
  return normalized;
}
function getDefaultDuration(service) {
  const durations = {
    Consultation: 30,
    "Dental Cleaning": 45,
    "Tooth Filling / Pasta": 45,
    "Tooth Extraction": 60,
    "Root Canal": 90,
    "Braces Adjustment": 30,
  };
  return durations[service] || 30;
}
function dateToKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function keyToDate(key) {
  const parts = key.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
function isToday(dateOrKey) {
  const today = new Date();
  const todayKey = dateToKey(today);
  const key = typeof dateOrKey === "string" ? dateOrKey : dateToKey(dateOrKey);
  return key === todayKey;
}
function isPastDate(dateOrKey) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date =
    typeof dateOrKey === "string" ? keyToDate(dateOrKey) : new Date(dateOrKey);
  date.setHours(0, 0, 0, 0);
  return date < today;
}
function isClinicClosedDate(dateOrKey) {
  const date =
    typeof dateOrKey === "string" ? keyToDate(dateOrKey) : new Date(dateOrKey);
  return date.getDay() === 0;
}
function timeToMinutes(time) {
  if (!time) {
    return 0;
  }
  const parts = time.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  return hours * 60 + minutes;
}
function minutesToTime(totalMinutes) {
  totalMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return (
    String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0")
  );
}
function fmtTime(time) {
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
function formatDateLong(dateKey) {
  const date = keyToDate(dateKey);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function getAppointmentEnd(appt) {
  const start = timeToMinutes(appt.start);
  const duration = Number(appt.duration) || 30;
  return start + duration;
}
function getAppointmentEndTime(appt) {
  return minutesToTime(getAppointmentEnd(appt));
}
function isNoShowEligible(appt) {
  if (appt.status !== APPOINTMENT_STATUS.SCHEDULED || !isToday(appt.date)) {
    return false;
  }
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= timeToMinutes(appt.start) + 15;
}
function updateAutomaticAppointmentStatuses() {
  const now = new Date();
  const todayKey = dateToKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let changed = false;
  appointments.forEach((appt) => {
    if (appt.date !== todayKey) {
      return;
    }
    const appointmentStart = timeToMinutes(appt.start);
    const appointmentEnd = getAppointmentEnd(appt);
    if (
      appt.status === APPOINTMENT_STATUS.SCHEDULED &&
      currentMinutes >= appointmentStart + 15
    ) {
      appt.status = APPOINTMENT_STATUS.NO_SHOW;
      appt.noShowAt = new Date().toISOString();
      changed = true;
      return;
    }
    if (
      appt.status === APPOINTMENT_STATUS.IN_CONSULTATION &&
      currentMinutes >= appointmentEnd
    ) {
      appt.status = APPOINTMENT_STATUS.COMPLETED;
      appt.checkedIn = true;
      appt.consultationStarted = false;
      appt.manualReadyComplete = false;
      appt.completedAt = new Date().toISOString();
      changed = true;
    }
  });
  if (changed) {
    saveAppointmentsToDatabase();
  }
  return changed;
}
function getStatusLabel(status) {
  switch (status) {
    case APPOINTMENT_STATUS.SCHEDULED:
      return "Scheduled";
    case APPOINTMENT_STATUS.CANCELLED:
      return "Cancelled";
    case APPOINTMENT_STATUS.IN_CONSULTATION:
      return "In Consultation";
    case APPOINTMENT_STATUS.COMPLETED:
      return "Completed";
    case APPOINTMENT_STATUS.NO_SHOW:
      return "No Show";
    default:
      return "Scheduled";
  }
}
function appointmentBelongsToCurrentDoctor(appt) {
  const currentUser = getCurrentUser();
  if (!currentUser || !appt) {
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
    appt.doctor_id,
    appt.doctorId,
    appt.dentist_id,
    appt.dentistId,
    appt.dentist,
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
function filteredAppts() {
  if (!getCurrentUser()) {
    return [];
  }
  const selectedDateKey = dateToKey(selectedDate);
  const searchInput = document.getElementById("searchInput");
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
  let filtered = appointments.filter((appt) => {
    if (!appointmentBelongsToCurrentDoctor(appt)) {
      return false;
    }
    if (appt.status !== APPOINTMENT_STATUS.CANCELLED) {
      return true;
    }
    return !appointments.some((replacement) => {
      if (replacement.id === appt.id) {
        return false;
      }
      if (replacement.date !== appt.date) {
        return false;
      }
      if (replacement.status === APPOINTMENT_STATUS.CANCELLED) {
        return false;
      }
      if (!appointmentBelongsToCurrentDoctor(replacement)) {
        return false;
      }
      const cancelledStart = timeToMinutes(appt.start);
      const replacementStart = timeToMinutes(replacement.start);
      const cancelledEnd = cancelledStart + Number(appt.duration || 30);
      const replacementEnd =
        replacementStart + Number(replacement.duration || 30);
      return replacementStart < cancelledEnd && replacementEnd > cancelledStart;
    });
  });
  filtered = filtered.filter((appt) => {
    return appt.date === selectedDateKey;
  });
  if (searchTerm) {
    filtered = filtered.filter((appt) => {
      const patientName = String(appt.patient || "")
        .trim()
        .toLowerCase();
      const serviceType = String(appt.type || "")
        .trim()
        .toLowerCase();
      return (
        patientName.includes(searchTerm) || serviceType.includes(searchTerm)
      );
    });
  }
  filtered.sort((a, b) => {
    return timeToMinutes(a.start) - timeToMinutes(b.start);
  });
  return filtered;
}
function renderAll() {
  updateAutomaticAppointmentStatuses();
  renderCalendar();
  renderTimeline();
  renderWaitingQueue();
}
function renderCalendar() {
  const grid = document.getElementById("calGrid");
  const label = document.getElementById("calMonthLabel");
  if (!grid || !label) {
    return;
  }
  grid.innerHTML = "";
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  label.textContent = currentCalendarDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  weekdays.forEach((day) => {
    const element = document.createElement("div");
    element.className = "dow";
    element.textContent = day;
    grid.appendChild(element);
  });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    const date = new Date(year, month, -i);
    grid.appendChild(makeDayBtn(date, true));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    grid.appendChild(makeDayBtn(date, false));
  }
  const totalCells = firstDay + daysInMonth;
  const remaining = 42 - totalCells;
  for (let day = 1; day <= remaining; day++) {
    const date = new Date(year, month + 1, day);
    grid.appendChild(makeDayBtn(date, true));
  }
}
function makeDayBtn(date, muted) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "day";
  const key = dateToKey(date);
  if (muted) {
    button.classList.add("muted");
  }
  if (dateToKey(selectedDate) === key) {
    button.classList.add("selected");
  }
  if (isToday(date)) {
    button.classList.add("today");
  }
  if (isPastDate(date)) {
    button.classList.add("past-date");
  }
  const doctorDentistId = String(currentDoctorDentistId || "")
    .trim()
    .toLowerCase();
  const hasAppointment = appointments.some((appt) => {
    const appointmentDoctorId = String(
      appt.dentist || appt.dentistId || appt.dentist_id || "",
    )
      .trim()
      .toLowerCase();
    return appt.date === key && appointmentDoctorId === doctorDentistId;
  });
  if (hasAppointment) {
    button.classList.add("has-appt");
  }
  if (doctorUnavailability.some((block) => block.date === key)) {
    button.classList.add("has-unavailable");
  }
  const hasPendingRescheduleRequest = loadRescheduleRequests().some(
    (request) => {
      const requestStatus = String(request?.status || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
      if (requestStatus !== "pending") {
        return false;
      }
      const appointmentId = String(
        request?.appointment_id || request?.appointmentId || "",
      ).trim();
      return appointments.some((appt) => {
        const appointmentDoctorId = String(
          appt.dentist || appt.dentistId || appt.dentist_id || "",
        )
          .trim()
          .toLowerCase();
        return (
          String(appt.id) === appointmentId &&
          appt.date === key &&
          appointmentDoctorId === doctorDentistId
        );
      });
    },
  );
  if (hasPendingRescheduleRequest) {
    button.classList.add("has-reschedule-request");
  }
  button.textContent = date.getDate();
  button.addEventListener("click", () => {
    selectedDate = new Date(date);
    currentCalendarDate = new Date(date.getFullYear(), date.getMonth(), 1);
    renderAll();
  });
  return button;
}
function shiftMonth(offset) {
  currentCalendarDate = new Date(
    currentCalendarDate.getFullYear(),
    currentCalendarDate.getMonth() + offset,
    1,
  );
  selectedDate = new Date(
    currentCalendarDate.getFullYear(),
    currentCalendarDate.getMonth(),
    1,
  );
  renderAll();
}
function renderUnavailableBadges() {
  const area = document.getElementById("scheduleUnavailableArea");
  if (!area) {
    return;
  }
  area.innerHTML = "";
  getUnavailabilityForDate(dateToKey(selectedDate)).forEach((block) => {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "schedule-unavailable-badge";
    badge.innerHTML = `<i class="fa-solid fa-user-slash"></i><span>${
      isAllDayBlock(block)
        ? "Unavailable all day"
        : `Unavailable · ${escapeHtml(formatUnavailabilityRange(block))}`
    }</span>`;
    badge.addEventListener("click", () => {
      openUnavailabilityDetails(block.id);
    });
    area.appendChild(badge);
  });
}
function renderTimeline() {
  const timeline = document.getElementById("timeline");
  const title = document.getElementById("scheduleTitle");
  const dateLabel = document.getElementById("scheduleDateLabel");
  const count = document.getElementById("appointmentCount");
  const headerCount = document.getElementById("headerAppointmentCount");
  if (!timeline) {
    return;
  }
  timeline.innerHTML = "";
  renderUnavailableBadges();
  const selectedKey = dateToKey(selectedDate);
  const selectedIsToday = isToday(selectedKey);
  const selectedIsPast = isPastDate(selectedKey);
  if (title) {
    title.textContent = selectedIsToday
      ? "Today's Appointments"
      : selectedIsPast
        ? "Appointment History"
        : "Upcoming Appointments";
  }
  if (dateLabel) {
    dateLabel.textContent = formatDateLong(selectedKey);
  }
  const dayAppointments = filteredAppts();
  if (count) {
    count.textContent = dayAppointments.length;
  }
  if (headerCount) {
    headerCount.textContent = dayAppointments.length;
  }
  if (!dayAppointments.length) {
    const allDayBlock =
      getUnavailabilityForDate(selectedKey).find(isAllDayBlock);
    const emptyState = document.createElement("div");
    emptyState.className = "schedule-empty-state";
    emptyState.innerHTML = isClinicClosedDate(selectedKey)
      ? `
      <i class="fa-solid fa-door-closed"></i>
      <strong>Clinic is closed</strong>
      <span>The clinic is closed on Sundays. Open Monday to Saturday, 10:00 AM to 6:00 PM.</span>
    `
      : allDayBlock
        ? `
      <i class="fa-solid fa-user-slash"></i>
      <strong>You are unavailable</strong>
      <span>You marked this date as unavailable, so no appointments can be booked.</span>
    `
        : `
      <i class="fa-regular fa-calendar"></i>
      <strong>${selectedIsPast ? "No appointment records" : "No patient appointments"}</strong>
      <span>${selectedIsPast ? "There are no appointment records for this date." : "No appointments scheduled for this date."}</span>
    `;
    timeline.appendChild(emptyState);
    return;
  }
  dayAppointments.forEach((appt) => {
    const row = document.createElement("div");
    row.className = "tl-row";
    const timeElement = document.createElement("div");
    timeElement.className = "tl-time";
    timeElement.textContent = fmtTime(appt.start);
    const slot = document.createElement("div");
    slot.className = "tl-slot";
    slot.appendChild(createAppointmentCard(appt));
    row.appendChild(timeElement);
    row.appendChild(slot);
    timeline.appendChild(row);
  });
}
function openUnavailabilityDetails(id) {
  const block = doctorUnavailability.find(
    (item) => String(item.id) === String(id),
  );
  if (!block) {
    return;
  }
  selectedUnavailabilityId = block.id;
  document.getElementById("ud_subtitle").textContent = formatDateLong(
    block.date,
  );
  document.getElementById("ud_date").value = formatDateLong(block.date);
  document.getElementById("ud_time").value = formatUnavailabilityRange(block);
  document.getElementById("ud_reason").value =
    block.reason || "No reason provided";
  const reopenButton = document.getElementById("ud_reopen");
  reopenButton.textContent = isPastDate(block.date)
    ? "Close"
    : isAllDayBlock(block)
      ? "Open This Day Again"
      : "Open This Time Again";
  document.getElementById("unavailabilityDetailOverlay").classList.add("show");
}
function closeUnavailabilityDetails() {
  selectedUnavailabilityId = null;
  document
    .getElementById("unavailabilityDetailOverlay")
    .classList.remove("show");
}
function reopenUnavailability() {
  if (!selectedUnavailabilityId) {
    return;
  }
  const block = doctorUnavailability.find(
    (item) => String(item.id) === String(selectedUnavailabilityId),
  );
  if (!block || isPastDate(block.date)) {
    closeUnavailabilityDetails();
    return;
  }
  openStatusConfirmation(selectedUnavailabilityId, "removeUnavailability");
}
function openUnavailableModal() {
  const dateInput = document.getElementById("u_date");
  const todayKey = dateToKey(new Date());
  dateInput.min = todayKey;
  dateInput.value = isPastDate(selectedDate)
    ? todayKey
    : dateToKey(selectedDate);
  document.getElementById("u_allday").checked = false;
  document.getElementById("u_start").value = "10:00";
  document.getElementById("u_end").value = "12:00";
  document.getElementById("u_reason").value = "";
  document.getElementById("u_save").disabled = false;
  toggleUnavailableAllDay();
  document.getElementById("unavailableOverlay").classList.add("show");
}
function closeUnavailableModal() {
  document.getElementById("unavailableOverlay").classList.remove("show");
}
function toggleUnavailableAllDay() {
  const allDay = document.getElementById("u_allday").checked;
  document.getElementById("u_time_row").style.display = allDay ? "none" : "";
}
async function saveUnavailability() {
  const date = document.getElementById("u_date").value;
  const allDay = document.getElementById("u_allday").checked;
  const start = document.getElementById("u_start").value;
  const end = document.getElementById("u_end").value;
  const reason = document.getElementById("u_reason").value.trim();
  if (!date) {
    showToast("Please select a date.");
    return;
  }
  if (isPastDate(date)) {
    showToast("Past dates cannot be marked unavailable.");
    return;
  }
  if (isClinicClosedDate(date)) {
    showToast(
      "The clinic is closed on Sundays, so it cannot be marked unavailable.",
    );
    return;
  }
  if (!allDay) {
    if (!start || !end) {
      showToast("Please select the start and end time.");
      return;
    }
    if (timeToMinutes(start) >= timeToMinutes(end)) {
      showToast("End time must be later than start time.");
      return;
    }
    if (
      timeToMinutes(start) < START_HOUR * 60 ||
      timeToMinutes(end) > 18 * 60
    ) {
      showToast("Please choose a time between 10:00 AM and 6:00 PM.");
      return;
    }
    if (isToday(date)) {
      const now = new Date();
      if (timeToMinutes(end) <= now.getHours() * 60 + now.getMinutes()) {
        showToast("The selected time has already passed.");
        return;
      }
    }
  }
  const payload = allDay
    ? {
        date,
        allDay: true,
        all_day: true,
        start: "10:00",
        end: "18:00",
        reason,
      }
    : { date, allDay: false, all_day: false, start, end, reason };
  const saveButton = document.getElementById("u_save");
  saveButton.disabled = true;
  try {
    const response = await fetch(UNAVAILABILITY_API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to save unavailability.");
    }
    await hydrateUnavailabilityFromDatabase();
    closeUnavailableModal();
    selectedDate = keyToDate(date);
    currentCalendarDate = new Date(selectedDate);
    renderAll();
    const conflictCount = Number(result.data?.conflictCount) || 0;
    showToast(
      conflictCount > 0
        ? `Saved. ${conflictCount} existing appointment(s) overlap, staff needs to reschedule them.`
        : "Unavailable time saved.",
    );
  } catch (error) {
    showToast(error.message || "Unable to save unavailability.");
  } finally {
    saveButton.disabled = false;
  }
}
async function markAppointmentUnavailable(id, reason) {
  const appt = appointments.find((item) => String(item.id) === String(id));
  if (!appt) {
    return;
  }
  try {
    const response = await fetch(UNAVAILABILITY_API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: appt.date,
        allDay: false,
        all_day: false,
        start: String(appt.start).slice(0, 5),
        end: getAppointmentEndTime(appt),
        reason,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to save unavailability.");
    }
    await hydrateUnavailabilityFromDatabase();
    closeModal();
    selectedDate = keyToDate(appt.date);
    currentCalendarDate = new Date(selectedDate);
    renderAll();
    const conflictCount = Number(result.data?.conflictCount) || 0;
    showToast(
      conflictCount > 0
        ? `Saved. ${conflictCount} existing appointment(s) overlap, staff needs to reschedule them.`
        : "Unavailable time saved.",
    );
  } catch (error) {
    showToast(error.message || "Unable to save unavailability.");
  }
}
function requestMarkAppointmentUnavailable() {
  const appt = appointments.find(
    (item) => String(item.id) === String(selectedAppointmentId),
  );
  if (!appt) {
    return;
  }
  const existingBlock = findUnavailabilityForAppointment(appt);
  if (existingBlock) {
    openStatusConfirmation(existingBlock.id, "removeUnavailability");
    return;
  }
  openStatusConfirmation(appt.id, "markAppointmentUnavailable");
}
async function removeUnavailability(id) {
  try {
    const response = await fetch(UNAVAILABILITY_API, {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to remove unavailability.");
    }
    await hydrateUnavailabilityFromDatabase();
    renderAll();
    showToast("Schedule is open again.");
  } catch (error) {
    showToast(error.message || "Unable to remove unavailability.");
  }
}
function loadRescheduleRequests() {
  return Array.isArray(rescheduleRequests) ? rescheduleRequests : [];
}
async function hydrateRescheduleRequestsFromDatabase() {
  if (!window.DentaNuevaAppointmentDatabase?.loadRescheduleRequests) {
    console.error("Reschedule request database API is unavailable.");
    rescheduleRequests = [];
    return;
  }
  try {
    const requests =
      await window.DentaNuevaAppointmentDatabase.loadRescheduleRequests();
    rescheduleRequests = Array.isArray(requests) ? requests : [];
  } catch (error) {
    console.error("Unable to load reschedule requests from database:", error);
    rescheduleRequests = [];
  }
}
function getPendingRescheduleRequestForAppointment(appointmentId) {
  return (
    loadRescheduleRequests().find(
      (request) =>
        String(request?.appointment_id || request?.appointmentId || "") ===
          String(appointmentId) &&
        String(request?.status || "")
          .trim()
          .toLowerCase() === "pending",
    ) || null
  );
}
function createAppointmentCard(appt) {
  const card = document.createElement("div");
  card.className = "appt-card";
  const initials = getInitials(appt.patient);
  const endTime = getAppointmentEndTime(appt);
  const pendingRescheduleRequest = getPendingRescheduleRequestForAppointment(
    appt.id,
  );
  const info = document.createElement("div");
  info.style.display = "flex";
  info.style.alignItems = "center";
  info.style.flex = "1";
  info.style.minWidth = "0";
  info.innerHTML = `
    <div class="patient-avatar">${initials}</div>
    <div class="appt-info">
      <div class="pname">${escapeHtml(appt.patient)}</div>
      <div class="ptype">${escapeHtml(appt.type)}</div>
      ${pendingRescheduleRequest ? `<div class="appointment-reschedule-request"><span><i class="fa-solid fa-calendar-days"></i> Reschedule Requested</span></div>` : ""}
    </div>
  `;
  const time = document.createElement("div");
  time.className = "appt-time-range";
  time.textContent = `${fmtTime(appt.start)} – ${fmtTime(endTime)}`;
  const statusArea = createAppointmentStatusButton(appt);
  card.appendChild(info);
  card.appendChild(time);
  card.appendChild(statusArea);
  card.addEventListener("click", () => {
    openViewModal(appt.id);
  });
  return card;
}
function renderWaitingQueue() {
  const list = document.getElementById("waitingQueueList");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  const selectedKey = dateToKey(selectedDate);
  const queue = filteredAppts();
  if (!queue.length) {
    const empty = document.createElement("div");
    empty.className = "empty-queue";
    if (isClinicClosedDate(selectedKey)) {
      empty.textContent = "Clinic is closed on Sundays.";
    } else if (isPastDate(selectedKey)) {
      empty.textContent = "No appointment records for this date.";
    } else {
      empty.textContent = "No patient appointments.";
    }
    list.appendChild(empty);
    return;
  }
  queue.forEach((appt) => {
    const item = document.createElement("div");
    item.className = "queue-item";
    const initials = getInitials(appt.patient);
    const end = getAppointmentEndTime(appt);
    const pendingRescheduleRequest = getPendingRescheduleRequestForAppointment(
      appt.id,
    );
    item.innerHTML = `
        <div class="queue-main">
          <div class="queue-avatar">${initials}</div>
          <div class="queue-text">
            <span class="queue-name">${escapeHtml(appt.patient)}</span>
            <span class="queue-time">${fmtTime(appt.start)} – ${fmtTime(end)}</span>
            ${pendingRescheduleRequest ? `<span class="queue-reschedule-request"><i class="fa-solid fa-calendar-days"></i> Reschedule Requested</span>` : ""}
          </div>
        </div>
        <div class="queue-type${pendingRescheduleRequest ? " pending" : ""}">${escapeHtml(appt.type)}${pendingRescheduleRequest ? " · Pending" : ""}</div>
      `;
    item.addEventListener("click", () => {
      openViewModal(appt.id);
    });
    list.appendChild(item);
  });
}
function openViewModal(id) {
  const appt = appointments.find((item) => String(item.id) === String(id));
  if (!appt) {
    return;
  }
  const appointmentDentist = String(
    appt.dentist || appt.dentistId || appt.dentist_id || "",
  )
    .trim()
    .toLowerCase();
  const doctorDentistId = String(currentDoctorDentistId || "")
    .trim()
    .toLowerCase();
  if (!doctorDentistId || appointmentDentist !== doctorDentistId) {
    console.warn("Access denied: appointment belongs to another doctor.", {
      appointmentId: appt.id,
      appointmentDoctorId: appointmentDentist,
      currentDoctor: doctorDentistId,
    });
    return;
  }
  selectedAppointmentId = appt.id;
  document.getElementById("modalTitle").textContent = "Appointment Details";
  document.getElementById("modalSubtitle").textContent =
    `${formatDateLong(appt.date)} · ${fmtTime(appt.start)} – ${fmtTime(getAppointmentEndTime(appt))}`;
  document.getElementById("f_patient").value = appt.patient;
  const patientRecordButton = document.getElementById("viewPatientRecordBtn");
  if (patientRecordButton) {
    patientRecordButton.onclick = () => {
      const patientId = appt.patientId || appt.patient_id || "";
      if (!patientId) {
        console.warn("This appointment has no patient ID.", appt);
        return;
      }
      window.location.href = `../patient/patient.html?patient_id=${encodeURIComponent(patientId)}`;
    };
  }
  document.getElementById("f_date").value = appt.date;
  document.getElementById("f_time").value = appt.start;
  document.getElementById("f_type").value = appt.type;
  document.getElementById("f_duration").value = appt.duration;
  const status = document.getElementById("modalStatus");
  if (status) {
    status.className = "modal-status";
    if (appt.status === APPOINTMENT_STATUS.IN_CONSULTATION) {
      status.classList.add("in-consultation");
    }
    if (appt.status === APPOINTMENT_STATUS.COMPLETED) {
      status.classList.add("completed");
    }
    status.textContent = getStatusLabel(appt.status);
  }
  const unavailableButton = document.getElementById("markApptUnavailableBtn");
  const unavailableLabel = document.getElementById("markApptUnavailableLabel");
  if (unavailableButton && unavailableLabel) {
    const existingBlock = findUnavailabilityForAppointment(appt);
    const canMark =
      appt.status === APPOINTMENT_STATUS.SCHEDULED && !isPastDate(appt.date);
    if (existingBlock && isAllDayBlock(existingBlock)) {
      unavailableButton.style.display = "none";
    } else if (existingBlock) {
      unavailableButton.style.display = "";
      unavailableLabel.textContent = "Open This Time Again";
    } else if (canMark) {
      unavailableButton.style.display = "";
      unavailableLabel.textContent = "Mark Unavailable for This Time";
    } else {
      unavailableButton.style.display = "none";
    }
  }
  const overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.classList.add("show");
  }
}
function closeModal() {
  document.getElementById("overlay").classList.remove("show");
  selectedAppointmentId = null;
}
function createAppointmentStatusButton(appt) {
  const wrapper = document.createElement("div");
  wrapper.className = "appt-status-area";
  if (appt.status === APPOINTMENT_STATUS.SCHEDULED) {
    if (!isToday(appt.date)) {
      const badge = document.createElement("span");
      badge.className = "appt-status-badge scheduled";
      badge.textContent = "Scheduled";
      wrapper.appendChild(badge);
      return wrapper;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appt-status-btn status-checkin";
    button.innerHTML = '<i class="fa-solid fa-user-check"></i> Check In';
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      checkInAppointment(appt.id);
    });
    wrapper.appendChild(button);
    return wrapper;
  }
  if (appt.status === APPOINTMENT_STATUS.IN_CONSULTATION) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appt-status-btn status-consultation";
    button.innerHTML = '<i class="fa-solid fa-tooth"></i> In Consultation';
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openStatusConfirmation(appt.id, "finishConsultation");
    });
    wrapper.appendChild(button);
    return wrapper;
  }
  if (appt.status === APPOINTMENT_STATUS.COMPLETED) {
    const badge = document.createElement("span");
    badge.className = "appt-status-btn status-completed";
    badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Completed';
    wrapper.appendChild(badge);
    return wrapper;
  }
  if (appt.status === APPOINTMENT_STATUS.NO_SHOW) {
    const badge = document.createElement("span");
    badge.className = "appt-status-badge no-show";
    badge.textContent = "No Show";
    wrapper.appendChild(badge);
    return wrapper;
  }
  if (appt.status === APPOINTMENT_STATUS.CANCELLED) {
    const badge = document.createElement("span");
    badge.className = "appt-status-badge cancelled";
    badge.textContent = "Cancelled";
    wrapper.appendChild(badge);
    return wrapper;
  }
  return wrapper;
}
function checkInAppointment(id) {
  const appt = appointments.find((item) => String(item.id) === String(id));
  if (!appt) {
    return;
  }
  const appointmentDentist = String(
    appt.dentist || appt.dentistId || appt.dentist_id || "",
  )
    .trim()
    .toLowerCase();
  const doctorDentistId = String(currentDoctorDentistId || "")
    .trim()
    .toLowerCase();
  if (!doctorDentistId || appointmentDentist !== doctorDentistId) {
    console.warn("Check In blocked: appointment belongs to another doctor.", {
      appointmentId: appt.id,
      appointmentDoctorId: appointmentDentist,
      currentDoctor: doctorDentistId,
    });
    return;
  }
  if (
    ![APPOINTMENT_STATUS.SCHEDULED, APPOINTMENT_STATUS.NO_SHOW].includes(
      appt.status,
    ) ||
    !isToday(appt.date)
  ) {
    return;
  }
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() >= getAppointmentEnd(appt)) {
    return;
  }
  appt.status = APPOINTMENT_STATUS.IN_CONSULTATION;
  appt.checkedIn = true;
  appt.checkedInAt = new Date().toISOString();
  appt.consultationStarted = true;
  appt.manualReadyComplete = false;
  saveAppointmentsToDatabase();
  renderAll();
  showToast(`${appt.patient} has been checked in.`);
}
function openStatusConfirmation(id, actionType) {
  if (actionType === "removeUnavailability") {
    const block = doctorUnavailability.find(
      (item) => String(item.id) === String(id),
    );
    if (!block) {
      return;
    }
    statusActionTargetId = id;
    statusActionType = actionType;
    document.getElementById("statusConfirmTitle").textContent = isAllDayBlock(
      block,
    )
      ? "Open This Day Again?"
      : "Open This Time Again?";
    document.getElementById("statusConfirmMessage").textContent =
      `Patients and staff will be able to book ${formatDateLong(block.date)} (${formatUnavailabilityRange(block)}) again.`;
    document.getElementById("statusConfirmButton").textContent = isAllDayBlock(
      block,
    )
      ? "Yes, Open This Day"
      : "Yes, Open This Time";
    const removeIcon = document.getElementById("statusConfirmIcon");
    removeIcon.innerHTML = '<i class="fa-solid fa-rotate-left"></i>';
    removeIcon.classList.remove("status-confirm-icon-warning");
    document.getElementById("statusConfirmReason").classList.remove("show");
    document.getElementById("statusConfirmOverlay").classList.add("show");
    return;
  }
  if (actionType === "markAppointmentUnavailable") {
    const target = appointments.find((item) => String(item.id) === String(id));
    if (!target) {
      return;
    }
    statusActionTargetId = id;
    statusActionType = actionType;
    document.getElementById("statusConfirmTitle").textContent =
      "Mark Unavailable?";
    document.getElementById("statusConfirmMessage").textContent =
      `You will be unavailable on ${formatDateLong(target.date)} from ${fmtTime(target.start)} to ${fmtTime(getAppointmentEndTime(target))}. Patients and staff will not be able to book this time. Please enter your reason.`;
    document.getElementById("statusConfirmButton").textContent =
      "Yes, Mark Unavailable";
    const markIcon = document.getElementById("statusConfirmIcon");
    markIcon.innerHTML = '<i class="fa-solid fa-user-slash"></i>';
    markIcon.classList.add("status-confirm-icon-warning");
    const reasonInput = document.getElementById("statusConfirmReason");
    reasonInput.value = "";
    reasonInput.classList.add("show");
    document.getElementById("statusConfirmOverlay").classList.add("show");
    return;
  }
  const appt = appointments.find((item) => String(item.id) === String(id));
  if (!appt) {
    return;
  }
  statusActionTargetId = id;
  statusActionType = actionType;
  const overlay = document.getElementById("statusConfirmOverlay");
  const title = document.getElementById("statusConfirmTitle");
  const message = document.getElementById("statusConfirmMessage");
  const button = document.getElementById("statusConfirmButton");
  const icon = document.getElementById("statusConfirmIcon");
  if (actionType === "finishConsultation") {
    title.textContent = "Finish Consultation?";
    message.textContent = `Are you sure you want to finish ${appt.patient}'s consultation?`;
    button.textContent = "Yes, Finish";
    icon.innerHTML = '<i class="fa-solid fa-stethoscope"></i>';
  }
  overlay.classList.add("show");
}
function closeStatusConfirmation() {
  statusActionTargetId = null;
  statusActionType = null;
  document
    .getElementById("statusConfirmIcon")
    .classList.remove("status-confirm-icon-warning");
  document.getElementById("statusConfirmReason").classList.remove("show");
  document.getElementById("statusConfirmOverlay").classList.remove("show");
}
function confirmStatusAction() {
  if (!statusActionTargetId || !statusActionType) {
    return;
  }
  if (statusActionType === "removeUnavailability") {
    const unavailabilityId = statusActionTargetId;
    closeStatusConfirmation();
    closeUnavailabilityDetails();
    removeUnavailability(unavailabilityId);
    return;
  }
  if (statusActionType === "markAppointmentUnavailable") {
    const reason = document.getElementById("statusConfirmReason").value.trim();
    if (!reason) {
      showToast("Please enter the reason.");
      return;
    }
    const targetId = statusActionTargetId;
    closeStatusConfirmation();
    markAppointmentUnavailable(targetId, reason);
    return;
  }
  const appt = appointments.find(
    (item) => String(item.id) === String(statusActionTargetId),
  );
  if (!appt) {
    closeStatusConfirmation();
    return;
  }
  const appointmentDentist = String(
    appt.dentist || appt.dentistId || appt.dentist_id || "",
  )
    .trim()
    .toLowerCase();
  const doctorDentistId = String(currentDoctorDentistId || "")
    .trim()
    .toLowerCase();
  if (!doctorDentistId || appointmentDentist !== doctorDentistId) {
    console.warn(
      "Status action blocked: appointment belongs to another doctor.",
      {
        appointmentId: appt.id,
        appointmentDoctorId: appointmentDentist,
        currentDoctor: doctorDentistId,
        action: statusActionType,
      },
    );
    closeStatusConfirmation();
    return;
  }
  if (statusActionType === "finishConsultation") {
    if (appt.status !== APPOINTMENT_STATUS.IN_CONSULTATION) {
      closeStatusConfirmation();
      return;
    }
    appt.status = APPOINTMENT_STATUS.COMPLETED;
    appt.checkedIn = true;
    appt.consultationStarted = false;
    appt.manualReadyComplete = false;
    saveAppointmentsToDatabase();
    closeStatusConfirmation();
    renderAll();
    showToast(`${appt.patient}'s consultation is now Completed.`);
    return;
  }
}
function getInitials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
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
  }, 3000);
}
document.addEventListener("click", (event) => {
  const overlay = document.getElementById("overlay");
  const unavailableOverlay = document.getElementById("unavailableOverlay");
  const detailOverlay = document.getElementById("unavailabilityDetailOverlay");
  const statusOverlay = document.getElementById("statusConfirmOverlay");
  if (event.target === overlay) {
    closeModal();
  }
  if (event.target === unavailableOverlay) {
    closeUnavailableModal();
  }
  if (event.target === detailOverlay) {
    closeUnavailabilityDetails();
  }
  if (event.target === statusOverlay) {
    closeStatusConfirmation();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  const statusOverlay = document.getElementById("statusConfirmOverlay");
  if (statusOverlay.classList.contains("show")) {
    closeStatusConfirmation();
    return;
  }
  const unavailableOverlay = document.getElementById("unavailableOverlay");
  if (unavailableOverlay.classList.contains("show")) {
    closeUnavailableModal();
    return;
  }
  const detailOverlay = document.getElementById("unavailabilityDetailOverlay");
  if (detailOverlay.classList.contains("show")) {
    closeUnavailabilityDetails();
    return;
  }
  closeModal();
});
