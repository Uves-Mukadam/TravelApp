# AI Travel Guardian — AI_CONTEXT.md

> **This file is the SINGLE SOURCE OF TRUTH for all AI agents working on this project.**
>
> Every AI coding agent MUST:
> 1. Read this file before making changes
> 2. Understand the current architecture
> 3. Check what has already been implemented
> 4. Check known problems and pending tasks
> 5. Avoid duplicating existing functionality
> 6. Update this file after making meaningful architectural or feature changes

---

## Project Overview

**AI Travel Guardian** is an AI-powered travel safety and assistance platform. It monitors travelers during journeys, analyzes telemetry data for potential risks, and can take automated actions (including micropayments) within policy-defined limits.

### Core Flow

```
Traveler → AI Travel Agents → External Services → x402 Micropayments → Algorand
```

The system uses AI agents that:
- Observe traveler and trip information
- Analyze situations holistically (not single hard-coded rules)
- Decide and recommend appropriate actions
- Follow user-defined safety and spending policies
- Take permitted actions automatically
- Request user approval when actions exceed permissions
- Make permitted micropayments through x402
- Record all decisions, actions and payments

---

## Current Architecture

```
React Frontend (Vite)
        ↓
Express.js Backend (n8n stand-in)
        ↓
Gemini API (Risk Analysis & Trip Planning)
        ↓
Firebase Firestore (Incident Logs & Trip Management)
        ↓
Policy Engine (Action Authorization)
        ↓ (PLANNED)
x402 Micropayments
        ↓ (PLANNED)
Algorand Testnet
```

### Architecture Notes

- **Milestone 1** established the basic vertical slice (Express.js stand-in for n8n, Gemini risk analysis, in-memory/Firebase incident logs, React Dashboard).
- **Milestone 2** expanded this to include full Trip Management (creation, listing, detail view), the Travel Planner Agent (Gemini-powered structured itinerary planner), and Leaflet.js interactive maps for route waypoints and incident mapping.
- Graceful fallbacks remain: the system continues to work without active Gemini API keys (mock itinerary and risk analysis) or Firebase credentials (in-memory storage for trips and incidents).

---

## Features

### COMPLETED
- [x] Traveler telemetry simulator with 4 scenario presets (Normal, Rest Stop, Warning, Emergency)
- [x] Gemini-powered risk analysis with structured JSON output
- [x] Mock risk analysis fallback (works without API key)
- [x] Firebase incident logging with in-memory fallback
- [x] Deterministic policy engine for action authorization
- [x] React dashboard with real-time incident feed (10s auto-refresh)
- [x] Dashboard statistics (total, critical, high, low/medium counts)
- [x] Risk assessment display with score meter, key factors, and action tags
- [x] Dark glassmorphism UI with risk-level color coding
- [x] **Trip Management**: Create, list, and view trip details (status controls: plan, start, complete)
- [x] **Travel Planner Agent**: Gemini-generated daily itineraries with cost breakdowns and safety checkpoints
- [x] **Map Visualization**: Leaflet.js interactive maps showing route waypoints and color-coded incident markers
- [x] **Expandable Dashboard Incidents**: Click incident to display RiskCard and raw telemetry side-by-side

### IN PROGRESS
- (none currently)

### PLANNED
- [ ] x402 micropayment integration
- [ ] Algorand testnet wallet and transaction flow
- [ ] n8n workflow integration (replace Express stand-in)
- [ ] Firebase Realtime Database / Firestore real-time listeners on frontend (currently polling)
- [ ] Emergency contact notification system
- [ ] User authentication
- [ ] Map visualization improvements (current speed, active tracing)
- [ ] Historical incident analysis

---

## AI Agents

### 1. Travel Guardian Agent

- **Purpose**: Monitor travelers during journeys and respond to abnormal or potentially dangerous situations
- **Inputs**: Traveler telemetry (GPS, battery, network, movement, check-in time, route deviation, speed, vehicle type)
- **Outputs**: Structured risk assessment (riskLevel, riskScore, reason, keyFactors, recommendedActions, urgency)
- **Tools**: Gemini API for contextual analysis
- **Decision Logic**: Holistic analysis of all telemetry factors (see `backend/prompts/riskAnalysis.txt`)
- **Risk Levels**: LOW, MEDIUM, HIGH, CRITICAL
- **Restrictions**: Cannot authorize payments. All actions validated by policy engine.
- **Current Status**: ✅ IMPLEMENTED (Milestone 1)

### 2. Travel Planner Agent

- **Purpose**: Help travelers plan trips before the journey
- **Inputs**: Trip parameters (origin, destination, budget, duration, preferences)
- **Outputs**: Detailed structured itinerary (tripName, summary, totalEstimatedCost, costBreakdown, safetyTips, dailyPlans with activities, accommodation suggestions, checkpoints, emergency resources, routeWaypoints)
- **Tools**: Gemini API for itinerary generation
- **Decision Logic**: Custom system prompt for planning (see `backend/prompts/tripPlanner.txt`)
- **Restrictions**: Budget-aware, follows user preferences
- **Current Status**: ✅ IMPLEMENTED (Milestone 2)

---

## n8n Workflows

### Telemetry Webhook Workflow
- **Workflow name**: telemetry-risk-analysis
- **Purpose**: Receive telemetry, analyze risk, log incident
- **Trigger**: HTTP webhook POST
- **Inputs**: Traveler telemetry JSON
- **Nodes**: Validate → Gemini Risk Analysis → Policy Check → Firebase Log → HTTP Response
- **External APIs**: Gemini API
- **Outputs**: Risk assessment with incident ID
- **Error handling**: Fallback to mock analysis if Gemini fails
- **Current status**: Simulated by Express.js backend (`backend/server.js`)

---

## Firebase Database

### Collection: `incidents`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (auto) | Firestore document ID |
| `tripId` | string | Trip identifier |
| `timestamp` | string (ISO) | When the incident was created |
| `telemetry` | object | Raw telemetry data received |
| `riskLevel` | string | LOW / MEDIUM / HIGH / CRITICAL |
| `riskScore` | number (0-100) | Numerical risk score |
| `reason` | string | AI-generated explanation |
| `keyFactors` | array[string] | Factors that influenced the assessment |
| `recommendedActions` | array[string] | Recommended action IDs |
| `urgency` | string | none / low / moderate / high / immediate |
| `agentId` | string | Always "travel_guardian" for now |
| `status` | string | "logged" / "acknowledged" / "resolved" |

### Collection: `trips`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated |
| `name` | string | Trip name (e.g., "Mumbai → Goa") |
| `origin` | string | Origin city name |
| `destination` | string | Destination city name |
| `days` | number | Trip duration |
| `budget` | number | Total budget in ₹ |
| `budgetSpent` | number | Amount spent so far |
| `status` | string | "planning" / "active" / "completed" / "cancelled" |
| `itinerary` | object | AI-generated daily plans (structured JSON) |
| `preferences` | object | User preferences (vehicle, comfort level, etc.) |
| `createdAt` | string | ISO timestamp |
| `agentId` | string | "travel_planner" |

### Security Considerations
- Firebase rules should restrict write access to the backend service account only
- Frontend should only have read access to incidents and trips for the authenticated user
- No PII (personally identifiable information) should be stored in telemetry unless necessary

---

## API Integrations

### Gemini API
- **Purpose**: AI-powered risk analysis and trip itinerary generation
- **Endpoint/Service**: `@google/generative-ai` SDK
- **Model**: Configurable via `GEMINI_MODEL` env var (default: `gemini-2.5-flash`)
- **Required inputs**: System instructions + user query JSON
- **Returned data**: Structured JSON
- **Authentication**: API key via `GEMINI_API_KEY` env var
- **Current status**: ✅ IMPLEMENTED (with mock fallback)

---

## x402

- **Why x402 is used**: Machine-to-machine micropayment protocol enabling AI agents to pay for external services (roadside assistance, premium APIs) without manual user intervention for small amounts.
- **Payment flow**: Agent recommends payment → Policy engine validates (category, amount, budget) → If authorized: x402 payment initiated → Transaction settled on Algorand
- **Which services require payment**: roadside_assistance, emergency_api (planned), premium map/weather APIs (planned)
- **How payment authorization works**: The AI (Gemini) can RECOMMEND actions, but the policy engine (deterministic code) DECIDES whether they are authorized. The LLM never directly authorizes financial transactions.
- **Current implementation status**: ❌ NOT IMPLEMENTED (Milestone 3+)

---

## Algorand

- **Testnet usage**: All development and testing on Algorand Testnet
- **Wallet architecture**: (TBD — will need escrow/custodial wallets for trip budgets)
- **ASA/token information**: (TBD — may use custom ASA for trip credits)
- **Transaction flow**: Policy engine authorizes → x402 payment request → Algorand transaction → Confirmation logged to Firebase
- **Current implementation status**: ❌ NOT IMPLEMENTED (Milestone 3+)

**⚠️ NEVER store private keys, seed phrases, or mnemonics in code or this file.**

---

## Spending Policy

### Default Policy (defined in `backend/services/policyEngine.js`)

| Parameter | Value |
|-----------|-------|
| Emergency budget | ₹2,000 / trip |
| Max single payment | ₹500 |

**Allowed categories**: roadside_assistance, emergency_api, maps, weather

**Restricted categories**: shopping, entertainment, hotels (unless explicitly approved)

**Auto-approved actions** (no user approval needed):
- request_checkin
- retrieve_last_location
- check_route
- check_weather
- log_incident

**Requires user approval**:
- contact_roadside_assistance
- notify_emergency_contacts
- find_assistance

**Exception**: In CRITICAL risk situations, `requireApprovalActions` are auto-authorized.

### Policy Validation Flow

1. Gemini recommends an action
2. Policy engine checks: Is the action auto-approved? → Allow
3. If not auto-approved: Is it in the requires-approval list? → Check risk level
4. If CRITICAL risk: auto-authorize even requires-approval actions
5. For payments: Check category → Check max single payment → Check remaining budget
6. Only if ALL checks pass → authorize

---

## Environment Variables

**⚠️ Only variable NAMES are listed. Never store actual values here or in code.**

```env
# Backend
GEMINI_API_KEY=
GEMINI_MODEL=                        # Optional, default: gemini-2.5-flash
FIREBASE_SERVICE_ACCOUNT_PATH=       # Path to service account JSON
FIREBASE_PROJECT_ID=                 # Alternative to service account file
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
PORT=                                # Backend port, default: 3001
CORS_ORIGIN=                         # Frontend origin, default: http://localhost:5173

# Frontend (Vite uses VITE_ prefix)
VITE_API_URL=                        # Backend URL, default: http://localhost:3001
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Algorand (PLANNED)
ALGOD_SERVER=
ALGOD_PORT=
ALGOD_TOKEN=
```

---

## Folder Structure

```
TravelApp/
├── AI_CONTEXT.md              # THIS FILE — single source of truth
├── .gitignore
├── .env.example               # Environment variable template
├── frontend/                  # React + Vite frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx           # App entry point
│       ├── App.jsx            # Root component with routing
│       ├── index.css          # Design system (dark glassmorphism)
│       ├── components/
│       │   ├── Navbar.jsx     # Navigation bar (Dashboard, Trips, Simulator)
│       │   ├── RiskCard.jsx   # Risk assessment display
│       │   ├── TelemetryForm.jsx  # Telemetry input with presets
│       │   ├── IncidentList.jsx   # Incident feed list
│       │   ├── MapView.jsx    # Interactive Leaflet map component
│       │   ├── TripForm.jsx   # AI Travel Planner input form
│       │   └── ItineraryCard.jsx  # AI trip plan & daily display component
│       ├── pages/
│       │   ├── Dashboard.jsx  # Enhanced Incident dashboard with map + side details
│       │   ├── Simulator.jsx  # Telemetry simulator page
│       │   ├── Trips.jsx      # Trips list & planner page
│       │   └── TripDetail.jsx # Detailed view of single trip (map, itinerary, incidents)
│       └── services/
│           └── api.js         # Backend API client
├── backend/                   # Express.js backend (n8n stand-in)
│   ├── package.json
│   ├── server.js              # Express server, routes, pipeline
│   ├── services/
│   │   ├── gemini.js          # Gemini risk analysis
│   │   ├── travelPlanner.js   # Travel Planner Agent
│   │   ├── tripManager.js     # Trip CRUD operations
│   │   ├── firebase.js        # Firestore logging
│   │   └── policyEngine.js    # Deterministic action authorization
│   └── prompts/
│       ├── riskAnalysis.txt   # System prompt for risk guardian
│       └── tripPlanner.txt    # System prompt for trip planner
└── n8n/
    └── workflows/
        └── README.md          # Placeholder for future n8n workflows
```

---

## Development Rules

1. **Build incrementally** — do not attempt to build the entire platform at once
2. **Simple > complex** — prefer reliable architecture over unnecessary abstraction
3. **Every AI action must be logged** — explainability is mandatory
4. **Never hard-code secrets** — use environment variables
5. **LLM never authorizes payments** — policy engine is the gatekeeper
6. **Keep modules separate** — frontend, agents, database, payments are independent
7. **Design for handoff** — another developer must be able to understand and modify any component
8. **Avoid unnecessary dependencies** — every dependency must justify its inclusion
9. **Don't rewrite working code** — unless there's a clear reason
10. **Update AI_CONTEXT.md** — after any meaningful architectural or feature change
11. **Check git status before changes** — don't overwrite unrelated work
12. **Keep commits focused** — one feature/fix per commit

---

## Completed Work

### 2026-08-20: Milestone 1 — First Vertical Slice
- Full project scaffolding (React + Vite frontend, Express.js backend)
- Telemetry simulator with 4 presets
- Gemini-powered risk analysis (with mock fallback) and policy engine validation
- In-memory/Firestore incident logging and dashboard UI

### 2026-08-20: Milestone 2 — Trip Management + Travel Planner Agent
- Created Travel Planner Agent prompting and backend service
- Added Trip Management CRUD endpoints and UI pages (`/trips`, `/trips/:id`)
- Integrated Leaflet.js interactive maps to render route waypoints and incident markers
- Created expandable incident details and incident map on the Dashboard

---

## Current Work

Setting up Milestone 3 (x402 Micropayments & Algorand integration).

---

## Known Bugs

- Dashboard polling: Dashboard still uses interval-based polling to load incidents. In production, this should use Firestore real-time snapshot listeners.

---

## Pending Tasks

### Priority 1 (Next)
- [ ] Scaffold Algorand setup (Testnet client initialization)
- [ ] Implement x402 payment protocol simulation in the backend
- [ ] Connect payments to policy engine checks (Roadside assistance, etc.)
- [ ] Update Simulator to send payments/charge simulator requests

### Priority 2 (Near-term)
- [ ] Integrate n8n as the orchestration layer (replace Express stand-in)
- [ ] Replace polling on Dashboard with Firebase real-time listeners
- [ ] Add user authentication (Firebase Auth)

---

## Important Decisions

### Decision 1: Express.js as n8n stand-in for Milestone 1
- **Decision**: Use a lightweight Express.js server instead of n8n for the initial vertical slice
- **Reason**: Reduces infrastructure requirements for the first demo. The Express server implements the same webhook → analysis → logging pipeline that n8n would orchestrate.
- **Date**: 2026-08-20
- **Alternatives considered**: (A) Require n8n setup before any demo, (B) Use Express permanently. Chose (C) Express now, n8n later.

### Decision 2: Graceful degradation without credentials
- **Decision**: Both Gemini and Firebase services fall back to local alternatives when credentials are not configured
- **Reason**: Allows developers to run and test the full pipeline without needing API keys or Firebase setup. Mock analysis uses simple heuristics; in-memory store replaces Firestore.
- **Date**: 2026-08-20
- **Alternatives considered**: Require all credentials before starting. Rejected because it blocks development.

### Decision 3: Policy engine separate from AI
- **Decision**: The AI (Gemini) recommends actions, but a deterministic policy engine validates them
- **Reason**: Security requirement — LLMs must never have direct authority over financial transactions. The policy engine uses explicit rules (budget limits, category restrictions, risk-level overrides).
- **Date**: 2026-08-20
- **Alternatives considered**: Let Gemini decide payment authorization. Rejected for security reasons.

### Decision 4: Leaflet.js for Maps
- **Decision**: Use Leaflet.js and CartoDB dark tiles for map rendering
- **Reason**: Completely free, requires no API keys (unlike Google Maps or Mapbox), fits the dark glassmorphism aesthetic perfectly, and lightweight.
- **Date**: 2026-08-20
- **Alternatives considered**: Google Maps API, Mapbox GL JS.

---

## How To Run

### Prerequisites
- Node.js 18+ installed
- (Optional) Gemini API key for real AI analysis
- (Optional) Firebase project for persistent storage

### Quick Start (No API Keys Needed)

```bash
# 1. Clone / open the repository
cd TravelApp

# 2. Start the backend
cd backend
cp ../.env.example .env    # Edit .env if you have API keys
npm install
npm run dev

# 3. In a new terminal, start the frontend
cd frontend
npm install
npm run dev

# 4. Open http://localhost:5173 in your browser
```
