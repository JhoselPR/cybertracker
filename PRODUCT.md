# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: React, TypeScript, Vite, Tailwind CSS, and MediaPipe Tasks Vision.

## Users

People evaluating live hand tracking from a modern desktop or mobile browser.

## Product Purpose

Cybertracker visualizes live hand landmarks, supported static gestures, and normalized pointer-like interaction state over the front-facing camera, with concise tracking diagnostics.

## Capabilities and Constraints

The third iteration tracks up to two hands, recognizes open palm, fist, point, pinch, and victory poses, and converts stabilized point/pinch intent into pointer, pinch, and drag lifecycle output. It does not include dynamic gestures, real controls or HUD, 3D rendering, effects, additional ML, or a backend. Camera access and first-load model downloads are required.

## Brand Commitments

Minimal black fullscreen camera surface with a restrained cyberpunk accent.

## Product Principles

- Keep tracking data independent from rendering and UI frameworks.
- Preserve raw model coordinates until shared projection boundaries.
- Keep interaction rules independent from React, MediaPipe, Canvas, and rendering.
- Prefer a clear operational state over decorative interface chrome.
