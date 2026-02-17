# ZapBot — Day 1 Quickstart

## Pre-Flight Checklist

### Already Done ✅
- [x] Meta Business Account approved
- [x] WhatsApp Cloud API access
- [x] Google Cloud account

### To Do Today

#### 1. Google Calendar API (30 min)
Follow `docs/GOOGLE_CALENDAR_SETUP.md`:
- [ ] Enable Google Calendar API in your project
- [ ] Configure OAuth consent screen
- [ ] Create OAuth credentials (Web client)
- [ ] Add yourself + co-founders as test users
- [ ] Copy Client ID and Client Secret

#### 2. Supabase Project (15 min)
- [ ] Create account at [supabase.com](https://supabase.com)
- [ ] Create new project (region: São Paulo if available, or US East)
- [ ] Copy: Project URL, Anon Key, Service Role Key
- [ ] Enable Google Auth provider in Supabase Auth settings

#### 3. Repository Setup (15 min)
```bash
# Clone or init the repo
git init zapbot
cd zapbot

# Copy the project files (CLAUDE.md, packages, etc.)

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env.local
# Fill in your values from steps 1-2

# Verify everything works
pnpm dev
```

#### 4. WhatsApp Webhook Setup (15 min)
- [ ] Install ngrok: `npm install -g ngrok`
- [ ] Start engine: `pnpm --filter engine dev`
- [ ] Start ngrok: `ngrok http 4000`
- [ ] Copy ngrok HTTPS URL
- [ ] In Meta Business Manager → WhatsApp → Configuration:
  - Webhook URL: `https://your-ngrok-url/webhooks/whatsapp`
  - Verify token: same as your `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  - Subscribe to: `messages`

#### 5. Start Building with Claude Code
```bash
# Open the project in Claude Code
claude

# First task: "Read the CLAUDE.md and implement the WhatsApp
# webhook handler that processes incoming messages through
# the flow engine. Start with the happy path: text messages
# and button replies."
```

## First Week Sprint Plan

| Day | Focus | Claude Code Tasks |
|-----|-------|-------------------|
| **Mon** | Flow engine + webhook | Implement FlowEngine.process() fully. Wire up webhook → DB → engine → WhatsApp response loop. |
| **Tue** | Flow engine testing | Unit tests for all node types. Test with real WhatsApp messages via ngrok. |
| **Wed** | Visual editor — scaffold | Next.js app with Zustand store. Block components. Flow JSON → editor state. |
| **Thu** | Visual editor — interactions | Drag-and-drop, inline editing, add/delete blocks. Test simulator component. |
| **Fri** | Google Calendar | OAuth flow. Availability calculation. Appointment block integration. |
| **Sat** | End-to-end | Full flow: editor → save → publish → WhatsApp message → book appointment → calendar event. |
| **Sun** | Buffer / polish | Fix bugs. Handle edge cases. Clean up UI. |

## Tips for Working with Claude Code on This Project

1. **Always point to CLAUDE.md first** — When starting a session, say "Read CLAUDE.md for project context"

2. **Work in slices, not layers** — Instead of "build all the database queries", ask "implement the full flow for receiving a WhatsApp text message and responding with the next node"

3. **Use the flow schema as your anchor** — When Claude Code generates something that handles flow nodes, verify it matches the Zod schema in `packages/flow-schema`

4. **Test with real WhatsApp early** — Don't wait until Week 3. Get ngrok running on Day 1 and send real messages. Nothing reveals bugs faster.

5. **Commit often** — Claude Code can make sweeping changes. Commit before each major task so you can roll back if needed.

## Architecture Diagram

```
                    ┌──────────────┐
                    │   User on    │
                    │  WhatsApp    │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Meta Cloud  │
                    │     API      │
                    └──────┬───────┘
                           │ webhook
                    ┌──────▼───────┐      ┌──────────────┐
                    │   Engine     │◄────►│   Supabase   │
                    │  (Fastify)   │      │  PostgreSQL   │
                    └──────┬───────┘      └──────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──┐  ┌─────▼─────┐  ┌──▼──────────┐
       │  Flow   │  │  WhatsApp │  │   Google     │
       │ Engine  │  │  Client   │  │  Calendar    │
       └─────────┘  └───────────┘  └──────────────┘

                    ┌──────────────┐
                    │   Web App    │
                    │  (Next.js)   │
                    │              │
                    │ ┌──────────┐ │
                    │ │ Visual   │ │
                    │ │ Editor   │ │
                    │ ├──────────┤ │
                    │ │Simulator │ │
                    │ ├──────────┤ │
                    │ │Dashboard │ │
                    │ └──────────┘ │
                    └──────────────┘
```
