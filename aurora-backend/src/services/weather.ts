const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "";
const BASE_URL = "https://api.openweathermap.org/data/2.5";

interface WeatherCondition {
  main: string;
  description: string;
}

interface CurrentWeather {
  location: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  conditions: string;
  description: string;
}

interface ForecastEntry {
  time: string;
  temperature: number;
  conditions: string;
  description: string;
  precipitationChance: number;
}

interface WeatherResult {
  current: CurrentWeather;
  forecast: ForecastEntry[];
}

export async function getWeather(location: string): Promise<string> {
  if (!OPENWEATHER_API_KEY) {
    return JSON.stringify({
      error: "Weather API not configured — set OPENWEATHER_API_KEY in .env",
    });
  }

  try {
    // Get current weather
    const currentRes = await fetch(
      `${BASE_URL}/weather?q=${encodeURIComponent(location)}&units=imperial&appid=${OPENWEATHER_API_KEY}`
    );

    if (!currentRes.ok) {
      const err = await currentRes.json();
      return JSON.stringify({ error: err.message || "Weather lookup failed" });
    }

    const current = await currentRes.json();

    // Get 5-day / 3-hour forecast
    const forecastRes = await fetch(
      `${BASE_URL}/forecast?q=${encodeURIComponent(location)}&units=imperial&appid=${OPENWEATHER_API_KEY}&cnt=8`
    );

    const forecastData = forecastRes.ok ? await forecastRes.json() : null;

    const result: WeatherResult = {
      current: {
        location: `${current.name}, ${current.sys?.country || ""}`,
        temperature: Math.round(current.main.temp),
        feelsLike: Math.round(current.main.feels_like),
        humidity: current.main.humidity,
        windSpeed: Math.round(current.wind.speed),
        conditions: current.weather[0]?.main || "Unknown",
        description: current.weather[0]?.description || "",
      },
      forecast: forecastData
        ? forecastData.list.map(
            (entry: {
              dt_txt: string;
              main: { temp: number };
              weather: WeatherCondition[];
              pop: number;
            }) => ({
              time: entry.dt_txt,
              temperature: Math.round(entry.main.temp),
              conditions: entry.weather[0]?.main || "Unknown",
              description: entry.weather[0]?.description || "",
              precipitationChance: Math.round((entry.pop || 0) * 100),
            })
          )
        : [],
    };

    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({
      error: `Weather request failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
