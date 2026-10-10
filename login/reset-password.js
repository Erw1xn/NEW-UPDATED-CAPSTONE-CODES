document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("resetPasswordForm");
  const passwordInput = document.getElementById("newPassword");
  const confirmInput = document.getElementById("confirmPassword");
  const messageBox = document.getElementById("resetMessage");
  const successLoginLink = document.getElementById("successLoginLink");
  const submitButton = form?.querySelector(".btn-submit");
  const token = new URLSearchParams(window.location.search).get("token");
  if (!form || !passwordInput || !confirmInput || !messageBox || !submitButton)
    return;
  function showMessage(message, success = false) {
    messageBox.textContent = message;
    messageBox.style.display = "flex";
    messageBox.style.flexDirection = "column";
    messageBox.style.color = success ? "#166534" : "#b42318";
    messageBox.style.backgroundColor = success ? "#ecfdf3" : "#fef3f2";
    messageBox.style.border = success
      ? "1px solid #abefc6"
      : "1px solid #fecdca";
  }
  document.querySelectorAll(".password-toggle").forEach(function (button) {
    button.addEventListener("click", function () {
      const input = document.getElementById(button.dataset.target);
      const icon = button.querySelector("i");
      if (!input || !icon) return;
      const showPassword = input.type === "password";
      input.type = showPassword ? "text" : "password";
      button.setAttribute(
        "aria-label",
        showPassword ? "Hide password" : "Show password",
      );
      button.setAttribute("aria-pressed", String(showPassword));
      icon.classList.toggle("fa-eye", !showPassword);
      icon.classList.toggle("fa-eye-slash", showPassword);
      icon.classList.toggle("fa-regular", !showPassword);
      icon.classList.toggle("fa-solid", showPassword);
    });
  });
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    form.style.display = "none";
    showMessage(
      "This password reset link is invalid or incomplete. Please request a new one.",
    );
    if (successLoginLink) successLoginLink.style.display = "block";
    return;
  }
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const password = passwordInput.value;
    const confirmation = confirmInput.value;
    if (password.length < 8 || password.length > 128) {
      showMessage("Your password must contain 8 to 128 characters.");
      passwordInput.focus();
      return;
    }
    if (password !== confirmation) {
      showMessage("The passwords do not match.");
      confirmInput.focus();
      return;
    }
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
    messageBox.style.display = "none";
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("password", password);
      formData.append("confirm_password", confirmation);
      const response = await fetch("reset_password.php", {
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
          data.message ||
            "Unable to reset your password. Please request a new link.",
        );
        return;
      }
      form.reset();
      form.style.display = "none";
      showMessage(
        "Your password has been changed successfully. You can now log in using your new password.",
        true,
      );
      if (successLoginLink) successLoginLink.style.display = "block";
    } catch (error) {
      console.error("Password reset failed:", error);
      showMessage("Unable to connect to the server. Please try again.");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
});
