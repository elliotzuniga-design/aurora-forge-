import { getFirestore } from "../middleware/auth.js";

// ─── Gmail API Integration ───────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

// ─── Token Access (shared with calendar — same Google OAuth) ─

async function getGmailAccessToken(uid: string): Promise<string | null> {
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

  if (expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return data.accessToken;
  }

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

  if (!response.ok) return null;

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

// ─── Email Types ─────────────────────────────────────────────

export interface EmailSummary {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  labels: string[];
}

// ─── Search Emails ───────────────────────────────────────────

export async function searchEmails(
  uid: string,
  query: string,
  maxResults: number = 15
): Promise<string> {
  const accessToken = await getGmailAccessToken(uid);

  if (!accessToken) {
    return JSON.stringify({
      emails: [],
      error: "Gmail not connected. The user needs to connect Google in Settings (this also enables Calendar).",
    });
  }

  // Search messages via Gmail API
  const searchParams = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });

  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${searchParams.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listResponse.ok) {
    console.error("[Email] Search failed:", await listResponse.text());
    return JSON.stringify({ emails: [], error: "Gmail search failed" });
  }

  const listData = (await listResponse.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
    resultSizeEstimate?: number;
  };

  if (!listData.messages || listData.messages.length === 0) {
    return JSON.stringify({ emails: [], count: 0 });
  }

  // Fetch each message's metadata (batch in parallel, cap at maxResults)
  const messageIds = listData.messages.slice(0, maxResults);

  const emails: EmailSummary[] = await Promise.all(
    messageIds.map(async (msg) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!msgResponse.ok) {
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: "",
          to: "",
          subject: "(Failed to load)",
          snippet: "",
          date: "",
          isUnread: false,
          labels: [],
        };
      }

      const msgData = (await msgResponse.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        labelIds?: string[];
        payload?: {
          headers?: Array<{ name: string; value: string }>;
        };
      };

      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string): string =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      return {
        id: msgData.id,
        threadId: msgData.threadId,
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject") || "(No subject)",
        snippet: msgData.snippet || "",
        date: getHeader("Date"),
        isUnread: (msgData.labelIds || []).includes("UNREAD"),
        labels: msgData.labelIds || [],
      };
    })
  );

  return JSON.stringify({
    emails,
    count: emails.length,
    totalEstimate: listData.resultSizeEstimate,
  });
}
