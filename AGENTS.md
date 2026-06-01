# AGENTS.md

## Commands

```
npm run dev       # Start frontend server on port 3000, binds 0.0.0.0
npm run dev:api   # Start backend Express server on port 4200, binds 0.0.0.0
npm run dev:full  # Start both frontend and backend servers
npm run build     # Production build via Vite
npm run lint      # Typecheck only (tsc --noEmit)
npm run docker:whatsapp:up    # Run WhatsApp backend in Docker on port 4200
npm run docker:whatsapp:down  # Stop WhatsApp backend Docker stack
npm run smoke:whatsapp        # Check /api/health for the backend
```

There is no test framework, no CI, and no pre-commit hooks.

## Environment

- `.env` holds all secrets. It is gitignored but an example is at `.env.example`.
- `GEMINI_API_KEY` is injected as `process.env.GEMINI_API_KEY` (not `VITE_`-prefixed) via `vite.config.ts` `define`. Do not rename this key.
- Firebase config (`VITE_FIREBASE_*`), Google OAuth (`VITE_GOOGLE_CLIENT_ID`), and Supabase URL/key are typically `VITE_`-prefixed env vars.
- `DISABLE_HMR=true` disables HMR (used in AI Studio to prevent flickering during agent edits). Keep this check in `vite.config.ts`.
- `APP_URL` is injected by AI Studio at runtime for Cloud Run deployments. Do not hardcode a base URL.
- `VITE_SANDBOX_URL` / `VITE_BACKEND_URL` point to the backend server (default `http://localhost:4200`; set to the ngrok HTTPS URL when tunneling).
- Server-only vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SANDBOX_PORT`, `SANDBOX_ROOT`, `WA_AUTH_ROOT`, `WA_LOG_LEVEL`, `WA_SYNC_FULL_HISTORY`, `WA_HISTORY_LIMIT`, `WA_HISTORY_RESPONSE_LIMIT`) are read by `server/index.ts` via `dotenv/config`.

## WhatsApp Integration (Backend)

- **Base URL**: local Docker/server default `http://localhost:4200`; expose with `ngrok http 4200` when a public URL is needed. Do not hardcode the old VPS URL.
- **Endpoints**:
  - **Health**: `GET /api/health`
  - **QR Code**: `GET /api/whatsapp/qr/{userId}` (returns raw PNG)
  - **Tool Execution**: `POST /api/whatsapp/tool`
  - **Call History**: `POST /api/whatsapp/tool` with `tool=getCalls`
  - **Webhook Configuration**: `POST /api/whatsapp/admin/config` (to set `webhookUrl`)
- **Supported tools**: `readChats`, `getContacts`, `getGroups`, `getMessageHistory`, `getCalls`, `sendMessage`, `sendGroupMessage`, `sendMedia`, `sendAudio`, `sendReaction`, `sendButtons`.
- **Delegated send rule**: outbound WhatsApp tools require `permissions.requireUserApproval=true`, `permissions.approvedByUser=true`, and `permissions.mode="delegated_send"`. Beatrice must preview the message and wait for `SEND`/`Approved` before sending.
- **History mimicry**: `WA_SYNC_FULL_HISTORY=true` makes Baileys request desktop-style full history. Persist up to `WA_HISTORY_LIMIT` messages (default 50000) and allow `getMessageHistory` responses up to `WA_HISTORY_RESPONSE_LIMIT` (default 2000) so Beatrice can mimic the user's own `fromMe:true` WhatsApp style.

Single-package Vite + React 19 + TypeScript app + optional Express backend (server/). Firebase handles auth and data, Gemini Live API handles the AI voice pipeline. The backend server provides WhatsApp integration (Baileys + Cloud API) and web glance API; run separately with `npx tsx server/index.ts`.

**Entry point:** `index.html` → `src/main.tsx` → `src/App.tsx`

**`src/App.tsx`** (~200 lines) is the slim orchestrator: auth state, Firebase init, user routing (EntryFlow → AuthPage or BeatriceAgent). All business logic is extracted to separate modules.

**Key source files:**
| File | Purpose |
|---|---|
| `src/App.tsx` | Root orchestrator: auth state, user routing |
| `src/constants.ts` | Shared constants (`LANGUAGES` array) |
| `src/components/BeatriceAgent.tsx` | Main AI voice agent: Gemini Live session, audio pipeline, tool calling, settings panel, camera feed, document generation |
| `src/components/AuthPage.tsx` | Auth UI: sign in / register / reset password forms, Google OAuth trigger via props |
| `src/components/EntryFlow.tsx` | Splash → Onboarding flow + `isGoogleLinked` helper |
| `src/firebase.ts` | Firebase init + `handleFirestoreError()` helper |
| `src/lib/audio.ts` | `AudioStreamer` (TTS playback) and `AudioRecorder` (mic capture) |
| `src/components/UnifiedTranscript.tsx` | Animated word-by-word transcript |
| `src/index.css` | Single `@import "tailwindcss";` line (Tailwind v4) |
| `vite.config.ts` | Path alias `@` → `.`, Tailwind v4 plugin, env injection |
| `src/components/WhatsAppSettings.tsx` | WhatsApp pairing UI, permission toggles, Firestore sync |
| `src/lib/whatsappClient.ts` | WhatsApp backend API client (pair, send, status, contacts) |
| `src/lib/supabase.ts` | Supabase client setup + error handling |
| `src/lib/supabaseStorage.ts` | Avatar + knowledge file upload/list/delete to Supabase Storage |
| `server/index.ts` | Express backend: WhatsApp + web glance + health API routes |
| `server/whatsapp.ts` | WhatsAppManager: Baileys / Cloud API session lifecycle |
| `server/whatsapp-tools.ts` | Permission-gated WhatsApp tool handlers |

## Firebase + Firestore

- Config is hardcoded in `src/firebase.ts`.
- Firestore blueprint: `firebase-blueprint.json` defines `User` and `Message` schemas.
- **Messages are immutable** — `allow update, delete: if false` in `firestore.rules`. Never attempt to edit or delete messages.
- Every Firestore operation must use `handleFirestoreError()` from `src/firebase.ts` for structured error logging (includes auth context).
- Security invariants in `security_spec.md` must be preserved: user data isolation, timestamp validation (`== request.time`), role constrained to `user`/`model`, field validation by whitelist, length limits (`personaName` ≤ 50, `customPrompt` ≤ 2000, `message.text` ≤ 5000, document ID ≤ 128 chars matching `^[a-zA-Z0-9_\-]+$`).

## Gemini Live API

- SDK: `@google/genai` (`^1.29.0`), model: `gemini-2.5-flash-native-audio-preview-09-2025`.
- Audio modalities are used for real-time bidirectional voice; tool calls (`functionCall` in `onmessage` callback) drive WhatsApp, Google Services (Gmail, Calendar, Tasks, Contacts), web search, document generation, camera, and phone dialing.
- 17 tools declared. Execution is a single switch statement inside the `onmessage` closure.
- The voice personality prompt (`VOICE_PERSONALITY_PROMPT`) is a ~350-line constant in `src/components/BeatriceAgent.tsx`. Do not alter it casually — it defines the entire agent persona.
- Permissions (10 boolean toggles, all default `false`) are injected into the system instruction at session start. Changes require session reconnect.
- Document generation uses a separate non-voice Gemini session (`gemini-2.5-flash`, non-streaming).
- Audio output is PCM16 mono 24kHz, streamed via `AudioStreamer` (decode → queue → schedule → play).

## UI / Styling

- Tailwind CSS v4 via `@tailwindcss/vite` plugin — uses `@import "tailwindcss"` syntax, no `tailwind.config.*`.
- Animation library: `motion` (formerly framer-motion), imported as `motion/react`.
- Icons: `lucide-react`.
- Markdown rendering: `react-markdown` for chat messages.
- Dark theme: `#050505` background, amber/warm peach (`#d0a78b`) accent.

## Reference UI

`public/reference-ui.html` contains the canonical landing page design with the orb animation, blob drift keyframes, peach glow, transcription area, and bottom nav. Use this as the design source of truth for UI changes.

## File to ignore

`temp.txt` is scrap data (Gemini SDK type definitions). Do not reference, import, or modify it.
