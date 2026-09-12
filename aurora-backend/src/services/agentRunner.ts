import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ContentBlock } from "@anthropic-ai/sdk/resources/messages.js";
import cron from "node-cron";
import { v4 as uuid } from "uuid";
import { getFirestore } from "../middleware/auth.js";
import { callClaude } from "./claude.js";
import { searchMemories, storeMemory } from "./memory.js";
import { sendPushNotification } from "./push.js";
import { getDailyHealthContext } from "./healthAnalysis.js";
import type { Agent, AgentLog, AgentAction } from "../types/index.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const MAX_ITERATIONS = 10;

// ─── Agent Definitions ────────────────────────────────────────

const AGENTS: Agent[] = [
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    description: "Delivers a daily morning briefing with weather, calendar, priorities, and health insights.",
    schedule: "0 6 * * *",
    tools: [
      "get_calendar_events",
      "get_weather",
      "search_memory",
      "get_current_time",
      "get_home_state",
    ],
    systemPrompt: `You are Aurora's Morning Briefing agent. Compile a concise daily briefing for the user.
Include: today's weather, calendar events, top priorities from memory, any health insights, and one motivational note.
Keep it under 200 words. Be direct and personal.`,
    enabled: true,
  },
  {
    id: "communication-monitor",
    name: "Communication Monitor",
    description: "Monitors for important emails and messages that need attention.",
    schedule: "*/30 * * * *",
    tools: ["search_emails", "search_memory", "send_push_notification"],
    systemPrompt: `You are Aurora's Communication Monitor agent. Check for important emails and messages.
Flag anything urgent or from key contacts. Summarize what needs attention.
Only send a notification if something truly requires the user's attention.`,
    enabled: true,
  },
  {
    id: "financial-watch",
    name: "Financial Watch",
    description: "Monitors financial markets, accounts, and spending patterns.",
    schedule: "0 9,17 * * 1-5",
    tools: [
      "search_web",
      "search_memory",
      "add_memory",
      "send_push_notification",
    ],
    systemPrompt: `You are Aurora's Financial Watch agent. Monitor financial markets and the user's financial interests.
Check for significant market movements, portfolio-relevant news, or spending patterns worth noting.
Only alert on genuinely significant events. Store notable findings in memory.`,
    enabled: true,
  },
  {
    id: "pen-factory-ops",
    name: "Pen Factory Operations",
    description: "Monitors pen factory operations, inventory, and production metrics.",
    schedule: "0 8,12,16 * * 1-5",
    tools: [
      "search_memory",
      "add_memory",
      "search_web",
      "send_push_notification",
    ],
    systemPrompt: `You are Aurora's Pen Factory Operations agent. Monitor the user's pen factory business.
Check production metrics, inventory levels, supply chain status, and order fulfillment.
Report any issues that need immediate attention. Track trends over time.`,
    enabled: false,
  },
  {
    id: "sports-coaching",
    name: "Sports Coaching",
    description: "Tracks workout performance and provides training recommendations.",
    schedule: "0 18 * * *",
    tools: [
      "search_memory",
      "add_memory",
      "send_push_notification",
      "get_current_time",
    ],
    systemPrompt: `You are Aurora's Sports Coaching agent. Review today's workout and health data.
Provide training insights, recovery recommendations, and suggestions for tomorrow.
Be specific with data-driven advice. Consider the user's goals and recent training load.`,
    enabled: true,
  },
  {
    id: "health-insight",
    name: "Health Insight",
    description: "Analyzes health trends and provides proactive wellness recommendations.",
    schedule: "0 20 * * *",
    tools: [
      "search_memory",
      "add_memory",
      "send_push_notification",
    ],
    systemPrompt: `You are Aurora's Health Insight agent. Analyze the user's recent health patterns.
Look for trends in sleep, HRV, activity, and recovery. Provide actionable wellness recommendations.
Be proactive about potential issues. Only notify for genuinely useful insights.`,
    enabled: true,
  },
  {
    id: "contractor-ops",
    name: "Contractor Operations",
    description: "Monitors construction/contractor project status, deadlines, and logistics.",
    schedule: "0 7,12 * * 1-5",
    tools: [
      "search_memory",
      "add_memory",
      "search_web",
      "get_calendar_events",
      "send_push_notification",
    ],
    systemPrompt: `You are Aurora's Contractor Operations agent. Monitor ongoing construction and contractor projects.
Track project timelines, budget status, upcoming inspections, and subcontractor schedules.
Alert on deadlines approaching, budget concerns, or scheduling conflicts.`,
    enabled: false,
  },
  {
    id: "deep-research",
    name: "Deep Research",
    description: "Performs in-depth research on topics the user is investigating.",
    schedule: "0 3 * * *",
    tools: [
      "search_web",
      "fetch_url",
      "search_memory",
      "add_memory",
    ],
    systemPrompt: `You are Aurora's Deep Research agent. Conduct thorough research on topics the user has expressed interest in.
Search memory for recent research queries or topics of interest, then perform web research.
Store key findings in memory. Provide a comprehensive but concise research summary.`,
    enabled: true,
  },
];

// ─── Tool Definitions for Agent Loop ──────────────────────────

const AGENT_TOOLS: Tool[] = [
  {
    name: "get_calendar_events",
    description: "Retrieve calendar events for a given date range.",
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
    name: "search_memory",
    description: "Search Aurora's memory for information about the user.",
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
    description: "Store a new memory about the user or an event.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "The memory content" },
        type: {
          type: "string",
          enum: ["episodic", "semantic", "procedural", "working"],
          description: "Memory type",
        },
        importance: { type: "number", description: "Importance 1-10" },
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
    name: "send_push_notification",
    description: "Send a push notification to the user's phone.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Notification title" },
        body: { type: "string", description: "Notification body" },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "search_emails",
    description: "Search emails by query, sender, or date range.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        from: { type: "string", description: "Filter by sender" },
        days: { type: "number", description: "Search last N days" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_web",
    description: "Search the web for current information.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_url",
    description: "Fetch the contents of a URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to fetch" },
      },
      required: ["url"],
    },
  },
  {
    name: "get_current_time",
    description: "Get the current date and time.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "set_reminder",
    description: "Set a reminder for the user at a specific time.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Reminder text" },
        datetime: { type: "string", description: "When to remind (ISO 8601)" },
      },
      required: ["message", "datetime"],
    },
  },
  {
    name: "get_home_state",
    description: "Get the current state of smart home devices.",
    input_schema: {
      type: "object" as const,
      properties: {
        device_type: {
          type: "string",
          description: "Filter by device type (lights, locks, thermostat, sensors)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_sensor_history",
    description: "Get historical data from a smart home sensor.",
    input_schema: {
      type: "object" as const,
      properties: {
        sensor_id: { type: "string", description: "Sensor identifier" },
        hours: { type: "number", description: "Hours of history to retrieve" },
      },
      required: ["sensor_id"],
    },
  },
];

// ─── Tool Execution ───────────────────────────────────────────

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
      return JSON.stringify(results.map((m) => ({
        content: m.content,
        type: m.type,
        importance: m.importance,
        timestamp: m.timestamp,
        topics: m.topics,
      })));
    }

    case "add_memory": {
      const id = await storeMemory(uid, {
        content: input.content as string,
        type: (input.type as "episodic" | "semantic" | "procedural" | "working") || "episodic",
        importance: (input.importance as number) || 5,
        timestamp: new Date(),
        source: "conversation",
        topics: (input.topics as string[]) || [],
        metadata: { addedByAgent: true },
      });
      return JSON.stringify({ status: "stored", id });
    }

    case "send_push_notification": {
      const success = await sendPushNotification(uid, {
        title: input.title as string,
        body: input.body as string,
        data: { source: "agent" },
      });
      return JSON.stringify({ status: success ? "sent" : "failed" });
    }

    case "set_reminder": {
      const db = getFirestore();
      await db
        .collection("users")
        .doc(uid)
        .collection("reminders")
        .add({
          message: input.message,
          datetime: input.datetime,
          created: new Date().toISOString(),
          sent: false,
        });
      return JSON.stringify({ status: "set", datetime: input.datetime });
    }

    case "get_current_time": {
      const now = new Date();
      return JSON.stringify({
        iso: now.toISOString(),
        date: now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        time: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }

    case "get_calendar_events":
      return JSON.stringify({
        events: [],
        note: "Calendar integration pending. Connect Google Calendar API to populate real events.",
      });

    case "get_weather":
      return JSON.stringify({
        location: input.location,
        note: "Weather API integration pending. Connect OpenWeatherMap or WeatherAPI to get real data.",
      });

    case "search_emails":
      return JSON.stringify({
        emails: [],
        note: "Email integration pending. Connect Gmail API to search real emails.",
      });

    case "search_web":
      return JSON.stringify({
        results: [],
        note: "Web search integration pending. Connect Serper or Brave Search API for real results.",
      });

    case "fetch_url":
      return JSON.stringify({
        content: "",
        note: "URL fetch integration pending. Connect a web scraping service for real content.",
      });

    case "get_home_state":
      return JSON.stringify({
        devices: [],
        note: "Smart home integration pending. Connect Home Assistant or SmartThings API.",
      });

    case "get_sensor_history":
      return JSON.stringify({
        history: [],
        note: "Sensor history integration pending. Connect Home Assistant API.",
      });

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── Agentic Loop ─────────────────────────────────────────────

async function runAgentLoop(
  agent: Agent,
  uid: string
): Promise<AgentLog> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const logId = uuid();

  // Get available tools for this agent
  const agentToolDefs = AGENT_TOOLS.filter((t) =>
    agent.tools.includes(t.name)
  );

  // Build system prompt with health context
  let healthContext = "";
  try {
    healthContext = await getDailyHealthContext(uid);
  } catch {
    healthContext = "Health data unavailable.";
  }

  const systemPrompt = `${agent.systemPrompt}

User's current health context: ${healthContext}

Current time: ${new Date().toISOString()}

Execute your task using the available tools. Be thorough but efficient.`;

  let messages: MessageParam[] = [
    {
      role: "user",
      content: "Execute your scheduled task now. Use your tools to gather information and take action as needed.",
    },
  ];

  let iterations = 0;
  let summary = "";

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
        tools: agentToolDefs,
      });

      // Extract text from the response
      const textBlocks = response.content.filter(
        (block): block is Extract<ContentBlock, { type: "text" }> =>
          block.type === "text"
      );
      const responseText = textBlocks.map((b) => b.text).join("\n");

      if (responseText) {
        summary = responseText;
      }

      // Check if we need to process tool calls
      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (block): block is Extract<ContentBlock, { type: "tool_use" }> =>
            block.type === "tool_use"
        );

        const toolResults = await Promise.all(
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
        );

        // Feed results back to continue the loop
        messages = [
          ...messages,
          { role: "assistant" as const, content: response.content },
          { role: "user" as const, content: toolResults },
        ];
      } else {
        // stop_reason is "end_turn" — agent is done
        break;
      }
    }
  } catch (err) {
    console.error(`[AgentRunner] Error running agent ${agent.id}:`, err);
    summary = `Agent execution failed: ${err instanceof Error ? err.message : String(err)}`;

    const log: AgentLog = {
      id: logId,
      agentId: agent.id,
      agentName: agent.name,
      timestamp: new Date(),
      actions,
      summary,
      success: false,
    };

    await saveAgentLog(uid, log, Date.now() - startTime);
    return log;
  }

  const log: AgentLog = {
    id: logId,
    agentId: agent.id,
    agentName: agent.name,
    timestamp: new Date(),
    actions,
    summary: summary || "Agent completed with no output.",
    success: true,
  };

  await saveAgentLog(uid, log, Date.now() - startTime);
  return log;
}

// ─── Save Agent Log ───────────────────────────────────────────

async function saveAgentLog(
  uid: string,
  log: AgentLog,
  durationMs: number
): Promise<void> {
  const db = getFirestore();

  await db
    .collection("users")
    .doc(uid)
    .collection("agentLogs")
    .doc(log.id)
    .set({
      ...log,
      durationMs,
      timestamp: new Date(),
    });

  // Update agent state
  await db
    .collection("users")
    .doc(uid)
    .collection("agentState")
    .doc(log.agentId)
    .set(
      {
        lastRun: new Date(),
        lastResult: log.summary.slice(0, 500),
        lastSuccess: log.success,
        lastDurationMs: durationMs,
      },
      { merge: true }
    );
}

// ─── Public API ───────────────────────────────────────────────

export function getAgentDefinitions(): Agent[] {
  return AGENTS.map((a) => ({ ...a }));
}

export async function triggerAgent(
  agentId: string,
  uid: string
): Promise<AgentLog> {
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  console.log(`[AgentRunner] Manually triggering agent: ${agent.name}`);
  return runAgentLoop(agent, uid);
}

// ─── Agent Scheduler ──────────────────────────────────────────

export function startAgentScheduler(defaultUid: string): void {
  for (const agent of AGENTS) {
    cron.schedule(agent.schedule, async () => {
      // Check if agent is enabled (check Firestore override first)
      const db = getFirestore();
      let enabled = agent.enabled;

      try {
        const stateDoc = await db
          .collection("users")
          .doc(defaultUid)
          .collection("agentState")
          .doc(agent.id)
          .get();

        if (stateDoc.exists) {
          const state = stateDoc.data();
          if (state?.enabled !== undefined) {
            enabled = state.enabled as boolean;
          }
        }
      } catch {
        // Use default enabled state
      }

      if (!enabled) {
        console.log(
          `[AgentRunner] Skipping disabled agent: ${agent.name}`
        );
        return;
      }

      console.log(`[AgentRunner] Running scheduled agent: ${agent.name}`);

      try {
        const log = await runAgentLoop(agent, defaultUid);
        console.log(
          `[AgentRunner] ${agent.name} completed: ${log.success ? "success" : "failed"} (${log.actions.length} actions)`
        );
      } catch (err) {
        console.error(
          `[AgentRunner] ${agent.name} scheduler error:`,
          err
        );
      }
    });

    console.log(
      `[AgentRunner] Scheduled "${agent.name}" with cron: ${agent.schedule} (${agent.enabled ? "enabled" : "disabled"})`
    );
  }
}
