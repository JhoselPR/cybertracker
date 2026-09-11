# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: React, TypeScript, Vite, Tailwind CSS, and MediaPipe Tasks Vision.

## Users

People evaluating live hand tracking from a modern desktop or mobile browser.

## Product Purpose

Cybertracker visualizes live hand landmarks and supported static gestures over the front-facing camera, with concise tracking diagnostics.

## Capabilities and Constraints

The second iteration tracks up to two hands and recognizes open palm, fist, point, pinch, and victory poses. It does not include dynamic gestures, interactions, 3D rendering, or a backend. Camera access and first-load model downloads are required.

## Brand Commitments

Minimal black fullscreen camera surface with a restrained cyberpunk accent.

## Product Principles

- Keep tracking data independent from rendering and UI frameworks.
- Preserve raw model coordinates until the rendering boundary.
- Prefer a clear operational state over decorative interface chrome.
