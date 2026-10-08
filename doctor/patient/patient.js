"use strict";
const PATIENT_RECORD_API = "../../api/patient_records.php";
const APPOINTMENTS_API = "../../api/appointments.php";
const CLINICAL_IMAGES_API = "../../api/clinical_images";
const APPOINTMENTS_STORAGE_KEY = "appointments";
const LEGACY_APPOINTMENTS_STORAGE_KEY = "dentanueva_appointments";
let patients = [];
let doctorAppointments = [];
let currentDoctorDentistId = null;
let currentUserFromDatabase = null;
let currentPatientId = null;
let currentMedicalPatientId = null;
let currentActionPatientId = null;
let currentPatientRecord = null;
let currentMedicalStep = 1;
let appointmentRefreshInterval = null;
let patientFormValidationBound = false;
let patientSaveInProgress = false;
const $ = (id) => document.getElementById(id);
const patientTableBody = $("patientTableBody");
const patientEmptyState = $("patientEmptyState");
const patientCountLabel = $("patientCount");
const patientSearch = $("patientSearch");
const sortPatients = $("sortPatients");
const patientActionMenu = $("patientActionMenu");
document.addEventListener("DOMContentLoaded", async () => {
  await hydrateCurrentUser();
  loadPatients();
  void hydratePatientsFromDatabase();
  currentDoctorDentistId = getCurrentDoctorDentistId();
  void loadDoctorAppointments();
  bindPatientEvents();
  bindMedicalFormEvents();
  bindActionMenuEvents();
  removeMedicalFormFromActionMenu();
  setupPatientFormValidation();
  renderPatients();
  updateTotalPatientCount();
  startAppointmentRealtimeRefresh();
  openSelectedDoctorPatient();
});
async function hydratePatientsFromDatabase() {
  try {
    const response = await fetch(PATIENT_RECORD_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Patient API returned HTTP ${response.status}.`);
    }
    const result = await response.json();
    if (!result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Invalid patient data returned.");
    }
    patients = result.data.map((remotePatient) =>
      normalizePatient(remotePatient),
    );
    renderPatients();
    updateTotalPatientCount();
    openSelectedDoctorPatient();
  } catch (error) {
    console.error("Unable to load patients from database.", error);
    patients = [];
    renderPatients();
    updateTotalPatientCount();
  }
}
async function syncPatientProfileToDatabase(patient) {
  if (!patient) return null;
  try {
    const response = await fetch(PATIENT_RECORD_API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: patient.patientId || patient.id,
        patient,
        medicalForm: patient.medicalForm || null,
      }),
    });
    const result = await response.json();
    console.debug("Patient record API response:", result);
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Patient record was not saved.");
    }
    if (result.data) {
      Object.assign(patient, result.data);
    }
    return result.data || patient;
  } catch (error) {
    console.error("Unable to sync patient profile to database.", error);
    return null;
  }
}
function isStaffReadOnly() {
  const currentUser = getCurrentUser();
  return (
    String(currentUser?.role || "")
      .trim()
      .toLowerCase() === "staff"
  );
}
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
function normalizeDentistId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
function getCurrentDoctorDentistId() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    return null;
  }
  const doctorId =
    currentUser.doctorId ||
    currentUser.doctor_id ||
    currentUser.dentistId ||
    currentUser.dentist_id ||
    "";
  return doctorId ? normalizeDentistId(doctorId) : null;
}
async function loadDoctorAppointments() {
  try {
    const response = await fetch(APPOINTMENTS_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Appointments unavailable.");
    }
    doctorAppointments = result.data;
    renderPatients();
  } catch (error) {
    console.error("Unable to load doctor appointments from database.", error);
    doctorAppointments = [];
  }
}
function patientHasAppointmentWithDoctor(patient) {
  if (!patient || !currentDoctorDentistId) {
    return false;
  }
  const patientIds = [
    patient.patientId,
    patient.patientID,
    patient.patient_id,
    patient.id,
    patient.userId,
    patient.user_id,
    patient.referenceId,
    patient.recordId,
    patient.recordID,
  ]
    .filter((id) => id !== undefined && id !== null && String(id).trim())
    .map((id) => String(id).trim().toLowerCase());
  if (!patientIds.length) {
    return false;
  }
  return doctorAppointments.some((appointment) => {
    if (!appointment || typeof appointment !== "object") {
      return false;
    }
    const details =
      appointment.appointmentDetails ||
      appointment.details ||
      appointment.appointment_details ||
      {};
    const appointmentPatientId = [
      appointment.patientId,
      appointment.patientID,
      appointment.patient_id,
      appointment.patient_id_number,
      appointment.patientReferenceId,
      appointment.referenceId,
      details.patientId,
      details.patientID,
      details.patient_id,
      details.patient_id_number,
      details.patientReferenceId,
      details.referenceId,
    ].find((id) => id !== undefined && id !== null && String(id).trim());
    const appointmentDentist = [
      appointment.dentistId,
      appointment.dentistID,
      appointment.dentist_id,
      appointment.doctorId,
      appointment.doctorID,
      appointment.doctor_id,
      appointment.assignedDentistId,
      appointment.assignedDentistID,
      appointment.assignedDentist_id,
      appointment.dentist,
      appointment.dentistName,
      appointment.doctor,
      appointment.doctorName,
      appointment.assignedDentist,
      details.dentistId,
      details.dentistID,
      details.dentist_id,
      details.doctorId,
      details.doctorID,
      details.doctor_id,
      details.assignedDentistId,
      details.assignedDentistID,
      details.assignedDentist_id,
      details.dentist,
      details.dentistName,
      details.doctor,
      details.doctorName,
      details.assignedDentist,
    ].find(
      (value) => value !== undefined && value !== null && String(value).trim(),
    );
    const normalizedPatientId = appointmentPatientId
      ? String(appointmentPatientId).trim().toLowerCase()
      : "";
    const normalizedDentistId = normalizeDentistId(appointmentDentist);
    return (
      patientIds.includes(normalizedPatientId) &&
      normalizedDentistId === currentDoctorDentistId
    );
  });
}
function getDoctorPatients() {
  if (!currentDoctorDentistId) {
    return [];
  }
  return patients.filter((patient) => patientHasAppointmentWithDoctor(patient));
}
function openSelectedDoctorPatient() {
  const selectedPatientId = new URLSearchParams(window.location.search).get(
    "patient_id",
  );
  if (!selectedPatientId) {
    return;
  }
  const patient = findPatientById(selectedPatientId);
  if (!patient) {
    console.warn("Patient record not found:", selectedPatientId);
    return;
  }
  openPatientDetails(patient);
}
function startAppointmentRealtimeRefresh() {
  if (appointmentRefreshInterval) {
    clearInterval(appointmentRefreshInterval);
  }
  appointmentRefreshInterval = setInterval(() => {
    loadDoctorAppointments();
    renderPatients();
  }, 30000);
}
function removeMedicalFormFromActionMenu() {
  document
    .querySelectorAll(
      '#patientActionMenu [data-action="medicalForm"], ' +
        '#patientActionMenu button[data-action="medicalForm"], ' +
        '[data-action-menu] [data-action="medicalForm"]',
    )
    .forEach((button) => {
      button.remove();
    });
}
function setupPatientFormValidation() {
  const form = $("patientForm");
  if (!form) {
    return;
  }
  const fields = form.querySelectorAll(
    'input:not([type="hidden"]), select, textarea',
  );
  fields.forEach((field) => {
    field.required = true;
  });
  const phoneField = $("phone");
  if (phoneField) {
    phoneField.type = "tel";
    phoneField.required = true;
    phoneField.pattern = "^\\+639\\d{9}$";
    phoneField.title =
      "Please enter a valid Philippine phone number in +63 format (+639XXXXXXXXX).";
    phoneField.setAttribute("placeholder", "+639XXXXXXXXX");
  }
  const emergencyContactField = $("emergencyContact");
  if (emergencyContactField) {
    emergencyContactField.type = "tel";
    emergencyContactField.required = true;
    emergencyContactField.pattern = "^\\+639\\d{9}$";
    emergencyContactField.title =
      "Please enter a valid Philippine emergency contact number (+639XXXXXXXXX).";
    emergencyContactField.setAttribute("placeholder", "+639XXXXXXXXX");
  }
  const emailField = $("email");
  if (emailField) {
    emailField.type = "email";
    emailField.required = true;
  }
  if (patientFormValidationBound) {
    return;
  }
  patientFormValidationBound = true;
  form.addEventListener("submit", (event) => {
    if (!form.checkValidity()) {
      event.preventDefault();
      form.reportValidity();
      return;
    }
    const phoneValue = phoneField?.value.trim() || "";
    if (!/^\+639\d{9}$/.test(phoneValue)) {
      event.preventDefault();
      if (phoneField) {
        phoneField.setCustomValidity(
          "Please enter a valid Philippine phone number in +63 format (+639XXXXXXXXX).",
        );
        phoneField.reportValidity();
        phoneField.focus();
        setTimeout(() => {
          phoneField.setCustomValidity("");
        }, 100);
      }
      return;
    }
    if (phoneField) {
      phoneField.setCustomValidity("");
    }
    const emergencyContactValue = emergencyContactField?.value.trim() || "";
    if (emergencyContactValue && !/^\+639\d{9}$/.test(emergencyContactValue)) {
      event.preventDefault();
      if (emergencyContactField) {
        emergencyContactField.setCustomValidity(
          "Please enter a valid Philippine emergency contact number in +63 format (e.g. +639XXXXXXXXX).",
        );
        emergencyContactField.reportValidity();
        emergencyContactField.focus();
        setTimeout(() => {
          emergencyContactField.setCustomValidity("");
        }, 100);
      }
      return;
    }
    if (emergencyContactField) {
      emergencyContactField.setCustomValidity("");
    }
  });
}
function loadPatients() {
  patients = [];
}
function normalizePatient(patient) {
  const normalized = {
    ...patient,
  };
  if (!normalized.patientId) {
    normalized.patientId =
      normalized.id || `PN-${String(Date.now()).slice(-8)}`;
  }
  if (!normalized.id) {
    normalized.id = normalized.patientId;
  }
  if (!normalized.gender && normalized.patientGender) {
    normalized.gender = normalized.patientGender;
  }
  if (!normalized.patientGender && normalized.gender) {
    normalized.patientGender = normalized.gender;
  }
  if (!Array.isArray(normalized.appointments)) {
    normalized.appointments = [];
  }
  if (Array.isArray(normalized.treatments)) {
    normalized.treatments = normalized.treatments.map((treatment) => ({
      ...treatment,
      id: treatment.id || treatment.treatmentId || "",
      treatmentId: treatment.treatmentId || treatment.id || "",
    }));
  }
  return normalized;
}
function savePatients() {
  patients.forEach((patient) => {
    void syncPatientProfileToDatabase(patient);
  });
  updateTotalPatientCount();
}
function updateTotalPatientCount() {
  const totalPatients = patients.length;
  document.querySelectorAll("[data-total-patients]").forEach((element) => {
    element.textContent = `${totalPatients} ${
      totalPatients === 1 ? "patient" : "patients"
    }`;
  });
  const totalPatientsElement = $("totalPatients");
  if (totalPatientsElement) {
    totalPatientsElement.textContent = `${totalPatients} ${
      totalPatients === 1 ? "patient" : "patients"
    }`;
  }
  if (patientCountLabel && !patientSearch?.value?.trim()) {
    patientCountLabel.textContent = `${totalPatients} ${
      totalPatients === 1 ? "patient" : "patients"
    }`;
  }
}
function generatePatientId() {
  return `PN-${Date.now().toString().slice(-10)}`;
}
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) {
    return "";
  }
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return "";
  }
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return Math.max(age, 0);
}
function formatDate(dateString) {
  if (!dateString) {
    return "Not provided";
  }
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
function getFullName(patient) {
  return [patient.firstName, patient.lastName].filter(Boolean).join(" ").trim();
}
function getInitials(patient) {
  const firstName = String(patient.firstName || "").trim();
  const lastName = String(patient.lastName || "").trim();
  if (firstName || lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }
  const fullName = String(patient.fullName || patient.name || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }
  return parts[0]?.charAt(0).toUpperCase() || "";
}
function valueOrNone(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "Not provided";
  }
  return String(value);
}
function arrayValue(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  return [value];
}
function findPatient(patientId) {
  if (patientId === undefined || patientId === null || patientId === "") {
    return null;
  }
  return (
    patients.find(
      (patient) =>
        String(patient.id) === String(patientId) ||
        String(patient.patientId) === String(patientId),
    ) || null
  );
}
function findPatientById(patientId) {
  if (!patientId) {
    return null;
  }
  return (
    patients.find(
      (patient) =>
        String(patient.id) === String(patientId) ||
        String(patient.patientId) === String(patientId),
    ) || null
  );
}
function getSharedPatientRecord(patientId) {
  return findPatientById(patientId);
}
function findPatientByName(name) {
  if (!name) {
    return null;
  }
  const target = String(name).trim().toLowerCase();
  return (
    patients.find(
      (patient) => getFullName(patient).trim().toLowerCase() === target,
    ) || null
  );
}
function setupPatientDatalist() {
  const patientInput = document.getElementById("f_patient");
  if (!patientInput) {
    return;
  }
  let datalist = document.getElementById("appointmentPatientList");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "appointmentPatientList";
    document.body.appendChild(datalist);
  }
  patientInput.setAttribute("list", "appointmentPatientList");
  refreshPatientSelector();
}
function refreshPatientSelector() {
  const patientInput = document.getElementById("f_patient");
  if (!patientInput) {
    return;
  }
  let datalist = document.getElementById("appointmentPatientList");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "appointmentPatientList";
    document.body.appendChild(datalist);
  }
  datalist.innerHTML = "";
  patients
    .slice()
    .sort((a, b) => getFullName(a).localeCompare(getFullName(b)))
    .forEach((patient) => {
      const option = document.createElement("option");
      option.value = getFullName(patient);
      option.label = `${getFullName(patient)} · ${
        patient.patientId || patient.id
      }`;
      datalist.appendChild(option);
    });
  patientInput.setAttribute("list", "appointmentPatientList");
}
function handlePatientInputChange() {
  const patientInput = document.getElementById("f_patient");
  if (!patientInput) {
    return;
  }
  const patient = findPatientByName(patientInput.value);
  if (patient) {
    patientInput.value = getFullName(patient);
  }
}
function getCurrentFormPatient() {
  const patientInput = document.getElementById("f_patient");
  if (!patientInput) {
    return null;
  }
  const value = patientInput.value.trim();
  if (!value) {
    return null;
  }
  return findPatientByName(value);
}
function bindPatientEvents() {
  $("addPatientBtn")?.addEventListener("click", () => {
    openAddPatientModal();
  });
  $("closePatientModal")?.addEventListener("click", closePatientModal);
  $("cancelPatientBtn")?.addEventListener("click", closePatientModal);
  $("patientModalBackdrop")?.addEventListener("click", (event) => {
    if (event.target === $("patientModalBackdrop")) {
      closePatientModal();
    }
  });
  $("patientForm")?.addEventListener("submit", savePatientFromForm);
  $("backToPatientsBtn")?.addEventListener("click", closePatientRecordPage);
  $("patientPageEditBtn")?.addEventListener("click", () => {
    if (!currentPatientRecord) {
      return;
    }
    const patientId =
      currentPatientRecord.patientId || currentPatientRecord.id || "";
    if (!patientId) {
      return;
    }
    openEditPatientModal(patientId);
  });
  document.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-record-edit]");
    if (!editButton) {
      return;
    }
    const patientId = editButton.dataset.recordEdit;
    if (!patientId) {
      return;
    }
    openEditPatientModal(patientId);
  });
  patientSearch?.addEventListener("input", renderPatients);
  sortPatients?.addEventListener("change", renderPatients);
}
function openAddPatientModal() {
  currentPatientId = null;
  const form = $("patientForm");
  form?.reset();
  setupPatientFormValidation();
  $("patientId").value = "";
  $("patientModalTitle").textContent = "Add Patient";
  $("patientModalBackdrop").classList.add("open");
  $("patientModalBackdrop").setAttribute("aria-hidden", "false");
  setTimeout(() => {
    $("firstName")?.focus();
  }, 50);
}
function openEditPatientModal(patientId) {
  const patient = findPatient(patientId);
  if (!patient) {
    return;
  }
  currentPatientId = patient.id || patient.patientId;
  $("patientModalTitle").textContent = "Edit Patient";
  $("patientId").value = patient.id || patient.patientId || "";
  $("firstName").value = patient.firstName || "";
  $("lastName").value = patient.lastName || "";
  $("dateOfBirth").value = patient.dateOfBirth || "";
  $("patientGender").value = patient.gender || patient.patientGender || "";
  $("phone").value = patient.phone || "";
  $("email").value = patient.email || "";
  $("address").value = patient.address || "";
  $("emergencyName").value = patient.emergencyName || "";
  $("emergencyContact").value = patient.emergencyContact || "";
  setupPatientFormValidation();
  $("patientModalBackdrop").classList.add("open");
  $("patientModalBackdrop").setAttribute("aria-hidden", "false");
}
async function savePatientFromForm(event) {
  event.preventDefault();
  if (patientSaveInProgress) {
    return;
  }
  const form = $("patientForm");
  if (form && !form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const phoneField = $("phone");
  const phoneValue = phoneField?.value.trim() || "";
  if (!/^\+639\d{9}$/.test(phoneValue)) {
    if (phoneField) {
      phoneField.setCustomValidity(
        "Please enter a valid Philippine phone number in +63 format (e.g. +639XXXXXXXXX).",
      );
      phoneField.reportValidity();
      phoneField.focus();
      setTimeout(() => {
        phoneField.setCustomValidity("");
      }, 100);
    }
    return;
  }
  if (phoneField) {
    phoneField.setCustomValidity("");
  }
  const emergencyContactField = $("emergencyContact");
  const emergencyContactValue = emergencyContactField?.value.trim() || "";
  if (!/^\+639\d{9}$/.test(emergencyContactValue)) {
    if (emergencyContactField) {
      emergencyContactField.setCustomValidity(
        "Please enter a valid Philippine emergency contact number in +63 format (+639XXXXXXXXX).",
      );
      emergencyContactField.reportValidity();
      emergencyContactField.focus();
      setTimeout(() => {
        emergencyContactField.setCustomValidity("");
      }, 100);
    }
    return;
  }
  if (emergencyContactField) {
    emergencyContactField.setCustomValidity("");
  }
  const existingPatient = currentPatientId
    ? findPatient(currentPatientId)
    : null;
  const patientId = existingPatient?.patientId || "";
  const id = existingPatient?.id || "";
  const now = new Date().toISOString();
  const patient = {
    ...(existingPatient || {}),
    id,
    patientId,
    firstName: $("firstName").value.trim(),
    lastName: $("lastName").value.trim(),
    dateOfBirth: $("dateOfBirth").value,
    gender: $("patientGender").value,
    patientGender: $("patientGender").value,
    phone: $("phone").value.trim(),
    email: $("email").value.trim(),
    address: $("address").value.trim(),
    emergencyName: $("emergencyName").value.trim(),
    emergencyContact: $("emergencyContact").value.trim(),
    appointments: Array.isArray(existingPatient?.appointments)
      ? existingPatient.appointments
      : [],
    updatedAt: now,
  };
  patientSaveInProgress = true;
  const submitButton = form?.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
  }
  const savedPatient = await syncPatientProfileToDatabase(patient);
  patientSaveInProgress = false;
  if (submitButton) {
    submitButton.disabled = false;
  }
  if (!savedPatient) {
    alert("The patient could not be saved to the database. Please try again.");
    return;
  }
  Object.assign(patient, savedPatient);
  if (!existingPatient) {
    patient.createdAt = now;
    patients.push(normalizePatient(patient));
  } else {
    const index = patients.findIndex(
      (item) =>
        String(item.id || item.patientId) ===
        String(existingPatient.id || existingPatient.patientId),
    );
    if (index !== -1) {
      patients[index] = normalizePatient(patient);
    }
  }
  closePatientModal();
  renderPatients();
}
function closePatientModal() {
  $("patientModalBackdrop")?.classList.remove("open");
  $("patientModalBackdrop")?.setAttribute("aria-hidden", "true");
  currentPatientId = null;
}
function renderPatients() {
  if (!patientTableBody) {
    return;
  }
  let filteredPatients = [...getDoctorPatients()];
  const search = patientSearch?.value?.trim().toLowerCase() || "";
  if (search) {
    filteredPatients = filteredPatients.filter((patient) => {
      const searchable = [
        getFullName(patient),
        patient.patientId,
        patient.id,
        patient.email,
        patient.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(search);
    });
  }
  const sort = sortPatients?.value || "newest";
  filteredPatients.sort((a, b) => {
    if (sort === "nameAsc" || sort === "nameDesc") {
      const nameA = getFullName(a).toLowerCase();
      const nameB = getFullName(b).toLowerCase();
      return sort === "nameAsc"
        ? nameA.localeCompare(nameB)
        : nameB.localeCompare(nameA);
    }
    const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
    const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
    return sort === "oldest" ? dateA - dateB : dateB - dateA;
  });
  patientTableBody.innerHTML = "";
  const displayedPatientCount = filteredPatients.length;
  if (patientCountLabel) {
    patientCountLabel.textContent = `${displayedPatientCount} ${
      displayedPatientCount === 1 ? "patient" : "patients"
    }`;
  }
  if (!displayedPatientCount) {
    if (patientEmptyState) {
      patientEmptyState.hidden = false;
    }
    updateTotalPatientCount();
    return;
  }
  if (patientEmptyState) {
    patientEmptyState.hidden = true;
  }
  filteredPatients.forEach((patient) => {
    const row = document.createElement("tr");
    row.innerHTML = createPatientRow(patient);
    row.dataset.patientOpen = patient.id || patient.patientId || "";
    patientTableBody.appendChild(row);
  });
  updateTotalPatientCount();
  if (patientCountLabel) {
    patientCountLabel.textContent = `${displayedPatientCount} ${
      displayedPatientCount === 1 ? "patient" : "patients"
    }`;
  }
}
function createPatientRow(patient) {
  const name = getFullName(patient) || "Unnamed Patient";
  const patientId = patient.patientId || patient.id || "N/A";
  const age = calculateAge(patient.dateOfBirth);
  const gender = patient.gender || patient.patientGender || "Not specified";
  const medicalForm = patient.medicalForm || null;
  const hasMedicalForm = !!medicalForm;
  const medicalButtonClass = hasMedicalForm ? "completed" : "pending";
  const medicalButtonText = hasMedicalForm ? "View Form" : "Fill Form";
  const nextAppointment = getNextAppointment(patient);
  return `
    <td>
      <div class="patient-cell">
        <div class="patient-avatar">
          ${escapeHTML(
            `${String(patient.firstName || "").charAt(0)}${String(patient.lastName || "").charAt(0)}`.toUpperCase(),
          )}
        </div>
        <div class="patient-main-info">
          <p class="patient-name">
            ${escapeHTML(name)}
          </p>
          <span class="patient-id">
            ${escapeHTML(patientId)}
          </span>
        </div>
      </div>
    </td>
    <td>
      <span class="contact-primary">
        ${escapeHTML(valueOrNone(patient.phone))}
      </span>
      <span class="contact-secondary">
        ${escapeHTML(valueOrNone(patient.email))}
      </span>
    </td>
    <td>
      <span class="age-primary">
        ${escapeHTML(age === "" ? "—" : `${age} years`)}
      </span>
      <span class="age-secondary">
        ${escapeHTML(gender)}
      </span>
    </td>
    <td>
      ${renderAppointment(nextAppointment)}
    </td>
    <td>
      <button
        type="button"
        class="
          medical-form-button
          ${medicalButtonClass}
        "
        data-medical-form-id="${escapeHTML(patient.id || patient.patientId)}"
      >
        ${medicalButtonText}
      </button>
    </td>
    <td class="patient-action-cell">
      <button
        type="button"
        class="patient-action-trigger"
        data-action-trigger
        data-patient-id="${escapeHTML(patient.id || patient.patientId)}"
        aria-label="Patient actions"
      >
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
    </td>
  `;
}
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function createAppointmentDateTime(date, time) {
  if (!date) {
    return null;
  }
  const normalizedTime = time || "00:00";
  const dateTime = new Date(`${date}T${normalizedTime}`);
  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }
  return dateTime;
}
function getAppointmentStatus(appointment) {
  const status = String(
    appointment.status ||
      appointment.appointmentStatus ||
      appointment.state ||
      "",
  )
    .trim()
    .toLowerCase();
  if (status === "completed" || status === "complete") {
    return "completed";
  }
  if (status === "cancelled" || status === "canceled") {
    return "cancelled";
  }
  if (status === "no_show" || status === "no show" || status === "noshow") {
    return "no_show";
  }
  if (status === "confirmed") {
    return "confirmed";
  }
  return "pending";
}
function isAppointmentToday(appointment) {
  return appointment.date === getLocalDateString(new Date());
}
function isFutureAppointment(appointment) {
  const today = getLocalDateString(new Date());
  return appointment.date > today;
}
function isPastAppointmentDate(appointment) {
  const today = getLocalDateString(new Date());
  return appointment.date < today;
}
function getNextAppointment(patient) {
  if (!patient || !currentDoctorDentistId) {
    return null;
  }
  const patientIds = [
    patient.patientId,
    patient.patientID,
    patient.patient_id,
    patient.id,
    patient.userId,
    patient.user_id,
    patient.referenceId,
    patient.recordId,
    patient.recordID,
  ]
    .filter((id) => id !== undefined && id !== null && String(id).trim())
    .map((id) => String(id).trim().toLowerCase());
  const appointments = doctorAppointments
    .filter((appointment) => {
      if (!appointment || typeof appointment !== "object") {
        return false;
      }
      const details =
        appointment.appointmentDetails ||
        appointment.details ||
        appointment.appointment_details ||
        {};
      const appointmentPatientId = [
        appointment.patientId,
        appointment.patientID,
        appointment.patient_id,
        appointment.patient_id_number,
        appointment.patientReferenceId,
        appointment.referenceId,
        details.patientId,
        details.patientID,
        details.patient_id,
        details.patient_id_number,
        details.patientReferenceId,
        details.referenceId,
      ].find((id) => id !== undefined && id !== null && String(id).trim());
      const appointmentDentist = [
        appointment.dentistId,
        appointment.dentistID,
        appointment.dentist_id,
        appointment.doctorId,
        appointment.doctorID,
        appointment.doctor_id,
        appointment.assignedDentistId,
        appointment.assignedDentistID,
        appointment.assignedDentist_id,
        appointment.dentist,
        appointment.dentistName,
        appointment.doctor,
        appointment.doctorName,
        appointment.assignedDentist,
        details.dentistId,
        details.dentistID,
        details.dentist_id,
        details.doctorId,
        details.doctorID,
        details.doctor_id,
        details.assignedDentistId,
        details.assignedDentistID,
        details.assignedDentist_id,
        details.dentist,
        details.dentistName,
        details.doctor,
        details.doctorName,
        details.assignedDentist,
      ].find(
        (value) =>
          value !== undefined && value !== null && String(value).trim(),
      );
      const normalizedPatientId = appointmentPatientId
        ? String(appointmentPatientId).trim().toLowerCase()
        : "";
      const normalizedDentistId = normalizeDentistId(appointmentDentist);
      return (
        patientIds.includes(normalizedPatientId) &&
        normalizedDentistId === currentDoctorDentistId
      );
    })
    .map((appointment) => {
      const date =
        appointment.date ||
        appointment.appointmentDate ||
        appointment.scheduleDate ||
        appointment.appointment_date ||
        "";
      const time =
        appointment.time ||
        appointment.start ||
        appointment.appointmentTime ||
        appointment.appointment_time ||
        "00:00";
      const duration = Number(
        appointment.duration ||
          appointment.durationMinutes ||
          appointment.duration_minutes ||
          0,
      );
      const dateTime = createAppointmentDateTime(date, time);
      let endTime = time;
      let endDateTime = null;
      if (dateTime && Number.isFinite(duration) && duration > 0) {
        endDateTime = new Date(dateTime.getTime() + duration * 60 * 1000);
        endTime = `${String(endDateTime.getHours()).padStart(2, "0")}:${String(endDateTime.getMinutes()).padStart(2, "0")}`;
      }
      return {
        ...appointment,
        date,
        time,
        duration,
        endTime,
        dateTime,
        endDateTime,
        status: getAppointmentStatus(appointment),
      };
    })
    .filter((appointment) => appointment.date);
  if (!appointments.length) {
    return null;
  }
  const now = new Date();
  const today = getLocalDateString(now);
  const todaysAppointments = appointments
    .filter(
      (appointment) =>
        appointment.status !== "cancelled" && appointment.date === today,
    )
    .sort(
      (a, b) => (a.dateTime?.getTime() || 0) - (b.dateTime?.getTime() || 0),
    );
  if (todaysAppointments.length) {
    const activeToday = todaysAppointments
      .filter((appointment) => {
        if (
          appointment.status === "completed" ||
          appointment.status === "no_show"
        ) {
          return false;
        }
        if (appointment.endDateTime) {
          return appointment.endDateTime >= now;
        }
        if (appointment.dateTime) {
          return appointment.dateTime >= now;
        }
        return false;
      })
      .sort(
        (a, b) => (a.dateTime?.getTime() || 0) - (b.dateTime?.getTime() || 0),
      );
    if (activeToday.length) {
      return activeToday[0];
    }
    const completedToday = todaysAppointments
      .filter((appointment) => appointment.status === "completed")
      .sort(
        (a, b) => (b.dateTime?.getTime() || 0) - (a.dateTime?.getTime() || 0),
      );
    if (completedToday.length) {
      return completedToday[0];
    }
    return todaysAppointments[todaysAppointments.length - 1];
  }
  const futureAppointments = appointments
    .filter(
      (appointment) =>
        appointment.status !== "cancelled" && appointment.date > today,
    )
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return (a.dateTime?.getTime() || 0) - (b.dateTime?.getTime() || 0);
    });
  return futureAppointments[0] || null;
}
function formatTime12Hour(timeString) {
  if (!timeString) {
    return "";
  }
  const time = String(timeString).trim();
  if (/[APap][Mm]$/.test(time)) {
    const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (match) {
      const hour = Number(match[1]);
      const minute = match[2];
      const period = match[4].toUpperCase();
      const normalizedHour = period === "AM" && hour === 12 ? 0 : hour;
      const displayHour = normalizedHour % 12 || 12;
      return `${displayHour}:${minute} ${period}`;
    }
    return time;
  }
  const match = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return time;
  }
  let hours = Number(match[1]);
  const minutes = match[2];
  if (Number.isNaN(hours) || hours < 0 || hours > 23) {
    return time;
  }
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }
  return `${hours}:${minutes} ${period}`;
}
function renderAppointment(appointment) {
  if (!appointment) {
    return `
        <span class="appointment-none">
          No upcoming appointment
        </span>
      `;
  }
  const startTime = formatTime12Hour(appointment.time || "");
  const endTime = formatTime12Hour(
    appointment.endTime || appointment.time || "",
  );
  const timeDisplay =
    appointment.duration > 0 ? `${startTime} – ${endTime}` : startTime;
  const status = appointment.status || "pending";
  const isCompleted = status === "completed";
  const isToday = isAppointmentToday(appointment);
  const statusDisplay = `
      <div
        class="appointment-status-row"
        style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:6px;"
      >
        ${
          isToday
            ? `
              <div
                class="appointment-status appointment-status-today"
                style="display:inline-flex;align-items:center;justify-content:center;min-height:20px;padding:0 6px;border:1px solid #c8e7d4;border-radius:6px;background:#edf8f1;color:#19733f;font-size:10px;font-weight:600;line-height:1;box-sizing:border-box;"
              >
                <span>Today</span>
              </div>
            `
            : ""
        }
        ${
          isCompleted
            ? `
              <div
                class="appointment-status appointment-status-completed"
                style="display:inline-flex;align-items:center;justify-content:center;min-height:20px;padding:0 6px;border-radius:6px;box-sizing:border-box;font-size:10px;font-weight:600;line-height:1;"
              >
                <span>Completed</span>
              </div>
            `
            : ""
        }
      </div>
    `;
  return `
      <div class="appointment-date">
        ${escapeHTML(formatDate(appointment.date))}
      </div>
      <div class="appointment-time">
        ${escapeHTML(timeDisplay)}
      </div>
      ${statusDisplay}
    `;
}
patientTableBody?.addEventListener("click", (event) => {
  const medicalButton = event.target.closest("[data-medical-form-id]");
  if (medicalButton) {
    const patientId = medicalButton.dataset.medicalFormId;
    const patient = findPatient(patientId);
    if (!patient) {
      return;
    }
    if (patient.medicalForm) {
      openMedicalResult(patient);
    } else {
      openMedicalForm(patient, 1);
    }
    return;
  }
  const actionTrigger = event.target.closest("[data-action-trigger]");
  if (actionTrigger) {
    const patientId = actionTrigger.dataset.patientId;
    openActionMenu(actionTrigger, patientId);
    return;
  }
  const patientRow = event.target.closest("tr[data-patient-open]");
  if (patientRow) {
    const patientId = patientRow.dataset.patientOpen;
    const patient = findPatient(patientId);
    if (!patient) {
      return;
    }
    closeActionMenu();
    openPatientDetails(patient);
  }
});
function bindActionMenuEvents() {
  patientActionMenu?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !patientActionMenu.contains(button)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.action;
    if (!action || action === "medicalForm") {
      return;
    }
    const patientId = button.dataset.patientId || currentActionPatientId;
    closeActionMenu();
    handlePatientAction(action, patientId);
  });
  document.addEventListener("click", (event) => {
    if (patientActionMenu && patientActionMenu.classList.contains("open")) {
      const clickedInsideMenu = patientActionMenu.contains(event.target);
      const clickedTrigger = event.target.closest("[data-action-trigger]");
      if (!clickedInsideMenu && !clickedTrigger) {
        closeActionMenu();
      }
    }
  });
  window.addEventListener("resize", closeActionMenu);
  window.addEventListener("scroll", closeActionMenu, true);
}
function openActionMenu(trigger, patientId) {
  removeMedicalFormFromActionMenu();
  currentActionPatientId = patientId;
  const rect = trigger.getBoundingClientRect();
  patientActionMenu.classList.add("open");
  const menuWidth = patientActionMenu.offsetWidth;
  const menuHeight = patientActionMenu.offsetHeight;
  let left = rect.right - menuWidth;
  let top = rect.bottom + 7;
  if (left < 10) {
    left = 10;
  }
  if (left + menuWidth > window.innerWidth - 10) {
    left = window.innerWidth - menuWidth - 10;
  }
  if (top + menuHeight > window.innerHeight - 10) {
    top = rect.top - menuHeight - 7;
  }
  patientActionMenu.style.left = `${left}px`;
  patientActionMenu.style.top = `${top}px`;
  document
    .querySelectorAll(".patient-action-trigger.active")
    .forEach((button) => button.classList.remove("active"));
  trigger.classList.add("active");
}
function closeActionMenu() {
  patientActionMenu?.classList.remove("open");
  document
    .querySelectorAll(".patient-action-trigger.active")
    .forEach((button) => button.classList.remove("active"));
  currentActionPatientId = null;
}
function handlePatientAction(action, patientId) {
  const patient = findPatient(patientId);
  if (!patient) {
    return;
  }
  switch (action) {
    case "view":
      openPatientDetails(patient);
      break;
    case "edit":
      openEditPatientModal(patientId);
      break;
    case "delete":
      deletePatient(patientId);
      break;
  }
}
function getDentalProcedureColor(procedure) {
  const value = String(procedure || "")
    .trim()
    .toLowerCase();
  if (!value) {
    return {
      color: "#7c8b83",
      background: "#f8fbf9",
      border: "#d2ded6",
    };
  }
  if (
    value.includes("brace") ||
    value.includes("orthodont") ||
    value.includes("retainer")
  ) {
    return {
      color: "#22a447",
      background: "#eaf8ee",
      border: "#8fd0a0",
    };
  }
  if (value.includes("root canal")) {
    return {
      color: "#ef4444",
      background: "#fff0f0",
      border: "#f3a1a1",
    };
  }
  if (value.includes("filling") || value.includes("restoration")) {
    return {
      color: "#2f80ed",
      background: "#edf5ff",
      border: "#9bc5f5",
    };
  }
  if (value.includes("crown")) {
    return {
      color: "#f59e0b",
      background: "#fff7e6",
      border: "#f5c56b",
    };
  }
  if (value.includes("extraction") || value.includes("wisdom tooth")) {
    return {
      color: "#8b5cf6",
      background: "#f3efff",
      border: "#bba5f5",
    };
  }
  if (value.includes("whitening")) {
    return {
      color: "#14b8a6",
      background: "#e9fbf8",
      border: "#83dcd2",
    };
  }
  if (
    value.includes("cleaning") ||
    value.includes("prophylaxis") ||
    value.includes("scaling") ||
    value.includes("polishing")
  ) {
    return {
      color: "#ec4899",
      background: "#fff0f7",
      border: "#f3a3c5",
    };
  }
  if (value.includes("gum") || value.includes("periodontal")) {
    return {
      color: "#8b5a2b",
      background: "#f8f1e9",
      border: "#cda982",
    };
  }
  const customColors = [
    {
      color: "#eab308",
      background: "#fffbea",
      border: "#e7cc63",
    },
    {
      color: "#06b6d4",
      background: "#eafbfd",
      border: "#82d9e6",
    },
    {
      color: "#6366f1",
      background: "#eff0ff",
      border: "#a8aaf2",
    },
    {
      color: "#f43f5e",
      background: "#fff0f3",
      border: "#f3a0b0",
    },
    {
      color: "#84cc16",
      background: "#f3fbe9",
      border: "#b8dc82",
    },
    {
      color: "#64748b",
      background: "#f1f4f7",
      border: "#aeb8c4",
    },
  ];
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return customColors[hash % customColors.length];
}
function formatDentalUpdatedDate(value) {
  if (!value) {
    return "Not updated";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not updated";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function formatDentalUpdatedTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
function bindDentalChartWorkspace(patient) {
  const patientId = String(
    patient.patientId || patient.patient_id || patient.id || "",
  );
  const workspace = document.querySelector(
    `.dental-workspace[data-patient-id="${CSS.escape(patientId)}"]`,
  );
  if (!workspace) {
    return;
  }
  const editor = workspace.querySelector("#dentalToothEditor");
  const selectedTooth = workspace.querySelector("#dentalSelectedTooth");
  const currentProcedure = workspace.querySelector("#dentalCurrentProcedure");
  const procedureInput = workspace.querySelector("#dentalProcedureInput");
  const procedureSuggestions = workspace.querySelector(
    "#dentalProcedureSuggestions",
  );
  const procedureNote = workspace.querySelector("#dentalProcedureNote");
  const toothHistory = workspace.querySelector("#dentalToothHistory");
  const toothHistoryList = workspace.querySelector("#dentalToothHistoryList");
  const toothHistoryCount = workspace.querySelector("#dentalToothHistoryCount");
  const saveButton = workspace.querySelector("#saveDentalToothBtn");
  const clearButton = workspace.querySelector("#clearDentalToothBtn");
  const cancelButton = workspace.querySelector("#cancelDentalToothBtn");
  if (
    !editor ||
    !selectedTooth ||
    !currentProcedure ||
    !procedureInput ||
    !procedureSuggestions ||
    !procedureNote ||
    !saveButton ||
    !clearButton ||
    !cancelButton
  ) {
    return;
  }
  const procedureOptions = [
    "Dental Consultation",
    "Dental Cleaning",
    "Dental Filling",
    "Tooth Extraction",
    "Root Canal Treatment",
    "Braces Adjustment",
    "Dental Whitening",
    "Dental X-ray",
    "Scaling and Polishing",
    "Denture Fitting",
    "Wisdom Tooth Extraction",
    "Implant Consultation",
    "Oral Prophylaxis",
    "Retainer Fitting",
    "Dental Crown",
    "Temporary Filling",
    "Permanent Filling",
    "Tooth Restoration",
    "Tooth Fracture",
    "Tooth Sensitivity",
    "Gum Treatment",
    "Other",
  ];
  let activeTooth = "";
  const formatDentalHistoryDate = (value) => {
    if (!value) {
      return "Date not recorded";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Date not recorded";
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const formatDentalUpdatedDate = (value) => {
    if (!value) {
      return "Not updated";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Not updated";
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };
  const formatDentalUpdatedTime = (value) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  const renderToothHistory = (record) => {
    const history = Array.isArray(record?.history)
      ? record.history
      : record?.procedure
        ? [
            {
              procedure: record.procedure,
              note: record.note || "",
              updatedAt: record.updatedAt || "",
            },
          ]
        : [];
    if (!history.length) {
      toothHistory.hidden = true;
      toothHistoryList.innerHTML = "";
      toothHistoryCount.textContent = "0 records";
      return;
    }
    const orderedHistory = [...history].sort(
      (a, b) =>
        new Date(b.updatedAt || 0).getTime() -
        new Date(a.updatedAt || 0).getTime(),
    );
    toothHistoryCount.textContent = `${orderedHistory.length} record${orderedHistory.length === 1 ? "" : "s"}`;
    toothHistoryList.innerHTML = orderedHistory
      .map(
        (entry, index) => `
              <div class="dental-tooth-history-item">
                <div class="dental-tooth-history-marker">
                  <span></span>
                </div>
                <div class="dental-tooth-history-content">
                  <div class="dental-tooth-history-title">
                    <strong>
                      ${escapeHTML(String(entry.procedure || "Procedure"))}
                    </strong>
                    ${
                      index === 0
                        ? `
                          <span class="dental-tooth-history-latest">
                            Latest
                          </span>
                        `
                        : ""
                    }
                  </div>
                  <span class="dental-tooth-history-date">
                    ${escapeHTML(formatDentalHistoryDate(entry.updatedAt))}
                  </span>
                  ${
                    entry.note
                      ? `
                        <p>
                          ${escapeHTML(String(entry.note))}
                        </p>
                      `
                      : ""
                  }
                </div>
              </div>
            `,
      )
      .join("");
    toothHistory.hidden = false;
  };
  const updateSelectedToothState = () => {
    workspace
      .querySelectorAll(".dental-workspace-tooth-button.is-selected")
      .forEach((button) => {
        button.classList.remove("is-selected");
      });
    if (!activeTooth) {
      return;
    }
    const selectedButton = workspace.querySelector(
      `.dental-workspace-tooth-button[data-tooth="${CSS.escape(activeTooth)}"]`,
    );
    if (selectedButton) {
      selectedButton.classList.add("is-selected");
    }
  };
  const closeEditor = () => {
    activeTooth = "";
    workspace
      .querySelectorAll(".dental-workspace-tooth-button.is-selected")
      .forEach((button) => {
        button.classList.remove("is-selected");
      });
    procedureSuggestions.innerHTML = "";
    procedureSuggestions.hidden = true;
    editor.hidden = true;
  };
  const showSuggestions = (value) => {
    const searchValue = String(value || "")
      .trim()
      .toLowerCase();
    const filtered = procedureOptions.filter((procedure) =>
      procedure.toLowerCase().includes(searchValue),
    );
    if (!filtered.length) {
      procedureSuggestions.innerHTML = "";
      procedureSuggestions.hidden = true;
      return;
    }
    procedureSuggestions.innerHTML = filtered
      .map(
        (procedure) => `
            <button
              type="button"
              class="dental-procedure-suggestion"
              data-procedure="${escapeHTML(procedure)}"
            >
              ${escapeHTML(procedure)}
            </button>
          `,
      )
      .join("");
    procedureSuggestions.hidden = false;
  };
  const openToothEditor = (toothNumber) => {
    const chart =
      patient.dentalChart && typeof patient.dentalChart === "object"
        ? patient.dentalChart
        : {
            teeth: {},
          };
    if (!chart.teeth || typeof chart.teeth !== "object") {
      chart.teeth = {};
    }
    const record = chart.teeth[toothNumber] || {};
    activeTooth = toothNumber;
    updateSelectedToothState();
    selectedTooth.textContent = `Tooth ${toothNumber}`;
    procedureInput.value = record.procedure || "";
    procedureNote.value = record.note || "";
    currentProcedure.textContent = record.procedure || "No procedure recorded";
    const currentUpdatedDate = editor.querySelector(
      "#dentalCurrentUpdatedDate",
    );
    const currentUpdatedTime = editor.querySelector(
      "#dentalCurrentUpdatedTime",
    );
    if (currentUpdatedDate) {
      currentUpdatedDate.textContent = formatDentalUpdatedDate(
        record.updatedAt,
      );
    }
    if (currentUpdatedTime) {
      currentUpdatedTime.textContent = formatDentalUpdatedTime(
        record.updatedAt,
      );
    }
    renderToothHistory(record);
    procedureSuggestions.innerHTML = "";
    procedureSuggestions.hidden = true;
    editor.hidden = false;
    if (isStaffReadOnly()) {
      procedureInput.readOnly = true;
      procedureNote.readOnly = true;
      saveButton.hidden = true;
      clearButton.hidden = true;
      cancelButton.textContent = "Close";
      procedureSuggestions.hidden = true;
      return;
    }
    procedureInput.focus();
    if (procedureInput.value.trim()) {
      showSuggestions(procedureInput.value);
    }
  };
  workspace
    .querySelectorAll(".dental-workspace-tooth-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const toothNumber = button.dataset.tooth || "";
        if (!toothNumber) {
          return;
        }
        openToothEditor(toothNumber);
      });
    });
  procedureInput.addEventListener("input", () => {
    showSuggestions(procedureInput.value);
  });
  procedureInput.addEventListener("focus", () => {
    showSuggestions(procedureInput.value);
  });
  procedureSuggestions.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-procedure]");
    if (!suggestion) {
      return;
    }
    procedureInput.value = suggestion.dataset.procedure || "";
    procedureSuggestions.innerHTML = "";
    procedureSuggestions.hidden = true;
    procedureInput.focus();
  });
  document.addEventListener("click", (event) => {
    if (
      !editor.contains(event.target) &&
      !procedureInput.contains(event.target)
    ) {
      procedureSuggestions.innerHTML = "";
      procedureSuggestions.hidden = true;
    }
  });
  saveButton.addEventListener("click", () => {
    if (!activeTooth) {
      return;
    }
    const procedure = procedureInput.value.trim();
    const note = procedureNote.value.trim();
    if (!procedure) {
      procedureInput.focus();
      return;
    }
    const targetPatient = findPatient(patientId);
    if (!targetPatient) {
      console.error(
        "Unable to save dental chart. Patient not found:",
        patientId,
      );
      return;
    }
    if (
      !targetPatient.dentalChart ||
      typeof targetPatient.dentalChart !== "object"
    ) {
      targetPatient.dentalChart = {};
    }
    if (
      !targetPatient.dentalChart.teeth ||
      typeof targetPatient.dentalChart.teeth !== "object"
    ) {
      targetPatient.dentalChart.teeth = {};
    }
    targetPatient.dentalChart.dentition = "permanent";
    const previousRecord = targetPatient.dentalChart.teeth[activeTooth] || {};
    const previousHistory = Array.isArray(previousRecord.history)
      ? previousRecord.history
      : previousRecord.procedure
        ? [
            {
              procedure: previousRecord.procedure,
              note: previousRecord.note || "",
              updatedAt: previousRecord.updatedAt || "",
            },
          ]
        : [];
    const previousProcedure = String(previousRecord.procedure || "").trim();
    const previousNote = String(previousRecord.note || "").trim();
    const hasChanged = previousProcedure !== procedure || previousNote !== note;
    const now = new Date().toISOString();
    const history = [...previousHistory];
    if (!history.length) {
      history.push({
        procedure,
        note,
        updatedAt: now,
      });
    } else if (hasChanged) {
      history.push({
        procedure,
        note,
        updatedAt: now,
      });
    }
    targetPatient.dentalChart.teeth[activeTooth] = {
      procedure,
      note,
      updatedAt: now,
      history,
    };
    targetPatient.dentalChart.updatedAt = new Date().toISOString();
    const patientIndex = patients.findIndex(
      (item) =>
        String(item.patientId || item.patient_id || item.id || "") ===
        patientId,
    );
    if (patientIndex === -1) {
      console.error(
        "Unable to save dental chart. Patient index not found:",
        patientId,
      );
      return;
    }
    patients[patientIndex] = targetPatient;
    currentPatientRecord = targetPatient;
    savePatients();
    closeEditor();
    $("patientPageDental").innerHTML = buildDentalChartWorkspace(targetPatient);
    bindDentalChartWorkspace(targetPatient);
  });
  clearButton.addEventListener("click", () => {
    if (!activeTooth) {
      return;
    }
    const targetPatient = findPatient(patientId);
    if (!targetPatient) {
      return;
    }
    if (targetPatient.dentalChart && targetPatient.dentalChart.teeth) {
      delete targetPatient.dentalChart.teeth[activeTooth];
      targetPatient.dentalChart.updatedAt = new Date().toISOString();
    }
    const patientIndex = patients.findIndex(
      (item) =>
        String(item.patientId || item.patient_id || item.id || "") ===
        patientId,
    );
    if (patientIndex !== -1) {
      patients[patientIndex] = targetPatient;
      currentPatientRecord = targetPatient;
      savePatients();
    }
    closeEditor();
    $("patientPageDental").innerHTML = buildDentalChartWorkspace(targetPatient);
    bindDentalChartWorkspace(targetPatient);
  });
  cancelButton.addEventListener("click", () => {
    closeEditor();
  });
}
function buildDentalChartWorkspace(patient) {
  const patientId = String(
    patient.patientId || patient.patient_id || patient.id || "",
  );
  const dentalChart =
    patient.dentalChart && typeof patient.dentalChart === "object"
      ? patient.dentalChart
      : {};
  const teeth =
    dentalChart.teeth && typeof dentalChart.teeth === "object"
      ? dentalChart.teeth
      : {};
  const upperLeft = ["18", "17", "16", "15", "14", "13", "12", "11"];
  const upperRight = ["21", "22", "23", "24", "25", "26", "27", "28"];
  const lowerLeft = ["48", "47", "46", "45", "44", "43", "42", "41"];
  const lowerRight = ["31", "32", "33", "34", "35", "36", "37", "38"];
  const tooth = (number) => {
    const record = teeth[number] || {};
    const procedure = String(record.procedure || "").trim();
    const history = Array.isArray(record.history)
      ? record.history
      : procedure
        ? [
            {
              procedure,
              note: record.note || "",
              updatedAt: record.updatedAt || "",
            },
          ]
        : [];
    const historyCount = history.length;
    const procedureColor = getDentalProcedureColor(procedure);
    return `
        <div
          class="dental-workspace-tooth"
          data-patient-id="${escapeHTML(patientId)}"
          data-tooth="${number}"
        >
          <span class="dental-workspace-tooth-number">
            ${number}
          </span>
          <button
            type="button"
            class="dental-workspace-tooth-button${procedure ? " has-condition" : ""}${historyCount ? " has-history" : ""}"
            data-tooth="${number}"
            data-procedure="${escapeHTML(procedure)}"
            data-history-count="${historyCount}"
            aria-label="Tooth ${number}"
            title="${escapeHTML(
              procedure
                ? `${procedure} • ${historyCount} record${historyCount === 1 ? "" : "s"}`
                : "Select tooth",
            )}"
            style="
              --tooth-color: ${procedureColor.color};
              --tooth-background: ${procedureColor.background};
              --tooth-border: ${procedureColor.border};
            "
          >
            <i class="fa-solid fa-tooth"></i>
            ${
              historyCount
                ? `
                  <span
                    class="dental-tooth-history-badge"
                    aria-hidden="true"
                  >
                    ${historyCount}
                  </span>
                `
                : ""
            }
          </button>
        </div>
      `;
  };
  const recordedCount = Object.keys(teeth).filter(
    (number) => teeth[number] && String(teeth[number].procedure || "").trim(),
  ).length;
  const latestDentalUpdate =
    Object.values(teeth)
      .map((record) => record?.updatedAt || "")
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || "";
  return `
      <div
        class="dental-workspace"
        data-patient-id="${escapeHTML(patientId)}"
      >
        <div class="dental-workspace-header">
          <div>
            <div>
  <span class="dental-workspace-eyebrow" style="color:#087f3f; font-size:10px;">ODONTOGRAM</span>
</div>
            <p>
              Patient-specific dental chart for
              ${escapeHTML(getFullName(patient) || "Unnamed Patient")}
            </p>
          </div>
          <div class="dental-workspace-toolbar">
            <label for="dentalDentitionSelect">
              DENTITION
            </label>
            <select id="dentalDentitionSelect">
              <option value="permanent">
                Permanent
              </option>
            </select>
          </div>
        </div>
        <div class="dental-workspace-canvas">
          <div class="dental-workspace-arch-title">
            UPPER ARCH
          </div>
          <div class="dental-workspace-row">
            <div class="dental-workspace-half">
              ${upperLeft.map(tooth).join("")}
            </div>
            <div class="dental-workspace-midline"></div>
            <div class="dental-workspace-half">
              ${upperRight.map(tooth).join("")}
            </div>
          </div>
          <div class="dental-workspace-center">
            <span>MIDLINE</span>
          </div>
          <div class="dental-workspace-row dental-workspace-lower">
            <div class="dental-workspace-half">
              ${lowerLeft.map(tooth).join("")}
            </div>
            <div class="dental-workspace-midline"></div>
            <div class="dental-workspace-half">
              ${lowerRight.map(tooth).join("")}
            </div>
          </div>
          <div class="dental-workspace-arch-title lower">
            LOWER ARCH
          </div>
        </div>
        <div class="dental-tooth-editor" id="dentalToothEditor" hidden>
          <div class="dental-tooth-editor-header">
            <div>
              <span class="dental-tooth-editor-eyebrow">
                TOOTH RECORD
              </span>
              <h4 id="dentalSelectedTooth">
                Tooth
              </h4>
            </div>
            <div class="dental-tooth-editor-current-wrap">
              <span
                class="dental-tooth-editor-current"
                id="dentalCurrentProcedure"
              >
                No procedure recorded
              </span>
              <span class="dental-tooth-editor-updated">
                <i class="fa-regular fa-clock"></i>
                <span id="dentalCurrentUpdatedDate">
                  Not updated
                </span>
                <span
                  id="dentalCurrentUpdatedTime"
                ></span>
              </span>
            </div>
          </div>
          <div class="dental-tooth-editor-fields">
            <div class="dental-tooth-editor-field">
              <label for="dentalProcedureInput">
                SERVICE / PROCEDURE
              </label>
              <div class="dental-procedure-input-wrapper">
                <input
                  type="text"
                  id="dentalProcedureInput"
                  autocomplete="off"
                  placeholder="Type service or procedure..."
                />
                <div
                  class="dental-procedure-suggestions"
                  id="dentalProcedureSuggestions"
                  hidden
                ></div>
              </div>
            </div>
            <div class="dental-tooth-editor-field">
              <label for="dentalProcedureNote">
                CLINICAL NOTE
              </label>
              <textarea
                id="dentalProcedureNote"
                rows="3"
                placeholder="Enter clinical findings or notes..."
              ></textarea>
            </div>
            <div
            class="dental-tooth-history"
            id="dentalToothHistory"
            hidden
          >
            <div class="dental-tooth-history-header">
              <div>
                <span class="dental-tooth-history-eyebrow">
                  PROCEDURE HISTORY
                </span>
                <h5>Previous Records</h5>
              </div>
              <span
                class="dental-tooth-history-count"
                id="dentalToothHistoryCount"
              >
                0 records
              </span>
            </div>
            <div
              class="dental-tooth-history-list"
              id="dentalToothHistoryList"
            ></div>
          </div>
          <div class="dental-tooth-editor-actions">
            <button
              type="button"
              class="dental-tooth-editor-cancel"
              id="cancelDentalToothBtn"
            >
              Cancel
            </button>
            <button
              type="button"
              class="dental-tooth-editor-clear"
              id="clearDentalToothBtn"
            >
              Clear
            </button>
            <button
              type="button"
              class="dental-tooth-editor-save"
              id="saveDentalToothBtn"
            >
              <i class="fa-solid fa-check"></i>
              Save Tooth
            </button>
          </div>
        </div>
                <div class="dental-procedure-legend">
          <div class="dental-procedure-legend-header">
            <div>
              <span class="dental-procedure-legend-eyebrow">
                PROCEDURE GUIDE
              </span>
              <h4>Procedure Colors</h4>
            </div>
            <span class="dental-procedure-legend-note">
              Colors indicate recorded procedures
            </span>
          </div>
          <div class="dental-procedure-legend-list">
            ${(() => {
              const recordedProcedures = [
                ...new Set(
                  Object.values(teeth)
                    .map((record) => String(record?.procedure || "").trim())
                    .filter(Boolean),
                ),
              ];
              if (!recordedProcedures.length) {
                return `
                  <div class="dental-procedure-legend-empty">
                    No recorded procedures yet
                  </div>
                `;
              }
              return recordedProcedures
                .sort((a, b) => a.localeCompare(b))
                .map((procedure) => {
                  const color = getDentalProcedureColor(procedure);
                  return `
                    <div
                      class="dental-procedure-legend-item"
                      title="${escapeHTML(procedure)}"
                    >
                      <span
                        class="dental-procedure-legend-dot"
                        style="
                          --legend-color: ${color.color};
                          --legend-background: ${color.background};
                          --legend-border: ${color.border};
                        "
                      ></span>
                      <span>
                        ${escapeHTML(procedure)}
                      </span>
                    </div>
                  `;
                })
                .join("");
            })()}
          </div>
        </div>
        <div class="dental-workspace-status">
          <div class="dental-workspace-status-icon">
            <i class="fa-solid fa-tooth"></i>
          </div>
          <div class="dental-workspace-status-content">
            <strong>
              ${recordedCount} tooth${recordedCount === 1 ? "" : "s"} recorded
            </strong>
            <span>
              ${
                latestDentalUpdate
                  ? `Last updated ${formatDentalUpdatedDate(latestDentalUpdate)}${formatDentalUpdatedTime(latestDentalUpdate) ? ` • ${formatDentalUpdatedTime(latestDentalUpdate)}` : ""}`
                  : "No clinical tooth records have been updated yet"
              }
            </span>
          </div>
          <div class="dental-workspace-status-indicator">
            <span class="dental-workspace-status-dot"></span>
            <span>
              ${recordedCount ? "Clinical record active" : "No records yet"}
            </span>
          </div>
        </div>
      </div>
    `;
}
function buildTreatmentWorkspace(patient) {
  const patientId = String(
    patient.patientId || patient.patient_id || patient.id || "",
  );
  const treatments = Array.isArray(patient.treatments)
    ? patient.treatments
    : [];
  const appointments = Array.isArray(patient.appointments)
    ? patient.appointments
    : [];
  const treatmentOptions = [
    "Dental Consultation",
    "Dental Cleaning",
    "Dental Filling",
    "Tooth Extraction",
    "Root Canal Treatment",
    "Braces Adjustment",
    "Dental Whitening",
    "Dental X-ray",
    "Scaling and Polishing",
    "Denture Fitting",
    "Wisdom Tooth Extraction",
    "Implant Consultation",
    "Oral Prophylaxis",
    "Retainer Fitting",
    "Dental Crown",
    "Temporary Filling",
    "Permanent Filling",
    "Tooth Restoration",
    "Gum Treatment",
    "Other",
  ];
  const sortedTreatments = [...treatments].sort(
    (a, b) =>
      new Date(b.date || b.createdAt || 0).getTime() -
      new Date(a.date || a.createdAt || 0).getTime(),
  );
  return `
  <div class="patient-record-section">
    <div class="patient-record-section-header">
      <div>
        <span class="patient-record-section-eyebrow" style="font-size:10px;color:#087f3f;">
          CLINICAL HISTORY
        </span>
        <p style="margin-top:4px;color:#7d8982;font-size:10px;">
          Patient-specific treatment history and procedures performed.
        </p>
      </div>
      <button
        type="button"
        class="patient-record-edit-btn"
        id="addTreatmentBtn"
      >
        <i class="fa-solid fa-plus"></i>
        Add Treatment
      </button>
    </div>
      <div
        class="treatment-workspace"
        id="treatmentWorkspace"
        hidden
      >
        <div class="medical-result-grid">
          <div class="medical-result-item full">
            <span class="medical-result-label">
              APPOINTMENT / VISIT
            </span>
            <select id="treatmentAppointment">
              <option value="">
                Select appointment
              </option>
${appointments
  .map((appointment) => {
    const appointmentId = getTreatmentAppointmentId(appointment);
    const date = appointment.date || appointment.appointment_date || "";
    const time = appointment.start || appointment.appointment_time || "";
    const service =
      appointment.type || appointment.service_type || "Appointment";
    return `
      <option value="${escapeHTML(appointmentId)}">
        ${escapeHTML(
          `${date || "No date"}${
            time ? ` · ${formatTime12Hour(time)}` : ""
          } · ${service}`,
        )}
      </option>
    `;
  })
  .join("")}
            </select>
          </div>
          <div class="medical-result-item">
            <span class="medical-result-label">
              TOOTH NUMBER
            </span>
            <input
              type="text"
              id="treatmentTooth"
              placeholder="Example: 16 or 16, 17"
            />
          </div>
          <div class="medical-result-item">
            <span class="medical-result-label">
              TREATMENT DATE
            </span>
            <input
              type="date"
              id="treatmentDate"
              value="${getLocalDateString()}"
            />
          </div>
          <div class="medical-result-item full">
            <span class="medical-result-label">
              TREATMENT / PROCEDURE
            </span>
            <div class="treatment-procedure-wrapper">
              <input
                type="text"
                id="treatmentProcedure"
                autocomplete="off"
                placeholder="Type treatment or procedure..."
              />
              <div
                class="treatment-procedure-suggestions"
                id="treatmentProcedureSuggestions"
                hidden
              >
                ${treatmentOptions
                  .map(
                    (procedure) => `
                      <button
                        type="button"
                        data-treatment-procedure="${escapeHTML(procedure)}"
                      >
                        ${escapeHTML(procedure)}
                      </button>
                    `,
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <div class="medical-result-item full">
            <span class="medical-result-label">
              CLINICAL NOTE
            </span>
            <textarea
              id="treatmentNote"
              rows="4"
              placeholder="Enter actual treatment performed, findings, materials used, or other clinical notes..."
            ></textarea>
          </div>
          <div class="medical-result-item full treatment-materials-field">
            <div class="treatment-materials-heading">
              <span class="medical-result-label">ITEMS TO CONSUME</span>
              <span class="treatment-materials-help">Review and adjust before saving</span>
            </div>
            <div id="treatmentMaterialsList" class="treatment-materials-list">
              <div class="treatment-materials-empty">Select a treatment to load suggested inventory items.</div>
            </div>
            <button type="button" class="treatment-add-material-btn" id="addTreatmentMaterialBtn">
              <i class="fa-solid fa-plus"></i>
              Add item
            </button>
          </div>
        </div>
        <div class="treatment-form-actions">
          <button
            type="button"
            class="patient-record-edit-btn"
            id="cancelTreatmentBtn"
          >
            Cancel
          </button>
          <button
            type="button"
            class="patient-record-edit-btn"
            id="saveTreatmentBtn"
          >
            <i class="fa-solid fa-check"></i>
            Save Treatment
          </button>
        </div>
      </div>
      ${
        sortedTreatments.length
          ? `
            <div class="treatment-history-list">
              ${sortedTreatments
                .map((treatment) => {
                  const procedure =
                    treatment.procedure || treatment.treatment || "Treatment";
                  const tooth = treatment.toothNumber || treatment.tooth || "";
                  const date =
                    treatment.date ||
                    treatment.treatmentDate ||
                    treatment.createdAt ||
                    "";
                  const treatmentTime = treatment.createdAt || "";
                  const note = treatment.note || treatment.clinicalNote || "";
                  const consumedMaterials = Array.isArray(
                    treatment.consumedMaterials,
                  )
                    ? treatment.consumedMaterials.filter(
                        (item) => Number(item.quantity) > 0,
                      )
                    : [];
                  return `
                    <div
                      class="patient-record-appointment"
                      data-treatment-id="${escapeHTML(treatment.id || "")}"
                    >
                      <div class="patient-record-appointment-date">
                            <span>
                              ${escapeHTML(
                                formatDate(String(date).slice(0, 10)),
                              )}
                            </span>
                            <strong class="treatment-history-time">
                              <i class="fa-regular fa-clock"></i>
                              ${escapeHTML(
                                treatmentTime
                                  ? new Date(treatmentTime).toLocaleTimeString(
                                      "en-US",
                                      {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      },
                                    )
                                  : "",
                              )}
                            </strong>
                          </div>
                      <div class="patient-record-appointment-info">
                        <strong>
                          ${escapeHTML(procedure)}
                          ${
                            tooth
                              ? `<span class="treatment-history-tooth"> • Tooth ${escapeHTML(tooth)}</span>`
                              : ""
                          }
                        </strong>
                        ${note ? `<span>${escapeHTML(note)}</span>` : ""}
                        ${
                          consumedMaterials.length
                            ? `<div class="treatment-consumed-summary"><i class="fa-solid fa-boxes-stacked"></i><span>${consumedMaterials
                                .map(
                                  (item) =>
                                    `${escapeHTML(item.itemName || item.name || "Item")} × ${Number(item.quantity)}`,
                                )
                                .join(" · ")}</span></div>`
                            : ""
                        }
                      </div>
                      <div
                        style="display:flex;gap:6px;align-items:center;margin-left:auto;"
                      >
${(() => {
  const treatmentId =
    treatment.treatmentId || treatment.treatment_id || treatment.id || "";
  return `
    <button
      type="button"
      class="patient-record-edit-btn"
      data-treatment-edit="${escapeHTML(treatmentId)}"
      title="Edit Treatment"
    >
      <i class="fa-solid fa-pen"></i>
    </button>
    <button
      type="button"
      class="patient-record-edit-btn"
      data-treatment-delete="${escapeHTML(treatmentId)}"
      title="Delete Treatment"
    >
      <i class="fa-solid fa-trash"></i>
    </button>
`;
})()}
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
          : ` 
            <div class="patient-record-empty">
              <i class="fa-solid fa-stethoscope"></i>
              <strong>
                No treatments recorded
              </strong>
              <span>
                Actual procedures performed by the dentist will
                appear here after clinical assessment.
              </span>
            </div>
          `
      }
    </div>
  `;
}
function getLocalDateKeyFromValue(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }
  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return rawValue.slice(0, 10);
  }
  return [
    parsedDate.getFullYear(),
    String(parsedDate.getMonth() + 1).padStart(2, "0"),
    String(parsedDate.getDate()).padStart(2, "0"),
  ].join("-");
}
function getTreatmentAppointmentDate(appointment) {
  return getLocalDateKeyFromValue(
    appointment?.date ||
      appointment?.appointmentDate ||
      appointment?.appointment_date ||
      appointment?.scheduleDate ||
      appointment?.scheduledDate ||
      appointment?.scheduled_date ||
      "",
  );
}
function getTreatmentProcedureFromAppointment(appointment) {
  const service = String(
    appointment?.type ||
      appointment?.service_type ||
      appointment?.service ||
      appointment?.reason ||
      "",
  ).trim();
  const procedureMap = {
    consultation: "Dental Consultation",
    "dental cleaning": "Dental Cleaning",
    "tooth filling / pasta": "Dental Filling",
    "tooth extraction": "Tooth Extraction",
    "root canal": "Root Canal Treatment",
    "teeth whitening": "Dental Whitening",
    "scaling and polishing": "Scaling and Polishing",
    "oral prophylaxis": "Oral Prophylaxis",
    "wisdom tooth extraction": "Wisdom Tooth Extraction",
  };
  return procedureMap[service.toLowerCase()] || service;
}
function getDentalChartEntriesForAppointment(patient, appointment) {
  const appointmentDate = getTreatmentAppointmentDate(appointment);
  const teeth = patient?.dentalChart?.teeth;
  if (!appointmentDate || !teeth || typeof teeth !== "object") {
    return [];
  }
  return Object.entries(teeth).flatMap(([toothNumber, record]) => {
    const entries =
      Array.isArray(record?.history) && record.history.length
        ? record.history
        : record?.procedure
          ? [
              {
                ...record,
                date:
                  record.date ||
                  record.treatmentDate ||
                  record.performedAt ||
                  record.createdAt ||
                  record.updatedAt ||
                  "",
              },
            ]
          : [];
    return entries
      .filter(
        (entry) =>
          getLocalDateKeyFromValue(
            entry.date ||
              entry.treatmentDate ||
              entry.performedAt ||
              entry.createdAt ||
              entry.updatedAt ||
              record.date ||
              record.treatmentDate ||
              record.performedAt ||
              record.createdAt ||
              record.updatedAt ||
              "",
          ) === appointmentDate,
      )
      .map((entry) => ({
        toothNumber,
        procedure: String(entry.procedure || record.procedure || "").trim(),
        note: String(entry.note || record.note || "").trim(),
      }));
  });
}
function getUniqueDentalChartProcedures(entries) {
  return [
    ...new Set(
      entries
        .map((entry) => String(entry.procedure || "").trim())
        .filter(Boolean),
    ),
  ];
}
function getTreatmentMaterialsForProcedures(procedures) {
  const inventoryService = window.DentaNuevaInventoryService;
  if (!inventoryService) {
    return [];
  }
  const mergedMaterials = new Map();
  procedures.forEach((procedure) => {
    inventoryService
      .getTreatmentMaterialSuggestions(procedure)
      .forEach((material) => {
        const key = String(material.itemName || "")
          .trim()
          .toLowerCase();
        if (!key) {
          return;
        }
        const existing = mergedMaterials.get(key);
        if (existing) {
          existing.quantity += Number(material.quantity) || 0;
          return;
        }
        mergedMaterials.set(key, {
          ...material,
          quantity: Number(material.quantity) || 0,
        });
      });
  });
  return [...mergedMaterials.values()];
}
function getTreatmentAppointmentId(appointment) {
  if (!appointment || typeof appointment !== "object") {
    return "";
  }
  return String(
    appointment.appointmentId ??
      appointment.appointment_id ??
      appointment.id ??
      "",
  ).trim();
}
function bindTreatmentWorkspace(patient) {
  const patientId = String(
    patient.patientId || patient.patient_id || patient.id || "",
  );
  const patientAppointments = Array.isArray(patient.appointments)
    ? patient.appointments
    : [];
  const addButton = $("addTreatmentBtn");
  const workspace = $("treatmentWorkspace");
  const appointmentInput = $("treatmentAppointment");
  const toothInput = $("treatmentTooth");
  const dateInput = $("treatmentDate");
  const procedureInput = $("treatmentProcedure");
  const suggestions = $("treatmentProcedureSuggestions");
  const noteInput = $("treatmentNote");
  const materialsList = $("treatmentMaterialsList");
  const addMaterialButton = $("addTreatmentMaterialBtn");
  const saveButton = $("saveTreatmentBtn");
  const cancelButton = $("cancelTreatmentBtn");
  if (
    !addButton ||
    !workspace ||
    !appointmentInput ||
    !toothInput ||
    !dateInput ||
    !procedureInput ||
    !suggestions ||
    !noteInput ||
    !materialsList ||
    !addMaterialButton ||
    !saveButton ||
    !cancelButton
  ) {
    return;
  }
  if (isStaffReadOnly()) {
    addButton.hidden = true;
    workspace.hidden = true;
    document
      .querySelectorAll(
        "#patientPageTreatments [data-treatment-edit], #patientPageTreatments [data-treatment-delete]",
      )
      .forEach((button) => {
        button.hidden = true;
      });
    return;
  }
  const treatmentOptions = [
    "Dental Consultation",
    "Dental Cleaning",
    "Dental Filling",
    "Tooth Extraction",
    "Root Canal Treatment",
    "Braces Adjustment",
    "Dental Whitening",
    "Dental X-ray",
    "Scaling and Polishing",
    "Denture Fitting",
    "Wisdom Tooth Extraction",
    "Implant Consultation",
    "Oral Prophylaxis",
    "Retainer Fitting",
    "Dental Crown",
    "Temporary Filling",
    "Permanent Filling",
    "Tooth Restoration",
    "Gum Treatment",
    "Other",
  ];
  let editingTreatmentId = null;
  const inventoryService = window.DentaNuevaInventoryService;
  const getInventoryItems = () => {
    try {
      const items = Array.isArray(window["dentanueva_inventory_items"])
        ? window["dentanueva_inventory_items"]
        : [];
      return items;
    } catch (error) {
      return [];
    }
  };
  let inventoryDatalist = document.getElementById("treatmentInventoryItems");
  if (!inventoryDatalist) {
    inventoryDatalist = document.createElement("datalist");
    inventoryDatalist.id = "treatmentInventoryItems";
    document.body.appendChild(inventoryDatalist);
  }
  const inventoryItemNames = getInventoryItems().map((item) => item.name || "");
  const treatmentMaterialNames =
    window.DentaNuevaTreatmentItemCatalog ||
    Object.values(window.DentaNuevaTreatmentMaterials || {}).flatMap(
      (materials) => materials.flatMap((material) => material.names || []),
    );
  const treatmentItemCatalog = [
    ...new Set(
      [...inventoryItemNames, ...treatmentMaterialNames].filter(Boolean),
    ),
  ];
  inventoryDatalist.innerHTML = treatmentItemCatalog
    .map((itemName) => `<option value="${escapeHTML(itemName)}"></option>`)
    .join("");
  const renderMaterials = (materials) => {
    if (!materials.length) {
      materialsList.innerHTML = `<div class="treatment-materials-empty">No suggested items for this procedure. Add an item if needed.</div>`;
      return;
    }
    materialsList.innerHTML = materials
      .map(
        (material) => `
          <div class="treatment-material-row">
            <div class="treatment-material-picker">
              <input class="treatment-material-name" list="treatmentInventoryItems" value="${escapeHTML(material.itemName || "")}" placeholder="Type an inventory item..." autocomplete="off" />
            </div>
            <input class="treatment-material-quantity" type="number" min="0" step="1" value="${Number(material.quantity) || 0}" aria-label="Quantity" />
            <span class="treatment-material-stock">${material.missing ? "Select an inventory item" : `${Number(material.available) || 0} ${escapeHTML(material.unit || "unit")} available`}</span>
            <button type="button" class="treatment-remove-material-btn" aria-label="Remove item"><i class="fa-solid fa-xmark"></i></button>
          </div>
        `,
      )
      .join("");
    materialsList
      .querySelectorAll(".treatment-material-row")
      .forEach((row) => refreshMaterialStock(row));
  };
  const getMaterialRows = () =>
    [...materialsList.querySelectorAll(".treatment-material-row")]
      .map((row) => ({
        itemName:
          row.querySelector(".treatment-material-name")?.value.trim() || "",
        quantity: Math.max(
          0,
          Number(row.querySelector(".treatment-material-quantity")?.value) || 0,
        ),
      }))
      .filter((material) => material.itemName && material.quantity > 0);
  const refreshMaterialStock = (row) => {
    const nameInput = row.querySelector(".treatment-material-name");
    const stockLabel = row.querySelector(".treatment-material-stock");
    const item = getInventoryItems().find(
      (candidate) =>
        String(candidate.name || "")
          .trim()
          .toLowerCase() ===
        String(nameInput?.value || "")
          .trim()
          .toLowerCase(),
    );
    if (!stockLabel) return;
    const itemName = String(nameInput?.value || "").trim();
    stockLabel.textContent = item
      ? `${Number(item.stock) || 0} ${item.unit || "unit"} available`
      : itemName
        ? "Not registered in inventory"
        : "Select an inventory item";
    stockLabel.classList.toggle("is-unavailable", !item);
  };
  const loadMaterialsForProcedure = (procedure) => {
    const suggestions =
      inventoryService?.getTreatmentMaterialSuggestions(procedure) || [];
    renderMaterials(suggestions);
  };
  const loadMaterialsForProcedures = (procedures) => {
    renderMaterials(getTreatmentMaterialsForProcedures(procedures));
  };
  const closeProcedureSuggestions = () => {
    suggestions.innerHTML = "";
    suggestions.hidden = true;
  };
  const closeForm = () => {
    editingTreatmentId = null;
    workspace.hidden = true;
    appointmentInput.value = "";
    toothInput.value = "";
    dateInput.value = getLocalDateString();
    procedureInput.value = "";
    noteInput.value = "";
    renderMaterials([]);
    closeProcedureSuggestions();
  };
  const showSuggestions = (value) => {
    const searchValue = String(value || "")
      .trim()
      .toLowerCase();
    const filtered = treatmentOptions.filter((item) =>
      item.toLowerCase().includes(searchValue),
    );
    suggestions.innerHTML = filtered
      .map(
        (procedure) => `
          <button
            type="button"
            data-treatment-procedure="${escapeHTML(procedure)}"
          >
            ${escapeHTML(procedure)}
          </button>
        `,
      )
      .join("");
    suggestions.hidden = filtered.length === 0;
  };
  const openAddForm = () => {
    editingTreatmentId = null;
    workspace.hidden = false;
    appointmentInput.value = "";
    toothInput.value = "";
    dateInput.value = getLocalDateString();
    procedureInput.value = "";
    noteInput.value = "";
    renderMaterials([]);
    closeProcedureSuggestions();
    procedureInput.focus();
  };
  const openEditForm = (treatment) => {
    if (!treatment) {
      return;
    }
    editingTreatmentId = treatment.id || null;
    workspace.hidden = false;
    appointmentInput.value = getTreatmentAppointmentId({
      appointmentId: treatment.appointmentId || treatment.appointment_id || "",
    });
    toothInput.value = treatment.toothNumber || treatment.tooth || "";
    dateInput.value =
      treatment.date || treatment.treatmentDate || getLocalDateString();
    procedureInput.value = treatment.procedure || treatment.treatment || "";
    noteInput.value = treatment.note || treatment.clinicalNote || "";
    renderMaterials(
      Array.isArray(treatment.consumedMaterials)
        ? treatment.consumedMaterials
        : [],
    );
    closeProcedureSuggestions();
    procedureInput.focus();
  };
  addButton.addEventListener("click", openAddForm);
  cancelButton.addEventListener("click", () => {
    closeForm();
  });
  appointmentInput.addEventListener("change", () => {
    const selectedAppointmentId = String(appointmentInput.value || "").trim();
    if (!selectedAppointmentId) {
      toothInput.value = "";
      procedureInput.value = "";
      noteInput.value = "";
      renderMaterials([]);
      closeProcedureSuggestions();
      return;
    }
    const appointment = patientAppointments.find(
      (item) => getTreatmentAppointmentId(item) === selectedAppointmentId,
    );
    if (!appointment) {
      console.warn(
        "Treatment appointment could not be resolved:",
        selectedAppointmentId,
        patientAppointments,
      );
      return;
    }
    const appointmentDate = getTreatmentAppointmentDate(appointment);
    if (appointmentDate) {
      dateInput.value = appointmentDate;
    }
    const chartEntries = getDentalChartEntriesForAppointment(
      patient,
      appointment,
    );
    if (chartEntries.length) {
      toothInput.value = [
        ...new Set(
          chartEntries
            .map((entry) => String(entry.toothNumber || "").trim())
            .filter(Boolean),
        ),
      ].join(", ");
      const chartProcedures = getUniqueDentalChartProcedures(chartEntries);
      procedureInput.value = chartProcedures.length
        ? chartProcedures.join(" + ")
        : getTreatmentProcedureFromAppointment(appointment);
      noteInput.value = [
        ...new Set(
          chartEntries
            .map((entry) => String(entry.note || "").trim())
            .filter(Boolean),
        ),
      ].join("\n");
      if (chartProcedures.length) {
        loadMaterialsForProcedures(chartProcedures);
      } else {
        loadMaterialsForProcedure(procedureInput.value);
      }
    } else {
      const procedure = getTreatmentProcedureFromAppointment(appointment);
      toothInput.value = "";
      procedureInput.value = procedure;
      noteInput.value = "";
      loadMaterialsForProcedure(procedure);
    }
    closeProcedureSuggestions();
    if (procedureInput.value.trim()) {
      showSuggestions(procedureInput.value);
    }
  });
  suggestions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-treatment-procedure]");
    if (!button) {
      return;
    }
    procedureInput.value = button.dataset.treatmentProcedure || "";
    closeProcedureSuggestions();
    loadMaterialsForProcedure(procedureInput.value);
  });
  addMaterialButton.addEventListener("click", () => {
    const currentMaterials = getMaterialRows();
    currentMaterials.push({ itemName: "", quantity: 1 });
    renderMaterials(currentMaterials);
    materialsList
      .querySelector(".treatment-material-name:last-of-type")
      ?.focus();
  });
  materialsList.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".treatment-remove-material-btn");
    if (!removeButton) return;
    removeButton.closest(".treatment-material-row")?.remove();
    if (!materialsList.querySelector(".treatment-material-row"))
      renderMaterials([]);
  });
  materialsList.addEventListener("input", (event) => {
    const row = event.target.closest(".treatment-material-row");
    if (row && event.target.matches(".treatment-material-name")) {
      refreshMaterialStock(row);
    }
  });
  materialsList.addEventListener("change", (event) => {
    const row = event.target.closest(".treatment-material-row");
    if (row && event.target.matches(".treatment-material-name")) {
      refreshMaterialStock(row);
    }
  });
  const historyList = document.querySelector(".treatment-history-list");
  historyList?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-treatment-edit]");
    if (editButton) {
      const treatmentId = editButton.dataset.treatmentEdit || "";
      const targetPatient = findPatientById(patientId);
      if (!targetPatient) {
        return;
      }
      const treatment = Array.isArray(targetPatient.treatments)
        ? targetPatient.treatments.find(
            (item) => String(item.id || "") === String(treatmentId),
          )
        : null;
      if (!treatment) {
        return;
      }
      openEditForm(treatment);
      return;
    }
    const deleteButton = event.target.closest("[data-treatment-delete]");
    if (deleteButton) {
      const treatmentId = deleteButton.dataset.treatmentDelete || "";
      const targetPatient = findPatientById(patientId);
      if (!targetPatient) {
        return;
      }
      if (!Array.isArray(targetPatient.treatments)) {
        return;
      }
      const treatmentIndex = targetPatient.treatments.findIndex(
        (item) => String(item.id || "") === String(treatmentId),
      );
      if (treatmentIndex === -1) {
        return;
      }
      const treatment = targetPatient.treatments[treatmentIndex];
      const procedure =
        treatment.procedure || treatment.treatment || "this treatment";
      const confirmed = window.confirm(
        `Are you sure you want to delete "${procedure}"?`,
      );
      if (!confirmed) {
        return;
      }
      targetPatient.treatments.splice(treatmentIndex, 1);
      targetPatient.updatedAt = new Date().toISOString();
      const patientIndex = patients.findIndex(
        (item) =>
          String(item.patientId || item.patient_id || item.id || "") ===
          patientId,
      );
      if (patientIndex === -1) {
        return;
      }
      patients[patientIndex] = targetPatient;
      currentPatientRecord = targetPatient;
      savePatients();
      $("patientPageTreatments").innerHTML =
        buildTreatmentWorkspace(targetPatient);
      bindTreatmentWorkspace(targetPatient);
    }
  });
  saveButton.addEventListener("click", async () => {
    const procedure = procedureInput.value.trim();
    const tooth = toothInput.value.trim();
    const note = noteInput.value.trim();
    const date = dateInput.value || getLocalDateString();
    if (!procedure) {
      procedureInput.focus();
      return;
    }
    if (date > getLocalDateString()) {
      dateInput.focus();
      return;
    }
    const targetPatient = findPatientById(patientId);
    if (!targetPatient) {
      return;
    }
    if (!Array.isArray(targetPatient.treatments)) {
      targetPatient.treatments = [];
    }
    const appointmentId = appointmentInput.value || "";
    if (!appointmentId) {
      alert("Please select the appointment/visit for this treatment.");
      appointmentInput.focus();
      return;
    }
    const now = new Date().toISOString();
    if (editingTreatmentId) {
      const treatmentIndex = targetPatient.treatments.findIndex(
        (item) => String(item.id || "") === String(editingTreatmentId),
      );
      if (treatmentIndex === -1) {
        return;
      }
      const existingTreatment = targetPatient.treatments[treatmentIndex];
      targetPatient.treatments[treatmentIndex] = {
        ...existingTreatment,
        patientId,
        appointmentId,
        toothNumber: tooth,
        procedure,
        note,
        date,
        consumedMaterials: getMaterialRows(),
        updatedAt: now,
      };
    } else {
      const newTreatment = {
        id: `treatment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        patientId,
        appointmentId,
        toothNumber: tooth,
        procedure,
        note,
        date,
        consumedMaterials: getMaterialRows(),
        createdAt: now,
        updatedAt: now,
      };
      newTreatment.inventoryDeductedAt = null;
      newTreatment.inventoryMovementIds = [];
      newTreatment.inventoryWarnings = [];
      targetPatient.treatments.push(newTreatment);
    }
    const patientIndex = patients.findIndex(
      (item) =>
        String(item.patientId || item.patient_id || item.id || "") ===
        patientId,
    );
    if (patientIndex === -1) {
      return;
    }
    patients[patientIndex] = targetPatient;
    currentPatientRecord = targetPatient;
    const savedPatient = await syncPatientProfileToDatabase(targetPatient);
    if (!savedPatient) {
      alert(
        "The treatment could not be saved to the database. Please try again.",
      );
      return;
    }
    Object.assign(targetPatient, savedPatient);
    currentPatientRecord = targetPatient;
    patients[patientIndex] = targetPatient;
    $("patientPageTreatments").innerHTML =
      buildTreatmentWorkspace(targetPatient);
    bindTreatmentWorkspace(targetPatient);
  });
}
function applyStaffReadOnlyMode() {
  if (!isStaffReadOnly()) {
    return;
  }
  document
    .querySelectorAll("#patientRecordPage .patient-record-edit-btn")
    .forEach((button) => {
      button.hidden = true;
    });
  document
    .querySelectorAll(
      "#patientRecordPage [data-treatment-edit], #patientRecordPage [data-treatment-delete]",
    )
    .forEach((button) => {
      button.hidden = true;
    });
  document
    .querySelectorAll("#patientRecordPage [data-clinical-delete]")
    .forEach((button) => {
      button.hidden = true;
    });
  const dentalSaveButton = $("saveDentalToothBtn");
  const dentalClearButton = $("clearDentalToothBtn");
  if (dentalSaveButton) {
    dentalSaveButton.hidden = true;
  }
  if (dentalClearButton) {
    dentalClearButton.hidden = true;
  }
  const dentalProcedureInput = $("dentalProcedureInput");
  const dentalProcedureNote = $("dentalProcedureNote");
  if (dentalProcedureInput) {
    dentalProcedureInput.readOnly = true;
  }
  if (dentalProcedureNote) {
    dentalProcedureNote.readOnly = true;
  }
  document
    .querySelectorAll("#patientRecordPage .dental-procedure-suggestion")
    .forEach((button) => {
      button.hidden = true;
    });
}
function openPatientDetails(patient) {
  if (!patient) {
    return;
  }
  const sharedPatientId =
    patient.patientId || patient.patient_id || patient.id || null;
  const sharedPatient = getSharedPatientRecord(sharedPatientId) || patient;
  currentPatientRecord = sharedPatient;
  patient = sharedPatient;
  currentPatientId =
    patient.patientId || patient.patient_id || patient.id || null;
  const name = getFullName(patient);
  const age = calculateAge(patient.dateOfBirth);
  const gender = patient.gender || patient.patientGender || "Not specified";
  const medical = patient.medicalForm || null;
  const appointments = Array.isArray(patient.appointments)
    ? patient.appointments
    : [];
  const patientId = String(currentPatientId || "N/A");
  $("patientPageTitle").textContent = name || "Patient Record";
  $("patientPageSubtitle").textContent = `Patient ID: ${patientId}`;
  $("patientPageProfile").innerHTML = `
      <div class="patient-record-profile-main">
        <div class="patient-record-profile-avatar">
          ${escapeHTML(getInitials(patient))}
        </div>
        <div class="patient-record-profile-info">
          <h2>
            ${escapeHTML(name || "Unnamed Patient")}
          </h2>
          <span>
            ${escapeHTML(patientId)}
          </span>
        </div>
      </div>
      <div class="patient-record-profile-status">
        <span class="patient-record-status-dot"></span>
        Active Patient
      </div>
    `;
  $("patientPageOverview").innerHTML = `
  <div class="patient-overview">
    <div class="patient-overview-heading">
  <div>
  </div>
</div>
    <section class="patient-overview-summary-card">
      <div class="patient-overview-summary-avatar">
        ${escapeHTML(getInitials(patient))}
      </div>
      <div class="patient-overview-summary-main">
        <span class="patient-overview-label">PATIENT SUMMARY</span>
        <h3>${escapeHTML(name || "Unnamed Patient")}</h3>
        <div class="patient-overview-summary-meta">
          <span>
            <i class="fa-regular fa-id-card"></i>
            ${escapeHTML(patientId)}
          </span>
          <span>
            <i class="fa-solid fa-venus-mars"></i>
            ${escapeHTML(gender)}
          </span>
          <span>
            <i class="fa-solid fa-cake-candles"></i>
            ${age === "" ? "Age not provided" : `${age} years old`}
          </span>
          <span>
            <i class="fa-solid fa-phone"></i>
            ${escapeHTML(valueOrNone(patient.phone))}
          </span>
        </div>
      </div>
    </section>
    <div class="patient-overview-stats">
      <div class="patient-overview-stat-card">
        <div class="patient-overview-stat-icon">
          <i class="fa-regular fa-calendar-check"></i>
        </div>
        <div>
          <span>APPOINTMENTS</span>
          <strong>${appointments.length}</strong>
          <small>
            ${
              appointments.length === 1
                ? "recorded appointment"
                : "recorded appointments"
            }
          </small>
        </div>
      </div>
      <div class="patient-overview-stat-card">
        <div class="patient-overview-stat-icon">
          <i class="fa-solid fa-tooth"></i>
        </div>
        <div>
          <span>TREATMENTS</span>
          <strong>${
            Array.isArray(patient.treatments) ? patient.treatments.length : 0
          }</strong>
          <small>
            ${
              (Array.isArray(patient.treatments)
                ? patient.treatments.length
                : 0) === 1
                ? "actual treatment"
                : "actual treatments"
            }
          </small>
        </div>
      </div>
    </div>
    ${
      appointments.length
        ? (() => {
            const sortedOverviewAppointments = [...appointments].sort(
              (a, b) => {
                const dateA = a.date || a.appointment_date || "";
                const dateB = b.date || b.appointment_date || "";
                const timeA = a.start || a.appointment_time || "";
                const timeB = b.start || b.appointment_time || "";
                return `${dateB} ${timeB}`.localeCompare(`${dateA} ${timeA}`);
              },
            );
            const latestAppointment = sortedOverviewAppointments[0];
            const latestAppointmentDate =
              latestAppointment.date ||
              latestAppointment.appointment_date ||
              "";
            const latestAppointmentTime =
              latestAppointment.start ||
              latestAppointment.appointment_time ||
              "";
            const latestAppointmentService =
              latestAppointment.type ||
              latestAppointment.service_type ||
              "Appointment";
            const latestAppointmentDentist =
              latestAppointment.dentist ||
              latestAppointment.dentist_id ||
              "Not provided";
            const latestAppointmentStatus =
              latestAppointment.status ||
              latestAppointment.appointmentStatus ||
              latestAppointment.state ||
              "Not provided";
            const latestStatusClass = String(latestAppointmentStatus)
              .toLowerCase()
              .replace(/\s+/g, "-");
            return `
              <section class="patient-overview-card patient-overview-latest">
                <div class="patient-overview-card-header">
                  <div>
                    <span class="patient-overview-eyebrow">
                      VISIT HISTORY
                    </span>
                    <h3>Latest Appointment</h3>
                  </div>
                  <span
                    class="patient-overview-status status-${escapeHTML(
                      latestStatusClass,
                    )}"
                  >
                    <span></span>
                    ${escapeHTML(latestAppointmentStatus)}
                  </span>
                </div>
                <div class="patient-overview-latest-content">
                  <div class="patient-overview-latest-main">
                    <strong>
                      ${escapeHTML(latestAppointmentService)}
                    </strong>
                    <div class="patient-overview-latest-meta">
                      <span>
                        <i class="fa-regular fa-calendar"></i>
                        ${escapeHTML(formatDate(latestAppointmentDate))}
                      </span>
                      ${
                        latestAppointmentTime
                          ? `
                            <span>
                              <i class="fa-regular fa-clock"></i>
                              ${escapeHTML(
                                formatTime12Hour(latestAppointmentTime),
                              )}
                            </span>
                          `
                          : ""
                      }
                    </div>
                  </div>
                  <div class="patient-overview-latest-dentist">
                    <span>DENTIST</span>
                    <strong>
                      ${escapeHTML(latestAppointmentDentist)}
                    </strong>
                  </div>
                </div>
              </section>
            `;
          })()
        : `
          <section class="patient-overview-card">
            <div class="patient-overview-card-header">
              <div>
                <span class="patient-overview-eyebrow">
                  VISIT HISTORY
                </span>
                <h3>Latest Appointment</h3>
              </div>
            </div>
            <div class="patient-overview-empty">
              <i class="fa-regular fa-calendar"></i>
              <strong>No appointments recorded</strong>
              <span>
                This patient does not have an appointment history yet.
              </span>
            </div>
          </section>
        `
    }
    <section class="patient-overview-card">
      <div class="patient-overview-card-header">
        <div>
          <span class="patient-overview-eyebrow">
            MEDICAL INFORMATION
          </span>
          <h3>Medical Summary</h3>
        </div>
        ${
          medical
            ? `
              <span class="patient-overview-record-badge">
                <i class="fa-solid fa-circle-check"></i>
                Completed
              </span>
            `
            : `
              <span class="patient-overview-record-badge empty">
                No Record
              </span>
            `
        }
      </div>
      ${
        medical
          ? (() => {
              const concerns = Array.isArray(medical.dentalConcern)
                ? medical.dentalConcern
                : medical.dentalConcern
                  ? [medical.dentalConcern]
                  : [];
              const medicalConditions = Array.isArray(medical.medicalHistory)
                ? medical.medicalHistory
                : medical.medicalHistory
                  ? [medical.medicalHistory]
                  : [];
              const allergies = Array.isArray(medical.allergies)
                ? medical.allergies
                : medical.allergies
                  ? [medical.allergies]
                  : [];
              if (medical.medicalOther) {
                medicalConditions.push(medical.medicalOther);
              }
              if (medical.allergyOther) {
                allergies.push(medical.allergyOther);
              }
              return `
                <div class="patient-overview-medical-grid">
                  <div class="patient-overview-medical-item">
                    <span>Dental Concern</span>
                    <strong>
                      ${
                        concerns.length
                          ? escapeHTML(concerns.join(", "))
                          : "None reported"
                      }
                    </strong>
                  </div>
                  <div class="patient-overview-medical-item">
                    <span>Medical Conditions</span>
                    <strong>
                      ${
                        medicalConditions.length
                          ? escapeHTML(medicalConditions.join(", "))
                          : "None reported"
                      }
                    </strong>
                  </div>
                  <div class="patient-overview-medical-item">
                    <span>Allergies</span>
                    <strong>
                      ${
                        allergies.length
                          ? escapeHTML(allergies.join(", "))
                          : "None reported"
                      }
                    </strong>
                  </div>
                </div>
              `;
            })()
          : `
            <div class="patient-overview-empty compact">
              <i class="fa-solid fa-notes-medical"></i>
              <strong>No medical record</strong>
              <span>
                No completed medical form is available for this patient.
              </span>
            </div>
          `
      }
    </section>
    <section class="patient-overview-card">
      <div class="patient-overview-card-header">
        <div>
          <span class="patient-overview-eyebrow">
            CLINICAL RECORDS
          </span>
          <h3>Clinical Record Summary</h3>
        </div>
      </div>
      <div class="patient-overview-record-grid">
        <div class="patient-overview-record-item">
          <div class="patient-overview-record-icon">
            <i class="fa-solid fa-tooth"></i>
          </div>
          <div>
            <strong>Dental Chart</strong>
            <span>
              ${
                patient.dentalChart &&
                patient.dentalChart.teeth &&
                typeof patient.dentalChart.teeth === "object"
                  ? Object.keys(patient.dentalChart.teeth).length
                  : 0
              }
              teeth recorded
            </span>
          </div>
        </div>
        <div class="patient-overview-record-item">
          <div class="patient-overview-record-icon">
            <i class="fa-regular fa-images"></i>
          </div>
          <div>
            <strong>Clinical Images</strong>
            <span>
              ${
                Array.isArray(patient.clinicalImages)
                  ? patient.clinicalImages.length
                  : 0
              }
              ${
                Array.isArray(patient.clinicalImages) &&
                patient.clinicalImages.length === 1
                  ? "record"
                  : "records"
              }
            </span>
          </div>
        </div>
        <div class="patient-overview-record-item">
          <div class="patient-overview-record-icon">
            <i class="fa-solid fa-file-medical"></i>
          </div>
          <div>
            <strong>Treatments</strong>
            <span>
              ${
                Array.isArray(patient.treatments)
                  ? patient.treatments.length
                  : 0
              }
              actual ${
                Array.isArray(patient.treatments) &&
                patient.treatments.length === 1
                  ? "treatment"
                  : "treatments"
              }
            </span>
          </div>
        </div>
        <div class="patient-overview-record-item">
          <div class="patient-overview-record-icon">
            <i class="fa-regular fa-calendar-days"></i>
          </div>
          <div>
            <strong>Appointments</strong>
            <span>
              ${appointments.length}
              ${
                appointments.length === 1 ? "visit recorded" : "visits recorded"
              }
            </span>
          </div>
        </div>
      </div>
    </section>
  </div>
`;
  if (medical) {
    $("patientPageMedical").innerHTML = buildMedicalResult(patient, medical);
  } else {
    $("patientPageMedical").innerHTML = `
        <div class="patient-record-section">
          <div class="patient-record-section-header">
            <div>
              <span class="patient-record-section-eyebrow">
                MEDICAL RECORD
              </span>
              <h3>Medical Record</h3>
            </div>
          </div>
          <div class="patient-record-empty">
            <i class="fa-solid fa-notes-medical"></i>
            <strong>No medical form completed</strong>
            <span>
              This patient does not have a completed medical
              form yet.
            </span>
          </div>
        </div>
      `;
  }
  $("patientPageDental").innerHTML = buildDentalChartWorkspace(patient);
  bindDentalChartWorkspace(patient);
  $("patientPageImages").innerHTML = buildClinicalImagesWorkspace(patient);
  bindClinicalImagesWorkspace(patient);
  console.log("=== DENTANUEVA TREATMENT DEBUG ===");
  console.log("Patient ID:", patient.patientId || patient.id);
  console.log("Patient Name:", getFullName(patient));
  console.log("Patient Object:", patient);
  console.log("Treatments:", patient.treatments);
  console.log(
    "Treatment Count:",
    Array.isArray(patient.treatments) ? patient.treatments.length : "NOT ARRAY",
  );
  $("patientPageTreatments").innerHTML = buildTreatmentWorkspace(patient);
  console.log("Rendered Treatment HTML:", $("patientPageTreatments").innerHTML);
  bindTreatmentWorkspace(patient);
  if (appointments.length) {
    const sortedAppointments = [...appointments].sort((a, b) => {
      const dateA = a.date || a.appointment_date || "";
      const dateB = b.date || b.appointment_date || "";
      const timeA = a.start || a.appointment_time || "";
      const timeB = b.start || b.appointment_time || "";
      return `${dateB} ${timeB}`.localeCompare(`${dateA} ${timeA}`);
    });
    $("patientPageAppointments").innerHTML = `
            <div class="patient-record-section appointment-history-section">
              <div class="patient-record-section-header">
                <div>
                  <span class="patient-record-section-eyebrow" style="font-size:10px;color:#087f3f;">
  VISIT HISTORY
</span>
<p class="appointment-history-description" style="margin-top:4px;color:#7d8982;font-size:10px;">
  Patient appointment schedule and visit status.
</p>
                </div>
                <div class="appointment-history-count">
                  ${sortedAppointments.length}
                  ${sortedAppointments.length === 1 ? "Appointment" : "Appointments"}
                </div>
              </div>
              <div class="patient-appointment-history-list">
                ${sortedAppointments
                  .map((appointment) => {
                    const appointmentDate =
                      appointment.date || appointment.appointment_date || "";
                    const appointmentTime =
                      appointment.start || appointment.appointment_time || "";
                    const service =
                      appointment.type ||
                      appointment.service_type ||
                      "Appointment";
                    const dentist =
                      appointment.dentist ||
                      appointment.dentist_id ||
                      "Not provided";
                    const status =
                      appointment.status ||
                      appointment.appointmentStatus ||
                      appointment.state ||
                      "Not provided";
                    const appointmentId =
                      appointment.id || appointment.appointmentId || "";
                    const normalizedStatus = String(status)
                      .toLowerCase()
                      .replace(/\s+/g, "-");
                    return `
                      <article class="patient-appointment-card">
                        <div class="patient-appointment-card-main">
                          <div class="patient-appointment-date-box">
                            <span class="patient-appointment-date-label">
                              DATE
                            </span>
                            <strong>
                              ${escapeHTML(formatDate(appointmentDate))}
                            </strong>
                            ${
                              appointmentTime
                                ? `
                                  <span class="patient-appointment-time">
                                    <i class="fa-regular fa-clock"></i>
                                    ${escapeHTML(
                                      formatTime12Hour(appointmentTime),
                                    )}
                                  </span>
                                `
                                : `
                                  <span class="patient-appointment-time">
                                    <i class="fa-regular fa-clock"></i>
                                    Time not provided
                                  </span>
                                `
                            }
                          </div>
                          <div class="patient-appointment-details">
                            <div class="patient-appointment-title-row">
                              <h4>
                                ${escapeHTML(service)}
                              </h4>
                              <span
                                class="patient-appointment-status status-${escapeHTML(
                                  normalizedStatus,
                                )}"
                              >
                                <span class="patient-appointment-status-dot"></span>
                                ${escapeHTML(status)}
                              </span>
                            </div>
                            <div class="patient-appointment-meta">
                              <div class="patient-appointment-meta-item">
                                <i class="fa-solid fa-user-doctor"></i>
                                <div>
                                  <span>DENTIST</span>
                                  <strong>
                                    ${escapeHTML(dentist)}
                                  </strong>
                                </div>
                              </div>
                              ${
                                appointmentId
                                  ? `
                                    <div class="patient-appointment-meta-item">
                                      <i class="fa-regular fa-calendar-check"></i>
                                      <div>
                                        <span>APPOINTMENT ID</span>
                                        <strong>
                                          ${escapeHTML(String(appointmentId))}
                                        </strong>
                                      </div>
                                    </div>
                                  `
                                  : ""
                              }
                            </div>
                          </div>
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            </div>
          `;
  } else {
    $("patientPageAppointments").innerHTML = `
            <div class="patient-record-section appointment-history-section">
              <div class="patient-record-section-header">
                <div>
                  <span class="patient-record-section-eyebrow" style="font-size:10px;color:#087f3f;">
  VISIT HISTORY
</span>
<p class="appointment-history-description" style="margin-top:4px;color:#7d8982;font-size:10px;">
  Patient appointment schedule and visit status.
</p>
                </div>
              </div>
              <div class="patient-record-empty">
                <i class="fa-regular fa-calendar"></i>
                <strong>
                  No appointments found
                </strong>
                <span>
                  No appointments are currently recorded for
                  this patient.
                </span>
              </div>
            </div>
          `;
  }
  bindPatientRecordPageTabs();
  $("patientRecordPage").hidden = false;
  $("patientRecordPage").classList.add("open");
  applyStaffReadOnlyMode();
  document.querySelector(".patient-list-card")?.setAttribute("hidden", "");
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
function buildClinicalImagesWorkspace(patient) {
  const patientId = String(
    patient.patientId || patient.patient_id || patient.id || "",
  );
  const images = Array.isArray(patient.clinicalImages)
    ? patient.clinicalImages
    : [];
  const sortedImages = [...images].sort(
    (a, b) =>
      new Date(b.date || b.createdAt || 0).getTime() -
      new Date(a.date || a.createdAt || 0).getTime(),
  );
  return `
    <div class="patient-record-section">
      <div class="patient-record-section-header">
        <div>
          <span class="patient-record-section-eyebrow" style="color:#087f3f; font-size:10px"> 
            CLINICAL DOCUMENTATION
          </span>
          <p>
            Patient-specific clinical photographs and documentation.
          </p>
        </div>
        <button type="button" class="patient-record-edit-btn clinical-images-add-btn" id="addClinicalImageBtn" style="width:auto;min-width:0;padding:0 12px;height:31px;"> 
  <i class="fa-solid fa-plus"></i> 
  Add Clinical Images 
</button>
      </div>
      <div
        class="clinical-images-form"
        id="clinicalImagesForm"
        hidden
      >
        <div class="clinical-images-form-header">
          <span>NEW CLINICAL IMAGES</span>
          <h4>Add Before & After Images</h4>
        </div>
        <div class="clinical-images-form-grid">
          <div class="clinical-images-form-field">
            <label for="clinicalImageTitle">
              TITLE
            </label>
            <input
              type="text"
              id="clinicalImageTitle"
              placeholder="e.g. Tooth Restoration, Orthodontic Progress"
              autocomplete="off"
            />
          </div>
          <div class="clinical-images-form-field">
            <label for="clinicalImageDate">
              DATE
            </label>
            <input
              type="date"
              id="clinicalImageDate"
              value="${getLocalDateString()}"
            />
          </div>
          <div class="clinical-images-form-field full">
            <label for="clinicalImageDescription">
              DESCRIPTION
              <span class="clinical-images-optional">
                (Optional)
              </span>
            </label>
            <textarea
              id="clinicalImageDescription"
              rows="3"
              placeholder="Enter clinical image description..."
            ></textarea>
          </div>
        </div>
        <div class="clinical-images-upload-grid">
          <div class="clinical-image-upload-box before">
            <div class="clinical-image-upload-label">
              <span>BEFORE</span>
            </div>
            <div
              class="clinical-image-upload-preview"
              id="clinicalBeforePreview"
            >
              <i class="fa-regular fa-image"></i>
              <strong>
                Click to upload before image
              </strong>
              <small>
                JPG, PNG, or WEBP (Max 2 MB)
              </small>
            </div>
            <input
              type="file"
              id="clinicalBeforeFile"
              accept="image/jpeg,image/png,image/webp"
              hidden
            />
          </div>
          <div class="clinical-image-upload-box after">
            <div class="clinical-image-upload-label">
              <span>AFTER</span>
            </div>
            <div
              class="clinical-image-upload-preview"
              id="clinicalAfterPreview"
            >
              <i class="fa-regular fa-image"></i>
              <strong>
                Click to upload after image
              </strong>
              <small>
                JPG, PNG, or WEBP (Max 2 MB)
              </small>
            </div>
            <input
              type="file"
              id="clinicalAfterFile"
              accept="image/jpeg,image/png,image/webp"
              hidden
            />
          </div>
        </div>
        <div class="clinical-images-form-actions">
          <button
            type="button"
            class="clinical-images-cancel-btn"
            id="cancelClinicalImageBtn"
          >
            Cancel
          </button>
          <button
            type="button"
            class="clinical-images-save-btn"
            id="saveClinicalImageBtn"
          >
            <i class="fa-solid fa-check"></i>
            Save Images
          </button>
        </div>
      </div>
      ${
        sortedImages.length
          ? `
            <div class="clinical-images-recorded-title">
              RECORDED CLINICAL IMAGES
            </div>
            <div class="clinical-images-grid">
              ${sortedImages
                .map((image) => {
                  const beforeImage =
                    image.beforeImageData ||
                    image.beforeImage ||
                    image.imageData ||
                    "";
                  const afterImage =
                    image.afterImageData || image.afterImage || "";
                  const title = image.title || "Clinical Images";
                  const date = image.date || image.createdAt || "";
                  const description = image.description || "";
                  return `
                    <div
                      class="clinical-image-card"
                      data-clinical-image-id="${escapeHTML(
                        String(image.id || ""),
                      )}"
                    >
                      <div class="clinical-image-pair">
                        <div class="clinical-image-side">
                          <div class="clinical-image-side-label before">
                            BEFORE
                          </div>
                          ${
                            beforeImage
                              ? `
                                <img
                                  src="${escapeHTML(beforeImage)}"
                                  alt="Before ${escapeHTML(title)}"
                                  data-clinical-view="${escapeHTML(
                                    String(image.id || ""),
                                  )}"
                                />
                              `
                              : `
                                <div class="clinical-image-no-image">
                                  <i class="fa-regular fa-image"></i>
                                  <span>No image</span>
                                </div>
                              `
                          }
                        </div>
                        <div class="clinical-image-side">
                          <div class="clinical-image-side-label after">
                            AFTER
                          </div>
                          ${
                            afterImage
                              ? `
                                <img
                                  src="${escapeHTML(afterImage)}"
                                  alt="After ${escapeHTML(title)}"
                                  data-clinical-view="${escapeHTML(
                                    String(image.id || ""),
                                  )}"
                                />
                              `
                              : `
                                <div class="clinical-image-no-image">
                                  <i class="fa-regular fa-image"></i>
                                  <span>No image</span>
                                </div>
                              `
                          }
                        </div>
                      </div>
                      <div class="clinical-image-card-body">
                        <h4 class="clinical-image-card-title">
                          ${escapeHTML(title)}
                        </h4>
                        <span class="clinical-image-card-date">
                          <i class="fa-regular fa-calendar"></i>
                          ${escapeHTML(formatDate(String(date).slice(0, 10)))}
                        </span>
                        ${
                          description
                            ? `
                              <p class="clinical-image-card-description">
                                ${escapeHTML(description)}
                              </p>
                            `
                            : ""
                        }
                        <div class="clinical-image-card-actions">
                          <button
                            type="button"
                            class="clinical-image-action-btn"
                            data-clinical-view="${escapeHTML(
                              String(image.id || ""),
                            )}"
                          >
                            <i class="fa-solid fa-expand"></i>
                            View
                          </button>
                          <button
                            type="button"
                            class="clinical-image-action-btn danger"
                            data-clinical-delete="${escapeHTML(
                              String(image.id || ""),
                            )}"
                          >
                            <i class="fa-solid fa-trash"></i>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
          : `
            <div class="clinical-images-empty">
              <i class="fa-regular fa-images"></i>
              <strong>
                No clinical images yet
              </strong>
              <span>
                Add before and after clinical photographs
                to document the patient's treatment progress.
              </span>
            </div>
          `
      }
    </div>
  `;
}
function bindClinicalImagesWorkspace(patient) {
  const patientId = String(
    patient.patientId || patient.patient_id || patient.id || "",
  );
  const addButton = $("addClinicalImageBtn");
  const form = $("clinicalImagesForm");
  const cancelButton = $("cancelClinicalImageBtn");
  const saveButton = $("saveClinicalImageBtn");
  const titleInput = $("clinicalImageTitle");
  const dateInput = $("clinicalImageDate");
  const descriptionInput = $("clinicalImageDescription");
  const beforeFile = $("clinicalBeforeFile");
  const afterFile = $("clinicalAfterFile");
  const beforePreview = $("clinicalBeforePreview");
  const afterPreview = $("clinicalAfterPreview");
  if (
    !addButton ||
    !form ||
    !cancelButton ||
    !saveButton ||
    !titleInput ||
    !dateInput ||
    !descriptionInput ||
    !beforeFile ||
    !afterFile ||
    !beforePreview ||
    !afterPreview
  ) {
    return;
  }
  if (isStaffReadOnly()) {
    addButton.hidden = true;
    form.hidden = true;
    document
      .querySelectorAll("#patientPageImages [data-clinical-delete]")
      .forEach((button) => {
        button.hidden = true;
      });
  }
  let beforeImageData = "";
  let afterImageData = "";
  const resetForm = () => {
    titleInput.value = "";
    dateInput.value = getLocalDateString();
    descriptionInput.value = "";
    beforeFile.value = "";
    afterFile.value = "";
    beforeImageData = "";
    afterImageData = "";
    beforePreview.innerHTML = `
      <i class="fa-regular fa-image"></i>
      <strong>
        Click to upload before image
      </strong>
      <small>
        JPG, PNG, or WEBP (Max 2 MB)
      </small>
    `;
    afterPreview.innerHTML = `
      <i class="fa-regular fa-image"></i>
      <strong>
        Click to upload after image
      </strong>
      <small>
        JPG, PNG, or WEBP (Max 2 MB)
      </small>
    `;
  };
  const closeForm = () => {
    form.hidden = true;
    resetForm();
  };
  const openForm = () => {
    resetForm();
    form.hidden = false;
    titleInput.focus();
  };
  const readImageFile = (file, preview, type) => {
    if (!file) {
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      alert("Please select a JPG, PNG, or WEBP image.");
      return;
    }
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("Image size must not exceed 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result || "";
      if (!result) {
        return;
      }
      if (type === "before") {
        beforeImageData = result;
      } else {
        afterImageData = result;
      }
      preview.innerHTML = `
        <img
          src="${escapeHTML(result)}"
          alt="${type === "before" ? "Before image" : "After image"}"
        />
        <div class="clinical-image-upload-change">
          Click to change image
        </div>
      `;
    };
    reader.readAsDataURL(file);
  };
  addButton.onclick = openForm;
  cancelButton.onclick = closeForm;
  beforePreview.onclick = () => {
    beforeFile.click();
  };
  afterPreview.onclick = () => {
    afterFile.click();
  };
  beforeFile.onchange = () => {
    readImageFile(beforeFile.files?.[0], beforePreview, "before");
  };
  afterFile.onchange = () => {
    readImageFile(afterFile.files?.[0], afterPreview, "after");
  };
  saveButton.onclick = async () => {
    const title = titleInput.value.trim();
    const date = dateInput.value || getLocalDateString();
    const description = descriptionInput.value.trim();
    if (!title) {
      titleInput.focus();
      alert("Please enter a title for the clinical images.");
      return;
    }
    if (!beforeImageData) {
      alert("Please upload the BEFORE image.");
      return;
    }
    if (!afterImageData) {
      alert("Please upload the AFTER image.");
      return;
    }
    const targetPatient = findPatientById(patientId) || patient;
    if (!targetPatient) {
      return;
    }
    const formData = new FormData();
    formData.append("patient_id", patientId);
    formData.append("title", title);
    formData.append("description", description);
    formData.append("image_date", date);
    formData.append("before_image", beforeFile.files[0]);
    formData.append("after_image", afterFile.files[0]);
    saveButton.disabled = true;
    try {
      const response = await fetch(`${CLINICAL_IMAGES_API}/upload.php`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.message || "Unable to upload clinical images.");
      }
      if (!Array.isArray(targetPatient.clinicalImages)) {
        targetPatient.clinicalImages = [];
      }
      targetPatient.clinicalImages.unshift(result.data);
    } catch (error) {
      alert(error.message || "Unable to upload clinical images.");
      return;
    } finally {
      saveButton.disabled = false;
    }
    const patientIndex = patients.findIndex(
      (item) =>
        String(item.patientId || item.patient_id || item.id || "") ===
        patientId,
    );
    if (patientIndex !== -1) {
      patients[patientIndex] = targetPatient;
    }
    currentPatientRecord = targetPatient;
    savePatients();
    $("patientPageImages").innerHTML =
      buildClinicalImagesWorkspace(targetPatient);
    bindClinicalImagesWorkspace(targetPatient);
  };
  const viewImagePair = (imageId) => {
    const images = Array.isArray(patient.clinicalImages)
      ? patient.clinicalImages
      : [];
    const image = images.find((item) => String(item.id) === String(imageId));
    if (!image) {
      return;
    }
    const beforeImage =
      image.beforeImageData || image.beforeImage || image.imageData || "";
    const afterImage = image.afterImageData || image.afterImage || "";
    const modal = document.createElement("div");
    modal.className = "clinical-image-viewer";
    modal.innerHTML = `
      <div class="clinical-image-viewer-dialog">
        <button
          type="button"
          class="clinical-image-viewer-close"
          aria-label="Close"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="clinical-image-viewer-header">
          <span>
            CLINICAL DOCUMENTATION
          </span>
          <h3>
            ${escapeHTML(image.title || "Clinical Images")}
          </h3>
        </div>
        <div class="clinical-image-viewer-pair">
          <div class="clinical-image-viewer-side">
            <span class="before">
              BEFORE
            </span>
            ${
              beforeImage
                ? `
                  <img
                    src="${escapeHTML(beforeImage)}"
                    alt="Before"
                  />
                `
                : `
                  <div class="clinical-image-viewer-empty">
                    No before image
                  </div>
                `
            }
          </div>
          <div class="clinical-image-viewer-side">
            <span class="after">
              AFTER
            </span>
            ${
              afterImage
                ? `
                  <img
                    src="${escapeHTML(afterImage)}"
                    alt="After"
                  />
                `
                : `
                  <div class="clinical-image-viewer-empty">
                    No after image
                  </div>
                `
            }
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const closeViewer = () => {
      modal.remove();
    };
    modal
      .querySelector(".clinical-image-viewer-close")
      ?.addEventListener("click", closeViewer);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeViewer();
      }
    });
    document.addEventListener("keydown", function handleEscape(event) {
      if (event.key === "Escape") {
        closeViewer();
        document.removeEventListener("keydown", handleEscape);
      }
    });
  };
  const deleteImage = async (imageId) => {
    const targetPatient = findPatientById(patientId) || patient;
    if (!targetPatient) {
      return;
    }
    if (!Array.isArray(targetPatient.clinicalImages)) {
      return;
    }
    const image = targetPatient.clinicalImages.find(
      (item) => String(item.id) === String(imageId),
    );
    if (!image) {
      return;
    }
    const confirmed = window.confirm(
      "Delete this before and after clinical image record?",
    );
    if (!confirmed) {
      return;
    }
    try {
      const formData = new FormData();
      formData.append("image_id", imageId);
      const response = await fetch(`${CLINICAL_IMAGES_API}/delete.php`, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to delete clinical images.");
      }
    } catch (error) {
      alert(error.message || "Unable to delete clinical images.");
      return;
    }
    targetPatient.clinicalImages = targetPatient.clinicalImages.filter(
      (item) => String(item.id) !== String(imageId),
    );
    const patientIndex = patients.findIndex(
      (item) =>
        String(item.patientId || item.patient_id || item.id || "") ===
        patientId,
    );
    if (patientIndex !== -1) {
      patients[patientIndex] = targetPatient;
    }
    currentPatientRecord = targetPatient;
    savePatients();
    $("patientPageImages").innerHTML =
      buildClinicalImagesWorkspace(targetPatient);
    bindClinicalImagesWorkspace(targetPatient);
  };
  document
    .querySelectorAll("#patientPageImages [data-clinical-view]")
    .forEach((element) => {
      element.onclick = () => {
        viewImagePair(element.dataset.clinicalView);
      };
    });
  document
    .querySelectorAll("#patientPageImages [data-clinical-delete]")
    .forEach((element) => {
      element.onclick = () => {
        deleteImage(element.dataset.clinicalDelete);
      };
    });
}
function bindPatientRecordPageTabs() {
  const tabs = document.querySelectorAll(".patient-record-page-tab");
  const panels = document.querySelectorAll(".patient-record-page-panel");
  tabs.forEach((tab) => {
    tab.onclick = () => {
      const target = tab.dataset.patientPageTab;
      tabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("active", active);
        item.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((panel) => {
        const active = panel.dataset.patientPagePanel === target;
        panel.classList.toggle("active", active);
        panel.hidden = !active;
      });
    };
  });
}
function closePatientRecordPage() {
  currentPatientRecord = null;
  currentPatientId = null;
  $("patientRecordPage").hidden = true;
  $("patientRecordPage").classList.remove("open");
  document.querySelector(".patient-list-card")?.removeAttribute("hidden");
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
function bindMedicalFormEvents() {
  $("closeMedicalFormModal")?.addEventListener("click", closeMedicalForm);
  $("cancelMedicalFormBtn")?.addEventListener("click", closeMedicalForm);
  $("medicalFormModalBackdrop")?.addEventListener("click", (event) => {
    if (event.target === $("medicalFormModalBackdrop")) {
      closeMedicalForm();
    }
  });
  $("medformNextBtn")?.addEventListener("click", () => {
    if (currentMedicalStep >= 5) {
      updateMedicalStep();
      return;
    }
    currentMedicalStep++;
    updateMedicalStep();
  });
  $("medformBackBtn")?.addEventListener("click", () => {
    if (currentMedicalStep > 1) {
      currentMedicalStep--;
      updateMedicalStep();
    }
  });
  $("medicalForm")?.addEventListener("submit", saveMedicalForm);
  $("medConsent")?.addEventListener("change", updateSubmitButton);
}
function openMedicalForm(patient, step = 1) {
  currentMedicalPatientId = patient.id || patient.patientId;
  currentMedicalStep = Math.min(Math.max(step, 1), 5);
  resetMedicalForm();
  populateMedicalProfile(patient);
  if (patient.medicalForm) {
    populateExistingMedicalForm(patient.medicalForm);
  }
  $("medicalFormModalBackdrop").classList.add("open");
  $("medicalFormModalBackdrop").setAttribute("aria-hidden", "false");
  updateMedicalStep();
  setTimeout(() => {
    if ($("medformStepViewport")) {
      $("medformStepViewport").scrollTop = 0;
    }
  }, 0);
}
function resetMedicalForm() {
  $("medicalForm")?.reset();
  $("medFormPatientId").value = "";
  $("medPatientName").value = "";
  $("medPatientIdDisplay").value = "";
  $("medDateOfBirth").value = "";
  $("medAge").value = "";
  $("medGender").value = "";
  $("medContact").value = "";
  $("medAddress").value = "";
  $("medEmergencyName").value = "";
  $("medEmergencyContact").value = "";
  $("dentalConcernOther").value = "";
  $("negativeExperienceNote").value = "";
  $("medLastVisit").value = "";
  $("medLastTreatment").value = "";
  $("currentMedicationsList").value = "";
  $("medicalOther").value = "";
  $("allergyOther").value = "";
  $("medConsent").checked = false;
  $("medicalLastUpdated").hidden = true;
  $("medicalLastUpdated").textContent = "";
  $("medformReview").innerHTML = "";
}
function populateMedicalProfile(patient) {
  const name = getFullName(patient);
  const age = calculateAge(patient.dateOfBirth);
  $("medFormPatientId").value = patient.id || patient.patientId || "";
  $("medPatientName").value = name;
  $("medPatientIdDisplay").value = patient.patientId || patient.id || "";
  $("medDateOfBirth").value = formatDate(patient.dateOfBirth);
  $("medAge").value = age === "" ? "" : `${age} years`;
  $("medGender").value = patient.gender || patient.patientGender || "";
  $("medContact").value = patient.phone || "";
  $("medAddress").value = patient.address || "";
  $("medEmergencyName").value = patient.emergencyName || "";
  $("medEmergencyContact").value = patient.emergencyContact || "";
}
function populateExistingMedicalForm(medical) {
  setCheckboxValues("dentalConcern", medical.dentalConcern);
  if (medical.dentalConcernOther) {
    $("dentalConcernOtherCheck").checked = true;
    $("dentalConcernOther").value = medical.dentalConcernOther;
  }
  setRadioValue("negativeExperience", medical.negativeExperience);
  $("negativeExperienceNote").value = medical.negativeExperienceNote || "";
  $("medLastVisit").value = medical.medLastVisit || "";
  $("medLastTreatment").value = medical.medLastTreatment || "";
  setRadioValue("currentMedications", medical.currentMedications);
  $("currentMedicationsList").value = medical.currentMedicationsList || "";
  setCheckboxValues("medicalHistory", medical.medicalHistory);
  if (medical.medicalOther) {
    $("medicalOtherCheck").checked = true;
    $("medicalOther").value = medical.medicalOther;
  }
  setCheckboxValues("allergies", medical.allergies);
  if (medical.allergyOther) {
    $("allergyOtherCheck").checked = true;
    $("allergyOther").value = medical.allergyOther;
  }
  $("medConsent").checked = !!medical.consent;
  if (medical.updatedAt) {
    $("medicalLastUpdated").hidden = false;
    $("medicalLastUpdated").textContent = `Last updated ${formatDateTime(
      medical.updatedAt,
    )}`;
  }
}
function setCheckboxValues(name, values) {
  const normalized = arrayValue(values);
  document.querySelectorAll(`input[name="${name}"]`).forEach((checkbox) => {
    checkbox.checked = normalized.includes(checkbox.value);
  });
}
function setRadioValue(name, value) {
  if (!value) {
    return;
  }
  const radio = document.querySelector(
    `input[name="${name}"][value="${CSS.escape(value)}"]`,
  );
  if (radio) {
    radio.checked = true;
  }
}
function updateMedicalStep() {
  document.querySelectorAll(".medform-step").forEach((step) => {
    const stepNumber = Number(step.dataset.step);
    step.classList.toggle("active", stepNumber === currentMedicalStep);
  });
  document.querySelectorAll(".medform-progress-step").forEach((step) => {
    const stepNumber = Number(step.dataset.step);
    step.classList.toggle("active", stepNumber === currentMedicalStep);
    step.classList.toggle("completed", stepNumber < currentMedicalStep);
  });
  const progress = ((currentMedicalStep - 1) / 4) * 100;
  if ($("medformProgressFill")) {
    $("medformProgressFill").style.width = `${progress}%`;
  }
  const backButton = $("medformBackBtn");
  const nextButton = $("medformNextBtn");
  const submitButton = $("medformSubmitBtn");
  if (backButton) {
    const firstStep = currentMedicalStep === 1;
    backButton.hidden = firstStep;
    backButton.setAttribute("aria-hidden", firstStep ? "true" : "false");
    backButton.tabIndex = firstStep ? -1 : 0;
  }
  if (nextButton) {
    const isFinalStep = currentMedicalStep === 5;
    nextButton.hidden = isFinalStep;
    nextButton.disabled = isFinalStep;
    nextButton.setAttribute("aria-hidden", isFinalStep ? "true" : "false");
    nextButton.tabIndex = isFinalStep ? -1 : 0;
    if (isFinalStep) {
      nextButton.style.setProperty("display", "none", "important");
    } else {
      nextButton.style.removeProperty("display");
    }
  }
  if (submitButton) {
    const isFinalStep = currentMedicalStep === 5;
    submitButton.hidden = !isFinalStep;
    submitButton.setAttribute("aria-hidden", !isFinalStep ? "true" : "false");
    if (isFinalStep) {
      submitButton.style.removeProperty("display");
    } else {
      submitButton.style.setProperty("display", "none", "important");
    }
  }
  $("medformStepActions")?.classList.toggle(
    "is-final-step",
    currentMedicalStep === 5,
  );
  if (currentMedicalStep === 5) {
    buildMedicalReview();
  }
  if ($("medformStepViewport")) {
    $("medformStepViewport").scrollTop = 0;
  }
  updateSubmitButton();
}
function updateSubmitButton() {
  const submitButton = $("medformSubmitBtn");
  if (!submitButton) {
    return;
  }
  if (currentMedicalStep !== 5) {
    submitButton.disabled = false;
    return;
  }
  submitButton.disabled = !$("medConsent").checked;
}
function buildMedicalReview() {
  const data = collectMedicalFormData(false);
  $("medformReview").innerHTML = `
      <div class="review-card">
        <h4>Dental Concern</h4>
        ${reviewRow(
          "Reason for Visit",
          data.dentalConcern.join(", ") || "Not provided",
        )}
        ${reviewRow("Other Concern", data.dentalConcernOther || "None")}
        ${reviewRow("Negative Experience", data.negativeExperience || "No")}
        ${reviewRow("Explanation", data.negativeExperienceNote || "None")}
      </div>
      <div class="review-card">
        <h4>Dental History</h4>
        ${reviewRow(
          "Last Dental Visit",
          data.medLastVisit ? formatDate(data.medLastVisit) : "Not provided",
        )}
        ${reviewRow("Last Treatment", data.medLastTreatment || "Not provided")}
        ${reviewRow("Current Medications", data.currentMedications || "No")}
        ${reviewRow("Medication List", data.currentMedicationsList || "None")}
      </div>
      <div class="review-card">
        <h4>
          Medical History &amp; Allergies
        </h4>
        ${reviewRow(
          "Medical Conditions",
          data.medicalHistory.join(", ") || "None reported",
        )}
        ${reviewRow("Other Medical Condition", data.medicalOther || "None")}
        ${reviewRow("Allergies", data.allergies.join(", ") || "None reported")}
        ${reviewRow("Other Allergy", data.allergyOther || "None")}
      </div>
    `;
}
function reviewRow(label, value) {
  return `
      <div class="review-row">
        <span class="review-label">
          ${escapeHTML(label)}
        </span>
        <span class="review-value">
          ${escapeHTML(valueOrNone(value))}
        </span>
      </div>
    `;
}
function collectMedicalFormData(includeConsent = true) {
  return {
    dentalConcern: Array.from(
      document.querySelectorAll('input[name="dentalConcern"]:checked'),
    ).map((input) => input.value),
    dentalConcernOther: $("dentalConcernOther")?.value.trim() || "",
    negativeExperience:
      document.querySelector('input[name="negativeExperience"]:checked')
        ?.value || "No",
    negativeExperienceNote: $("negativeExperienceNote")?.value.trim() || "",
    medLastVisit: $("medLastVisit")?.value || "",
    medLastTreatment: $("medLastTreatment")?.value.trim() || "",
    currentMedications:
      document.querySelector('input[name="currentMedications"]:checked')
        ?.value || "No",
    currentMedicationsList: $("currentMedicationsList")?.value.trim() || "",
    medicalHistory: Array.from(
      document.querySelectorAll('input[name="medicalHistory"]:checked'),
    ).map((input) => input.value),
    medicalOther: $("medicalOther")?.value.trim() || "",
    allergies: Array.from(
      document.querySelectorAll('input[name="allergies"]:checked'),
    ).map((input) => input.value),
    allergyOther: $("allergyOther")?.value.trim() || "",
    consent: includeConsent ? $("medConsent").checked : false,
  };
}
async function saveMedicalForm(event) {
  event.preventDefault();
  if (currentMedicalStep !== 5) {
    return;
  }
  if (!$("medConsent").checked) {
    $("medConsent").focus();
    return;
  }
  const patient = findPatient(currentMedicalPatientId);
  if (!patient) {
    return;
  }
  const medicalData = collectMedicalFormData(true);
  const now = new Date().toISOString();
  patient.medicalForm = {
    ...medicalData,
    completed: true,
    createdAt: patient.medicalForm?.createdAt || now,
    updatedAt: now,
  };
  patient.updatedAt = now;
  savePatients();
  const saved = await syncPatientProfileToDatabase(patient);
  if (!saved) {
    alert(
      "The medical form could not be saved to the database. Please try again.",
    );
    return;
  }
  closeMedicalForm();
  renderPatients();
}
function closeMedicalForm() {
  $("medicalFormModalBackdrop")?.classList.remove("open");
  $("medicalFormModalBackdrop")?.setAttribute("aria-hidden", "true");
  currentMedicalPatientId = null;
  currentMedicalStep = 1;
  const nextButton = $("medformNextBtn");
  if (nextButton) {
    nextButton.disabled = false;
    nextButton.hidden = false;
    nextButton.removeAttribute("aria-hidden");
    nextButton.tabIndex = 0;
    nextButton.style.removeProperty("display");
  }
  const submitButton = $("medformSubmitBtn");
  if (submitButton) {
    submitButton.hidden = true;
    submitButton.disabled = false;
    submitButton.setAttribute("aria-hidden", "true");
    submitButton.style.setProperty("display", "none", "important");
  }
}
function openMedicalResult(patient) {
  const medical = patient.medicalForm;
  if (!medical) {
    $("medicalResultUpdated").textContent =
      "No medical form has been completed yet.";
    $("medicalResultBody").innerHTML = `
        <div class="medical-result-section">
          <h3>
            Medical Form Not Completed
          </h3>
          <div class="medical-result-value">
            The patient does not have a saved
            Medical &amp; Dental History form yet.
          </div>
        </div>
      `;
    $("editMedicalResultBtn").textContent = "Fill Out Medical Form";
    $("editMedicalResultBtn").dataset.mode = "fill";
  } else {
    $("medicalResultUpdated").textContent = medical.updatedAt
      ? `Last updated ${formatDateTime(medical.updatedAt)}`
      : "";
    $("medicalResultBody").innerHTML = buildMedicalResult(patient, medical);
    $("editMedicalResultBtn").textContent = "Edit Medical Form";
    $("editMedicalResultBtn").dataset.mode = "edit";
  }
  $("editMedicalResultBtn").dataset.patientId = patient.id || patient.patientId;
  $("medicalResultModalBackdrop").classList.add("open");
  $("medicalResultModalBackdrop").setAttribute("aria-hidden", "false");
}
function buildMedicalResult(patient, medical) {
  const concerns = [...arrayValue(medical.dentalConcern)];
  if (medical.dentalConcernOther) {
    concerns.push(medical.dentalConcernOther);
  }
  const medicalHistory = [...arrayValue(medical.medicalHistory)];
  if (medical.medicalOther) {
    medicalHistory.push(medical.medicalOther);
  }
  const allergies = [...arrayValue(medical.allergies)];
  if (medical.allergyOther) {
    allergies.push(medical.allergyOther);
  }
  const negativeExperience = medical.negativeExperience || "";
  const negativeExperienceNote = medical.negativeExperienceNote || "";
  return `
    <div class="medical-record-workspace">
      <section class="medical-record-card">
        <div class="medical-record-card-header">
  <div class="medical-record-card-icon">
    <i class="fa-solid fa-tooth"></i>
  </div>
  <div class="medical-record-card-header-content">
    <span>VISIT INFORMATION</span>
    <h3>Dental Concern</h3>
  </div>
  <div class="medical-record-complete-badge">
    <span></span>
    Completed
  </div>
</div>
        <div class="medical-record-card-body">
          <div class="medical-record-field full">
            <span class="medical-record-field-label">
              Reason for Visit
            </span>
            ${renderResultTags(concerns)}
          </div>
          <div class="medical-record-field">
            <span class="medical-record-field-label">
              Previous Negative Dental Experience
            </span>
            <div class="medical-record-field-value">
              ${escapeHTML(valueOrNone(negativeExperience))}
            </div>
          </div>
          <div class="medical-record-field">
            <span class="medical-record-field-label">
              Experience Notes
            </span>
            <div class="medical-record-field-value">
              ${escapeHTML(valueOrNone(negativeExperienceNote))}
            </div>
          </div>
        </div>
      </section>
      <section class="medical-record-card">
        <div class="medical-record-card-header">
          <div class="medical-record-card-icon">
            <i class="fa-solid fa-heart-pulse"></i>
          </div>
          <div>
            <span>HEALTH INFORMATION</span>
            <h3>Medical History</h3>
          </div>
        </div>
        <div class="medical-record-card-body">
          <div class="medical-record-field full">
            <span class="medical-record-field-label">
              Medical Conditions
            </span>
            ${renderResultTags(medicalHistory)}
          </div>
          <div class="medical-record-field">
            <span class="medical-record-field-label">
              Current Medications
            </span>
            <div class="medical-record-field-value">
              ${escapeHTML(valueOrNone(medical.currentMedications))}
            </div>
          </div>
          <div class="medical-record-field">
            <span class="medical-record-field-label">
              Allergies
            </span>
            ${renderResultTags(allergies)}
          </div>
          <div class="medical-record-field full">
            <span class="medical-record-field-label">
              Medication / Supplement List
            </span>
            <div class="medical-record-field-value large">
              ${escapeHTML(valueOrNone(medical.currentMedicationsList))}
            </div>
          </div>
        </div>
      </section>
      <section class="medical-record-card">
        <div class="medical-record-card-header">
          <div class="medical-record-card-icon">
            <i class="fa-solid fa-calendar-check"></i>
          </div>
          <div>
            <span>DENTAL HISTORY</span>
            <h3>Previous Dental Care</h3>
          </div>
        </div>
        <div class="medical-record-card-body">
          <div class="medical-record-field">
            <span class="medical-record-field-label">
              Last Dental Visit
            </span>
            <div class="medical-record-field-value">
              ${escapeHTML(
                medical.medLastVisit
                  ? formatDate(medical.medLastVisit)
                  : "Not provided",
              )}
            </div>
          </div>
          <div class="medical-record-field">
            <span class="medical-record-field-label">
              Last Dental Treatment
            </span>
            <div class="medical-record-field-value">
              ${escapeHTML(valueOrNone(medical.medLastTreatment))}
            </div>
          </div>
        </div>
      </section>
      <div class="medical-record-consent">
        <div class="medical-record-consent-icon">
          <i class="fa-solid fa-circle-check"></i>
        </div>
        <div>
          <strong>Patient Consent Confirmed</strong>
          <p>
            The patient confirmed that the information
            provided was accurate and agreed to the
            DentaNueva consent.
          </p>
        </div>
      </div>
    </div>
  `;
}
function renderResultTags(values) {
  const cleanValues = values.filter((value) => value && String(value).trim());
  if (!cleanValues.length) {
    return `
        <div class="medical-result-value empty">
          None reported
        </div>
      `;
  }
  return `
      <div class="medical-result-list">
        ${cleanValues
          .map(
            (value) => `
              <span class="medical-result-tag">
                ${escapeHTML(value)}
              </span>
            `,
          )
          .join("")}
      </div>
    `;
}
$("closeMedicalResultModal")?.addEventListener("click", closeMedicalResult);
$("closeMedicalResultBtn")?.addEventListener("click", closeMedicalResult);
$("medicalResultModalBackdrop")?.addEventListener("click", (event) => {
  if (event.target === $("medicalResultModalBackdrop")) {
    closeMedicalResult();
  }
});
$("editMedicalResultBtn")?.addEventListener("click", () => {
  const patientId = $("editMedicalResultBtn").dataset.patientId;
  const mode = $("editMedicalResultBtn").dataset.mode;
  const patient = findPatient(patientId);
  if (!patient) {
    return;
  }
  closeMedicalResult();
  if (mode === "fill" || mode === "edit") {
    openMedicalForm(patient, 1);
  }
});
function closeMedicalResult() {
  $("medicalResultModalBackdrop")?.classList.remove("open");
  $("medicalResultModalBackdrop")?.setAttribute("aria-hidden", "true");
}
function deletePatient(patientId) {
  const patient = findPatient(patientId);
  if (!patient) {
    return;
  }
  const name = getFullName(patient) || "this patient";
  const confirmed = window.confirm(
    `Delete ${name}?\n\nThis will remove the patient record and saved medical form from this browser.`,
  );
  if (!confirmed) {
    return;
  }
  patients = patients.filter(
    (item) =>
      String(item.id || item.patientId) !==
      String(patient.id || patient.patientId),
  );
  savePatients();
  renderPatients();
}
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  if ($("medicalResultModalBackdrop")?.classList.contains("open")) {
    closeMedicalResult();
    return;
  }
  if ($("medicalFormModalBackdrop")?.classList.contains("open")) {
    closeMedicalForm();
    return;
  }
  if ($("patientDetailsModalBackdrop")?.classList.contains("open")) {
    closePatientDetailsModal();
    return;
  }
  if ($("patientModalBackdrop")?.classList.contains("open")) {
    closePatientModal();
    return;
  }
  closeActionMenu();
});
