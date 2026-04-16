import { getFirestore } from "../middleware/auth.js";

// ─── Google Calendar OAuth + API ─────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/calendar/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

// ─── OAuth Flow ──────────────────────────────────────────────

export function getAuthUrl(uid: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: uid,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  uid: string
): Promise<void> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokens = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  const db = getFirestore();
  await db
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc("google")
    .set(
      {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        connectedAt: new Date(),
      },
      { merge: true }
    );
}

// ─── Token Management ────────────────────────────────────────

async function getAccessToken(uid: string): Promise<string | null> {
  const db = getFirestore();
  const doc = await db
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc("google")
    .get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);

  // If token is still valid (with 5 min buffer), return it
  if (expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return data.accessToken;
  }

  // Refresh the token
  if (!data.refreshToken) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: data.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    console.error("[Calendar] Token refresh failed:", await response.text());
    return null;
  }

  const refreshed = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  await db
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc("google")
    .update({
      accessToken: refreshed.access_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    });

  return refreshed.access_token;
}

// ─── Check Connection Status ─────────────────────────────────

export async function isCalendarConnected(uid: string): Promise<boolean> {
  const token = await getAccessToken(uid);
  return token !== null;
}

// ─── Fetch Calendar Events ───────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  status: string;
}

export async function getCalendarEvents(
  uid: string,
  startDate: string,
  endDate: string
): Promise<string> {
  const accessToken = await getAccessToken(uid);

  if (!accessToken) {
    return JSON.stringify({
      events: [],
      error: "Google Calendar not connected. Ask the user to connect it in Settings.",
    });
  }

  const timeMin = new Date(`${startDate}T00:00:00`).toISOString();
  const timeMax = new Date(`${endDate}T23:59:59`).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("[Calendar] API error:", err);
    return JSON.stringify({
      events: [],
      error: "Failed to fetch calendar events. Token may have expired.",
    });
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      status?: string;
    }>;
  };

  const events: CalendarEvent[] = (data.items || []).map((item) => ({
    id: item.id,
    summary: item.summary || "(No title)",
    description: item.description || undefined,
    location: item.location || undefined,
    start: item.start?.dateTime || item.start?.date || "",
    end: item.end?.dateTime || item.end?.date || "",
    allDay: !item.start?.dateTime,
    status: item.status || "confirmed",
  }));

  return JSON.stringify({ events, count: events.length });
}
