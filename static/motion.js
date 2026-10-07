/* Optional visual polish. Core navigation, forms, and the dashboard work without this file. */
(() => {
  "use strict";

  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const stage = document.getElementById("ocean-stage");
  const scene = document.getElementById("depth-scene");
  const header = document.querySelector(".site-header");

  // Keep a group of cards in a gentle sequence, rather than making every card arrive at once.
  document.querySelectorAll(".specimen-grid, .about-grid, .contact-grid").forEach((group) => {
    Array.from(group.children).forEach((element, index) => {
      if (element.classList.contains("reveal")) {
        element.style.setProperty("--reveal-delay", `${index * 90}ms`);
      }
    });
  });
  document.querySelector(".hero-art").style.setProperty("--reveal-delay", "120ms");

  // Scroll events only schedule one paint. No continuous animation loop runs while idle.
  let headerFrame = 0;
  function paintHeader() {
    header.classList.toggle("header-scrolled", window.scrollY > 35);
    headerFrame = 0;
  }
  window.addEventListener("scroll", () => {
    if (!headerFrame) headerFrame = requestAnimationFrame(paintHeader);
  }, { passive: true });
  paintHeader();

  // Interpolated pointer movement gives the artwork a modest amount of depth.
  // Restrict this to fine pointers, pause outside the viewport, and stop after settling.
  let inView = true;
  let frame = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  function canAnimate() {
    return !preference.matches && !document.hidden && inView;
  }
  function renderDepth() {
    frame = 0;
    if (!canAnimate()) return;
    currentX += (targetX - currentX) * .085;
    currentY += (targetY - currentY) * .085;
    scene.style.setProperty("--scene-rx", `${-currentY * 4.5}deg`);
    scene.style.setProperty("--scene-ry", `${currentX * 5.5}deg`);
    scene.style.setProperty("--scene-x", `${currentX * 5}px`);
    scene.style.setProperty("--scene-y", `${currentY * 4}px`);
    if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > .002) {
      frame = requestAnimationFrame(renderDepth);
    }
  }
  function scheduleDepth() {
    if (!frame && canAnimate()) frame = requestAnimationFrame(renderDepth);
  }
  function returnToCenter() {
    targetX = 0;
    targetY = 0;
    scheduleDepth();
  }
  function syncMotion() {
    const active = canAnimate();
    stage.classList.toggle("scene-running", active);
    if (!active || !finePointer.matches) {
      cancelAnimationFrame(frame);
      frame = 0;
      targetX = targetY = currentX = currentY = 0;
      scene.style.removeProperty("--scene-rx");
      scene.style.removeProperty("--scene-ry");
      scene.style.removeProperty("--scene-x");
      scene.style.removeProperty("--scene-y");
    }
    if (preference.matches) {
      document.body.classList.remove("motion-enabled");
      document.querySelector(".dashboard-shell").getAnimations().forEach((animation) => animation.cancel());
    }
  }
  stage.addEventListener("pointermove", (event) => {
    if (!canAnimate() || !finePointer.matches || event.pointerType === "touch") return;
    const bounds = stage.getBoundingClientRect();
    targetX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    targetY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
    scheduleDepth();
  }, { passive: true });
  stage.addEventListener("pointerleave", returnToCenter);
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncMotion();
    }, { threshold: .05 });
    observer.observe(stage);
  }
  preference.addEventListener("change", syncMotion);
  finePointer.addEventListener("change", syncMotion);
  document.addEventListener("visibilitychange", syncMotion);
  window.addEventListener("pageshow", syncMotion);
  syncMotion();

  // An actual sliding surface under the segmented control, with a native CSS fallback.
  const tabList = document.querySelector(".tab-list");
  const indicator = document.createElement("span");
  indicator.className = "tab-indicator";
  indicator.setAttribute("aria-hidden", "true");
  tabList.prepend(indicator);
  function positionIndicator() {
    const activeTab = tabList.querySelector('[aria-selected="true"]');
    if (!activeTab) return;
    tabList.style.setProperty("--tab-left", `${activeTab.offsetLeft}px`);
    tabList.style.setProperty("--tab-width", `${activeTab.offsetWidth}px`);
    tabList.classList.add("tabs-enhanced");
  }
  const tabObserver = new MutationObserver(positionIndicator);
  tabObserver.observe(tabList, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  if ("ResizeObserver" in window) new ResizeObserver(positionIndicator).observe(tabList);
  else window.addEventListener("resize", positionIndicator, { passive: true });
  positionIndicator();

  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(headerFrame);
    stage.classList.remove("scene-running");
  });
})();
