import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Firestore
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockGet = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("../middleware/auth.js", () => ({
  getFirestore: () => ({
    collection: mockCollection,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();

  // Default chain: collection().doc().collection().doc().get()
  mockGet.mockResolvedValue({ exists: false, data: () => null });
  mockOrderBy.mockReturnValue({ get: mockGet });
  mockWhere.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy });
  mockCollection.mockReturnValue({
    doc: () => ({
      get: mockGet,
      collection: () => ({
        doc: () => ({ get: mockGet }),
        where: mockWhere,
        orderBy: mockOrderBy,
      }),
    }),
  });
});

describe("getHealthData", () => {
  it("returns null message when no data exists", async () => {
    mockGet.mockResolvedValue({ exists: false });

    const { getHealthData } = await import("../services/health-query.js");
    const result = JSON.parse(await getHealthData("user1", "2025-01-15"));

    expect(result.data).toBeNull();
    expect(result.note).toContain("No health data");
  });

  it("returns metrics when data exists", async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        metrics: [{ steps: 8500, heartRate: 72 }],
        syncedAt: "2025-01-15T10:00:00Z",
      }),
    });

    const { getHealthData } = await import("../services/health-query.js");
    const result = JSON.parse(await getHealthData("user1", "2025-01-15"));

    expect(result.date).toBe("2025-01-15");
    expect(result.metrics).toHaveLength(1);
    expect(result.metrics[0].steps).toBe(8500);
  });
});

describe("getHealthRange", () => {
  it("returns empty when no data in range", async () => {
    mockGet.mockResolvedValue({ empty: true, docs: [] });

    const { getHealthRange } = await import("../services/health-query.js");
    const result = JSON.parse(await getHealthRange("user1", "2025-01-01", "2025-01-07"));

    expect(result.data).toEqual([]);
    expect(result.note).toContain("No health data");
  });
});

describe("getHealthTrend", () => {
  it("calculates stats from health data", async () => {
    const mockDocs = [
      { data: () => ({ date: "2025-01-13", metrics: [{ steps: 7000 }] }) },
      { data: () => ({ date: "2025-01-14", metrics: [{ steps: 9000 }] }) },
      { data: () => ({ date: "2025-01-15", metrics: [{ steps: 8000 }] }) },
    ];
    mockGet.mockResolvedValue({ empty: false, docs: mockDocs });

    const { getHealthTrend } = await import("../services/health-query.js");
    const result = JSON.parse(await getHealthTrend("user1", "steps", 7));

    expect(result.metric).toBe("steps");
    expect(result.stats).not.toBeNull();
    expect(result.stats.avg).toBe(8000);
    expect(result.stats.min).toBe(7000);
    expect(result.stats.max).toBe(9000);
    expect(result.stats.latest).toBe(8000);
    expect(result.stats.daysWithData).toBe(3);
  });
});
