(function () {
  if (window.appNotify) {
    return;
  }
  const ICONS = {
    error:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    success:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  const DEFAULT_TITLES = {
    error: "Something went wrong",
    warning: "Please check this",
    success: "Done",
    info: "Notice",
  };
  const KNOWN_MESSAGES = {
    "please select a valid patient.": {
      type: "warning",
      title: "Patient required",
      message: "Please choose a patient from the list before continuing.",
    },
    "please enter the service.": {
      type: "warning",
      title: "Service required",
      message: "Enter the service or treatment name, then try again.",
    },
    "treatment information is missing.": {
      type: "error",
      title: "Treatment details missing",
      message:
        "The treatment details could not be found. Go back to the patient's Treatments tab and try again.",
    },
    "please enter a valid treatment price.": {
      type: "warning",
      title: "Invalid price",
      message: "Enter a treatment price greater than zero.",
    },
    "discount cannot be negative.": {
      type: "warning",
      title: "Invalid discount",
      message: "The discount cannot be a negative amount. Enter 0 or higher.",
    },
    "discount cannot be greater than the treatment price.": {
      type: "warning",
      title: "Discount is too high",
      message:
        "The discount cannot be more than the treatment price. Lower the discount and try again.",
    },
    "unable to create treatment charge.": {
      type: "error",
      title: "Charge not created",
      message:
        "The treatment charge could not be created. Please check your connection and try again.",
    },
    "unable to generate the payment receipt.": {
      type: "error",
      title: "Receipt unavailable",
      message:
        "The payment receipt could not be generated. Please refresh the page and try again.",
    },
    "please allow pop-ups to view the receipt.": {
      type: "warning",
      title: "Pop-up blocked",
      message:
        "Your browser blocked the receipt window. Allow pop-ups for this site, then press the receipt button again.",
    },
    "unable to find the selected transaction.": {
      type: "error",
      title: "Transaction not found",
      message:
        "The selected transaction could not be found. Refresh the page and try again.",
    },
    "the patient could not be saved to the database. please try again.": {
      type: "error",
      title: "Patient not saved",
      message:
        "The patient information could not be saved. Check your connection and try again.",
    },
    "the treatment could not be saved to the database. please try again.": {
      type: "error",
      title: "Treatment not saved",
      message:
        "The treatment could not be saved. Check your connection and try again.",
    },
    "the medical form could not be saved to the database. please try again.": {
      type: "error",
      title: "Medical form not saved",
      message:
        "The medical form could not be saved. Check your connection and try again.",
    },
    "the medical record could not be saved to the database. please try again.":
      {
        type: "error",
        title: "Medical record not saved",
        message:
          "Your medical record could not be saved. Check your connection and try again.",
      },
    "please select the appointment/visit for this treatment.": {
      type: "warning",
      title: "Appointment required",
      message:
        "Choose which appointment or visit this treatment belongs to, then press Save Treatment again.",
    },
    "please select a jpg, png, or webp image.": {
      type: "warning",
      title: "Unsupported file type",
      message: "Only JPG, PNG, or WEBP images can be uploaded.",
    },
    "image size must not exceed 2 mb.": {
      type: "warning",
      title: "Image is too large",
      message: "The image must be 2 MB or smaller. Choose a smaller file.",
    },
    "please enter a title for the clinical images.": {
      type: "warning",
      title: "Title required",
      message: "Enter a title for the before and after images.",
    },
    "please upload the before image.": {
      type: "warning",
      title: "BEFORE image missing",
      message: "Upload the BEFORE image to continue.",
    },
    "please upload the after image.": {
      type: "warning",
      title: "AFTER image missing",
      message: "Upload the AFTER image to continue.",
    },
    "unable to upload clinical images.": {
      type: "error",
      title: "Upload failed",
      message:
        "The clinical images could not be uploaded. Check your connection and try again.",
    },
    "unable to delete clinical images.": {
      type: "error",
      title: "Delete failed",
      message: "The clinical images could not be deleted. Please try again.",
    },
    "patient record could not be deleted.": {
      type: "error",
      title: "Patient not deleted",
      message: "The patient record could not be deleted. Please try again.",
    },
    "patient record could not be found. please log in again.": {
      type: "error",
      title: "Record not found",
      message:
        "We could not find your patient record. Please log in again to continue.",
    },
    "patient record could not be saved. please try again.": {
      type: "error",
      title: "Record not saved",
      message:
        "Your patient record could not be saved. Check your connection and try again.",
    },
    "your patient profile could not be loaded. please log in again.": {
      type: "error",
      title: "Profile not loaded",
      message:
        "Your profile could not be loaded. Please log in again to continue.",
    },
    "please select at least one dental concern.": {
      type: "warning",
      title: "Dental concern required",
      message:
        "Select at least one dental concern before going to the next step.",
    },
    "no known allergies cannot be selected together with another allergy.": {
      type: "warning",
      title: "Allergy selection conflict",
      message:
        'You chose "No Known Allergies" and another allergy at the same time. Keep only one of them.',
    },
    "please confirm the consent before saving your medical record.": {
      type: "warning",
      title: "Consent required",
      message:
        "Tick the consent checkbox to confirm, then save your medical record.",
    },
  };
  const queue = [];
  let active = false;
  function classify(raw) {
    const text = String(raw === undefined || raw === null ? "" : raw).trim();
    const known = KNOWN_MESSAGES[text.replace(/\s+/g, " ").toLowerCase()];
    if (known) {
      return Object.assign({}, known);
    }
    let type = "info";
    if (
      /could not|couldn't|unable|failed|failure|error|invalid|denied|not found/i.test(
        text,
      )
    ) {
      type = "error";
    } else if (/^please|cannot|must |required|missing|exceed/i.test(text)) {
      type = "warning";
    } else if (/success|saved|created|updated|deleted|sent/i.test(text)) {
      type = "success";
    }
    return {
      type: type,
      title: DEFAULT_TITLES[type],
      message: text || "Something went wrong. Please try again.",
    };
  }
  function buildDialog(item, finish) {
    const backdrop = document.createElement("div");
    backdrop.className = "app-notify-backdrop";
    const card = document.createElement("div");
    card.className = "app-notify-card";
    card.setAttribute("role", "alertdialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("data-type", item.type);
    const titleId = "appNotifyTitle" + Date.now();
    const messageId = "appNotifyMessage" + Date.now();
    card.setAttribute("aria-labelledby", titleId);
    card.setAttribute("aria-describedby", messageId);
    const icon = document.createElement("div");
    icon.className = "app-notify-icon";
    icon.innerHTML = ICONS[item.type] || ICONS.info;
    const title = document.createElement("h2");
    title.className = "app-notify-title";
    title.id = titleId;
    title.textContent = item.title;
    const message = document.createElement("p");
    message.className = "app-notify-message";
    message.id = messageId;
    message.textContent = item.message;
    const actions = document.createElement("div");
    actions.className = "app-notify-actions";
    const buttons = [];
    let cancelButton = null;
    if (item.confirm) {
      cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "app-notify-btn";
      cancelButton.textContent = item.cancelText;
      cancelButton.addEventListener("click", function () {
        finish(false);
      });
      actions.appendChild(cancelButton);
      buttons.push(cancelButton);
    }
    const okButton = document.createElement("button");
    okButton.type = "button";
    okButton.className =
      "app-notify-btn " + (item.danger ? "is-danger" : "is-primary");
    okButton.textContent = item.confirmText;
    okButton.addEventListener("click", function () {
      finish(true);
    });
    actions.appendChild(okButton);
    buttons.push(okButton);
    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(message);
    card.appendChild(actions);
    backdrop.appendChild(card);
    backdrop.addEventListener("mousedown", function (event) {
      if (event.target === backdrop) {
        finish(item.confirm ? false : true);
      }
    });
    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(item.confirm ? false : true);
        return;
      }
      if (event.key === "Tab") {
        const index = buttons.indexOf(document.activeElement);
        event.preventDefault();
        if (event.shiftKey) {
          buttons[(index <= 0 ? buttons.length : index) - 1].focus();
        } else {
          buttons[(index + 1) % buttons.length].focus();
        }
      }
    }
    return {
      backdrop: backdrop,
      onKeydown: onKeydown,
      focusTarget: item.danger && cancelButton ? cancelButton : okButton,
    };
  }
  function next() {
    if (active || !queue.length) {
      return;
    }
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", next, { once: true });
      return;
    }
    active = true;
    const entry = queue.shift();
    const previousFocus = document.activeElement;
    let closed = false;
    let dialog = null;
    function finish(value) {
      if (closed) {
        return;
      }
      closed = true;
      document.removeEventListener("keydown", dialog.onKeydown, true);
      dialog.backdrop.classList.remove("is-visible");
      setTimeout(function () {
        dialog.backdrop.remove();
        if (previousFocus && typeof previousFocus.focus === "function") {
          previousFocus.focus();
        }
        active = false;
        entry.resolve(value);
        next();
      }, 160);
    }
    dialog = buildDialog(entry.item, finish);
    document.body.appendChild(dialog.backdrop);
    document.addEventListener("keydown", dialog.onKeydown, true);
    requestAnimationFrame(function () {
      dialog.backdrop.classList.add("is-visible");
      dialog.focusTarget.focus();
    });
  }
  function enqueue(item) {
    return new Promise(function (resolve) {
      queue.push({ item: item, resolve: resolve });
      next();
    });
  }
  function show(type, message, title) {
    const base = classify(message);
    return enqueue({
      type: type || base.type,
      title: title || (type ? DEFAULT_TITLES[type] : base.title),
      message: base.message,
      confirm: false,
      danger: false,
      confirmText: "OK",
      cancelText: "",
    });
  }
  function ask(options) {
    const config =
      typeof options === "string" ? { message: options } : options || {};
    return enqueue({
      type: config.type || (config.danger ? "warning" : "info"),
      title: config.title || "Are you sure?",
      message: config.message || "",
      confirm: true,
      danger: Boolean(config.danger),
      confirmText: config.confirmText || "Confirm",
      cancelText: config.cancelText || "Cancel",
    });
  }
  window.appNotify = {
    alert: function (message) {
      return enqueue(
        Object.assign(classify(message), {
          confirm: false,
          danger: false,
          confirmText: "OK",
          cancelText: "",
        }),
      );
    },
    error: function (message, title) {
      return show("error", message, title);
    },
    warning: function (message, title) {
      return show("warning", message, title);
    },
    success: function (message, title) {
      return show("success", message, title);
    },
    info: function (message, title) {
      return show("info", message, title);
    },
    confirm: ask,
  };
  window.alert = function (message) {
    window.appNotify.alert(message);
  };
})();
