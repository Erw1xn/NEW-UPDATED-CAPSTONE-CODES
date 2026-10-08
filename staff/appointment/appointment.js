const PATIENTS_STORAGE_KEY = "dentanueva_patients";
const PATIENT_RECORD_API = "../../api/patient_records.php";
const DOCTORS_API = "../../api/doctors.php";
const DOCTORS_STORAGE_KEY = "dentanueva_doctors";
const START_HOUR = 10;
const FIRST_BOOKABLE_HOUR = 10;
const END_HOUR = 17.5;
const SLOT_MIN = 30;
const NO_SHOW_GRACE_PERIOD_MIN = 15;
const NO_SHOW_TESTING_MODE = false;
const ALL_DENTISTS_FILTER = "all";
const SERVICE_DURATIONS = {
  Consultation: 30,
  "Dental Cleaning": 45,
  "Tooth Filling / Pasta": 45,
  "Tooth Extraction": 60,
  "Root Canal": 90,
  "Braces Adjustment": 30,
  "Teeth Whitening": 60,
  "Dental X-Ray": 15,
  "Scaling and Polishing": 45,
  "Denture Fitting": 60,
  "Wisdom Tooth Extraction": 75,
  "Dental Implant Consultation": 30,
  "Oral Prophylaxis": 45,
  "Retainer Fitting": 30,
};
const DEFAULT_SERVICE_SUGGESTIONS = [
  "Consultation",
  "Dental Cleaning",
  "Tooth Filling / Pasta",
  "Tooth Extraction",
  "Root Canal",
  "Braces Adjustment",
];
const DENTIST_COLORS = ["#166F63", "#E8A93B", "#FF6B57", "#3B82F6", "#8B5CF6"];
let dentists = {};
const APPOINTMENT_STATUS = {
  SCHEDULED: "scheduled",
  IN_CONSULTATION: "in_consultation",
  READY_COMPLETE: "ready_complete",
  COMPLETED: "completed",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
};
let appointments = [];
let patients = [];
let rescheduleRequests = [];
let currentCalendarDate = new Date();
let selectedDate = new Date();
let editingId = null;
let deleteTargetId = null;
let modalMode = "new";
let statusActionTargetId = null;
let statusActionType = null;
let toastTimer = null;
let selectedDentistFilter = "";
let rescheduleReviewRequestId = null;
let rescheduleDecisionRequestId = null;
document.addEventListener("DOMContentLoaded", () => {
  void loadDentists();
  loadPatients();
  loadAppointments();
  void hydrateRescheduleRequestsFromDatabase();
  initializeDate();
  setupEvents();
  const dentistFilter = document.getElementById("dentistFilter");
  if (dentistFilter) {
    selectedDentistFilter = dentistFilter.value || getDefaultDentistId();
  }
  renderAll();
  setInterval(() => {
    updateAutomaticAppointmentStatuses();
    renderTimeline();
    renderWaitingQueue();
    if (
      ["new", "edit", "reschedule"].includes(modalMode) &&
      document.getElementById("overlay")?.classList.contains("show")
    ) {
      checkCurrentFormConflict();
    }
  }, 1000);
  openAppointmentFromURL();
});
function getDoctorId(doctor) {
  return String(
    doctor?.doctorId ||
      doctor?.doctor_id ||
      doctor?.doctorID ||
      doctor?.dentistId ||
      doctor?.dentist_id ||
      doctor?.dentistID ||
      "",
  )
    .trim()
    .toLowerCase();
}
function getDoctorName(doctor) {
  const firstName = doctor?.firstname || doctor?.firstName || "";
  const lastName = doctor?.lastname || doctor?.lastName || "";
  const name = String(
    doctor?.name ||
      doctor?.fullName ||
      doctor?.full_name ||
      `${firstName} ${lastName}`.trim(),
  ).trim();
  return name
    ? /^dr\.?\s/i.test(name)
      ? name
      : `Dr. ${name}`
    : "Unnamed Doctor";
}
function normalizeDentistIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^doctor\s+/i, "")
    .replace(/^dr\.?\s*/i, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
async function loadDentists() {
  let storedDoctors = [];
  try {
    const response = await fetch(DOCTORS_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Doctors unavailable.");
    }
    storedDoctors = result.data;
  } catch (error) {
    console.warn("Database doctors unavailable.", error);
  }
  const previousSelection = selectedDentistFilter;
  dentists = {};
  storedDoctors.forEach((doctor, index) => {
    const id = getDoctorId(doctor);
    if (!id) return;
    dentists[id] = {
      ...doctor,
      id,
      name: getDoctorName(doctor),
      specialty: doctor.specialization || doctor.specialty || "Dental Care",
      color: DENTIST_COLORS[index % DENTIST_COLORS.length],
    };
  });
  populateDentistSelects();
  selectedDentistFilter =
    previousSelection === ALL_DENTISTS_FILTER
      ? ALL_DENTISTS_FILTER
      : dentists[previousSelection]
        ? previousSelection
        : ALL_DENTISTS_FILTER;
  const filter = document.getElementById("dentistFilter");
  if (filter) filter.value = selectedDentistFilter;
  renderAll();
}
function getDefaultDentistId() {
  return Object.keys(dentists)[0] || "";
}
function populateDentistSelects() {
  const options = Object.values(dentists);
  ["dentistFilter", "f_dentist"].forEach((selectId) => {
    const select = document.getElementById(selectId);
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = "";
    if (selectId === "dentistFilter") {
      const allOption = document.createElement("option");
      allOption.value = ALL_DENTISTS_FILTER;
      allOption.textContent = "All Dentists";
      select.appendChild(allOption);
    }
    options.forEach((doctor) => {
      const option = document.createElement("option");
      option.value = doctor.id;
      option.textContent = doctor.name;
      select.appendChild(option);
    });
    if (selectId === "dentistFilter") {
      select.value =
        currentValue === ALL_DENTISTS_FILTER
          ? ALL_DENTISTS_FILTER
          : dentists[currentValue]
            ? currentValue
            : ALL_DENTISTS_FILTER;
    } else if (dentists[currentValue]) {
      select.value = currentValue;
    } else if (options.length) {
      select.value = options[0].id;
    }
  });
}
function getDentistRecord(dentistId) {
  return (
    dentists[
      String(dentistId || "")
        .trim()
        .toLowerCase()
    ] || null
  );
}
function resolveDentistId(value) {
  const normalizedValue = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalizedValue) return "";
  if (dentists[normalizedValue]) return normalizedValue;
  const normalizedIdentity = normalizeDentistIdentity(value);
  const matchedDoctor = Object.values(dentists).find((doctor) => {
    const identities = [
      doctor.id,
      doctor.doctorId,
      doctor.doctor_id,
      doctor.doctorID,
      doctor.dentistId,
      doctor.dentist_id,
      doctor.dentistID,
      doctor.name,
      doctor.fullName,
      doctor.full_name,
      doctor.email,
    ];
    return identities.some(
      (identity) =>
        String(identity || "")
          .trim()
          .toLowerCase() === normalizedValue ||
        normalizeDentistIdentity(identity) === normalizedIdentity,
    );
  });
  return matchedDoctor?.id || normalizedValue;
}
function appointmentMatchesDentist(appt, dentistId = selectedDentistFilter) {
  if (dentistId === ALL_DENTISTS_FILTER) {
    return true;
  }
  const appointmentDentist =
    appt.dentist ||
    appt.dentistId ||
    appt.dentist_id ||
    appt.dentistID ||
    appt.doctor ||
    appt.doctorId ||
    appt.doctor_id ||
    appt.doctorID ||
    appt.doctorName ||
    appt.assignedDentist ||
    appt.assignedDentistId ||
    appt.assignedDoctor ||
    appt.assignedDoctorId ||
    "";
  return resolveDentistId(appointmentDentist) === resolveDentistId(dentistId);
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
function openAppointmentFromURL() {
  const params = new URLSearchParams(window.location.search);
  const appointmentId = params.get("appointmentId");
  if (!appointmentId) return;
  const appointment = appointments.find(
    (item) => String(item.id) === String(appointmentId),
  );
  if (!appointment) return;
  selectedDate = keyToDate(appointment.date);
  currentCalendarDate = new Date(selectedDate);
  renderAll();
  openViewModal(appointment.id);
}
function setupEvents() {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderTimeline();
      renderWaitingQueue();
    });
  }
  const dentistFilter = document.getElementById("dentistFilter");
  if (dentistFilter) {
    dentistFilter.addEventListener("change", () => {
      selectedDentistFilter = dentistFilter.value || getDefaultDentistId();
      renderScheduleOverview();
      renderTimeline();
      renderWaitingQueue();
    });
  }
  const serviceInput = document.getElementById("f_type");
  if (serviceInput) {
    serviceInput.addEventListener("input", () => {
      handleServiceChange();
      renderServiceDropdown(serviceInput.value);
      openServiceDropdown();
    });
    serviceInput.addEventListener("change", handleServiceChange);
    serviceInput.addEventListener("focus", openServiceDropdown);
  }
  const serviceArrow = document.querySelector(".service-select-arrow");
  if (serviceArrow) {
    serviceArrow.addEventListener("click", () => {
      const wrapper = document.getElementById("serviceSelectWrapper");
      if (!wrapper) return;
      if (wrapper.classList.contains("open")) {
        closeServiceDropdown();
      } else {
        serviceInput?.focus();
        openServiceDropdown();
      }
    });
  }
  const dateInput = document.getElementById("f_date");
  if (dateInput) {
    dateInput.addEventListener("change", handleModalDateChange);
  }
  const timeTrigger = document.getElementById("f_time_trigger");
  if (timeTrigger) {
    timeTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleTimePicker();
    });
  }
  const dentistInput = document.getElementById("f_dentist");
  if (dentistInput) {
    dentistInput.addEventListener("change", () => {
      updateAvailableTimeSlots();
      checkCurrentFormConflict();
    });
  }
  const durationInput = document.getElementById("f_duration");
  if (durationInput) {
    durationInput.addEventListener("input", () => {
      updateAvailableTimeSlots();
      checkCurrentFormConflict();
    });
  }
  const patientInput = document.getElementById("f_patient");
  if (patientInput) {
    patientInput.addEventListener("input", handlePatientInputChange);
    patientInput.addEventListener("focus", openPatientDropdown);
    patientInput.addEventListener("keydown", handlePatientInputKeydown);
  }
  const patientArrow = document.querySelector(".patient-select-arrow");
  if (patientArrow) {
    patientArrow.addEventListener("click", () => {
      const wrapper = document.getElementById("patientSelectWrapper");
      if (!wrapper) return;
      if (wrapper.classList.contains("open")) {
        closePatientDropdown();
      } else {
        document.getElementById("f_patient")?.focus();
        openPatientDropdown();
      }
    });
  }
  const rescheduleReasonInput = document.getElementById("rescheduleReason");
  if (rescheduleReasonInput) {
    rescheduleReasonInput.addEventListener("change", () => {
      const messageInput = document.getElementById("rescheduleMessage");
      if (!messageInput) return;
      if (rescheduleReasonInput.value === "dentist_unavailable") {
        messageInput.value = getDefaultRescheduleMessage("dentist_unavailable");
      } else {
        messageInput.value = "";
      }
    });
  }
}
function loadPatients() {
  patients = [];
  void hydratePatientsFromDatabase();
}
async function hydratePatientsFromDatabase() {
  try {
    const response = await fetch(PATIENT_RECORD_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Patients unavailable.");
    }
    patients = result.data
      .filter(
        (patient) =>
          String(patient.status || "active").toLowerCase() === "active",
      )
      .map(normalizePatient);
    savePatientsToStorage();
    refreshPatientSelector();
  } catch (error) {
    console.warn("Database patients unavailable; using local records.", error);
  }
}
function normalizePatient(patient) {
  const patientId =
    patient.patientId ||
    patient.patient_id ||
    patient.id ||
    patient.userId ||
    patient.user_id ||
    `P${String(Date.now()).slice(-6)}`;
  return {
    ...patient,
    id: String(patientId),
    patientId: String(patientId),
    firstName: patient.firstName || patient.firstname || "",
    lastName: patient.lastName || patient.lastname || "",
    dateOfBirth: patient.dateOfBirth || patient.date_of_birth || "",
    gender: patient.gender || "",
    phone: patient.phone || patient.contactNumber || patient.contact || "",
    email: patient.email || "",
    address: patient.address || "",
    emergencyName: patient.emergencyName || "",
    emergencyContact: patient.emergencyContact || "",
    medicalForm: patient.medicalForm || {},
    appointments: Array.isArray(patient.appointments)
      ? patient.appointments
      : [],
  };
}
function savePatientsToStorage() {
  return;
}
function getPatientFullName(patient) {
  if (!patient) return "Unknown Patient";
  const first = String(patient.firstName || "").trim();
  const last = String(patient.lastName || "").trim();
  return `${first} ${last}`.trim() || "Unknown Patient";
}
function findPatientById(patientId) {
  if (!patientId) return null;
  const value = String(patientId).trim().toLowerCase();
  return (
    patients.find((patient) =>
      [
        patient.id,
        patient.patientId,
        patient.patient_id,
        patient.userId,
        patient.user_id,
      ]
        .filter(
          (id) => id !== undefined && id !== null && String(id).trim() !== "",
        )
        .some((id) => String(id).trim().toLowerCase() === value),
    ) || null
  );
}
function findPatientByName(name) {
  if (!name) return null;
  const target = String(name).trim().toLowerCase();
  return (
    patients.find(
      (patient) => getPatientFullName(patient).trim().toLowerCase() === target,
    ) || null
  );
}
function patientHasAccount(patient) {
  if (!patient) return false;
  return Boolean(
    patient.userId ||
    patient.user_id ||
    patient.userIdRef ||
    patient.accountId ||
    patient.account_id,
  );
}
function setupPatientDatalist() {
  refreshPatientSelector();
}
function getPatientMatches(query) {
  const trimmed = String(query || "")
    .trim()
    .toLowerCase();
  const sortedPatients = patients
    .slice()
    .sort((a, b) => getPatientFullName(a).localeCompare(getPatientFullName(b)));
  if (!trimmed) {
    return sortedPatients.slice(0, 5);
  }
  return sortedPatients.filter((patient) => {
    const name = getPatientFullName(patient).toLowerCase();
    const id = String(patient.id || "").toLowerCase();
    const phone = String(
      patient.phone || patient.contactNumber || patient.contact || "",
    ).toLowerCase();
    const email = String(patient.email || "").toLowerCase();
    return (
      name.includes(trimmed) ||
      id.includes(trimmed) ||
      phone.includes(trimmed) ||
      email.includes(trimmed)
    );
  });
}
function renderPatientDropdown(query = "") {
  const dropdown = document.getElementById("patientDropdown");
  if (!dropdown) return;
  const matches = getPatientMatches(query);
  dropdown.innerHTML = "";
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "patient-dropdown-empty";
    empty.textContent = patients.length
      ? "No matching patient found."
      : "No patients available.";
    dropdown.appendChild(empty);
    return;
  }
  matches.forEach((patient, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "patient-dropdown-item";
    item.setAttribute("role", "option");
    item.dataset.patientId = String(patient.id);
    if (index === 0) {
      item.classList.add("active");
    }
    item.innerHTML = `<span class="patient-dropdown-name">${escapeHtml(getPatientFullName(patient))}</span><span class="patient-dropdown-id">${escapeHtml(String(patient.id))}</span>`;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectPatientOption(patient);
    });
    dropdown.appendChild(item);
  });
}
function openPatientDropdown() {
  const wrapper = document.getElementById("patientSelectWrapper");
  const input = document.getElementById("f_patient");
  if (!wrapper || !input || input.disabled) {
    return;
  }
  renderPatientDropdown(input.value);
  wrapper.classList.add("open");
  input.setAttribute("aria-expanded", "true");
}
function closePatientDropdown() {
  const wrapper = document.getElementById("patientSelectWrapper");
  const input = document.getElementById("f_patient");
  if (!wrapper) return;
  wrapper.classList.remove("open");
  if (input) {
    input.setAttribute("aria-expanded", "false");
  }
}
function selectPatientOption(patient) {
  const input = document.getElementById("f_patient");
  const wrapper = document.getElementById("patientSelectWrapper");
  if (!input || !patient) return;
  input.value = `${getPatientFullName(patient)} · ${patient.id}`;
  input.dataset.patientId = String(patient.id);
  input.setAttribute("aria-expanded", "false");
  wrapper?.classList.remove("open");
  input.focus();
}
function refreshPatientSelector() {
  const patientInput = document.getElementById("f_patient");
  if (!patientInput) return;
  const currentPatientId = patientInput.dataset.patientId || "";
  const currentPatient = currentPatientId
    ? findPatientById(currentPatientId)
    : null;
  if (currentPatient) {
    patientInput.value = `${getPatientFullName(currentPatient)} · ${currentPatient.id}`;
  } else if (!findPatientByName(patientInput.value)) {
    patientInput.value = "";
    patientInput.dataset.patientId = "";
  }
  renderPatientDropdown(patientInput.value);
}
function handlePatientInputChange() {
  const patientInput = document.getElementById("f_patient");
  if (!patientInput || patientInput.disabled) {
    return;
  }
  patientInput.dataset.patientId = "";
  renderPatientDropdown(patientInput.value);
  openPatientDropdown();
}
function handlePatientInputKeydown(event) {
  if (event.key === "Escape") {
    closePatientDropdown();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    document.querySelector("#patientDropdown .patient-dropdown-item")?.focus();
    return;
  }
  if (event.key === "Enter") {
    const firstItem = document.querySelector(
      "#patientDropdown .patient-dropdown-item",
    );
    if (
      firstItem &&
      document
        .getElementById("patientSelectWrapper")
        ?.classList.contains("open")
    ) {
      event.preventDefault();
      const patient = findPatientById(firstItem.dataset.patientId);
      if (patient) {
        selectPatientOption(patient);
      }
    }
  }
}
function getCurrentFormPatient() {
  const patientInput = document.getElementById("f_patient");
  if (!patientInput) return null;
  const patientId = patientInput.dataset.patientId || "";
  if (patientId) {
    return findPatientById(patientId);
  }
  return findPatientByName(patientInput.value.split(" · ")[0]);
}
function loadAppointments() {
  appointments = [];
  void hydrateAppointmentsFromDatabase();
}
async function hydrateAppointmentsFromDatabase() {
  if (!window.DentaNuevaAppointmentDatabase) {
    console.error("Appointment database API is unavailable.");
    appointments = [];
    renderAll();
    return;
  }
  try {
    const remoteAppointments =
      await window.DentaNuevaAppointmentDatabase.load();
    const remote = Array.isArray(remoteAppointments)
      ? remoteAppointments.map(normalizeAppointment)
      : [];
    appointments = remote;
    removeAppointmentsForDeletedPatients();
    linkExistingAppointmentsToPatients();
    renderAll();
  } catch (error) {
    console.error("Unable to load appointments from database:", error);
    appointments = [];
    renderAll();
  }
}
async function saveAppointmentsToDatabase() {
  if (!Array.isArray(appointments)) {
    return false;
  }
  if (!window.DentaNuevaAppointmentDatabase) {
    console.error("Appointment database API is unavailable.");
    return false;
  }
  try {
    await window.DentaNuevaAppointmentDatabase.save(appointments);
    return true;
  } catch (error) {
    console.error("Unable to save appointments to database:", error);
    return false;
  }
}
function removeAppointmentsForDeletedPatients() {
  if (!Array.isArray(appointments)) {
    return;
  }
  appointments = appointments.filter((appt) => {
    return (
      !!appt &&
      (!!appt.patientId ||
        !!appt.patient_id ||
        !!appt.patientID ||
        !!appt.patient)
    );
  });
}
function normalizeAppointment(appt) {
  let patientId = appt.patientId || appt.patient_id || appt.patientID || "";
  if (!patientId && appt.patient) {
    const matchedPatient = findPatientByName(
      String(appt.patient).split(" · ")[0],
    );
    if (matchedPatient) {
      patientId = matchedPatient.id;
    }
  }
  const linkedPatient = findPatientById(patientId);
  const patientName = linkedPatient
    ? getPatientFullName(linkedPatient)
    : appt.patient || appt.patientName || "Unknown Patient";
  const rawStatus = String(appt.status || appt.appointmentStatus || "scheduled")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const statusMap = {
    scheduled: APPOINTMENT_STATUS.SCHEDULED,
    pending: APPOINTMENT_STATUS.SCHEDULED,
    confirmed: APPOINTMENT_STATUS.SCHEDULED,
    cancelled: APPOINTMENT_STATUS.CANCELLED,
    canceled: APPOINTMENT_STATUS.CANCELLED,
    in_consultation: APPOINTMENT_STATUS.IN_CONSULTATION,
    "in-consultation": APPOINTMENT_STATUS.IN_CONSULTATION,
    ready_complete: APPOINTMENT_STATUS.COMPLETED,
    "ready-to-complete": APPOINTMENT_STATUS.COMPLETED,
    ready_to_complete: APPOINTMENT_STATUS.COMPLETED,
    complete: APPOINTMENT_STATUS.COMPLETED,
    completed: APPOINTMENT_STATUS.COMPLETED,
    no_show: APPOINTMENT_STATUS.NO_SHOW,
    "no-show": APPOINTMENT_STATUS.NO_SHOW,
  };
  const normalized = {
    ...appt,
    id:
      appt.id ||
      appt.appointmentId ||
      appt.appointment_id ||
      `appt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    appointmentId: appt.appointmentId || appt.appointment_id || appt.id || null,
    patientId: patientId || null,
    patient: patientName,
    date: appt.date || appt.appointmentDate || appt.appointment_date || "",
    start:
      appt.start ||
      appt.time ||
      appt.appointmentTime ||
      appt.appointment_time ||
      "10:00",
    type: appt.type || appt.service || appt.serviceType || "Consultation",
    dentist: resolveDentistId(
      appt.dentist ||
        appt.dentistId ||
        appt.dentist_id ||
        appt.dentistID ||
        appt.doctor ||
        appt.doctorId ||
        appt.doctor_id ||
        appt.doctorID ||
        appt.doctorName ||
        appt.assignedDentist ||
        appt.assignedDentistId ||
        appt.assignedDoctor ||
        appt.assignedDoctorId ||
        "",
    ),
    duration: Number(
      appt.duration ||
        SERVICE_DURATIONS[appt.type] ||
        SERVICE_DURATIONS[appt.service] ||
        SERVICE_DURATIONS[appt.serviceType] ||
        30,
    ),
    status: statusMap[rawStatus] || APPOINTMENT_STATUS.SCHEDULED,
    checkedIn: appt.checkedIn === true,
    checkedInAt: appt.checkedInAt || null,
    consultationStarted: appt.consultationStarted === true,
    manualReadyComplete: appt.manualReadyComplete === true,
    paymentStatus: appt.paymentStatus || "unpaid",
    paymentAmount: Number(appt.paymentAmount) || 0,
    rescheduleRequest: appt.rescheduleRequest || null,
    rescheduleCount: Number(appt.rescheduleCount || appt.reschedule_count) || 0,
    approvedRescheduleCount:
      Number(appt.approvedRescheduleCount || appt.approved_reschedule_count) ||
      0,
    rescheduleHistory: Array.isArray(appt.rescheduleHistory)
      ? appt.rescheduleHistory
      : Array.isArray(appt.reschedule_history)
        ? appt.reschedule_history
        : [],
    databaseAppointmentId:
      Number(appt.databaseAppointmentId ?? appt.database_appointment_id ?? 0) ||
      null,
  };
  if (
    normalized.dentist === "villanueva" &&
    Object.keys(dentists).length === 1 &&
    !dentists.villanueva
  ) {
    normalized.dentist = getDefaultDentistId();
  }
  normalized.appointmentId = normalized.id;
  if (!Number.isFinite(normalized.duration) || normalized.duration <= 0) {
    normalized.duration = 30;
  }
  if (
    normalized.status === APPOINTMENT_STATUS.IN_CONSULTATION ||
    normalized.status === APPOINTMENT_STATUS.READY_COMPLETE ||
    normalized.status === APPOINTMENT_STATUS.COMPLETED
  ) {
    normalized.checkedIn = true;
  }
  return normalized;
}
function linkExistingAppointmentsToPatients() {
  let changed = false;
  appointments.forEach((appt) => {
    if (appt.patientId) {
      const patient = findPatientById(appt.patientId);
      if (patient) {
        const officialName = getPatientFullName(patient);
        if (appt.patient !== officialName) {
          appt.patient = officialName;
          changed = true;
        }
      }
      return;
    }
    const patient = findPatientByName(appt.patient);
    if (patient) {
      appt.patientId = patient.id;
      appt.patient = getPatientFullName(patient);
      changed = true;
    }
  });
  if (changed) {
    saveAppointmentsToDatabase();
  }
  synchronizeAllPatientAppointments();
}
function synchronizeAllPatientAppointments() {
  if (!patients.length) return;
  let changed = false;
  patients.forEach((patient) => {
    if (!Array.isArray(patient.appointments)) {
      patient.appointments = [];
      changed = true;
    }
    const linkedAppointments = appointments.filter(
      (appt) => String(appt.patientId) === String(patient.id),
    );
    const appointmentRecords = linkedAppointments.map((appt) => ({
      id: appt.id,
      appointmentId: appt.id,
      appointment_id: appt.id,
      patientId: appt.patientId,
      patient_id: appt.patientId,
      date: appt.date,
      appointmentDate: appt.date,
      time: appt.start,
      appointmentTime: appt.start,
      start: appt.start,
      type: appt.type,
      service: appt.type,
      serviceType: appt.type,
      dentist: appt.dentist,
      dentistId: appt.dentist,
      duration: appt.duration,
      status: appt.status,
      checkedIn: appt.checkedIn === true,
      checkedInAt: appt.checkedInAt || null,
      consultationStarted: appt.consultationStarted === true,
      manualReadyComplete: appt.manualReadyComplete === true,
      paymentStatus: appt.paymentStatus || "unpaid",
      paymentAmount: Number(appt.paymentAmount) || 0,
      rescheduleRequest: appt.rescheduleRequest || null,
    }));
    const oldValue = JSON.stringify(patient.appointments);
    const newValue = JSON.stringify(appointmentRecords);
    if (oldValue !== newValue) {
      patient.appointments = appointmentRecords;
      changed = true;
    }
    updatePatientNextAppointment(patient, linkedAppointments);
  });
  if (changed) {
    savePatientsToStorage();
  }
}
function updatePatientNextAppointment(patient, linkedAppointments = null) {
  const source =
    linkedAppointments ||
    appointments.filter(
      (appt) => String(appt.patientId) === String(patient.id),
    );
  const todayKey = dateToKey(new Date());
  const futureAppointments = source
    .filter(
      (appt) =>
        appt.date >= todayKey &&
        appt.status !== APPOINTMENT_STATUS.COMPLETED &&
        appt.status !== APPOINTMENT_STATUS.NO_SHOW &&
        appt.status !== APPOINTMENT_STATUS.CANCELLED,
    )
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return timeToMinutes(a.start) - timeToMinutes(b.start);
    });
  const next = futureAppointments[0] || null;
  patient.nextAppointment = next
    ? {
        id: next.id,
        appointmentId: next.id,
        date: next.date,
        time: next.start,
        type: next.type,
        dentist: next.dentist,
        status: next.status,
      }
    : null;
}
function syncAppointmentToPatient(appt) {
  if (!appt || !appt.patientId) {
    return;
  }
  const patient = findPatientById(appt.patientId);
  if (!patient) return;
  if (!Array.isArray(patient.appointments)) {
    patient.appointments = [];
  }
  const record = {
    id: appt.id,
    appointmentId: appt.id,
    appointment_id: appt.id,
    patientId: appt.patientId,
    patient_id: appt.patientId,
    date: appt.date,
    appointmentDate: appt.date,
    time: appt.start,
    appointmentTime: appt.start,
    start: appt.start,
    type: appt.type,
    service: appt.type,
    serviceType: appt.type,
    dentist: appt.dentist,
    dentistId: appt.dentist,
    duration: appt.duration,
    status: appt.status,
    checkedIn: appt.checkedIn === true,
    checkedInAt: appt.checkedInAt || null,
    consultationStarted: appt.consultationStarted === true,
    manualReadyComplete: appt.manualReadyComplete === true,
    paymentStatus: appt.paymentStatus || "unpaid",
    paymentAmount: Number(appt.paymentAmount) || 0,
    rescheduleRequest: appt.rescheduleRequest || null,
  };
  const index = patient.appointments.findIndex(
    (item) => String(item.appointmentId || item.id) === String(appt.id),
  );
  if (index === -1) {
    patient.appointments.push(record);
  } else {
    patient.appointments[index] = record;
  }
  updatePatientNextAppointment(patient);
  savePatientsToStorage();
}
function removeAppointmentFromPatient(appt) {
  if (!appt || !appt.patientId) {
    return;
  }
  const patient = findPatientById(appt.patientId);
  if (!patient) return;
  if (!Array.isArray(patient.appointments)) {
    patient.appointments = [];
  }
  patient.appointments = patient.appointments.filter(
    (item) => String(item.appointmentId || item.id) !== String(appt.id),
  );
  updatePatientNextAppointment(patient);
  savePatientsToStorage();
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
  const todayKey = dateToKey(new Date());
  const key = typeof dateOrKey === "string" ? dateOrKey : dateToKey(dateOrKey);
  return key === todayKey;
}
function isPastDate(dateOrKey) {
  if (!dateOrKey) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date =
    typeof dateOrKey === "string" ? keyToDate(dateOrKey) : new Date(dateOrKey);
  date.setHours(0, 0, 0, 0);
  return date < today;
}
function isFutureDate(dateOrKey) {
  return !isToday(dateOrKey) && !isPastDate(dateOrKey);
}
function getCurrentTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
function timeToMinutes(time) {
  if (!time) return 0;
  const parts = time.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
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
  return keyToDate(dateKey).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function getAppointmentEnd(appt) {
  return timeToMinutes(appt.start) + (Number(appt.duration) || 30);
}
function getAppointmentEndTime(appt) {
  return minutesToTime(getAppointmentEnd(appt));
}
function isNoShowEligible(appt) {
  if (appt.status !== APPOINTMENT_STATUS.SCHEDULED || !isToday(appt.date)) {
    return false;
  }
  return (
    getCurrentTimeMinutes() >=
    timeToMinutes(appt.start) + NO_SHOW_GRACE_PERIOD_MIN
  );
}
function appointmentsOverlap(
  newStart,
  newDuration,
  existingStart,
  existingDuration,
) {
  const newStartMinutes = timeToMinutes(newStart);
  const newEndMinutes = newStartMinutes + Number(newDuration);
  const existingStartMinutes = timeToMinutes(existingStart);
  const existingEndMinutes = existingStartMinutes + Number(existingDuration);
  return (
    newStartMinutes < existingEndMinutes && newEndMinutes > existingStartMinutes
  );
}
function findDentistConflict(date, start, duration, dentist, ignoreId = null) {
  return (
    appointments.find((appt) => {
      if (appt.id === ignoreId) {
        return false;
      }
      if (appt.date !== date) {
        return false;
      }
      if (appt.dentist !== dentist) {
        return false;
      }
      if (
        appt.status === APPOINTMENT_STATUS.COMPLETED ||
        appt.status === APPOINTMENT_STATUS.NO_SHOW ||
        appt.status === APPOINTMENT_STATUS.CANCELLED
      ) {
        return false;
      }
      return appointmentsOverlap(start, duration, appt.start, appt.duration);
    }) || null
  );
}
function findPatientBookingConflict(patientId, date, start, ignoreId = null) {
  const normalizedId = String(patientId || "")
    .trim()
    .toLowerCase();
  if (!normalizedId) return null;
  return (
    appointments.find((appt) => {
      if (String(appt.id) === String(ignoreId)) {
        return false;
      }
      const appointmentPatientId = String(
        appt.patientId || appt.patient_id || appt.patientID || "",
      )
        .trim()
        .toLowerCase();
      if (appointmentPatientId !== normalizedId) {
        return false;
      }
      if (
        appt.status === APPOINTMENT_STATUS.COMPLETED ||
        appt.status === APPOINTMENT_STATUS.NO_SHOW ||
        appt.status === APPOINTMENT_STATUS.CANCELLED
      ) {
        return false;
      }
      if (isPastDate(appt.date)) {
        return false;
      }
      if (!date || !start) {
        return Boolean(appt.date);
      }
      if (appt.date !== date) {
        return false;
      }
      const duration = Number(
        document.getElementById("f_duration")?.value || appt.duration || 30,
      );
      return appointmentsOverlap(start, duration, appt.start, appt.duration);
    }) || null
  );
}
function updateAutomaticAppointmentStatuses() {
  let changed = false;
  const todayKey = dateToKey(new Date());
  const currentTime = getCurrentTimeMinutes();
  appointments.forEach((appt) => {
    const appointmentEnd = getAppointmentEnd(appt);
    const appointmentStart = timeToMinutes(appt.start);
    if (
      appt.date === todayKey &&
      appt.status === APPOINTMENT_STATUS.SCHEDULED &&
      currentTime >= appointmentStart + NO_SHOW_GRACE_PERIOD_MIN
    ) {
      appt.status = APPOINTMENT_STATUS.NO_SHOW;
      appt.noShowAt = new Date().toISOString();
      syncAppointmentToPatient(appt);
      changed = true;
      return;
    }
    if (appt.status === APPOINTMENT_STATUS.IN_CONSULTATION) {
      const hasEnded =
        appt.date < todayKey ||
        (appt.date === todayKey && currentTime >= appointmentEnd);

      if (!hasEnded) return;

      appt.status = APPOINTMENT_STATUS.COMPLETED;
      appt.consultationStarted = false;
      appt.manualReadyComplete = false;

      syncAppointmentToPatient(appt);
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

    case APPOINTMENT_STATUS.IN_CONSULTATION:
      return "In Consultation";

    case APPOINTMENT_STATUS.COMPLETED:
      return "Completed";

    case APPOINTMENT_STATUS.NO_SHOW:
      return "No Show";

    case APPOINTMENT_STATUS.CANCELLED:
      return "Cancelled";

    default:
      return "Scheduled";
  }
}
function handleServiceChange() {
  const service = document.getElementById("f_type").value.trim();
  const durationInput = document.getElementById("f_duration");
  if (durationInput) {
    if (SERVICE_DURATIONS[service]) {
      durationInput.value = SERVICE_DURATIONS[service];
    }
    durationInput.disabled = true;
  }
  updateAvailableTimeSlots();
  checkCurrentFormConflict();
}
function getServiceMatches(query) {
  const allServices = Object.keys(SERVICE_DURATIONS);
  const trimmed = (query || "").trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_SERVICE_SUGGESTIONS.filter((name) =>
      allServices.includes(name),
    );
  }
  return allServices.filter((name) => name.toLowerCase().includes(trimmed));
}
function renderServiceDropdown(query) {
  const dropdown = document.getElementById("serviceDropdown");
  if (!dropdown) return;
  const matches = getServiceMatches(query);
  dropdown.innerHTML = "";
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "service-dropdown-empty";
    empty.textContent =
      "No matching service. You can keep this as a custom service name.";
    dropdown.appendChild(empty);
    return;
  }
  matches.forEach((name) => {
    const item = document.createElement("div");
    item.className = "service-dropdown-item";
    item.innerHTML = `<span class="service-dropdown-name">${escapeHtml(name)}</span><span class="service-dropdown-duration">${SERVICE_DURATIONS[name]} min</span>`;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      selectServiceOption(name);
    });
    dropdown.appendChild(item);
  });
}
function openServiceDropdown() {
  const wrapper = document.getElementById("serviceSelectWrapper");
  const input = document.getElementById("f_type");
  if (!wrapper || !input || input.disabled) {
    return;
  }
  renderServiceDropdown(input.value);
  wrapper.classList.add("open");
}
function closeServiceDropdown() {
  const wrapper = document.getElementById("serviceSelectWrapper");
  if (!wrapper) return;
  wrapper.classList.remove("open");
}
function selectServiceOption(name) {
  const input = document.getElementById("f_type");
  if (!input) return;
  input.value = name;
  closeServiceDropdown();
  handleServiceChange();
  input.focus();
}
function handleModalDateChange() {
  const date = document.getElementById("f_date").value;
  const pastNotice = document.getElementById("pastRecordNotice");
  if (
    ["new", "edit", "reschedule"].includes(modalMode) &&
    date &&
    isPastDate(date)
  ) {
    pastNotice.classList.add("show");
  } else {
    pastNotice.classList.remove("show");
  }
  updateAvailableTimeSlots();
  checkCurrentFormConflict();
}
function getCurrentFormTime() {
  return document.getElementById("f_time")?.value || "";
}
function formatSlotLabel(time) {
  return fmtTime(time);
}
function getAvailableTimeSlots(date, dentist, duration) {
  const clinicStart = FIRST_BOOKABLE_HOUR * 60;
  const clinicEnd = END_HOUR * 60;
  const slots = [];
  for (let minutes = clinicStart; minutes <= clinicEnd; minutes += SLOT_MIN) {
    slots.push(minutesToTime(minutes));
  }
  return slots;
}
function getScheduledTimeConflict(date, time, dentist, duration) {
  return findDentistConflict(date, time, duration, dentist, null);
}
function classifyTimePeriod(minutes) {
  if (minutes < 12 * 60) return "Morning";
  if (minutes < 18 * 60) return "Afternoon";
  return "Evening";
}
function renderTimePicker(slots, currentValue, date, dentist, duration) {
  const dropdown = document.getElementById("f_time_dropdown");
  if (!dropdown) return;
  dropdown.innerHTML = "";
  const groups = { Morning: [], Afternoon: [], Evening: [] };
  slots.forEach((slot) => {
    groups[classifyTimePeriod(timeToMinutes(slot))].push(slot);
  });
  let availableCount = 0;
  Object.keys(groups).forEach((period) => {
    if (!groups[period].length) return;
    const label = document.createElement("div");
    label.className = "time-picker-group-label";
    label.textContent = period;
    dropdown.appendChild(label);
    const grid = document.createElement("div");
    grid.className = "time-picker-grid";
    groups[period].forEach((slot) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "time-picker-option";
      btn.dataset.value = slot;
      const conflict = getScheduledTimeConflict(date, slot, dentist, duration);
      const isScheduled = !!conflict;
      const isPast =
        isToday(date) && timeToMinutes(slot) <= getCurrentTimeMinutes();
      if (slot === currentValue) {
        btn.classList.add("selected");
      }
      if (isScheduled) {
        btn.classList.add("scheduled");
        btn.disabled = true;
        btn.title = "This time is already scheduled.";
        btn.setAttribute(
          "aria-label",
          `${formatSlotLabel(slot)}. This time is already scheduled.`,
        );
        btn.innerHTML = `<i class="fa-solid fa-ban time-unavailable-icon" aria-hidden="true"></i><span>${formatSlotLabel(slot)}</span>`;
      } else if (isPast) {
        btn.classList.add("disabled");
        btn.disabled = true;
        btn.title = "This time has already passed.";
        btn.setAttribute(
          "aria-label",
          `${formatSlotLabel(slot)}. This time has already passed.`,
        );
        btn.innerHTML = `<i class="fa-solid fa-clock time-past-icon" aria-hidden="true"></i><span>${formatSlotLabel(slot)}</span>`;
      } else {
        availableCount += 1;
        btn.textContent = formatSlotLabel(slot);
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          selectTimeOption(slot);
        });
      }
      grid.appendChild(btn);
    });
    dropdown.appendChild(grid);
  });
  if (
    !availableCount &&
    !dropdown.querySelector(".time-picker-option.selected")
  ) {
    const empty = document.createElement("div");
    empty.className = "time-picker-empty";
    empty.textContent = "No available times";
    dropdown.appendChild(empty);
  }
}
function forceTimeSelection(time) {
  const timeInput = document.getElementById("f_time");
  const triggerLabel = document.getElementById("f_time_trigger_label");
  if (!timeInput || !time) return;
  timeInput.value = time;
  if (triggerLabel) {
    triggerLabel.textContent = formatSlotLabel(time);
  }
}
function selectTimeOption(value) {
  const timeInput = document.getElementById("f_time");
  const triggerLabel = document.getElementById("f_time_trigger_label");
  if (!timeInput) return;
  timeInput.value = value;
  if (triggerLabel) {
    triggerLabel.textContent = value
      ? formatSlotLabel(value)
      : "Select an available time";
  }
  closeTimePicker();
  checkCurrentFormConflict();
  updateAvailableTimeSummary(
    [],
    getCurrentFormTime(),
    Number(document.getElementById("f_duration")?.value) || SLOT_MIN,
  );
}
function openTimePicker() {
  const trigger = document.getElementById("f_time_trigger");
  const dropdown = document.getElementById("f_time_dropdown");
  if (!trigger || !dropdown || trigger.disabled) {
    return;
  }
  dropdown.classList.add("open");
  trigger.classList.add("open");
}
function closeTimePicker() {
  const trigger = document.getElementById("f_time_trigger");
  const dropdown = document.getElementById("f_time_dropdown");
  if (!dropdown) return;
  dropdown.classList.remove("open");
  trigger?.classList.remove("open");
}
function toggleTimePicker() {
  const dropdown = document.getElementById("f_time_dropdown");
  if (!dropdown) return;
  if (dropdown.classList.contains("open")) {
    closeTimePicker();
  } else {
    openTimePicker();
  }
}
function updateAvailableTimeSlots(preferredTime = null) {
  const timeInput = document.getElementById("f_time");
  const trigger = document.getElementById("f_time_trigger");
  const triggerLabel = document.getElementById("f_time_trigger_label");
  const date = document.getElementById("f_date")?.value || "";
  const dentist = document.getElementById("f_dentist")?.value || "";
  const duration =
    Number(document.getElementById("f_duration")?.value) || SLOT_MIN;
  if (!timeInput || !date || !dentist) {
    return;
  }
  const currentValue = preferredTime || timeInput.value || "";
  if (isPastDate(date) && modalMode === "view") {
    timeInput.value = currentValue || "";
    if (triggerLabel) {
      triggerLabel.textContent = currentValue
        ? formatSlotLabel(currentValue)
        : "Historical time";
    }
    if (trigger) trigger.disabled = true;
    closeTimePicker();
    return;
  }
  if (isPastDate(date)) {
    return;
  }
  if (trigger) trigger.disabled = false;
  const slots = getAvailableTimeSlots(date, dentist, duration);
  renderTimePicker(slots, currentValue, date, dentist, duration);
  const validCurrent = currentValue && slots.includes(currentValue);
  if (validCurrent) {
    timeInput.value = currentValue;
    if (triggerLabel) {
      triggerLabel.textContent = formatSlotLabel(currentValue);
    }
  } else {
    const firstAvailable = slots.find((slot) => {
      const isPast =
        isToday(date) && timeToMinutes(slot) <= getCurrentTimeMinutes();
      const conflict = getScheduledTimeConflict(date, slot, dentist, duration);
      return !isPast && !conflict;
    });
    timeInput.value = firstAvailable || "";
    if (triggerLabel) {
      triggerLabel.textContent = firstAvailable
        ? formatSlotLabel(firstAvailable)
        : "No available times";
    }
  }
  updateAvailableTimeSummary(
    slots.filter((slot) => {
      const isPast =
        isToday(date) && timeToMinutes(slot) <= getCurrentTimeMinutes();
      const conflict = getScheduledTimeConflict(date, slot, dentist, duration);
      return !isPast && !conflict;
    }),
    getCurrentFormTime(),
    duration,
  );
}
function updateAvailableTimeSummary(slots, selectedTime = "", duration = null) {
  const summary = document.getElementById("availableTimeSummary");
  if (!summary) return;
  const safeDuration = Number(duration) > 0 ? Number(duration) : SLOT_MIN;
  const actualTime = selectedTime || getCurrentFormTime();
  if (actualTime) {
    const endTime = minutesToTime(timeToMinutes(actualTime) + safeDuration);
    summary.textContent = `Appointment time: ${fmtTime(actualTime)} – ${fmtTime(endTime)} · Predicted duration: ${safeDuration} minutes.`;
    summary.classList.remove("warning");
    return;
  }
  if (!slots.length) {
    summary.textContent =
      "No available slots for this dentist, date, and duration.";
    summary.classList.add("warning");
    return;
  }
  summary.textContent = `${slots.length} available start time${slots.length !== 1 ? "s" : ""} based on dentist availability, duration, clinic hours, and existing appointments.`;
  summary.classList.remove("warning");
}
function handleTimeSelectionChange() {
  checkCurrentFormConflict();
  updateAvailableTimeSummary(
    [],
    getCurrentFormTime(),
    Number(document.getElementById("f_duration")?.value) || SLOT_MIN,
  );
}
async function openNewModal(date = null, time = null) {
  loadPatients();
  await hydratePatientsFromDatabase();
  removeAppointmentsForDeletedPatients();
  refreshPatientSelector();
  modalMode = "new";
  editingId = null;
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalSubtitle = document.getElementById("modalSubtitle");
  const saveBtn = document.getElementById("saveBtn");
  const requestRescheduleBtn = document.getElementById("requestRescheduleBtn");
  const viewRescheduleRequestBtn = document.getElementById(
    "viewRescheduleRequestBtn",
  );
  const viewNotice = document.getElementById("viewOnlyNotice");
  const pastNotice = document.getElementById("pastRecordNotice");
  const conflictNotice = document.getElementById("scheduleConflictNotice");
  modalTitle.textContent = "New Appointment";
  modalSubtitle.textContent = "Create a new appointment";
  saveBtn.style.display = "inline-flex";
  saveBtn.textContent = "Save Appointment";
  saveBtn.disabled = false;
  requestRescheduleBtn.style.display = "none";
  if (viewRescheduleRequestBtn) {
    viewRescheduleRequestBtn.style.display = "none";
  }
  viewNotice.classList.remove("show");
  conflictNotice.classList.remove("show");
  resetFormEditable();
  const selectedKey = date || dateToKey(selectedDate);
  const patientInput = document.getElementById("f_patient");
  const dateInput = document.getElementById("f_date");
  if (isPastDate(selectedKey)) {
    selectedDate = new Date();
  }
  const typeInput = document.getElementById("f_type");
  const durationInput = document.getElementById("f_duration");
  const dentistInput = document.getElementById("f_dentist");
  patientInput.value = "";
  patientInput.dataset.patientId = "";
  dateInput.min = dateToKey(new Date());
  dateInput.value = isPastDate(selectedKey)
    ? dateToKey(new Date())
    : selectedKey;
  typeInput.value = "Consultation";
  durationInput.value = SERVICE_DURATIONS.Consultation;
  dentistInput.value = getDefaultDentistId();
  dentistInput.disabled = false;
  updateAvailableTimeSlots(time);
  if (isPastDate(selectedKey)) {
    pastNotice.classList.add("show");
    saveBtn.disabled = true;
  } else {
    pastNotice.classList.remove("show");
  }
  closeServiceDropdown();
  closePatientDropdown();
  closeTimePicker();
  overlay.classList.add("show");
  handleServiceChange();
}
function openViewModal(id) {
  const appt = appointments.find((item) => item.id === id);
  if (!appt) return;
  modalMode = "view";
  editingId = id;
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalSubtitle = document.getElementById("modalSubtitle");
  const saveBtn = document.getElementById("saveBtn");
  const requestRescheduleBtn = document.getElementById("requestRescheduleBtn");
  const viewRescheduleRequestBtn = document.getElementById(
    "viewRescheduleRequestBtn",
  );
  const viewNotice = document.getElementById("viewOnlyNotice");
  const pastNotice = document.getElementById("pastRecordNotice");
  const conflictNotice = document.getElementById("scheduleConflictNotice");
  if (!appt.patientId) {
    const matched = findPatientByName(appt.patient);
    if (matched) {
      appt.patientId = matched.id;
      appt.patient = getPatientFullName(matched);
      saveAppointmentsToDatabase();
      syncAppointmentToPatient(appt);
    }
  }
  if (appt.patientId && !findPatientById(appt.patientId)) {
    removeAppointmentsForDeletedPatients();
    renderAll();
    showToast("This appointment belongs to a deleted patient.");
    return;
  }
  refreshPatientSelector();
  modalTitle.textContent = "Appointment Details";
  modalSubtitle.textContent = `${formatDateLong(appt.date)} · ${fmtTime(appt.start)}–${fmtTime(getAppointmentEndTime(appt))}`;
  const patientInput = document.getElementById("f_patient");
  const linkedPatient = appt.patientId
    ? findPatientById(appt.patientId)
    : findPatientByName(appt.patient);
  if (patientInput) {
    if (linkedPatient) {
      patientInput.value = `${getPatientFullName(linkedPatient)} · ${linkedPatient.id}`;
      patientInput.dataset.patientId = String(linkedPatient.id);
    } else {
      patientInput.value = appt.patient || "";
      patientInput.dataset.patientId = "";
    }
  }
  document.getElementById("f_date").value = appt.date;
  document.getElementById("f_type").value = appt.type;
  document.getElementById("f_duration").value = appt.duration;
  document.getElementById("f_dentist").value = appt.dentist;
  updateAvailableTimeSlots(appt.start);
  forceTimeSelection(appt.start);
  setFormReadOnly(true);
  saveBtn.style.display = "none";
  const hasPatientAccount = patientHasAccount(linkedPatient);
  requestRescheduleBtn.style.display =
    hasPatientAccount &&
    appt.status === APPOINTMENT_STATUS.SCHEDULED &&
    !isPastDate(appt.date)
      ? "inline-flex"
      : "none";
  const pendingPatientRequest =
    getPendingPatientRescheduleRequestForAppointment(appt.id);
  const hasPendingPatientRequest = Boolean(pendingPatientRequest);
  if (viewRescheduleRequestBtn) {
    viewRescheduleRequestBtn.style.display =
      hasPatientAccount && hasPendingPatientRequest ? "inline-flex" : "none";
  }
  if (requestRescheduleBtn) {
    requestRescheduleBtn.style.display =
      hasPatientAccount &&
      appt.status === APPOINTMENT_STATUS.SCHEDULED &&
      !isPastDate(appt.date) &&
      !hasPendingPatientRequest
        ? "inline-flex"
        : "none";
  }
  viewNotice.classList.add("show");
  conflictNotice.classList.remove("show");
  if (isPastDate(appt.date)) {
    pastNotice.classList.add("show");
  } else {
    pastNotice.classList.remove("show");
  }
  closeServiceDropdown();
  closePatientDropdown();
  closeTimePicker();
  overlay.classList.add("show");
}
function prepareAppointmentEdit(id, mode) {
  const appt = appointments.find((item) => item.id === id);
  if (!appt) return;
  if (appt.status !== APPOINTMENT_STATUS.SCHEDULED || isPastDate(appt.date)) {
    showToast("Only active scheduled appointments can be changed.");
    return;
  }
  modalMode = mode;
  editingId = id;
  const overlay = document.getElementById("overlay");
  const modalTitle = document.getElementById("modalTitle");
  const modalSubtitle = document.getElementById("modalSubtitle");
  const saveBtn = document.getElementById("saveBtn");
  const requestRescheduleBtn = document.getElementById("requestRescheduleBtn");
  const viewNotice = document.getElementById("viewOnlyNotice");
  const pastNotice = document.getElementById("pastRecordNotice");
  const conflictNotice = document.getElementById("scheduleConflictNotice");
  const patientInput = document.getElementById("f_patient");
  const dateInput = document.getElementById("f_date");
  const typeInput = document.getElementById("f_type");
  const durationInput = document.getElementById("f_duration");
  const dentistInput = document.getElementById("f_dentist");
  modalTitle.textContent =
    mode === "reschedule" ? "Reschedule Appointment" : "Edit Appointment";
  modalSubtitle.textContent =
    mode === "reschedule"
      ? "Update the appointment date, dentist, or available time"
      : "Update the appointment details";
  saveBtn.textContent =
    mode === "reschedule" ? "Save Reschedule" : "Save Changes";
  saveBtn.style.display = "inline-flex";
  saveBtn.disabled = false;
  requestRescheduleBtn.style.display = "none";
  viewNotice.classList.remove("show");
  pastNotice.classList.remove("show");
  conflictNotice.classList.remove("show");
  if (appt.patientId) {
    const linkedPatient = findPatientById(appt.patientId);
    if (linkedPatient) {
      patientInput.value = `${getPatientFullName(linkedPatient)} · ${linkedPatient.id}`;
      patientInput.dataset.patientId = String(linkedPatient.id);
    }
  } else {
    patientInput.value = appt.patient || "";
    patientInput.dataset.patientId = "";
  }
  dateInput.value = appt.date;
  typeInput.value = appt.type;
  durationInput.value = appt.duration;
  dentistInput.value = appt.dentist;
  dentistInput.disabled = false;
  resetFormEditable();
  if (mode === "reschedule") {
    patientInput.disabled = true;
    typeInput.disabled = true;
    durationInput.disabled = true;
  }
  updateAvailableTimeSlots(appt.start);
  forceTimeSelection(appt.start);
  closeServiceDropdown();
  closePatientDropdown();
  closeTimePicker();
  overlay.classList.add("show");
  checkCurrentFormConflict();
}
function beginEditAppointment() {
  if (!editingId) return;
  prepareAppointmentEdit(editingId, "edit");
}
function beginRescheduleAppointment() {
  if (!editingId) return;
  openRescheduleRequestModal();
}
function setFormReadOnly(readOnly) {
  [
    "f_patient",
    "f_date",
    "f_time",
    "f_time_trigger",
    "f_type",
    "f_duration",
    "f_dentist",
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = readOnly;
    }
  });
}
function resetFormEditable() {
  setFormReadOnly(false);
  const durationInput = document.getElementById("f_duration");
  if (durationInput) {
    durationInput.disabled = true;
  }
}
function closeModal() {
  const overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.classList.remove("show");
  }
  editingId = null;
  modalMode = "new";
  resetFormEditable();
  const saveBtn = document.getElementById("saveBtn");
  if (saveBtn) {
    saveBtn.textContent = "Save Appointment";
  }
  closeServiceDropdown();
  closePatientDropdown();
  closeTimePicker();
}
function checkCurrentFormConflict() {
  if (!["new", "edit", "reschedule"].includes(modalMode)) {
    return;
  }
  const date = document.getElementById("f_date")?.value || "";
  const start = getCurrentFormTime();
  const dentist = document.getElementById("f_dentist")?.value || "";
  const duration = Number(document.getElementById("f_duration")?.value);
  const notice = document.getElementById("scheduleConflictNotice");
  const text = document.getElementById("scheduleConflictText");
  const saveBtn = document.getElementById("saveBtn");
  if (!notice || !text || !saveBtn) {
    return;
  }
  notice.classList.remove("show");
  if (!date || !start || !dentist || !duration) {
    if (!dentist) {
      saveBtn.disabled = true;
      return;
    }
    if (date && isPastDate(date)) {
      saveBtn.disabled = true;
      return;
    }
    if (date && isToday(date) && getCurrentTimeMinutes() >= END_HOUR * 60) {
      text.textContent =
        "Online appointment booking is closed for today because the clinic has already reached its closing time (5:30 PM).";
      notice.classList.add("show");
      saveBtn.disabled = true;
      return;
    }
    saveBtn.disabled = false;
    return;
  }
  if (isPastDate(date)) {
    saveBtn.disabled = true;
    return;
  }
  const startMinutes = timeToMinutes(start);
  const currentTime = getCurrentTimeMinutes();
  const clinicStart = START_HOUR * 60;
  const clinicEnd = END_HOUR * 60;
  const appointmentEnd = startMinutes + duration;
  if (isToday(date) && startMinutes <= currentTime) {
    text.textContent =
      "The selected appointment time has already passed. Please choose a future available time.";
    notice.classList.add("show");
    saveBtn.disabled = true;
    return;
  }
  if (
    startMinutes < clinicStart ||
    startMinutes > clinicEnd ||
    startMinutes % SLOT_MIN !== 0
  ) {
    text.textContent = `The selected appointment must start between ${fmtTime("10:00")} and ${fmtTime("17:30")}.`;
    notice.classList.add("show");
    saveBtn.disabled = true;
    return;
  }
  const conflict = findDentistConflict(
    date,
    start,
    duration,
    dentist,
    editingId || null,
  );
  if (conflict) {
    const dentistName =
      getDentistRecord(conflict.dentist)?.name || conflict.dentist;
    const end = getAppointmentEndTime(conflict);
    text.textContent = `${dentistName} already has an appointment from ${fmtTime(conflict.start)} to ${fmtTime(end)}.`;
    notice.classList.add("show");
    saveBtn.disabled = true;
    return;
  }
  saveBtn.disabled = false;
}
function saveAppt() {
  if (!["new", "edit", "reschedule"].includes(modalMode)) {
    return;
  }
  removeAppointmentsForDeletedPatients();
  const patientInput = document.getElementById("f_patient");
  const typedPatientName = patientInput?.value?.split(" · ")[0] || "";
  const patientId =
    patientInput?.dataset.patientId ||
    findPatientByName(typedPatientName)?.id ||
    "";
  const patient =
    (patientId &&
      (findPatientById(patientId) || findPatientByName(typedPatientName))) ||
    null;
  const date = document.getElementById("f_date").value;
  const start = getCurrentFormTime();
  const type = document.getElementById("f_type").value.trim();
  const duration = Number(document.getElementById("f_duration").value);
  const dentist = document.getElementById("f_dentist").value;
  if (!patientId || !patient) {
    showToast("Please select an existing patient.");
    return;
  }
  const patientConflict = findPatientBookingConflict(
    patientId,
    date,
    start,
    editingId || null,
  );
  if (patientConflict) {
    const conflictDate = formatDateLong(patientConflict.date);
    const conflictTime = fmtTime(patientConflict.start);
    document.getElementById("scheduleConflictText").textContent =
      `${getPatientFullName(patient)} already has an active appointment scheduled on ${conflictDate} at ${conflictTime}. Please complete or delete the current appointment before adding another one.`;
    document.getElementById("scheduleConflictNotice").classList.add("show");
    showToast("This patient already has an active appointment scheduled.");
    return;
  }
  if (!date) {
    showToast("Please select a date.");
    return;
  }
  if (!start) {
    showToast("Please select an available appointment time.");
    return;
  }
  if (!type) {
    showToast("Please select or enter a service type.");
    return;
  }
  if (!duration || duration < 5) {
    showToast("Please enter a valid duration.");
    return;
  }
  if (!getDentistRecord(dentist)) {
    showToast("Please select a valid dentist.");
    return;
  }
  if (isPastDate(date)) {
    showToast(
      "Past dates are historical records only. New or changed appointments cannot use past dates.",
    );
    return;
  }
  const startMinutes = timeToMinutes(start);
  const clinicStart = START_HOUR * 60;
  const clinicEnd = END_HOUR * 60;
  const appointmentEnd = startMinutes + duration;
  const currentTime = getCurrentTimeMinutes();
  if (isToday(date) && currentTime >= END_HOUR * 60) {
    showToast(
      "Appointment booking is closed for today. The clinic closes at 5:30 PM.",
    );
    return;
  }
  if (isToday(date) && startMinutes <= currentTime) {
    showToast(
      "That appointment time has already passed. Please select a future available time.",
    );
    return;
  }
  if (
    startMinutes < clinicStart ||
    startMinutes > clinicEnd ||
    startMinutes % SLOT_MIN !== 0
  ) {
    showToast(
      `Appointment must start between ${fmtTime("10:00")} and ${fmtTime("17:30")}.`,
    );
    return;
  }
  const conflict = findDentistConflict(
    date,
    start,
    duration,
    dentist,
    editingId || null,
  );
  if (conflict) {
    const conflictEnd = getAppointmentEndTime(conflict);
    const dentistName =
      getDentistRecord(conflict.dentist)?.name || conflict.dentist;
    document.getElementById("scheduleConflictText").textContent =
      `${dentistName} is already occupied from ${fmtTime(conflict.start)} to ${fmtTime(conflictEnd)}.`;
    document.getElementById("scheduleConflictNotice").classList.add("show");
    showToast("Cannot save. The dentist is already occupied during this time.");
    return;
  }
  if (modalMode === "new") {
    const newAppointment = {
      id: `appt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      appointmentId: null,
      patientId: patient.id,
      patient_id: patient.id,
      patient: getPatientFullName(patient),
      date,
      appointmentDate: date,
      start,
      time: start,
      appointmentTime: start,
      type,
      service: type,
      serviceType: type,
      dentist,
      dentistId: dentist,
      duration,
      status: APPOINTMENT_STATUS.SCHEDULED,
      checkedIn: false,
      checkedInAt: null,
      consultationStarted: false,
      manualReadyComplete: false,
      paymentStatus: "unpaid",
      paymentAmount: 0,
    };
    newAppointment.appointmentId = newAppointment.id;
    appointments.push(newAppointment);
    saveAppointmentsToDatabase();
    syncAppointmentToPatient(newAppointment);
    closeModal();
    selectedDate = keyToDate(date);
    currentCalendarDate = new Date(selectedDate);
    renderAll();
    showToast(
      `Appointment saved for ${getPatientFullName(patient)}: ${fmtTime(start)}–${fmtTime(getAppointmentEndTime(newAppointment))}`,
    );
    return;
  }
  const existing = appointments.find((item) => item.id === editingId);
  if (!existing) {
    showToast("The appointment could not be found.");
    return;
  }
  const saveMode = modalMode;
  const oldDate = existing.date;
  const oldStart = existing.start;
  const oldDentist = existing.dentist;
  const oldPatient = existing.patient;
  existing.patientId = patient.id;
  existing.patient_id = patient.id;
  existing.patient = getPatientFullName(patient);
  existing.date = date;
  existing.appointmentDate = date;
  existing.start = start;
  existing.time = start;
  existing.appointmentTime = start;
  existing.type = type;
  existing.service = type;
  existing.serviceType = type;
  existing.dentist = dentist;
  existing.dentistId = dentist;
  existing.duration = duration;
  saveAppointmentsToDatabase();
  syncAppointmentToPatient(existing);
  closeModal();
  selectedDate = keyToDate(date);
  currentCalendarDate = new Date(selectedDate);
  renderAll();
  const changedSchedule =
    oldDate !== date || oldStart !== start || oldDentist !== dentist;
  if (saveMode === "edit") {
    showToast(
      changedSchedule
        ? `${oldPatient}'s appointment was updated and rescheduled.`
        : `${oldPatient}'s appointment details were updated.`,
    );
  } else {
    showToast(
      `${oldPatient}'s appointment was rescheduled to ${formatDateLong(date)} at ${fmtTime(start)}.`,
    );
  }
}
function loadRescheduleRequests() {
  return Array.isArray(rescheduleRequests) ? rescheduleRequests : [];
}
async function saveRescheduleRequests(requests) {
  if (!Array.isArray(requests)) {
    return false;
  }
  if (!window.DentaNuevaAppointmentDatabase?.saveRescheduleRequests) {
    console.error("Reschedule request database API is unavailable.");
    return false;
  }
  try {
    await window.DentaNuevaAppointmentDatabase.saveRescheduleRequests(requests);
    rescheduleRequests = requests;
    return true;
  } catch (error) {
    console.error("Unable to save reschedule requests to database:", error);
    return false;
  }
}
async function hydrateRescheduleRequestsFromDatabase() {
  if (!window.DentaNuevaAppointmentDatabase?.loadRescheduleRequests) {
    console.error("Reschedule request database API is unavailable.");
    rescheduleRequests = [];
    renderAll();
    return;
  }
  try {
    const requests =
      await window.DentaNuevaAppointmentDatabase.loadRescheduleRequests();
    rescheduleRequests = Array.isArray(requests) ? requests : [];
    renderAll();
  } catch (error) {
    console.error("Unable to load reschedule requests from database:", error);
    rescheduleRequests = [];
    renderAll();
  }
}
function getRescheduleReasonLabel(reason) {
  const labels = {
    dentist_unavailable: "Dentist unavailable",
    other: "Other",
  };
  return labels[reason] || "Other";
}
function getDefaultRescheduleMessage(reason) {
  if (reason === "dentist_unavailable") {
    return "The dentist is unavailable on your scheduled date. Please select a new preferred appointment schedule.";
  }
  return "";
}
function openRescheduleReviewModal(requestId = null) {
  const appointment = appointments.find((item) => item.id === editingId);
  if (!appointment) {
    showToast("The appointment could not be found.");
    return;
  }
  const request =
    (requestId
      ? loadRescheduleRequests().find(
          (item) => String(getRescheduleRequestId(item)) === String(requestId),
        )
      : getPendingPatientRescheduleRequestForAppointment(appointment.id)) ||
    null;
  if (!request || getRescheduleStatus(request) !== "pending") {
    showToast("No pending patient reschedule request was found.");
    const button = document.getElementById("viewRescheduleRequestBtn");
    if (button) button.style.display = "none";
    return;
  }
  rescheduleReviewRequestId = getRescheduleRequestId(request);
  const patient = appointment.patient || request.patientName || "Patient";
  const service = appointment.type || request.service || "Dental Appointment";
  const dentist =
    getDentistRecord(appointment.dentist)?.name ||
    appointment.dentist ||
    request.currentDentistName ||
    "Assigned Dentist";
  const currentDate = appointment.date || request.currentDate || "";
  const currentTime = appointment.start || request.currentTime || "";
  const requestedDate = request.preferred_date || request.preferredDate || "";
  const requestedTime = request.preferred_time || request.preferredTime || "";
  const reason =
    request.reasonLabel || getRescheduleReasonLabel(request.reason);
  const message = request.message || "No message provided.";
  document.getElementById("reviewRequestInitials").textContent =
    getInitials(patient);
  document.getElementById("reviewRequestPatient").textContent = patient;
  document.getElementById("reviewRequestService").textContent = service;
  document.getElementById("reviewRequestCurrentSchedule").textContent =
    currentDate && currentTime
      ? `${formatDateLong(currentDate)} · ${fmtTime(currentTime)}–${fmtTime(getAppointmentEndTime(appointment))}`
      : "—";
  document.getElementById("reviewRequestRequestedSchedule").textContent =
    requestedDate && requestedTime
      ? `${formatDateLong(requestedDate)} · ${fmtTime(requestedTime)}`
      : "—";
  document.getElementById("reviewRequestReason").textContent = reason;
  document.getElementById("reviewRequestDentist").textContent = dentist;
  document.getElementById("reviewRequestMessage").textContent = message;
  document.getElementById("rescheduleReviewOverlay").classList.add("show");
}
function closeRescheduleReviewModal() {
  document.getElementById("rescheduleReviewOverlay")?.classList.remove("show");
  rescheduleReviewRequestId = null;
}
function openRescheduleDecisionConfirmation(action) {
  if (!rescheduleReviewRequestId) {
    showToast("No reschedule request is selected.");
    return;
  }
  const request = loadRescheduleRequests().find(
    (item) =>
      String(getRescheduleRequestId(item)) ===
        String(rescheduleReviewRequestId) &&
      getRescheduleStatus(item) === "pending",
  );
  if (!request) {
    closeRescheduleReviewModal();
    showToast("The reschedule request is no longer pending.");
    return;
  }
  const appointment = appointments.find(
    (item) => String(item.id) === String(getRescheduleAppointmentId(request)),
  );
  if (!appointment) {
    showToast("The appointment could not be found.");
    return;
  }
  rescheduleDecisionRequestId = getRescheduleRequestId(request);
  openStatusConfirmation(
    appointment.id,
    action === "approve" ? "approveReschedule" : "rejectReschedule",
  );
}
function openRescheduleRequestModal() {
  const appointment = appointments.find((item) => item.id === editingId);
  if (!appointment) {
    showToast("The appointment could not be found.");
    return;
  }
  if (
    appointment.status !== APPOINTMENT_STATUS.SCHEDULED ||
    isPastDate(appointment.date)
  ) {
    showToast("Only active scheduled appointments can request a reschedule.");
    return;
  }
  const patient = appointment.patientId
    ? findPatientById(appointment.patientId)
    : findPatientByName(appointment.patient);
  if (!patient) {
    showToast("The patient record could not be found.");
    return;
  }
  rescheduleRequestTargetId = appointment.id;
  const patientLabel = document.getElementById("rescheduleRequestPatient");
  const scheduleLabel = document.getElementById("rescheduleRequestSchedule");
  const dentistLabel = document.getElementById("rescheduleRequestDentist");
  const reasonInput = document.getElementById("rescheduleReason");
  const messageInput = document.getElementById("rescheduleMessage");
  const overlay = document.getElementById("rescheduleRequestOverlay");
  const existingRequest = loadRescheduleRequests().find(
    (request) =>
      String(request.appointmentId) === String(appointment.id) &&
      request.status === "pending",
  );
  if (patientLabel) {
    patientLabel.textContent = getPatientFullName(patient);
  }
  if (scheduleLabel) {
    scheduleLabel.textContent = `${formatDateLong(appointment.date)} · ${fmtTime(appointment.start)}–${fmtTime(getAppointmentEndTime(appointment))}`;
  }
  if (dentistLabel) {
    dentistLabel.textContent =
      getDentistRecord(appointment.dentist)?.name || appointment.dentist;
  }
  if (reasonInput) {
    reasonInput.value = existingRequest?.reason || "dentist_unavailable";
  }
  if (messageInput) {
    if (reasonInput?.value === "dentist_unavailable") {
      messageInput.value =
        existingRequest?.message ||
        getDefaultRescheduleMessage("dentist_unavailable");
    } else {
      messageInput.value = "";
    }
  }
  const sendButton = document.getElementById("sendRescheduleRequestBtn");
  if (sendButton) {
    sendButton.innerHTML = existingRequest
      ? '<i class="fa-solid fa-paper-plane"></i> Send'
      : '<i class="fa-solid fa-paper-plane"></i> Send Request';
  }
  overlay?.classList.add("show");
}
function closeRescheduleRequestModal() {
  const overlay = document.getElementById("rescheduleRequestOverlay");
  overlay?.classList.remove("show");
  rescheduleRequestTargetId = null;
}
async function submitRescheduleRequest() {
  if (!rescheduleRequestTargetId) {
    return;
  }
  const appointment = appointments.find(
    (item) => item.id === rescheduleRequestTargetId,
  );
  if (!appointment) {
    closeRescheduleRequestModal();
    showToast("The appointment could not be found.");
    return;
  }
  if (
    appointment.status !== APPOINTMENT_STATUS.SCHEDULED ||
    isPastDate(appointment.date)
  ) {
    closeRescheduleRequestModal();
    showToast("Only active scheduled appointments can request a reschedule.");
    return;
  }
  const patient = appointment.patientId
    ? findPatientById(appointment.patientId)
    : findPatientByName(appointment.patient);
  if (!patient) {
    showToast("The patient record could not be found.");
    return;
  }
  const reasonInput = document.getElementById("rescheduleReason");
  const messageInput = document.getElementById("rescheduleMessage");
  const reason = reasonInput?.value || "";
  let message = messageInput?.value.trim() || "";
  if (!reason) {
    showToast("Please select a reschedule reason.");
    reasonInput?.focus();
    return;
  }
  if (reason === "dentist_unavailable" && !message) {
    message = getDefaultRescheduleMessage(reason);
  }
  if (reason === "other" && !message) {
    showToast("Please enter a message for the patient.");
    messageInput?.focus();
    return;
  }
  const requests = loadRescheduleRequests();
  const existingIndex = requests.findIndex(
    (request) =>
      String(getRescheduleAppointmentId(request)) === String(appointment.id) &&
      getRescheduleStatus(request) === "pending",
  );
  const requestId =
    existingIndex >= 0
      ? getRescheduleRequestId(requests[existingIndex])
      : `reschedule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const requestRecord = {
    id: requestId,
    request_id: requestId,
    appointmentId: appointment.id,
    appointment_id: appointment.id,
    patientId: patient.id,
    patient_id: patient.id,
    patientName: getPatientFullName(patient),
    currentDate: appointment.date,
    currentTime: appointment.start,
    currentEndTime: getAppointmentEndTime(appointment),
    currentDentist: appointment.dentist,
    currentDentistName:
      getDentistRecord(appointment.dentist)?.name || appointment.dentist,
    service: appointment.type,
    reason,
    reasonLabel: getRescheduleReasonLabel(reason),
    message,
    status: "pending",
    createdAt:
      existingIndex >= 0
        ? requests[existingIndex].createdAt
        : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (existingIndex >= 0) {
    requests[existingIndex] = requestRecord;
  } else {
    requests.push(requestRecord);
  }
  const saved = await saveRescheduleRequests(requests);
  if (!saved) {
    showToast("Unable to send the reschedule request. Please try again.");
    return;
  }
  appointment.rescheduleRequest = {
    id: requestRecord.id,
    status: "pending",
    reason: requestRecord.reason,
    reasonLabel: requestRecord.reasonLabel,
    message: requestRecord.message,
    createdAt: requestRecord.createdAt,
    updatedAt: requestRecord.updatedAt,
  };
  saveAppointmentsToDatabase();
  syncAppointmentToPatient(appointment);
  closeRescheduleRequestModal();
  closeModal();
  renderAll();
  showToast(`Reschedule request sent to ${getPatientFullName(patient)}.`);
}
function getRescheduleRequestId(request) {
  return request?.request_id || request?.id || "";
}
function getRescheduleAppointmentId(request) {
  return request?.appointment_id || request?.appointmentId || "";
}
function getRescheduleStatus(request) {
  return String(request?.status || "")
    .trim()
    .toLowerCase();
}
function getRescheduleRequestId(request) {
  return request?.request_id || request?.id || "";
}
function getRescheduleAppointmentId(request) {
  return request?.appointment_id || request?.appointmentId || "";
}
function getRescheduleStatus(request) {
  return String(request?.status || "")
    .trim()
    .toLowerCase();
}
function getPendingRescheduleRequests() {
  return loadRescheduleRequests().filter(
    (request) => getRescheduleStatus(request) === "pending",
  );
}
function getPendingPatientRescheduleRequestForAppointment(appointmentId) {
  return (
    loadRescheduleRequests().find(
      (request) =>
        String(getRescheduleAppointmentId(request)) === String(appointmentId) &&
        getRescheduleStatus(request) === "pending" &&
        request?.request_id &&
        request?.patient_id,
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
  return getApprovedRescheduleCountForAppointment(appointment?.id || "");
}
function hasReachedAppointmentRescheduleLimit(appointment) {
  return getAppointmentRescheduleCount(appointment) >= 2;
}
function renderRescheduleRequests() {
  const list = document.getElementById("rescheduleRequestList");
  const count = document.getElementById("rescheduleRequestCount");
  if (!list) return;
  const requests = getPendingRescheduleRequests();
  if (count) {
    count.textContent = requests.length;
    count.style.display = requests.length ? "inline-flex" : "none";
  }
  list.innerHTML = "";
  if (!requests.length) {
    const empty = document.createElement("div");
    empty.className = "reschedule-request-empty";
    empty.innerHTML = `<i class="fa-regular fa-calendar-check"></i><strong>No pending reschedule requests</strong><span>Patient schedule change requests will appear here.</span>`;
    list.appendChild(empty);
    return;
  }
  requests.forEach((request) => {
    const appointmentId = getRescheduleAppointmentId(request);
    const appointment = appointments.find(
      (appt) => String(appt.id) === String(appointmentId),
    );
    const patient = appointment
      ? appointment.patient
      : request.patientName || request.patient_id || "Patient";
    const service =
      appointment?.type || request.service || "Dental Appointment";
    const dentist = appointment
      ? getDentistRecord(appointment.dentist)?.name || appointment.dentist
      : request.currentDentistName || "Assigned Dentist";
    const currentDate = appointment?.date || request.currentDate || "";
    const currentTime = appointment?.start || request.currentTime || "";
    const preferredDate = request.preferred_date || request.preferredDate || "";
    const preferredTime = request.preferred_time || request.preferredTime || "";
    const reason = request.reason || "Reschedule request";
    const message = request.message || "";
    const requestId = getRescheduleRequestId(request);
    const currentRescheduleCount = getAppointmentRescheduleCount(appointment);
    const card = document.createElement("div");
    card.className = "reschedule-request-card";
    card.innerHTML = `
            <div class="reschedule-request-card-header">
              <div class="reschedule-request-avatar">${escapeHtml(getInitials(patient))}</div>
              <div class="reschedule-request-patient">
                <strong>${escapeHtml(patient)}</strong>
                <span>${escapeHtml(service)}</span>
              </div>
              <span class="reschedule-request-status">Pending</span>
            </div>
            <div class="reschedule-request-schedule">
              <div>
                <span>Current Schedule</span>
                <strong>${escapeHtml(formatDateLong(currentDate))} · ${escapeHtml(fmtTime(currentTime))}</strong>
              </div>
              <i class="fa-solid fa-arrow-right"></i>
              <div>
                <span>Requested Schedule</span>
                <strong>${escapeHtml(formatDateLong(preferredDate))} · ${escapeHtml(fmtTime(preferredTime))}</strong>
              </div>
            </div>
            <div class="reschedule-request-meta">
              <span><strong>Reason:</strong> ${escapeHtml(reason)}</span>
              <span><strong>Dentist:</strong> ${escapeHtml(dentist)}</span>
              <span><strong>Approved Reschedules:</strong> ${currentRescheduleCount}/2</span>
            </div>
            ${message ? `<div class="reschedule-request-message"><span>Message from Patient</span><p>${escapeHtml(message)}</p></div>` : ""}
            <div class="reschedule-request-actions">
              <button type="button" class="reschedule-request-reject"><i class="fa-solid fa-xmark"></i> Reject</button>
              <button type="button" class="reschedule-request-approve"><i class="fa-solid fa-check"></i> Approve</button>
            </div>
          `;
    const rejectButton = card.querySelector(".reschedule-request-reject");
    const approveButton = card.querySelector(".reschedule-request-approve");
    rejectButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      rejectRescheduleRequest(requestId);
    });
    approveButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      approveRescheduleRequest(requestId, preferredDate, preferredTime);
    });
    list.appendChild(card);
  });
}
async function approveRescheduleRequest(requestId, newDate, newTime) {
  const requests = loadRescheduleRequests();
  const requestIndex = requests.findIndex(
    (request) => String(getRescheduleRequestId(request)) === String(requestId),
  );
  if (requestIndex === -1) {
    showToast("Reschedule request could not be found.");
    return;
  }
  const request = requests[requestIndex];
  await hydrateAppointmentsFromDatabase();
  const appointment = appointments.find(
    (appt) => String(appt.id) === String(getRescheduleAppointmentId(request)),
  );
  if (!appointment) {
    showToast("The appointment could not be found.");
    return;
  }
  if (hasReachedAppointmentRescheduleLimit(appointment)) {
    showToast(
      "This appointment has already reached the maximum of 2 approved reschedules.",
    );
    return;
  }
  if (!newDate || !newTime) {
    showToast("Please select a valid date and time.");
    return;
  }
  if (isPastDate(newDate)) {
    showToast("The selected date has already passed.");
    return;
  }
  const duration = Number(appointment.duration) || SLOT_MIN;
  const startMinutes = timeToMinutes(newTime);
  const endMinutes = startMinutes + duration;
  const clinicStart = START_HOUR * 60;
  const clinicEnd = END_HOUR * 60;
  if (
    startMinutes < clinicStart ||
    endMinutes > clinicEnd ||
    startMinutes % SLOT_MIN !== 0
  ) {
    showToast("The selected time is outside clinic hours.");
    return;
  }
  const conflict = findDentistConflict(
    newDate,
    newTime,
    appointment.duration,
    appointment.dentist,
    appointment.id,
  );
  if (conflict) {
    showToast("The selected time is already occupied.");
    return;
  }
  const nextCount = getAppointmentRescheduleCount(appointment) + 1;
  appointment.date = newDate;
  appointment.appointment_date = newDate;
  appointment.appointmentDate = newDate;
  appointment.start = newTime;
  appointment.time = newTime;
  appointment.appointment_time = newTime;
  appointment.appointmentTime = newTime;
  appointment.appointment_id = appointment.id;
  appointment.appointmentId = appointment.id;
  appointment.approvedRescheduleCount = nextCount;
  appointment.rescheduleCount = nextCount;
  appointment.reschedule_count = nextCount;
  appointment.rescheduleRequest = null;
  request.status = "Approved";
  request.approved_reschedule_count = nextCount;
  request.approved_at = new Date().toISOString();
  request.approved_date = newDate;
  request.approved_time = newTime;
  request.approvedDate = newDate;
  request.approvedTime = newTime;
  request.patientAcknowledged = false;
  request.patientAcknowledgedAt = null;
  request.patient_response_at =
    request.patient_response_at ||
    request.updatedAt ||
    new Date().toISOString();
  requests[requestIndex] = request;
  const requestSaved = await saveRescheduleRequests(requests);
  if (!requestSaved) {
    showToast("Unable to save the reschedule request. Please try again.");
    return;
  }
  let savedAppointments;
  try {
    savedAppointments =
      await window.DentaNuevaAppointmentDatabase.reschedule(appointment);
  } catch (error) {
    console.error("Unable to save the new schedule:", error);
    showToast("Unable to save the new schedule. Please try again.");
    return;
  }
  if (Array.isArray(savedAppointments)) {
    appointments = savedAppointments.map(normalizeAppointment);
  }
  syncAppointmentToPatient(appointment);
  closeRescheduleReviewModal();
  renderAll();
  showToast(`${appointment.patient}'s reschedule request was approved.`);
}
function rejectRescheduleRequest(requestId) {
  const requests = loadRescheduleRequests();
  const requestIndex = requests.findIndex(
    (request) => String(getRescheduleRequestId(request)) === String(requestId),
  );
  if (requestIndex === -1) {
    showToast("Reschedule request could not be found.");
    return;
  }
  requests[requestIndex].status = "Rejected";
  requests[requestIndex].rejected_at = new Date().toISOString();
  saveRescheduleRequests(requests);
  closeRescheduleReviewModal();
  renderAll();
  showToast("Reschedule request was rejected.");
}
function deleteAppt() {
  if (!editingId) return;
  const appt = appointments.find((item) => item.id === editingId);
  if (!appt) return;
  deleteTargetId = appt.id;
  document.getElementById("deleteConfirmMessage").textContent =
    `Are you sure you want to delete ${appt.patient}'s appointment on ${formatDateLong(appt.date)} at ${fmtTime(appt.start)}? This action cannot be undone.`;
  document.getElementById("deleteConfirmOverlay").classList.add("show");
}
function closeDeleteConfirmation() {
  deleteTargetId = null;
  document.getElementById("deleteConfirmOverlay").classList.remove("show");
}
function confirmDeleteAppt() {
  if (!deleteTargetId) {
    return;
  }
  const target = appointments.find((item) => item.id === deleteTargetId);
  if (!target) {
    closeDeleteConfirmation();
    return;
  }
  removeAppointmentFromPatient(target);
  const requests = loadRescheduleRequests().filter(
    (request) =>
      String(getRescheduleAppointmentId(request)) !== String(deleteTargetId),
  );
  saveRescheduleRequests(requests);
  appointments = appointments.filter((item) => item.id !== deleteTargetId);
  saveAppointmentsToDatabase();
  void window.DentaNuevaAppointmentDatabase?.remove(deleteTargetId).catch(
    (error) => {
      console.error("Unable to delete appointment from database:", error);
    },
  );
  synchronizeAllPatientAppointments();
  closeDeleteConfirmation();
  closeModal();
  renderAll();
  showToast(`${target.patient}'s appointment was deleted.`);
}
function checkInAppointment(id) {
  const appt = appointments.find((item) => item.id === id);
  if (!appt) return;
  if (appt.status !== APPOINTMENT_STATUS.SCHEDULED || !isToday(appt.date)) {
    showToast("Check In is available only on the appointment date.");
    return;
  }
  if (getCurrentTimeMinutes() >= getAppointmentEnd(appt)) {
    showToast("This appointment has ended and can no longer be checked in.");
    return;
  }
  appt.status = APPOINTMENT_STATUS.IN_CONSULTATION;
  appt.checkedIn = true;
  appt.checkedInAt = new Date().toISOString();
  appt.consultationStarted = true;
  appt.manualReadyComplete = false;
  saveAppointmentsToDatabase();
  syncAppointmentToPatient(appt);
  renderAll();
  showToast(
    `${appt.patient} has been checked in and the consultation has started.`,
  );
}
function startConsultation(id) {
  const appt = appointments.find((item) => item.id === id);
  if (!appt || appt.status !== APPOINTMENT_STATUS.IN_CONSULTATION) {
    return;
  }
  appt.checkedIn = true;
  appt.consultationStarted = true;
  saveAppointmentsToDatabase();
  syncAppointmentToPatient(appt);
  renderAll();
  showToast(`${appt.patient}'s consultation has started.`);
}
function recordPaymentForAppointment(id) {
  const appt = appointments.find((item) => String(item.id) === String(id));
  if (!appt || appt.status !== APPOINTMENT_STATUS.COMPLETED) {
    return;
  }

  const databaseAppointmentId = Number(
    appt.databaseAppointmentId ??
      appt.database_appointment_id ??
      appt.appointment_id ??
      0,
  );

  if (!databaseAppointmentId) {
    showToast("Unable to link this payment to the appointment.");
    return;
  }

  const dentist = getDentistRecord(appt.dentist) || {
    name: "Unassigned",
  };

  const pendingPayment = {
    source: "appointment",
    appointmentId: databaseAppointmentId,
    appointmentUid:
      appt.appointmentUid || appt.appointment_uid || appt.id || "",
    patientId: appt.patientId || appt.patient_id || "",
    patientName: appt.patient || appt.patientName || "",
    dentistId: appt.dentist || appt.dentistId || appt.dentist_id || "",
    dentistName:
      dentist.name ||
      appt.dentistName ||
      appt.dentist_name ||
      appt.dentist ||
      "Unassigned",
    service:
      appt.type || appt.service || appt.serviceType || appt.service_type || "",
    appointmentDate:
      appt.date || appt.appointmentDate || appt.appointment_date || "",
    appointmentTime:
      appt.start ||
      appt.time ||
      appt.appointmentTime ||
      appt.appointment_time ||
      "",
    duration: Number(appt.duration) || 0,
    amount: Number(
      appt.paymentAmount || appt.totalAmount || appt.total_amount || 0,
    ),
    paymentStatus: appt.paymentStatus || "unpaid",
  };

  const params = new URLSearchParams();

  Object.entries(pendingPayment).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  window.location.href = `../finance/finance.html?${params.toString()}`;
}
function openStatusConfirmation(id, actionType) {
  const appt = appointments.find((item) => item.id === id);
  if (!appt) return;
  statusActionTargetId = id;
  statusActionType = actionType;
  const overlay = document.getElementById("statusConfirmOverlay");
  const title = document.getElementById("statusConfirmTitle");
  const message = document.getElementById("statusConfirmMessage");
  const button = document.getElementById("statusConfirmButton");
  const icon = document.getElementById("statusConfirmIcon");
  if (actionType === "finishConsultation") {
    title.textContent = "Finish Consultation?";
    message.textContent = `Are you sure you want to finish ${appt.patient}'s consultation? The appointment will be marked as Completed.`;
    button.textContent = "Yes, Finish";
    if (icon) {
      icon.innerHTML = "";
    }
  }
  if (actionType === "markNoShow") {
    title.textContent = "Mark as No Show?";
    message.textContent = `${appt.patient}'s ${fmtTime(appt.start)} appointment has not been checked in. Once marked as No Show, the Check In button will no longer be available.`;
    button.textContent = "Yes, Mark No Show";
    if (icon) {
      icon.innerHTML = "";
    }
  }
  if (actionType === "approveReschedule") {
    title.textContent = "Approve Reschedule Request?";
    message.textContent = `${appt.patient}'s appointment will be moved to the requested date and time.`;
    button.textContent = "Yes, Approve";
    if (icon) {
      icon.innerHTML = '<i class="fa-solid fa-check"></i>';
      icon.classList.remove("status-confirm-icon-warning");
    }
  }
  if (actionType === "rejectReschedule") {
    title.textContent = "Decline Reschedule Request?";
    message.textContent = `${appt.patient} will be notified that the requested schedule change was not approved.`;
    button.textContent = "Yes, Decline";
    if (icon) {
      icon.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      icon.classList.add("status-confirm-icon-warning");
    }
  }
  overlay.classList.add("show");
}
function closeStatusConfirmation() {
  statusActionTargetId = null;
  statusActionType = null;
  const icon = document.getElementById("statusConfirmIcon");
  if (icon) {
    icon.innerHTML = "";
    icon.classList.remove("status-confirm-icon-warning");
  }
  document.getElementById("statusConfirmOverlay").classList.remove("show");
}
function confirmStatusAction() {
  if (!statusActionTargetId || !statusActionType) {
    return;
  }
  const appt = appointments.find((item) => item.id === statusActionTargetId);
  if (!appt) {
    closeStatusConfirmation();
    return;
  }
  if (
    statusActionType === "approveReschedule" ||
    statusActionType === "rejectReschedule"
  ) {
    const requestId = rescheduleDecisionRequestId;
    const actionType = statusActionType;
    const request = loadRescheduleRequests().find(
      (item) =>
        String(getRescheduleRequestId(item)) === String(requestId) &&
        getRescheduleStatus(item) === "pending",
    );
    if (!request) {
      closeStatusConfirmation();
      closeRescheduleReviewModal();
      rescheduleDecisionRequestId = null;
      showToast("The reschedule request is no longer pending.");
      return;
    }
    closeStatusConfirmation();
    if (actionType === "approveReschedule") {
      const newDate = request.preferred_date || request.preferredDate || "";
      const newTime = request.preferred_time || request.preferredTime || "";
      approveRescheduleRequest(requestId, newDate, newTime);
    } else {
      rejectRescheduleRequest(requestId);
    }
    rescheduleDecisionRequestId = null;
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
    syncAppointmentToPatient(appt);
    closeStatusConfirmation();
    renderAll();
    showToast(`${appt.patient}'s consultation is now Completed.`);
    return;
  }
  if (statusActionType === "markNoShow") {
    if (appt.status !== APPOINTMENT_STATUS.SCHEDULED || !isToday(appt.date)) {
      closeStatusConfirmation();
      showToast("Mark No Show is available only on the appointment date.");
      return;
    }
    appt.status = APPOINTMENT_STATUS.NO_SHOW;
    appt.checkedIn = false;
    appt.checkedInAt = null;
    appt.consultationStarted = false;
    appt.manualReadyComplete = false;
    saveAppointmentsToDatabase();
    syncAppointmentToPatient(appt);
    closeStatusConfirmation();
    renderAll();
    showToast(`${appt.patient} has been marked as No Show.`);
  }
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

    const checkInBtn = document.createElement("button");
    checkInBtn.type = "button";
    checkInBtn.className = "appt-status-btn status-checkin";
    checkInBtn.textContent = "Check In";

    checkInBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      checkInAppointment(appt.id);
    });

    wrapper.appendChild(checkInBtn);

    if (isNoShowEligible(appt)) {
      const noShowBtn = document.createElement("button");
      noShowBtn.type = "button";
      noShowBtn.className = "appt-status-btn status-noshow";
      noShowBtn.textContent = "Mark No Show";

      noShowBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openStatusConfirmation(appt.id, "markNoShow");
      });

      wrapper.appendChild(noShowBtn);
    }

    return wrapper;
  }

  if (appt.status === APPOINTMENT_STATUS.IN_CONSULTATION) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "appt-status-btn status-consultation";
    button.textContent = "In Consultation";

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openStatusConfirmation(appt.id, "finishConsultation");
    });

    wrapper.appendChild(button);
    return wrapper;
  }

  if (appt.status === APPOINTMENT_STATUS.COMPLETED) {
    const badge = document.createElement("span");
    badge.className = "appt-status-badge completed";
    badge.textContent = "Completed";
    wrapper.appendChild(badge);

    const paymentBtn = document.createElement("button");
    paymentBtn.type = "button";
    paymentBtn.className = "appt-status-btn status-payment";

    if (String(appt.paymentStatus || "").toLowerCase() === "paid") {
      paymentBtn.textContent = "Paid";
      paymentBtn.classList.add("payment-paid");
      paymentBtn.disabled = true;
    } else {
      paymentBtn.textContent = "Record Payment";

      paymentBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        recordPaymentForAppointment(appt.id);
      });
    }

    wrapper.appendChild(paymentBtn);
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

    if (!isPastDate(appt.date)) {
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.className = "appt-status-btn status-payment";
      openButton.textContent = "Open Slot";

      openButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openNewModal(appt.date, appt.start);
      });

      wrapper.appendChild(openButton);
    }

    return wrapper;
  }

  return wrapper;
}
function updateAppointmentSideTitle() {
  const header = document.getElementById("waitingQueueHeader");
  if (!header) return;
  const title = header.querySelector("h3");
  const description = header.querySelector(".side-section-description");
  const selectedKey = dateToKey(selectedDate);
  const selected = keyToDate(selectedKey);
  const dateLabel = selected.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  if (title) {
    title.textContent = isToday(selectedKey)
      ? "Today's Appointments"
      : `${dateLabel} Appointments`;
  }
  if (description) {
    description.textContent = isToday(selectedKey)
      ? "Today's appointments and current status"
      : isPastDate(selectedKey)
        ? "Appointment history for this date"
        : "Upcoming appointments scheduled for this date";
  }
}
function renderAll() {
  updateAutomaticAppointmentStatuses();
  renderCalendar();
  renderScheduleOverview();
  renderTimeline();
  renderWaitingQueue();
  renderRescheduleRequests();
  updateAppointmentSideTitle();
}
function renderScheduleOverview() {
  const scheduled = document.getElementById("summaryScheduled");
  const inConsultation =
    document.getElementById("summaryInConsultation") ||
    document.getElementById("summaryWaiting");
  const completed = document.getElementById("summaryCompleted");
  const selectedKey = dateToKey(selectedDate);
  const dayAppointments = appointments
    .filter((appt) => appt.date === selectedKey)
    .filter((appt) => appointmentMatchesDentist(appt));
  const scheduledCount = dayAppointments.filter(
    (appt) => appt.status === APPOINTMENT_STATUS.SCHEDULED,
  ).length;
  const inConsultationCount = dayAppointments.filter(
    (appt) => appt.status === APPOINTMENT_STATUS.IN_CONSULTATION,
  ).length;
  const completedCount = dayAppointments.filter(
    (appt) => appt.status === APPOINTMENT_STATUS.COMPLETED,
  ).length;
  if (scheduled) {
    scheduled.textContent = scheduledCount;
  }
  if (inConsultation) {
    inConsultation.textContent = inConsultationCount;
    if (!document.getElementById("summaryInConsultation")) {
      const card = inConsultation.closest("div");
      const label = card
        ? Array.from(card.querySelectorAll("span,div,p")).find(
            (element) =>
              element.childElementCount === 0 &&
              element.textContent.trim() === "Waiting",
          )
        : null;
      if (label) label.textContent = "In Consultation";
    }
  }
  if (completed) {
    completed.textContent = completedCount;
  }
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
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((day) => {
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
  if (appointments.some((appt) => appt.date === key)) {
    button.classList.add("has-appt");
  }
  const hasPendingRescheduleRequest = loadRescheduleRequests().some(
    (request) => {
      if (getRescheduleStatus(request) !== "pending") {
        return false;
      }
      const appointment = appointments.find(
        (appt) =>
          String(appt.id) === String(getRescheduleAppointmentId(request)),
      );
      if (!appointment) {
        return false;
      }
      if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
        return false;
      }
      return appointment.date === key;
    },
  );
  if (hasPendingRescheduleRequest) {
    button.classList.add("has-reschedule-request");
  }
  button.textContent = date.getDate();
  button.addEventListener("click", () => {
    selectedDate = new Date(date);
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
  renderCalendar();
}
function filteredAppts() {
  const dateKey = dateToKey(selectedDate);
  const search = (document.getElementById("searchInput")?.value || "")
    .trim()
    .toLowerCase();
  return appointments
    .filter((appt) => appt.date === dateKey)
    .filter(
      (appt) =>
        appt.status !== APPOINTMENT_STATUS.CANCELLED ||
        !findDentistConflict(
          appt.date,
          appt.start,
          appt.duration,
          appt.dentist,
          appt.id,
        ),
    )
    .filter((appt) => appointmentMatchesDentist(appt))
    .filter((appt) => {
      if (!search) {
        return true;
      }
      const patient = findPatientById(appt.patientId);
      const patientName = String(
        appt.patient || (patient ? getPatientFullName(patient) : ""),
      ).toLowerCase();
      const patientId = String(
        appt.patientId || patient?.id || "",
      ).toLowerCase();
      const patientPhone = String(
        patient?.phone || patient?.contactNumber || patient?.contact || "",
      ).toLowerCase();
      const patientEmail = String(patient?.email || "").toLowerCase();
      const service = String(appt.type || appt.service || "").toLowerCase();
      const dentistName = String(
        getDentistRecord(appt.dentist)?.name || appt.dentist || "",
      ).toLowerCase();
      return [
        patientName,
        patientId,
        patientPhone,
        patientEmail,
        service,
        dentistName,
      ].some((value) => value.includes(search));
    })
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}
function renderTimeline() {
  const timeline = document.getElementById("timeline");
  const title = document.getElementById("scheduleTitle");
  const dateLabel = document.getElementById("scheduleDateLabel");
  if (!timeline) {
    return;
  }
  timeline.innerHTML = "";
  const selectedKey = dateToKey(selectedDate);
  const selectedIsToday = isToday(selectedKey);
  const selectedIsPast = isPastDate(selectedKey);
  if (title) {
    title.textContent = selectedIsToday
      ? "Today's Schedule"
      : selectedIsPast
        ? "Appointment History"
        : "Upcoming Schedule";
  }
  if (dateLabel) {
    dateLabel.textContent = formatDateLong(selectedKey);
  }
  const dayAppointments = filteredAppts();
  function adjustSchedulePanelHeight() {
    const schedulePanel = document.querySelector(".schedule-panel");
    const timeline = document.getElementById("timeline");
    if (!schedulePanel || !timeline) return;
    const availableHeight = 560;
    const requiredHeight = timeline.scrollHeight;
    schedulePanel.classList.toggle(
      "schedule-panel--expanded",
      requiredHeight > availableHeight,
    );
  }
  if (!dayAppointments.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "schedule-empty-state";
    emptyState.innerHTML = `
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
  adjustSchedulePanelHeight();
}
function getPendingRescheduleRequestForAppointment(appointmentId) {
  return (
    loadRescheduleRequests().find(
      (request) =>
        String(getRescheduleAppointmentId(request)) === String(appointmentId) &&
        getRescheduleStatus(request) === "pending",
    ) || null
  );
}
function createAppointmentCard(appt) {
  const card = document.createElement("div");
  card.className = "appt-card";
  const dentist = getDentistRecord(appt.dentist) || {
    name: "Unassigned",
    color: "#9CA3AF",
  };
  card.style.borderLeftColor = dentist.color;
  card.dataset.status = appt.status;
  const info = document.createElement("div");
  info.style.display = "flex";
  info.style.alignItems = "center";
  info.style.flex = "1";
  info.style.minWidth = "0";
  let workflowText = "";
  if (appt.status === APPOINTMENT_STATUS.IN_CONSULTATION) {
    workflowText = " · In Consultation";
  }
  const pendingRescheduleRequest = getPendingRescheduleRequestForAppointment(
    appt.id,
  );
  const preferredDate =
    pendingRescheduleRequest?.preferred_date ||
    pendingRescheduleRequest?.preferredDate ||
    "";
  const preferredTime =
    pendingRescheduleRequest?.preferred_time ||
    pendingRescheduleRequest?.preferredTime ||
    "";
  info.innerHTML = `<div class="tooth-badge" style="background:${hexToRgba(dentist.color, 0.12)};color:${dentist.color};"><i class="fa-solid fa-tooth"></i></div><div class="appt-info" style="margin-left:14px;"><div class="pname">${escapeHtml(appt.patient)}</div><div class="ptype">${escapeHtml(appt.type)} · ${escapeHtml(dentist.name)}${workflowText}</div>${pendingRescheduleRequest ? `<div class="appointment-reschedule-request"><span><i class="fa-solid fa-calendar-days"></i> Reschedule Requested</span><strong>Requested: ${escapeHtml(formatDateLong(preferredDate))} · ${escapeHtml(fmtTime(preferredTime))}</strong></div>` : ""}</div>`;
  const time = document.createElement("div");
  time.className = "appt-time-range";
  time.textContent = `${fmtTime(appt.start)} – ${fmtTime(getAppointmentEndTime(appt))}`;
  const statusArea = createAppointmentStatusButton(appt);
  card.appendChild(info);
  card.appendChild(time);
  card.appendChild(statusArea);
  card.addEventListener("click", () => openViewModal(appt.id));
  return card;
}
function renderWaitingQueue() {
  const list = document.getElementById("waitingQueueList");
  if (!list) return;
  list.innerHTML = "";
  const selectedKey = dateToKey(selectedDate);
  const selectedIsToday = isToday(selectedKey);
  const selectedIsPast = isPastDate(selectedKey);
  const search = (document.getElementById("searchInput")?.value || "")
    .trim()
    .toLowerCase();
  const selectedAppointments = appointments
    .filter((appt) => appt.date === selectedKey)
    .filter((appt) => appointmentMatchesDentist(appt))
    .filter((appt) => appt.status !== APPOINTMENT_STATUS.CANCELLED)
    .filter((appt) => {
      if (selectedIsPast) return true;
      if (selectedIsToday) {
        return appt.status !== APPOINTMENT_STATUS.COMPLETED;
      }
      return appt.status === APPOINTMENT_STATUS.SCHEDULED;
    })
    .filter((appt) => {
      if (!search) return true;
      const patient = findPatientById(appt.patientId);
      const patientName = String(
        appt.patient || (patient ? getPatientFullName(patient) : ""),
      ).toLowerCase();
      const patientId = String(
        appt.patientId || patient?.id || "",
      ).toLowerCase();
      const service = String(appt.type || appt.service || "").toLowerCase();
      return [patientName, patientId, service].some((value) =>
        value.includes(search),
      );
    })
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    .slice(0, 3);
  if (!selectedAppointments.length) {
    const empty = document.createElement("div");
    empty.className = "empty-queue";
    empty.textContent = selectedIsToday
      ? "No appointments for today."
      : selectedIsPast
        ? "No appointments recorded for this date."
        : "No scheduled appointments for this date.";
    list.appendChild(empty);
    return;
  }
  selectedAppointments.forEach((appt) => {
    const item = document.createElement("div");
    item.className = "queue-item";
    const initials = getInitials(appt.patient);
    const dentist = getDentistRecord(appt.dentist) || {
      name: "Unassigned",
      color: "#9CA3AF",
    };
    const statusText = getStatusLabel(appt.status);
    const pendingRescheduleRequest = getPendingRescheduleRequestForAppointment(
      appt.id,
    );
    const preferredDate =
      pendingRescheduleRequest?.preferred_date ||
      pendingRescheduleRequest?.preferredDate ||
      "";
    const preferredTime =
      pendingRescheduleRequest?.preferred_time ||
      pendingRescheduleRequest?.preferredTime ||
      "";
    item.innerHTML = `<div class="queue-main"><div class="queue-avatar" style="background:${hexToRgba(dentist.color, 0.12)};color:${dentist.color};">${initials}</div><div class="queue-text"><span class="queue-name">${escapeHtml(appt.patient)}</span><span class="queue-dentist">${escapeHtml(dentist.name)}</span>${pendingRescheduleRequest ? `<div class="queue-reschedule-request"><span><i class="fa-solid fa-calendar-days"></i> Reschedule Requested</span><strong>${escapeHtml(formatDateLong(preferredDate))} · ${escapeHtml(fmtTime(preferredTime))}</strong></div>` : ""}</div></div><div class="queue-type">${escapeHtml(statusText)}</div>`;
    item.addEventListener("click", () => openViewModal(appt.id));
    list.appendChild(item);
  });
}
function renderRealtimeDentistsDuty() {
  const list = document.getElementById("dentistsDutyList");
  if (!list) return;
  list.innerHTML = "";
  const selectedKey = dateToKey(selectedDate);
  const visibleDentistId = selectedDentistFilter || getDefaultDentistId();
  const dentist = getDentistRecord(visibleDentistId) || {
    name:
      visibleDentistId === ALL_DENTISTS_FILTER
        ? "All Dentists"
        : "No doctors available",
    specialty:
      visibleDentistId === ALL_DENTISTS_FILTER ? "Combined schedule" : "",
    color: visibleDentistId === ALL_DENTISTS_FILTER ? "#176B38" : "#9CA3AF",
  };
  const doctorAppointments = appointments
    .filter(
      (appt) =>
        appt.date === selectedKey &&
        appointmentMatchesDentist(appt, visibleDentistId),
    )
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let status = "Available";
  let nextTimeText = "";
  let statusClass = "status-badge-available";
  const isInactive = (appt) =>
    appt.status === APPOINTMENT_STATUS.COMPLETED ||
    appt.status === APPOINTMENT_STATUS.NO_SHOW;
  if (isToday(selectedKey)) {
    const currentAppointment = doctorAppointments.find((appt) => {
      const start = timeToMinutes(appt.start);
      const end = getAppointmentEnd(appt);
      return nowMinutes >= start && nowMinutes < end && !isInactive(appt);
    });
    if (currentAppointment) {
      status = `${getStatusLabel(currentAppointment.status)} · ${currentAppointment.patient}`;
      statusClass = "status-badge-busy";
    } else if (doctorAppointments.length) {
      const nextAppt = doctorAppointments.find(
        (appt) => timeToMinutes(appt.start) >= nowMinutes && !isInactive(appt),
      );
      if (nextAppt) {
        status = "Available";
        nextTimeText = `Next ${fmtTime(nextAppt.start)}`;
      }
    }
  } else if (!isPastDate(selectedKey) && doctorAppointments.length) {
    const activeCount = doctorAppointments.filter(
      (appt) => !isInactive(appt),
    ).length;
    status = `${activeCount} appointment${activeCount !== 1 ? "s" : ""} scheduled`;
  }
  if (isPastDate(selectedKey)) {
    status = doctorAppointments.length
      ? `${doctorAppointments.length} recorded appointment${doctorAppointments.length > 1 ? "s" : ""}`
      : "No recorded appointments";
  }
  const card = document.createElement("div");
  card.className = "doc-duty-card";
  const initials = getInitials(dentist.name.replace("Dr. ", ""));
  const nextTimeHtml = nextTimeText
    ? `<span class="doc-next-time">${escapeHtml(nextTimeText)}</span>`
    : "";
  card.innerHTML = `<div class="doc-duty-main"><div class="doc-avatar-dot" style="background:${hexToRgba(dentist.color, 0.12)};color:${dentist.color};">${initials}</div><div class="doc-duty-info"><strong>${escapeHtml(dentist.name)}</strong><span class="spec-label">${escapeHtml(dentist.specialty)}</span></div></div><div class="doc-status-col"><span class="${statusClass}">${escapeHtml(status)}</span>${nextTimeHtml}</div>`;
  list.appendChild(card);
}
function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}
document.addEventListener("click", (event) => {
  const overlay = document.getElementById("overlay");
  const deleteOverlay = document.getElementById("deleteConfirmOverlay");
  const statusOverlay = document.getElementById("statusConfirmOverlay");
  const rescheduleRequestOverlay = document.getElementById(
    "rescheduleRequestOverlay",
  );
  const serviceWrapper = document.getElementById("serviceSelectWrapper");
  const patientWrapper = document.getElementById("patientSelectWrapper");
  const timeWrapper = document.getElementById("timeFieldWrapper");
  if (event.target === overlay) {
    closeModal();
  }
  if (event.target === deleteOverlay) {
    closeDeleteConfirmation();
  }
  if (event.target === statusOverlay) {
    closeStatusConfirmation();
  }
  if (event.target === rescheduleRequestOverlay) {
    closeRescheduleRequestModal();
  }
  if (serviceWrapper && !serviceWrapper.contains(event.target)) {
    closeServiceDropdown();
  }
  if (patientWrapper && !patientWrapper.contains(event.target)) {
    closePatientDropdown();
  }
  if (timeWrapper && !timeWrapper.contains(event.target)) {
    closeTimePicker();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  const statusOverlay = document.getElementById("statusConfirmOverlay");
  const deleteOverlay = document.getElementById("deleteConfirmOverlay");
  const rescheduleRequestOverlay = document.getElementById(
    "rescheduleRequestOverlay",
  );
  if (
    rescheduleRequestOverlay &&
    rescheduleRequestOverlay.classList.contains("show")
  ) {
    closeRescheduleRequestModal();
    return;
  }
  if (statusOverlay && statusOverlay.classList.contains("show")) {
    closeStatusConfirmation();
    return;
  }
  if (deleteOverlay && deleteOverlay.classList.contains("show")) {
    closeDeleteConfirmation();
    return;
  }
  closeTimePicker();
  closeModal();
});
document.addEventListener("DOMContentLoaded", () => {
  setupPatientDatalist();
});
