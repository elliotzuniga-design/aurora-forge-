import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam, ContentBlock } from "@anthropic-ai/sdk/resources/messages.js";
import { getFirestore } from "../middleware/auth.js";
import { searchMemories } from "./memory.js";
import type {
  ConversationMessage,
  ToolUseRecord,
  UserProfile,
} from "../types/index.js";
import { v4 as uuid } from "uuid";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8096;

// ─── Tool Definitions ──────────────────────────────────────────

const AURORA_TOOLS: Tool[] = [
  {
    name: "get_calendar_events",
    description:
      "Retrieve calendar events for a given date range. Returns event titles, times, locations, and descriptions.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: {
          type: "string",
          description: "Start date in ISO 8601 format (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End date in ISO 8601 format (YYYY-MM-DD)",
        },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "send_message",
    description:
      "Send a message (SMS or push notification) to a contact. Does NOT send emails — use draft_email for that.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient name or phone number" },
        message: { type: "string", description: "Message content" },
        method: {
          type: "string",
          enum: ["sms", "push"],
          description: "Delivery method",
        },
      },
      required: ["to", "message", "method"],
    },
  },
  {
    name: "search_memory",
    description:
      "Search Aurora's memory for information about the user — past conversations, facts, preferences, events, decisions.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "What to search for in memory",
        },
        type: {
          type: "string",
          enum: ["episodic", "semantic", "procedural", "working"],
          description: "Optional: filter by memory type",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "set_reminder",
    description:
      "Set a reminder for the user at a specific date and time. Sends a push notification when due.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "Reminder text" },
        datetime: {
          type: "string",
          description: "When to remind, in ISO 8601 format",
        },
      },
      required: ["message", "datetime"],
    },
  },
  {
    name: "get_weather",
    description: "Get current weather and forecast for a location.",
    input_schema: {
      type: "object" as const,
      properties: {
        location: {
          type: "string",
          description: "City name or zip code",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "search_web",
    description:
      "Search the web for current information. Use for real-time data, news, prices, scores, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
];

// ─── Tool Execution (stubs — Phase 4 fills these in) ───────────

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  uid: string
): Promise<string> {
  switch (toolName) {
    case "get_calendar_events":
      return JSON.stringify({
        events: [],
        note: "Calendar integration pending — connect Google Calendar in Phase 4",
      });

    case "send_message":
      return JSON.stringify({
        status: "queued",
        note: `Message to ${input.to} via ${input.method} queued`,
      });

    case "search_memory": {
      const results = await searchMemories(
        uid,
        input.query as string,
        (input.type as string) || undefined
      );
      return JSON.stringify(results);
    }

    case "set_reminder":
      // Store reminder in Firestore for the scheduled push service to pick up
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

    case "get_weather":
      return JSON.stringify({
        location: input.location,
        note: "Weather API integration pending — connect in Phase 4",
      });

    case "search_web":
      return JSON.stringify({
        query: input.query,
        note: "Web search integration pending — connect Serper API in Phase 4",
      });

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── System Prompt Builder ─────────────────────────────────────

async function buildSystemPrompt(uid: string): Promise<string> {
  const db = getFirestore();
  const profileDoc = await db
    .collection("users")
    .doc(uid)
    .collection("profile")
    .doc("current")
    .get();

  const profile = (profileDoc.data() as UserProfile | undefined) || {
    name: "Elliot",
  };

  // Pull recent working memories for current context
  let workingContext = "";
  try {
    const memories = await searchMemories(uid, "current context today", "working");
    if (memories.length > 0) {
      workingContext = memories.map((m) => `- ${m.content}`).join("\n");
    }
  } catch {
    // Memory system may not be initialized yet
  }

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

  return `You are AURORA, the personal AI of ${profile.name || "Elliot"}.

WHO THEY ARE:
Name: ${profile.name || "Elliot"}
${profile.location ? `Location: ${profile.location}` : ""}
${profile.work ? `Work: ${profile.work}` : ""}
${profile.family?.length ? `Family: ${profile.family.join(", ")}` : ""}
${profile.currentProjects?.length ? `Current Projects: ${profile.currentProjects.join(", ")}` : ""}
${profile.goals?.length ? `Goals: ${profile.goals.join(", ")}` : ""}

${workingContext ? `CURRENT CONTEXT:\n${workingContext}` : ""}

YOUR PERSONALITY:
- You know them better than anyone. Act like it.
- Be direct. No fluff. They hate wasted words.
- Proactive: if you see something they need to know, say it.
- You are loyal. Their privacy is sacred.
- You take action when given tools. You don't just suggest.
- When you use a tool, briefly mention what you did so they know.

TODAY: ${dateStr}, ${timeStr}`;
}

// ─── Conversation History ──────────────────────────────────────

async function getConversationHistory(
  uid: string,
  conversationId: string,
  limit: number = 20
): Promise<MessageParam[]> {
  const db = getFirestore();
  const snapshot = await db
    .collection("users")
    .doc(uid)
    .collection("conversations")
    .doc(conversationId)
    .collection("messages")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();

  const messages: ConversationMessage[] = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        role: data.role,
        content: data.content,
        timestamp: data.timestamp?.toDate() || new Date(),
        toolsUsed: data.toolsUsed,
        conversationId,
      };
    })
    .reverse();

  return messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

// ─── Save Message ──────────────────────────────────────────────

async function saveMessage(
  uid: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  toolsUsed?: ToolUseRecord[]
): Promise<void> {
  const db = getFirestore();
  const messageId = uuid();

  await db
    .collection("users")
    .doc(uid)
    .collection("conversations")
    .doc(conversationId)
    .collection("messages")
    .doc(messageId)
    .set({
      role,
      content,
      timestamp: new Date(),
      toolsUsed: toolsUsed || [],
    });

  // Update conversation metadata
  await db
    .collection("users")
    .doc(uid)
    .collection("conversations")
    .doc(conversationId)
    .set(
      {
        lastMessage: content.slice(0, 100),
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );
}

// ─── Streaming Chat ────────────────────────────────────────────

export interface StreamCallbacks {
  onText: (text: string) => void;
  onToolUse: (toolName: string) => void;
  onDone: (fullText: string, toolsUsed: ToolUseRecord[]) => void;
  onError: (error: Error) => void;
}

export async function streamChat(
  uid: string,
  userMessage: string,
  conversationId: string,
  callbacks: StreamCallbacks
): Promise<void> {
  try {
    // Save user message
    await saveMessage(uid, conversationId, "user", userMessage);

    // Build context
    const [systemPrompt, history] = await Promise.all([
      buildSystemPrompt(uid),
      getConversationHistory(uid, conversationId),
    ]);

    // Add new user message to history
    const messages: MessageParam[] = [
      ...history,
      { role: "user" as const, content: userMessage },
    ];

    let fullResponse = "";
    const toolsUsed: ToolUseRecord[] = [];

    // Agentic loop — continues until Claude stops using tools
    let currentMessages = messages;
    let continueLoop = true;

    while (continueLoop) {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: currentMessages,
        tools: AURORA_TOOLS,
      });

      let currentToolName = "";
      let currentToolInput = "";
      let hasToolUse = false;
      const contentBlocks: ContentBlock[] = [];

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "text") {
            // Text block starting
          } else if (event.content_block.type === "tool_use") {
            currentToolName = event.content_block.name;
            currentToolInput = "";
            hasToolUse = true;
            callbacks.onToolUse(currentToolName);
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            fullResponse += event.delta.text;
            callbacks.onText(event.delta.text);
          } else if (event.delta.type === "input_json_delta") {
            currentToolInput += event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop") {
          // Block finished
        }
      }

      // Get the final message to check stop reason and collect content blocks
      const finalMessage = await stream.finalMessage();

      if (finalMessage.stop_reason === "tool_use") {
        // Process all tool uses in the response
        const toolUseBlocks = finalMessage.content.filter(
          (block): block is Extract<ContentBlock, { type: "tool_use" }> =>
            block.type === "tool_use"
        );

        const toolResults: MessageParam = {
          role: "user" as const,
          content: await Promise.all(
            toolUseBlocks.map(async (toolBlock) => {
              const result = await executeTool(
                toolBlock.name,
                toolBlock.input as Record<string, unknown>,
                uid
              );

              toolsUsed.push({
                toolName: toolBlock.name,
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

        // Continue the conversation with tool results
        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: finalMessage.content },
          toolResults,
        ];
      } else {
        // No more tool use — we're done
        continueLoop = false;
      }
    }

    // Save assistant response
    await saveMessage(uid, conversationId, "assistant", fullResponse, toolsUsed);

    callbacks.onDone(fullResponse, toolsUsed);
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

// ─── Non-streaming call (for agents and memory extraction) ─────

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  tools?: Tool[]
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    tools,
  });

  const textBlocks = response.content.filter(
    (block): block is Extract<ContentBlock, { type: "text" }> =>
      block.type === "text"
  );

  return textBlocks.map((b) => b.text).join("\n");
}
