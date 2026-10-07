/* Section navigation for the website and embedded Hugging Face App. */
(() => {
  "use strict";

  function findSection(hash) {
    if (!hash || hash === "#") return null;

    try {
      return document.getElementById(
        decodeURIComponent(hash.slice(1))
      );
    } catch {
      return null;
    }
  }

  function closeNavigation() {
    document.getElementById("main-navigation")
      ?.classList.remove("open");

    const toggle = document.getElementById("menu-toggle");

    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation");
    }
  }

  function visitSection(target, hash, updateHistory, animate) {
    closeNavigation();

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    target.scrollIntoView({
      behavior: animate && !reduceMotion ? "smooth" : "instant",
      block: "start"
    });

    if (updateHistory && window.location.hash !== hash) {
      try {
        window.history.pushState(null, "", hash);
      } catch {
        // Scrolling still works when a sandbox restricts history.
      }
    }

    const focusTarget = target.querySelector("h1, h2, h3") || target;

    if (!focusTarget.hasAttribute("tabindex")) {
      focusTarget.setAttribute("tabindex", "-1");
      focusTarget.addEventListener(
        "blur",
        () => focusTarget.removeAttribute("tabindex"),
        { once: true }
      );
    }

    focusTarget.focus({ preventScroll: true });

    document.querySelectorAll("#main-navigation a[href]")
      .forEach(link => {
        const active = link.getAttribute("href") === hash;

        link.classList.toggle("active", active);

        if (active) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
  }

  document.addEventListener("click", event => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const link = event.target instanceof Element
      ? event.target.closest("a[href]")
      : null;

    if (
      !link ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self")
    ) {
      return;
    }

    const hash = link.getAttribute("href");

    if (!hash.startsWith("#")) return;

    const target = findSection(hash);

    if (!target || target.closest("[hidden]")) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    visitSection(target, hash, true, true);
  }, true);

  function restoreSection() {
    const target = findSection(window.location.hash);

    if (target && !target.closest("[hidden]")) {
      visitSection(target, window.location.hash, false, false);
    }
  }

  window.addEventListener("popstate", restoreSection);
  window.addEventListener("hashchange", restoreSection);
  window.addEventListener("load", restoreSection, { once: true });
})();