import type { FastifyRequest } from "fastify";

// ─── User & Auth ───────────────────────────────────────────────

export interface AuroraUser {
  uid: string;
  email: string;
  displayName?: string;
  expoPushToken?: string;
  createdAt: Date;
}

export interface AuthenticatedRequest extends FastifyRequest {
  uid: string;
}

// ─── Conversation ──────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolsUsed?: ToolUseRecord[];
  conversationId: string;
}

export interface ToolUseRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  timestamp: Date;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

// ─── Memory ────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  content: string;
  type: "episodic" | "semantic" | "procedural" | "working";
  importance: number; // 1-10
  timestamp: Date;
  source:
    | "conversation"
    | "health"
    | "calendar"
    | "financial"
    | "user_stated";
  topics: string[];
  emotionalValence?: number; // -1 to 1
  metadata: Record<string, unknown>;
}

// ─── Health ────────────────────────────────────────────────────

export interface HealthMetrics {
  heartRate?: number;
  hrv?: number;
  restingHeartRate?: number;
  sleepHours?: number;
  sleepQuality?: string;
  steps?: number;
  activeEnergy?: number;
  exerciseMinutes?: number;
  bloodOxygen?: number;
  weight?: number;
  respiratoryRate?: number;
  mindfulMinutes?: number;
  timestamp: Date;
}

export interface HealthSyncPayload {
  metrics: HealthMetrics[];
  date: string; // YYYY-MM-DD
}

// ─── Agents ────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  description: string;
  schedule: string; // cron expression
  tools: string[];
  systemPrompt: string;
  enabled: boolean;
  lastRun?: Date;
  lastResult?: string;
}

export interface AgentLog {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: Date;
  actions: AgentAction[];
  summary: string;
  success: boolean;
}

export interface AgentAction {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  timestamp: Date;
}

// ─── Goals ─────────────────────────────────────────────────────

export interface LifeGoal {
  id: string;
  domain:
    | "health"
    | "family"
    | "financial"
    | "career"
    | "business"
    | "personal_growth"
    | "legacy";
  title: string;
  description: string;
  targetDate?: Date;
  successMetrics: string[];
  currentProgress: number; // 0-100
  milestones: Milestone[];
  relatedMemories: string[];
  lastReviewed: Date;
  priority: 1 | 2 | 3;
}

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  targetDate?: Date;
  completedDate?: Date;
}

// ─── Push Notifications ────────────────────────────────────────

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// ─── Claude Tool Definitions ───────────────────────────────────

export interface AuroraToolResult {
  toolName: string;
  result: string;
}

// ─── User Profile (built from memory) ──────────────────────────

export interface UserProfile {
  name: string;
  location?: string;
  family?: string[];
  work?: string;
  healthConditions?: string[];
  goals?: string[];
  preferences?: Record<string, string>;
  communicationStyle?: string;
  currentProjects?: string[];
  financialSummary?: string;
  personalityTraits?: string[];
  knownStressors?: string[];
  motivators?: string[];
}
