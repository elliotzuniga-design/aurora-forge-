const SERPER_API_KEY = process.env.SERPER_API_KEY || "";

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SearchResult {
  query: string;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  answerBox?: string;
  knowledgeGraph?: {
    title: string;
    description: string;
  };
}

export async function searchWeb(query: string): Promise<string> {
  if (!SERPER_API_KEY) {
    return JSON.stringify({
      error: "Web search not configured — set SERPER_API_KEY in .env",
    });
  }

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: 8,
      }),
    });

    if (!res.ok) {
      return JSON.stringify({
        error: `Search API returned ${res.status}: ${res.statusText}`,
      });
    }

    const data = (await res.json()) as {
      organic?: SerperResult[];
      answerBox?: { answer?: string; snippet?: string };
      knowledgeGraph?: { title?: string; description?: string };
    };

    const result: SearchResult = {
      query,
      results: (data.organic || []).map((r: SerperResult) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
      })),
    };

    if (data.answerBox?.answer) {
      result.answerBox = data.answerBox.answer;
    } else if (data.answerBox?.snippet) {
      result.answerBox = data.answerBox.snippet;
    }

    if (data.knowledgeGraph) {
      result.knowledgeGraph = {
        title: data.knowledgeGraph.title || "",
        description: data.knowledgeGraph.description || "",
      };
    }

    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({
      error: `Search request failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
