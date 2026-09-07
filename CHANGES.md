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

### `main.js` — Firebase init no longer a single point of failure
`getAuth(firebaseApp)` ran at the very top of the file, before any button
listener or the background canvas animation got registered further down.
If `.env` was missing or incomplete (very easy to hit locally, since `.env`
is git-ignored and doesn't come from `git clone`), that line could throw
and silently kill the entire script — explaining "nothing on the page is
clickable and the background animation doesn't show" as one single root
cause. It's now wrapped in try/catch: sign-in/sign-up won't work without
real Firebase values, but everything else (nav, buttons, animation) boots
regardless.

## Follow-up fix — buttons and background animation not working after deploy

**Symptom:** after pushing to GitHub, none of the buttons responded and the
canvas background animation never showed up — on any page, before even
touching sign-in.

**Root cause:** `main.js` read `import.meta.env.VITE_FIREBASE_API_KEY`
directly. `import.meta.env` is not a real browser feature — it only exists
because Vite injects it while running `vite build` / `vite dev`. The
previous fix wrapped `getAuth()` in try/catch, but the `firebaseConfig`
object itself (and the un-wrapped `initializeApp()` / `getFirestore()`
calls right after it) still ran directly against `import.meta.env` with no
build step in between. Anywhere this file is served as raw source — most
commonly GitHub Pages pointed straight at the repo root, or `index.html`
opened without running `npm run build` first — `import.meta.env` is
`undefined` in the browser, so `import.meta.env.VITE_FIREBASE_API_KEY`
threw a TypeError the instant `main.js` started running. Because that
happens at the top of the file, it happened *before* the
`document.addEventListener('DOMContentLoaded', ...)` block further down
ever got registered — so every button listener and the
`initBackgroundAnimation()` call inside it silently never ran.

**Fix in `main.js`:**
- `import.meta.env` is now read through an optional-chained fallback
  (`const viteEnv = (typeof import.meta !== 'undefined' && import.meta.env) || {}`),
  so a missing Vite build step no longer throws.
- `initializeApp()` and `getFirestore()` are now wrapped in try/catch too
  (previously only `getAuth()` was), so any Firebase init failure only
  disables Firebase-dependent features — sign-in/up and cloud course/
  certification sync — instead of killing the whole script.
- `firebaseResendVerification()` now null-checks `firebaseAuth` before
  reading `.currentUser`, since `firebaseAuth` can now legitimately be
  `null` if init failed.

**This does not replace a real build.** Firebase sign-in/up will still be
unavailable unless `VITE_FIREBASE_*` values are actually available at
build time (via a local `.env` for `npm run dev`, or your host's
Environment Variables for a hosted deploy) — see the Deploying section in
`README.md`. The fix only makes sure a *missing* build/config degrades
gracefully instead of breaking the entire page.

## Files unchanged, on purpose
- `index.html`, `style.css`, `mockData.js` — no changes needed.
- `package.json`, `vite.config.js` — still a standard Vite project, no
  serverless build step required.
- `logo_*.png` — static assets, untouched.
