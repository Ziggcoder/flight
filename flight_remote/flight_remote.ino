/*
  ESP32 Wireless Motion Controller for 3D Flight Simulator

  Required Arduino libraries:
  - Adafruit MPU6050
  - Adafruit Unified Sensor
  - Adafruit BusIO (normally installed automatically)
  - WebSockets by Markus Sattler (arduinoWebSockets)

  The ESP32 Wi-Fi library and Wire library are included with the ESP32 board
  package, so they do not need to be installed separately.
*/

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

// --------------------------- Pin connections ---------------------------
const int SDA_PIN = 21;
const int SCL_PIN = 22;
const int CALIBRATION_BUTTON_PIN = 4;  // Centre/calibrate button: GPIO4 to GND
const int FIRE_BUTTON_PIN = 5;         // Gun trigger: GPIO5 to GND

// --------------------------- Wi-Fi settings ----------------------------
// The ESP32 joins this router or phone hotspot and receives its IP by DHCP.
// Connect the Raspberry Pi to the same Wi-Fi network.
const char *WIFI_SSID = "zigg";
const char *WIFI_PASSWORD = "11223344";

Adafruit_MPU6050 mpu;
WebSocketsServer webSocket(81);

// Gyroscope zero offsets, in degrees per second.
float gyroOffsetX = 0.0f;
float gyroOffsetY = 0.0f;
float gyroOffsetZ = 0.0f;

// Complementary-filter angles and the user-selected neutral position.
float pitch = 0.0f;
float roll = 0.0f;
float pitchCenter = 0.0f;
float rollCenter = 0.0f;

// Values sent to the flight simulator after limiting, dead zone and smoothing.
float outputPitch = 0.0f;
float outputRoll = 0.0f;
float outputYawRate = 0.0f;

// Button-debounce state. Pressed buttons read LOW because INPUT_PULLUP is used.
bool fireHeld = false;
uint32_t fireSequence = 0;
uint32_t motionSequence = 0;
int lastRawCalibrationState = HIGH;
int stableCalibrationState = HIGH;
unsigned long lastCalibrationChangeMs = 0;
int lastRawFireState = HIGH;
int stableFireState = HIGH;
unsigned long lastFireChangeMs = 0;
const unsigned long CALIBRATION_DEBOUNCE_MS = 35;
const unsigned long FIRE_DEBOUNCE_MS = 10;

// Sensor, network and heartbeat rates are intentionally independent.
const uint16_t SENSOR_HZ = 100;
const uint16_t MOTION_TX_HZ = 60;
const unsigned long HEARTBEAT_INTERVAL_MS = 1000;  // Browser sends the ping.
const unsigned long SENSOR_INTERVAL_US = 1000000UL / SENSOR_HZ;
const unsigned long MOTION_TX_INTERVAL_US = 1000000UL / MOTION_TX_HZ;
const unsigned long SERIAL_INTERVAL_MS = 1000;
unsigned long lastSensorSampleUs = 0;
unsigned long lastMotionUpdateUs = 0;
unsigned long lastMotionTxUs = 0;
unsigned long lastSerialMs = 0;
uint32_t txPacketsThisWindow = 0;
uint32_t loopIterationsThisWindow = 0;

const float RAD_TO_DEG_F = 57.2957795f;
const float COMPLEMENTARY_GYRO_WEIGHT = 0.98f;
const float COMPLEMENTARY_ACCEL_WEIGHT = 0.02f;
// Higher response keeps light noise filtering but removes sluggish control lag.
const float OUTPUT_SMOOTHING = 0.40f;
const float ANGLE_LIMIT = 45.0f;
const float ANGLE_DEAD_ZONE = 3.0f;

// Function declarations make the sketch structure easy to see.
void setupMPU();
void calibrateGyro();
void initializeAngles();
void updateMotion();
float applyDeadZone(float value, float deadZone);
void startWiFi();
void webSocketEvent(uint8_t clientNumber, WStype_t type,
                    uint8_t *payload, size_t length);
void sendMotionPacket();
void sendFireEvent();
void sendCalibratedEvent();
void sendPong(uint8_t clientNumber, uint32_t id, double clientTime);
void calibrateNeutral();
void updateButtons();
void printStatus();

void setup() {
  Serial.begin(115200);
  delay(300);  // Give Serial Monitor a moment to start.

  Serial.println();
  Serial.println("ESP32 Wireless Motion Controller");
  Serial.println("================================");

  pinMode(CALIBRATION_BUTTON_PIN, INPUT_PULLUP);
  pinMode(FIRE_BUTTON_PIN, INPUT_PULLUP);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  setupMPU();
  calibrateGyro();
  initializeAngles();

  // The startup position becomes the first neutral position.
  calibrateNeutral();

  startWiFi();
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);

  lastSensorSampleUs = micros();
  lastMotionUpdateUs = lastSensorSampleUs;
  lastMotionTxUs = lastSensorSampleUs;
  lastSerialMs = millis();

  Serial.println("WebSocket server started on port 81.");
  Serial.printf("Rates: sensor %u Hz, motion TX %u Hz, heartbeat %lu ms\n",
                SENSOR_HZ, MOTION_TX_HZ,
                (unsigned long)HEARTBEAT_INTERVAL_MS);
  Serial.println("Controller ready!");
}

void loop() {
  loopIterationsThisWindow++;

  // This must be called very often so WebSocket traffic is handled quickly.
  webSocket.loop();
  updateButtons();

  unsigned long nowUs = micros();
  if ((unsigned long)(nowUs - lastSensorSampleUs) >= SENSOR_INTERVAL_US) {
    lastSensorSampleUs = nowUs;
    updateMotion();
  }

  if ((unsigned long)(nowUs - lastMotionTxUs) >= MOTION_TX_INTERVAL_US) {
    lastMotionTxUs = nowUs;
    sendMotionPacket();
  }

  unsigned long nowMs = millis();
  if ((unsigned long)(nowMs - lastSerialMs) >= SERIAL_INTERVAL_MS) {
    printStatus();
    lastSerialMs = nowMs;
  }
}

// Find the MPU6050 and keep retrying if it is not connected correctly.
void setupMPU() {
  Serial.println("Looking for the MPU6050...");

  while (true) {
    if (mpu.begin(0x68, &Wire)) {
      Serial.println("MPU6050 detected at I2C address 0x68.");
      break;
    }

    // Some MPU6050 boards use 0x69 when their AD0 pin is HIGH.
    if (mpu.begin(0x69, &Wire)) {
      Serial.println("MPU6050 detected at I2C address 0x69.");
      break;
    }

    Serial.println("ERROR: MPU6050 not detected at 0x68 or 0x69.");
    Serial.println("Check 3.3V, GND, SDA GPIO21 and SCL GPIO22. Retrying...");
    delay(2000);  // Blocking is acceptable here because setup is not complete.
  }

  // These ranges suit normal hand movement while leaving useful headroom.
  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
}

// Measure gyro bias while the controller is flat and completely still.
void calibrateGyro() {
  const int sampleCount = 500;
  float sumX = 0.0f;
  float sumY = 0.0f;
  float sumZ = 0.0f;
  sensors_event_t acceleration, gyro, temperature;

  Serial.println();
  Serial.println("GYROSCOPE CALIBRATION");
  Serial.println("Place the controller flat and keep it completely still.");
  Serial.println("Calibration starts in about 2 seconds...");
  delay(2000);

  Serial.println("Sampling gyro; keep the controller still...");
  for (int i = 0; i < sampleCount; i++) {
    mpu.getEvent(&acceleration, &gyro, &temperature);
    sumX += gyro.gyro.x * RAD_TO_DEG_F;
    sumY += gyro.gyro.y * RAD_TO_DEG_F;
    sumZ += gyro.gyro.z * RAD_TO_DEG_F;
    delay(4);
  }

  gyroOffsetX = sumX / sampleCount;
  gyroOffsetY = sumY / sampleCount;
  gyroOffsetZ = sumZ / sampleCount;

  Serial.println("Gyroscope calibration complete.");
  Serial.printf("Offsets X/Y/Z: %.3f, %.3f, %.3f deg/s\n",
                gyroOffsetX, gyroOffsetY, gyroOffsetZ);
}

// Start pitch and roll at the accelerometer's current estimate.
void initializeAngles() {
  sensors_event_t acceleration, gyro, temperature;
  mpu.getEvent(&acceleration, &gyro, &temperature);

  float ax = acceleration.acceleration.x;
  float ay = acceleration.acceleration.y;
  float az = acceleration.acceleration.z;

  pitch = atan2f(-ax, sqrtf(ay * ay + az * az)) * RAD_TO_DEG_F;
  roll = atan2f(ay, az) * RAD_TO_DEG_F;
}

// Read the sensor and combine short-term gyro motion with stable accel angles.
void updateMotion() {
  unsigned long nowUs = micros();
  float deltaTime = (unsigned long)(nowUs - lastMotionUpdateUs) / 1000000.0f;
  lastMotionUpdateUs = nowUs;

  sensors_event_t acceleration, gyro, temperature;
  mpu.getEvent(&acceleration, &gyro, &temperature);

  float ax = acceleration.acceleration.x;
  float ay = acceleration.acceleration.y;
  float az = acceleration.acceleration.z;

  float accelPitch = atan2f(-ax, sqrtf(ay * ay + az * az)) * RAD_TO_DEG_F;
  float accelRoll = atan2f(ay, az) * RAD_TO_DEG_F;

  float gyroX = gyro.gyro.x * RAD_TO_DEG_F - gyroOffsetX;
  float gyroY = gyro.gyro.y * RAD_TO_DEG_F - gyroOffsetY;
  float gyroZ = gyro.gyro.z * RAD_TO_DEG_F - gyroOffsetZ;

  // Ignore an unusually long interval instead of integrating a large jump.
  if (deltaTime <= 0.0f || deltaTime > 0.1f) {
    deltaTime = SENSOR_INTERVAL_US / 1000000.0f;
  }

  float gyroPitch = pitch + gyroY * deltaTime;
  float gyroRoll = roll + gyroX * deltaTime;

  pitch = COMPLEMENTARY_GYRO_WEIGHT * gyroPitch +
          COMPLEMENTARY_ACCEL_WEIGHT * accelPitch;
  roll = COMPLEMENTARY_GYRO_WEIGHT * gyroRoll +
         COMPLEMENTARY_ACCEL_WEIGHT * accelRoll;

  float relativePitch = constrain(pitch - pitchCenter, -ANGLE_LIMIT, ANGLE_LIMIT);
  float relativeRoll = constrain(roll - rollCenter, -ANGLE_LIMIT, ANGLE_LIMIT);

  relativePitch = applyDeadZone(relativePitch, ANGLE_DEAD_ZONE);
  relativeRoll = applyDeadZone(relativeRoll, ANGLE_DEAD_ZONE);

  // A simple low-pass filter makes small hand tremors and sensor noise smoother.
  outputPitch += OUTPUT_SMOOTHING * (relativePitch - outputPitch);
  outputRoll += OUTPUT_SMOOTHING * (relativeRoll - outputRoll);
  outputYawRate += OUTPUT_SMOOTHING * (gyroZ - outputYawRate);
}

float applyDeadZone(float value, float deadZone) {
  if (fabsf(value) < deadZone) {
    return 0.0f;
  }
  return value;
}

// Join an existing router/hotspot and get an IP address automatically by DHCP.
void startWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);  // Lower latency for motion packets.

  Serial.println();
  Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);
  Serial.println("Waiting for a DHCP address...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long attemptStartedMs = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);  // Setup is not finished yet, so a short wait is acceptable.
    Serial.print(".");

    // Restart the connection attempt if the router has not answered in 20 s.
    if ((unsigned long)(millis() - attemptStartedMs) >= 20000) {
      Serial.println();
      Serial.println("Still not connected. Check SSID/password; retrying...");
      WiFi.disconnect();
      delay(250);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      attemptStartedMs = millis();
    }
  }

  IPAddress assignedIP = WiFi.localIP();
  Serial.println();
  Serial.println("Wi-Fi connected. DHCP address received!");
  Serial.print("ESP32 IP address: ");
  Serial.println(assignedIP);
  Serial.print("Enter this in the flight simulator: ");
  Serial.println(assignedIP);
  Serial.printf("WebSocket URL: ws://%s:81\n", assignedIP.toString().c_str());
}

// Handle browser connections, calibration commands and application ping/pong.
void webSocketEvent(uint8_t clientNumber, WStype_t type,
                    uint8_t *payload, size_t length) {
  if (type == WStype_CONNECTED) {
    IPAddress clientIP = webSocket.remoteIP(clientNumber);
    Serial.printf("WebSocket client %u connected from %s\n",
                  clientNumber, clientIP.toString().c_str());
  } else if (type == WStype_DISCONNECTED) {
    Serial.printf("WebSocket client %u disconnected.\n", clientNumber);
  } else if (type == WStype_TEXT) {
    // Commands are infrequent, but a fixed buffer still avoids heap churn.
    char message[192];
    if (length >= sizeof(message)) {
      return;
    }
    memcpy(message, payload, length);
    message[length] = '\0';

    if (strcasecmp(message, "CALIBRATE") == 0) {
      calibrateNeutral();
      sendCalibratedEvent();
      webSocket.sendTXT(clientNumber, "CALIBRATED");
    } else if (strcasecmp(message, "PING") == 0) {
      webSocket.sendTXT(clientNumber, "PONG");
    } else if (strstr(message, "\"type\":\"ping\"") != NULL) {
      const char *idField = strstr(message, "\"id\":");
      const char *timeField = strstr(message, "\"clientTime\":");
      if (idField != NULL && timeField != NULL) {
        uint32_t id = strtoul(idField + 5, NULL, 10);
        double clientTime = strtod(timeField + 13, NULL);
        sendPong(clientNumber, id, clientTime);
      }
    }
  }
}

// Motion is current state. The browser keeps only the newest sequence number.
void sendMotionPacket() {
  char json[220];
  uint32_t sequence = motionSequence++;
  snprintf(json, sizeof(json),
           "{\"type\":\"motion\",\"seq\":%lu,\"deviceMs\":%lu,"
           "\"p\":%.1f,\"r\":%.1f,\"y\":%.1f,\"b\":%u,"
           "\"fireHeld\":%s,\"fireSeq\":%lu}",
           (unsigned long)sequence, (unsigned long)millis(),
           outputPitch, outputRoll, -outputYawRate,
           fireHeld ? 1 : 0,
           fireHeld ? "true" : "false",
           (unsigned long)fireSequence);

  webSocket.broadcastTXT(json);
  txPacketsThisWindow++;
}

// Fire edges are sent immediately instead of waiting for a motion packet.
void sendFireEvent() {
  char json[112];
  snprintf(json, sizeof(json),
           "{\"type\":\"fire\",\"pressed\":%s,\"fireSeq\":%lu}",
           fireHeld ? "true" : "false",
           (unsigned long)fireSequence);
  webSocket.broadcastTXT(json);
}

void sendCalibratedEvent() {
  char json[72];
  snprintf(json, sizeof(json),
           "{\"type\":\"calibrated\",\"deviceMs\":%lu}",
           (unsigned long)millis());
  webSocket.broadcastTXT(json);
}

void sendPong(uint8_t clientNumber, uint32_t id, double clientTime) {
  char json[160];
  snprintf(json, sizeof(json),
           "{\"type\":\"pong\",\"id\":%lu,\"clientTime\":%.2f,"
           "\"deviceMs\":%lu}",
           (unsigned long)id, clientTime, (unsigned long)millis());
  webSocket.sendTXT(clientNumber, json);
}

// Make the controller's current physical angle the new zero position.
void calibrateNeutral() {
  pitchCenter = pitch;
  rollCenter = roll;
  outputPitch = 0.0f;
  outputRoll = 0.0f;
  Serial.printf("Neutral position set: pitch %.1f, roll %.1f degrees.\n",
                pitchCenter, rollCenter);
}

// Debounce both buttons without delaying sensor readings or WebSocket traffic.
void updateButtons() {
  unsigned long nowMs = millis();
  int rawCalibrationState = digitalRead(CALIBRATION_BUTTON_PIN);

  if (rawCalibrationState != lastRawCalibrationState) {
    lastRawCalibrationState = rawCalibrationState;
    lastCalibrationChangeMs = nowMs;
  }

  if ((unsigned long)(nowMs - lastCalibrationChangeMs) >= CALIBRATION_DEBOUNCE_MS &&
      rawCalibrationState != stableCalibrationState) {
    stableCalibrationState = rawCalibrationState;
    if (stableCalibrationState == LOW) {
      calibrateNeutral();
      sendCalibratedEvent();
    }
  }

  int rawFireState = digitalRead(FIRE_BUTTON_PIN);
  if (rawFireState != lastRawFireState) {
    lastRawFireState = rawFireState;
    lastFireChangeMs = nowMs;
  }

  if ((unsigned long)(nowMs - lastFireChangeMs) >= FIRE_DEBOUNCE_MS &&
      rawFireState != stableFireState) {
    stableFireState = rawFireState;
    fireHeld = (stableFireState == LOW);

    // Each trigger press receives a new number. The matching release uses the
    // same number, so the browser can ignore duplicates without losing taps.
    if (fireHeld) {
      fireSequence++;
    }
    sendFireEvent();
  }
}

void printStatus() {
  unsigned long elapsedMs = millis() - lastSerialMs;
  float txRate = elapsedMs > 0
                     ? (txPacketsThisWindow * 1000.0f) / elapsedMs
                     : 0.0f;
  float loopRate = elapsedMs > 0
                       ? (loopIterationsThisWindow * 1000.0f) / elapsedMs
                       : 0.0f;

  Serial.println("--- Controller status ---");
  Serial.printf("Motion P/R/Y: %.1f / %.1f / %.1f\n",
                outputPitch, outputRoll, outputYawRate);
  Serial.printf("Motion TX: %.1f packets/s, latest sequence: %lu\n",
                txRate,
                (unsigned long)(motionSequence == 0 ? 0 : motionSequence - 1));
  Serial.printf("Fire: %s, fire sequence: %lu\n",
                fireHeld ? "PRESSED" : "released",
                (unsigned long)fireSequence);
  Serial.printf("WebSocket clients: %d, loop rate: %.0f/s\n",
                webSocket.connectedClients(), loopRate);
  Serial.printf("Wi-Fi: %s, RSSI: %d dBm, DHCP IP: %s\n",
                WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED",
                WiFi.RSSI(), WiFi.localIP().toString().c_str());

  txPacketsThisWindow = 0;
  loopIterationsThisWindow = 0;
}
