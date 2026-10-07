# Deployment verification

Local validation passed. The existing waytechg-marine folder was compared against
its complete previous archive: no files changed.

- Bundled original training modules load untrained architecture fixtures and execute cached real 640 input inference on CPU.
- Static browser-only simulation: upload stays in dropzone, manual comparison, 640 square display, explicit synthetic boxes, filters, exports, new-file clearing, reset and demo.
- Same six-model statistics and twelve bar charts, custom scatter axes, responsive layouts at 320/390/768/1440 widths.
- Gradio SDK custom FastAPI frontend serves the original UI and preserves manual inference flow.
- Static page connects over real cross-origin HTTPS/CORS to backend; source file is sent only after Compare, real mode retains original image dimensions and 640 model input.
- Configured backend 503 remains a visible error with empty result frames and no synthetic fallback.
- Configured Formspree form confirms success only after a mocked acceptance; no actual messages sent.
- Styles, motion and main artwork match the original byte for byte; neither deployment folder needs a Dockerfile.

## Limits of verification

- Original trained private checkpoints were not provided. Real inference tests use untrained architecture fixtures, not accuracy validation.
- Local QA used CPU PyTorch 2.6.0. The pinned cloud PyTorch 2.8 build and hosted Space startup/account eligibility are not verified.
- The external iframe resizing helper was mocked; Hugging Face parent-frame behavior is not tested.

The exported browser simulation PNG retained the 1200 × 600 processed resolution
and original aspect ratio, with a simulation disclosure watermark inside the image. No trained checkpoints, test
fixtures, personal runtime credentials, virtual environments, or QA certificates
are included. No site was published and no real contact message was submitted.
