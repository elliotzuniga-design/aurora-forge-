import { getFirestore } from "../middleware/auth.js";
import { sendPushNotification } from "./push.js";

// ─── Twilio SMS Integration ─────────────────────────────────

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";

// ─── Contact Resolution ──────────────────────────────────────
// Resolves a name to a phone number from the user's contacts stored in Firestore

async function resolveContact(
  uid: string,
  nameOrNumber: string
): Promise<string | null> {
  // If it looks like a phone number already, return it
  if (/^\+?\d[\d\s()-]{7,}$/.test(nameOrNumber.trim())) {
    return nameOrNumber.replace(/[\s()-]/g, "");
  }

  // Look up in the user's contacts collection
  const db = getFirestore();
  const contactsSnap = await db
    .collection("users")
    .doc(uid)
    .collection("contacts")
    .where("name", "==", nameOrNumber)
    .limit(1)
    .get();

  if (!contactsSnap.empty) {
    return contactsSnap.docs[0].data().phone || null;
  }

  // Try case-insensitive search via lowercase field
  const lowerSnap = await db
    .collection("users")
    .doc(uid)
    .collection("contacts")
    .where("nameLower", "==", nameOrNumber.toLowerCase())
    .limit(1)
    .get();

  if (!lowerSnap.empty) {
    return lowerSnap.docs[0].data().phone || null;
  }

  return null;
}

// ─── Send SMS via Twilio ─────────────────────────────────────

async function sendSMS(to: string, body: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.warn("[Messaging] Twilio not configured");
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
          "base64"
        ),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: TWILIO_PHONE_NUMBER,
      Body: body,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("[Messaging] Twilio error:", err);
    return false;
  }

  return true;
}

// ─── Send Message (main entry point for the tool) ────────────

export async function sendMessage(
  uid: string,
  to: string,
  message: string,
  method: "sms" | "push"
): Promise<string> {
  if (method === "push") {
    // Send as push notification to the user themselves
    const sent = await sendPushNotification(uid, {
      title: `Message for ${to}`,
      body: message,
      data: { type: "message", to },
    });
    return JSON.stringify({
      status: sent ? "sent" : "failed",
      method: "push",
      to,
    });
  }

  // SMS via Twilio
  if (!TWILIO_ACCOUNT_SID) {
    return JSON.stringify({
      status: "not_configured",
      error:
        "SMS not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env",
    });
  }

  const phoneNumber = await resolveContact(uid, to);
  if (!phoneNumber) {
    return JSON.stringify({
      status: "failed",
      error: `Could not resolve "${to}" to a phone number. Try using a full phone number instead.`,
    });
  }

  const sent = await sendSMS(phoneNumber, message);

  // Log the message
  const db = getFirestore();
  await db
    .collection("users")
    .doc(uid)
    .collection("sentMessages")
    .add({
      to,
      phoneNumber,
      message,
      method: "sms",
      status: sent ? "sent" : "failed",
      sentAt: new Date(),
    });

  return JSON.stringify({
    status: sent ? "sent" : "failed",
    method: "sms",
    to,
    phoneNumber,
  });
}
