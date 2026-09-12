import mqtt from "mqtt";
import admin from "firebase-admin";
import { getFirestore } from "../middleware/auth.js";
import { sendPushNotification } from "./push.js";

// ─── Types ────────────────────────────────────────────────────

export interface SensorReading {
  deviceId: string;
  deviceName: string;
  type:
    | "temperature"
    | "humidity"
    | "motion"
    | "door"
    | "water"
    | "power"
    | "air_quality";
  value: number;
  unit: string;
  timestamp: Date;
  battery?: number;
  rssi?: number;
}

export interface HomeState {
  sensors: Record<string, SensorReading>;
  network: {
    devicesOnline: number;
    lastHeartbeat: Date;
  };
  security: {
    allDoorsClosed: boolean;
    lastMotionLocation: string | null;
    lastMotionTime: Date | null;
  };
  updatedAt: Date;
}

// ─── Module State ─────────────────────────────────────────────

let mqttClient: mqtt.MqttClient | null = null;
let bridgeUid: string = "";

const homeState: HomeState = {
  sensors: {},
  network: {
    devicesOnline: 0,
    lastHeartbeat: new Date(),
  },
  security: {
    allDoorsClosed: true,
    lastMotionLocation: null,
    lastMotionTime: null,
  },
  updatedAt: new Date(),
};

// ─── ChirpStack Payload Parser ───────────────────────────────

function parseChirpStackPayload(
  topic: string,
  payload: Record<string, unknown>
): SensorReading | null {
  const deviceId =
    (payload.deviceInfo as Record<string, unknown>)?.devEui as string ||
    (payload.devEUI as string) ||
    "unknown";
  const deviceName =
    (payload.deviceInfo as Record<string, unknown>)?.deviceName as string ||
    (payload.deviceName as string) ||
    deviceId;

  // Decode the data object (ChirpStack puts decoded sensor data here)
  const data =
    (payload.object as Record<string, unknown>) ||
    (payload.data as Record<string, unknown>) ||
    {};

  const battery = (payload.rxInfo as Array<Record<string, unknown>>)?.[0]
    ? undefined
    : undefined;
  const rssi = (payload.rxInfo as Array<Record<string, unknown>>)?.[0]?.rssi as
    | number
    | undefined;

  const batteryLevel =
    (data.battery as number) ??
    ((payload.deviceInfo as Record<string, unknown>)?.battery as number) ??
    undefined;

  // Determine sensor type from the decoded payload
  if (data.temperature !== undefined) {
    return {
      deviceId,
      deviceName,
      type: "temperature",
      value: data.temperature as number,
      unit: "°C",
      timestamp: new Date(),
      battery: batteryLevel,
      rssi,
    };
  }

  if (data.humidity !== undefined) {
    return {
      deviceId,
      deviceName,
      type: "humidity",
      value: data.humidity as number,
      unit: "%",
      timestamp: new Date(),
      battery: batteryLevel,
      rssi,
    };
  }

  if (data.motion !== undefined || data.occupancy !== undefined) {
    return {
      deviceId,
      deviceName,
      type: "motion",
      value: (data.motion as number) ?? (data.occupancy as number) ?? 1,
      unit: "detected",
      timestamp: new Date(),
      battery: batteryLevel,
      rssi,
    };
  }

  if (
    data.door !== undefined ||
    data.window !== undefined ||
    data.contact !== undefined
  ) {
    const value =
      (data.door as number) ??
      (data.window as number) ??
      (data.contact as number) ??
      0;
    return {
      deviceId,
      deviceName,
      type: "door",
      value,
      unit: value ? "open" : "closed",
      timestamp: new Date(),
      battery: batteryLevel,
      rssi,
    };
  }

  if (
    data.water !== undefined ||
    data.leak !== undefined ||
    data.waterLeak !== undefined
  ) {
    const value =
      (data.water as number) ??
      (data.leak as number) ??
      (data.waterLeak as number) ??
      0;
    return {
      deviceId,
      deviceName,
      type: "water",
      value,
      unit: value ? "leak" : "dry",
      timestamp: new Date(),
      battery: batteryLevel,
      rssi,
    };
  }

  if (
    data.power !== undefined ||
    data.energy !== undefined ||
    data.watts !== undefined
  ) {
    return {
      deviceId,
      deviceName,
      type: "power",
      value:
        (data.power as number) ??
        (data.watts as number) ??
        (data.energy as number) ??
        0,
      unit: "W",
      timestamp: new Date(),
      battery: batteryLevel,
      rssi,
    };
  }

  if (data.co2 !== undefined || data.pm25 !== undefined || data.aqi !== undefined) {
    return {
      deviceId,
      deviceName,
      type: "air_quality",
      value:
        (data.aqi as number) ??
        (data.co2 as number) ??
        (data.pm25 as number) ??
        0,
      unit: data.aqi !== undefined ? "AQI" : data.co2 !== undefined ? "ppm" : "ug/m3",
      timestamp: new Date(),
      battery: batteryLevel,
      rssi,
    };
  }

  return null;
}

// ─── Parse Generic Home Topic ────────────────────────────────

function parseGenericHomeTopic(
  topic: string,
  payload: Record<string, unknown>
): SensorReading | null {
  // home/{room}/{sensorType}
  const parts = topic.split("/");
  if (parts.length < 3) return null;

  const room = parts[1];
  const sensorType = parts[2];
  const deviceId = `home-${room}-${sensorType}`;

  const typeMap: Record<string, SensorReading["type"]> = {
    temperature: "temperature",
    temp: "temperature",
    humidity: "humidity",
    motion: "motion",
    door: "door",
    water: "water",
    leak: "water",
    power: "power",
    energy: "power",
    air: "air_quality",
  };

  const mappedType = typeMap[sensorType];
  if (!mappedType) return null;

  const value =
    (payload.value as number) ??
    (payload.state as number) ??
    (payload[sensorType] as number) ??
    0;

  return {
    deviceId,
    deviceName: `${room} ${sensorType}`,
    type: mappedType,
    value,
    unit: (payload.unit as string) || "",
    timestamp: new Date(),
    battery: payload.battery as number | undefined,
    rssi: payload.rssi as number | undefined,
  };
}

// ─── Update Home State ─────────────────────────────────────────

function updateHomeState(reading: SensorReading): void {
  homeState.sensors[reading.deviceId] = reading;
  homeState.network.devicesOnline = Object.keys(homeState.sensors).length;
  homeState.network.lastHeartbeat = new Date();
  homeState.updatedAt = new Date();

  // Update security state
  if (reading.type === "door") {
    const doorSensors = Object.values(homeState.sensors).filter(
      (s) => s.type === "door"
    );
    homeState.security.allDoorsClosed = doorSensors.every(
      (s) => s.value === 0
    );
  }

  if (reading.type === "motion" && reading.value > 0) {
    homeState.security.lastMotionLocation = reading.deviceName;
    homeState.security.lastMotionTime = reading.timestamp;
  }
}

// ─── Store Reading in Firestore ────────────────────────────────

async function storeSensorReading(
  uid: string,
  reading: SensorReading
): Promise<void> {
  const db = getFirestore();
  const dateStr = new Date().toISOString().split("T")[0];

  try {
    await db
      .collection("users")
      .doc(uid)
      .collection("home")
      .doc("sensors")
      .collection(reading.deviceId)
      .doc(dateStr)
      .set(
        {
          readings: admin.firestore.FieldValue.arrayUnion({
            type: reading.type,
            value: reading.value,
            unit: reading.unit,
            timestamp: reading.timestamp.toISOString(),
            battery: reading.battery ?? null,
            rssi: reading.rssi ?? null,
          }),
          deviceName: reading.deviceName,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true }
      );
  } catch (err) {
    console.error(
      `[MqttBridge] Failed to store sensor reading for ${reading.deviceId}:`,
      err
    );
  }
}

// ─── Start MQTT Bridge ────────────────────────────────────────

export function startMqttBridge(defaultUid: string): void {
  const brokerUrl = process.env.MQTT_BROKER_URL;
  if (!brokerUrl) {
    console.warn("[MqttBridge] MQTT_BROKER_URL not set — bridge disabled");
    return;
  }

  bridgeUid = defaultUid;

  const options: mqtt.IClientOptions = {
    clientId: `aurora-backend-${Date.now()}`,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
  };

  if (process.env.MQTT_USERNAME) {
    options.username = process.env.MQTT_USERNAME;
    options.password = process.env.MQTT_PASSWORD;
  }

  mqttClient = mqtt.connect(brokerUrl, options);

  mqttClient.on("connect", () => {
    console.log("[MqttBridge] Connected to MQTT broker");

    // Subscribe to ChirpStack uplink events
    mqttClient!.subscribe(
      "chirpstack/application/+/device/+/event/up",
      { qos: 1 },
      (err) => {
        if (err) {
          console.error("[MqttBridge] Failed to subscribe to ChirpStack:", err);
        } else {
          console.log("[MqttBridge] Subscribed to ChirpStack uplinks");
        }
      }
    );

    // Subscribe to generic home topics
    mqttClient!.subscribe("home/+/+", { qos: 0 }, (err) => {
      if (err) {
        console.error("[MqttBridge] Failed to subscribe to home topics:", err);
      } else {
        console.log("[MqttBridge] Subscribed to home/+/+ topics");
      }
    });
  });

  mqttClient.on("message", async (topic: string, message: Buffer) => {
    try {
      const payload = JSON.parse(message.toString());
      let reading: SensorReading | null = null;

      if (topic.startsWith("chirpstack/")) {
        reading = parseChirpStackPayload(topic, payload);
      } else if (topic.startsWith("home/")) {
        reading = parseGenericHomeTopic(topic, payload);
      }

      if (!reading) return;

      // Update in-memory state
      updateHomeState(reading);

      // Persist to Firestore
      await storeSensorReading(bridgeUid, reading);

      // IMMEDIATE alert for water/leak detection
      if (reading.type === "water" && reading.value > 0) {
        console.warn(
          `[MqttBridge] WATER LEAK DETECTED: ${reading.deviceName}`
        );
        await sendPushNotification(bridgeUid, {
          title: "WATER LEAK DETECTED",
          body: `Water detected by ${reading.deviceName}. Check immediately!`,
          data: {
            type: "water_leak_alert",
            deviceId: reading.deviceId,
            deviceName: reading.deviceName,
            timestamp: reading.timestamp.toISOString(),
          },
        });
      }
    } catch (err) {
      console.error("[MqttBridge] Failed to process message:", err);
    }
  });

  mqttClient.on("error", (err) => {
    console.error("[MqttBridge] Connection error:", err);
  });

  mqttClient.on("reconnect", () => {
    console.log("[MqttBridge] Reconnecting to MQTT broker...");
  });

  mqttClient.on("offline", () => {
    console.warn("[MqttBridge] MQTT client offline");
  });
}

// ─── Stop MQTT Bridge ─────────────────────────────────────────

export function stopMqttBridge(): void {
  if (mqttClient) {
    mqttClient.end(true);
    mqttClient = null;
    console.log("[MqttBridge] Disconnected from MQTT broker");
  }
}

// ─── Get Home State ───────────────────────────────────────────

export function getHomeState(): HomeState {
  return homeState;
}

// ─── Get Home Context (one-line for system prompt) ───────────────

export function getHomeContext(): string {
  const sensorValues = Object.values(homeState.sensors);
  const sensorCount = sensorValues.length;

  if (sensorCount === 0) {
    return "HOME STATUS: No sensors connected.";
  }

  const parts: string[] = [];
  parts.push(`${sensorCount} sensors active`);

  // Door status
  if (homeState.security.allDoorsClosed) {
    parts.push("All doors secured");
  } else {
    const openDoors = sensorValues
      .filter((s) => s.type === "door" && s.value > 0)
      .map((s) => s.deviceName);
    if (openDoors.length > 0) {
      parts.push(`Open: ${openDoors.join(", ")}`);
    }
  }

  // Last motion
  if (
    homeState.security.lastMotionLocation &&
    homeState.security.lastMotionTime
  ) {
    const ago = Math.round(
      (Date.now() - homeState.security.lastMotionTime.getTime()) / 60000
    );
    if (ago < 60) {
      parts.push(
        `Last motion: ${homeState.security.lastMotionLocation} at ${ago}m ago`
      );
    } else {
      const hoursAgo = Math.round(ago / 60);
      parts.push(
        `Last motion: ${homeState.security.lastMotionLocation} at ${hoursAgo}h ago`
      );
    }
  }

  // Temperature (pick the first available)
  const tempSensor = sensorValues.find((s) => s.type === "temperature");
  if (tempSensor) {
    parts.push(`Temperature: ${tempSensor.value}${tempSensor.unit}`);
  }

  // Humidity
  const humiditySensor = sensorValues.find((s) => s.type === "humidity");
  if (humiditySensor) {
    parts.push(`Humidity: ${humiditySensor.value}${humiditySensor.unit}`);
  }

  return `HOME STATUS: ${parts.join(". ")}.`;
}

// ─── Get Sensor History ────────────────────────────────────────

export async function getSensorHistory(
  uid: string,
  deviceId: string,
  hours: number = 24
): Promise<SensorReading[]> {
  const db = getFirestore();
  const readings: SensorReading[] = [];

  // Calculate which date documents to query
  const now = new Date();
  const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

  const dates: string[] = [];
  const current = new Date(startTime);
  while (current <= now) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  for (const dateStr of dates) {
    try {
      const doc = await db
        .collection("users")
        .doc(uid)
        .collection("home")
        .doc("sensors")
        .collection(deviceId)
        .doc(dateStr)
        .get();

      if (!doc.exists) continue;

      const data = doc.data();
      const storedReadings =
        (data?.readings as Array<Record<string, unknown>>) || [];
      const deviceName = (data?.deviceName as string) || deviceId;

      for (const r of storedReadings) {
        const timestamp = new Date(r.timestamp as string);
        if (timestamp >= startTime && timestamp <= now) {
          readings.push({
            deviceId,
            deviceName,
            type: r.type as SensorReading["type"],
            value: r.value as number,
            unit: r.unit as string,
            timestamp,
            battery: (r.battery as number) ?? undefined,
            rssi: (r.rssi as number) ?? undefined,
          });
        }
      }
    } catch (err) {
      console.error(
        `[MqttBridge] Failed to fetch sensor history for ${deviceId} on ${dateStr}:`,
        err
      );
    }
  }

  readings.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return readings;
}
