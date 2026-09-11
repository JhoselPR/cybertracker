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
- `npm test` — run the deterministic Vitest unit suite once.
- `npm run build` — create a production build.
- `npm run preview` — serve the production build locally.

## Architecture

The camera-to-interface flow is deliberately separated:

1. `lib/vision` owns MediaPipe initialization and converts SDK results into application tracking types.
2. `lib/gestures` is a framework- and browser-independent pipeline: geometry, finger-state extraction, raw static classification, temporal stabilization, and the public `GestureEngine` orchestrator.
3. `hooks/useHandTracking.ts` owns camera lifecycle, the animation-frame inference loop, one gesture engine per lifecycle, throttled diagnostics, and teardown.
4. `lib/rendering` maps raw normalized landmarks and stable labels through the video's `object-fit: cover` crop and draws them imperatively. It contains no recognition logic.
5. `components` render low-frequency status and diagnostics UI.

Tracking data retains raw, unmirrored MediaPipe coordinates. The front-camera video is mirrored with CSS; X is mirrored exactly once at the canvas rendering boundary.

### Gesture engine

`GestureEngine.processFrame(frame, { aspectRatio })` returns an `EnrichedTrackingFrame`. Each hand retains the neutral tracking fields and adds a persistent `trackId`, a raw classification with continuous per-class scores and five finger states, and a stabilized result. Gesture positions are the thumb/index midpoint for pinch, the index tip for point and victory, and the palm center otherwise; coordinates remain raw and unmirrored.

Geometry corrects normalized X values by the source width/height aspect ratio before measuring distances and angles. Palm scale is the mean of wrist-to-middle-MCP length and index-to-pinky palm width. Non-thumb fingers combine PIP/DIP straightness with palm-relative reach. The thumb separately combines MCP/IP straightness, spread from the index MCP, and palm-relative reach.

Central thresholds live in `lib/gestures/config.ts`. Pinch falls from full evidence at 0.20 palm scales to zero at 0.50 and wins above 0.72. Open palm, fist, point, and victory combine the weakest required condition (55%) with their average (45%) and accept at 0.70–0.72. Victory additionally requires index/middle separation that rises from 0.30 to 0.72 palm scales. These conservative thresholds intentionally prefer `unknown` over weak matches.

Temporal stabilization associates hands by palm/wrist geometry with handedness as a soft cost only. Initial promotion requires 120 ms, gesture transitions 170 ms, unknown is tolerated for 180 ms, and unseen tracks expire after 650 ms. Confidence is averaged during promotion and smoothed afterward. `reset()`/`dispose()` clear all history.

## Limitations

- The MediaPipe WASM runtime and official Hand Landmarker model are fetched from external Google/jsDelivr URLs on first load. The tracker cannot initialize offline until those resources have been cached by the browser.
- Camera APIs require a secure context (`https://` or `localhost`) and user permission.
- Inference speed and thermal behavior vary by device and browser.
- Static recognition is heuristic and most ambiguous around partially curled fingers, side-on hands, foreshortening, and point versus victory when the middle finger is occluded.
- This iteration intentionally has no dynamic gestures, grab/drag/hold behavior, interaction system, cursor, HUD, 3D renderer, effects, or backend.
