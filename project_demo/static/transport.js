/* Static deployment transport: local simulation or an explicitly configured API. */
"use strict";

(() => {
  const settings = window.WAYTECHG_SPACE || {};
  let backend = "";
  let setupError = "";
  if (settings.apiBaseUrl) {
    try {
      const url = new URL(settings.apiBaseUrl);
      if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
        throw new Error("Use the backend's direct HTTPS origin without a path or access token.");
      }
      backend = url.origin;
    } catch (error) {
      setupError = error.message || "The backend URL is invalid.";
    }
  }

  function abortIfNeeded(signal) {
    if (signal && signal.aborted) throw new DOMException("The request was cancelled.", "AbortError");
  }

  function regions(image) {
    const canvas = document.createElement("canvas");
    canvas.width = 120; canvas.height = 90;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, 120, 90);
    const pixels = context.getImageData(0, 0, 120, 90).data;
    const gray = new Float32Array(120 * 90);
    let seed = 2166136261;
    for (let index = 0; index < gray.length; index++) {
      const offset = index * 4;
      gray[index] = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
      seed = Math.imul(seed ^ Math.round(gray[index]), 16777619) >>> 0;
    }
    const candidates = [];
    for (let row = 1; row <= 4; row++) {
      for (let column = 1; column <= 5; column++) {
        const x = column / 7, y = row / 6;
        const left = Math.floor(x * 120 - 10), top = Math.floor(y * 90 - 8);
        let total = 0, squares = 0, edges = 0, count = 0;
        for (let py = top; py < top + 16; py++) {
          for (let px = left; px < left + 20; px++) {
            const value = gray[py * 120 + px];
            total += value; squares += value * value; count++;
            const horizontal = Math.abs(value - gray[py * 120 + px + 1]);
            const vertical = Math.abs(value - gray[(py + 1) * 120 + px]);
            edges += horizontal + vertical;
          }
        }
        const deviation = Math.sqrt(Math.max(0, squares / count - (total / count) ** 2));
        candidates.push({ score: deviation + edges / count * 0.35, x, y });
      }
    }
    candidates.sort((a, b) => b.score - a.score || b.x - a.x || b.y - a.y);
    const selected = [];
    for (const candidate of candidates) {
      if (selected.every(point => Math.hypot(point.x - candidate.x, point.y - candidate.y) > 0.25)) selected.push(candidate);
      if (selected.length === 4) break;
    }
    return { seed, boxes: selected.map(({ x, y }) => [x - 0.09, y - 0.085, 0.18, 0.17]) };
  }

  function simulation(image, illustrated) {
    const analysis = regions(image);
    const anchors = illustrated ? [[0.13, 0.51, 0.30, 0.13], [0.66, 0.35, 0.17, 0.19],
      [0.41, 0.33, 0.18, 0.18], [0.46, 0.61, 0.28, 0.27]] : analysis.boxes;
    const classes = ["holothurian", "echinus", "scallop", "starfish"];
    let seed = analysis.seed;
    const baseline = [], proposed = [];
    anchors.forEach((box, index) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const confidence = Math.round((0.78 + seed / 4294967296 * 0.16) * 100) / 100;
      proposed.push({ class_name: classes[index], confidence, box });
      if (index === 2) return;
      const [x, y, width, height] = box;
      const left = Math.max(0, x - 0.012), top = Math.max(0, y - 0.008);
      baseline.push({ class_name: classes[index], confidence: Math.round((confidence - 0.12) * 100) / 100,
        box: [left, top, Math.min(width + 0.017, 1 - left), Math.min(height + 0.015, 1 - top)] });
    });
    return { baseline, proposed };
  }

  function exportImage(image, detections, color) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const fontSize = Math.max(13, Math.round(canvas.width / 65));
    context.font = `${fontSize}px Arial`;
    context.lineWidth = Math.max(2, canvas.width / 450);
    for (const detection of detections) {
      const [x, y, width, height] = detection.box;
      const left = x * canvas.width, top = y * canvas.height;
      const label = `${detection.class_name} ${Math.round(detection.confidence * 100)}%`;
      const labelWidth = Math.min(canvas.width, context.measureText(label).width + 12);
      const labelHeight = fontSize + 12;
      const labelX = Math.min(left, canvas.width - labelWidth), labelY = Math.max(0, top - labelHeight);
      context.strokeStyle = color;
      context.strokeRect(left, top, width * canvas.width, height * canvas.height);
      context.fillStyle = color; context.fillRect(labelX, labelY, labelWidth, labelHeight);
      context.fillStyle = "white"; context.fillText(label, labelX + 6, labelY + fontSize + 3);
    }
    context.fillStyle = "#193e53"; context.fillRect(0, canvas.height - 28, canvas.width, 28);
    context.fillStyle = "white"; context.font = `${Math.max(7, Math.min(12, Math.round(canvas.width / 45)))}px Arial`;
    context.fillText(canvas.width < 400 ? "SIMULATION" : "WAYTECHG | SIMULATION | synthetic boxes, labels and scores", 4, canvas.height - 10);
    return canvas.toDataURL("image/png");
  }

  async function localResponse(path, options) {
    const started = performance.now(), signal = options.signal;
    abortIfNeeded(signal);
    const illustrated = path === "/api/demo";
    const file = illustrated ? null : options.body.get("image");
    if (!illustrated && (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024)) {
      return Response.json({ detail: "Choose a nonempty image smaller than 8 MB." }, { status: 422 });
    }
    const image = new Image();
    const source = illustrated ? "/static/demo-seabed.png" : URL.createObjectURL(file);
    try {
      image.src = source;
      await image.decode(); abortIfNeeded(signal);
      if (image.naturalWidth * image.naturalHeight > 20000000 || Math.min(image.naturalWidth, image.naturalHeight) < 64) {
        return Response.json({ detail: "Use an image with at most 20 megapixels and at least 64 pixels on each side." }, { status: 422 });
      }
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#f1f7f9"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const detections = simulation(canvas, illustrated);
      const result = { mode: "simulation", disclaimer: "Browser simulation. No trained model was executed.",
        source: illustrated ? "illustrated reference scene" : "visitor upload", width: canvas.width, height: canvas.height,
        original_width: image.naturalWidth, original_height: image.naturalHeight, input_size: null,
        confidence_threshold: 0.5, iou_threshold: null, device: null, model_timings_ms: {}, checkpoints: {},
        image: canvas.toDataURL("image/jpeg", 0.95), detections,
        exports: { baseline: exportImage(canvas, detections.baseline, "#496b9c"), proposed: exportImage(canvas, detections.proposed, "#137e91") },
        processing_ms: Math.round((performance.now() - started) * 10) / 10 };
      abortIfNeeded(signal);
      return Response.json(result);
    } finally { if (!illustrated) URL.revokeObjectURL(source); }
  }

  window.waytechgTransport = {
    configure(config) {
      if (/^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(settings.formEndpoint || "")) {
        config.formEndpoint = settings.formEndpoint;
        document.getElementById("contact-form").action = config.formEndpoint;
        document.getElementById("contact-submit").textContent = "Send message ↗";
        document.getElementById("contact-delivery-note").textContent = "Your message is sent through Formspree to Wilbert.";
      }
      if (backend || setupError) config.inference = { mode: "real", ready: false,
        error: setupError || "Connecting to the configured backend. Comparison waits for a server response." };
    },
    async syncStatus(config, refresh) {
      if (!backend) return;
      try {
        const response = await fetch(`${backend}/api/status`, { signal: AbortSignal.timeout(15000), credentials: "omit" });
        if (!response.ok) throw new Error(`Backend status returned HTTP ${response.status}.`);
        const status = await response.json();
        if (!["real", "simulation"].includes(status.mode)) throw new Error("The configured server is not a WAYTECHG backend.");
        config.inference = status;
      } catch (error) {
        config.inference = { mode: "real", ready: false,
          error: "The configured backend could not be reached. Check its URL, Space status, and WAYTECHG_ALLOWED_ORIGINS. " + error.message };
      }
      refresh();
    },
    async fetch(path, options) {
      if (setupError) throw new Error(setupError);
      // A configured backend failure never switches to synthetic predictions.
      if (backend) return fetch(`${backend}${path}`, { ...options, credentials: "omit" });
      return localResponse(path, options);
    },
  };
})();
