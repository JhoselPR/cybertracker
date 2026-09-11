# Cybertracker

A fullscreen browser hand-tracking prototype built with React, TypeScript, Vite, Tailwind CSS, and MediaPipe Tasks Vision.

## Setup

```bash
npm install
npm run dev
```

Open the local HTTPS/localhost URL in a modern browser and grant camera access.

## Scripts

- `npm run dev` — start Vite development mode.
- `npm run lint` — run ESLint.
- `npm run typecheck` — validate TypeScript without emitting files.
- `npm run build` — create a production build.
- `npm run preview` — serve the production build locally.

## Architecture

The camera-to-interface flow is deliberately separated:

1. `lib/vision` owns MediaPipe initialization and converts SDK results into application tracking types.
2. `hooks/useHandTracking.ts` owns camera lifecycle, the animation-frame inference loop, throttled diagnostics, and teardown.
3. `lib/rendering` maps raw normalized landmarks through the video's `object-fit: cover` crop and draws them imperatively.
4. `components` render low-frequency status and diagnostics UI.

Tracking data retains raw, unmirrored MediaPipe coordinates. The front-camera video is mirrored with CSS; X is mirrored exactly once at the canvas rendering boundary.

## Limitations

- The MediaPipe WASM runtime and official Hand Landmarker model are fetched from external Google/jsDelivr URLs on first load. The tracker cannot initialize offline until those resources have been cached by the browser.
- Camera APIs require a secure context (`https://` or `localhost`) and user permission.
- Inference speed and thermal behavior vary by device and browser.
- This iteration intentionally has no gesture recognition, interaction system, 3D renderer, or backend.
