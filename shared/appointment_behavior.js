(() => {
  "use strict";
  const NO_SHOW_WARNING_THRESHOLD = 2;
  const NO_SHOW_THRESHOLD = 3;
  const RESTRICTION_DAYS = 2;
  function normalizeStatus(status) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .replace(/[\s\_-]+/g, "");
  }
  function getPatientId(appointment) {
    return String(
      appointment?.patientId ??
        appointment?.patientID ??
        appointment?.patient_id ??
        "",
    ).trim();
  }
  function getNoShowCount(appointments, patientId) {
    const normalizedPatientId = String(patientId || "")
      .trim()
      .toLowerCase();
    if (!normalizedPatientId || !Array.isArray(appointments)) return 0;
    return appointments.filter((appointment) => {
      return (
        getPatientId(appointment).toLowerCase() === normalizedPatientId &&
        normalizeStatus(
          appointment?.status || appointment?.appointmentStatus,
        ) === "noshow"
      );
    }).length;
  }
  function getServerRestriction(appointments, patientId) {
    if (!appointments || typeof appointments !== "object") return null;
    const restriction = appointments.__bookingRestriction;
    if (!restriction || typeof restriction !== "object") return null;
    const patientKey = String(patientId || "").trim();
    if (
      patientKey &&
      restriction[patientKey] &&
      typeof restriction[patientKey] === "object"
    ) {
      return restriction[patientKey];
    }
    if (
      Object.prototype.hasOwnProperty.call(restriction, "noShowCount") ||
      Object.prototype.hasOwnProperty.call(restriction, "restrictedUntil")
    ) {
      return restriction;
    }
    return null;
  }
  function getRestriction(appointments, patientId) {
    const serverRestriction = getServerRestriction(appointments, patientId);
    const noShowCount = Number.isFinite(Number(serverRestriction?.noShowCount))
      ? Number(serverRestriction.noShowCount)
      : getNoShowCount(appointments, patientId);
    const rawRestrictedUntil = serverRestriction?.restrictedUntil || null;
    const restrictedUntil = rawRestrictedUntil
      ? new Date(rawRestrictedUntil)
      : null;
    const isRestricted =
      restrictedUntil instanceof Date &&
      !Number.isNaN(restrictedUntil.getTime()) &&
      restrictedUntil > new Date();
    return {
      isRestricted,
      isWarning: !isRestricted && noShowCount >= NO_SHOW_WARNING_THRESHOLD,
      noShowCount,
      restrictedUntil: isRestricted ? restrictedUntil : null,
      triggeredNoShowCount:
        Number(serverRestriction?.triggeredNoShowCount) || 0,
    };
  }
  function formatRestrictionEnd(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  window.DentaNuevaAppointmentBehavior = Object.freeze({
    NO_SHOW_WARNING_THRESHOLD,
    NO_SHOW_THRESHOLD,
    RESTRICTION_DAYS,
    getNoShowCount,
    getRestriction,
    formatRestrictionEnd,
  });
})();
