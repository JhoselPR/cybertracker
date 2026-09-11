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
3. `lib/coordinates` owns the pure source-to-viewport `object-fit: cover` projection shared by interaction and rendering.
4. `lib/interaction` is a framework-independent pointer, primary-hand, filtering, state, drag, and lifecycle-event pipeline. It consumes only application-owned enriched tracking types.
5. `hooks/useHandTracking.ts` owns camera lifecycle, the animation-frame inference loop, one gesture and interaction engine per lifecycle, synchronous output routing, throttled diagnostics, and teardown.
6. `lib/rendering` draws landmarks, stable labels, and the current interaction snapshot imperatively. It contains no gesture or interaction rules.
7. `components` render low-frequency status and diagnostics UI.

Tracking data retains raw, unmirrored MediaPipe coordinates. The front-camera video is mirrored with CSS; the shared cover projection mirrors X exactly once for both interaction and Canvas output.

### Gesture engine

`GestureEngine.processFrame(frame, { aspectRatio })` returns an `EnrichedTrackingFrame`. Each hand retains the neutral tracking fields and adds a persistent `trackId`, a raw classification with continuous per-class scores and five finger states, and a stabilized result. Gesture positions are the thumb/index midpoint for pinch, the index tip for point and victory, and the palm center otherwise; coordinates remain raw and unmirrored.

Geometry corrects normalized X values by the source width/height aspect ratio before measuring distances and angles. Palm scale is the mean of wrist-to-middle-MCP length and index-to-pinky palm width. Non-thumb fingers combine PIP/DIP straightness with palm-relative reach. The thumb separately combines MCP/IP straightness, spread from the index MCP, and palm-relative reach.

Central thresholds live in `lib/gestures/config.ts`. Pinch falls from full evidence at 0.20 palm scales to zero at 0.50 and wins above 0.72. Open palm, fist, point, and victory combine the weakest required condition (55%) with their average (45%) and accept at 0.70–0.72. Victory additionally requires index/middle separation that rises from 0.30 to 0.72 palm scales. These conservative thresholds intentionally prefer `unknown` over weak matches.

Temporal stabilization associates hands by palm/wrist geometry with handedness as a soft cost only. Initial promotion requires 120 ms, gesture transitions 170 ms, unknown is tolerated for 180 ms, and unseen tracks expire after 650 ms. Confidence is averaged during promotion and smoothed afterward. `reset()`/`dispose()` clear all history.

### Interaction engine

`new InteractionEngine(options?)` exposes `processFrame(enrichedFrame, context)`, `reset()`, and `dispose()`. The context is numeric and framework-independent: source width/height, viewport width/height, and `mirrorX`. Its output is an `InteractionFrame` containing the timestamp, primary track and handedness, normalized virtual pointer, state, optional drag snapshot, and discriminated events.

The live index tip (landmark 8) is always the pointer anchor. It is projected from normalized source space through a centered cover transform where `scale = max(viewportWidth/sourceWidth, viewportHeight/sourceHeight)`. Mirroring occurs before source scaling. Projection intentionally remains unclamped because a cover crop can place coordinates outside the viewport; the Interaction Engine filters those projected values and publishes clamped `[0, 1]` coordinates. Rendering multiplies the same projected normalized coordinates by Canvas CSS width and height. All dimensions must be finite and positive.

Pointer X and Y use independent One Euro filters with `minCutoff = 1.2 Hz`, `beta = 0.35`, and `derivativeCutoff = 1.0 Hz`. Each advancing timestamp supplies the real `dt`; derivative filtering adjusts the value cutoff so jitter remains damped while fast motion gains responsiveness. Published velocity is computed after filtering and clamping, in normalized viewport units per second. The first sample and a geometry rebase have zero velocity. Equal timestamps are ignored without lifecycle movement, while decreasing or non-finite timestamps throw `RangeError`.

Stable gesture intent maps `point` to `pointing`, `pinch` to `pinching`, and every other gesture to `idle`; no second dwell layer is added. Pinch starts once. Sustained pinch emits at most one `pinchmove` per advancing frame. At `0.045` normalized displacement from the filtered pinch origin, the same frame emits `pinchmove` then `dragstart` and enters `dragging`; later frames emit `dragmove`. Release from pinch emits `pinchend`. Release from drag emits `dragend` then `pinchend`. When position changes while the previous or resulting state is active, `pointermove` is first in that frame's event list. Drag snapshots include frame delta, total delta, straight-line distance, cumulative path length, and duration.

Primary acquisition ranks valid point/pinch hands first, then stable confidence descending and track ID ascending. If no hand has interactive intent, the same confidence/ID ranking selects a valid index-tip fallback for the visual pointer. Handedness is never a preference. Selection remains sticky while visible and throughout a `180 ms` tracking-loss grace period, preventing another hand from stealing control. During grace the pointer and interaction state are preserved, but the pointer is marked stale and untracked and no events fire. Same-track recovery continues without duplicate starts. After grace, active drag/pinch end with `tracking_lost`; the primary is released, and a replacement may be acquired on the next frame so old end events cannot interleave with new starts.

Source, viewport, orientation, or mirror changes reset the pointer filters and rebase the pointer and drag origin on that frame. State is retained, velocity is zero, and movement events are suppressed, preventing resize from appearing as user motion.

The complete `InteractionFrame` is passed synchronously to Canvas on every inference frame. React receives only the latest snapshot at the existing 250 ms diagnostics throttle; that snapshot is intentionally not an authoritative event stream.

## Limitations

- The MediaPipe WASM runtime and official Hand Landmarker model are fetched from external Google/jsDelivr URLs on first load. The tracker cannot initialize offline until those resources have been cached by the browser.
- Camera APIs require a secure context (`https://` or `localhost`) and user permission.
- Inference speed and thermal behavior vary by device and browser.
- Static recognition is heuristic and most ambiguous around partially curled fingers, side-on hands, foreshortening, and point versus victory when the middle finger is occluded.
- Cover projection and interaction are unit-tested without MediaPipe or the DOM, but camera quality and physical-device behavior still vary by hardware.
- This iteration intentionally has no real HUD or controls, swipe, inertia, dwell selection, double pinch, audio, haptics, Three.js/WebGL, particles, additional ML, or backend.
