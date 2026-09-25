# Design System

## Theme

A bright-classroom training cockpit: a clear blue-grey low-poly world with a clean two-player competition HUD that remains legible on an HDMI display under overhead lighting.

## Color

- Background: `oklch(0.16 0.025 248)`
- Panel: `oklch(0.20 0.03 248 / 0.94)`
- Panel elevated: `oklch(0.25 0.04 248 / 0.96)`
- Ink: `oklch(0.98 0.01 248)`
- Muted ink: `oklch(0.79 0.025 248)`
- Player 1: `oklch(0.64 0.20 252)`
- Player 2: `oklch(0.64 0.22 27)`
- Warning accent: `oklch(0.82 0.17 82)`
- Success: `oklch(0.76 0.17 148)`
- Danger: `oklch(0.68 0.20 28)`

The palette is restrained: flight blue identifies Player 1, signal red identifies Player 2, amber marks targeting and warning states, and green is reserved for connection status.

## Typography

Use the native system sans-serif stack for reliability and offline use. Telemetry uses the native monospace stack. Headings are compact and sturdy; UI text is 14–16px with generous line height.

## Components

- Instrument panels use solid, high-opacity dark surfaces and a subtle 1px internal separator; no decorative blur.
- Buttons share an 8px radius, minimum 44px height, strong focus outline, and three visual priorities: primary, neutral, and utility.
- Status chips include both a dot and text so color is never the only signal.
- Telemetry values align in a two-column instrument readout.

## Layout

The WebGL canvas fills the viewport. One player uses a full-width chase camera; two connected remotes create equal left/right viewports. A shared first-to-five bar spans the top, narrow instruments sit at the outer edges, health sits low, and each reticle remains centered in its own half.

## Motion

Only state changes animate. Panels fade quickly, button feedback is immediate, and flight/camera smoothing is driven by frame delta. Reduced-motion mode removes interface transitions while retaining necessary flight movement.
