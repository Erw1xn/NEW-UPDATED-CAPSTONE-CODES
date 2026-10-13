const TA_APPOINTMENTS_API = "../../api/appointments.php";
const TA_DOCTORS_API = "../../api/doctors.php";
const TA_COLORS = ["#166F63", "#E8A93B", "#FF6B57", "#3B82F6", "#8B5CF6"];
const TA_NO_SHOW_GRACE = 15;
const TA_MAX_VISIBLE = 4;
let taAppointments = [];
let taDoctors = [];
let taLastHtml = "";
document.addEventListener("DOMContentLoaded", () => {
  void taLoad();
  setInterval(() => void taLoad(), 15000);
  setInterval(taRender, 1000);
  window.addEventListener("focus", () => void taLoad());
  window.addEventListener("appointmentsUpdated", () => void taLoad());
  window.addEventListener("appointmentStatusChanged", () => void taLoad());
});
async function taLoad() {
  try {
    const [appointmentResponse, doctorResponse] = await Promise.all([
      fetch(TA_APPOINTMENTS_API, {
        credentials: "same-origin",
        cache: "no-store",
      }),
      fetch(TA_DOCTORS_API, { credentials: "same-origin", cache: "no-store" }),
    ]);
    const appointmentResult = await appointmentResponse.json();
    if (appointmentResponse.ok && Array.isArray(appointmentResult.data)) {
      taAppointments = appointmentResult.data;
    }
    try {
      const doctorResult = await doctorResponse.json();
      if (doctorResponse.ok && Array.isArray(doctorResult.data)) {
        taDoctors = doctorResult.data.filter((doctor) => taDoctorId(doctor));
      }
    } catch (error) {
      taDoctors = taDoctors || [];
    }
  } catch (error) {
    console.warn("Unable to load today's appointments.", error);
  }
  taRender();
}
function taDoctorId(doctor) {
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
function taDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function taToMinutes(time) {
  const parts = String(time || "").split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}
function taFormatMinutes(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function taNormalizeStatus(value) {
  const status = String(value || "scheduled")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (status === "in_consultation") return "in_consultation";
  if (
    ["completed", "complete", "ready_complete", "ready_to_complete"].includes(
      status,
    )
  )
    return "completed";
  if (status === "no_show" || status === "noshow") return "no_show";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  return "scheduled";
}
function taDisplayStatus(appointment, startMinutes, endMinutes, nowMinutes) {
  const status = taNormalizeStatus(appointment.status);
  if (status === "scheduled" && nowMinutes >= startMinutes + TA_NO_SHOW_GRACE) {
    return "no_show";
  }
  if (status === "in_consultation" && nowMinutes >= endMinutes) {
    return "completed";
  }
  return status;
}
function taStatusLabel(status) {
  const labels = {
    scheduled: "Scheduled",
    in_consultation: "In Consultation",
    completed: "Completed",
    no_show: "No Show",
  };
  return labels[status] || "Scheduled";
}
function taDentist(appointment) {
  const id = String(
    appointment.dentist ||
      appointment.dentistId ||
      appointment.dentist_id ||
      appointment.doctorId ||
      appointment.doctor_id ||
      "",
  )
    .trim()
    .toLowerCase();
  const index = taDoctors.findIndex((doctor) => taDoctorId(doctor) === id);
  const rawName = String(
    appointment.doctorName ||
      appointment.dentistName ||
      (index >= 0 ? taDoctors[index].name : "") ||
      "",
  ).trim();
  const name = rawName
    ? /^dr\.?\s/i.test(rawName)
      ? rawName
      : `Dr. ${rawName}`
    : "Unassigned";
  const color = index >= 0 ? TA_COLORS[index % TA_COLORS.length] : "#176B38";
  return { name, color };
}
function taInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function taHexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function taEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function taRender() {
  const list = document.getElementById("todaysAppointmentsList");
  if (!list) return;
  const now = new Date();
  const todayKey = taDateKey(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const items = taAppointments
    .filter(
      (appointment) => String(appointment.date || "").slice(0, 10) === todayKey,
    )
    .filter(
      (appointment) => taNormalizeStatus(appointment.status) !== "cancelled",
    )
    .map((appointment) => {
      const startMinutes = taToMinutes(appointment.start || appointment.time);
      const endMinutes = startMinutes + (Number(appointment.duration) || 30);
      return {
        appointment,
        startMinutes,
        endMinutes,
        status: taDisplayStatus(
          appointment,
          startMinutes,
          endMinutes,
          nowMinutes,
        ),
      };
    })
    .filter(
      (item) => item.endMinutes > nowMinutes && item.status !== "completed",
    )
    .sort((a, b) => a.startMinutes - b.startMinutes);
  let html = "";
  if (!items.length) {
    html = `<div class="ta-empty"><i class="fa-regular fa-calendar"></i><strong>No today's appointments</strong><span>No patients are scheduled for today.</span></div>`;
  } else {
    html = items
      .slice(0, TA_MAX_VISIBLE)
      .map(({ appointment, startMinutes, endMinutes, status }) => {
        const dentist = taDentist(appointment);
        return `<div class="ta-row"><div class="ta-card" data-status="${status}" data-id="${taEscape(appointment.id)}"><div class="ta-badge" style="background:${taHexToRgba(dentist.color, 0.14)};color:${dentist.color}">${taEscape(taInitials(appointment.patient))}</div><div class="ta-info"><div class="ta-name">${taEscape(appointment.patient)}</div><div class="ta-meta">${taEscape(appointment.type)} · ${taEscape(dentist.name)}</div></div><div class="ta-side"><div class="ta-time">${taFormatMinutes(startMinutes)} – ${taFormatMinutes(endMinutes)}</div><span class="ta-status ${status}">${taStatusLabel(status)}</span></div></div></div>`;
      })
      .join("");
  }
  if (html === taLastHtml) return;
  taLastHtml = html;
  list.innerHTML = html;
  list.querySelectorAll(".ta-card").forEach((card) => {
    card.addEventListener("click", () => {
      window.location.href = `../appointment/appointment.html?appointmentId=${encodeURIComponent(card.dataset.id)}`;
    });
  });
}
