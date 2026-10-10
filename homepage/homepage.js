document.addEventListener("DOMContentLoaded", () => {
  const navToggleBtn = document.getElementById("navToggleBtn");
  const navMenuWrapper = document.getElementById("navMenuWrapper");
  const navOverlay = document.getElementById("navOverlay");
  const pageBlurWrapper = document.getElementById("pageBlurWrapper");
  const navToggleIcon = document.getElementById("navToggleIcon");
  const homeNavbar = document.getElementById("homeNavbar");
  const backToTop = document.getElementById("backToTop");
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  function toggleMobileMenu(forceState) {
    if (!navMenuWrapper) return;
    const currentState = navMenuWrapper.classList.contains("mobile-open");
    const isOpen = typeof forceState === "boolean" ? forceState : !currentState;
    navMenuWrapper.classList.toggle("mobile-open", isOpen);
    navToggleBtn?.setAttribute("aria-expanded", String(isOpen));
    navOverlay?.classList.toggle("active", isOpen);
    pageBlurWrapper?.classList.toggle("is-blurred", isOpen);
    if (navToggleIcon) {
      navToggleIcon.className = isOpen
        ? "fa-solid fa-xmark"
        : "fa-solid fa-bars";
    }
    document.body.classList.toggle("mobile-menu-open", isOpen);
  }
  navToggleBtn?.addEventListener("click", () => toggleMobileMenu());
  navOverlay?.addEventListener("click", () => toggleMobileMenu(false));
  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", () => {
      if (navMenuWrapper?.classList.contains("mobile-open"))
        toggleMobileMenu(false);
    });
  });

  const NAV_HIDE_AFTER = 80;
  function updateScrollState() {
    const y = window.scrollY;
    const menuOpen = navMenuWrapper?.classList.contains("mobile-open");
    homeNavbar?.classList.toggle("scrolled", y > 10);
    homeNavbar?.classList.toggle("nav-hidden", y > NAV_HIDE_AFTER && !menuOpen);
    backToTop?.classList.toggle("show", y > 700);
  }
  updateScrollState();
  window.addEventListener("scroll", updateScrollState, { passive: true });
  backToTop?.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  const loginModalOverlay = document.getElementById("loginModalOverlay");
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const loginIframe = document.getElementById("loginIframe");
  let lastFocusedElement = null;
  const resetToken = new URLSearchParams(window.location.search).get(
    "reset_token",
  );
  if (
    resetToken &&
    /^[a-f0-9]{64}$/i.test(resetToken) &&
    loginModalOverlay &&
    loginIframe
  ) {
    loginIframe.src =
      "../login/reset-password.html?token=" + encodeURIComponent(resetToken);
    loginIframe.title = "DentaNueva Reset Password";
    loginModalOverlay.classList.add("active");
    loginModalOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.hash,
    );
  }

  function openLoginModal(event) {
    event.preventDefault();
    if (!loginModalOverlay) return;
    if (navMenuWrapper?.classList.contains("mobile-open"))
      toggleMobileMenu(false);
    lastFocusedElement = document.activeElement;
    loginModalOverlay.classList.add("active");
    loginModalOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    modalCloseBtn?.focus();
  }
  function closeLoginModal() {
    if (!loginModalOverlay) return;
    loginModalOverlay.classList.remove("active");
    loginModalOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
  }
  function handleAuthFrameNavigation(event) {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    const link = target.closest("a[href]");
    if (!link || !loginIframe) return;
    const targetUrl = new URL(link.href);
    const isAuthPage =
      targetUrl.pathname.endsWith("/login/login.html") ||
      targetUrl.pathname.endsWith("/signup/signup.html");
    if (!isAuthPage) return;
    event.preventDefault();
    targetUrl.searchParams.set("_modal", Date.now().toString());
    loginIframe.src = targetUrl.href;
    loginIframe.title = targetUrl.pathname.endsWith("/signup/signup.html")
      ? "DentaNueva Sign Up"
      : "DentaNueva Login";
  }
  document
    .querySelectorAll('a[href*="login/login.html"]')
    .forEach((loginLink) => {
      loginLink.addEventListener("click", openLoginModal);
    });
  modalCloseBtn?.addEventListener("click", closeLoginModal);
  loginModalOverlay?.addEventListener("click", (event) => {
    if (event.target === loginModalOverlay) closeLoginModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (loginModalOverlay?.classList.contains("active")) closeLoginModal();
    if (navMenuWrapper?.classList.contains("mobile-open"))
      toggleMobileMenu(false);
  });
  loginIframe?.addEventListener("load", () => {
    const frameDocument = loginIframe.contentDocument;
    if (!frameDocument) return;
    const framePath = loginIframe.contentWindow.location.pathname;
    const isSignupPage = framePath.endsWith("/signup/signup.html");
    const isResetPage = framePath.endsWith("/login/reset-password.html");
    loginIframe.title = isResetPage
      ? "DentaNueva Reset Password"
      : isSignupPage
        ? "DentaNueva Sign Up"
        : "DentaNueva Login";
    modalCloseBtn?.setAttribute(
      "aria-label",
      isResetPage
        ? "Close reset password dialog"
        : isSignupPage
          ? "Close sign up dialog"
          : "Close login dialog",
    );
    frameDocument.addEventListener("click", handleAuthFrameNavigation);
  });

  const navLinks = document.querySelectorAll(".nav-link");
  const sectionToNav = {
    home: "#home",
    services: "#services",
    "how-it-works": "#services",
    dentists: "#about",
    about: "#about",
    location: "#location",
    appointment: "#location",
  };
  const observedSections = Object.keys(sectionToNav)
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  function setActiveNav(targetHref) {
    navLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === targetHref;
      link.classList.toggle("active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
  if ("IntersectionObserver" in window && observedSections.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveNav(sectionToNav[entry.target.id]);
        });
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    observedSections.forEach((section) => sectionObserver.observe(section));
  }

  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !prefersReducedMotion.matches) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const siblings = Array.from(
            entry.target.parentElement.children,
          ).filter((el) => el.classList.contains("reveal"));
          const delay = Math.max(siblings.indexOf(entry.target), 0) * 90;
          entry.target.style.transitionDelay = `${delay}ms`;
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
          setTimeout(() => {
            entry.target.style.transitionDelay = "";
          }, delay + 700);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("in"));
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
      const targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;
      const targetElement = document.querySelector(targetId);
      if (!targetElement) return;
      setTimeout(() => {
        targetElement.setAttribute("tabindex", "-1");
        targetElement.addEventListener(
          "blur",
          () => targetElement.removeAttribute("tabindex"),
          { once: true },
        );
        targetElement.focus({ preventScroll: true });
      }, 500);
    });
  });
});
