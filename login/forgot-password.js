document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("forgotPasswordForm");
  const emailInput = document.getElementById("email");
  const messageBox = document.getElementById("resetMessage");
  const submitButton = form?.querySelector(".btn-submit");

  if (!form || !emailInput || !messageBox || !submitButton) {
    return;
  }

  function showMessage(message, success = false) {
    messageBox.replaceChildren();
    messageBox.textContent = message;
    messageBox.style.display = "flex";
    messageBox.style.flexDirection = "column";
    messageBox.style.gap = "8px";
    messageBox.style.color = success ? "#166534" : "#b42318";
    messageBox.style.backgroundColor = success ? "#ecfdf3" : "#fef3f2";
    messageBox.style.border = success
      ? "1px solid #abefc6"
      : "1px solid #fecdca";
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = emailInput.value.trim().toLowerCase();

    if (!emailInput.checkValidity()) {
      emailInput.reportValidity();
      return;
    }

    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Please wait...";
    messageBox.style.display = "none";

    try {
      const formData = new FormData();
      formData.append("email", email);

      const response = await fetch("request_password_reset.php", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        cache: "no-store",
      });

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error("The server returned an invalid response.");
      }

      if (!response.ok || !data.success) {
        showMessage(
          data.message || "Unable to process your request. Please try again.",
        );
        return;
      }

      showMessage(
        data.message ||
          "If an account matches that email, password recovery instructions will be provided.",
        true,
      );

      form.reset();
    } catch (error) {
      console.error("Password recovery request failed:", error);
      showMessage("Unable to connect to the server. Please try again.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
});
