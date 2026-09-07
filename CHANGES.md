# Cleanup Changes

## Files removed

### `api/chat.js`
Was a Vercel serverless function that proxied AI chat requests to Groq,
holding the `GROQ_API_KEY` server-side. Removed because the AI chat feature
itself is no longer used — the Career Counselor chat now answers entirely
with local, offline sandbox logic (`getConversationalSandboxReply` in
`main.js`). No server-side AI call happens anymore, so there's nothing left
for this file to proxy to.

### `vercel.json`
Only existed to tell Vercel how to route requests to `api/chat.js`
alongside the static build. With that function gone, this project is a
plain static site again — Vercel (and any static host) auto-detects a Vite
project without needing this file.

### `_env`
Was a reference-only file (never read by the app) listing Firebase config
and admin credentials. Removed because its contents are now split
properly:
- Firebase values moved into `.env` as `VITE_FIREBASE_*` variables that
  `main.js` actually reads via `import.meta.env` at build time.
- Admin email/password kept as reference-only lines inside that same
  `.env` file, instead of a separate file, so there's one git-ignored
  place for local secrets instead of two.

## Files changed

### `main.js`
- `firebaseConfig` no longer hardcodes values — reads them from
  `import.meta.env.VITE_FIREBASE_*` instead (see `.env` / `.env.example`).
- `handleChatMessageSubmit()` no longer calls `/api/chat` or any external
  AI provider — it always uses the offline sandbox reply, same as the
  original fallback logic, now the only path.
- Removed leftover cleanup code for old `alameen_openai_*` local-storage
  keys' comments to reflect that there's no provider integration left at
  all.

## Files unchanged, on purpose
- `index.html`, `style.css`, `mockData.js` — no changes needed.
- `package.json`, `vite.config.js` — still a standard Vite project, no
  serverless build step required.
- `logo_*.png` — static assets, untouched.
