# AURORA Personal AI — Project Handoff Document

## Overview

AURORA is a personal AI system built for iPhone + Home Server. It consists of a Node.js/TypeScript backend (Fastify) and a React Native/Expo iPhone app, powered by Claude API with an agentic tool-use loop, 4-layer ChromaDB memory, 8 scheduled agents, and full Google/Twilio/HealthKit integrations.

---

## Repository

- **Repo**: `elliotzuniga-design/aurora-forge-`
- **Active branch**: `claude/determine-next-steps-3zWrV`
- **PR**: #3 (draft) — contains Phases 1-4 combined
- **Main branch**: only has the initial commit — PRs #1, #2, #3 are all draft and need to be merged

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + TypeScript + Fastify |
| AI | Claude API (`claude-sonnet-4-20250514`) via `@anthropic-ai/sdk` |
| Memory | ChromaDB (self-hosted, 4 layers: episodic, semantic, procedural, working) |
| Database | Firebase Firestore (users, conversations, health, goals, agents, reminders) |
| Auth | Firebase Auth (ID token verification) |
| iPhone App | React Native + Expo (TypeScript) |
| State | Zustand |
| Navigation | React Navigation (bottom tabs + stack) |
| Push | Expo Push Notifications |
| SMS | Twilio |
| Calendar/Email | Google OAuth2 (Calendar API + Gmail API) |
| Weather | OpenWeatherMap |
| Web Search | Serper.dev |
| Health | Apple HealthKit → backend sync |

---

## Project Structure

```
aurora-forge-/
├── aurora-backend/
│   ├── src/
│   │   ├── index.ts                    # Fastify server entry point
│   │   ├── middleware/
│   │   │   └── auth.ts                 # Firebase Auth middleware
│   │   ├── routes/
│   │   │   ├── agents.ts               # GET/PUT/POST agent management
│   │   │   ├── calendar.ts             # Google OAuth flow (/auth, /callback, /status, /disconnect)
│   │   │   ├── chat.ts                 # SSE streaming chat endpoint
│   │   │   ├── goals.ts                # Goals CRUD + milestones
│   │   │   ├── health.ts               # Health data sync + query endpoints
│   │   │   ├── memory.ts               # Memory search/list/add/update
│   │   │   └── profile.ts              # User profile + contacts CRUD
│   │   ├── services/
│   │   │   ├── claude.ts               # Claude API streaming + agentic tool loop (MAIN CHAT)
│   │   │   ├── agent-runner.ts         # Agent execution engine (non-streaming, tool loop)
│   │   │   ├── scheduler.ts            # Cron scheduler (8 agents + reminder checker)
│   │   │   ├── memory.ts               # ChromaDB 4-layer memory system
│   │   │   ├── calendar.ts             # Google Calendar OAuth + events API
│   │   │   ├── email.ts                # Gmail API wrapper
│   │   │   ├── weather.ts              # OpenWeatherMap wrapper
│   │   │   ├── search.ts               # Serper web search wrapper
│   │   │   ├── health-query.ts         # Health data query (daily/range/trend)
│   │   │   ├── messaging.ts            # Twilio SMS + contact resolution
│   │   │   └── push.ts                 # Expo push notifications
│   │   └── types/
│   │       └── index.ts                # All TypeScript interfaces
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── aurora-app/
│   ├── App.tsx                          # Root — bottom tabs + stack navigator + auth + health auto-sync
│   ├── src/
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx           # Main chat (SSE streaming + voice)
│   │   │   ├── ConversationsScreen.tsx  # Chat history browser
│   │   │   ├── GoalsScreen.tsx          # Goals with domain filters + milestones
│   │   │   ├── HealthScreen.tsx         # Health dashboard (metrics grid + 7-day trends)
│   │   │   ├── AgentsScreen.tsx         # Agent enable/disable/trigger/logs
│   │   │   ├── SettingsScreen.tsx       # Account, integrations, preferences
│   │   │   ├── ProfileScreen.tsx        # Edit name, location, work, family, goals, projects
│   │   │   ├── MemoryScreen.tsx         # Memory browser
│   │   │   └── LoginScreen.tsx          # Firebase auth flow
│   │   ├── components/
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── VoiceButton.tsx
│   │   │   ├── ThinkingIndicator.tsx
│   │   │   └── AgentStatusCard.tsx
│   │   ├── hooks/
│   │   │   ├── useConversation.ts       # SSE chat hook
│   │   │   ├── useMemory.ts
│   │   │   └── useVoice.ts             # Hold-to-record + always-listening
│   │   ├── services/
│   │   │   ├── api.ts                   # Axios instance with Firebase token interceptor
│   │   │   ├── auth.ts                  # Firebase auth wrapper
│   │   │   ├── health.ts               # HealthKit read + backend sync
│   │   │   ├── notifications.ts         # Expo push registration
│   │   │   └── voice.ts                # Speech recognition service
│   │   ├── store/
│   │   │   ├── conversationStore.ts     # Zustand chat state
│   │   │   └── userStore.ts             # Zustand auth state
│   │   ├── constants/
│   │   │   ├── api.ts                   # API_BASE_URL, API_TIMEOUT
│   │   │   └── colors.ts               # Dark aurora theme
│   │   └── types/
│   │       └── react-native-health.d.ts # Optional HealthKit type declarations
│   ├── assets/
│   │   ├── icon.png                     # App icon (1024x1024)
│   │   ├── notification-icon.png        # Notification icon (96x96)
│   │   └── splash-icon.png             # Splash screen icon (200x200)
│   ├── app.json                         # Expo config
│   ├── package.json
│   └── tsconfig.json
│
└── README.md
```

---

## Tool System

All tools are fully implemented. No stubs remain.

### Tools available in chat (`claude.ts`):

| Tool | Service | Description |
|---|---|---|
| `get_calendar_events` | Google Calendar API | Read events for a date range |
| `search_emails` | Gmail API | Search inbox (Gmail search syntax) |
| `get_weather` | OpenWeatherMap | Current weather + 24hr forecast |
| `search_web` | Serper.dev | Web search with answer boxes |
| `search_memory` | ChromaDB | Semantic memory search |
| `add_memory` | ChromaDB | Store a new memory |
| `set_reminder` | Firestore | Set a timed reminder (push notification) |
| `send_message` | Twilio / Expo Push | Send SMS or push notification |
| `get_health_data` | Firestore | Health metrics (daily/range/trend) |
| `get_goals` | Firestore | Read goals by domain |
| `update_goal` | Firestore | Update progress, add milestones |

### Tools available to agents (`agent-runner.ts`):

Same as above minus `set_reminder`, `send_message`, and `update_goal`. Agents have: `search_memory`, `add_memory`, `get_weather`, `search_web`, `get_calendar_events`, `search_emails`, `get_health_data`, `get_goals`.

---

## 8 Scheduled Agents

| Agent | Schedule | Key Tools |
|---|---|---|
| Morning Briefing | 6am daily | calendar, weather, health, goals, memory |
| Communication Monitor | Every 30min, 8am-8pm | search_emails, memory |
| Financial Watch | 8am daily | web search, memory |
| Pen Factory Operations | 7am Mondays | search_emails, calendar, memory |
| Sports Coaching | 5pm Fridays | web search, calendar, memory |
| Health Insight | 9pm daily | get_health_data, memory |
| N.E.A. Construction Ops | 8am Mon/Wed/Fri | search_emails, web search, memory |
| Deep Research | On-demand only | web search, memory |

---

## Navigation Architecture

```
App.tsx
├── LoginScreen (if !authenticated)
└── AppNavigator (if authenticated)
    ├── MainTabs (bottom tab navigator)
    │   ├── Home (chat)
    │   ├── Goals
    │   ├── Health
    │   ├── Agents
    │   └── Settings
    └── Stack screens (push on top of tabs)
        ├── Conversations (chat history)
        ├── Memory (memory browser)
        └── Profile (edit profile)
```

---

## Environment Variables

### Backend (`.env`):

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-xxxxx
FIREBASE_SERVICE_ACCOUNT_JSON=./firebase-service-account.json
CHROMA_HOST=http://localhost:8000
PORT=3001

# Weather + Search
OPENWEATHER_API_KEY=your-key
SERPER_API_KEY=your-key

# Google OAuth (Calendar + Gmail)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/calendar/callback

# Twilio SMS
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Optional
JWT_SECRET=your-secret
EXPO_PUSH_TOKEN_SECRET=your-secret
```

### App:

- `aurora-app/src/constants/api.ts` — set `API_BASE_URL` to your backend server address
- Firebase config is in `aurora-app/src/services/auth.ts`

---

## How to Run

### Backend:
```bash
cd aurora-backend
npm install
cp .env.example .env    # Fill in all API keys
npm run dev              # Starts on port 3001 with hot reload
```

Requires:
- ChromaDB running on localhost:8000 (`docker run -p 8000:8000 chromadb/chroma`)
- Firebase project with service account JSON
- Anthropic API key

### App:
```bash
cd aurora-app
npm install
npx expo start
```

Then scan QR with Expo Go on iPhone, or press `i` for iOS simulator (requires Xcode).

### Build:
```bash
cd aurora-backend && npm run build   # TypeScript → dist/
cd aurora-app && npx tsc --noEmit    # Type check only (Metro handles bundling)
```

Both compile clean as of the latest commit.

---

## API Routes

### Chat
- `POST /chat/stream` — SSE streaming chat (body: `{ message, conversationId? }`)
- `GET /chat/conversations` — list conversations
- `GET /chat/conversations/:id` — get conversation messages

### Health
- `POST /health/sync` — sync health data from iPhone (body: `{ metrics[], date }`)
- `GET /health/latest` — most recent health data
- `GET /health/range?start=YYYY-MM-DD&end=YYYY-MM-DD`

### Goals
- `GET /goals` — list goals (optional `?domain=health`)
- `GET /goals/:id`
- `POST /goals` — create goal
- `PUT /goals/:id` — update goal
- `POST /goals/:id/milestones` — add milestone
- `PUT /goals/:id/milestones/:mid` — toggle milestone
- `DELETE /goals/:id`

### Agents
- `GET /agents` — list all agents with status
- `PUT /agents/:id/toggle` — enable/disable
- `POST /agents/:id/run` — manually trigger
- `GET /agents/:id/logs` — execution logs

### Calendar/OAuth
- `GET /calendar/auth` — get Google OAuth URL
- `GET /calendar/callback` — OAuth redirect handler
- `GET /calendar/status` — check if Google is connected
- `DELETE /calendar/disconnect` — remove Google integration

### Memory
- `GET /memory/search?q=query&type=episodic`
- `GET /memory/list?type=semantic&topic=health`
- `POST /memory/add`
- `PUT /memory/:id`
- `GET /memory/profile` — AI-generated user profile summary

### Profile
- `GET /profile` — get user profile
- `PUT /profile` — update profile
- `POST /profile/contacts` — add contact (for SMS resolution)
- `GET /profile/contacts` — list contacts

### Other
- `GET /` — health check
- `GET /health` — server status
- `POST /push/register` — register Expo push token

---

## Current Status

### What's complete (Phases 1-4):
- Full backend with all routes and services
- Claude streaming chat with agentic tool loop (10 tools, all implemented)
- 8 scheduled agents with full execution engine
- ChromaDB 4-layer memory system
- iPhone app with 9 screens + bottom tab navigation
- Google Calendar + Gmail OAuth integration
- HealthKit sync (auto on foreground + manual)
- Twilio SMS messaging
- Goal tracking with milestones
- User profile editing
- Push notifications
- App icon and assets
- TypeScript compiles clean on both projects

### What's remaining for production:
1. **Tests** — zero test files exist. Need unit tests for services and integration tests for routes.
2. **Dockerfile + docker-compose** — no deployment config. Backend needs Docker setup for home server deployment. Should include ChromaDB as a service.
3. **CI/CD** — no GitHub Actions. Should run `npm run build` and tests on PRs.
4. **EAS Build** — `app.json` has placeholder `projectId`. Needs real EAS project for TestFlight/App Store builds.
5. **Merge PRs** — PRs #1, #2, #3 are all draft on separate branches. Main only has initial commit. Recommend merging PR #3 (contains everything).
6. **Notification deep linking** — push notifications arrive but don't navigate to specific screens.
7. **Offline handling** — no offline queue for chat messages or health sync.
8. **Rate limiting** — no rate limiting on API routes.
9. **Error boundaries** — app has no React error boundaries.

---

## Key Files to Understand

If you're picking this up, start with these files in order:

1. **`aurora-backend/src/services/claude.ts`** — The core. Tool definitions, tool execution, system prompt builder, streaming chat with agentic loop.
2. **`aurora-backend/src/services/agent-runner.ts`** — How agents work. Non-streaming Claude calls with tool loop, logging, push notification output.
3. **`aurora-backend/src/services/scheduler.ts`** — All 8 agent definitions with cron schedules and tool assignments.
4. **`aurora-backend/src/types/index.ts`** — Every TypeScript interface.
5. **`aurora-app/App.tsx`** — Navigation structure, auth flow, health auto-sync.
6. **`aurora-app/src/hooks/useConversation.ts`** — SSE streaming chat hook.
7. **`aurora-app/src/constants/colors.ts`** — The dark aurora theme used everywhere.

---

## Design Decisions

- **Single-user system**: The backend iterates all users in some places (scheduler), but it's designed for one person (Elliot). Multi-user would need tenant isolation.
- **Google OAuth shared**: Calendar and Gmail use the same OAuth token. One "Connect Google" button enables both.
- **Health data flow**: iPhone reads HealthKit → POSTs to `/health/sync` → stored in Firestore → agents query via `get_health_data` tool. Not real-time — syncs on app foreground.
- **Agent tool subset**: Agents can't set reminders or send messages directly. They produce briefings that get sent as push notifications.
- **Memory types**: episodic (events), semantic (facts), procedural (preferences/patterns), working (current context). Claude can store memories via `add_memory` during conversations.
- **Contact resolution**: `send_message` resolves names like "Sarah" to phone numbers from the user's Firestore contacts collection. Falls back to raw phone numbers.

---

## Git History

```
f0f2f36 fix: type errors — navigation types, HealthKit declaration, tsconfig module
ff028c5 chore: add package-lock.json for aurora-app
628f92a feat: Phase 4 — tab navigation, Twilio SMS, profile editing, app assets
519fe57 feat: Phase 3 — Google Calendar/Gmail OAuth, email integration, health data, goal tracking
58436f6 feat: Phase 2 — live integrations, agent execution, and scheduler
e588490 feat: Phase 1B — AURORA iPhone app (React Native/Expo)
999570f feat: Phase 1A — AURORA backend foundation
f8a1aeb Initial commit
```

All work is on branch `claude/determine-next-steps-3zWrV`. Draft PR #3 targets `main`.
