// Keep the original arcade feel; lower pixelRatio or disable shadows on a Pi.
export const PERFORMANCE = { pixelRatio: 1.25, splitPixelRatio: 1, shadows: true, shadowMapSize: 1024 };
export const HUD_UPDATE_HZ = 10;
export const MAX_DELTA_TIME = 0.05;
export const MAX_BULLETS_PER_PLAYER = 96;
export const BULLET_SPEED = 260;
export const FIRE_INTERVAL = 0.065;
export const BULLET_LIFETIME = 2;
export const AIRCRAFT_SPEED = 42;
export const PITCH_SENSITIVITY = 24;
export const ROLL_SENSITIVITY = 55;
export const TURN_RATE = 58;
export const CONTROLLER_MAX_ANGLE = 45;
export const AIRPLANE_PITCH_INVERSION = 1;
export const AIRPLANE_ROLL_INVERSION = -1;

// Drone tuning lives here so classroom testing can adjust the feel in one place.
export const DRONE_MAX_CONTROLLER_ANGLE = 45;
export const DRONE_DEAD_ZONE = 4;
export const DRONE_INPUT_EXPONENT = 1.4;
export const DRONE_MAX_SPEED = 38;
export const DRONE_ACCELERATION = 58;
export const DRONE_DECELERATION = 76;
export const DRONE_MAX_VISUAL_TILT = 14;
export const DRONE_HOVER_HEIGHT = 12;
export const DRONE_ALTITUDE_CORRECTION = 3.5;
export const DRONE_MINIMUM_ALTITUDE = 8;
export const DRONE_CAMERA_DISTANCE = 18;
export const DRONE_CAMERA_HEIGHT = 8;
export const DRONE_FORWARD_INVERSION = 1;
export const DRONE_STRAFE_INVERSION = -1;
export const DRONE_PROPELLER_SPEED = 34;
export const WEBSOCKET_RECONNECT_MS = 1500;
