import { describe, it, expect, vi, beforeEach } from "vitest";

const originalEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

describe("getWeather", () => {
  it("returns error when API key is not set", async () => {
    process.env.OPENWEATHER_API_KEY = "";
    const { getWeather } = await import("../services/weather.js");
    const result = JSON.parse(await getWeather("Austin"));
    expect(result.error).toContain("not configured");
  });

  it("returns weather data on success", async () => {
    process.env.OPENWEATHER_API_KEY = "test-key";

    const mockCurrentResponse = {
      name: "Austin",
      sys: { country: "US" },
      main: { temp: 85, feels_like: 90, humidity: 60 },
      wind: { speed: 10 },
      weather: [{ main: "Clear", description: "clear sky" }],
    };

    const mockForecastResponse = {
      list: [
        {
          dt_txt: "2025-01-01 12:00:00",
          main: { temp: 82 },
          weather: [{ main: "Clouds", description: "few clouds" }],
          pop: 0.1,
        },
      ],
    };

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCurrentResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockForecastResponse),
      });

    vi.stubGlobal("fetch", fetchSpy);

    const { getWeather } = await import("../services/weather.js");
    const result = JSON.parse(await getWeather("Austin"));

    expect(result.current.location).toBe("Austin, US");
    expect(result.current.temperature).toBe(85);
    expect(result.current.conditions).toBe("Clear");
    expect(result.forecast).toHaveLength(1);
    expect(result.forecast[0].precipitationChance).toBe(10);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("handles API errors gracefully", async () => {
    process.env.OPENWEATHER_API_KEY = "test-key";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: "city not found" }),
    }));

    const { getWeather } = await import("../services/weather.js");
    const result = JSON.parse(await getWeather("NonexistentCity"));
    expect(result.error).toBe("city not found");
  });
});
