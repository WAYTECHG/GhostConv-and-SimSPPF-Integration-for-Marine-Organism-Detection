---
title: WAYTECHG Marine Organism Detection
emoji: 🐚
colorFrom: blue
colorTo: gray
sdk: static
app_file: index.html
pinned: false
license: mit
short_description: Ocean website with simulation and an optional API.
---

# WAYTECHG Static Space

This separate folder keeps the same website colours, 3D artwork, animation,
six-model metrics, twelve bar charts, scatter chart, tables, CSV downloads,
contact form, dropzone preview, manual comparison, filled square result frames,
species/score filters, and PNG exports. No Python or Docker runtime is needed.

## Deploy

1. Choose Static as your Space SDK.
2. Upload the contents INSIDE this folder to the repository root.
3. `index.html`, `space-config.js`, `README.md`, and the `static` directory must
   be directly at the root. Commit the upload and open the App tab.

The default is an explicit browser simulation, not trained model inference.
Uploaded images are processed in the visitor's browser without being sent to
an inference server. Texture-based positions, labels, and scores are synthetic.
The illustrative comparison is not evidence of actual recognition or accuracy.

Static hosting cannot execute your PyTorch `.pt` files. To show genuine model
predictions, connect a running backend as described below.

## Connect the companion Gradio backend

Edit the public `space-config.js` file:

```javascript
window.WAYTECHG_SPACE = {
  apiBaseUrl: "https://yourname-waytechg-api.hf.space",
  formEndpoint: "https://formspree.io/f/yourRealFormId",
};
```

Use your actual direct backend origin and Formspree endpoint, not the example
addresses. In the backend Space settings set `WAYTECHG_ALLOWED_ORIGINS` to this
Static Space's exact direct origin, for example
`https://yourname-waytechg-static.hf.space`. Upload the two trained checkpoints
and enable real mode in that backend. The Static page checks `/api/status` and
sends the original image to `/api/detect` only after Compare models is pressed.

A configured backend failure is displayed as an error. The client never silently
replaces a failed real request with simulated boxes. A backend configured in
simulation mode is identified as simulation. The explicit illustrated-scene
action uses the backend's simulation route.

The backend must be reachable by visitors. `localhost` refers to each visitor's
computer, so it cannot connect a public Space to your laptop automatically.
A normal local FastAPI server also needs public hosting or a tunnel before
public visitors can use it. Do not place access tokens or private API keys in
`space-config.js`; every file in a public Static site is visible to visitors.

## Contact

Set `formEndpoint` to your public Formspree form URL for direct sending and the
existing success toast. Configure and verify the recipient in your Formspree
account; the public endpoint must belong to the form routed to your email. Keep it empty to retain the clearly labelled email-draft
fallback. No actual email was sent while preparing this package.

## Local preview

From this folder, run a static server in your existing environment:

```powershell
python -m http.server 7863
```

Open http://localhost:7863. Do not open index.html through a file:// URL; local
assets and browser requests need HTTP hosting.

## Use this same frontend locally with the Space backend

The copy also works on your computer with `python -m http.server 7863`. Keep
`apiBaseUrl` pointed at the public backend. Add `http://localhost:7863` to the
backend's comma-separated `WAYTECHG_ALLOWED_ORIGINS` alongside the Static Space
origin. If you open the page using 127.0.0.1 instead, allow that exact origin too.
This separate frontend does not replace your current local app files.

## Limits

- The browser validates file type, byte size, pixel dimensions, and decoded
  images. Real backend validation is stronger and rejects animated formats.
  Some browsers can decode an animated WebP's first frame in local simulation.
- Display bitmaps fill 640 × 640 without padding or cropping, so visual
  proportions may change. Model input and exports use their original pipeline.
- Offline reported GPU FPS is separate from browser or cloud inference speed.
- Account hosting eligibility applies to the backend. Static hosting alone
  does not provide a Python runtime, GPU, or guarantee backend uptime.

https://huggingface.co/docs/hub/spaces-sdks-static
https://huggingface.co/docs/hub/spaces-overview
