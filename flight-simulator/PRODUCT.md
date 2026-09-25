# Product

## Register

product

## Users

School students demonstrating a motion-controlled flight simulator, teachers evaluating the project, and classmates watching on a Raspberry Pi-connected display. Students need to test the simulator both with the ESP32 remote and with a keyboard.

## Product Purpose

Turn live pitch, roll, yaw-rate, and trigger readings from two ESP32 + MPU6050 remotes into an understandable two-player 3D flight match. Success means students can connect, calibrate, fly, score hits, understand split-screen rendering, and explain the complete architecture without assistance.

## Brand Personality

Approachable, educational, and energetic. It should feel like a real cockpit instrument made friendly for a classroom—not a toy landing page or a professional pilot-training system.

## Anti-references

No photorealistic flight-simulator chrome, aggressive military styling, gore, dense avionics, game-engine menus, decorative glass panels, or unexplained technical jargon. Avoid interfaces that hide connection state or make the first controller mandatory for testing.

## Design Principles

1. Keep flight visible: overlays must support the 3D view instead of covering it.
2. Make system state obvious: connection, input mode, altitude warning, and telemetry should be readable at a glance.
3. Teach through the interface: labels and controls should help students explain how motion becomes flight.
4. Fail usefully: keyboard mode remains available whenever the wireless remote is absent.
5. Prefer stable classroom performance over visual complexity.

## Accessibility & Inclusion

Target WCAG 2.1 AA contrast for interface text and controls. Never communicate connection state by color alone. Support keyboard operation, visible focus states, reduced-motion preferences, and layouts at 1280×720 and 1920×1080.
