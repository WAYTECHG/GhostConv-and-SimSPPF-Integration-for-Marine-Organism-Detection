/* Native UI behavior. Chart.js is bundled locally; no CDN or frontend build step. */
"use strict";

const config = JSON.parse(document.getElementById("app-config").textContent);
window.waytechgTransport.configure(config);
const get = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const models = config.metrics.models;
const metricDefinitions = {
  map50: { label: "mAP@0.5 (%)", unit: "%", digits: 2 },
  map5095: { label: "mAP@0.5:0.95 (%)", unit: "%", digits: 2 },
  parameters: { label: "Parameters (M)", unit: "M", digits: 2 },
  gflops: { label: "GFLOPs", unit: "", digits: 1 },
  fps: { label: "FPS (GPU)", unit: " FPS", digits: 2 },
  latency: { label: "Latency (ms, GPU)", unit: " ms", digits: 2 },
  precision: { label: "Precision (%)", unit: "%", digits: 2 },
  recall: { label: "Recall (%)", unit: "%", digits: 2 },
};

const speciesOrder = config.metrics.provenance.class_ap_order;
const speciesMetricKeys = speciesOrder.map((species) => `ap_${species}`);
const overallMetricKeys = Object.keys(metricDefinitions);
const lowerIsBetter = new Set(["parameters", "gflops", "latency"]);
for (const species of speciesOrder) {
  const name = species.charAt(0).toUpperCase() + species.slice(1);
  metricDefinitions[`ap_${species}`] = { label: `${name} AP@0.5 (%)`, unit: "%", digits: 2 };
}

function metricValue(model, key) {
  if (!key.startsWith("ap_")) return model[key];
  const index = speciesOrder.indexOf(key.slice(3));
  return Array.isArray(model.class_ap) && index >= 0 ? model.class_ap[index] : null;
}

const state = {
  file: null,
  uploadPreviewUrl: null,
  previewUrl: null,
  previewFrame: null,
  exportImage: null,
  result: null,
  controller: null,
  requestId: 0,
  selectedClass: "all",
  minimumConfidence: 0.5,
  selectedModel: "proposed_ghost_simsppf",
  chart: null,
  toastTimer: null,
};

function presentInferenceMode() {
  const mode = state.result ? state.result.mode : config.inference.mode;
  const isReal = mode === "real";
  const unavailable = isReal && !state.result && !config.inference.ready;
  const indicator = unavailable ? "Real inference unavailable" : isReal ? "Real inference · 640 × 640" : "Detection simulation";
  get("dashboard-mode").textContent = get("metrics-tab").getAttribute("aria-selected") === "true" ? "Reported research metrics" : indicator;
  const note = get("inference-note");
  note.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = unavailable ? "Model setup needs attention. " : isReal ? "Real inference mode. " : "Simulation mode. ";
  note.append(heading, document.createTextNode(unavailable ? config.inference.error : isReal
    ? "The trained Baseline and Final Proposed checkpoints use a 640 × 640 letterboxed RGB input. Boxes are mapped back to your image. Confidence is not an accuracy measurement."
    : "Boxes, species labels, and confidence scores are illustrative. No trained model is executed in this mode. The illustrated scene always uses simulation."));
  get("confidence-label").textContent = isReal ? "Confidence ≥" : "Synthetic score ≥";
  for (const button of document.querySelectorAll("[data-export]")) {
    button.setAttribute("aria-label", `Download ${button.dataset.export === "baseline" ? "baseline" : "final method"} ${isReal ? "prediction" : "simulation"} image`);
  }
}

function announce(message, isError = false) {
  get("analysis-status").textContent = message;
  get("analysis-status").classList.toggle("error", isError);
}

function toast(title, message) {
  clearTimeout(state.toastTimer);
  get("toast-title").textContent = title;
  get("toast-message").textContent = message;
  get("toast").hidden = false;
  get("toast").classList.remove("entering");
  requestAnimationFrame(() => get("toast").classList.add("entering"));
  state.toastTimer = setTimeout(() => { get("toast").hidden = true; }, 7000);
}
get("toast-close").addEventListener("click", () => {
  clearTimeout(state.toastTimer);
  get("toast").hidden = true;
});

// Progressive enhancement keeps the page visible if JavaScript is disabled.
if (!reduceMotion && "IntersectionObserver" in window) {
  document.body.classList.add("motion-enabled");
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    }
  }, { threshold: 0.06 });
  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
}

const navigation = get("main-navigation");
get("menu-toggle").addEventListener("click", () => {
  const isOpen = navigation.classList.toggle("open");
  get("menu-toggle").setAttribute("aria-expanded", String(isOpen));
  get("menu-toggle").setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});
function closeMenu() {
  navigation.classList.remove("open");
  get("menu-toggle").setAttribute("aria-expanded", "false");
  get("menu-toggle").setAttribute("aria-label", "Open navigation");
}
navigation.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (navigation.classList.contains("open")) get("menu-toggle").focus();
    closeMenu();
    get("toast").hidden = true;
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".site-header")) closeMenu();
});
if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        navigation.querySelectorAll("a").forEach((link) => {
          const active = link.getAttribute("href") === `#${entry.target.id}`;
          link.classList.toggle("active", active);
          if (active) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      }
    }
  }, { rootMargin: "-12% 0px -65% 0px", threshold: 0 });
  document.querySelectorAll("main section[id]").forEach((section) => sectionObserver.observe(section));
}

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
let panelAnimation = null;
function selectTab(tab, moveFocus = false) {
  const shell = document.querySelector(".dashboard-shell");
  const previousHeight = shell.getBoundingClientRect().height;
  if (panelAnimation) panelAnimation.cancel();
  for (const item of tabs) {
    const active = item === tab;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
    get(item.dataset.panel).hidden = !active;
    if (active) {
      get(item.dataset.panel).classList.remove("panel-enter");
      requestAnimationFrame(() => get(item.dataset.panel).classList.add("panel-enter"));
    }
  }
  presentInferenceMode();
  if (moveFocus) tab.focus();
  if (tab.id === "metrics-tab") updateChart();
  // Animate height only in response to a deliberate tab change, never during scrolling.
  // The content enters with a separate opacity/transform animation.
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && shell.animate) {
    const nextHeight = shell.getBoundingClientRect().height;
    if (Math.abs(previousHeight - nextHeight) > 2) {
      shell.style.overflow = "clip";
      const animation = shell.animate([
        { height: `${previousHeight}px` },
        { height: `${nextHeight}px` },
      ], { duration: 480, easing: "cubic-bezier(.22, 1, .36, 1)" });
      panelAnimation = animation;
      const finish = () => {
        if (panelAnimation === animation) {
          shell.style.removeProperty("overflow");
          panelAnimation = null;
        }
      };
      animation.onfinish = finish;
      animation.oncancel = finish;
    }
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    let target = null;
    if (event.key === "ArrowRight") target = tabs[(index + 1) % tabs.length];
    if (event.key === "ArrowLeft") target = tabs[(index + tabs.length - 1) % tabs.length];
    if (event.key === "Home") target = tabs[0];
    if (event.key === "End") target = tabs[tabs.length - 1];
    if (target) { event.preventDefault(); selectTab(target, true); }
  });
});

function cancelAnalysis() {
  if (state.controller) state.controller.abort();
  state.controller = null;
  state.requestId += 1;
}

function setBusy(busy, label = "Preparing comparison") {
  get("comparison-grid").setAttribute("aria-busy", String(busy));
  get("analyze-button").disabled = busy || !state.file;
  get("analyze-button").textContent = busy ? label : "Compare models →";
  get("demo-button").disabled = busy;
}

function clearOverlays() {
  for (const key of ["baseline", "proposed"]) {
    get(`${key}-overlay`).replaceChildren();
    get(`${key}-count`).textContent = "Awaiting comparison";
    const image = get(`${key}-image`);
    image.hidden = true;
    image.removeAttribute("src");
    get(`${key}-placeholder`).hidden = false;
  }
  get("result-controls").hidden = true;
  document.querySelectorAll("[data-export]").forEach((button) => { button.disabled = true; });
}

function clearUploadPreview() {
  if (state.uploadPreviewUrl) URL.revokeObjectURL(state.uploadPreviewUrl);
  state.uploadPreviewUrl = null;
  get("upload-image").removeAttribute("src");
  get("upload-preview").hidden = true;
  get("dropzone").classList.remove("has-preview");
}

// Fill a 640 × 640 display without padding or cropping. This affects only the
// UI; the original File still goes to the backend's trained letterbox pipeline.
async function createSquarePreview(image) {
  const size = 640;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  // Flatten transparent pixels against the existing panel colour.
  context.fillStyle = "#34413d";
  context.fillRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size, size);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The image preview could not be prepared. Please try again.");
  return {
    url: URL.createObjectURL(blob),
    frame: { width: size, height: size, contentWidth: size, contentHeight: size, left: 0, top: 0 },
  };
}

async function chooseFile(file) {
  if (!file) return;
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) {
    announce("Please choose a JPG, PNG, or WebP image.", true);
    return;
  }
  if (file.size === 0 || file.size > config.maxFileBytes) {
    announce("Please choose a nonempty image smaller than 8 MB.", true);
    return;
  }
  cancelAnalysis();
  const selectionId = state.requestId;
  setBusy(true, "Loading preview");
  const candidateUrl = URL.createObjectURL(file);
  const probe = new Image();
  probe.src = candidateUrl;
  let preview;
  try {
    await probe.decode();
    if (probe.naturalWidth * probe.naturalHeight > 20000000 || Math.min(probe.naturalWidth, probe.naturalHeight) < 64) {
      throw new Error("Use an image with at most 20 megapixels and at least 64 pixels on each side.");
    }
    preview = await createSquarePreview(probe);
  } catch (error) {
    URL.revokeObjectURL(candidateUrl);
    if (selectionId !== state.requestId) return;
    setBusy(false);
    announce(error.name === "EncodingError" ? "This file could not be read as a valid image." : error.message, true);
    return;
  }
  URL.revokeObjectURL(candidateUrl);
  if (selectionId !== state.requestId) {
    URL.revokeObjectURL(preview.url);
    return;
  }
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  state.previewFrame = null;
  clearUploadPreview();
  state.uploadPreviewUrl = preview.url;
  state.exportImage = null;
  state.file = file;
  state.result = null;
  clearOverlays();
  get("file-summary").textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  get("file-summary").hidden = false;
  get("clear-button").hidden = false;
  get("upload-image").src = state.uploadPreviewUrl;
  get("upload-image").alt = "Your selected evaluation image resized to a filled 640 by 640 preview";
  get("upload-preview").hidden = false;
  get("dropzone").classList.add("has-preview");
  presentInferenceMode();
  setBusy(false);
  announce("Preview ready · 640 × 640. Press Compare models to run detection.");
}

get("browse-button").addEventListener("click", () => get("image-input").click());
get("image-input").addEventListener("change", (event) => {
  chooseFile(event.target.files[0]);
  event.target.value = "";
});
const dropzone = get("dropzone");
let dragDepth = 0;
for (const eventName of ["dragenter", "dragover", "dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}
dropzone.addEventListener("dragenter", () => { dragDepth += 1; dropzone.classList.add("drag-over"); });
dropzone.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropzone.classList.remove("drag-over");
});
dropzone.addEventListener("drop", (event) => {
  dragDepth = 0;
  dropzone.classList.remove("drag-over");
  if (event.dataTransfer.files.length > 1) {
    announce("Choose one evaluation image at a time.", true);
    return;
  }
  chooseFile(event.dataTransfer.files[0]);
});

async function runAnalysis(useDemo) {
  if (!useDemo && !state.file) return;
  cancelAnalysis();
  const requestId = state.requestId;
  const controller = new AbortController();
  state.controller = controller;
  const realRequest = !useDemo && config.inference.mode === "real";
  const timeout = setTimeout(() => controller.abort(), realRequest ? 180000 : 25000);
  const body = useDemo ? null : new FormData();
  if (body) body.append("image", state.file);
  setBusy(true);
  announce(useDemo ? "Preparing the illustrated simulation." : realRequest
    ? "Running both trained checkpoints with a 640 × 640 letterboxed input."
    : "Processing your image and preparing synthetic overlays.");
  try {
    const response = await window.waytechgTransport.fetch(useDemo ? "/api/demo" : "/api/detect", {
      method: "POST", body, signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) {
      const detail = typeof result.detail === "string" ? result.detail : "This image could not be processed. Please try another.";
      throw new Error(detail);
    }
    if (requestId !== state.requestId) return;
    // Retain the API image separately so downloads keep their full processed
    // resolution even though the on-screen display is resized to a square.
    const exportImage = new Image();
    exportImage.src = result.image;
    await exportImage.decode();
    if (requestId !== state.requestId) return;
    const preview = await createSquarePreview(exportImage);
    if (requestId !== state.requestId) {
      URL.revokeObjectURL(preview.url);
      return;
    }
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = preview.url;
    state.previewFrame = preview.frame;
    state.exportImage = exportImage;
    state.result = result;
    state.selectedClass = "all";
    state.minimumConfidence = result.confidence_threshold;
    const minimum = Math.round(state.minimumConfidence * 100);
    get("confidence-range").min = String(minimum);
    get("confidence-range").value = String(minimum);
    get("confidence-value").textContent = `${minimum}%`;
    presentInferenceMode();
    document.querySelectorAll("[data-class]").forEach((button) => {
      const active = button.dataset.class === "all";
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    for (const key of ["baseline", "proposed"]) {
      const image = get(`${key}-image`);
      image.src = state.previewUrl;
      image.width = 640;
      image.height = 640;
      image.hidden = false;
      get(`${key}-placeholder`).hidden = true;
      image.alt = `${key === "baseline" ? "Baseline" : "Final proposed"} ${result.mode === "real" ? "trained model predictions" : "illustrative simulation"} on ${result.source}.`;
    }
    if (useDemo) {
      state.file = null;
      clearUploadPreview();
      get("file-summary").textContent = "Illustrated reference scene · not a ground-truth dataset image";
      get("file-summary").hidden = false;
      get("clear-button").hidden = false;
    }
    get("result-controls").hidden = false;
    document.querySelectorAll("[data-export]").forEach((button) => { button.disabled = false; });
    renderDetections();
    if (result.mode === "real") {
      const timing = result.model_timings_ms;
      announce(`Real predictions ready · 640 × 640 model input and filled display · ${result.device}. Baseline ${timing.baseline} ms · Final ${timing.proposed} ms (forward + NMS).`);
    } else {
      announce("Simulation ready · 640 × 640 filled display. No trained model was executed.");
    }
  } catch (error) {
    if (requestId !== state.requestId) return;
    announce(error.name === "AbortError" ? "The request timed out. The server may be waking up; please try again." : error.message, true);
  } finally {
    clearTimeout(timeout);
    if (requestId === state.requestId) {
      state.controller = null;
      setBusy(false);
    }
  }
}
get("analyze-button").addEventListener("click", () => runAnalysis(false));
get("demo-button").addEventListener("click", () => runAnalysis(true));
get("clear-button").addEventListener("click", () => {
  cancelAnalysis();
  state.result = null;
  state.file = null;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  state.previewFrame = null;
  state.exportImage = null;
  clearUploadPreview();
  get("file-summary").hidden = true;
  get("clear-button").hidden = true;
  get("image-input").value = "";
  clearOverlays();
  presentInferenceMode();
  setBusy(false);
  announce("Choose your image or try the illustrated scene.");
});

function visibleDetections(key) {
  if (!state.result) return [];
  return state.result.detections[key].filter((detection) =>
    detection.confidence >= state.minimumConfidence &&
    (state.selectedClass === "all" || detection.class_name === state.selectedClass)
  );
}

function svgElement(tag, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
}

function renderDetections() {
  if (!state.result || !state.previewFrame) return;
  const frame = state.previewFrame;
  const { width, height } = frame;
  // The same display scaling applies to both the image and normalized boxes.
  const fontSize = Math.max(12, width / 48);
  for (const key of ["baseline", "proposed"]) {
    const overlay = get(`${key}-overlay`);
    overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    overlay.replaceChildren();
    const detections = visibleDetections(key);
    const color = key === "baseline" ? "#496b9c" : "#137e91";
    for (const detection of detections) {
      const [x, y, boxWidth, boxHeight] = detection.box;
      const left = frame.left + x * frame.contentWidth;
      const top = frame.top + y * frame.contentHeight;
      const label = `${detection.class_name} ${Math.round(detection.confidence * 100)}%`;
      const labelWidth = Math.min(width, label.length * fontSize * 0.55 + fontSize);
      const labelHeight = fontSize * 1.55;
      const labelX = Math.min(left, width - labelWidth);
      const labelY = Math.max(0, top - labelHeight);
      const rectangle = svgElement("rect", { x: left, y: top, width: boxWidth * frame.contentWidth, height: boxHeight * frame.contentHeight, class: "box", stroke: color });
      const background = svgElement("rect", { x: labelX, y: labelY, width: labelWidth, height: labelHeight, rx: fontSize * 0.18, fill: color });
      const text = svgElement("text", { x: labelX + fontSize * 0.45, y: labelY + fontSize * 1.1, fill: "#f3fdff", "font-size": fontSize, "font-family": "Arial, sans-serif", "font-weight": "500" });
      text.textContent = label;
      overlay.append(rectangle, background, text);
    }
    get(`${key}-count`).textContent = `${detections.length} ${state.result.mode === "real" ? "detections" : "synthetic boxes"}`;
  }
}
document.querySelectorAll("[data-class]").forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedClass = button.dataset.class;
    document.querySelectorAll("[data-class]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderDetections();
  });
});
get("confidence-range").addEventListener("input", (event) => {
  state.minimumConfidence = Number(event.target.value) / 100;
  get("confidence-value").textContent = `${event.target.value}%`;
  renderDetections();
});

function downloadUrl(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
document.querySelectorAll("[data-export]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!state.result) return;
    const key = button.dataset.export;
    const mode = state.result.mode === "real" ? "prediction" : "simulation";
    if (state.selectedClass === "all" && state.minimumConfidence === state.result.confidence_threshold) {
      downloadUrl(state.result.exports[key], `waytechg-${key}-${mode}.png`);
      return;
    }
    // Export the current filters at the full processed resolution, not a screenshot.
    const image = state.exportImage;
    if (!image || !image.complete || !image.naturalWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = state.result.width;
    canvas.height = state.result.height + 38;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const fontSize = Math.max(13, Math.round(canvas.width / 65));
    const color = key === "baseline" ? "#496b9c" : "#137e91";
    context.font = `${fontSize}px Arial`;
    context.lineWidth = Math.max(2, canvas.width / 450);
    for (const detection of visibleDetections(key)) {
      const [x, y, width, height] = detection.box;
      const left = x * canvas.width;
      const top = y * state.result.height;
      const label = `${detection.class_name} ${Math.round(detection.confidence * 100)}%`;
      const labelWidth = context.measureText(label).width + 12;
      const labelHeight = fontSize + 12;
      const labelX = Math.min(left, canvas.width - labelWidth);
      const labelY = Math.max(0, top - labelHeight);
      context.strokeStyle = color;
      context.strokeRect(left, top, width * canvas.width, height * state.result.height);
      context.fillStyle = color;
      context.fillRect(labelX, labelY, labelWidth, labelHeight);
      context.fillStyle = "white";
      context.fillText(label, labelX + 6, labelY + fontSize + 3);
    }
    context.fillStyle = "#193e53";
    context.fillRect(0, state.result.height, canvas.width, 38);
    context.fillStyle = "white";
    context.font = "12px Arial";
    context.fillText(state.result.mode === "real" ? "WAYTECHG | REAL INFERENCE | 640 x 640 model input"
      : "WAYTECHG | SIMULATION | synthetic boxes, labels and scores", 10, state.result.height + 24);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      downloadUrl(url, `waytechg-${key}-filtered-${mode}.png`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  });
});

presentInferenceMode();

function formatMetric(value, key, includeUnit = true) {
  if (value === null || value === undefined) return "Not reported";
  const definition = metricDefinitions[key];
  return `${value.toFixed(definition.digits)}${includeUnit ? definition.unit : ""}`;
}

function selectModel(id) {
  state.selectedModel = id;
  const model = models.find((item) => item.id === id);
  get("selected-model-name").textContent = model.short_label;
  get("selected-model-description").textContent = model.role === "baseline" ? "DU-MobileYOLO · retrained baseline" : model.label;
  get("selected-model-metrics").replaceChildren();
  for (const key of [...overallMetricKeys, ...speciesMetricKeys]) {
    const row = document.createElement("div");
    const name = document.createElement("dt");
    const value = document.createElement("dd");
    name.textContent = metricDefinitions[key].label.replace(/ \([^)]*\)/g, "");
    value.textContent = formatMetric(metricValue(model, key), key);
    row.append(name, value);
    get("selected-model-metrics").append(row);
  }
  document.querySelectorAll("[data-model]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.model === id));
  });
  document.querySelectorAll("[data-ablation-model], [data-bar-model]").forEach((button) => {
    const active = (button.dataset.ablationModel || button.dataset.barModel) === id;
    button.setAttribute("aria-pressed", String(active));
  });
  get("bar-selection-note").textContent = `Selected: ${model.short_label}. Full statistics are available in the model panel above.`;
  if (state.chart) updateChart();
}

// Presentation colors are separate from the immutable research metrics.
const chartColors = {
  baseline: "#9db6df",
  proposed_sppf: "#d8c39a",
  proposed_simsppf: "#c0aecf",
  proposed_ghost: "#d29e8d",
  proposed_ghost_sppf: "#b0c994",
  proposed_ghost_simsppf: "#a4d6c0",
};
const chartColor = (model) => chartColors[model.id] || model.color;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function signedValue(value, digits = 2) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${Math.abs(value).toFixed(digits)}`;
}

function renderAblationCards() {
  const baseline = models.find((model) => model.role === "baseline");
  const roleLabels = { baseline: "Baseline", comparison: "Benchmark", ablation: "Ablation", final: "Final method" };
  for (const model of models) {
    const card = createElement("button", "ablation-card");
    card.type = "button";
    card.dataset.ablationModel = model.id;
    card.setAttribute("aria-pressed", "false");
    card.style.setProperty("--model-color", chartColor(model));
    const header = createElement("span", "ablation-card-heading");
    header.append(createElement("span", "ablation-role", roleLabels[model.role]), createElement("span", "ablation-arrow", "↗"));
    card.append(header, createElement("strong", "ablation-name", model.short_label));
    card.append(createElement("span", "ablation-description", model.label.replace(/^\+ /, "")));

    const stats = createElement("span", "ablation-stats");
    for (const [key, label] of [["map50", "mAP@0.5"], ["parameters", "Parameters"], ["fps", "GPU FPS"]]) {
      const stat = createElement("span", "ablation-stat");
      stat.append(createElement("span", "", label), createElement("strong", "", formatMetric(model[key], key)));
      stats.append(stat);
    }
    card.append(stats);
    const changes = createElement("span", "ablation-changes");
    if (model.role === "baseline") {
      changes.append(createElement("span", "", "Reference for every change below."));
    } else {
      const accuracyChange = model.map50 - baseline.map50;
      const sizeChange = (model.parameters / baseline.parameters - 1) * 100;
      const accuracy = createElement("span", accuracyChange >= 0 ? "change-positive" : "change-negative", `${signedValue(accuracyChange)} pp mAP@0.5`);
      const parameters = createElement("span", sizeChange <= 0 ? "change-positive" : "change-neutral", `${signedValue(sizeChange)}% parameters`);
      changes.append(accuracy, parameters);
    }
    card.append(changes);
    card.addEventListener("click", () => selectModel(model.id));
    get("ablation-cards").append(card);
  }
}

function barScale(key) {
  if (metricDefinitions[key].unit === "%") return 100;
  const values = models.map((model) => metricValue(model, key)).filter(Number.isFinite);
  const maximum = Math.max(...values);
  const step = maximum > 30 ? 10 : maximum > 10 ? 5 : 1;
  return Math.ceil(maximum * 1.1 / step) * step;
}

function renderMetricBars() {
  for (const key of [...overallMetricKeys, ...speciesMetricKeys]) {
    const definition = metricDefinitions[key];
    const maximum = barScale(key);
    const card = createElement("article", "metric-bar-card");
    card.dataset.metric = key;
    card.setAttribute("aria-labelledby", `bar-heading-${key}`);
    const heading = createElement("div", "metric-bar-heading");
    const title = createElement("h4", "", definition.label);
    title.id = `bar-heading-${key}`;
    const direction = createElement("span", lowerIsBetter.has(key) ? "metric-direction efficiency" : "metric-direction", lowerIsBetter.has(key) ? "Lower is better ↓" : "Higher is better ↑");
    heading.append(title, direction);
    card.append(heading);

    for (const model of models) {
      const value = metricValue(model, key);
      const row = createElement("button", "metric-bar");
      row.type = "button";
      row.dataset.barModel = model.id;
      row.setAttribute("aria-pressed", "false");
      row.setAttribute("aria-label", `${model.short_label}, ${definition.label}: ${formatMetric(value, key)}. Select this model.`);
      row.style.setProperty("--model-color", chartColor(model));
      const name = createElement("span", "bar-model-name", model.short_label);
      const track = createElement("span", "bar-track");
      track.setAttribute("aria-hidden", "true");
      if (Number.isFinite(value)) {
        const fill = createElement("span", "bar-fill");
        fill.style.setProperty("--bar-width", `${value / maximum * 100}%`);
        track.append(fill);
      } else {
        row.classList.add("missing");
      }
      row.append(name, track, createElement("span", "bar-value", Number.isFinite(value) ? formatMetric(value, key, false) : "Unreported"));
      row.addEventListener("click", () => selectModel(model.id));
      card.append(row);
    }
    const scale = createElement("div", "bar-scale");
    scale.append(createElement("span", "", "0"), createElement("span", "", `${maximum}${definition.unit}`));
    card.append(scale);
    const missing = models.filter((model) => !Number.isFinite(metricValue(model, key)));
    const note = missing.length ? `Unreported: ${missing.map((model) => model.short_label).join(", ")}. No zero value is assumed.` : `Reported values for all ${models.length} models.`;
    card.append(createElement("p", "bar-card-note", note));
    get("metric-bars").append(card);
  }
  filterMetricBars();
}

function filterMetricBars() {
  const view = get("bar-metric").value;
  get("metric-bars").dataset.view = view === "all" || view === "species" ? "grid" : "single";
  get("metric-bars").querySelectorAll(".metric-bar-card").forEach((card) => {
    const key = card.dataset.metric;
    card.hidden = view === "all" ? !overallMetricKeys.includes(key) : view === "species" ? !speciesMetricKeys.includes(key) : key !== view;
  });
}
get("bar-metric").addEventListener("change", filterMetricBars);

function chartData() {
  const xKey = get("x-axis").value;
  const yKey = get("y-axis").value;
  return models.filter((model) => Number.isFinite(model[xKey]) && Number.isFinite(model[yKey])).map((model) => ({
    label: model.short_label,
    modelId: model.id,
    data: [{ x: model[xKey], y: model[yKey] }],
    backgroundColor: chartColor(model),
    borderColor: model.id === state.selectedModel ? "#e2f3ed" : chartColor(model),
    borderWidth: model.id === state.selectedModel ? 3 : 1,
    pointRadius: model.id === state.selectedModel ? 9 : 6,
    pointHoverRadius: 10,
    pointStyle: model.role === "final" ? "rectRounded" : "circle",
  }));
}

function updateChart() {
  const xKey = get("x-axis").value;
  const yKey = get("y-axis").value;
  const xLabel = metricDefinitions[xKey].label;
  const yLabel = metricDefinitions[yKey].label;
  const omitted = models.filter((model) => !Number.isFinite(model[xKey]) || !Number.isFinite(model[yKey]));
  get("chart-note").textContent = omitted.length ? `${omitted.map((model) => model.short_label).join(", ")} omitted: a selected metric was not reported. All ${models.length} models remain in the table.` : "Select a point or a model chip to inspect its reported metrics.";
  get("tradeoff-chart").setAttribute("aria-label", `Scatter plot of ${xLabel} against ${yLabel}. Exact values are in the model table. ${omitted.length} models omitted for unreported values.`);
  if (typeof Chart === "undefined") {
    get("chart-note").textContent = "The chart could not load. Exact metrics remain available in the table below.";
    document.querySelector(".metrics-table-details").open = true;
    return;
  }
  const data = { datasets: chartData() };
  if (!state.chart) {
    state.chart = new Chart(get("tradeoff-chart"), {
      type: "scatter", data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: reduceMotion ? 0 : 450 },
        layout: { padding: { top: 10, right: 10 } },
        interaction: { mode: "nearest", intersect: true },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1d4a62", titleFont: { size: 11 }, bodyFont: { size: 10 },
            padding: 12, cornerRadius: 10, displayColors: false,
            callbacks: {
              title: (items) => items[0].dataset.label,
              label: (item) => {
                const x = get("x-axis").value;
                const y = get("y-axis").value;
                return [`${metricDefinitions[x].label}: ${formatMetric(item.parsed.x, x)}`, `${metricDefinitions[y].label}: ${formatMetric(item.parsed.y, y)}`];
              },
            },
          },
        },
        scales: {
          x: { title: { display: true, text: xLabel, color: "#b3cbd4", font: { size: 10 } }, grace: "18%", grid: { color: "#a8cddb19" }, border: { display: false }, ticks: { color: "#a6c1cd", font: { size: 9 }, maxTicksLimit: 6 } },
          y: { title: { display: true, text: yLabel, color: "#b3cbd4", font: { size: 10 } }, grace: "22%", grid: { color: "#a8cddb19" }, border: { display: false }, ticks: { color: "#a6c1cd", font: { size: 9 }, maxTicksLimit: 6 } },
        },
        onClick: (event, elements, chart) => {
          if (elements.length) selectModel(chart.data.datasets[elements[0].datasetIndex].modelId);
        },
        onHover: (event, elements) => { event.native.target.style.cursor = elements.length ? "pointer" : "default"; },
      },
    });
  } else {
    state.chart.data = data;
    state.chart.options.scales.x.title.text = xLabel;
    state.chart.options.scales.y.title.text = yLabel;
    state.chart.update();
    state.chart.resize();
  }
}
get("x-axis").addEventListener("change", updateChart);
get("y-axis").addEventListener("change", updateChart);
get("swap-axes").addEventListener("click", () => {
  const x = get("x-axis").value;
  get("x-axis").value = get("y-axis").value;
  get("y-axis").value = x;
  updateChart();
});

for (const model of models) {
  const button = document.createElement("button");
  button.className = "legend-button";
  button.type = "button";
  button.dataset.model = model.id;
  button.setAttribute("aria-pressed", "false");
  const dot = document.createElement("span");
  dot.className = "model-dot";
  dot.style.backgroundColor = chartColor(model);
  const label = document.createElement("span");
  label.textContent = model.short_label;
  button.append(dot, label);
  button.addEventListener("click", () => selectModel(model.id));
  get("model-legend").append(button);

  const row = document.createElement("tr");
  if (model.role === "final") row.className = "final-row";
  const nameCell = document.createElement("th");
  nameCell.scope = "row";
  nameCell.textContent = model.short_label;
  row.append(nameCell);
  for (const key of [...overallMetricKeys, ...speciesMetricKeys]) {
    const cell = document.createElement("td");
    const value = metricValue(model, key);
    cell.textContent = Number.isFinite(value) ? formatMetric(value, key, false) : "—";
    if (!Number.isFinite(value)) cell.setAttribute("aria-label", "Not reported");
    row.append(cell);
  }
  get("metrics-table-body").append(row);
}
renderAblationCards();
renderMetricBars();
selectModel(state.selectedModel);

get("download-metrics").addEventListener("click", () => {
  const columns = [...overallMetricKeys, ...speciesMetricKeys];
  const lines = ["model_id,model_label,mAP50_percent,mAP50_95_percent,parameters_M,GFLOPs,FPS_GPU,latency_ms_GPU,precision_percent,recall_percent,holothurian_AP50_percent,echinus_AP50_percent,scallop_AP50_percent,starfish_AP50_percent"];
  for (const model of models) {
    lines.push([model.id, model.short_label, ...columns.map((key) => metricValue(model, key) ?? "")].join(","));
  }
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, "waytechg-reported-model-metrics.csv");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Only a successful response from the configured provider produces a sent toast.
get("contact-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const status = get("contact-status");
  status.classList.remove("error");
  if (data.get("_gotcha")) { status.textContent = "Please leave the hidden field empty."; return; }
  if (!config.formEndpoint) {
    const subject = encodeURIComponent(`WAYTECHG Marine — ${data.get("topic")}`);
    const body = encodeURIComponent(`Name: ${data.get("name")}\nReply email: ${data.get("email")}\n\n${data.get("message")}`);
    window.location.href = `mailto:${config.contactEmail}?subject=${subject}&body=${body}`;
    status.textContent = "Email draft requested. Send it from your email app; no message has been sent by this website.";
    toast("Ready for your email app", "Send the draft in your email app to deliver your message.");
    return;
  }
  const button = get("contact-submit");
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = "Sending your message";
  status.textContent = "Submitting your message securely to Formspree.";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(config.formEndpoint, { method: "POST", body: data, headers: { Accept: "application/json" }, signal: controller.signal });
    const result = await response.json();
    if (!response.ok || result.ok === false || (Array.isArray(result.errors) && result.errors.length > 0)) {
      const errorText = Array.isArray(result.errors) ? result.errors.map((error) => error.message).join(" ") : "The form service could not accept your message. Please try again or email directly.";
      throw new Error(errorText);
    }
    form.reset();
    status.textContent = "Message accepted by the form service. Thank you for reaching out.";
    toast("Message sent. Thank you!", "Your message was accepted for delivery to Wilbert.");
  } catch (error) {
    status.textContent = error.name === "AbortError" ? "The form service did not confirm submission. Your message is preserved; check before retrying or contact Wilbert by email." : error.message;
    status.classList.add("error");
  } finally {
    clearTimeout(timeout);
    button.disabled = false;
    button.textContent = "Send message ↗";
  }
});

window.addEventListener("pagehide", () => {
  cancelAnalysis();
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  if (state.uploadPreviewUrl) URL.revokeObjectURL(state.uploadPreviewUrl);
});

window.waytechgTransport.syncStatus(config, presentInferenceMode);
