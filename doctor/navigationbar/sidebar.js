document.addEventListener("DOMContentLoaded", () => {
  loadSidebar();
});
async function loadSidebar() {
  const container = document.getElementById("sidebar-container");
  if (!container) {
    return;
  }
  try {
    const sidebarResponse = await fetch("../navigationbar/sidebar.html", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!sidebarResponse.ok) {
      throw new Error("Failed to load sidebar HTML.");
    }
    const sidebarHTML = await sidebarResponse.text();
    container.innerHTML = sidebarHTML;
    const logoutModal = document.getElementById("logoutModalBackdrop");
    if (logoutModal && logoutModal.parentElement !== document.body) {
      document.body.appendChild(logoutModal);
    }
    const mobileHeader = container.querySelector(".mobile-header");
    const mobileToggle = document.getElementById("mobileMenuToggle");
    const pageHeader = document.querySelector(
      ".main-content header, main header",
    );
    if (mobileHeader && mobileToggle && pageHeader) {
      pageHeader.prepend(mobileToggle);
      mobileHeader.remove();
    }
    setActivePage();
    applySavedSidebarState();
    initSidebarLogic();
    const doctorResponse = await fetch("../navigationbar/sidebar.php", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (doctorResponse.status === 401 || doctorResponse.status === 403) {
      window.location.href = "../../login/login.html";
      return;
    }
    if (!doctorResponse.ok) {
      throw new Error("Failed to load doctor information.");
    }
    const data = await doctorResponse.json();
    if (!data.success || !data.user) {
      window.location.href = "../../login/login.html";
      return;
    }
    const doctor = data.user;
    const nameEl = document.getElementById("activeDoctorName");
    const imageEl = document.getElementById("activeDoctorImage");
    const initialsEl = document.getElementById("activeDoctorInitials");
    const name =
      doctor.name ||
      `${doctor.firstname || ""} ${doctor.lastname || ""}`.trim() ||
      "Doctor";
    const initials = getDoctorInitials(name);
    if (nameEl) {
      nameEl.textContent = name;
      nameEl.dataset.userId = doctor.user_id || "";
      nameEl.dataset.firstname = doctor.firstname || "";
      nameEl.dataset.lastname = doctor.lastname || "";
      nameEl.dataset.role = doctor.role || "doctor";
      nameEl.dataset.doctorId = doctor.doctor_id || "";
      nameEl.dataset.specialization = doctor.specialization || "";
      nameEl.dataset.email = doctor.email || "";
      nameEl.dataset.contact = doctor.contact || "";
      nameEl.dataset.status = doctor.status || "Active";
      nameEl.dataset.profileImage = doctor.profile_image || "";
    }
    if (doctor.profile_image) {
      if (imageEl) {
        imageEl.src = doctor.profile_image;
        imageEl.style.display = "block";
      }
      if (initialsEl) {
        initialsEl.textContent = initials;
        initialsEl.style.display = "none";
      }
    } else {
      if (imageEl) {
        imageEl.removeAttribute("src");
        imageEl.style.display = "none";
      }
      if (initialsEl) {
        initialsEl.textContent = initials;
        initialsEl.style.display = "flex";
      }
    }
  } catch (error) {
    console.error("Failed to load doctor sidebar:", error);
  }
}
function getDoctorInitials(name) {
  if (!name) {
    return "DR";
  }
  const cleanedParts = String(name)
    .trim()
    .replace(/^Dr\.\s*/i, "")
    .replace(/^Dr\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  if (cleanedParts.length === 1) {
    return cleanedParts[0].substring(0, 2).toUpperCase();
  }
  return (
    cleanedParts[0].charAt(0) + cleanedParts[cleanedParts.length - 1].charAt(0)
  ).toUpperCase();
}
function setActivePage() {
  const currentPath = window.location.pathname;
  let pageKey = "";
  if (currentPath.includes("dashboard")) {
    pageKey = "dashboard";
  } else if (currentPath.includes("appointment")) {
    pageKey = "appointment";
  } else if (currentPath.includes("patient")) {
    pageKey = "patients";
  } else if (currentPath.includes("inventory")) {
    pageKey = "inventory";
  } else if (currentPath.includes("finance")) {
    pageKey = "finance";
  }
  if (!pageKey) {
    return;
  }
  const activeLink = document.querySelector(`[data-page="${pageKey}"]`);
  if (activeLink) {
    activeLink.classList.add("active");
  }
}
function applySavedSidebarState() {
  const sidebar = document.getElementById("sidebar");
  const toggleIcon = document.getElementById("toggleIcon");
  if (!sidebar || window.innerWidth <= 768) {
    return;
  }
  sidebar.classList.remove("collapsed");
  if (toggleIcon) {
    toggleIcon.className = "fa-solid fa-chevron-left";
  }
}
function initSidebarLogic() {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const toggleIcon = document.getElementById("toggleIcon");
  const sidebarOverlay = document.getElementById("sidebarOverlay");
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      if (sidebar.classList.contains("collapsed")) {
        if (toggleIcon) {
          toggleIcon.className = "fa-solid fa-chevron-right";
        }
      } else {
        if (toggleIcon) {
          toggleIcon.className = "fa-solid fa-chevron-left";
        }
      }
    });
  }
  if (mobileMenuToggle && sidebar) {
    mobileMenuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
      if (sidebarOverlay) {
        sidebarOverlay.classList.toggle("active");
      }
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => {
      sidebar.classList.remove("mobile-open");
      sidebarOverlay.classList.remove("active");
    });
  }
  const profileTrigger = document.getElementById("sidebarProfileTrigger");
  if (profileTrigger) {
    profileTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (typeof window.openProfileModal === "function") {
        window.openProfileModal();
      } else {
        window.dispatchEvent(new Event("open-doctor-profile"));
      }
    });
    profileTrigger.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      if (typeof window.openProfileModal === "function") {
        window.openProfileModal();
      } else {
        window.dispatchEvent(new Event("open-doctor-profile"));
      }
    });
  }
}
document.addEventListener("click", async (event) => {
  const logoutBtn = event.target.closest(".btn-logout");
  const cancelBtn = event.target.closest("#logoutCancelBtn");
  const confirmBtn = event.target.closest("#logoutConfirmBtn");
  const backdrop = document.getElementById("logoutModalBackdrop");
  if (logoutBtn) {
    event.preventDefault();
    if (backdrop) {
      backdrop.classList.add("active");
      document.body.classList.add("logout-modal-open");
    }
  }
  if (cancelBtn) {
    event.preventDefault();
    if (backdrop) {
      backdrop.classList.remove("active");
      document.body.classList.remove("logout-modal-open");
    }
  }
  if (backdrop && event.target === backdrop) {
    backdrop.classList.remove("active");
    document.body.classList.remove("logout-modal-open");
  }
  if (confirmBtn) {
    event.preventDefault();
    try {
      const response = await fetch("../navigationbar/sidebar.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "action=logout",
        credentials: "same-origin",
      });
      const data = await response.json();
      if (data.success) {
        window.location.href = "../../homepage/homepage.html";
      }
    } catch (error) {
      console.error("Logout request error:", error);
    }
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const backdrop = document.getElementById("logoutModalBackdrop");
  if (backdrop?.classList.contains("active")) {
    backdrop.classList.remove("active");
    document.body.classList.remove("logout-modal-open");
  }
});
window.getLoggedInDoctor = () => {
  const nameEl = document.getElementById("activeDoctorName");
  if (!nameEl) {
    return null;
  }
  return {
    user_id: nameEl.dataset.userId || "",
    firstname: nameEl.dataset.firstname || "",
    lastname: nameEl.dataset.lastname || "",
    name: nameEl.textContent.trim(),
    role: nameEl.dataset.role || "doctor",
    doctor_id: nameEl.dataset.doctorId || "",
    specialization: nameEl.dataset.specialization || "",
    email: nameEl.dataset.email || "",
    contact: nameEl.dataset.contact || "",
    status: nameEl.dataset.status || "Active",
    profile_image: nameEl.dataset.profileImage || "",
  };
};
window.getDoctorInitials = getDoctorInitials;
