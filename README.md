# Developer Club Dashboard

## What changed
- **AI chat backend removed.** The Career Counselor chat no longer calls
  Groq/OpenAI or any external AI service — it now always answers using the
  existing local, keyword-based sandbox logic
  (`getConversationalSandboxReply` in `main.js`). No server, no API key,
  no `/api` folder.
- **Firebase config moved out of `main.js` into `.env`.** It's read via
  `import.meta.env.VITE_FIREBASE_*` at build time instead of being
  hardcoded in the source file.

  ⚠️ Honest caveat: this is organizational, not a real secret boundary.
  Since this is a client-side app, Vite bakes every `VITE_`-prefixed value
  straight into the built JS bundle — anyone can still see it via
  devtools/view-source on the live site, exactly as before. That's expected
  and fine for Firebase specifically: its config isn't meant to be secret;
  actual protection comes from Firebase Auth + Firestore Security Rules.

## Setup
```
npm install
```

`.env` already exists locally with your real Firebase values (it's
git-ignored — never gets committed). `.env.example` shows the same variable
names with blanks, for reference or a fresh machine:
```
cp .env.example .env
# then fill in the VITE_FIREBASE_* values from your Firebase project settings
```

## Run locally
```
npm run dev
```
Opens at http://localhost:3000. Test everything here — including the
Career Counselor chat, which works fully offline now, no external calls.

## Production build
```
npm run build
```
Outputs to `dist/`: minified JS/CSS, every filename content-hashed
(e.g. `index.CsfU8oM1.js`) so a CDN can cache it forever without a
stale-cache bug on deploy.

To sanity-check the build locally:
```
npm run preview
```

### `dist/` is generated — never hand-edit it
It gets fully overwritten on the next `npm run build`. Edit the source
files (`main.js`, `style.css`, `index.html`) and rebuild.

## Deploying (Vercel or any static host)
This is now a plain static site after `npm run build` — no serverless
functions required.

⚠️ **Do not push this repo straight to GitHub and point GitHub Pages (or
any static host) at the repo root.** `main.js` uses `import.meta.env`,
which only exists because Vite injects it during `npm run build`. Serving
`main.js` as raw, un-built source makes `import.meta.env` undefined in the
browser — the whole script fails at the very top, before any button or the
background animation gets wired up, which looks like "nothing on the page
works." You must run the build step below and deploy the generated `dist/`
folder, not the source files.

1. Push this repo to GitHub (`.env` stays out automatically — see below).
2. Import the repo in Vercel (or any static host that runs `npm run build`
   for you). Vercel auto-detects Vite and does this automatically.
3. In Vercel → Project Settings → Environment Variables, add the same
   `VITE_FIREBASE_*` variables from your `.env` so the production build has
   them at build time.
4. Deploy.

**If you specifically want GitHub Pages:** GitHub Pages does not run a
build for you — you either need a GitHub Actions workflow that runs
`npm run build` and publishes the `dist/` folder (with the `VITE_FIREBASE_*`
values added as GitHub Actions secrets), or you build locally
(`npm run build`) and push the contents of `dist/` to your `gh-pages`
branch. Either way, Pages must serve `dist/`, never the repo root.

## ⚠️ Before you push to GitHub
`.env` has your real Firebase values and, for your own reference, your
admin email/password. It's listed in `.gitignore`, so a normal
`git add .` / `git commit` won't pick it up — but run `git status` before
your first commit and confirm `.env` does **not** appear under "Changes to
be committed."

## Files removed and why
See `CHANGES.md` for the list of files removed in this cleanup and the
reasoning behind each.

## Files
- `index.html`, `main.js`, `style.css`, `mockData.js` — source, edit these
- `.env` — real local config (Firebase values, admin reference) — never committed
- `.env.example` — template with the same variable names, no real values
- `.gitignore` — keeps `.env`, `node_modules/`, and `dist/` out of Git
- `vite.config.js` — build configuration (minification, hashed filenames, output folder)
- `package.json` — `npm run dev` / `npm run build` / `npm run preview`
- `logo_club.png`, `logo_college.png`, `logo_webrania.png` — static images
