import { describe, it, expect, vi, beforeEach } from "vitest";

const originalEnv = process.env;

// Mock Firestore
const mockGet = vi.fn();
const mockAdd = vi.fn();

vi.mock("../middleware/auth.js", () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: mockGet,
        collection: () => ({
          where: () => ({ limit: () => ({ get: mockGet }) }),
          add: mockAdd,
        }),
      }),
    }),
  }),
}));

vi.mock("../services/push.js", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(true),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = { ...originalEnv };
  mockGet.mockResolvedValue({ empty: true, docs: [] });
  mockAdd.mockResolvedValue({ id: "msg-1" });
});

describe("sendMessage", () => {
  it("sends push notification when method is push", async () => {
    const { sendMessage } = await import("../services/messaging.js");
    const result = JSON.parse(
      await sendMessage("user1", "Sarah", "Hello!", "push")
    );

    expect(result.status).toBe("sent");
    expect(result.method).toBe("push");
  });

  it("returns not_configured when Twilio is not set up for SMS", async () => {
    process.env.TWILIO_ACCOUNT_SID = "";

    const { sendMessage } = await import("../services/messaging.js");
    const result = JSON.parse(
      await sendMessage("user1", "Sarah", "Hello!", "sms")
    );

    expect(result.status).toBe("not_configured");
    expect(result.error).toContain("TWILIO");
  });

  it("resolves phone numbers from raw input", async () => {
    process.env.TWILIO_ACCOUNT_SID = "test-sid";
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.TWILIO_PHONE_NUMBER = "+15551234567";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sid: "SM123" }),
    }));

    const { sendMessage } = await import("../services/messaging.js");
    const result = JSON.parse(
      await sendMessage("user1", "+15559876543", "Test SMS", "sms")
    );

    expect(result.status).toBe("sent");
    expect(result.method).toBe("sms");
    expect(result.phoneNumber).toBe("+15559876543");
  });

  it("fails when contact name cannot be resolved", async () => {
    process.env.TWILIO_ACCOUNT_SID = "test-sid";
    process.env.TWILIO_AUTH_TOKEN = "test-token";
    process.env.TWILIO_PHONE_NUMBER = "+15551234567";

    // Both lookups return empty
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    const { sendMessage } = await import("../services/messaging.js");
    const result = JSON.parse(
      await sendMessage("user1", "UnknownPerson", "Hey", "sms")
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Could not resolve");
  });
});
