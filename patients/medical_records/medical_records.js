"use strict";
const PATIENT_RECORD_API = "../../api/patient_records.php";
const APPOINTMENTS_API = "../../api/appointments.php";
const CLINICAL_IMAGES_API = "../../api/clinical_images/get.php";
let currentUser = null;
let currentPatient = null;
let currentStep = 1;
const TOTAL_STEPS = 5;
const $ = (id) => document.getElementById(id);
document.addEventListener("DOMContentLoaded", async () => {
  await initializeMedicalRecords();
});
async function initializeMedicalRecords() {
  currentUser = await hydrateCurrentUser();
  loadOrCreatePatientRecord();
  await hydratePatientRecordFromDatabase();
  await hydratePatientAppointmentsFromDatabase();
  await hydratePatientClinicalImagesFromDatabase();
  bindEvents();
  bindClinicalImageViewer();
  populatePatientProfile();
  updatePageState();
  openPatientRecordTab(null);
}
async function hydratePatientClinicalImagesFromDatabase() {
  if (!currentPatient) {
    return;
  }
  const patientId = String(
    currentPatient.patientId ||
      currentPatient.patient_id ||
      currentPatient.id ||
      "",
  ).trim();
  if (!patientId) {
    currentPatient.clinicalImages = [];
    return;
  }
  try {
    const response = await fetch(
      `${CLINICAL_IMAGES_API}?patient_id=${encodeURIComponent(patientId)}`,
      {
        credentials: "same-origin",
        cache: "no-store",
      },
    );
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(result.message || "Clinical images unavailable.");
    }
    currentPatient.clinicalImages = result.data;
  } catch (error) {
    console.error("Unable to load clinical images from database.", error);
    currentPatient.clinicalImages = [];
  }
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
    return result.data;
  } catch (error) {
    console.error("Unable to load authenticated patient:", error);
    return null;
  }
}
async function hydratePatientAppointmentsFromDatabase() {
  if (!currentPatient) return;
  try {
    const response = await fetch(APPOINTMENTS_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) return;
    currentPatient.appointments = result.data;
  } catch (error) {
    console.warn("Database appointments unavailable.", error);
  }
}
async function hydratePatientRecordFromDatabase() {
  if (!currentUser) {
    return;
  }
  try {
    const response = await fetch(PATIENT_RECORD_API, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }
    const result = await response.json();
    if (!result.success || !result.data) {
      return;
    }
    currentPatient = normalizePatient(result.data);
    const patients = getPatients();
    const patientId = String(currentPatient.patientId || currentPatient.id);
    const index = patients.findIndex(
      (patient) => String(patient.patientId || patient.id) === patientId,
    );
    if (index === -1) {
      patients.push(currentPatient);
    } else {
      patients[index] = { ...patients[index], ...currentPatient };
    }
    savePatients(patients);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: currentPatient.patientId || currentPatient.id,
        patient: currentPatient,
        medicalForm: currentPatient.medicalForm,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Patient record was not saved.");
    }
    return true;
  } catch (error) {
    console.error("Unable to sync patient record to database.", error);
    return false;
  }
}
function bindClinicalImageViewer() {
  const imagePanel = $("patientPageImages");
  if (!imagePanel) {
    return;
  }
  imagePanel.addEventListener("click", (event) => {
    const image = event.target.closest(".patient-clinical-image-panel img");
    if (!image) {
      return;
    }
    const card = image.closest(".patient-clinical-image-readonly");
    const getImageByLabel = (label) =>
      Array.from(card?.querySelectorAll(".patient-clinical-image-panel") || [])
        .find(
          (panel) => panel.querySelector("span")?.textContent.trim() === label,
        )
        ?.querySelector("img")?.src || "";
    openClinicalImageViewer(
      card?.querySelector(".staff-clinical-image-header h4")?.textContent ||
        "Clinical Images",
      getImageByLabel("BEFORE"),
      getImageByLabel("AFTER"),
    );
  });
}
function openClinicalImageViewer(title, beforeImage, afterImage) {
  const modal = document.createElement("div");
  modal.className = "clinical-image-viewer";
  modal.innerHTML = `
      <div class="clinical-image-viewer-dialog">
        <button type="button" class="clinical-image-viewer-close" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="clinical-image-viewer-header">
          <span>CLINICAL DOCUMENTATION</span>
          <h3>${escapeHTML(title)}</h3>
        </div>
        <div class="clinical-image-viewer-pair">
          <div class="clinical-image-viewer-side">
            <span class="before">BEFORE</span>
            ${beforeImage ? `<img src="${escapeHTML(beforeImage)}" alt="Before" />` : `<div class="clinical-image-viewer-empty">No before image</div>`}
          </div>
          <div class="clinical-image-viewer-side">
            <span class="after">AFTER</span>
            ${afterImage ? `<img src="${escapeHTML(afterImage)}" alt="After" />` : `<div class="clinical-image-viewer-empty">No after image</div>`}
          </div>
        </div>
      </div>
    `;
  document.body.appendChild(modal);
  const closeViewer = () => modal.remove();
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
}
function getCurrentUser() {
  return currentUser;
}
function getPatients() {
  return currentPatient ? [currentPatient] : [];
}
function savePatients(patients) {
  if (Array.isArray(patients) && patients[0]) {
    currentPatient = patients[0];
  }
}
function loadOrCreatePatientRecord() {
  const patients = getPatients();
  if (!currentUser) {
    currentPatient = null;
    return;
  }
  const userId = String(
    currentUser.id || currentUser.userId || currentUser.user_id || "",
  ).trim();
  const userEmail = String(currentUser.email || currentUser.emailAddress || "")
    .trim()
    .toLowerCase();
  let existingPatient = null;
  if (userId) {
    existingPatient = patients.find((patient) => {
      const patientUserId = String(
        patient.userId || patient.userIdRef || patient.user_id || "",
      ).trim();
      return patientUserId && patientUserId === userId;
    });
  }
  if (!existingPatient && userEmail) {
    existingPatient = patients.find((patient) => {
      const patientEmail = String(patient.email || "")
        .trim()
        .toLowerCase();
      return patientEmail && patientEmail === userEmail;
    });
  }
  if (!existingPatient && currentUser.patientId) {
    const currentUserPatientId = String(currentUser.patientId).trim();
    const matchingPatient = patients.filter((patient) => {
      const patientId = String(patient.patientId || patient.id || "").trim();
      return patientId === currentUserPatientId;
    });
    if (matchingPatient.length === 1) {
      existingPatient = matchingPatient[0];
    }
  }
  if (existingPatient) {
    currentPatient = normalizePatient(existingPatient);
    if (userId) {
      currentPatient.userId = userId;
    }
    const patientsIndex = patients.findIndex(
      (patient) =>
        String(patient.patientId || patient.id || "").trim() ===
        String(currentPatient.patientId || currentPatient.id || "").trim(),
    );
    if (patientsIndex !== -1) {
      patients[patientsIndex] = {
        ...patients[patientsIndex],
        ...currentPatient,
        userId:
          currentPatient.userId ||
          patients[patientsIndex].userId ||
          userId ||
          "",
      };
      savePatients(patients);
    }
    const patientId = currentPatient.patientId || currentPatient.id;
    if (patientId && currentUser.patientId !== patientId) {
      currentUser.patientId = patientId;
    }
    return;
  }
  const firstName = currentUser.firstName || currentUser.firstname || "";
  const lastName = currentUser.lastName || currentUser.lastname || "";
  const fullName = String(
    currentUser.fullName ||
      currentUser.full_name ||
      currentUser.name ||
      `${firstName} ${lastName}`,
  ).trim();
  const patientId = generatePatientId();
  const now = new Date().toISOString();
  const newPatient = {
    id: patientId,
    patientId: patientId,
    userId: userId,
    firstName: firstName,
    lastName: lastName,
    fullName: fullName,
    dateOfBirth: currentUser.dateOfBirth || "",
    gender: currentUser.gender || currentUser.patientGender || "",
    patientGender: currentUser.gender || currentUser.patientGender || "",
    phone:
      currentUser.phone ||
      currentUser.contactNumber ||
      currentUser.contact ||
      "",
    email: currentUser.email || currentUser.emailAddress || "",
    address: currentUser.address || "",
    emergencyName: currentUser.emergencyName || "",
    emergencyContact: currentUser.emergencyContact || "",
    appointments: [],
    medicalForm: null,
    createdAt: now,
    updatedAt: now,
  };
  patients.push(newPatient);
  savePatients(patients);
  void savePatientRecordToDatabase();
  currentPatient = newPatient;
  currentUser.patientId = patientId;
}
function normalizePatient(patient) {
  const normalized = {
    ...patient,
  };
  if (!normalized.patientId) {
    normalized.patientId = normalized.id || generatePatientId();
  }
  if (!normalized.id) {
    normalized.id = normalized.patientId;
  }
  if (!normalized.userId && currentUser) {
    normalized.userId =
      currentUser.id || currentUser.userId || currentUser.user_id || "";
  }
  if (!normalized.firstName && currentUser) {
    normalized.firstName = currentUser.firstName || currentUser.firstname || "";
  }
  if (!normalized.lastName && currentUser) {
    normalized.lastName = currentUser.lastName || currentUser.lastname || "";
  }
  if (!normalized.fullName && currentUser) {
    normalized.fullName =
      currentUser.fullName || currentUser.full_name || currentUser.name || "";
  }
  if (!normalized.email && currentUser) {
    normalized.email = currentUser.email || currentUser.emailAddress || "";
  }
  if (!normalized.phone && currentUser) {
    normalized.phone =
      currentUser.phone ||
      currentUser.contactNumber ||
      currentUser.contact ||
      "";
  }
  if (!normalized.dateOfBirth && currentUser) {
    normalized.dateOfBirth = currentUser.dateOfBirth || "";
  }
  if (!normalized.gender && currentUser) {
    normalized.gender = currentUser.gender || currentUser.patientGender || "";
  }
  if (!normalized.patientGender) {
    normalized.patientGender = normalized.gender || "";
  }
  if (!normalized.address && currentUser) {
    normalized.address = currentUser.address || "";
  }
  if (!normalized.emergencyName && currentUser) {
    normalized.emergencyName = currentUser.emergencyName || "";
  }
  if (!normalized.emergencyContact && currentUser) {
    normalized.emergencyContact = currentUser.emergencyContact || "";
  }
  if (!Array.isArray(normalized.appointments)) {
    normalized.appointments = [];
  }
  if (!Object.prototype.hasOwnProperty.call(normalized, "medicalForm")) {
    normalized.medicalForm = null;
  }
  return normalized;
}
function generatePatientId() {
  const patients = getPatients();
  let highestNumber = 0;
  patients.forEach((patient) => {
    const value = String(patient.patientId || patient.id || "");
    const match = value.match(/PN-(\d+)/i);
    if (match) {
      highestNumber = Math.max(highestNumber, Number(match[1]));
    }
  });
  const nextNumber = highestNumber + 1;
  return `PN-${String(nextNumber).padStart(4, "0")}`;
}
function getPatientFullName(patient) {
  if (!patient) {
    return "Patient";
  }
  const firstName = patient.firstName || patient.firstname || "";
  const lastName = patient.lastName || patient.lastname || "";
  const combined = `${firstName} ${lastName}`.trim();
  return (
    combined ||
    patient.fullName ||
    patient.name ||
    patient.patientName ||
    "Patient"
  );
}
function getInitials(name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    return "PT";
  }
  const parts = cleanName.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
function bindEvents() {
  $("startRecordBtn")?.addEventListener("click", openMedicalModal);
  document.addEventListener("click", (event) => {
    if (event.target.closest("#editProfileBtn")) {
      openProfileEditModal();
    }
  });
  document.querySelectorAll(".patient-record-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      openPatientRecordTab(tab.dataset.tab);
    });
  });
  $("closeMedicalModal")?.addEventListener("click", closeMedicalModal);
  $("closeProfileEditModal")?.addEventListener("click", closeProfileEditModal);
  $("cancelMedicalBtn")?.addEventListener("click", closeMedicalModal);
  $("cancelProfileEdit")?.addEventListener("click", closeProfileEditModal);
  $("nextMedicalBtn")?.addEventListener("click", nextStep);
  $("backMedicalBtn")?.addEventListener("click", previousStep);
  $("medicalRecordForm")?.addEventListener("submit", saveMedicalRecord);
  $("profileEditForm")?.addEventListener("submit", saveProfileEdit);
  $("successCloseBtn")?.addEventListener("click", closeSuccessModal);
  $("medicalModalBackdrop")?.addEventListener("mousedown", (event) => {
    if (event.target === $("medicalModalBackdrop")) {
      closeMedicalModal();
    }
  });
  $("successModalBackdrop")?.addEventListener("mousedown", (event) => {
    if (event.target === $("successModalBackdrop")) {
      closeSuccessModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    closeMedicalModal();
    closeProfileEditModal();
    closeSuccessModal();
  });
  $("dentalConcernOtherCheck")?.addEventListener(
    "change",
    updateOtherFieldState,
  );
  $("medicalOtherCheck")?.addEventListener("change", updateOtherFieldState);
  $("allergyOtherCheck")?.addEventListener("change", updateOtherFieldState);
  ["phone", "emergencyContact", "editPhone", "editEmergencyContact"].forEach(
    bindPhoneField,
  );
}
function populatePatientProfile() {
  if (!currentPatient) {
    $("profileName").textContent = "Patient";
    $("profilePatientId").textContent = "Patient ID: —";
    $("profileEmail").textContent = "—";
    $("profilePhone").textContent = "—";
    $("profileBirthDate").textContent = "—";
    $("profileGender").textContent = "—";
    if ($("profileAvatar")) {
      $("profileAvatar").textContent = "PT";
    }
    return;
  }
  const fullName = getPatientFullName(currentPatient);
  const patientId = currentPatient.patientId || currentPatient.id || "—";
  const email =
    currentPatient.email ||
    currentUser?.email ||
    currentUser?.emailAddress ||
    "—";
  const phone =
    currentPatient.phone ||
    currentUser?.phone ||
    currentUser?.contactNumber ||
    currentUser?.contact ||
    "—";
  const dateOfBirth =
    currentPatient.dateOfBirth || currentUser?.dateOfBirth || "";
  const gender =
    currentPatient.gender ||
    currentPatient.patientGender ||
    currentUser?.gender ||
    currentUser?.patientGender ||
    "—";
  $("profileName").textContent = fullName;
  $("profilePatientId").textContent = `Patient ID: ${patientId}`;
  $("profileEmail").textContent = email;
  $("profilePhone").textContent = phone;
  $("profileBirthDate").textContent = formatDate(dateOfBirth);
  $("profileGender").textContent = gender;
  if ($("profileAvatar")) {
    $("profileAvatar").textContent = getInitials(fullName);
  }
}
function openProfileEditModal() {
  if (!currentPatient) {
    alert("Patient record could not be found. Please log in again.");
    return;
  }
  $("editFirstName").value = currentPatient.firstName || "";
  $("editLastName").value = currentPatient.lastName || "";
  $("editDateOfBirth").value = currentPatient.dateOfBirth || "";
  $("editGender").value =
    currentPatient.gender || currentPatient.patientGender || "";
  $("editPhone").value = currentPatient.phone || "";
  $("editEmail").value = currentPatient.email || "";
  $("editAddress").value = currentPatient.address || "";
  $("editEmergencyName").value = currentPatient.emergencyName || "";
  $("editEmergencyContact").value = currentPatient.emergencyContact || "";
  $("profileEditModalBackdrop").classList.add("open");
  $("profileEditModalBackdrop").setAttribute("aria-hidden", "false");
}
function closeProfileEditModal() {
  $("profileEditModalBackdrop")?.classList.remove("open");
  $("profileEditModalBackdrop")?.setAttribute("aria-hidden", "true");
}
function saveProfileEdit(event) {
  event.preventDefault();
  const form = $("profileEditForm");
  if (!currentPatient || !form?.checkValidity()) {
    form?.reportValidity();
    return;
  }
  const phone = $("editPhone").value.trim();
  const emergencyContact = $("editEmergencyContact").value.trim();
  if (!/^\+639\d{9}$/.test(phone)) {
    $("editPhone").setCustomValidity(
      "Please enter a valid Philippine phone number.",
    );
    form.reportValidity();
    $("editPhone").setCustomValidity("");
    return;
  }
  if (!/^\+639\d{9}$/.test(emergencyContact)) {
    $("editEmergencyContact").setCustomValidity(
      "Please enter a valid Philippine emergency contact number.",
    );
    form.reportValidity();
    $("editEmergencyContact").setCustomValidity("");
    return;
  }
  const now = new Date().toISOString();
  const firstName = $("editFirstName").value.trim();
  const lastName = $("editLastName").value.trim();
  currentPatient = {
    ...currentPatient,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    dateOfBirth: $("editDateOfBirth").value,
    gender: $("editGender").value,
    patientGender: $("editGender").value,
    phone,
    email: $("editEmail").value.trim(),
    address: $("editAddress").value.trim(),
    emergencyName: $("editEmergencyName").value.trim(),
    emergencyContact,
    updatedAt: now,
  };
  const patients = getPatients();
  const currentId = String(
    currentPatient.patientId || currentPatient.id || "",
  ).trim();
  const index = patients.findIndex(
    (patient) =>
      String(patient.patientId || patient.id || "").trim() === currentId,
  );
  if (index === -1) {
    alert("Patient record could not be saved. Please try again.");
    return;
  }
  patients[index] = {
    ...patients[index],
    ...currentPatient,
    appointments: Array.isArray(patients[index].appointments)
      ? patients[index].appointments
      : [],
    medicalForm: patients[index].medicalForm || currentPatient.medicalForm,
  };
  currentPatient = normalizePatient(patients[index]);
  patients[index] = currentPatient;
  savePatients(patients);
  void savePatientRecordToDatabase();
  if (currentUser) {
    currentUser.patientId = currentPatient.patientId || currentPatient.id;
    currentUser.firstName = currentPatient.firstName;
    currentUser.lastName = currentPatient.lastName;
    currentUser.fullName = currentPatient.fullName;
    currentUser.email = currentPatient.email;
    currentUser.phone = currentPatient.phone;
    currentUser.dateOfBirth = currentPatient.dateOfBirth;
    currentUser.gender = currentPatient.gender;
    currentUser.address = currentPatient.address;
    currentUser.emergencyName = currentPatient.emergencyName;
    currentUser.emergencyContact = currentPatient.emergencyContact;
  }
  closeProfileEditModal();
  populatePatientProfile();
  renderPatientOverview();
  updatePageState();
}
function openPatientRecordTab(tabName) {
  const tabs = document.querySelectorAll(".patient-record-tab");
  const panels = document.querySelectorAll(".patient-record-panel");
  const currentActiveTab = [...tabs].find((tab) =>
    tab.classList.contains("active"),
  );
  const isClosing =
    currentActiveTab && currentActiveTab.dataset.tab === tabName;
  const activeTabName = isClosing ? null : tabName;
  tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === activeTabName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  panels.forEach((panel) => {
    const isActive = panel.dataset.panel === activeTabName;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
  if (activeTabName) {
    renderPatientRecordTab(activeTabName);
  }
}
function renderPatientRecordTab(tabName) {
  if (!currentPatient) {
    return;
  }
  if (tabName === "overview") {
    renderPatientOverview();
    return;
  }
  if (tabName === "medical") {
    renderPatientMedicalRecord();
    return;
  }
  if (tabName === "dental") {
    renderPatientDentalChart();
    return;
  }
  if (tabName === "images") {
    renderPatientClinicalImages();
    return;
  }
  if (tabName === "treatments") {
    renderPatientTreatments();
    return;
  }
  if (tabName === "appointments") {
    renderPatientAppointments();
    void hydratePatientAppointmentsFromDatabase().then(() =>
      renderPatientAppointments(),
    );
  }
}
function renderPatientOverview() {
  const container = $("patientPageOverview");
  if (!container) {
    return;
  }
  const name = getPatientFullName(currentPatient);
  const patientId = currentPatient.patientId || currentPatient.id || "—";
  const gender =
    currentPatient.gender || currentPatient.patientGender || "Not specified";
  container.innerHTML = `
      <div class="patient-overview-card">
        <div class="patient-overview-card-header">
          <div>
            <span class="record-page-eyebrow">PATIENT INFORMATION</span>
            <h3>Personal Information</h3>
          </div>
          <button type="button" class="profile-edit-btn" id="editProfileBtn">
            <i class="fa-solid fa-pen-to-square"></i>
            Edit Record
          </button>
        </div>
        <div class="patient-overview-information-grid">
          ${patientOverviewItem("Patient Name", name)}
          ${patientOverviewItem("Patient ID", patientId)}
          ${patientOverviewItem("Date of Birth", formatDate(currentPatient.dateOfBirth))}
          ${patientOverviewItem("Gender", gender)}
          ${patientOverviewItem("Phone", currentPatient.phone)}
          ${patientOverviewItem("Email", currentPatient.email)}
          ${patientOverviewItem("Emergency Contact", currentPatient.emergencyName)}
          ${patientOverviewItem("Emergency Contact No.", currentPatient.emergencyContact)}
          ${patientOverviewItem("Address", currentPatient.address, true)}
        </div>
      </div>
    `;
}
function patientOverviewItem(label, value, fullWidth = false) {
  return `
      <div class="patient-overview-information-item${fullWidth ? " full-width" : ""}">
        <div>
          <span>${escapeHTML(label)}</span>
          <strong>${escapeHTML(String(value || "Not provided"))}</strong>
        </div>
      </div>
    `;
}
function renderPatientMedicalRecord() {
  const container = $("patientPageMedical");
  if (!container) {
    return;
  }
  const medical = currentPatient.medicalForm;
  if (!medical?.completed) {
    container.innerHTML = `
        <div class="patient-record-empty">
          <i class="fa-solid fa-notes-medical"></i>
          <h3>No Medical Record Yet</h3>
          <p>Your medical and dental history has not been completed yet.</p>
        </div>
      `;
    return;
  }
  const dentalConcerns = [
    ...(Array.isArray(medical.dentalConcern) ? medical.dentalConcern : []),
  ];
  if (medical.dentalConcernOther) {
    dentalConcerns.push(medical.dentalConcernOther);
  }
  const medicalHistory = [
    ...(Array.isArray(medical.medicalHistory) ? medical.medicalHistory : []),
  ];
  if (medical.medicalOther) {
    medicalHistory.push(medical.medicalOther);
  }
  const allergies = [
    ...(Array.isArray(medical.allergies) ? medical.allergies : []),
  ];
  if (medical.allergyOther) {
    allergies.push(medical.allergyOther);
  }
  container.innerHTML = `
      <div class="patient-medical-record-grid">
        <div class="patient-record-info-card">
          <h3>Dental Concern</h3>
          ${patientRecordInfo("Reason for Visit", dentalConcerns.join(", ") || "None provided")}
          ${patientRecordInfo("Negative Dental Experience", medical.negativeExperience || "No")}
          ${patientRecordInfo("Explanation", medical.negativeExperienceNote || "Not provided")}
        </div>
        <div class="patient-record-info-card">
          <h3>Dental History</h3>
          ${patientRecordInfo("Last Dental Visit", formatDate(medical.medLastVisit))}
          ${patientRecordInfo("Last Treatment", medical.medLastTreatment || "Not provided")}
          ${patientRecordInfo("Current Medications", medical.currentMedications || "No")}
          ${patientRecordInfo("Medication / Supplement List", medical.currentMedicationsList || "Not provided")}
        </div>
        <div class="patient-record-info-card">
          <h3>Medical History</h3>
          ${patientRecordInfo("Medical Conditions", medicalHistory.join(", ") || "None provided")}
        </div>
        <div class="patient-record-info-card">
          <h3>Allergies</h3>
          ${patientRecordInfo("Allergies", allergies.join(", ") || "None provided")}
        </div>
      </div>
    `;
}
function patientRecordInfo(label, value) {
  return `
      <div class="patient-record-info-row">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(String(value || "Not provided"))}</strong>
      </div>
    `;
}
function renderPatientDentalChart() {
  const container = $("patientPageDental");
  if (!container || !currentPatient) {
    return;
  }
  const dentalChart =
    currentPatient.dentalChart && typeof currentPatient.dentalChart === "object"
      ? currentPatient.dentalChart
      : {};
  const teeth =
    dentalChart.teeth && typeof dentalChart.teeth === "object"
      ? dentalChart.teeth
      : {};
  const recordedTeeth = Object.keys(teeth)
    .filter((toothNumber) => {
      const record = teeth[toothNumber];
      return (
        record &&
        (String(record.procedure || "").trim() ||
          (Array.isArray(record.history) && record.history.length))
      );
    })
    .sort((a, b) => Number(a) - Number(b));
  const upperLeft = ["18", "17", "16", "15", "14", "13", "12", "11"];
  const upperRight = ["21", "22", "23", "24", "25", "26", "27", "28"];
  const lowerLeft = ["48", "47", "46", "45", "44", "43", "42", "41"];
  const lowerRight = ["31", "32", "33", "34", "35", "36", "37", "38"];
  const toothButton = (number) => {
    const record = teeth[number] || {};
    const hasRecord =
      String(record.procedure || "").trim() ||
      (Array.isArray(record.history) && record.history.length);
    return `
        <div class="patient-dental-tooth-item">
          <span class="patient-dental-tooth-number">${escapeHTML(number)}</span>
          <div class="patient-dental-tooth ${hasRecord ? "recorded" : ""}">
            <i class="fa-solid fa-tooth"></i>
          </div>
        </div>
      `;
  };
  const buildHistory = (number) => {
    const record = teeth[number] || {};
    let history = Array.isArray(record.history) ? [...record.history] : [];
    if (!history.length && record.procedure) {
      history = [
        {
          procedure: record.procedure,
          note: record.note || "",
          updatedAt: record.updatedAt || "",
        },
      ];
    }
    history.sort((a, b) => {
      return (
        new Date(b.updatedAt || 0).getTime() -
        new Date(a.updatedAt || 0).getTime()
      );
    });
    return history
      .map(
        (item, index) => `
          <div class="patient-dental-history-entry">
            <div class="patient-dental-history-entry-dot"></div>
            <div class="patient-dental-history-entry-content">
              <div class="patient-dental-history-entry-title">
                ${escapeHTML(item.procedure || "Dental Procedure")}
                ${
                  index === 0
                    ? `<span class="patient-dental-latest">LATEST</span>`
                    : ""
                }
              </div>
              ${
                item.updatedAt
                  ? `
                    <div class="patient-dental-history-entry-date">
                      ${escapeHTML(
                        formatDate(String(item.updatedAt).slice(0, 10)),
                      )}
                    </div>
                  `
                  : ""
              }
              ${
                item.note
                  ? `
                    <div class="patient-dental-history-entry-note">
                      ${escapeHTML(item.note)}
                    </div>
                  `
                  : ""
              }
            </div>
          </div>
        `,
      )
      .join("");
  };
  const historyRecords = recordedTeeth
    .map(
      (number) => `
        <div class="patient-dental-history-card">
          <div class="patient-dental-history-tooth">
            <div class="patient-dental-history-tooth-icon">
              <i class="fa-solid fa-tooth"></i>
            </div>
            <div>
              <span>TOOTH</span>
              <strong>${escapeHTML(number)}</strong>
            </div>
          </div>
          <div class="patient-dental-history-content">
            ${buildHistory(number)}
          </div>
        </div>
      `,
    )
    .join("");
  container.innerHTML = `
      <div class="patient-record-section">
        <div class="patient-record-section-header">
          <div>
            <span class="patient-record-section-eyebrow">
              ODONTOGRAM
            </span>
            <h3>Dental Chart</h3>
            <p>
              Patient-specific dental procedures recorded by the Doctor.
            </p>
          </div>
          <span class="patient-record-count">
            ${recordedTeeth.length}
            ${recordedTeeth.length === 1 ? "tooth" : "teeth"} recorded
          </span>
        </div>
        <div class="patient-dental-chart-view">
          <div class="patient-dental-arch-label">
            UPPER ARCH
          </div>
          <div class="patient-dental-arch-row">
            ${upperLeft.map(toothButton).join("")}
            <div class="patient-dental-midline">
              MIDLINE
            </div>
            ${upperRight.map(toothButton).join("")}
          </div>
          <div class="patient-dental-divider"></div>
          <div class="patient-dental-arch-row">
            ${lowerLeft.map(toothButton).join("")}
            <div class="patient-dental-midline"></div>
            ${lowerRight.map(toothButton).join("")}
          </div>
          <div class="patient-dental-arch-label">
            LOWER ARCH
          </div>
        </div>
      </div>
      <div class="patient-record-section">
        <div class="patient-record-section-header">
          <div>
            <span class="patient-record-section-eyebrow">
              PROCEDURE HISTORY
            </span>
            <h3>
              ${
                recordedTeeth.length
                  ? "Recorded Dental Procedures"
                  : "No Dental Procedures Yet"
              }
            </h3>
            <p>
              Dental procedures recorded by the Doctor.
            </p>
          </div>
        </div>
        ${
          historyRecords
            ? `
              <div class="patient-dental-history-list">
                ${historyRecords}
              </div>
            `
            : `
              <div class="patient-record-empty">
                <i class="fa-solid fa-tooth"></i>
                <strong>No dental procedures recorded</strong>
                <span>
                  Dental procedures will appear here after they are recorded by the Doctor.
                </span>
              </div>
            `
        }
      </div>
      <div class="patient-record-view-only">
        <i class="fa-solid fa-eye"></i>
        <div>
          <strong>View Only</strong>
          <span>
            Displaying dental procedures recorded by the Doctor. No changes can be made from the Patient account.
          </span>
        </div>
      </div>
    `;
}
function renderPatientClinicalImages() {
  const container = $("patientPageImages");
  if (!container || !currentPatient) {
    return;
  }
  const clinicalImages = Array.isArray(currentPatient.clinicalImages)
    ? [...currentPatient.clinicalImages]
    : [];
  clinicalImages.sort((a, b) => {
    return (
      new Date(b.date || b.createdAt || 0).getTime() -
      new Date(a.date || a.createdAt || 0).getTime()
    );
  });
  if (!clinicalImages.length) {
    container.innerHTML = `
        <div class="patient-record-section">
          <div class="patient-record-section-header">
            <div>
              <span class="patient-record-section-eyebrow">
                CLINICAL DOCUMENTATION
              </span>
              <h3>Clinical Images</h3>
              <p>
                Clinical photographs recorded by the Doctor.
              </p>
            </div>
          </div>
          <div class="patient-record-empty">
            <i class="fa-regular fa-images"></i>
            <strong>No clinical images yet</strong>
            <span>
              Clinical images will appear here after they are uploaded by the Doctor.
            </span>
          </div>
        </div>
      `;
    return;
  }
  container.innerHTML = `
      <div class="patient-record-section">
        <div class="patient-record-section-header">
          <div>
            <span class="patient-record-section-eyebrow">
              CLINICAL DOCUMENTATION
            </span>
            <h3>Clinical Images</h3>
            <p>
              Before and after clinical photographs recorded by the Doctor.
            </p>
          </div>
          <span class="patient-record-count">
            ${clinicalImages.length}
            ${clinicalImages.length === 1 ? "record" : "records"}
          </span>
        </div>
        <div class="staff-clinical-images-list">
          ${clinicalImages
            .map((image) => {
              const title = image.title || "Clinical Image";
              const description = image.description || "";
              const date = image.date || image.createdAt || "";
              const beforeImage =
                image.beforeImageData ||
                image.beforeImage ||
                image.imageData ||
                "";
              const afterImage = image.afterImageData || image.afterImage || "";
              return `
                <div class="staff-clinical-image-card patient-clinical-image-readonly">
                  <div class="staff-clinical-image-header">
                    <div>
                      <h4>${escapeHTML(title)}</h4>
                      ${
                        date
                          ? `
                            <span>
                              <i class="fa-regular fa-calendar"></i>
                              ${escapeHTML(formatDate(String(date).slice(0, 10)))}
                            </span>
                          `
                          : ""
                      }
                    </div>
                    <span class="patient-record-view-only-mini">
                      <i class="fa-solid fa-eye"></i>
                      View Only
                    </span>
                  </div>
                  ${
                    description
                      ? `
                        <div class="staff-clinical-image-description">
                          ${escapeHTML(description)}
                        </div>
                      `
                      : ""
                  }
                  <div class="patient-clinical-image-pair">
                    ${
                      beforeImage
                        ? `
                          <div class="patient-clinical-image-panel">
                            <span>BEFORE</span>
                            <img
                              src="${escapeHTML(beforeImage)}"
                              alt="Before ${escapeHTML(title)}"
                            />
                          </div>
                        `
                        : ""
                    }
                    ${
                      afterImage
                        ? `
                          <div class="patient-clinical-image-panel">
                            <span>AFTER</span>
                            <img
                              src="${escapeHTML(afterImage)}"
                              alt="After ${escapeHTML(title)}"
                            />
                          </div>
                        `
                        : ""
                    }
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="patient-record-view-only">
        <i class="fa-solid fa-eye"></i>
        <div>
          <strong>View Only</strong>
          <span>
            Clinical images are uploaded and managed by the Doctor. Patients cannot add, replace, or delete clinical images.
          </span>
        </div>
      </div>
    `;
}
function renderPatientTreatments() {
  const container = $("patientPageTreatments");
  if (!container || !currentPatient) {
    return;
  }
  const treatments = Array.isArray(currentPatient.treatments)
    ? [...currentPatient.treatments]
    : [];
  treatments.sort((a, b) => {
    return (
      new Date(b.date || b.createdAt || 0).getTime() -
      new Date(a.date || a.createdAt || 0).getTime()
    );
  });
  if (!treatments.length) {
    container.innerHTML = `
        <div class="patient-record-section">
          <div class="patient-record-section-header">
            <div>
              <span class="patient-record-section-eyebrow">
                TREATMENTS
              </span>
              <h3>Actual Treatment</h3>
              <p>
                Actual dental procedures performed and recorded by the Doctor.
              </p>
            </div>
            <span class="patient-record-count">
              0 treatments
            </span>
          </div>
          <div class="patient-record-empty">
            <i class="fa-solid fa-tooth"></i>
            <strong>No treatments recorded yet</strong>
            <span>
              Completed treatments will appear here after they are recorded by the Doctor.
            </span>
          </div>
        </div>
      `;
    return;
  }
  container.innerHTML = `
      <div class="patient-record-section">
        <div class="patient-record-section-header">
          <div>
            <span class="patient-record-section-eyebrow">
              TREATMENTS
            </span>
            <h3>Actual Treatment</h3>
            <p>
              Actual dental procedures performed and recorded by the Doctor.
            </p>
          </div>
          <span class="patient-record-count">
            ${treatments.length}
            ${treatments.length === 1 ? "treatment" : "treatments"}
          </span>
        </div>
        <div class="staff-treatment-list">
          ${treatments
            .map((treatment) => {
              const procedure =
                treatment.procedure ||
                treatment.treatment ||
                "Dental Treatment";
              const tooth = treatment.toothNumber || treatment.tooth || "";
              const date = treatment.date || treatment.createdAt || "";
              const note = treatment.note || treatment.notes || "";
              const consumedMaterials = Array.isArray(
                treatment.consumedMaterials,
              )
                ? treatment.consumedMaterials.filter(
                    (item) => Number(item.quantity) > 0,
                  )
                : [];
              const appointmentId = treatment.appointmentId || "";
              return `
                <div class="staff-treatment-card patient-treatment-readonly">
                  <div class="patient-treatment-date">
                    ${
                      date
                        ? `
                          <strong>
                            ${escapeHTML(formatDate(String(date).slice(0, 10)))}
                          </strong>
                        `
                        : `
                          <strong>Date not provided</strong>
                        `
                    }
                    <span>
                      <i class="fa-regular fa-clock"></i>
                      Actual Treatment
                    </span>
                  </div>
                  <div class="patient-treatment-main">
                    <div class="patient-treatment-title-row">
                      <h4>${escapeHTML(procedure)}</h4>
                      <span class="patient-record-view-only-mini">
                        <i class="fa-solid fa-eye"></i>
                        View Only
                      </span>
                    </div>
                    ${
                      tooth
                        ? `
                          <div class="patient-treatment-detail">
                            <span>TOOTH</span>
                            <strong>${escapeHTML(tooth)}</strong>
                          </div>
                        `
                        : ""
                    }
                    ${
                      appointmentId
                        ? `
                          <div class="patient-treatment-detail">
                            <span>APPOINTMENT ID</span>
                            <strong>${escapeHTML(appointmentId)}</strong>
                          </div>
                        `
                        : ""
                    }
                    ${
                      note
                        ? `
                          <div class="patient-treatment-note">
                            <span>NOTES</span>
                            <p>${escapeHTML(note)}</p>
                          </div>
                        `
                        : ""
                    }
                    ${
                      consumedMaterials.length
                        ? `
                          <div class="patient-treatment-materials">
                            <span><i class="fa-solid fa-boxes-stacked"></i> ITEMS USED</span>
                            <p>${consumedMaterials
                              .map(
                                (item) =>
                                  `${escapeHTML(item.itemName || item.name || "Item")} x ${Number(item.quantity)}`,
                              )
                              .join(" · ")}</p>
                          </div>
                        `
                        : ""
                    }
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="patient-record-view-only">
        <i class="fa-solid fa-eye"></i>
        <div>
          <strong>View Only</strong>
          <span>
            Treatment records are recorded by the Doctor. Patients cannot add, edit, or delete treatment records.
          </span>
        </div>
      </div>
    `;
}
function renderPatientAppointments() {
  const container = $("patientPageAppointments");
  if (!container) {
    return;
  }
  const appointments = Array.isArray(currentPatient.appointments)
    ? [...currentPatient.appointments]
    : [];
  if (!appointments.length) {
    container.innerHTML = `
        <div class="patient-record-empty">
          <i class="fa-solid fa-calendar-check"></i>
          <h3>No Appointments Yet</h3>
          <p>Your appointment history will appear here.</p>
        </div>
      `;
    return;
  }
  appointments.sort((a, b) => {
    const dateA = new Date(
      `${a.appointment_date || a.date || ""}T${
        a.appointment_time || a.start || "00:00"
      }`,
    ).getTime();
    const dateB = new Date(
      `${b.appointment_date || b.date || ""}T${
        b.appointment_time || b.start || "00:00"
      }`,
    ).getTime();
    return dateB - dateA;
  });
  container.innerHTML = `
      <div class="patient-record-table-card">
        <div class="patient-record-table-header">
          <div>
            <span class="record-page-eyebrow">VISIT HISTORY</span>
            <h3>Appointments</h3>
          </div>
        </div>
        <div class="patient-record-table-wrapper">
          <table class="patient-record-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Service</th>
                <th>Dentist</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${appointments
                .map(
                  (appointment) => `
                    <tr>
                      <td>${escapeHTML(formatDate(appointment.appointment_date || appointment.date))}</td>
                      <td>${escapeHTML(
                        appointment.appointment_time ||
                          appointment.start ||
                          "—",
                      )}</td>
                      <td>${escapeHTML(
                        appointment.service_type || appointment.type || "—",
                      )}</td>
                      <td>${escapeHTML(appointment.dentist || "—")}</td>
                      <td>${escapeHTML(appointment.status || "—")}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
}
function updatePageState() {
  const hasProfile = currentPatient && isProfileComplete(currentPatient);
  const medical = currentPatient?.medicalForm || null;
  const hasMedical = medical?.completed === true;
  const percentage = hasMedical ? 100 : 0;
  if ($("overallProgressFill")) {
    $("overallProgressFill").style.width = `${percentage}%`;
  }
  if ($("progressPercentage")) {
    $("progressPercentage").textContent = hasMedical
      ? "Completed"
      : "Incomplete";
    $("progressPercentage").classList.toggle("status-completed", hasMedical);
    $("progressPercentage").classList.toggle("status-incomplete", !hasMedical);
  }
  setChecklistState("checkProfile", hasMedical && hasProfile);
  setChecklistState(
    "checkDentalConcern",
    hasMedical && hasDentalConcern(medical),
  );
  setChecklistState(
    "checkDentalHistory",
    hasMedical && hasDentalHistory(medical),
  );
  setChecklistState(
    "checkMedicalHistory",
    hasMedical && hasMedicalHistory(medical),
  );
  setChecklistState("checkConsent", hasMedical && medical.consent === true);
  if (hasMedical) {
    if ($("recordDescription")) {
      $("recordDescription").textContent =
        "Your medical record has been submitted and is available for viewing.";
    }
    if ($("startRecordBtnText")) {
      $("startRecordBtnText").textContent = "Medical Record Completed";
    }
    if ($("startRecordBtn")) {
      $("startRecordBtn").disabled = false;
      $("startRecordBtn").removeAttribute("aria-disabled");
    }
  } else {
    if ($("recordDescription")) {
      $("recordDescription").textContent =
        "Your medical record has not been completed yet.";
    }
    if ($("startRecordBtnText")) {
      $("startRecordBtnText").textContent = "Complete Medical Record";
    }
    if ($("startRecordBtn")) {
      $("startRecordBtn").disabled = false;
      $("startRecordBtn").removeAttribute("aria-disabled");
    }
  }
}
function isProfileComplete(patient) {
  if (!patient) {
    return false;
  }
  const requiredFields = [
    patient.firstName,
    patient.lastName,
    patient.dateOfBirth,
    patient.gender || patient.patientGender,
    patient.phone,
    patient.email,
    patient.address,
    patient.emergencyName,
    patient.emergencyContact,
  ];
  return requiredFields.every((value) => String(value || "").trim() !== "");
}
function setChecklistState(elementId, complete) {
  const element = $(elementId);
  if (!element) {
    return;
  }
  element.classList.toggle("complete", Boolean(complete));
}
function getCompletedSections() {
  if (!currentPatient) {
    return 0;
  }
  const medical = currentPatient.medicalForm;
  let completed = 0;
  if (isProfileComplete(currentPatient)) {
    completed++;
  }
  if (medical && hasDentalConcern(medical)) {
    completed++;
  }
  if (medical && hasDentalHistory(medical)) {
    completed++;
  }
  if (medical && hasMedicalHistory(medical)) {
    completed++;
  }
  if (medical && medical.consent === true) {
    completed++;
  }
  return completed;
}
function hasDentalConcern(medical) {
  if (!medical) {
    return false;
  }
  const concerns = Array.isArray(medical.dentalConcern)
    ? medical.dentalConcern
    : [];
  return (
    concerns.length > 0 ||
    Boolean(String(medical.dentalConcernOther || "").trim())
  );
}
function hasDentalHistory(medical) {
  if (!medical) {
    return false;
  }
  return (
    Boolean(String(medical.medLastVisit || "").trim()) ||
    Boolean(String(medical.medLastTreatment || "").trim()) ||
    Boolean(String(medical.currentMedications || "").trim()) ||
    Boolean(String(medical.currentMedicationsList || "").trim())
  );
}
function hasMedicalHistory(medical) {
  if (!medical) {
    return false;
  }
  const conditions = Array.isArray(medical.medicalHistory)
    ? medical.medicalHistory
    : [];
  const allergies = Array.isArray(medical.allergies) ? medical.allergies : [];
  return (
    conditions.length > 0 ||
    allergies.length > 0 ||
    Boolean(String(medical.medicalOther || "").trim()) ||
    Boolean(String(medical.allergyOther || "").trim())
  );
}
function getAge(dateValue) {
  if (!dateValue) {
    return "—";
  }
  const birthDate = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return "—";
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
  if (age < 0) {
    return "—";
  }
  return `${age} years old`;
}
function openMedicalModal() {
  if (!currentPatient) {
    alert("Your patient profile could not be loaded. Please log in again.");
    return;
  }
  currentStep =
    currentPatient?.medicalForm?.completed === true ? TOTAL_STEPS : 1;
  loadExistingPatientData();
  loadExistingMedicalData();
  updateOtherFieldState();
  updateModalStep();
  $("medicalModalBackdrop")?.classList.add("open");
  $("medicalModalBackdrop")?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeMedicalModal() {
  $("medicalModalBackdrop")?.classList.remove("open");
  $("medicalModalBackdrop")?.setAttribute("aria-hidden", "true");
  if (!$("successModalBackdrop")?.classList.contains("open")) {
    document.body.style.overflow = "";
  }
}
function loadExistingPatientData() {
  if (!currentPatient) {
    return;
  }
  $("recordPatientId").value =
    currentPatient.patientId || currentPatient.id || "";
  $("firstName").value = currentPatient.firstName || "";
  $("lastName").value = currentPatient.lastName || "";
  $("dateOfBirth").value = currentPatient.dateOfBirth || "";
  $("gender").value =
    currentPatient.gender || currentPatient.patientGender || "";
  $("phone").value = currentPatient.phone || "";
  $("email").value = currentPatient.email || currentUser?.email || "";
  $("address").value = currentPatient.address || "";
  $("emergencyName").value = currentPatient.emergencyName || "";
  $("emergencyContact").value = currentPatient.emergencyContact || "";
}
function loadExistingMedicalData() {
  clearMedicalFields();
  const medical = currentPatient?.medicalForm;
  if (!medical) {
    return;
  }
  const concerns = Array.isArray(medical.dentalConcern)
    ? medical.dentalConcern
    : [];
  document
    .querySelectorAll('input[name="dentalConcern"]')
    .forEach((checkbox) => {
      checkbox.checked = concerns.includes(checkbox.value);
    });
  $("dentalConcernOther").value = medical.dentalConcernOther || "";
  $("dentalConcernOtherCheck").checked = Boolean(medical.dentalConcernOther);
  const negativeExperience = medical.negativeExperience || "No";
  const negativeRadio = document.querySelector(
    `input[name="negativeExperience"][value="${escapeSelectorValue(
      negativeExperience,
    )}"]`,
  );
  if (negativeRadio) {
    negativeRadio.checked = true;
  }
  $("negativeExperienceNote").value = medical.negativeExperienceNote || "";
  $("lastDentalVisit").value = medical.medLastVisit || "";
  $("lastDentalTreatment").value = medical.medLastTreatment || "";
  const currentMedications = medical.currentMedications || "No";
  const medicationRadio = document.querySelector(
    `input[name="currentMedications"][value="${escapeSelectorValue(
      currentMedications,
    )}"]`,
  );
  if (medicationRadio) {
    medicationRadio.checked = true;
  }
  $("medicationList").value = medical.currentMedicationsList || "";
  const medicalHistory = Array.isArray(medical.medicalHistory)
    ? medical.medicalHistory
    : [];
  document
    .querySelectorAll('input[name="medicalHistory"]')
    .forEach((checkbox) => {
      checkbox.checked = medicalHistory.includes(checkbox.value);
    });
  $("medicalOther").value = medical.medicalOther || "";
  $("medicalOtherCheck").checked = Boolean(medical.medicalOther);
  const allergies = Array.isArray(medical.allergies) ? medical.allergies : [];
  document.querySelectorAll('input[name="allergies"]').forEach((checkbox) => {
    checkbox.checked = allergies.includes(checkbox.value);
  });
  $("allergyOther").value = medical.allergyOther || "";
  $("allergyOtherCheck").checked = Boolean(medical.allergyOther);
  $("consentCheckbox").checked = medical.consent === true;
}
function clearMedicalFields() {
  document
    .querySelectorAll('input[name="dentalConcern"]')
    .forEach((checkbox) => (checkbox.checked = false));
  document
    .querySelectorAll('input[name="medicalHistory"]')
    .forEach((checkbox) => (checkbox.checked = false));
  document
    .querySelectorAll('input[name="allergies"]')
    .forEach((checkbox) => (checkbox.checked = false));
  $("dentalConcernOther").value = "";
  $("dentalConcernOtherCheck").checked = false;
  $("negativeExperienceNote").value = "";
  $("lastDentalVisit").value = "";
  $("lastDentalTreatment").value = "";
  $("medicationList").value = "";
  $("medicalOther").value = "";
  $("medicalOtherCheck").checked = false;
  $("allergyOther").value = "";
  $("allergyOtherCheck").checked = false;
  $("consentCheckbox").checked = false;
  const noExperience = document.querySelector(
    'input[name="negativeExperience"][value="No"]',
  );
  if (noExperience) {
    noExperience.checked = true;
  }
  const noMedication = document.querySelector(
    'input[name="currentMedications"][value="No"]',
  );
  if (noMedication) {
    noMedication.checked = true;
  }
}
function nextStep() {
  if (!validateCurrentStep()) {
    return;
  }
  if (currentStep >= TOTAL_STEPS) {
    return;
  }
  currentStep++;
  updateModalStep();
}
function previousStep() {
  if (currentStep <= 1) {
    return;
  }
  currentStep--;
  updateModalStep();
}
function updateModalStep() {
  document.querySelectorAll(".medical-step").forEach((step) => {
    const stepNumber = Number(step.dataset.step);
    step.classList.toggle("active", stepNumber === currentStep);
  });
  const percentage = (currentStep / TOTAL_STEPS) * 100;
  $("medicalProgressFill").style.width = `${percentage}%`;
  document.querySelectorAll(".medical-progress-step").forEach((step) => {
    const stepNumber = Number(step.dataset.step);
    step.classList.toggle("active", stepNumber === currentStep);
    step.classList.toggle("completed", stepNumber < currentStep);
  });
  $("backMedicalBtn").hidden = currentStep === 1;
  $("nextMedicalBtn").hidden = currentStep === TOTAL_STEPS;
  $("saveMedicalBtn").hidden = currentStep !== TOTAL_STEPS;
  if (currentStep === TOTAL_STEPS) {
    buildReview();
  }
  $("medicalStepViewport").scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
function validateCurrentStep() {
  if (currentStep === 1) {
    const fields = [
      $("firstName"),
      $("lastName"),
      $("dateOfBirth"),
      $("gender"),
      $("phone"),
      $("email"),
      $("address"),
      $("emergencyName"),
      $("emergencyContact"),
    ];
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    if (!isValidPhilippinePhone($("phone").value)) {
      $("phone").setCustomValidity(
        "Please enter a valid Philippine mobile number in +639XXXXXXXXX format. Example: +639123456789.",
      );
      $("phone").reportValidity();
      $("phone").setCustomValidity("");
      return false;
    }
    if (!isValidPhilippinePhone($("emergencyContact").value)) {
      $("emergencyContact").setCustomValidity(
        "Please enter a valid Philippine emergency contact number in +639XXXXXXXXX format. Example: +639123456789.",
      );
      $("emergencyContact").reportValidity();
      $("emergencyContact").setCustomValidity("");
      return false;
    }
    return true;
  }
  if (currentStep === 2) {
    const concerns = getCheckedValues("dentalConcern");
    const other = $("dentalConcernOther").value.trim();
    if (concerns.length === 0 && !other) {
      alert("Please select at least one dental concern.");
      return false;
    }
    return true;
  }
  if (currentStep === 3) {
    return true;
  }
  if (currentStep === 4) {
    const noKnownAllergies = document.querySelector(
      'input[name="allergies"][value="No Known Allergies"]',
    );
    const otherAllergy = $("allergyOther").value.trim();
    const allergyValues = getCheckedValues("allergies");
    if (
      noKnownAllergies?.checked &&
      (allergyValues.length > 1 || otherAllergy)
    ) {
      alert(
        "No Known Allergies cannot be selected together with another allergy.",
      );
      return false;
    }
    return true;
  }
  if (currentStep === 5) {
    if (!$("consentCheckbox").checked) {
      alert("Please confirm the consent before saving your medical record.");
      $("consentCheckbox").focus();
      return false;
    }
    return true;
  }
  return true;
}
async function saveMedicalRecord(event) {
  event.preventDefault();
  if (!currentPatient) {
    alert("Patient record could not be found. Please log in again.");
    return;
  }
  if (!validateCurrentStep()) {
    return;
  }
  const dentalConcern = getCheckedValues("dentalConcern");
  const medicalHistory = getCheckedValues("medicalHistory");
  const allergies = getCheckedValues("allergies");
  const dentalConcernOther = $("dentalConcernOther").value.trim();
  const medicalOther = $("medicalOther").value.trim();
  const allergyOther = $("allergyOther").value.trim();
  const cleanedAllergies = normalizeAllergies(allergies, allergyOther);
  const negativeExperience = getRadioValue("negativeExperience") || "No";
  const currentMedications = getRadioValue("currentMedications") || "No";
  const now = new Date().toISOString();
  currentPatient.firstName = $("firstName").value.trim();
  currentPatient.lastName = $("lastName").value.trim();
  currentPatient.fullName =
    `${currentPatient.firstName} ${currentPatient.lastName}`.trim();
  currentPatient.dateOfBirth = $("dateOfBirth").value;
  currentPatient.gender = $("gender").value;
  currentPatient.patientGender = $("gender").value;
  currentPatient.phone = $("phone").value.trim();
  currentPatient.email = $("email").value.trim();
  currentPatient.address = $("address").value.trim();
  currentPatient.emergencyName = $("emergencyName").value.trim();
  currentPatient.emergencyContact = $("emergencyContact").value.trim();
  currentPatient.medicalForm = {
    dentalConcern,
    dentalConcernOther,
    negativeExperience,
    negativeExperienceNote: $("negativeExperienceNote").value.trim(),
    medLastVisit: $("lastDentalVisit").value,
    medLastTreatment: $("lastDentalTreatment").value.trim(),
    currentMedications,
    currentMedicationsList: $("medicationList").value.trim(),
    medicalHistory,
    medicalOther,
    allergies: cleanedAllergies,
    allergyOther,
    consent: $("consentCheckbox").checked,
    completed: true,
    submittedBy: "patient",
    createdAt: currentPatient.medicalForm?.createdAt || now,
    updatedAt: now,
  };
  currentPatient.updatedAt = now;
  const patients = getPatients();
  const currentId = String(
    currentPatient.patientId || currentPatient.id || "",
  ).trim();
  const index = patients.findIndex(
    (patient) =>
      String(patient.patientId || patient.id || "").trim() === currentId,
  );
  if (index !== -1) {
    const existingPatient = patients[index];
    patients[index] = {
      ...existingPatient,
      ...currentPatient,
      patientId: currentPatient.patientId || existingPatient.patientId,
      id: currentPatient.id || existingPatient.id,
      userId:
        currentPatient.userId ||
        existingPatient.userId ||
        currentUser?.id ||
        currentUser?.userId ||
        currentUser?.user_id ||
        "",
      appointments: Array.isArray(currentPatient.appointments)
        ? currentPatient.appointments
        : Array.isArray(existingPatient.appointments)
          ? existingPatient.appointments
          : [],
      medicalForm: currentPatient.medicalForm,
      updatedAt: now,
    };
    currentPatient = normalizePatient(patients[index]);
    patients[index] = currentPatient;
  } else {
    patients.push(currentPatient);
  }
  savePatients(patients);
  const saved = await savePatientRecordToDatabase();
  if (!saved) {
    alert(
      "The medical record could not be saved to the database. Please try again.",
    );
    return;
  }
  if (currentUser) {
    currentUser.patientId = currentPatient.patientId || currentPatient.id;
    currentUser.firstName = currentPatient.firstName;
    currentUser.lastName = currentPatient.lastName;
    currentUser.fullName = currentPatient.fullName;
    currentUser.email = currentPatient.email;
    currentUser.phone = currentPatient.phone;
    currentUser.dateOfBirth = currentPatient.dateOfBirth;
    currentUser.gender = currentPatient.gender;
    currentUser.address = currentPatient.address;
    currentUser.emergencyName = currentPatient.emergencyName;
    currentUser.emergencyContact = currentPatient.emergencyContact;
  }
  closeMedicalModal();
  populatePatientProfile();
  updatePageState();
  openPatientRecordTab("appointments");
  $("patientRecordPage")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}
function getCheckedValues(fieldName) {
  return Array.from(
    document.querySelectorAll(`input[name="${fieldName}"]:checked`),
  ).map((input) => input.value);
}
function getRadioValue(fieldName) {
  const selected = document.querySelector(`input[name="${fieldName}"]:checked`);
  return selected ? selected.value : "";
}
function normalizeAllergies(allergies, otherAllergy) {
  let values = [...allergies];
  if (
    values.includes("No Known Allergies") &&
    (values.length > 1 || otherAllergy)
  ) {
    values = values.filter((value) => value !== "No Known Allergies");
  }
  return values;
}
function handleAllergySelection(event) {
  const selected = event.target;
  if (selected.value === "No Known Allergies" && selected.checked) {
    document.querySelectorAll('input[name="allergies"]').forEach((checkbox) => {
      if (checkbox !== selected) {
        checkbox.checked = false;
      }
    });
    $("allergyOther").value = "";
    $("allergyOtherCheck").checked = false;
    updateOtherFieldState();
  } else if (selected.checked) {
    const noKnown = document.querySelector(
      'input[name="allergies"][value="No Known Allergies"]',
    );
    if (noKnown) {
      noKnown.checked = false;
    }
  }
}
function updateOtherFieldState() {
  const otherFields = [
    {
      check: $("dentalConcernOtherCheck"),
      input: $("dentalConcernOther"),
    },
    {
      check: $("medicalOtherCheck"),
      input: $("medicalOther"),
    },
    {
      check: $("allergyOtherCheck"),
      input: $("allergyOther"),
    },
  ];
  otherFields.forEach(({ check, input }) => {
    if (!check || !input) {
      return;
    }
    input.disabled = !check.checked;
    if (!check.checked) {
      input.value = "";
    }
  });
}
const PHONE_FORMAT_MESSAGE =
  "Please use the format +639XXXXXXXXX (example: +639123456789).";
function formatPhoneInput(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("63")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return "+63" + digits.slice(0, 10);
}
function bindPhoneField(id) {
  const input = $(id);
  if (!input) return;
  input.addEventListener("focus", () => {
    if (!input.value.trim()) {
      input.value = "+63";
    }
  });
  input.addEventListener("input", () => {
    input.value = formatPhoneInput(input.value);
    input.setCustomValidity("");
  });
  input.addEventListener("blur", () => {
    if (input.value === "+63") {
      input.value = "";
    }
  });
  input.addEventListener("invalid", () => {
    input.setCustomValidity(
      isValidPhilippinePhone(input.value) ? "" : PHONE_FORMAT_MESSAGE,
    );
  });
}
function isValidPhilippinePhone(value) {
  return /^\+639\d{9}$/.test(String(value || "").trim());
}
function buildReview() {
  const container = $("medicalReview");
  if (!container) {
    return;
  }
  const concerns = getCheckedValues("dentalConcern");
  const dentalConcernOther = $("dentalConcernOther").value.trim();
  const medicalHistory = getCheckedValues("medicalHistory");
  const medicalOther = $("medicalOther").value.trim();
  const allergies = normalizeAllergies(
    getCheckedValues("allergies"),
    $("allergyOther").value.trim(),
  );
  const allergyOther = $("allergyOther").value.trim();
  const negativeExperience = getRadioValue("negativeExperience") || "No";
  const currentMedications = getRadioValue("currentMedications") || "No";
  const concernValues = [...concerns];
  if (dentalConcernOther) {
    concernValues.push(dentalConcernOther);
  }
  const medicalValues = [...medicalHistory];
  if (medicalOther) {
    medicalValues.push(medicalOther);
  }
  const allergyValues = [...allergies];
  if (allergyOther && !allergyValues.includes(allergyOther)) {
    allergyValues.push(allergyOther);
  }
  container.innerHTML = `
      <div class="review-card">
        <h4>Dental Concern</h4>
        ${reviewRow(
          "Reason for Visit",
          concernValues.length ? concernValues.join(", ") : "None provided",
        )}
        ${reviewRow("Negative Dental Experience", negativeExperience)}
        ${reviewRow("Explanation", $("negativeExperienceNote").value.trim())}
      </div>
      <div class="review-card">
        <h4>Dental History</h4>
        ${reviewRow("Last Dental Visit", formatDate($("lastDentalVisit").value))}
        ${reviewRow("Last Treatment", $("lastDentalTreatment").value.trim())}
        ${reviewRow("Current Medications", currentMedications)}
        ${reviewRow(
          "Medication / Supplement List",
          $("medicationList").value.trim(),
        )}
      </div>
      <div class="review-card">
        <h4>Medical History</h4>
        ${reviewRow(
          "Medical Conditions",
          medicalValues.length ? medicalValues.join(", ") : "None provided",
        )}
      </div>
      <div class="review-card">
        <h4>Allergies</h4>
        ${reviewRow(
          "Allergies",
          allergyValues.length ? allergyValues.join(", ") : "None provided",
        )}
      </div>
    `;
}
function reviewRow(label, value) {
  const cleanValue = String(value || "").trim();
  return `
      <div class="review-row">
        <span class="review-label">
          ${escapeHTML(label)}
        </span>
        <span class="review-value ${cleanValue ? "" : "empty"}">
          ${escapeHTML(cleanValue || "Not provided")}
        </span>
      </div>
    `;
}
function openSuccessModal() {
  $("successModalBackdrop")?.classList.add("open");
  $("successModalBackdrop")?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeSuccessModal() {
  $("successModalBackdrop")?.classList.remove("open");
  $("successModalBackdrop")?.setAttribute("aria-hidden", "true");
  if (
    !$("medicalModalBackdrop")?.classList.contains("open") &&
    !$("patientInformationModalBackdrop")?.classList.contains("open")
  ) {
    document.body.style.overflow = "";
  }
}
function formatDate(dateValue) {
  if (!dateValue) {
    return "Not provided";
  }
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "Not provided";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
function escapeSelectorValue(value) {
  return String(value || "").replace(/"/g, '\\"');
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    currentUser = getCurrentUser();
    loadOrCreatePatientRecord();
    populatePatientProfile();
    updatePageState();
  }
});
setInterval(() => {
  if (document.visibilityState !== "visible") {
    return;
  }
  currentUser = getCurrentUser();
  loadOrCreatePatientRecord();
  populatePatientProfile();
  updatePageState();
}, 1500);
