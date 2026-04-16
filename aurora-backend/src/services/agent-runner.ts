import Anthropic from "@anthropic-ai/sdk";
import type {
  Tool,
  MessageParam,
  ContentBlock,
} from "@anthropic-ai/sdk/resources/messages.js";
import { getFirestore } from "../middleware/auth.js";
import { searchMemories, addMemory } from "./memory.js";
import { getWeather } from "./weather.js";
import { searchWeb } from "./search.js";
import { getCalendarEvents } from "./calendar.js";
import { searchEmails } from "./email.js";
import { getHealthData, getHealthRange, getHealthTrend } from "./health-query.js";
import { sendPushNotification } from "./push.js";
import type { Agent, AgentAction, AgentLog } from "../types/index.js";
import { v4 as uuid } from "uuid";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

// ─── Agent Tool Definitions ───────────────────────────────────
// Subset of tools available to agents (no set_reminder — agents push directly)

const AGENT_TOOLS: Tool[] = [
  {
    name: "search_memory",
    description:
      "Search the user's memory for information — past conversations, facts, preferences, events.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "What to search for" },
        type: {
          type: "string",
          enum: ["episodic", "semantic", "procedural", "working"],
          description: "Optional memory type filter",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "add_memory",
    description: "Store an important fact or insight for long-term recall.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "Memory content" },
        type: {
          type: "string",
          enum: ["episodic", "semantic", "procedural", "working"],
        },
        importance: { type: "number", description: "1-10" },
        topics: {
          type: "array",
          items: { type: "string" },
          description: "Topic tags",
        },
      },
      required: ["content", "type", "importance"],
    },
  },
  {
    name: "get_weather",
    description: "Get current weather and forecast for a location.",
    input_schema: {
      type: "object" as const,
      properties: {
        location: { type: "string", description: "City name or zip code" },
      },
      required: ["location"],
    },
  },
  {
    name: "search_web",
    description: "Search the web for current information, news, prices, scores.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_calendar_events",
    description: "Retrieve calendar events for a date range.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
        end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "search_emails",
    description: "Search Gmail inbox using Gmail search syntax.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Gmail search query" },
        max_results: { type: "number", description: "Max results (default 15)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_health_data",
    description: "Get health metrics — daily data, date range, or trend a specific metric.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Single date (YYYY-MM-DD)" },
        start_date: { type: "string", description: "Range start (YYYY-MM-DD)" },
        end_date: { type: "string", description: "Range end (YYYY-MM-DD)" },
        metric: { type: "string", description: "Specific metric to trend" },
        trend_days: { type: "number", description: "Days to trend (default 7)" },
      },
      required: [],
    },
  },
  {
    name: "get_goals",
    description: "Get the user's life goals and progress.",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "Optional domain filter" },
      },
      required: [],
    },
  },
];

// ─── Agent Tool Execution ─────────────────────────────────────

async function executeAgentTool(
  toolName: string,
  input: Record<string, unknown>,
  uid: string
): Promise<string> {
  switch (toolName) {
    case "search_memory": {
      const results = await searchMemories(
        uid,
        input.query as string,
        (input.type as string) || undefined
      );
      return JSON.stringify(results);
    }

    case "add_memory": {
      const memId = await addMemory(
        uid,
        input.content as string,
        input.type as "episodic" | "semantic" | "procedural" | "working",
        (input.importance as number) || 5,
        (input.topics as string[]) || [],
        "conversation"
      );
      return JSON.stringify({ status: "stored", memoryId: memId });
    }

    case "get_weather":
      return getWeather(input.location as string);

    case "search_web":
      return searchWeb(input.query as string);

    case "get_calendar_events":
      return getCalendarEvents(
        uid,
        input.start_date as string,
        input.end_date as string
      );

    case "search_emails":
      return searchEmails(
        uid,
        input.query as string,
        (input.max_results as number) || 15
      );

    case "get_health_data": {
      if (input.metric) {
        return getHealthTrend(uid, input.metric as string, (input.trend_days as number) || 7);
      }
      if (input.start_date && input.end_date) {
        return getHealthRange(uid, input.start_date as string, input.end_date as string);
      }
      const date = (input.date as string) || new Date().toISOString().split("T")[0];
      return getHealthData(uid, date);
    }

    case "get_goals": {
      const db = getFirestore();
      let goalsQuery = db
        .collection("users")
        .doc(uid)
        .collection("goals")
        .orderBy("priority", "asc");

      if (input.domain) {
        goalsQuery = db
          .collection("users")
          .doc(uid)
          .collection("goals")
          .where("domain", "==", input.domain)
          .orderBy("priority", "asc");
      }

      const goalsSnap = await goalsQuery.get();
      const goals = goalsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return JSON.stringify({ goals, count: goals.length });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── Run an Agent ─────────────────────────────────────────────

export async function runAgent(
  uid: string,
  agent: Agent
): Promise<AgentLog> {
  const db = getFirestore();
  const actions: AgentAction[] = [];
  const startTime = new Date();

  // Build the agent's system prompt with context
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const systemPrompt = `You are AURORA's ${agent.name} agent.

YOUR TASK: ${agent.systemPrompt}

CONTEXT:
- Today: ${dateStr}, ${timeStr}
- This is an automated agent run, not a conversation.
- Use your tools to gather information, then produce a concise briefing.
- If you find something important, store it in memory using add_memory.
- Be direct and actionable. No fluff.

OUTPUT: Produce a clear, structured briefing that will be sent as a push notification summary to the user.`;

  const messages: MessageParam[] = [
    {
      role: "user",
      content: `Run the ${agent.name} agent now. Gather relevant information and produce a briefing.`,
    },
  ];

  // Filter tools to only those the agent is allowed to use
  const allowedToolNames = new Set(agent.tools);
  const agentTools = AGENT_TOOLS.filter((t) => allowedToolNames.has(t.name));

  let fullResponse = "";
  let continueLoop = true;
  let currentMessages = messages;
  let iterations = 0;
  const maxIterations = 8;

  try {
    while (continueLoop && iterations < maxIterations) {
      iterations++;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: currentMessages,
        tools: agentTools.length > 0 ? agentTools : undefined,
      });

      // Collect text from this response
      for (const block of response.content) {
        if (block.type === "text") {
          fullResponse += block.text;
        }
      }

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (block): block is Extract<ContentBlock, { type: "tool_use" }> =>
            block.type === "tool_use"
        );

        const toolResults: MessageParam = {
          role: "user",
          content: await Promise.all(
            toolUseBlocks.map(async (toolBlock) => {
              const result = await executeAgentTool(
                toolBlock.name,
                toolBlock.input as Record<string, unknown>,
                uid
              );

              actions.push({
                tool: toolBlock.name,
                input: toolBlock.input as Record<string, unknown>,
                output: result,
                timestamp: new Date(),
              });

              return {
                type: "tool_result" as const,
                tool_use_id: toolBlock.id,
                content: result,
              };
            })
          ),
        };

        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: response.content },
          toolResults,
        ];
      } else {
        continueLoop = false;
      }
    }

    // Send push notification with the briefing
    const summary =
      fullResponse.length > 500
        ? fullResponse.slice(0, 497) + "..."
        : fullResponse;

    await sendPushNotification(uid, {
      title: agent.name,
      body: summary,
      data: { agentId: agent.id, type: "agent_briefing" },
    });

    // Log the execution
    const log: AgentLog = {
      id: uuid(),
      agentId: agent.id,
      agentName: agent.name,
      timestamp: startTime,
      actions,
      summary: fullResponse,
      success: true,
    };

    // Save to Firestore
    await db
      .collection("users")
      .doc(uid)
      .collection("agentLogs")
      .doc(log.id)
      .set({
        ...log,
        timestamp: startTime,
        duration: Date.now() - startTime.getTime(),
      });

    // Update agent state
    await db
      .collection("users")
      .doc(uid)
      .collection("agentState")
      .doc(agent.id)
      .set(
        {
          lastRun: new Date(),
          lastResult: summary,
          enabled: true,
        },
        { merge: true }
      );

    return log;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Agent ${agent.name} failed:`, errorMessage);

    const log: AgentLog = {
      id: uuid(),
      agentId: agent.id,
      agentName: agent.name,
      timestamp: startTime,
      actions,
      summary: `Error: ${errorMessage}`,
      success: false,
    };

    await db
      .collection("users")
      .doc(uid)
      .collection("agentLogs")
      .doc(log.id)
      .set({
        ...log,
        timestamp: startTime,
        duration: Date.now() - startTime.getTime(),
      });

    await db
      .collection("users")
      .doc(uid)
      .collection("agentState")
      .doc(agent.id)
      .set(
        {
          lastRun: new Date(),
          lastResult: `Failed: ${errorMessage}`,
        },
        { merge: true }
      );

    return log;
  }
}
