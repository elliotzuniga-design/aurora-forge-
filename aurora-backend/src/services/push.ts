import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { getFirestore } from "../middleware/auth.js";
import type { PushNotificationPayload } from "../types/index.js";

const expo = new Expo();

// ─── Get User's Push Token ─────────────────────────────────────

async function getUserPushToken(uid: string): Promise<string | null> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(uid).get();
  const data = doc.data();
  return (data?.expoPushToken as string) || null;
}

// ─── Register Push Token ───────────────────────────────────────

export async function registerPushToken(
  uid: string,
  token: string
): Promise<void> {
  if (!Expo.isExpoPushToken(token)) {
    throw new Error(`Invalid Expo push token: ${token}`);
  }

  const db = getFirestore();
  await db.collection("users").doc(uid).set(
    {
      expoPushToken: token,
      pushTokenUpdatedAt: new Date(),
    },
    { merge: true }
  );
}

// ─── Send Push Notification ────────────────────────────────────

export async function sendPushNotification(
  uid: string,
  payload: PushNotificationPayload
): Promise<boolean> {
  const token = await getUserPushToken(uid);
  if (!token) {
    console.warn(`No push token found for user ${uid}`);
    return false;
  }

  const message: ExpoPushMessage = {
    to: token,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    priority: "high",
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

      for (const ticket of ticketChunk) {
        if (ticket.status === "error") {
          console.error(
            `Push notification error: ${ticket.message}`,
            ticket.details
          );
          return false;
        }
      }
    }

    // Log notification to Firestore
    const db = getFirestore();
    await db
      .collection("users")
      .doc(uid)
      .collection("notifications")
      .add({
        ...payload,
        sentAt: new Date(),
        status: "sent",
      });

    return true;
  } catch (err) {
    console.error("Failed to send push notification:", err);
    return false;
  }
}

// ─── Send Notification to All (for future multi-user) ──────────

export async function sendBatchNotification(
  uids: string[],
  payload: PushNotificationPayload
): Promise<void> {
  const results = await Promise.allSettled(
    uids.map((uid) => sendPushNotification(uid, payload))
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(`${failed.length}/${uids.length} push notifications failed`);
  }
}
