import { describe, it, expect, vi, beforeEach } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe("searchWeb", () => {
  it("returns error when API key is not set", async () => {
    process.env.SERPER_API_KEY = "";
    const { searchWeb } = await import("../services/search.js");
    const result = JSON.parse(await searchWeb("test query"));
    expect(result.error).toContain("not configured");
  });

  it("returns search results on success", async () => {
    process.env.SERPER_API_KEY = "test-key";

    const mockResponse = {
      organic: [
        { title: "Result 1", link: "https://example.com/1", snippet: "Snippet 1", position: 1 },
        { title: "Result 2", link: "https://example.com/2", snippet: "Snippet 2", position: 2 },
      ],
      answerBox: { answer: "42" },
      knowledgeGraph: { title: "Test", description: "A test result" },
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const { searchWeb } = await import("../services/search.js");
    const result = JSON.parse(await searchWeb("test query"));

    expect(result.query).toBe("test query");
    expect(result.results).toHaveLength(2);
    expect(result.results[0].title).toBe("Result 1");
    expect(result.results[0].url).toBe("https://example.com/1");
    expect(result.answerBox).toBe("42");
    expect(result.knowledgeGraph.title).toBe("Test");
  });

  it("handles API errors", async () => {
    process.env.SERPER_API_KEY = "test-key";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    }));

    const { searchWeb } = await import("../services/search.js");
    const result = JSON.parse(await searchWeb("test"));
    expect(result.error).toContain("429");
  });
});
