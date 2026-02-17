# ZapBot v1 MVP — Requirements

## Milestone: v1-mvp
**Goal**: Ship a working WhatsApp chatbot builder where a non-technical business owner in Brazil can create a conversation flow, connect their WhatsApp number, integrate Google Calendar for scheduling, and go live — all through a visual editor in Portuguese.

---

## Functional Requirements

### FR-01: Multi-Tenant Account System
- **FR-01.1**: User registration and login via Supabase Auth (email/password + Google OAuth)
- **FR-01.2**: Each account has its own isolated workspace (bots, flows, connections)
- **FR-01.3**: Row-Level Security (RLS) on all tenant-scoped tables
- **FR-01.4**: Account settings page (business name, timezone)
- **Priority**: v1 (critical — everything depends on this)

### FR-02: Visual Flow Editor
- **FR-02.1**: Block-based flow editor in PT-BR with 6 block types: Mensagem, Botoes, Coletar Dado, Agendar, Condicao, Transferir
- **FR-02.2**: Add, edit, delete, and reorder blocks in a conversation flow
- **FR-02.3**: Inline content editing (text, button labels, field names)
- **FR-02.4**: Flow saved as JSON to database (Zod-validated via flow-schema package)
- **FR-02.5**: Flow lifecycle: draft / published / paused
- **FR-02.6**: Phone simulator for testing flows before publishing
- **Priority**: v1

### FR-03: WhatsApp Business API Integration
- **FR-03.1**: Connect a WhatsApp Business phone number (store phone_number_id + access_token)
- **FR-03.2**: Webhook endpoint to receive incoming messages from Meta
- **FR-03.3**: Send text messages, button messages, and list messages
- **FR-03.4**: Webhook signature verification (HMAC-SHA256) for security
- **FR-03.5**: Handle 24-hour session window (service messages are free; templates for outbound)
- **Priority**: v1

### FR-04: Flow Execution Engine
- **FR-04.1**: Stateful conversation engine that tracks where each contact is in the flow
- **FR-04.2**: Execute each block type: send message, present buttons, collect input, schedule appointment, evaluate condition, hand off to human
- **FR-04.3**: Variable substitution in messages (e.g., `{nome_paciente}`)
- **FR-04.4**: Session state stored in database (conversation_sessions table)
- **FR-04.5**: Route incoming WhatsApp messages to the correct bot and resume conversation
- **Priority**: v1 (core of the product)

### FR-05: Google Calendar Scheduling
- **FR-05.1**: OAuth flow to connect a Google Calendar account
- **FR-05.2**: Check real-time availability via Google Calendar FreeBusy API
- **FR-05.3**: Generate available time slots based on professional's schedule config (working days, hours, slot duration, buffer time)
- **FR-05.4**: Create calendar events when an appointment is confirmed
- **FR-05.5**: Send appointment confirmation message via WhatsApp with date/time details
- **FR-05.6**: Token encryption at rest (AES-256-GCM) for stored refresh tokens
- **Priority**: v1

### FR-06: Basic Dashboard
- **FR-06.1**: Show conversation count (today, this week)
- **FR-06.2**: Show appointment count
- **FR-06.3**: Show flow completion rate (started vs completed conversations)
- **Priority**: v1 (basic metrics only)

### FR-07: Human Handoff
- **FR-07.1**: Handoff block transfers conversation to a human agent
- **FR-07.2**: Basic notification to business owner when handoff occurs (e.g., email or WhatsApp notification)
- **FR-07.3**: Conversation history available for the human agent to review
- **Priority**: v1 (simple — full live chat is post-MVP)

---

## Non-Functional Requirements

### NFR-01: Security
- **NFR-01.1**: Supabase Auth JWT verification middleware on all API routes
- **NFR-01.2**: RLS policies on all tenant-scoped database tables
- **NFR-01.3**: WhatsApp webhook HMAC-SHA256 signature verification
- **NFR-01.4**: Token encryption at rest for WhatsApp access tokens and Google refresh tokens
- **NFR-01.5**: Environment variables for all secrets (no hardcoded credentials)

### NFR-02: Performance
- **NFR-02.1**: Webhook response time < 5 seconds (Meta requirement)
- **NFR-02.2**: Flow editor loads in < 3 seconds
- **NFR-02.3**: Calendar availability check responds within 2 seconds

### NFR-03: Usability
- **NFR-03.1**: All UI in Portuguese (PT-BR)
- **NFR-03.2**: Non-technical users can create and publish a bot without documentation
- **NFR-03.3**: Mobile-responsive flow editor (at minimum viewable; editing on desktop)

### NFR-04: Reliability
- **NFR-04.1**: Idempotent webhook processing (handle Meta's retry behavior)
- **NFR-04.2**: Graceful handling of expired/revoked Google Calendar tokens (prompt re-authorization)
- **NFR-04.3**: Conversation state survives server restarts (DB-backed sessions)

### NFR-05: Deployment
- **NFR-05.1**: Deployable to a single Node.js host (Railway, Render, or Fly.io)
- **NFR-05.2**: Supabase for managed database and auth
- **NFR-05.3**: Environment-based configuration (dev/staging/production)

---

## Out of Scope (Post-MVP)
- Multi-language UI (i18n)
- AI/LLM-powered response blocks
- Media messages (images, documents, audio)
- WhatsApp template message management
- Full live chat agent inbox
- Payment/billing integration
- Multi-professional scheduling (one professional per bot for MVP)
- Collaborative editing (multiple users editing same flow)
- Analytics beyond basic counts
- Automated reminder messages (24h before appointment)
- Contact management / CRM features

---
*Generated: 2026-02-17*
