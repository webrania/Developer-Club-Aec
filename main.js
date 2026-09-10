import { 
  getStudents, 
  getNotifications, 
  getDepartments,
  getChats,
  getVolunteers,
  getPolls,
  getCourses,
  getCertifications,
  saveStudents, 
  saveNotifications, 
  saveDepartments,
  saveChats,
  saveVolunteers,
  savePolls,
  saveCourses,
  saveCertifications,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  YEARS 
} from './mockData.js';

// Vite content-hashes every built asset filename (e.g. logo_club.B3x1kP.png)
// so a CDN can cache it forever. A plain string like 'logo_club.png' in JS
// is invisible to that process — it only rewrites references it can see
// statically (like <img src="..."> in index.html or a real import like this
// one) — so any src set from a bare JS string 404s in the built site even
// though it works fine under `vite dev`. This import gives us the correct,
// always-current hashed URL to use everywhere in this file instead.
import logoClubUrl from './logo_club.png';

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signOut as firebaseSignOutFn
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// Pulled from .env (VITE_-prefixed so Vite exposes them at build time) —
// see .env.example for the variable names. Note: because this is a
// client-side app, these values still end up inside the built JS bundle
// (view-source / devtools will show them) — same as before. Firebase web
// config isn't a secret by design; real protection is Firestore Security
// Rules + Firebase Auth, not hiding this object. This move is purely for
// keeping the key out of the source file itself.
//
// IMPORTANT: `import.meta.env` only exists because Vite injects it during
// `vite build` / `vite dev`. If this file is ever served as raw source —
// e.g. GitHub Pages pointed straight at the repo root, or index.html opened
// without running a build — `import.meta.env` itself is `undefined` in a
// plain browser. The old code read `import.meta.env.VITE_FIREBASE_API_KEY`
// directly, which threw a TypeError the instant this file ran, before the
// DOMContentLoaded listener a few lines down ever got registered — that's
// what actually caused every button and the background animation to stop
// working. The `?.` below stops that crash regardless of how the file ends
// up being served.
const viteEnv = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const firebaseConfig = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY,
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: viteEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: viteEnv.VITE_FIREBASE_APP_ID,
  measurementId: viteEnv.VITE_FIREBASE_MEASUREMENT_ID
};

// Temporary diagnostic: shows exactly what Vite actually injected at
// runtime (apiKey partially masked), without ever printing the full key.
// If this logs "MISSING" for any field, .env isn't reaching the app at all
// (wrong filename/location, or the dev server was never restarted after
// saving it) — that's a different problem than a key Google is rejecting,
// where every field here would print fine. Safe to delete this block once
// the auth/invalid-api-key issue is resolved.
console.log('[Firebase config check]', {
  apiKey: firebaseConfig.apiKey
    ? firebaseConfig.apiKey.slice(0, 6) + '...' + firebaseConfig.apiKey.slice(-4)
    : 'MISSING',
  authDomain: firebaseConfig.authDomain || 'MISSING',
  projectId: firebaseConfig.projectId || 'MISSING',
  storageBucket: firebaseConfig.storageBucket || 'MISSING',
  messagingSenderId: firebaseConfig.messagingSenderId || 'MISSING',
  appId: firebaseConfig.appId || 'MISSING'
});

// Both initializeApp() and getFirestore() are wrapped too — previously only
// getAuth() below had a try/catch, but a missing/invalid config can make
// either of these throw as well, which would kill the whole script the same
// way. Now a Firebase problem only ever disables Firebase-dependent
// features (sign-in/up, cloud course & certification sync); nav, buttons,
// theming, and the background animation always boot.
let firebaseApp = null;
let firebaseAuth = null;
let firestoreDb = null;
try {
  // Vite's dev server can re-run this module on a hot reload without a full
  // page refresh. initializeApp() throws "Firebase: Firebase App named
  // '[DEFAULT]' already exists" the second time it's called with the same
  // name — which lands in this catch block, leaving firebaseAuth stuck at
  // null for the rest of that dev session (until you hard-refresh) even
  // though .env is perfectly fine. Reusing the existing app instead of
  // re-creating it avoids that entirely.
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  try {
    firebaseAuth = getAuth(firebaseApp);
  } catch (err) {
    const maskedKey = firebaseConfig.apiKey
      ? (firebaseConfig.apiKey.length + ' chars: ' + firebaseConfig.apiKey.slice(0, 6) + '...' + firebaseConfig.apiKey.slice(-4))
      : 'MISSING / EMPTY';
    console.error(
      '[Firebase] Failed to initialize Auth. apiKey Vite actually injected: ' + maskedKey,
      err
    );
    if (typeof showToast === 'function') {
      const detail = (err && (err.code || err.message)) || 'unknown error';
      showToast('Firebase Auth failed: ' + detail + ' | apiKey seen: ' + maskedKey, 15000);
    }
  }
  try {
    // Registered Courses are the one collection that must be shared across
    // every signed-in user and survive refresh/logout/reopen on any device
    // — so unlike the rest of the app's data (which stays on local
    // storage), courses are always read from and written straight to this
    // Firestore database. Local storage is used only as an offline
    // fallback cache, never as the primary store.
    firestoreDb = getFirestore(firebaseApp);
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firestore.', err);
  }
} catch (err) {
  console.error(
    '[Firebase] Failed to initialize the app — check your VITE_FIREBASE_* ' +
    'values. Firebase sign-in/up and cloud sync will be unavailable, but ' +
    'the rest of the dashboard will still work.',
    err
  );
  if (typeof showToast === 'function') {
    const detail = (err && (err.code || err.message)) || 'unknown error';
    showToast('Firebase failed to start: ' + detail, 10000);
  }
}
const COURSES_COLLECTION = 'registered_courses';
// Certifications must show up in the Admin Dashboard the moment a student
// submits one, regardless of which device/browser the admin is on — so
// they follow the exact same Firestore-first pattern as courses.
const CERTIFICATIONS_COLLECTION = 'certifications';
// Volunteers must be visible to every signed-in user on every device the
// moment the admin adds/edits/removes one — same reasoning as courses and
// certifications above. Previously this only ever went through
// saveVolunteers() into the browser's own localStorage, so an admin's
// changes were invisible to anyone else (or the admin themself on a
// different device/browser).
const VOLUNTEERS_COLLECTION = 'volunteers';
// Every registered student must show up in the Admin Dashboard/directory,
// and every poll must be visible to every user — same reasoning as
// volunteers/courses above. Unlike those, students and polls are edited
// from many different places throughout this file (registration, admin
// edits, CV approval, stat refreshes, poll create/vote/close/delete), so
// rather than adding a cloud-sync call at every one of those sites
// individually (easy to miss one and cause drift), the sync is centralized
// once inside saveCurrentState() below, which every one of those call
// sites already calls.
const STUDENTS_COLLECTION = 'students';
const POLLS_COLLECTION = 'polls';
// Same problem as students/polls/volunteers: admin broadcasts and pinned
// notices only ever reached localStorage, so an admin's announcement was
// invisible to every other user's browser — explaining "admin posted it
// but the student never got it."
const NOTIFICATIONS_COLLECTION = 'notifications';
// Departments are a small, flat list of names (not individually growing
// records like students/polls), so instead of one Firestore doc per
// department, the whole list lives in a single doc. Same underlying problem
// as everything above though: without this, each browser only ever saw its
// own local default list, making departments look like they were randomly
// appearing/disappearing between devices.
const CONFIG_COLLECTION = 'config';
const DEPARTMENTS_DOC_ID = 'departments';

// Creates a real Firebase account and emails a verification link.
// Never stores the password anywhere in our own data.
async function firebaseSignUp(email, password) {
  // firebaseAuth is only null when Firebase itself failed to initialize
  // (see the try/catch around getAuth() near the top of this file) —
  // almost always a missing/incomplete local .env on a fresh clone, or
  // Environment Variables not set on a host. Without this check, calling
  // createUserWithEmailAndPassword(null, ...) crashes deep inside the
  // Firebase SDK with a raw "Cannot read properties of null (reading
  // 'app')" TypeError, which is meaningless to anyone seeing it in the UI.
  if (!firebaseAuth) {
    return {
      success: false,
      error: "Sign-up isn't available right now — Firebase isn't configured " +
        "(missing or incomplete .env). See README.md's Setup section, then " +
        "restart `npm run dev` after saving .env."
    };
  }
  try {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    // Separate try/catch: account creation succeeding is what actually
    // matters for the signup flow. If only the verification email fails to
    // send (e.g. Firebase's own rate limit from repeated testing), the
    // account still exists — reporting the whole signup as failed here
    // would send the person back to a blank-looking form while a real
    // account silently sits there, breaking their next attempt with
    // "email already in use" for reasons they never saw.
    try {
      await sendEmailVerification(cred.user);
    } catch (verifyErr) {
      console.warn('Account created, but the verification email failed to send:', verifyErr);
    }
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: friendlyFirebaseError(err) };
  }
}

// Signs in against Firebase only. Does not check state.students at all.
async function firebaseSignIn(email, password) {
  if (!firebaseAuth) {
    return {
      success: false,
      error: "Sign-in isn't available right now — Firebase isn't configured " +
        "(missing or incomplete .env). See README.md's Setup section, then " +
        "restart `npm run dev` after saving .env."
    };
  }
  try {
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
    return { success: true, user: cred.user };
  } catch (err) {
    return { success: false, error: friendlyFirebaseError(err) };
  }
}

// Firebase itself already throttles repeated verification emails (it's what
// throws auth/too-many-requests), but by then the person has already waited
// through a failed attempt with no explanation. Tracking our own cooldown
// lets us tell them to wait *before* they hit that wall, with a clear reason
// instead of a raw Firebase error.
let lastVerificationResendAt = 0;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

async function firebaseResendVerification() {
  if (Date.now() - lastVerificationResendAt < VERIFICATION_RESEND_COOLDOWN_MS) {
    const waitSecs = Math.ceil((VERIFICATION_RESEND_COOLDOWN_MS - (Date.now() - lastVerificationResendAt)) / 1000);
    showToast(`Please wait ${waitSecs}s before requesting another verification email.`);
    return;
  }
  if (firebaseAuth && firebaseAuth.currentUser) {
    await sendEmailVerification(firebaseAuth.currentUser);
    lastVerificationResendAt = Date.now();
  }
}

function friendlyFirebaseError(err) {
  const code = err && err.code ? err.code : '';
  if (code.includes('email-already-in-use')) return 'That email is already registered. Try signing in instead.';
  if (code.includes('weak-password')) return 'Password is too weak — use at least 6 characters.';
  if (code.includes('invalid-email')) return 'That email address looks invalid.';
  if (code.includes('user-not-found')) return "This email isn't registered yet. Please sign up to create a new account.";
  // Newer Firebase projects collapse "no such user" and "wrong password" into
  // the single generic 'invalid-credential' code for security (so an
  // attacker can't tell which one it was) — we genuinely can't distinguish
  // them here, so the message has to cover both honestly.
  if (code.includes('invalid-credential')) return "No account matches that email and password. If you haven't signed up yet, please create a new account.";
  if (code.includes('wrong-password')) return 'Incorrect password.';
  if (code.includes('too-many-requests')) return 'Too many attempts — please wait a bit and try again.';
  return (err && err.message) || 'Something went wrong. Please try again.';
}

window.addEventListener('error', function(event) {
  console.error("GLOBAL EXCEPTION:", event.error);
  if (typeof showToast === 'function') {
    showToast("Error: " + event.message);
  } else {
    alert("Error: " + event.message);
  }
});
window.addEventListener('unhandledrejection', function(event) {
  console.error("GLOBAL REJECTION:", event.reason);
  if (typeof showToast === 'function') {
    showToast("Error: " + event.reason);
  } else {
    alert("Error: " + event.reason);
  }
});

// Application State
let state = {
  currentTab: 'view-about', 
  viewMode: 'member', 
  loggedInUser: null, 
  dbMode: 'mock',
  supabaseUrl: '',
  supabaseKey: '',
  supabaseClient: null,
  students: [],
  notifications: [],
  departments: [],
  chats: [],
  volunteers: [],
  polls: [],
  courses: [],
  certifications: [],
  activeEvaluationStudentId: null,
  activeChatStudentId: null,
  activeRatioChart: null,
  activePointsChart: null,
  followingList: []
};

let tempAuthUserObject = null;

// Native Vector SVG Icons Registry (Call Phone styled minimally)
function getIconSvg(name, size = 16) {
  const svgs = {
    github: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/></svg>`,
    leetcode: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    linkedin: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`,
    whatsapp: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
    phone: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    like: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
    comment: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    follow: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
    instagram: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`
  };
  return svgs[name] || '';
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  window.alert = function(msg) {
    if (typeof showToast === 'function') {
      showToast(msg, 'info');
    } else {
      console.log("Alert:", msg);
    }
  };

  initTheme();
  loadSettings().then(() => {
    loadData().then(async () => {
      populateFilterOptions();
      setupEventListeners();
      // Must resolve before the first renderApp() call — otherwise the page
      // paints as logged-out for a moment (or permanently, if renderApp()
      // isn't called again) even on a refresh where Firebase is still
      // actually signed in.
      //
      // Order matters here: waitForInitialFirebaseUser() must run BEFORE
      // any Firestore read. Firestore's security rules check the SDK's
      // *current* client-side auth state at request time — if a read fires
      // before Firebase Auth has finished confirming who's signed in (which
      // takes a moment after page load, even for an already-logged-in
      // user), the request goes out looking unauthenticated and gets
      // rejected with "Missing or insufficient permissions", even though
      // the user really is logged in. Then restoreSessionFromFirebaseUser()
      // needs state.students already loaded, so that comes after.
      // The whole sequence is wrapped in try/catch/finally so a genuine
      // failure anywhere in here (a network hiccup, anything) still can't
      // prevent renderApp()/initBackgroundAnimation() from running and
      // leaving the page blank.
      try {
        const currentFirebaseUser = await waitForInitialFirebaseUser();
        await loadStudentsFromCloud(true);
        await loadVolunteersFromCloud(true);
        await loadPollsFromCloud(true);
        await loadNotificationsFromCloud(true);
        await loadDepartmentsFromCloud(true);
        populateFilterOptions(); // re-run now that departments may have just been refreshed from the cloud
        restoreSessionFromFirebaseUser(currentFirebaseUser);
        updateAnnouncementsBadge();
      } catch (err) {
        console.error('Startup data load hit an error — showing the page with whatever loaded so far.', err);
      } finally {
        renderApp();
        initBackgroundAnimation();
      }
      // Perf: this crawl re-fetches GitHub/LeetCode stats for the entire
      // student roster. Running it from every open browser (student or
      // admin) multiplies external API calls by however many people have
      // the site open — with 200+ concurrent users that's tens of
      // thousands of requests a minute for data that barely changes
      // minute-to-minute. Only the admin's own session needs a background
      // refresh; a student's own numbers already get pulled when they sign
      // up or edit their profile. Admin can also force an immediate
      // re-sync any time via the existing "Re-sync All Now" button.
      if (state.loggedInUser && state.loggedInUser.role === 'admin') {
        startAutomaticRealTimeCrawler();
      }
      requestNotificationPermission();
    });
  });
});

// Theme Control
function initTheme() {
  const savedTheme = safeGetItem('alameen_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    safeSetItem('alameen_theme', newTheme);
    updateThemeIcon(newTheme);
    setTimeout(renderCharts, 100);
  });
}

function updateThemeIcon(theme) {
  const moon = document.getElementById('icon-moon');
  const sun = document.getElementById('icon-sun');
  if (theme === 'dark') {
    moon.classList.add('d-none');
    sun.classList.remove('d-none');
  } else {
    moon.classList.remove('d-none');
    sun.classList.add('d-none');
  }
}

// Database Sandbox settings
async function loadSettings() {
  // Supabase is no longer used for data (see [[dev-club-dashboard]] history —
  // this project moved to Firebase Auth + local storage). A browser that was
  // ever tested against Supabase earlier may still have 'alameen_db_mode'
  // set to 'supabase' in its storage, which would silently route every read
  // and write through a stale/placeholder Supabase connection instead of
  // local storage — invisible in the UI, but it means every fix since then
  // would never actually take effect for that browser. Force local mode
  // unconditionally and wipe any leftover Supabase config so this can never
  // happen again.
  state.dbMode = 'mock';
  state.supabaseUrl = '';
  state.supabaseKey = '';
  state.supabaseClient = null;
  safeRemoveItem('alameen_db_mode');
  safeRemoveItem('alameen_supabase_url');
  safeRemoveItem('alameen_supabase_key');

  // The AI Career Counselor no longer calls any external provider at all —
  // it always answers with the local sandbox logic in
  // getConversationalSandboxReply(). Clean up any old provider settings a
  // browser may still have from before.
  safeRemoveItem('alameen_openai_endpoint');
  safeRemoveItem('alameen_openai_key');
  safeRemoveItem('alameen_ai_provider');
}


function initSupabase() {
  try {
    if (window.supabase) {
      state.supabaseClient = window.supabase.createClient(state.supabaseUrl, state.supabaseKey);
    }
  } catch (error) {
    console.error('Supabase load failure:', error);
  }
}

// Load Data
async function loadData() {
  if (state.dbMode === 'supabase' && state.supabaseClient) {
    try {
      const { data: studs } = await state.supabaseClient.from('students').select('*');
      const { data: notifs } = await state.supabaseClient.from('notifications').select('*');
      const { data: depts } = await state.supabaseClient.from('departments').select('*');
      const { data: chts } = await state.supabaseClient.from('chats').select('*');
      const { data: vols } = await state.supabaseClient.from('volunteers').select('*');
      const { data: polls } = await state.supabaseClient.from('polls').select('*');
      const { data: courses } = await state.supabaseClient.from('courses').select('*');

      state.students = studs || [];
      state.notifications = notifs || [];
      state.departments = depts ? depts.map(d => d.name) : [];
      state.chats = chts || [];
      state.volunteers = vols || [];
      state.polls = polls || [];
      state.courses = courses || [];
    } catch (e) {
      console.warn('Supabase loading error. Falling back to local storage.');
      fallbackToMock();
    }
  } else {
    fallbackToMock();
  }

  // Perf: courses and certifications live in Firestore. This used to
  // `await` both, one after the other, before populateFilterOptions(),
  // setupEventListeners(), renderApp() or initBackgroundAnimation() ran —
  // meaning on a slow/mobile connection, every button and the background
  // animation stayed dead for however long two sequential network
  // round-trips took. Neither is needed for the initial paint: the About
  // tab, KPIs, and recalculateScores() never read them, and
  // fallbackToMock() above already filled state.courses from the local
  // cache so the Courses tab isn't even empty in the meantime. Every
  // course/certification view also already re-fetches fresh data itself
  // the instant it's opened (see switchTab), so there's no need to block
  // boot on these — fire them in parallel and let them resolve whenever
  // they resolve.
  loadCoursesFromCloud().then(() => {
    if (state.currentTab === 'view-courses') {
      renderCoursesBrowse();
      if (state.viewMode === 'admin') renderCoursesManageList();
    }
  });
  loadCertificationsFromCloud().then(() => {
    if (state.currentTab === 'view-admin-dashboard') {
      renderAdminCertificationsList();
    }
  });

  try {
    state.followingList = JSON.parse(safeGetItem('alameen_following_list')) || [];
  } catch (err) {
    state.followingList = [];
  }
  state.polls = state.polls || [];

  // One-time-safe cleanup: strip any leftover demo/seed records from a
  // browser that cached them before the hardcoded sample roster was removed.
  // Real signups always get an id like `student_<timestamp>` and real
  // volunteers are added through the admin form with their own generated
  // ids, so this pattern can never match a genuine account — safe to leave
  // running permanently rather than gating it behind a one-time flag.
  state.students = (state.students || []).filter(s => s && !/^stud_\d+$/.test(s.id));
  state.volunteers = (state.volunteers || []).filter(v => v && !/^vol_\d+$/.test(v.id) && v.id !== 'vol_admin');

  if (state.loggedInUser && state.loggedInUser.id === 'admin') {
    state.loggedInUser.name = 'Admin';
    state.loggedInUser.about = state.loggedInUser.about || 'Al-Ameen Engineering College Developer Club Admin.';
  }

  recalculateScores();
  
  if (state.notifications.length > 0) {
    document.getElementById('notif-badge-count').classList.remove('d-none');
  }
}

function fallbackToMock() {
  state.students = getStudents() || [];
  state.notifications = getNotifications() || [];
  state.departments = getDepartments() || [];
  state.chats = getChats() || [];
  state.volunteers = getVolunteers() || [];
  state.polls = getPolls() || [];
  state.courses = getCourses() || [];
}

// --- Registered Courses: always backed by Firestore (see COURSES_COLLECTION
// above), independent of state.dbMode. This is what makes a course survive
// refresh/logout/reopen and show up for every signed-in user, not just the
// browser that created it. Local storage (getCourses/saveCourses) is kept in
// sync purely as an offline-read fallback if the cloud fetch fails.
//
// Perf: a full collection read on every single tab-open adds up fast across
// 200+ concurrent users. Courses/certifications don't change every few
// seconds, so re-opening the same tab within this window reuses what's
// already in memory instead of re-reading the whole collection again. ---
const CLOUD_DATA_FRESH_MS = 30 * 1000;
let coursesLastFetchedAt = 0;
let certificationsLastFetchedAt = 0;

async function loadCoursesFromCloud(force = false) {
  if (!force && Date.now() - coursesLastFetchedAt < CLOUD_DATA_FRESH_MS) return;
  try {
    const snap = await getDocs(collection(firestoreDb, COURSES_COLLECTION));
    const courses = [];
    snap.forEach((docSnap) => courses.push({ id: docSnap.id, ...docSnap.data() }));
    state.courses = courses;
    saveCourses(courses); // refresh the local offline cache to match the cloud
    coursesLastFetchedAt = Date.now();
  } catch (err) {
    console.warn('Could not load courses from the cloud database, using last local cache.', err);
    state.courses = getCourses() || [];
  }
}

async function saveCourseToCloud(course) {
  try {
    await setDoc(doc(firestoreDb, COURSES_COLLECTION, course.id), course);
    return true;
  } catch (err) {
    console.error('Could not save course to the cloud database.', err);
    showToast('Unable to save this course. Check your connection and try again.');
    return false;
  }
}

async function deleteCourseFromCloud(courseId) {
  try {
    await deleteDoc(doc(firestoreDb, COURSES_COLLECTION, courseId));
    return true;
  } catch (err) {
    console.error('Could not delete course from the cloud database.', err);
    showToast('Unable to delete this course. Check your connection and try again.');
    return false;
  }
}

// --- Certifications: same Firestore-first pattern as courses above. A
// student's submission has to be visible in the Admin Dashboard right away,
// on whatever device the admin happens to be using — so this can't rely on
// local storage as the source of truth either. ---
async function loadCertificationsFromCloud(force = false) {
  if (!force && Date.now() - certificationsLastFetchedAt < CLOUD_DATA_FRESH_MS) return;
  try {
    const snap = await getDocs(collection(firestoreDb, CERTIFICATIONS_COLLECTION));
    const certs = [];
    snap.forEach((docSnap) => certs.push({ id: docSnap.id, ...docSnap.data() }));
    state.certifications = certs;
    saveCertifications(certs); // refresh the local offline cache to match the cloud
    certificationsLastFetchedAt = Date.now();
  } catch (err) {
    console.warn('Could not load certifications from the cloud database, using last local cache.', err);
    state.certifications = getCertifications() || [];
  }
}

async function saveCertificationToCloud(cert) {
  try {
    await setDoc(doc(firestoreDb, CERTIFICATIONS_COLLECTION, cert.id), cert);
    return true;
  } catch (err) {
    console.error('Could not save certification to the cloud database.', err);
    showToast('Unable to save this certification. Check your connection and try again.');
    return false;
  }
}

async function deleteCertificationFromCloud(certId) {
  try {
    await deleteDoc(doc(firestoreDb, CERTIFICATIONS_COLLECTION, certId));
    return true;
  } catch (err) {
    console.error('Could not delete certification from the cloud database.', err);
    showToast('Unable to delete this certification. Check your connection and try again.');
    return false;
  }
}

// --- Volunteers: same Firestore-first pattern as courses/certifications. ---
let volunteersLastFetchedAt = 0;

async function loadVolunteersFromCloud(force = false) {
  if (!firestoreDb) { state.volunteers = getVolunteers() || []; return; }
  if (!force && Date.now() - volunteersLastFetchedAt < CLOUD_DATA_FRESH_MS) return;
  try {
    const snap = await getDocs(collection(firestoreDb, VOLUNTEERS_COLLECTION));
    const vols = [];
    snap.forEach((docSnap) => vols.push({ id: docSnap.id, ...docSnap.data() }));
    state.volunteers = vols;
    saveVolunteers(vols); // refresh the local offline cache to match the cloud
    volunteersLastFetchedAt = Date.now();
  } catch (err) {
    console.warn('Could not load volunteers from the cloud database, using last local cache.', err);
    state.volunteers = getVolunteers() || [];
  }
}

async function saveVolunteerToCloud(vol) {
  if (!firestoreDb) return false;
  try {
    await setDoc(doc(firestoreDb, VOLUNTEERS_COLLECTION, vol.id), vol);
    return true;
  } catch (err) {
    console.error('Could not save volunteer to the cloud database.', err);
    showToast('Saved locally, but could not sync this volunteer online. Check your connection.');
    return false;
  }
}

async function deleteVolunteerFromCloud(volId) {
  if (!firestoreDb) return false;
  try {
    await deleteDoc(doc(firestoreDb, VOLUNTEERS_COLLECTION, volId));
    return true;
  } catch (err) {
    console.error('Could not delete volunteer from the cloud database.', err);
    showToast('Removed locally, but could not sync the removal online. Check your connection.');
    return false;
  }
}

// --- Students & Polls: centralized sync (see comment on the constants
// above for why this is one function instead of per-call-site syncing). ---
let studentsLastFetchedAt = 0;
let pollsLastFetchedAt = 0;

async function loadStudentsFromCloud(force = false) {
  if (!firestoreDb) { state.students = getStudents() || []; return; }
  if (!force && Date.now() - studentsLastFetchedAt < CLOUD_DATA_FRESH_MS) return;
  try {
    const snap = await getDocs(collection(firestoreDb, STUDENTS_COLLECTION));
    const students = [];
    snap.forEach((docSnap) => students.push({ id: docSnap.id, ...docSnap.data() }));
    if (students.length > 0) {
      state.students = students;
      saveStudents(students); // refresh local offline cache to match the cloud
    }
    studentsLastFetchedAt = Date.now();
  } catch (err) {
    console.warn('Could not load students from the cloud database, using last local cache.', err);
    state.students = getStudents() || [];
  }
}

async function loadPollsFromCloud(force = false) {
  if (!firestoreDb) { state.polls = getPolls() || []; return; }
  if (!force && Date.now() - pollsLastFetchedAt < CLOUD_DATA_FRESH_MS) return;
  try {
    const snap = await getDocs(collection(firestoreDb, POLLS_COLLECTION));
    const polls = [];
    snap.forEach((docSnap) => polls.push({ id: docSnap.id, ...docSnap.data() }));
    state.polls = polls;
    savePolls(polls);
    pollsLastFetchedAt = Date.now();
  } catch (err) {
    console.warn('Could not load polls from the cloud database, using last local cache.', err);
    state.polls = getPolls() || [];
  }
}

let notificationsLastFetchedAt = 0;
let departmentsLastFetchedAt = 0;

async function loadDepartmentsFromCloud(force = false) {
  if (!firestoreDb) { state.departments = getDepartments() || []; return; }
  if (!force && Date.now() - departmentsLastFetchedAt < CLOUD_DATA_FRESH_MS) return;
  try {
    const docSnap = await getDocs(collection(firestoreDb, CONFIG_COLLECTION));
    let found = null;
    docSnap.forEach((d) => { if (d.id === DEPARTMENTS_DOC_ID) found = d.data(); });
    if (found && Array.isArray(found.list) && found.list.length > 0) {
      state.departments = found.list;
      saveDepartments(found.list);
    }
    departmentsLastFetchedAt = Date.now();
  } catch (err) {
    console.warn('Could not load departments from the cloud database, using last local cache.', err);
    state.departments = getDepartments() || [];
  }
}

async function saveDepartmentsToCloud() {
  if (!firestoreDb) return;
  try {
    await setDoc(doc(firestoreDb, CONFIG_COLLECTION, DEPARTMENTS_DOC_ID), { list: state.departments });
  } catch (err) {
    console.error('Could not sync departments to the cloud database.', err);
  }
}

// Compares every notification's timestamp against when this browser last
// opened the Announcements tab, and shows/hides the tab's dot accordingly.
// This is what makes the dot reflect announcements that arrived from
// somewhere else (another admin's browser, synced in via Firestore) instead
// of only ones created locally in this same session.
function updateAnnouncementsBadge() {
  const badge = document.getElementById('notif-badge-count');
  if (!badge) return;
  const lastSeen = Number(safeGetItem('alameen_last_seen_notif_ts') || 0);
  const hasUnseen = state.notifications.some(n => new Date(n.timestamp).getTime() > lastSeen);
  badge.classList.toggle('d-none', !hasUnseen);
}

async function loadNotificationsFromCloud(force = false) {
  if (!firestoreDb) { state.notifications = getNotifications() || []; return; }
  if (!force && Date.now() - notificationsLastFetchedAt < CLOUD_DATA_FRESH_MS) return;
  try {
    const snap = await getDocs(collection(firestoreDb, NOTIFICATIONS_COLLECTION));
    const notifications = [];
    snap.forEach((docSnap) => notifications.push({ id: docSnap.id, ...docSnap.data() }));
    state.notifications = notifications;
    saveNotifications(notifications);
    notificationsLastFetchedAt = Date.now();
  } catch (err) {
    console.warn('Could not load announcements from the cloud database, using last local cache.', err);
    state.notifications = getNotifications() || [];
  }
}

// Fire-and-forget: pushes the current in-memory students, polls, and
// notifications arrays up to Firestore. Called from saveCurrentState() so
// every existing call site that already saves state automatically stays in
// sync online too, without needing to be touched individually. Not awaited
// by callers — the local save (already done by the time this runs) is what
// keeps the UI responsive; this just catches the online copy up shortly
// after.
async function syncStudentsAndPollsToCloud() {
  if (!firestoreDb) return;
  try {
    await Promise.all(state.students.map(s => setDoc(doc(firestoreDb, STUDENTS_COLLECTION, s.id), s)));
  } catch (err) {
    console.error('Could not sync students to the cloud database.', err);
  }
  try {
    await Promise.all(state.polls.map(p => setDoc(doc(firestoreDb, POLLS_COLLECTION, p.id), p)));
  } catch (err) {
    console.error('Could not sync polls to the cloud database.', err);
  }
  try {
    await Promise.all(state.notifications.map(n => setDoc(doc(firestoreDb, NOTIFICATIONS_COLLECTION, n.id), n)));
  } catch (err) {
    console.error('Could not sync announcements to the cloud database.', err);
  }
}

// Points (GitHub Contributions * 1 + LeetCode solved * 10)
// Active/inactive for both platforms comes only from real fetched
// timestamps (githubLastActiveDate / leetcodeLastActiveDate). No date is
// ever fabricated here — a student with no confirmed activity in the
// last 10 days, or whose account was never successfully verified, shows
// as inactive/unverified rather than being guessed into "active".
function recalculateScores() {
  state.students = state.students.map(s => {
    // GitHub points = active days × 10, on every window — no exceptions.
    // "Overall" = active days this calendar year (Jan 1 → today). LeetCode
    // "Overall" is true lifetime solved — the free LeetCode APIs don't
    // expose a per-year breakdown, so an exact "this year" figure isn't
    // available there without faking it.
    const githubScore = (s.githubContributions || 0) * 10;
    const leetcodeScore = (s.leetcodeSolved || 0) * 10;

    const isActiveGithub = !!s.github && daysSince(s.githubLastActiveDate) <= 10;
    const isActiveLeetcode = !!s.leetcode && daysSince(s.leetcodeLastActiveDate) <= 10;
    const isRecentGithub30 = !!s.github && daysSince(s.githubLastActiveDate) <= 30;
    const isRecentLeetcode30 = !!s.leetcode && daysSince(s.leetcodeLastActiveDate) <= 30;

    // Combined 3-state Activity Status, independent of whichever ranking
    // window (Overall/This Month/Last 30 Days) is currently selected —
    // it always reflects the latest 30 days only, per spec:
    //   green  = either platform active within last 10 days
    //   yellow = not within 10 days, but either platform active within 30
    //   grey   = no activity on either platform within the last 30 days
    let activityStatus = 'grey';
    if (isActiveGithub || isActiveLeetcode) activityStatus = 'green';
    else if (isRecentGithub30 || isRecentLeetcode30) activityStatus = 'yellow';

    // Three real windows, all from the fetched daily calendar — independent
    // of the strict 10-day "Active" badge, which only controls that badge,
    // not any of these three point totals.
    const contributionsLast30 = s.githubContributionsMonth || 0;
    const contributionsCalendarMonth = s.githubContributionsCalendarMonth || 0;
    // LeetCode's calendar counts every SUBMISSION (including wrong answers
    // and resubmissions of an already-solved problem), not distinct new
    // problems — so a raw sum can otherwise show more "solved this month"
    // than the person has ever solved in their life, which is impossible
    // and confusing. Clamp both windows to the real lifetime distinct-
    // solved count as a hard ceiling.
    const solvedLast30 = Math.min(s.leetcodeSolvedMonth || 0, s.leetcodeSolved || 0);
    const solvedCalendarMonth = Math.min(s.leetcodeSolvedCalendarMonth || 0, s.leetcodeSolved || 0);

    // 10 points per active day on either platform — same scale both sides.
    const scoreLast30 = (contributionsLast30 * 10) + (solvedLast30 * 10);
    const scoreCalendarMonth = (contributionsCalendarMonth * 10) + (solvedCalendarMonth * 10);

    return {
      ...s,
      score: githubScore + leetcodeScore,
      scoreMonth: scoreLast30, // kept for backward compatibility — "Last 30 Days"
      scoreLast30Days: scoreLast30,
      scoreCalendarMonth: scoreCalendarMonth,
      githubContributionsMonth: contributionsLast30,
      githubContributionsCalendarMonth: contributionsCalendarMonth,
      leetcodeSolvedMonth: solvedLast30,
      leetcodeSolvedCalendarMonth: solvedCalendarMonth,
      // "active" (green vs not) is kept for backward compatibility with
      // existing filters — activityStatus is the real 3-state field.
      active: isActiveGithub || isActiveLeetcode,
      activityStatus,
      leetcodeActive: isActiveLeetcode,
      githubActive: isActiveGithub
    };
  });
}

function saveCurrentState() {
  recalculateScores();
  
  // Local flags sync
  safeSetItem('alameen_following_list', JSON.stringify(state.followingList || []));

  if (state.dbMode === 'supabase' && state.supabaseClient) {
    syncToSupabase();
  } else {
    saveStudents(state.students);
    saveNotifications(state.notifications);
    saveDepartments(state.departments);
    saveChats(state.chats);
    saveVolunteers(state.volunteers);
    savePolls(state.polls);
    saveCourses(state.courses);
    syncStudentsAndPollsToCloud(); // push to Firestore too, not just localStorage
  }
}

async function syncToSupabase() {
  try {
    for (const student of state.students) {
      await state.supabaseClient.from('students').upsert(student);
    }
    for (const notif of state.notifications) {
      await state.supabaseClient.from('notifications').upsert(notif);
    }
    await state.supabaseClient.from('departments').delete().neq('name', '');
    for (const dept of state.departments) {
      await state.supabaseClient.from('departments').insert({ name: dept });
    }
    for (const chat of state.chats) {
      await state.supabaseClient.from('chats').upsert(chat);
    }
    await state.supabaseClient.from('volunteers').delete().neq('name', '');
    for (const vol of state.volunteers) {
      await state.supabaseClient.from('volunteers').insert(vol);
    }
    await state.supabaseClient.from('polls').delete().neq('id', '');
    for (const poll of state.polls) {
      await state.supabaseClient.from('polls').upsert(poll);
    }
    await state.supabaseClient.from('courses').delete().neq('id', '');
    for (const course of state.courses) {
      await state.supabaseClient.from('courses').upsert(course);
    }
  } catch (err) {
    console.error('Supabase write failure:', err);
  }
}

// Populate Filters Options
function populateFilterOptions() {
  const deptSelect = document.getElementById('filter-dept');
  const yearSelect = document.getElementById('filter-year');

  deptSelect.innerHTML = '<option value="ALL">All Departments</option>';
  yearSelect.innerHTML = '<option value="ALL">All Years</option>';

  const signupDept = document.getElementById('signup-dept');
  const signupYear = document.getElementById('signup-year');
  signupDept.innerHTML = '';
  signupYear.innerHTML = '';

  const leadDept = document.getElementById('leaderboard-filter-dept');
  const leadYear = document.getElementById('leaderboard-filter-year');
  leadDept.innerHTML = '<option value="ALL">Overall Departments</option>';
  leadYear.innerHTML = '<option value="ALL">Overall Years</option>';

  state.departments.forEach(dept => {
    const opt1 = document.createElement('option');
    opt1.value = dept; opt1.textContent = dept;
    deptSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = dept; opt2.textContent = dept;
    signupDept.appendChild(opt2);

    const opt3 = document.createElement('option');
    opt3.value = dept; opt3.textContent = dept;
    leadDept.appendChild(opt3);
  });

  const volDeptFilter = document.getElementById('vol-filter-dept');
  const volYearFilter = document.getElementById('vol-filter-year');
  if (volDeptFilter && volYearFilter) {
    volDeptFilter.innerHTML = '<option value="">All Departments</option>';
    volYearFilter.innerHTML = '<option value="">All Years</option>';
    state.departments.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept; opt.textContent = dept;
      volDeptFilter.appendChild(opt);
    });
    YEARS.forEach(yr => {
      const opt = document.createElement('option');
      // Matches the "3rd CSE" style prefix stored on approved volunteers —
      // just the leading ordinal word ("3rd"), not the full year string.
      opt.value = yr.split(' ')[0];
      opt.textContent = yr;
      volYearFilter.appendChild(opt);
    });
  }

  YEARS.forEach(yr => {
    const opt1 = document.createElement('option');
    opt1.value = yr; opt1.textContent = yr;
    yearSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = yr; opt2.textContent = yr;
    signupYear.appendChild(opt2);

    const opt3 = document.createElement('option');
    opt3.value = yr; opt3.textContent = yr;
    leadYear.appendChild(opt3);
  });

  const specDept = document.getElementById('spectator-search-dept');
  const specYear = document.getElementById('spectator-search-year');
  if (specDept && specYear) {
    specDept.innerHTML = '';
    specYear.innerHTML = '';
    state.departments.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept; opt.textContent = dept;
      specDept.appendChild(opt);
    });
    YEARS.forEach(yr => {
      const opt = document.createElement('option');
      opt.value = yr; opt.textContent = yr;
      specYear.appendChild(opt);
    });
  }
}

// Set Event Listeners
function setupEventListeners() {
  const tabTriggers = [...document.querySelectorAll('#desktop-tabs .tab-btn'), ...document.querySelectorAll('#mobile-navigation .mobile-nav-item')];
  
  tabTriggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const targetId = trigger.getAttribute('data-target');
      switchTab(targetId);
    });
  });

  // Emails are matched case-insensitively everywhere else in this file
  // (sign-in, admin lookup, session restore), but the raw typed value is
  // what actually gets stored on the student record and sent to Firebase
  // Auth. Forcing it lowercase as-typed keeps the stored value consistent
  // with every comparison already made against it, instead of relying on
  // every future comparison remembering to call .toLowerCase() itself.
  const signupEmailInput = document.getElementById('signup-email');
  if (signupEmailInput) {
    signupEmailInput.addEventListener('input', () => {
      const cursorPos = signupEmailInput.selectionStart;
      signupEmailInput.value = signupEmailInput.value.toLowerCase();
      signupEmailInput.setSelectionRange(cursorPos, cursorPos);
    });
  }

  // Filters
  document.getElementById('filter-search').addEventListener('input', renderDirectoryList);
  document.getElementById('filter-dept').addEventListener('change', renderDirectoryList);
  document.getElementById('filter-year').addEventListener('change', renderDirectoryList);
  document.getElementById('filter-status').addEventListener('change', renderDirectoryList);
  const filterTimeWindowEl = document.getElementById('filter-time-window');
  if (filterTimeWindowEl) filterTimeWindowEl.addEventListener('change', renderDirectoryList);

  document.getElementById('leaderboard-filter-time').addEventListener('change', renderLeaderboard);
  document.getElementById('leaderboard-filter-dept').addEventListener('change', renderLeaderboard);
  document.getElementById('leaderboard-filter-year').addEventListener('change', renderLeaderboard);

  const volSearchEl = document.getElementById('vol-search-input');
  const volDeptEl = document.getElementById('vol-filter-dept');
  const volYearEl = document.getElementById('vol-filter-year');
  if (volSearchEl) volSearchEl.addEventListener('input', renderVolunteersList);
  if (volDeptEl) volDeptEl.addEventListener('change', renderVolunteersList);
  if (volYearEl) volYearEl.addEventListener('change', renderVolunteersList);



  document.getElementById('chart-filter-year').addEventListener('change', renderCharts);
  const chartTimeWindowEl = document.getElementById('chart-filter-time-window');
  if (chartTimeWindowEl) chartTimeWindowEl.addEventListener('change', renderCharts);

  const broadcastAttachmentTrigger = document.getElementById('btn-broadcast-attachment-trigger');
  if (broadcastAttachmentTrigger) {
    broadcastAttachmentTrigger.addEventListener('click', () => {
      const fileInput = document.getElementById('broadcast-attachment');
      if (fileInput) fileInput.click();
    });
  }

  // Custom dialog buttons
  document.getElementById('btn-custom-dialog-confirm').addEventListener('click', () => {
    const isPrompt = !document.getElementById('custom-dialog-input-container').classList.contains('d-none');
    const value = document.getElementById('custom-dialog-text-input').value.trim();
    closeModal('modal-custom-dialog');
    if (window.customDialogCallbacks && window.customDialogCallbacks.onConfirm) {
      window.customDialogCallbacks.onConfirm(isPrompt ? value : true);
    }
  });

  document.getElementById('btn-custom-dialog-cancel').addEventListener('click', () => {
    closeModal('modal-custom-dialog');
    if (window.customDialogCallbacks && window.customDialogCallbacks.onCancel) {
      window.customDialogCallbacks.onCancel();
    }
  });
  // Hamburger Menu Drawer Toggles
  const mobileMenuBtn = document.getElementById('btn-mobile-menu');
  const navTabsContainer = document.getElementById('desktop-tabs');
  const drawerOverlay = document.getElementById('mobile-drawer-overlay');

  if (mobileMenuBtn && navTabsContainer && drawerOverlay) {
    mobileMenuBtn.addEventListener('click', () => {
      navTabsContainer.classList.toggle('active');
      drawerOverlay.classList.toggle('active');
    });

    drawerOverlay.addEventListener('click', () => {
      navTabsContainer.classList.remove('active');
      drawerOverlay.classList.remove('active');
    });

    // Close mobile drawer when any tab button is clicked
    navTabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navTabsContainer.classList.remove('active');
        drawerOverlay.classList.remove('active');
      });
    });
  }

  // Login
  document.getElementById('btn-login-trigger').addEventListener('click', () => {
    showAuthScreen('auth-step-signin');
    openModal('modal-auth');
  });
  document.getElementById('btn-profile-signin').addEventListener('click', () => {
    showAuthScreen('auth-step-signin');
    openModal('modal-auth');
  });
  document.getElementById('btn-close-auth').addEventListener('click', () => closeModal('modal-auth'));
  document.getElementById('btn-close-signup').addEventListener('click', () => closeModal('modal-auth'));
  document.getElementById('btn-close-profile-details').addEventListener('click', () => closeModal('modal-student-profile-details'));
  document.getElementById('btn-close-profile-details-footer').addEventListener('click', () => closeModal('modal-student-profile-details'));
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('auth-trigger-signup').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthScreen('auth-step-signup');
  });
  document.getElementById('auth-trigger-signin').addEventListener('click', (e) => {
    e.preventDefault();
    showAuthScreen('auth-step-signin');
  });

  document.getElementById('auth-signin-form').addEventListener('submit', handleSignInEmail);
  document.getElementById('auth-signup-form').addEventListener('submit', handleSignUpSubmit);
  setupSignupLiveValidation();
  document.getElementById('auth-otp-form').addEventListener('submit', handleOtpSubmit);
  document.getElementById('btn-back-auth-step').addEventListener('click', () => {
    showAuthScreen('auth-step-signin');
  });

  const otpInputs = document.querySelectorAll('.otp-input');
  otpInputs.forEach((inp, idx) => {
    inp.addEventListener('input', (e) => {
      if (e.target.value.length === 1 && idx < otpInputs.length - 1) {
        otpInputs[idx + 1].focus();
      }
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        otpInputs[idx - 1].focus();
      }
    });
  });

  const btnViewMem = document.getElementById('btn-view-member');
  const btnViewAdm = document.getElementById('btn-view-admin');
  if (btnViewMem) btnViewMem.addEventListener('click', () => switchViewMode('member'));
  if (btnViewAdm) btnViewAdm.addEventListener('click', () => switchViewMode('admin'));

  // Profile forms
  document.getElementById('profile-handles-form').addEventListener('submit', handleProfileUpdate);
  const photoInput = document.getElementById('profile-photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', handleProfilePhotoUpload);
  }
  // PDF CV upload
  const dropzone = document.getElementById('cv-dropzone');
  const fileInput = document.getElementById('cv-file-input');
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleCvUpload);
  
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'var(--accent-orange)'; });
  dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'var(--border-color)'; });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-color)';
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      handleCvUpload();
    }
  });

  document.getElementById('announcement-broadcast-form').addEventListener('submit', handleAnnouncementSubmit);
  document.getElementById('btn-cancel-edit-notif').addEventListener('click', resetAnnouncementForm);
  document.getElementById('broadcast-has-link').addEventListener('change', (e) => {
    document.getElementById('broadcast-link-fields').classList.toggle('d-none', !e.target.checked);
  });
  document.getElementById('broadcast-link-url').addEventListener('blur', () => validateBroadcastLinkUrl());
  document.getElementById('broadcast-link-url').addEventListener('input', () => {
    const errEl = document.getElementById('err-broadcast-link-url');
    if (errEl && errEl.classList.contains('active')) validateBroadcastLinkUrl();
  });

  document.getElementById('poll-broadcast-form').addEventListener('submit', handlePollSubmit);
  document.getElementById('btn-cancel-edit-poll').addEventListener('click', resetPollForm);
  document.getElementById('btn-add-poll-option').addEventListener('click', () => addPollOptionRow());

  document.getElementById('course-form').addEventListener('submit', handleCourseSubmit);
  document.getElementById('btn-cancel-edit-course').addEventListener('click', resetCourseForm);
  document.getElementById('btn-fetch-course-info').addEventListener('click', fetchCourseInfo);
  document.getElementById('course-filter-platform').addEventListener('change', renderCoursesBrowse);
  document.getElementById('course-filter-category').addEventListener('change', renderCoursesBrowse);

  document.getElementById('btn-add-certification').addEventListener('click', () => {
    resetCertificationForm();
    openModal('modal-add-certification');
  });
  document.getElementById('btn-fetch-cert-info').addEventListener('click', fetchCertificationInfo);
  document.getElementById('certification-form').addEventListener('submit', handleCertificationSubmit);
  ['cert-name', 'cert-id', 'cert-platform'].forEach((id) => {
    document.getElementById(id).addEventListener('input', updateCertificationSubmitState);
  });
  document.getElementById('cert-url').addEventListener('input', () => {
    // Editing the URL after a fetch invalidates the confirmed details until re-fetched.
    document.getElementById('cert-fetched-fields').classList.add('d-none');
    updateCertificationSubmitState();
  });

  document.getElementById('dept-add-form').addEventListener('submit', handleAddDepartment);
  const volAddForm = document.getElementById('volunteer-add-form');
  if (volAddForm) {
    volAddForm.addEventListener('submit', handleAddVolunteer);
  }

  const volSelectStudent = document.getElementById('volunteer-add-select-student');
  if (volSelectStudent) {
    volSelectStudent.addEventListener('change', (e) => {
      const studentId = e.target.value;
      if (!studentId) {
        const addName = document.getElementById('volunteer-add-name');
        const addPhone = document.getElementById('volunteer-add-phone');
        if (addName) addName.value = '';
        if (addPhone) addPhone.value = '';
        return;
      }
      const student = state.students.find(s => s.id === studentId);
      if (student) {
        const addName = document.getElementById('volunteer-add-name');
        const addPhone = document.getElementById('volunteer-add-phone');
        if (addName) addName.value = student.name;
        if (addPhone) addPhone.value = student.phone || '';
        
        const yearPrefix = student.year.substring(0, 3);
        const cleanDept = student.dept;
        const targetVal = `${yearPrefix} Yr ${cleanDept}`;
        
        const selectDept = document.getElementById('volunteer-add-dept');
        if (selectDept && [...selectDept.options].some(opt => opt.value === targetVal)) {
          selectDept.value = targetVal;
        }
      }
    });
  }

  document.getElementById('btn-close-evaluate').addEventListener('click', () => closeModal('modal-evaluate'));
  document.getElementById('btn-cancel-evaluate').addEventListener('click', () => closeModal('modal-evaluate'));
  document.getElementById('btn-delete-student-record').addEventListener('click', deleteStudentRecord);
  document.getElementById('evaluation-form').addEventListener('submit', handleEvaluationSave);
  
  document.getElementById('btn-save-evaluate').addEventListener('click', () => {
    document.getElementById('evaluation-form').dispatchEvent(new Event('submit'));
  });

  document.getElementById('btn-goto-volunteers').addEventListener('click', () => switchTab('view-volunteers'));

  // Eye icon toggle for any password field
  document.querySelectorAll('.password-eye-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      btn.innerHTML = showing
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    });
  });

  // Export Excel listener
  document.getElementById('btn-export-excel').addEventListener('click', handleExportExcelDatabase);

  const btnResyncAll = document.getElementById('btn-force-resync-all');
  if (btnResyncAll) {
    btnResyncAll.addEventListener('click', async () => {
      btnResyncAll.disabled = true;
      const originalText = btnResyncAll.textContent;
      btnResyncAll.textContent = '⏳ Syncing...';
      showToast('⏳ Fetching real GitHub/LeetCode data for every student — this can take a moment...');
      try {
        const result = await window.__forceResyncAllStudents();
        if (result.changedCount > 0) {
          window.confirm(`✅ Re-sync complete.\n\n${result.changedCount} of ${result.total} students had different real numbers than what was shown:\n${result.changedNames.join(', ')}\n\n(Click OK or Cancel to close)`);
        } else {
          showToast(`Re-sync complete. All ${result.total} students already matched real data.`);
        }
      } finally {
        btnResyncAll.disabled = false;
        btnResyncAll.textContent = originalText;
      }
    });
  }

}

function showAuthScreen(stepId) {
  document.getElementById('auth-step-signin').classList.add('d-none');
  document.getElementById('auth-step-signup').classList.add('d-none');
  document.getElementById('auth-step-otp').classList.add('d-none');
  document.getElementById(stepId).classList.remove('d-none');

  if (stepId === 'auth-step-otp') {
    const isNewSignup = tempAuthUserObject && typeof tempAuthUserObject.id === 'string' && tempAuthUserObject.id.startsWith('student_');
    const heading = document.querySelector('#auth-step-otp h3');
    const helperText = document.querySelector('#auth-step-otp .kpi-subtext');
    if (heading) heading.textContent = isNewSignup ? 'Confirm Your Password' : 'Sign In Password';
    if (helperText) helperText.textContent = isNewSignup
      ? 'Re-enter the password you just created to confirm it.'
      : 'Enter your credentials password to authenticate.';
  }
}

// Tab Router Switcher
function switchTab(tabId) {
  if (tabId === 'view-admin-dashboard' || tabId === 'view-departments') {
    if (!state.loggedInUser || state.loggedInUser.role !== 'admin') {
      switchTab('view-about');
      return;
    }
    state.viewMode = 'admin';
  }

  state.currentTab = tabId;
  
  document.querySelectorAll('#desktop-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === tabId);
  });

  document.querySelectorAll('#mobile-navigation .mobile-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === tabId);
  });

  document.querySelectorAll('.tab-content').forEach(view => {
    view.classList.toggle('active', view.id === tabId);
  });

  if (tabId === 'view-about') {
    renderAdBanner();
  } else if (tabId === 'view-admin-dashboard') {
    renderKPIs();
    renderDirectoryList();
    setTimeout(renderCharts, 100);
    loadCertificationsFromCloud().then(() => {
      renderAdminCertificationsList();
      renderKPIs();
    });
    loadStudentsFromCloud().then(() => {
      renderKPIs();
      renderDirectoryList();
    });
  } else if (tabId === 'view-leaderboard') {
    renderLeaderboard();
    loadStudentsFromCloud().then(renderLeaderboard);
  } else if (tabId === 'view-volunteers') {
    renderVolunteersList();
    loadVolunteersFromCloud().then(renderVolunteersList);
  } else if (tabId === 'view-departments') {
    renderDepartmentList();
    loadStudentsFromCloud().then(renderDepartmentList);
    loadDepartmentsFromCloud().then(() => {
      populateFilterOptions();
      renderDepartmentList();
    });
  } else if (tabId === 'view-profile') {
    renderProfileView();
  } else if (tabId === 'view-announcements') {
    renderAnnouncementsList();
    // Opening this tab is what marks everything as read — record the
    // current time so any notification from before now stops lighting the
    // dot, even after a fresh page load pulls the same list back in again.
    safeSetItem('alameen_last_seen_notif_ts', Date.now().toString());
    document.getElementById('notif-badge-count').classList.add('d-none');
    loadPollsFromCloud().then(renderAnnouncementsList);
    loadNotificationsFromCloud().then(() => {
      renderAnnouncementsList();
      updateAnnouncementsBadge();
    });
  } else if (tabId === 'view-courses') {
    // Render immediately with whatever's cached so the tab isn't blank, then
    // requirement: always pull the latest courses from the shared database
    // whenever this section is opened, and re-render once that resolves.
    renderCoursesBrowse();
    if (state.viewMode === 'admin') renderCoursesManageList();
    loadCoursesFromCloud().then(() => {
      renderCoursesBrowse();
      if (state.viewMode === 'admin') renderCoursesManageList();
    });
  }
}

function switchViewMode(mode) {
  state.viewMode = mode;
  const btnMem = document.getElementById('btn-view-member');
  const btnAdm = document.getElementById('btn-view-admin');
  if (btnMem) btnMem.classList.toggle('active', mode === 'member');
  if (btnAdm) btnAdm.classList.toggle('active', mode === 'admin');

  const tabAbout = document.getElementById('tab-about-trigger');
  const tabAdmin = document.getElementById('tab-admin-trigger');
  const tabDepts = document.getElementById('tab-depts-trigger');

  const mobAbout = document.querySelector('#mobile-navigation [data-target="view-about"]');
  const mobAdmin = document.getElementById('mobile-admin-trigger');
  const mobDepts = document.getElementById('mobile-depts-trigger');

  document.getElementById('admin-broadcast-panel').classList.toggle('d-none', mode !== 'admin');
  const coursesPanel = document.getElementById('admin-courses-panel');
  if (coursesPanel) coursesPanel.classList.toggle('d-none', mode !== 'admin');
  document.getElementById('admin-dept-crud-controls').classList.toggle('d-none', mode !== 'admin');
  const volCrud = document.getElementById('admin-volunteer-crud-controls');
  if (volCrud) {
    volCrud.classList.toggle('d-none', mode !== 'admin');
  }

  if (mode === 'admin') {
    tabAdmin.classList.remove('d-none');
    tabDepts.classList.remove('d-none');
    tabAbout.classList.add('d-none');

    if (mobAdmin) mobAdmin.classList.remove('d-none');
    if (mobDepts) mobDepts.classList.remove('d-none');
    if (mobAbout) mobAbout.classList.add('d-none');

    if (state.currentTab === 'view-about') {
      state.currentTab = 'view-admin-dashboard';
    }
  } else {
    tabAdmin.classList.add('d-none');
    tabDepts.classList.add('d-none');
    tabAbout.classList.remove('d-none');

    if (mobAdmin) mobAdmin.classList.add('d-none');
    if (mobDepts) mobDepts.classList.add('d-none');
    if (mobAbout) mobAbout.classList.remove('d-none');

    if (state.currentTab === 'view-admin-dashboard' || state.currentTab === 'view-departments') {
      state.currentTab = 'view-about';
    }
  }

  const chatPanel = document.getElementById('chat-slide-panel');
  if (chatPanel) chatPanel.classList.remove('active');

  resetAnnouncementForm();
  renderApp();
}

function openModal(modalId) {
  const overlay = document.getElementById(modalId);
  overlay.classList.add('active');
}

function closeModal(modalId) {
  const overlay = document.getElementById(modalId);
  overlay.classList.remove('active');
}

// main.js is loaded as a module, so top-level functions are NOT global by
// default — inline onclick="closeModal(...)" in the HTML needs this to work.
window.closeModal = closeModal;
window.openModal = openModal;



// SignIn Handler
async function handleSignInEmail(e) {
  e.preventDefault();
  const email = document.getElementById('auth-signin-email').value.trim().toLowerCase();
  if (!email) return;

  tempAuthUserObject = {
    id: email === 'cse.developerclub@gmail.com' ? 'admin' : 'temp',
    email: email
  };

  // Reset password field
  const passField = document.getElementById('auth-signin-password');
  if (passField) passField.value = '';

  showAuthScreen('auth-step-otp');
}



// Days between now and an ISO date string. Returns Infinity if no date given.
function daysSince(isoDateStr) {
  if (!isoDateStr) return Infinity;
  const t = new Date(isoDateStr).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

// 3-tier activity dot: green = active in last 10 days, yellow = active
// 11-30 days ago, gray = 30+ days ago or no confirmed activity at all.
function getActivityTier(lastActiveDate) {
  const d = daysSince(lastActiveDate);
  if (d <= 10) {
    return { tier: 'active', color: '#22c55e', githubTitle: 'GitHub Active (pushed within 10 days)', leetcodeTitle: 'LeetCode Active (solved within 10 days)' };
  }
  if (d <= 30) {
    return { tier: 'moderate', color: '#eab308', githubTitle: 'GitHub used in the last month (11-30 days ago)', leetcodeTitle: 'LeetCode used in the last month (11-30 days ago)' };
  }
  return { tier: 'inactive', color: '#a1a1aa', githubTitle: 'GitHub Inactive (no pushes in 30+ days, or unverified)', leetcodeTitle: 'LeetCode Inactive (no submissions in 30+ days, or unverified)' };
}

// Real GitHub extraction only. No invented numbers on failure —
// verified:false means "could not confirm", shown as such in the UI.
// Tracks three separate figures per your request:
//   - contributionsThisYear: "Overall" = total active days this calendar year
//   - contributionsLast30Days: rolling last-30-day active-day count
//   - contributionsThisCalendarMonth: active days since the 1st of this month
async function fetchGithubStats(username) {
  const result = {
    contributions: 0, contributionsThisYear: 0, contributionsLast30Days: 0,
    contributionsThisCalendarMonth: 0, hasRealMonthly: false, lastActiveDate: '', verified: false, reasons: []
  };
  if (!username) return result;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const applyDailyBreakdown = (dailyEntries) => {
    result.contributionsLast30Days = 0;
    result.contributionsThisCalendarMonth = 0;
    result.contributionsThisYear = 0;
    for (const day of dailyEntries) {
      const t = new Date(day.date).getTime();
      if (Number.isNaN(t) || !((day.count || 0) > 0)) continue;
      const d = new Date(t);
      if (t >= cutoff30) result.contributionsLast30Days += 1;
      if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) result.contributionsThisCalendarMonth += 1;
      if (d.getFullYear() === currentYear) result.contributionsThisYear += 1;
    }
    result.hasRealMonthly = true;
  };

  // Primary source
  try {
    const contribRes = await fetch(`https://github-contributions.vercel.app/api/v1/${username}`);
    if (contribRes.ok) {
      const contribData = await contribRes.json();
      if (contribData && Array.isArray(contribData.years)) {
        result.contributions = contribData.years.reduce((sum, y) => sum + (y.total || 0), 0);
        result.verified = true;
      } else {
        result.reasons.push('Primary contributions API returned no usable data for this username.');
      }
      if (contribData && Array.isArray(contribData.contributions)) {
        applyDailyBreakdown(contribData.contributions);
      }
    } else {
      result.reasons.push(`Primary contributions API responded HTTP ${contribRes.status}.`);
    }
  } catch (err) {
    result.reasons.push(`Primary contributions API unreachable: ${err.message}`);
  }

  // Fallback source — used only if the primary above didn't give us
  // verified data or the daily breakdown. This is what fixes "GitHub
  // overall keeps coming back unverified" when the primary API is down,
  // since both the overall total and the monthly breakdown were depending
  // on that one single source before.
  if (!result.verified || !result.hasRealMonthly) {
    try {
      const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}`);
      if (res.ok) {
        const data = await res.json();
        if (!result.verified && data && data.total) {
          const years = Object.values(data.total).map(v => Number(v) || 0);
          result.contributions = years.reduce((sum, v) => sum + v, 0);
          result.verified = true;
        }
        if (!result.hasRealMonthly && data && Array.isArray(data.contributions)) {
          applyDailyBreakdown(data.contributions);
        }
      } else {
        result.reasons.push(`Fallback contributions API responded HTTP ${res.status}.`);
      }
    } catch (err) {
      result.reasons.push(`Fallback contributions API unreachable: ${err.message}`);
    }
  }

  try {
    const eventsRes = await fetch(`https://api.github.com/users/${username}/events`);
    if (eventsRes.ok) {
      const events = await eventsRes.json();
      if (events && events.length > 0) {
        result.lastActiveDate = events[0].created_at;
      } else {
        result.reasons.push('GitHub account exists but has no public recent activity.');
      }
    } else if (eventsRes.status === 404) {
      result.reasons.push(`GitHub username "${username}" was not found (404) — check for typos.`);
    } else {
      result.reasons.push(`GitHub events API responded HTTP ${eventsRes.status}.`);
    }
  } catch (err) {
    result.reasons.push(`GitHub events API unreachable: ${err.message}`);
  }

  return result;
}

// Real LeetCode extraction only. Also pulls submissionCalendar so we can
// compute an actual last-active date, same as GitHub. No invented numbers.
async function fetchLeetcodeStats(username) {
  const result = {
    solved: 0, solvedLast30: 0, solvedThisCalendarMonth: 0, solvedThisYear: 0,
    hasRealMonthly: false, lastActiveDate: '', verified: false, reasons: []
  };
  if (!username) return result;

  try {
    const res = await fetch(`https://leetcode-api-faisalshohag.vercel.app/${username}`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.totalSolved === 'number') {
        result.solved = data.totalSolved;
        result.verified = true;
      } else {
        result.reasons.push('leetcode-api-faisalshohag returned no totalSolved field for this username.');
      }
      if (data.submissionCalendar) {
        result.lastActiveDate = latestCalendarDate(data.submissionCalendar);
        const breakdown = sumLeetcodeSolvedBreakdown(data.submissionCalendar);
        result.solvedLast30 = breakdown.last30;
        result.solvedThisCalendarMonth = breakdown.thisCalendarMonth;
        result.solvedThisYear = breakdown.thisYear;
        result.hasRealMonthly = true;
      }
    } else {
      result.reasons.push(`leetcode-api-faisalshohag responded HTTP ${res.status} — username may not exist, or the free host is rate-limited.`);
    }
  } catch (err) {
    result.reasons.push(`leetcode-api-faisalshohag unreachable: ${err.message}`);
  }

  if (!result.verified) {
    try {
      const res = await fetch(`https://alfa-leetcode-api.onrender.com/${username}/solved`);
      if (res.ok) {
        const data = await res.json();
        const solved = data.solvedProblem ?? data.totalSolved;
        if (typeof solved === 'number') {
          result.solved = solved;
          result.verified = true;
        } else {
          result.reasons.push('alfa-leetcode-api returned no solved-count field for this username.');
        }
      } else {
        result.reasons.push(`alfa-leetcode-api responded HTTP ${res.status} — this free host sleeps when idle and can take 30-50s to wake up, try again shortly.`);
      }
    } catch (err) {
      result.reasons.push(`alfa-leetcode-api unreachable: ${err.message}`);
    }
  }

  if (!result.lastActiveDate || !result.hasRealMonthly) {
    try {
      const calRes = await fetch(`https://alfa-leetcode-api.onrender.com/${username}/calendar`);
      if (calRes.ok) {
        const calData = await calRes.json();
        const calendar = calData.submissionCalendar || calData;
        if (calendar) {
          result.lastActiveDate = result.lastActiveDate || latestCalendarDate(calendar);
          if (!result.hasRealMonthly) {
            const breakdown = sumLeetcodeSolvedBreakdown(calendar);
            result.solvedLast30 = breakdown.last30;
            result.solvedThisCalendarMonth = breakdown.thisCalendarMonth;
            result.solvedThisYear = breakdown.thisYear;
            result.hasRealMonthly = true;
          }
        }
      }
    } catch (err) {
      // Non-fatal for the solved count itself, so no reason pushed here.
    }
  }

  return result;
}

// submissionCalendar comes back as a JSON string (or object) of
// { "unixTimestampSeconds": submissionCount, ... }. Find the most recent
// day with a non-zero count and return it as an ISO date string.
function latestCalendarDate(calendar) {
  try {
    const obj = typeof calendar === 'string' ? JSON.parse(calendar) : calendar;
    let latestTs = 0;
    for (const [ts, count] of Object.entries(obj)) {
      if (Number(count) > 0 && Number(ts) > latestTs) latestTs = Number(ts);
    }
    return latestTs > 0 ? new Date(latestTs * 1000).toISOString() : '';
  } catch (err) {
    return '';
  }
}

// Counts real ACTIVE DAYS in the last 30 days from a LeetCode
// submissionCalendar ({ unixTimestampSeconds: count }) — same rule as
// GitHub: 1 day with any activity = 1 unit, not the raw submission count.
// This is what fixes the "monthly (4) is higher than overall solved (3)"
// confusion — a day-count can never realistically look like it's counting
// distinct problems, and it can't silently exceed 30.
// Sums real SUBMISSION counts from a LeetCode submissionCalendar
// ({ unixTimestampSeconds: count }) across three windows — "problems
// solved this window", per your explicit request. Honest caveat: this
// counts submissions, not verified-distinct new problems — the free
// LeetCode APIs only expose a submission calendar, not which specific
// problem each submission was for, so a resubmission of an already-solved
// problem would still count here. There's no way to get a truly
// distinct-new-problems-per-day figure from this data without a paid/
// official LeetCode API.
function sumLeetcodeSolvedBreakdown(calendar) {
  const out = { last30: 0, thisCalendarMonth: 0, thisYear: 0 };
  try {
    const obj = typeof calendar === 'string' ? JSON.parse(calendar) : calendar;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const cutoffSeconds = (Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000;
    for (const [ts, count] of Object.entries(obj)) {
      const c = Number(count) || 0;
      if (c <= 0) continue;
      const tsNum = Number(ts);
      if (tsNum >= cutoffSeconds) out.last30 += c;
      const d = new Date(tsNum * 1000);
      if (d.getFullYear() === currentYear) {
        out.thisYear += c;
        if (d.getMonth() === currentMonth) out.thisCalendarMonth += c;
      }
    }
  } catch (err) {
    // leave zeros
  }
  return out;
}

// --- Inline field-error helpers (small red line under a form-control,
// instead of a blocking alert()) ---
function showFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById('err-' + inputId);
  if (input) input.classList.add('is-invalid');
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.add('active');
  }
}

function clearFieldError(inputId) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById('err-' + inputId);
  if (input) input.classList.remove('is-invalid');
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('active');
  }
}

// Pure rule check — returns an error message string if invalid, or null if
// valid. No DOM side effects, so it's safe to call on every keystroke across
// every field (e.g. to decide whether the Register button should be enabled)
// without popping up warnings on fields the student hasn't touched yet.
function getSignupFieldError(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return null;
  const value = input.value.trim();

  if (inputId === 'signup-email') {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value)) {
      return 'Enter a valid email address (e.g. name@gmail.com).';
    }
    if (!value.toLowerCase().endsWith('@gmail.com')) {
      return 'Must be a Gmail address, ending with @gmail.com.';
    }
  } else if (inputId === 'signup-phone' || inputId === 'signup-whatsapp') {
    const digits = value.replace(/\D/g, '');
    const label = inputId === 'signup-phone' ? 'Mobile' : 'WhatsApp';
    if (digits.length !== 10) {
      return `${label} number must be exactly 10 digits.`;
    }
  } else if (inputId === 'signup-roll') {
    if (!/^\d+$/.test(value)) {
      return 'Register number must contain numbers only.';
    }
  } else if (inputId === 'signup-password') {
    if (value.length < 6) {
      return 'Password must be at least 6 characters.';
    }
  } else if (inputId === 'signup-confirm-password') {
    const password = document.getElementById('signup-password').value;
    if (value !== password) {
      return "Doesn't match the password above.";
    }
  } else if (inputId === 'signup-github') {
    if (value) {
      const githubPattern = /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/?$/i;
      if (!githubPattern.test(value)) {
        return 'Must be a real GitHub profile link, e.g. https://github.com/username — not a username or plain text.';
      }
    }
  } else if (inputId === 'signup-leetcode') {
    if (value) {
      const leetcodePattern = /^https?:\/\/(www\.)?leetcode\.com\/(u\/)?[A-Za-z0-9_-]+\/?$/i;
      if (!leetcodePattern.test(value)) {
        return 'Must be a real LeetCode profile link, e.g. https://leetcode.com/u/username/ — not a username or plain text.';
      }
    }
  } else if (inputId === 'signup-linkedin') {
    if (value) {
      const linkedinPattern = /^https?:\/\/(www\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?$/i;
      if (!linkedinPattern.test(value)) {
        return 'Must be a real LinkedIn profile link, e.g. https://www.linkedin.com/in/username — not a username or plain text.';
      }
    }
  }

  return null;
}

// Runs one field's rule and reflects it inline (shows/clears the small red
// line below the field). Returns true if valid. Has DOM side effects, so
// only call this for a field the student has actually interacted with
// (blur, or input once an error is already showing) — see
// setupSignupLiveValidation below.
function validateSignupField(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return true;
  const error = getSignupFieldError(inputId);

  if (error) {
    showFieldError(inputId, error);
    return false;
  }

  clearFieldError(inputId);

  // Re-check confirm-password now that the primary password changed, since
  // its validity depends on this field's value too.
  if (inputId === 'signup-password') {
    const confirmEl = document.getElementById('signup-confirm-password');
    if (confirmEl && confirmEl.value) validateSignupField('signup-confirm-password');
  }

  return true;
}

// True only when every required signup field currently passes validation.
// Purely reads values via getSignupFieldError — never shows/clears inline
// warnings itself, so it's safe to run on every keystroke to keep the
// Register button's disabled state in sync without surprising the student
// with errors on fields they haven't reached yet.
function isSignupFormValid() {
  const requiredIds = ['signup-name', 'signup-roll', 'signup-dept', 'signup-year', 'signup-email', 'signup-password', 'signup-confirm-password', 'signup-phone', 'signup-whatsapp'];
  const optionalLinkIds = ['signup-github', 'signup-leetcode', 'signup-linkedin'];

  for (const id of requiredIds) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) return false;
  }
  for (const id of [...requiredIds, ...optionalLinkIds]) {
    if (getSignupFieldError(id)) return false;
  }
  return true;
}

function updateSignupSubmitState() {
  const btn = document.querySelector('#auth-signup-form button[type="submit"]');
  if (btn) btn.disabled = !isSignupFormValid();
}

// Wires live validation + input restrictions on the signup form. Called once
// during app init (see setupEventListeners).
function setupSignupLiveValidation() {
  // Name: force UPPERCASE as the student types (e.g. "irfan ahmed" -> "IRFAN AHMED").
  const nameInput = document.getElementById('signup-name');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      const cursorPos = nameInput.selectionStart;
      const upper = nameInput.value.toUpperCase();
      if (upper !== nameInput.value) {
        nameInput.value = upper;
        nameInput.selectionStart = nameInput.selectionEnd = cursorPos;
      }
      updateSignupSubmitState();
    });
  }

  // Mobile / WhatsApp / Register Number: strip anything that isn't a digit
  // as the student types, so these fields can never end up holding letters
  // or symbols.
  ['signup-phone', 'signup-whatsapp', 'signup-roll'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const maxLen = id === 'signup-roll' ? 20 : 10;
    el.addEventListener('input', () => {
      const digitsOnly = el.value.replace(/\D/g, '').slice(0, maxLen);
      if (digitsOnly !== el.value) el.value = digitsOnly;
      validateSignupField(id);
      updateSignupSubmitState();
    });
    el.addEventListener('blur', () => validateSignupField(id));
  });

  // Everything else: validate on blur (once they leave the field) and
  // again on input once an error is already showing (so it clears live).
  ['signup-email', 'signup-password', 'signup-confirm-password', 'signup-github', 'signup-leetcode', 'signup-linkedin'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('blur', () => validateSignupField(id));
    el.addEventListener('input', () => {
      const errEl = document.getElementById('err-' + id);
      if (errEl && errEl.classList.contains('active')) validateSignupField(id);
      updateSignupSubmitState();
    });
  });

  // Dept / Year: no format rule beyond "not empty", but they still
  // affect whether the Register button should be enabled.
  ['signup-dept', 'signup-year'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', updateSignupSubmitState);
    el.addEventListener('change', updateSignupSubmitState);
  });

  updateSignupSubmitState();
}

// SignUp crawler animations
function handleSignUpSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('signup-name').value.trim();
  const roll = document.getElementById('signup-roll').value.trim();
  const dept = document.getElementById('signup-dept').value;
  const year = document.getElementById('signup-year').value;
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const whatsapp = document.getElementById('signup-whatsapp').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirmPassword = document.getElementById('signup-confirm-password').value;
  
  const rawGithub = document.getElementById('signup-github').value.trim();
  const rawLeetcode = document.getElementById('signup-leetcode').value.trim();
  const rawLinkedin = document.getElementById('signup-linkedin').value.trim();

  // --- Validation: run every field's inline check; if any fail, show
  // the small red line(s) below the field(s), focus the first bad one,
  // and stop — no blocking alert() popups. ---
  const fieldsToCheck = ['signup-email', 'signup-phone', 'signup-whatsapp', 'signup-password', 'signup-confirm-password', 'signup-github', 'signup-leetcode', 'signup-linkedin'];
  let firstInvalidId = null;
  fieldsToCheck.forEach((id) => {
    const ok = validateSignupField(id);
    if (!ok && !firstInvalidId) firstInvalidId = id;
  });
  if (firstInvalidId) {
    document.getElementById(firstInvalidId).focus();
    return;
  }

  const github = extractUsername(rawGithub, 'github.com');
  const leetcode = extractUsername(rawLeetcode, 'leetcode.com');
  const linkedin = extractUsername(rawLinkedin, 'linkedin.com');

  if (state.students.some(s => s.roll === roll)) {
    alert('This register roll number is already registered.');
    return;
  }
  // Check for a duplicate email up front, before running the GitHub/LeetCode
  // crawler animation — no reason to make someone wait through that only to
  // find out at the very end (Firebase would reject it anyway with
  // email-already-in-use, but catching it here is instant and clearer).
  if (state.students.some(s => s.email && s.email.toLowerCase() === email.toLowerCase())) {
    alert('That email is already registered. Try signing in instead.');
    return;
  }

  const crawler = document.getElementById('crawler-overlay');
  const status = document.getElementById('crawler-status-message');
  const bar = document.getElementById('crawler-progress-bar');

  closeModal('modal-auth');
  crawler.classList.add('active');
  status.textContent = '[Connecting to GitHub API...]';
  bar.style.width = '10%';

  (async () => {
    status.textContent = `[Connecting to GitHub API for ${github || '—'}...]`;
    bar.style.width = '35%';
    const githubStats = await fetchGithubStats(github);

    status.textContent = `[Connecting to LeetCode API for ${leetcode || '—'}...]`;
    bar.style.width = '75%';
    const leetcodeStats = await fetchLeetcodeStats(leetcode);

    status.textContent = '[Recalculating club leaderboard status...]';
    bar.style.width = '100%';

    setTimeout(() => {
      crawler.classList.remove('active');
      
      tempAuthUserObject = {
        id: `student_${Date.now()}`,
        name,
        roll,
        dept,
        year,
        phone,
        whatsapp,
        active: true,
        github,
        leetcode,
        linkedin,
        githubContributions: githubStats.hasRealMonthly ? githubStats.contributionsThisYear : githubStats.contributions,
        githubContributionsMonth: githubStats.hasRealMonthly ? githubStats.contributionsLast30Days : 0,
        githubContributionsCalendarMonth: githubStats.hasRealMonthly ? githubStats.contributionsThisCalendarMonth : 0,
        githubVerified: githubStats.verified,
        githubLastActiveDate: githubStats.lastActiveDate,
        leetcodeSolved: leetcodeStats.solved,
        leetcodeSolvedMonth: leetcodeStats.hasRealMonthly ? leetcodeStats.solvedLast30 : 0,
        leetcodeSolvedCalendarMonth: leetcodeStats.hasRealMonthly ? leetcodeStats.solvedThisCalendarMonth : 0,
        leetcodeVerified: leetcodeStats.verified,
        leetcodeLastActiveDate: leetcodeStats.lastActiveDate,
        cvUrl: '',
        cvStatus: 'Pending',
        cvFeedback: 'Create and upload your PDF CV for review.',
        role: 'student',
        email: email,
        password: password || '123456'
      };

      // Password is already confirmed on the signup form itself now, so
      // go straight to creating the real Firebase account instead of
      // asking for the password a third time on another screen.
      (async () => {
        const result = await firebaseSignUp(email, password);
        if (!result.success) {
          alert(result.error);
          openModal('modal-auth');
          showAuthScreen('auth-step-signup');
          return;
        }

        const newStudent = { ...tempAuthUserObject };
        delete newStudent.password; // Firebase owns the password now, never store it ourselves

        state.students.push(newStudent);
        saveCurrentState();
        // saveCurrentState() fires the Firestore sync without awaiting it
        // (that's normally fine — the local save already happened). But
        // signing out immediately after, before that write actually reaches
        // Firestore, can invalidate the auth context the write needs to
        // pass the "request.auth != null" security rule — silently losing
        // the new student from the cloud even though it saved locally.
        // Awaiting it explicitly here, before signing out, closes that gap.
        await syncStudentsAndPollsToCloud();

        // createUserWithEmailAndPassword() auto-signs the new account in,
        // but sign-in elsewhere in this app requires a verified email
        // (see the emailVerified check in the sign-in flow) — logging them
        // straight into a full session here, before verifying, would be
        // inconsistent with that rule and just get reverted on the next
        // refresh anyway. Signing back out and sending them to the sign-in
        // screen instead makes "verify, then sign in" the one consistent
        // path, matching what actually happens if they refresh.
        if (firebaseAuth) {
          try { await firebaseSignOutFn(firebaseAuth); } catch (e) { /* ignore */ }
        }
        openModal('modal-auth');
        showAuthScreen('auth-step-signin');
        // Pre-fill the email so the only thing left to type is the
        // password — no reason to make them retype what they just entered.
        const signinEmailField = document.getElementById('auth-signin-email');
        if (signinEmailField) signinEmailField.value = email;
        showToast('Account created!');
        alert(`Almost done!\n\n1. Open your email inbox (${email})\n2. Click the verification link we just sent\n3. Come back here and sign in with your password`);
      })();
    }, 800);
  })();
}

async function handleOtpSubmit(e) {
  e.preventDefault();
  const password = document.getElementById('auth-signin-password').value.trim();
  const email = tempAuthUserObject.email.toLowerCase();
  const isNewSignup = typeof tempAuthUserObject.id === 'string' && tempAuthUserObject.id.startsWith('student_');

  const submitBtn = document.getElementById('auth-otp-submit-btn');
  const originalBtnText = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Verifying...';
  }

  try {
    await handleOtpSubmitInner(email, password, isNewSignup);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
}

async function handleOtpSubmitInner(email, password, isNewSignup) {
  // ---- NEW SIGNUP: create the real Firebase account, then save the profile ----
  if (isNewSignup) {
    if (password !== tempAuthUserObject.password) {
      alert("Passwords don't match. Please re-enter the password you created.");
      return;
    }

    const result = await firebaseSignUp(email, tempAuthUserObject.password);
    if (!result.success) {
      alert(result.error);
      return;
    }

    const newStudent = { ...tempAuthUserObject };
    delete newStudent.password; // Firebase owns the password now, never store it ourselves

    state.students.push(newStudent);
    saveCurrentState();
    await syncStudentsAndPollsToCloud(); // see comment on the main signup path — must finish before sign-out below

    // Same consistency fix as the main signup path above: don't grant a
    // logged-in session before the email is verified, since sign-in
    // elsewhere requires it.
    if (firebaseAuth) {
      try { await firebaseSignOutFn(firebaseAuth); } catch (e) { /* ignore */ }
    }
    closeModal('modal-auth');
    openModal('modal-auth');
    showAuthScreen('auth-step-signin');
    const signinEmailField2 = document.getElementById('auth-signin-email');
    if (signinEmailField2) signinEmailField2.value = email;
    showToast('Account created!');
    alert(`Almost done!\n\n1. Open your email inbox (${email})\n2. Click the verification link we just sent\n3. Come back here and sign in with your password`);
    return;
  }

  // ---- SIGN IN: verify against Firebase, not local/plaintext data ----
  const result = await firebaseSignIn(email, password);
  if (!result.success) {
    alert(result.error);
    return;
  }

  // The admin account is created manually in the Firebase Console, not
  // through the public signup form, so it never gets a verification email.
  // Exempt only this one address from the verified-email gate.
  const isAdminEmail = email === 'cse.developerclub@gmail.com';

  if (!isAdminEmail && !result.user.emailVerified) {
    await firebaseSignOutFn(firebaseAuth);
    const resend = confirm("Please verify your email before signing in. Check your inbox for the link.\n\nClick OK to resend the verification email.");
    if (resend) {
      // Need to sign in again briefly to resend, since resend requires a current user
      const retry = await firebaseSignIn(email, password);
      if (retry.success) {
        await firebaseResendVerification();
        await firebaseSignOutFn(firebaseAuth);
        showToast("Verification email resent.");
      }
    }
    return;
  }

  // Admin: special-cased by email, password itself is now fully owned by Firebase
  if (email === 'cse.developerclub@gmail.com') {
    const matchedAdmin = {
      id: 'admin',
      name: 'Admin',
      roll: 'ADMIN_CSE',
      dept: 'CSE',
      year: '4th Year',
      role: 'admin',
      email: 'cse.developerclub@gmail.com',
      phone: '+91 94420 12345',
      about: 'Al-Ameen Engineering College Developer Club Admin.'
    };

    // Automatically register the Admin as a Student Profile if not present
    if (!state.students.some(s => s.id === 'admin')) {
      state.students.push({
        id: 'admin',
        name: 'Admin',
        roll: 'ADMIN_CSE',
        dept: 'CSE',
        year: '4th Year',
        active: true,
        github: '',
        leetcode: '',
        linkedin: '',
        phone: '+91 94420 12345',
        githubContributions: 0,
        leetcodeSolved: 0,
        cvUrl: '',
        cvStatus: 'Approved',
        cvFeedback: 'System Administrator Account',
        about: 'Al-Ameen Engineering College Developer Club Admin.'
      });
    }

    // Automatically register the Admin as a Volunteer if not present
    if (!state.volunteers.some(v => v.name === 'Admin')) {
      state.volunteers.push({
        id: 'vol_admin',
        name: 'Admin',
        role: 'Developer Club Administrator',
        dept: '4th Yr CSE',
        phone: '+91 94420 12345',
        whatsapp: '9442012345',
        linkedin: ''
      });
    }

    state.loggedInUser = matchedAdmin;
    saveCurrentState();
    closeModal('modal-auth');
    renderApp();
    showToast("Signed in successfully.");
    return;
  }

  // Student sign-in: Firebase already confirmed the password, just find/link the local profile
  let matchedStudent = state.students.find(s => s.email && s.email.toLowerCase() === email);

  if (!matchedStudent) {
    const matchedRoll = await window.showCustomPrompt("Link Account", "No profile found for this email yet. Enter your student register/roll number to link your details:");
    if (matchedRoll) {
      const matchByRoll = state.students.find(s => s.roll === matchedRoll.trim());
      if (matchByRoll) {
        matchByRoll.email = email;
        matchedStudent = matchByRoll;
      }
    }
  }

  if (matchedStudent) {
    delete matchedStudent.password; // clean up any old plaintext password left over from before Firebase
    state.loggedInUser = { ...matchedStudent, role: 'student' };
    saveCurrentState();
    closeModal('modal-auth');
    renderApp();
    showToast(`Welcome back, ${state.loggedInUser.name}.`);
  } else {
    alert("Signed in, but no matching student profile was found. Please contact the admin to link your roll number.");
    await firebaseSignOutFn(firebaseAuth);
  }
}

function handleLogout() {
  state.loggedInUser = null;
  switchViewMode('member');
  renderApp();
  if (firebaseAuth) firebaseSignOutFn(firebaseAuth).catch(() => {});
}

// ---- Session restore on page load/refresh ----
// Firebase itself already keeps the user signed in across a refresh (it
// persists to IndexedDB) — but state.loggedInUser is a plain in-memory JS
// variable that resets to null every time this script re-runs. Without
// this, Firebase silently stays signed in while the UI acts fully logged
// out after every refresh: the homepage shows, the login button reappears,
// and the admin/student dashboard is gone until signing in again. This
// waits for Firebase's one-time "here's who's currently signed in" report
// and rebuilds state.loggedInUser from it, using the exact same
// admin/student matching rules as a normal sign-in.
function waitForInitialFirebaseUser() {
  return new Promise((resolve) => {
    if (!firebaseAuth) { resolve(null); return; }
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      unsubscribe();
      resolve(user);
    }, () => resolve(null));
  });
}

function restoreSessionFromFirebaseUser(user) {
  if (!user || state.loggedInUser) return;

  const email = (user.email || '').toLowerCase();
  const isAdminEmail = email === 'cse.developerclub@gmail.com';

  // Same verified-email gate as a normal sign-in — an unverified student
  // shouldn't get restored into a logged-in session just because Firebase
  // itself is still holding the session open.
  if (!isAdminEmail && !user.emailVerified) return;

  if (isAdminEmail) {
    const matchedAdmin = state.students.find(s => s.id === 'admin') || {
      id: 'admin', name: 'Admin', roll: 'ADMIN_CSE', dept: 'CSE', year: '4th Year',
      role: 'admin', email, phone: '+91 94420 12345',
      about: 'Al-Ameen Engineering College Developer Club Admin.'
    };
    state.loggedInUser = { ...matchedAdmin, role: 'admin' };
    return;
  }

  const matchedStudent = state.students.find(s => s.email && s.email.toLowerCase() === email);
  if (matchedStudent) {
    state.loggedInUser = { ...matchedStudent, role: 'student' };
  }
  // If no matching profile is found, we leave state.loggedInUser as null —
  // same "signed in, but no profile" situation the manual sign-in flow
  // already handles by prompting for a roll number.
}

function handleProfilePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert("Please select a valid image file.");
    return;
  }

  // Profile photos live on the same student record as CV status, poll
  // votes, everything else — a single Firestore document. Firestore
  // rejects any document over 1MB, and an un-resized phone photo (often
  // 3-8MB raw, larger still once base64-encoded) blows past that easily.
  // When that happens the ENTIRE student record silently fails to sync —
  // not just the photo — which is why a CV update could vanish for a
  // student whose profile photo was too large. Resizing/compressing every
  // photo down to a small thumbnail here means this can't happen, instead
  // of just rejecting large uploads and making the person guess why.
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.onload = function() {
    URL.revokeObjectURL(objectUrl);
    const maxDim = 300;
    let { width, height } = img;
    if (width > height && width > maxDim) {
      height = Math.round(height * (maxDim / width));
      width = maxDim;
    } else if (height > maxDim) {
      width = Math.round(width * (maxDim / height));
      height = maxDim;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    // JPEG at 0.7 quality keeps a 300px thumbnail comfortably under ~50KB
    // in virtually every case — nowhere near Firestore's 1MB document cap
    // even accounting for the rest of the student record around it.
    const base64Str = canvas.toDataURL('image/jpeg', 0.7);

    const photoImg = document.getElementById('profile-photo-img');
    if (photoImg) photoImg.src = base64Str;

    if (state.loggedInUser) {
      state.loggedInUser.photo = base64Str;
      const matched = state.students.find(s => s.id === state.loggedInUser.id);
      if (matched) matched.photo = base64Str;

      saveCurrentState();
      renderApp();
      showToast("Profile photo updated.");
    }
  };
  img.onerror = function() {
    URL.revokeObjectURL(objectUrl);
    alert("Could not read that image file. Try a different one.");
  };
  img.src = objectUrl;
}

function extractUsername(val, domain) {
  if (!val) return '';
  let clean = val.trim();
  clean = clean.replace(/\/+$/, '');
  if (clean.toLowerCase().includes(domain)) {
    try {
      const parts = clean.split('/');
      return parts[parts.length - 1];
    } catch (e) {
      return clean;
    }
  }
  return clean;
}

function maskLeaderboardName(name, rankIdx) {
  if (rankIdx === 0) return name; // 1st place fully shown
  const parts = name.split(' ');
  return parts.map((part) => {
    if (part.length <= 2) return part;
    return part.substring(0, 2) + '*'.repeat(part.length - 2);
  }).join(' ');
}

// Update profile handles
function handleProfileUpdate(e) {
  e.preventDefault();
  if (!state.loggedInUser) return;

  const about = document.getElementById('profile-about').value.trim();

  if (state.loggedInUser.role === 'admin') {
    state.loggedInUser.about = about;
    state.students = state.students.map(s => {
      if (s.id === 'admin') {
        return { ...s, name: 'Admin', about };
      }
      return s;
    });
    saveCurrentState();
    alert('Admin bio updated successfully!');
    renderApp();
    return;
  }

  const rawGithub = document.getElementById('profile-github').value.trim();
  const rawPhone = document.getElementById('profile-phone').value.trim();
  const rawWhatsapp = document.getElementById('profile-whatsapp').value.trim();
  const rawLeetcode = document.getElementById('profile-leetcode').value.trim();
  const rawLinkedin = document.getElementById('profile-linkedin').value.trim();

  const github = extractUsername(rawGithub, 'github.com');
  const leetcode = extractUsername(rawLeetcode, 'leetcode.com');
  const linkedin = extractUsername(rawLinkedin, 'linkedin.com');

  const crawler = document.getElementById('crawler-overlay');
  const status = document.getElementById('crawler-status-message');
  const bar = document.getElementById('crawler-progress-bar');
  
  crawler.classList.add('active');
  status.textContent = '[Re-Extracting profile points stats...]';
  bar.style.width = '10%';

  (async () => {
    status.textContent = `[Fetching GitHub contributions for ${github || '—'}...]`;
    bar.style.width = '35%';
    const githubStats = await fetchGithubStats(github);

    status.textContent = `[Fetching LeetCode API for ${leetcode || '—'}...]`;
    bar.style.width = '75%';
    const leetcodeStats = await fetchLeetcodeStats(leetcode);

    status.textContent = '[Recalculating rank points database...]';
    bar.style.width = '100%';

    setTimeout(() => {
      crawler.classList.remove('active');
      
      state.students = state.students.map(s => {
        if (s.id === state.loggedInUser.id) {
          const updated = { 
            ...s, 
            github, 
            leetcode, 
            linkedin, 
            phone: rawPhone, 
            whatsapp: rawWhatsapp, 
            about,
            githubContributions: githubStats.hasRealMonthly ? githubStats.contributionsThisYear : githubStats.contributions,
            githubVerified: githubStats.verified,
            leetcodeSolved: leetcodeStats.solved,
            leetcodeVerified: leetcodeStats.verified
          };
          if (githubStats.hasRealMonthly) {
            updated.githubContributionsMonth = githubStats.contributionsLast30Days;
            updated.githubContributionsCalendarMonth = githubStats.contributionsThisCalendarMonth;
          }
          if (leetcodeStats.hasRealMonthly) {
            updated.leetcodeSolvedMonth = leetcodeStats.solvedLast30;
            updated.leetcodeSolvedCalendarMonth = leetcodeStats.solvedThisCalendarMonth;
          }
          if (githubStats.lastActiveDate) {
            updated.githubLastActiveDate = githubStats.lastActiveDate;
          }
          if (leetcodeStats.lastActiveDate) {
            updated.leetcodeLastActiveDate = leetcodeStats.lastActiveDate;
          }
          
          state.loggedInUser = { ...state.loggedInUser, ...updated };
          return updated;
        }
        return s;
      });

      saveCurrentState();
      const warnings = [];
      if (github && !githubStats.verified) warnings.push('GitHub');
      if (leetcode && !leetcodeStats.verified) warnings.push('LeetCode');
      if (warnings.length) {
        alert(`Stats recalculated. Could not verify: ${warnings.join(' & ')} — check the username or try again later.`);
      } else {
        alert('Stats extracted and rankings recalculated!');
      }
      renderApp();
    }, 800);
  })();
}

// CV Uploads
function handleCvUpload() {
  const fileInput = document.getElementById('cv-file-input');
  if (!fileInput.files.length) return;

  const file = fileInput.files[0];
  if (file.type !== 'application/pdf') {
    alert('PDF format CV only.');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert('CV file size must be less than 2 MB.');
    return;
  }

  const indicator = document.getElementById('cv-upload-indicator');
  indicator.classList.remove('d-none');

  setTimeout(() => {
    indicator.classList.add('d-none');
    
    state.students = state.students.map(s => {
      if (s.id === state.loggedInUser.id) {
        const updated = {
          ...s,
          cvUrl: file.name,
          cvStatus: 'Pending',
          cvFeedback: 'CV PDF saved. Evaluators will review it shortly.'
        };
        state.loggedInUser = { ...state.loggedInUser, ...updated };
        return updated;
      }
      return s;
    });

    saveCurrentState();
    alert('CV file saved successfully!');
    renderApp();
  }, 1200);
}

// Announcements & Broadcast Notice CRUD

// Only http:// or https:// links are accepted — this is a button meant to
// open a real page, not a place to slip in a javascript: URL or similar.
function validateBroadcastLinkUrl() {
  const hasLink = document.getElementById('broadcast-has-link').checked;
  const url = document.getElementById('broadcast-link-url').value.trim();
  if (!hasLink) {
    clearFieldError('broadcast-link-url');
    return true;
  }
  if (!/^https?:\/\/.+/i.test(url)) {
    showFieldError('broadcast-link-url', 'Enter a valid link starting with http:// or https://.');
    return false;
  }
  clearFieldError('broadcast-link-url');
  return true;
}

async function handleAnnouncementSubmit(e) {
  e.preventDefault();
  if (state.viewMode !== 'admin') return;

  const id = document.getElementById('broadcast-id').value;
  const title = document.getElementById('broadcast-title').value.trim();
  const type = document.getElementById('broadcast-type').value;
  const content = document.getElementById('broadcast-content').value.trim();
  const isPinnedAd = document.getElementById('broadcast-pinned-ad').checked;
  const hasLink = document.getElementById('broadcast-has-link').checked;
  const linkLabel = document.getElementById('broadcast-link-label').value.trim();
  const linkUrl = document.getElementById('broadcast-link-url').value.trim();

  if (hasLink) {
    if (!validateBroadcastLinkUrl()) {
      document.getElementById('broadcast-link-url').focus();
      return;
    }
    if (!linkLabel) {
      alert('Enter a button name for the link.');
      document.getElementById('broadcast-link-label').focus();
      return;
    }
  }

  const submitBtn = document.getElementById('btn-submit-broadcast');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  const media = await readAttachmentPromise('broadcast-attachment');

  if (isPinnedAd) {
    state.notifications = state.notifications.map(n => ({ ...n, isPinnedAd: false }));
  }

  const linkFields = hasLink
    ? { buttonLabel: linkLabel, buttonUrl: linkUrl }
    : { buttonLabel: null, buttonUrl: null };

  if (id) {
    state.notifications = state.notifications.map(n => {
      if (n.id === id) {
        const updated = { ...n, title, type, content, isPinnedAd, ...linkFields };
        if (media) {
          updated.attachment = media.data;
          updated.attachmentType = media.type;
        }
        return updated;
      }
      return n;
    });
    alert('Announcement notice updated.');
  } else {
    const newNotif = {
      id: `notif_${Date.now()}`,
      title,
      content,
      type,
      timestamp: new Date().toISOString(),
      sender: state.loggedInUser ? state.loggedInUser.name : 'Admin (CSE Dept)',
      isPinnedAd,
      ...linkFields
    };
    if (media) {
      newNotif.attachment = media.data;
      newNotif.attachmentType = media.type;
    }
    state.notifications.unshift(newNotif);
    document.getElementById('notif-badge-count').classList.remove('d-none');
    alert('Notice broadcasted to club feed.');
    sendBrowserNotification(title, content);
  }

  submitBtn.disabled = false;
  submitBtn.textContent = originalBtnText;

  const fileInp = document.getElementById('broadcast-attachment');
  if (fileInp) fileInp.value = '';

  saveCurrentState();
  resetAnnouncementForm();
  renderAnnouncementsList();
  renderAdBanner();
}

function resetAnnouncementForm() {
  document.getElementById('broadcast-id').value = '';
  document.getElementById('broadcast-title').value = '';
  document.getElementById('broadcast-content').value = '';
  document.getElementById('broadcast-pinned-ad').checked = false;
  document.getElementById('broadcast-has-link').checked = false;
  document.getElementById('broadcast-link-label').value = '';
  document.getElementById('broadcast-link-url').value = '';
  document.getElementById('broadcast-link-fields').classList.add('d-none');
  clearFieldError('broadcast-link-url');
  document.getElementById('broadcast-form-title').textContent = 'Broadcast Announcement';
  document.getElementById('btn-submit-broadcast').textContent = 'Broadcast Notice';
  document.getElementById('btn-cancel-edit-notif').classList.add('d-none');
}

async function deleteAnnouncement(notifId) {
  if (!(await window.showCustomConfirm('Delete Notice', 'Are you sure you want to delete this notice?'))) return;
  state.notifications = state.notifications.filter(n => n.id !== notifId);
  saveCurrentState();
  renderAnnouncementsList();
  renderAdBanner();
}

function editAnnouncement(notifId) {
  const notif = state.notifications.find(n => n.id === notifId);
  if (!notif) return;

  document.getElementById('broadcast-id').value = notif.id;
  document.getElementById('broadcast-title').value = notif.title;
  document.getElementById('broadcast-type').value = notif.type;
  document.getElementById('broadcast-content').value = notif.content;
  document.getElementById('broadcast-pinned-ad').checked = notif.isPinnedAd || false;

  const hasLink = !!notif.buttonUrl;
  document.getElementById('broadcast-has-link').checked = hasLink;
  document.getElementById('broadcast-link-label').value = notif.buttonLabel || '';
  document.getElementById('broadcast-link-url').value = notif.buttonUrl || '';
  document.getElementById('broadcast-link-fields').classList.toggle('d-none', !hasLink);

  document.getElementById('broadcast-form-title').textContent = 'Edit Announcement';
  document.getElementById('btn-submit-broadcast').textContent = 'Update Notice';
  document.getElementById('btn-cancel-edit-notif').classList.remove('d-none');
  
  document.getElementById('admin-broadcast-panel').scrollIntoView({ behavior: 'smooth' });
}

// Poll CRUD (Admin) + Voting (Students)
function collectPollOptionInputs() {
  return Array.from(document.querySelectorAll('#poll-options-list .poll-option-input'));
}

function addPollOptionRow(value = '') {
  const list = document.getElementById('poll-options-list');
  const row = document.createElement('div');
  row.className = 'poll-option-row';
  row.style.cssText = 'display: flex; gap: 0.35rem;';
  row.innerHTML = `
    <input type="text" class="form-control poll-option-input" placeholder="Option" value="${value}" required>
    <button type="button" class="action-btn danger-btn poll-remove-option-btn" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">✕</button>
  `;
  row.querySelector('.poll-remove-option-btn').addEventListener('click', () => {
    if (collectPollOptionInputs().length <= 2) {
      alert('A poll needs at least 2 options.');
      return;
    }
    row.remove();
  });
  list.appendChild(row);
}

async function handlePollSubmit(e) {
  e.preventDefault();
  if (state.viewMode !== 'admin') return;

  const id = document.getElementById('poll-id').value;
  const question = document.getElementById('poll-question').value.trim();
  const options = collectPollOptionInputs().map(inp => inp.value.trim()).filter(Boolean);
  const allowRevote = document.getElementById('poll-allow-revote').checked;
  const showResultsBeforeVote = document.getElementById('poll-show-results-before-vote').checked;

  if (options.length < 2) {
    alert('Please provide at least 2 poll options.');
    return;
  }
  const uniqueOptions = new Set(options.map(o => o.toLowerCase()));
  if (uniqueOptions.size !== options.length) {
    alert('Poll options must be unique.');
    return;
  }

  if (id) {
    // Editing an existing poll: keep prior votes for options that still exist by text match; drop votes for removed options.
    state.polls = state.polls.map(p => {
      if (p.id !== id) return p;
      const votes = {};
      Object.entries(p.votes || {}).forEach(([studentId, optIdx]) => {
        const prevOptionText = p.options[optIdx];
        const newIdx = options.indexOf(prevOptionText);
        if (newIdx !== -1) votes[studentId] = newIdx;
      });
      return { ...p, question, options, allowRevote, showResultsBeforeVote, votes };
    });
    alert('Poll updated!');
  } else {
    const newPoll = {
      id: `poll_${Date.now()}`,
      question,
      options,
      allowRevote,
      showResultsBeforeVote,
      votes: {}, // { studentId: optionIndex }
      timestamp: new Date().toISOString(),
      closed: false,
      postedBy: state.loggedInUser ? state.loggedInUser.name : 'Admin (CSE Dept)'
    };
    state.polls.unshift(newPoll);

    // In-app notification, not just the browser push below — sendBrowserNotification()
    // only reaches someone if they previously granted browser notification
    // permission, which most people never do. This guarantees everyone sees
    // it in the app's own notification feed regardless of that permission.
    state.notifications.unshift({
      id: `notif_${Date.now()}`,
      title: 'New Poll: ' + question,
      content: 'A new poll is open — vote now on the Announcements page.',
      type: 'poll',
      timestamp: new Date().toISOString(),
      sender: state.loggedInUser ? state.loggedInUser.name : 'Admin (CSE Dept)',
      isPinnedAd: false,
      buttonLabel: null,
      buttonUrl: null
    });
    const badge = document.getElementById('notif-badge-count');
    if (badge) badge.classList.remove('d-none');

    alert('Poll posted to the Announcements page!');
    sendBrowserNotification('New Poll: ' + question, 'Vote now on the Announcements page.');
  }

  saveCurrentState();
  resetPollForm();
  renderAnnouncementsList();
}

function resetPollForm() {
  document.getElementById('poll-id').value = '';
  document.getElementById('poll-question').value = '';
  document.getElementById('poll-allow-revote').checked = true;
  document.getElementById('poll-show-results-before-vote').checked = false;
  document.getElementById('poll-options-list').innerHTML = '';
  addPollOptionRow();
  addPollOptionRow();
  document.getElementById('poll-form-title').textContent = 'Create Poll';
  document.getElementById('btn-submit-poll').textContent = 'Post Poll';
  document.getElementById('btn-cancel-edit-poll').classList.add('d-none');
}

function editPoll(pollId) {
  const poll = state.polls.find(p => p.id === pollId);
  if (!poll) return;

  document.getElementById('poll-id').value = poll.id;
  document.getElementById('poll-question').value = poll.question;
  document.getElementById('poll-allow-revote').checked = poll.allowRevote !== false;
  document.getElementById('poll-show-results-before-vote').checked = !!poll.showResultsBeforeVote;

  document.getElementById('poll-options-list').innerHTML = '';
  poll.options.forEach(opt => addPollOptionRow(opt));

  document.getElementById('poll-form-title').textContent = 'Edit Poll';
  document.getElementById('btn-submit-poll').textContent = 'Update Poll';
  document.getElementById('btn-cancel-edit-poll').classList.remove('d-none');

  document.getElementById('admin-broadcast-panel').scrollIntoView({ behavior: 'smooth' });
}

async function deletePoll(pollId) {
  if (!(await window.showCustomConfirm('Delete Poll', 'Delete this poll and all its votes?'))) return;
  state.polls = state.polls.filter(p => p.id !== pollId);
  saveCurrentState();
  renderAnnouncementsList();
}

async function togglePollClosed(pollId) {
  const poll = state.polls.find(p => p.id === pollId);
  if (!poll) return;
  const willClose = !poll.closed;
  if (willClose && !(await window.showCustomConfirm('Close Poll', 'Close voting on this poll? Students will no longer be able to vote or change their vote.'))) return;
  state.polls = state.polls.map(p => p.id === pollId ? { ...p, closed: willClose } : p);
  saveCurrentState();
  renderAnnouncementsList();
}
window.togglePollClosed = togglePollClosed;

function castPollVote(pollId, optionIndex) {
  if (!state.loggedInUser || state.loggedInUser.role === 'admin') {
    alert('Please sign in as a student member to vote.');
    openModal('modal-auth');
    return;
  }
  const poll = state.polls.find(p => p.id === pollId);
  if (!poll || poll.closed) return;

  const studentId = state.loggedInUser.id;
  const alreadyVoted = Object.prototype.hasOwnProperty.call(poll.votes || {}, studentId);
  if (alreadyVoted && poll.allowRevote === false) {
    showToast('Your vote is locked in for this poll — the admin has disabled vote changes.');
    return;
  }

  state.polls = state.polls.map(p => {
    if (p.id !== pollId) return p;
    const votes = { ...(p.votes || {}), [studentId]: optionIndex };
    return { ...p, votes };
  });
  saveCurrentState();
  renderAnnouncementsList();
  showToast(alreadyVoted ? 'Vote updated.' : 'Vote recorded.');
}
window.castPollVote = castPollVote;

function renderPollsList() {
  const container = document.getElementById('polls-list-container');
  if (!container) return;
  container.innerHTML = '';

  const polls = [...state.polls].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (polls.length === 0) {
    container.innerHTML = `
      <div class="text-center" style="padding: 1.5rem; color: var(--text-secondary); background-color: var(--accent-bg); border-radius: 0.5rem;">
        No polls posted yet.
      </div>
    `;
    return;
  }

  const isAdmin = state.viewMode === 'admin';
  const studentId = state.loggedInUser && state.loggedInUser.role !== 'admin' ? state.loggedInUser.id : null;

  polls.forEach(poll => {
    const votes = poll.votes || {};
    const totalVotes = Object.keys(votes).length;
    const myVoteIdx = studentId !== null && Object.prototype.hasOwnProperty.call(votes, studentId) ? votes[studentId] : null;
    const counts = poll.options.map((_, idx) => Object.values(votes).filter(v => v === idx).length);

    // Results are visible to: admin always; a student who has voted; or any student when the admin
    // has opted to show live results before voting.
    const showResults = isAdmin || myVoteIdx !== null || !!poll.showResultsBeforeVote;

    const card = document.createElement('div');
    card.className = 'notif-card info';
    card.style.position = 'relative';

    let adminControls = '';
    if (isAdmin) {
      adminControls = `
        <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 0.25rem;">
          <button class="action-btn" style="padding: 0.15rem 0.35rem; font-size: 0.65rem;" data-poll-edit-id="${poll.id}">Edit</button>
          <button class="action-btn" style="padding: 0.15rem 0.35rem; font-size: 0.65rem;" data-poll-toggle-id="${poll.id}">${poll.closed ? 'Reopen' : 'Close'}</button>
          <button class="action-btn danger-btn" style="padding: 0.15rem 0.35rem; font-size: 0.65rem;" data-poll-del-id="${poll.id}">Delete</button>
        </div>
      `;
    }

    let optionsHtml = '';
    poll.options.forEach((opt, idx) => {
      const pct = totalVotes > 0 ? Math.round((counts[idx] / totalVotes) * 100) : 0;
      const isMine = myVoteIdx === idx;

      if (showResults) {
        optionsHtml += `
          <div class="poll-option-result" data-poll-vote-id="${!isAdmin && !poll.closed ? poll.id : ''}" data-poll-vote-idx="${idx}" style="cursor: ${!isAdmin && !poll.closed ? 'pointer' : 'default'}; margin-bottom: 0.4rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.15rem;">
              <span style="font-weight: ${isMine ? 700 : 500}; color: ${isMine ? 'var(--primary-blue-light)' : 'var(--text-primary)'};">${opt} ${isMine ? '✓' : ''}</span>
              <span class="kpi-subtext">${pct}% (${counts[idx]})</span>
            </div>
            <div style="background: var(--accent-bg); border-radius: 4px; height: 8px; overflow: hidden;">
              <div style="width: ${pct}%; background: ${isMine ? 'var(--accent-orange)' : 'var(--primary-blue-light)'}; height: 100%;"></div>
            </div>
          </div>
        `;
      } else {
        optionsHtml += `
          <button type="button" class="action-btn w-full" data-poll-vote-id="${poll.id}" data-poll-vote-idx="${idx}" style="text-align: left; margin-bottom: 0.35rem; padding: 0.4rem 0.6rem; font-size: 0.78rem;">${opt}</button>
        `;
      }
    });

    const date = new Date(poll.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    card.innerHTML = `
      ${adminControls}
      <div class="notif-meta">
        <span>Posted by: <strong>${poll.postedBy || 'Admin'}</strong></span>
      </div>
      <h3 class="notif-title" style="padding-right: 140px; font-size: 0.92rem;">${poll.question} ${poll.closed ? '<span class="ad-banner-badge" style="font-size:0.5rem; vertical-align:middle; margin-left: 0.25rem;">Closed</span>' : ''}</h3>
      <div style="margin-top: 0.75rem;">
        ${optionsHtml}
      </div>
      <div style="text-align: right; margin-top: 0.35rem;">
        <span class="number-font" style="font-size: 0.68rem; color: var(--text-secondary); opacity: 0.85;">${date} • ${totalVotes} vote${totalVotes === 1 ? '' : 's'}</span>
      </div>
    `;

    card.querySelectorAll('[data-poll-vote-id]').forEach(el => {
      const pollId = el.getAttribute('data-poll-vote-id');
      if (!pollId) return; // empty means voting isn't available on this option (admin view or closed poll)
      el.addEventListener('click', () => castPollVote(pollId, parseInt(el.getAttribute('data-poll-vote-idx'), 10)));
    });

    if (isAdmin) {
      card.querySelector(`[data-poll-edit-id="${poll.id}"]`).addEventListener('click', () => editPoll(poll.id));
      card.querySelector(`[data-poll-toggle-id="${poll.id}"]`).addEventListener('click', () => togglePollClosed(poll.id));
      card.querySelector(`[data-poll-del-id="${poll.id}"]`).addEventListener('click', () => deletePoll(poll.id));
    }

    container.appendChild(card);
  });
}

// Courses: admin CRUD (add via URL + auto-fetch, edit, approve, remove) + public browse
const COURSE_PLATFORM_DOMAINS = [
  { match: 'coursera.org', platform: 'Coursera' },
  { match: 'ibm.com', platform: 'IBM' },
  { match: 'skillsbuild.org', platform: 'IBM' },
  { match: 'microsoft.com', platform: 'Microsoft' },
  { match: 'learn.microsoft.com', platform: 'Microsoft' },
  { match: 'netacad.com', platform: 'Cisco' },
  { match: 'cisco.com', platform: 'Cisco' }
];

function detectCoursePlatform(url) {
  const lower = url.toLowerCase();
  const found = COURSE_PLATFORM_DOMAINS.find(d => lower.includes(d.match));
  return found ? found.platform : 'Other';
}

async function fetchCourseInfo() {
  const urlInput = document.getElementById('course-url');
  const url = urlInput.value.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    showFieldError('course-url', 'Paste a valid course URL first (starting with https://).');
    return;
  }
  clearFieldError('course-url');

  const fetchBtn = document.getElementById('btn-fetch-course-info');
  const originalText = fetchBtn.textContent;
  fetchBtn.textContent = 'Fetching...';
  fetchBtn.disabled = true;

  // Platform can always be guessed from the domain, even if the metadata fetch fails.
  document.getElementById('course-platform').value = detectCoursePlatform(url);

  try {
    const apiRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
    if (apiRes.ok) {
      const resData = await apiRes.json();
      if (resData.status === 'success' && resData.data) {
        const info = resData.data;
        if (info.title && info.title.trim() !== '') {
          document.getElementById('course-title').value = info.title.trim();
        }
        if (info.image && info.image.url) {
          document.getElementById('course-thumbnail').value = info.image.url;
        } else if (info.logo && info.logo.url) {
          document.getElementById('course-thumbnail').value = info.logo.url;
        }
        showToast('Course details fetched — review and edit before saving.');
      } else {
        showToast('Unable to auto-fetch details for this link. Fill the fields in manually, or upload a thumbnail below.');
      }
    } else {
      showToast('Unable to auto-fetch details for this link. Fill the fields in manually, or upload a thumbnail below.');
    }
  } catch (err) {
    console.warn('Course metadata fetch failed', err);
    showToast('Unable to load. Please fill the fields in manually, or upload a thumbnail below.');
  } finally {
    fetchBtn.textContent = originalText;
    fetchBtn.disabled = false;
  }
}

async function handleCourseSubmit(e) {
  e.preventDefault();
  if (state.viewMode !== 'admin') return;

  const id = document.getElementById('course-id').value;
  const url = document.getElementById('course-url').value.trim();
  const title = document.getElementById('course-title').value.trim();
  let thumbnail = document.getElementById('course-thumbnail').value.trim();
  const platform = document.getElementById('course-platform').value;
  const category = document.getElementById('course-category').value.trim();
  const couponCode = document.getElementById('course-coupon').value.trim().toUpperCase();

  if (!/^https?:\/\//i.test(url)) {
    showFieldError('course-url', 'Course URL must start with http:// or https://.');
    document.getElementById('course-url').focus();
    return;
  }
  clearFieldError('course-url');

  // Manual thumbnail upload wins over an auto-fetched/pasted URL if the admin provided one.
  const uploaded = await readAttachmentPromise('course-thumbnail-upload');
  if (uploaded) {
    thumbnail = uploaded.data;
  }

  const submitBtn = document.getElementById('btn-submit-course');
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  let courseRecord;
  if (id) {
    const existing = state.courses.find(c => c.id === id);
    courseRecord = { ...existing, url, title, thumbnail, platform, category, couponCode };
  } else {
    courseRecord = {
      id: `course_${Date.now()}`,
      url,
      title,
      thumbnail,
      platform,
      category,
      couponCode,
      approved: false,
      timestamp: new Date().toISOString(),
      addedBy: state.loggedInUser ? state.loggedInUser.name : 'Admin (CSE Dept)',
      addedByUid: firebaseAuth.currentUser ? firebaseAuth.currentUser.uid : null
    };
  }

  const savedOk = await saveCourseToCloud(courseRecord);

  submitBtn.disabled = false;
  submitBtn.textContent = originalBtnText;

  if (!savedOk) return; // saveCourseToCloud already showed the error toast; leave the form as-is so nothing is lost

  if (id) {
    state.courses = state.courses.map(c => c.id === id ? courseRecord : c);
    alert('Course updated!');
  } else {
    state.courses.unshift(courseRecord);
    alert('Course added! Approve it from the Manage Courses list to make it visible to students.');
  }
  saveCourses(state.courses); // keep the offline cache in sync too

  const fileInp = document.getElementById('course-thumbnail-upload');
  if (fileInp) fileInp.value = '';

  resetCourseForm();
  renderCoursesManageList();
  renderCoursesBrowse();
}

function resetCourseForm() {
  document.getElementById('course-id').value = '';
  document.getElementById('course-url').value = '';
  document.getElementById('course-title').value = '';
  document.getElementById('course-thumbnail').value = '';
  document.getElementById('course-thumbnail-upload').value = '';
  document.getElementById('course-platform').value = 'Coursera';
  document.getElementById('course-category').value = '';
  document.getElementById('course-coupon').value = '';
  clearFieldError('course-url');
  document.getElementById('course-form-title').textContent = 'Add Course';
  document.getElementById('btn-submit-course').textContent = 'Save Course';
  document.getElementById('btn-cancel-edit-course').classList.add('d-none');
}

function editCourse(courseId) {
  const course = state.courses.find(c => c.id === courseId);
  if (!course) return;

  document.getElementById('course-id').value = course.id;
  document.getElementById('course-url').value = course.url;
  document.getElementById('course-title').value = course.title;
  document.getElementById('course-thumbnail').value = course.thumbnail || '';
  document.getElementById('course-platform').value = course.platform;
  document.getElementById('course-category').value = course.category;
  document.getElementById('course-coupon').value = course.couponCode || '';

  document.getElementById('course-form-title').textContent = 'Edit Course';
  document.getElementById('btn-submit-course').textContent = 'Update Course';
  document.getElementById('btn-cancel-edit-course').classList.remove('d-none');

  document.getElementById('admin-courses-panel').scrollIntoView({ behavior: 'smooth' });
}

async function deleteCourse(courseId) {
  if (!(await window.showCustomConfirm('Delete Course', 'Remove this course listing?'))) return;
  const deletedOk = await deleteCourseFromCloud(courseId);
  if (!deletedOk) return; // error toast already shown; keep it in the list rather than pretending it's gone
  state.courses = state.courses.filter(c => c.id !== courseId);
  saveCourses(state.courses);
  renderCoursesManageList();
  renderCoursesBrowse();
}

async function toggleCourseApproved(courseId) {
  const course = state.courses.find(c => c.id === courseId);
  if (!course) return;
  const updated = { ...course, approved: !course.approved };
  const savedOk = await saveCourseToCloud(updated);
  if (!savedOk) return;
  state.courses = state.courses.map(c => c.id === courseId ? updated : c);
  saveCourses(state.courses);
  renderCoursesManageList();
  renderCoursesBrowse();
}

function renderCoursesManageList() {
  const container = document.getElementById('admin-courses-manage-list');
  if (!container) return;
  container.innerHTML = '';

  const courses = [...state.courses].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (courses.length === 0) {
    container.innerHTML = `<div class="text-center" style="padding: 1.25rem; color: var(--text-secondary); background-color: var(--accent-bg); border-radius: 0.5rem;">No courses added yet.</div>`;
    return;
  }

  courses.forEach(c => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.6rem 0.75rem;';
    row.innerHTML = `
      <img src="${c.thumbnail || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(c.title)}" loading="lazy" style="width: 48px; height: 48px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: var(--accent-bg);">
      <div style="flex-grow: 1; min-width: 0;">
        <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.title}</div>
        <div class="kpi-subtext" style="font-size: 0.68rem;">${c.platform} • ${c.category} • <span class="badge ${c.approved ? 'badge-approved' : 'badge-pending'}" style="font-size: 0.6rem;">${c.approved ? 'Approved' : 'Pending'}</span>${c.couponCode ? ` • 🎟️ ${c.couponCode}` : ''}</div>
      </div>
      <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
        <button class="action-btn" style="padding: 0.2rem 0.5rem; font-size: 0.65rem;" data-course-approve-id="${c.id}">${c.approved ? 'Unpublish' : 'Approve'}</button>
        <button class="action-btn" style="padding: 0.2rem 0.5rem; font-size: 0.65rem;" data-course-edit-id="${c.id}">Edit</button>
        <button class="action-btn danger-btn" style="padding: 0.2rem 0.5rem; font-size: 0.65rem;" data-course-del-id="${c.id}">Delete</button>
      </div>
    `;
    row.querySelector(`[data-course-approve-id="${c.id}"]`).addEventListener('click', () => toggleCourseApproved(c.id));
    row.querySelector(`[data-course-edit-id="${c.id}"]`).addEventListener('click', () => editCourse(c.id));
    row.querySelector(`[data-course-del-id="${c.id}"]`).addEventListener('click', () => deleteCourse(c.id));
    container.appendChild(row);
  });
}

function renderCoursesBrowse() {
  const grid = document.getElementById('courses-browse-grid');
  if (!grid) return;

  const categorySelect = document.getElementById('course-filter-category');
  const platformFilter = document.getElementById('course-filter-platform').value;
  const categoryFilter = categorySelect.value;

  const approved = state.courses.filter(c => c.approved);

  // Keep the category dropdown in sync with whatever categories currently exist among approved courses.
  const categories = [...new Set(approved.map(c => c.category).filter(Boolean))].sort();
  const prevValue = categorySelect.value;
  categorySelect.innerHTML = '<option value="">All Categories</option>' + categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
  if (categories.includes(prevValue)) categorySelect.value = prevValue;

  const filtered = approved.filter(c => {
    if (platformFilter && c.platform !== platformFilter) return false;
    if (categoryFilter && c.category !== categoryFilter) return false;
    return true;
  });

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="text-center" style="grid-column: 1 / -1; padding: 1.5rem; color: var(--text-secondary); background-color: var(--accent-bg); border-radius: 0.5rem;">No courses match these filters yet.</div>`;
    return;
  }

  filtered.forEach(c => {
    const card = document.createElement('a');
    card.href = c.url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.className = 'course-card';
    card.style.textDecoration = 'none';

    const couponHtml = c.couponCode ? `
      <div class="course-coupon-block">
        <span class="course-coupon-code">${c.couponCode}</span>
        <button type="button" class="course-coupon-copy-btn" title="Copy coupon code" data-coupon-code="${c.couponCode}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        </button>
      </div>
    ` : '';

    card.innerHTML = `
      <img src="${c.thumbnail || 'https://api.dicebear.com/7.x/shapes/svg?seed=' + encodeURIComponent(c.title)}" class="course-card-thumb" loading="lazy" alt="${c.title}">
      <div class="course-card-body">
        <span class="badge badge-active" style="align-self: flex-start; font-size: 0.6rem;">${c.platform}</span>
        <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-primary); line-height: 1.3;">${c.title}</span>
        <span class="kpi-subtext" style="font-size: 0.7rem;">${c.category}</span>
        ${couponHtml}
      </div>
    `;

    const copyBtn = card.querySelector('.course-coupon-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyCouponToClipboard(copyBtn.getAttribute('data-coupon-code'), copyBtn);
      });
    }

    grid.appendChild(card);
  });
}

function copyCouponToClipboard(code, btnEl) {
  const finish = (ok) => {
    if (btnEl) {
      const original = btnEl.innerHTML;
      btnEl.innerHTML = ok ? '✓' : '✕';
      setTimeout(() => { btnEl.innerHTML = original; }, 1200);
    }
    showToast(ok ? `Coupon "${code}" copied.` : 'Unable to copy the coupon code — copy it manually.');
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => finish(true)).catch(() => finish(false));
  } else {
    // Fallback for browsers without the async Clipboard API
    try {
      const tempInput = document.createElement('textarea');
      tempInput.value = code;
      tempInput.style.position = 'fixed';
      tempInput.style.opacity = '0';
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      finish(true);
    } catch (err) {
      finish(false);
    }
  }
}

// Certifications: URL-only submission, auto-fetch details, admin verification.
const CERT_PLATFORM_DOMAINS = [
  { match: 'credly.com', platform: 'Credly' },
  { match: 'coursera.org', platform: 'Coursera' },
  { match: 'udemy.com', platform: 'Udemy' },
  { match: 'ibm.com', platform: 'IBM' },
  { match: 'skillsbuild.org', platform: 'IBM' },
  { match: 'microsoft.com', platform: 'Microsoft' },
  { match: 'netacad.com', platform: 'Cisco' },
  { match: 'cisco.com', platform: 'Cisco' },
  { match: 'aws.amazon.com', platform: 'AWS' },
  { match: 'credentials.aws', platform: 'AWS' },
  { match: 'cloudskillsboost.google', platform: 'Google Cloud' },
  { match: 'hackerrank.com', platform: 'HackerRank' },
  { match: 'freecodecamp.org', platform: 'freeCodeCamp' }
];

function detectCertPlatform(url) {
  const lower = url.toLowerCase();
  const found = CERT_PLATFORM_DOMAINS.find(d => lower.includes(d.match));
  return found ? found.platform : 'Other';
}

// Best-effort guess at a certificate/badge ID from common URL shapes
// (Credly badges, Coursera verify links, generic /certificate/ paths, etc.)
// Falls back to the last non-empty path segment if nothing more specific matches.
function extractCertId(url) {
  try {
    const parsed = new URL(url);
    const knownPatterns = [
      /\/badges\/([a-zA-Z0-9-]+)/,
      /\/verify\/([a-zA-Z0-9]+)/,
      /\/certificates?\/([a-zA-Z0-9-]+)/,
      /\/view\/certificates\/([A-Z0-9-]+)/i
    ];
    for (const pattern of knownPatterns) {
      const m = parsed.pathname.match(pattern);
      if (m && m[1]) return m[1];
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length > 0) return decodeURIComponent(segments[segments.length - 1]);
  } catch (e) {
    // not a parseable URL — fall through
  }
  return '';
}

async function fetchCertificationInfo() {
  const urlInput = document.getElementById('cert-url');
  const url = urlInput.value.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    showFieldError('cert-url', 'Paste a valid certificate URL first (starting with https://).');
    return;
  }
  clearFieldError('cert-url');

  const fetchBtn = document.getElementById('btn-fetch-cert-info');
  const originalText = fetchBtn.textContent;
  fetchBtn.textContent = 'Fetching...';
  fetchBtn.disabled = true;

  // Platform and a best-guess ID can always be derived from the URL itself,
  // even if the metadata fetch below fails.
  document.getElementById('cert-platform').value = detectCertPlatform(url);
  document.getElementById('cert-id').value = extractCertId(url);
  document.getElementById('cert-name').value = '';

  try {
    const apiRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
    if (apiRes.ok) {
      const resData = await apiRes.json();
      if (resData.status === 'success' && resData.data && resData.data.title && resData.data.title.trim() !== '') {
        document.getElementById('cert-name').value = resData.data.title.trim();
      }
    }
  } catch (err) {
    console.warn('Certificate metadata fetch failed', err);
  }

  fetchBtn.textContent = originalText;
  fetchBtn.disabled = false;

  document.getElementById('cert-fetched-fields').classList.remove('d-none');
  if (!document.getElementById('cert-name').value) {
    showToast('Unable to auto-fetch the certificate name — please fill it in before saving.');
  } else {
    showToast('Certificate details fetched — review and edit before saving.');
  }
  updateCertificationSubmitState();
}

function updateCertificationSubmitState() {
  const btn = document.getElementById('btn-submit-certification');
  if (!btn) return;
  const url = document.getElementById('cert-url').value.trim();
  const name = document.getElementById('cert-name').value.trim();
  const certId = document.getElementById('cert-id').value.trim();
  const platform = document.getElementById('cert-platform').value.trim();
  const fieldsRevealed = !document.getElementById('cert-fetched-fields').classList.contains('d-none');
  btn.disabled = !(fieldsRevealed && /^https?:\/\//i.test(url) && name && certId && platform);
}

async function handleCertificationSubmit(e) {
  e.preventDefault();
  if (!state.loggedInUser || state.loggedInUser.role === 'admin') return;

  const url = document.getElementById('cert-url').value.trim();
  const name = document.getElementById('cert-name').value.trim();
  const certId = document.getElementById('cert-id').value.trim();
  const platform = document.getElementById('cert-platform').value.trim();

  if (!/^https?:\/\//i.test(url) || !name || !certId || !platform) {
    showToast('Please fetch and confirm all certificate details before saving.');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-certification');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  // Register number always comes from the student's own stored profile —
  // never a separate field on this form.
  const newCert = {
    id: `cert_${Date.now()}`,
    studentId: state.loggedInUser.id,
    studentName: state.loggedInUser.name,
    studentRoll: state.loggedInUser.roll,
    url,
    name,
    certId,
    platform,
    status: 'pending',
    timestamp: new Date().toISOString()
  };

  const savedOk = await saveCertificationToCloud(newCert);

  submitBtn.disabled = false;
  submitBtn.textContent = originalText;

  if (!savedOk) return; // error toast already shown; keep the form open so nothing is lost

  state.certifications.unshift(newCert);
  saveCertifications(state.certifications); // keep the offline cache in sync too

  showToast('Certification submitted for admin verification.');
  closeModal('modal-add-certification');
  resetCertificationForm();
  renderMyCertifications();
}

function resetCertificationForm() {
  document.getElementById('certification-form').reset();
  document.getElementById('cert-fetched-fields').classList.add('d-none');
  clearFieldError('cert-url');
  updateCertificationSubmitState();
}

function certStatusBadge(status) {
  if (status === 'verified') return '<span class="badge badge-approved">Verified</span>';
  if (status === 'rejected') return '<span class="badge badge-inactive">Rejected</span>';
  return '<span class="badge badge-pending">Pending Review</span>';
}

function renderMyCertifications() {
  const container = document.getElementById('profile-certifications-list');
  if (!container || !state.loggedInUser) return;

  const mine = state.certifications
    .filter(c => c.studentId === state.loggedInUser.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (mine.length === 0) {
    container.innerHTML = `<div class="kpi-subtext" style="text-align: center; padding: 0.75rem;">No certifications added yet.</div>`;
    return;
  }

  container.innerHTML = mine.map(c => `
    <a href="${c.url}" target="_blank" rel="noopener noreferrer" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.55rem 0.75rem; text-decoration: none;">
      <div style="min-width: 0;">
        <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.name}</div>
        <div class="kpi-subtext" style="font-size: 0.68rem;">${c.platform} • ID: ${c.certId}</div>
      </div>
      <div style="flex-shrink: 0;">${certStatusBadge(c.status)}</div>
    </a>
  `).join('');
}

async function verifyCertification(certId) {
  const cert = state.certifications.find(c => c.id === certId);
  if (!cert) return;
  const updated = { ...cert, status: 'verified' };
  const savedOk = await saveCertificationToCloud(updated);
  if (!savedOk) return;
  state.certifications = state.certifications.map(c => c.id === certId ? updated : c);
  saveCertifications(state.certifications);
  renderAdminCertificationsList();
  renderMyCertifications();
}

async function rejectCertification(certId) {
  const cert = state.certifications.find(c => c.id === certId);
  if (!cert) return;
  const updated = { ...cert, status: 'rejected' };
  const savedOk = await saveCertificationToCloud(updated);
  if (!savedOk) return;
  state.certifications = state.certifications.map(c => c.id === certId ? updated : c);
  saveCertifications(state.certifications);
  renderAdminCertificationsList();
  renderMyCertifications();
}

async function deleteCertificationAdmin(certId) {
  if (!(await window.showCustomConfirm('Delete Certification', 'Remove this certification submission entirely?'))) return;
  const deletedOk = await deleteCertificationFromCloud(certId);
  if (!deletedOk) return;
  state.certifications = state.certifications.filter(c => c.id !== certId);
  saveCertifications(state.certifications);
  renderAdminCertificationsList();
  renderMyCertifications();
}

function renderAdminCertificationsList() {
  const container = document.getElementById('admin-certifications-list');
  if (!container) return;

  const all = [...state.certifications].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (all.length === 0) {
    container.innerHTML = `<div class="kpi-subtext" style="text-align: center; padding: 1rem;">No certifications submitted yet.</div>`;
    return;
  }

  container.innerHTML = '';
  all.forEach(c => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.6rem 0.75rem; flex-wrap: wrap;';
    row.innerHTML = `
      <div style="flex-grow: 1; min-width: 200px;">
        <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary);">${c.name}</div>
        <div class="kpi-subtext" style="font-size: 0.7rem;">${c.studentName} (${c.studentRoll}) • ${c.platform} • ID: ${c.certId}</div>
        <a href="${c.url}" target="_blank" rel="noopener noreferrer" style="font-size: 0.68rem;">View certificate link ↗</a>
      </div>
      <div style="flex-shrink: 0;">${certStatusBadge(c.status)}</div>
      <div style="display: flex; gap: 0.25rem; flex-shrink: 0;">
        <button class="action-btn" style="padding: 0.2rem 0.5rem; font-size: 0.65rem;" data-cert-verify-id="${c.id}" ${c.status === 'verified' ? 'disabled' : ''}>Verify</button>
        <button class="action-btn" style="padding: 0.2rem 0.5rem; font-size: 0.65rem;" data-cert-reject-id="${c.id}" ${c.status === 'rejected' ? 'disabled' : ''}>Reject</button>
        <button class="action-btn danger-btn" style="padding: 0.2rem 0.5rem; font-size: 0.65rem;" data-cert-del-id="${c.id}">Delete</button>
      </div>
    `;
    row.querySelector(`[data-cert-verify-id="${c.id}"]`).addEventListener('click', () => verifyCertification(c.id));
    row.querySelector(`[data-cert-reject-id="${c.id}"]`).addEventListener('click', () => rejectCertification(c.id));
    row.querySelector(`[data-cert-del-id="${c.id}"]`).addEventListener('click', () => deleteCertificationAdmin(c.id));
    container.appendChild(row);
  });
}

function renderAdBanner() {
  const banner = document.getElementById('top-ad-banner');
  const pinned = state.notifications.find(n => n.isPinnedAd === true);

  if (pinned) {
    banner.classList.remove('d-none');
    document.getElementById('ad-banner-title').textContent = pinned.title;
    document.getElementById('ad-banner-body').textContent = pinned.content;
  } else {
    banner.classList.add('d-none');
  }
}

// Department Settings CRUD
function handleAddDepartment(e) {
  e.preventDefault();
  if (state.viewMode !== 'admin') return;

  const input = document.getElementById('dept-add-name');
  const name = input.value.trim().toUpperCase();
  if (!name) return;

  if (state.departments.includes(name)) {
    alert('Department already exists.');
    return;
  }

  state.departments.push(name);
  saveCurrentState();
  saveDepartmentsToCloud();
  
  input.value = '';
  populateFilterOptions();
  renderDepartmentList();
}

async function deleteDepartment(deptName) {
  if (!(await window.showCustomConfirm('Delete Department', `Remove the department category ${deptName}?`))) return;

  state.departments = state.departments.filter(d => d !== deptName);
  saveCurrentState();
  saveDepartmentsToCloud();
  populateFilterOptions();
  renderDepartmentList();
}

function renderDepartmentList() {
  const list = document.getElementById('sidebar-dept-list');
  if (!list) return;

  list.innerHTML = '';

  state.departments.forEach(dept => {
    const item = document.createElement('div');
    item.className = 'dept-crud-item';
    
    let deleteBtnHtml = '';
    if (state.viewMode === 'admin') {
      deleteBtnHtml = `
        <button class="action-btn danger-btn" style="padding: 0.125rem 0.375rem; font-size: 0.7rem; border: none; cursor: pointer;" data-dept="${dept}">
          Delete
        </button>
      `;
    }
    
    item.innerHTML = `
      <span style="font-weight: 600; font-size: 0.85rem;">${dept}</span>
      ${deleteBtnHtml}
    `;

    if (state.viewMode === 'admin') {
      item.querySelector('button').addEventListener('click', () => deleteDepartment(dept));
    }

    list.appendChild(item);
  });
}

// Volunteers CRUD operations
function handleAddVolunteer(e) {
  e.preventDefault();
  if (state.viewMode !== 'admin') return;

  const addName = document.getElementById('volunteer-add-name');
  const addRole = document.getElementById('volunteer-add-role');
  const addDept = document.getElementById('volunteer-add-dept');
  const addPhone = document.getElementById('volunteer-add-phone');

  if (!addName || !addRole || !addDept || !addPhone) return;

  const name = addName.value.trim();
  const role = addRole.value.trim();
  const dept = addDept.value;
  const phone = addPhone.value.trim();

  if (!name || !role || !phone) return;

  const whatsapp = phone.replace(/[^0-9]/g, '');

  const newVol = {
    id: `vol_${Date.now()}`,
    name,
    role,
    dept,
    phone,
    whatsapp,
    linkedin: '' 
  };

  state.volunteers.push(newVol);
  saveCurrentState();
  saveVolunteerToCloud(newVol); // sync so every other user/device sees this volunteer

  const addNameInput = document.getElementById('volunteer-add-name');
  const addRoleInput = document.getElementById('volunteer-add-role');
  const addPhoneInput = document.getElementById('volunteer-add-phone');
  if (addNameInput) addNameInput.value = '';
  if (addRoleInput) addRoleInput.value = '';
  if (addPhoneInput) addPhoneInput.value = '';

  alert('Volunteer added to Developer Club committee!');
  renderVolunteersList();
}

async function deleteVolunteer(volId) {
  if (!(await window.showCustomConfirm('Remove Volunteer', 'Are you sure you want to remove this volunteer from the committee list?'))) return;

  state.volunteers = state.volunteers.filter(v => v.id !== volId);
  saveCurrentState();
  deleteVolunteerFromCloud(volId); // sync the removal to every other user/device
  renderVolunteersList();
}

// Center Volunteers inside Table layout
function renderVolunteersList() {
  const tbody = document.getElementById('volunteers-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  populateVolunteerAddStudentOptions();

  const actHeader = document.getElementById('vol-action-header');
  if (state.viewMode === 'admin') {
    actHeader.classList.remove('d-none');
  } else {
    actHeader.classList.add('d-none');
  }

  const searchInput = document.getElementById('vol-search-input');
  const deptFilter = document.getElementById('vol-filter-dept');
  const yearFilter = document.getElementById('vol-filter-year');
  const searchTerm = (searchInput?.value || '').trim().toLowerCase();
  const deptTerm = deptFilter?.value || '';
  const yearTerm = yearFilter?.value || '';

  const displayVols = state.volunteers
    .filter(v => v && v.name && v.id !== 'vol_admin' && v.name !== 'Admin' && v.name !== 'Club President' && v.name !== 'Club President Admin')
    .filter(v => {
      if (!searchTerm) return true;
      const matchedStudent = state.students.find(s => s && s.name && v.name && s.name.toLowerCase() === v.name.toLowerCase());
      const roll = matchedStudent?.roll || '';
      return v.name.toLowerCase().includes(searchTerm) || roll.toLowerCase().includes(searchTerm);
    })
    .filter(v => !deptTerm || (v.dept || '').includes(deptTerm))
    // Year isn't always stored on a volunteer record on its own (only when
    // approved from an existing student profile, as "3rd CSE" etc.) — this
    // matches on that same text when present, and simply doesn't exclude
    // volunteers added without a year prefix rather than hiding them
    // incorrectly.
    .filter(v => !yearTerm || (v.dept || '').includes(yearTerm) || !/\d/.test(v.dept || ''));
  displayVols.forEach(v => {
    const tr = document.createElement('tr');
    tr.style.textAlign = 'center';

    const tdName = document.createElement('td');
    const initials = (v.name || 'Volunteer').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2);
    const matchedStudent = state.students.find(s => s && s.name && v.name && s.name.toLowerCase() === v.name.toLowerCase());
    const photoUrl = matchedStudent && matchedStudent.photo ? matchedStudent.photo : '';
    const avatarHtml = photoUrl 
      ? `<img src="${photoUrl}" loading="lazy" onerror="this.onerror=null;this.src='${logoClubUrl}';" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1.5px solid var(--primary-blue-light);" alt="Avatar">`
      : `<div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, var(--primary-blue), var(--accent-orange)); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.7rem; flex-shrink: 0;">${initials}</div>`;
    const dispVolName = v.name;
    tdName.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.5rem; justify-content: flex-start; text-align: left;">
        ${avatarHtml}
        <span style="font-weight: 600; font-size: 0.88rem; color: var(--text-primary); cursor: pointer; text-decoration: underline;" onclick="window.viewStudentProfileDetailsForVolunteer('${v.name}')" title="View Member Profile">${dispVolName}</span>
      </div>
    `;
    tr.appendChild(tdName);

    const tdRole = document.createElement('td');
    if (state.viewMode === 'admin') {
      tdRole.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
          <span style="font-size: 0.82rem; font-weight: 500;">${v.role}</span>
          <button class="icon-btn" style="padding: 2px 4px; border: none; font-size: 0.7rem; cursor: pointer; background: transparent;" onclick="window.editVolunteerRole('${v.id}')" title="Edit Position/Role">✏️</button>
        </div>
      `;
    } else {
      tdRole.innerHTML = `<span style="font-size: 0.82rem; font-weight: 500;">${v.role}</span>`;
    }
    tr.appendChild(tdRole);

    const tdDept = document.createElement('td');
    tdDept.innerHTML = `<span style="font-size: 0.82rem; color: var(--text-secondary);">${v.dept}</span>`;
    tr.appendChild(tdDept);

    const tdContacts = document.createElement('td');
    tdContacts.innerHTML = getDirectContactIconsHtml(v);
    tr.appendChild(tdContacts);

    if (state.viewMode === 'admin') {
      const tdAct = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn danger-btn';
      delBtn.style.padding = '0.15rem 0.4rem';
      delBtn.style.fontSize = '0.65rem';
      delBtn.style.borderRadius = '4px';
      delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', () => deleteVolunteer(v.id));
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);
    }

    tbody.appendChild(tr);
  });
}

// AI Counselor Chats
function renderChatView() {
  const chatLogsArea = document.getElementById('chat-admin-logs-area');
  const inputForm = document.getElementById('chat-input-form');
  const incentiveBanner = document.getElementById('chat-guest-incentive-banner');

  if (state.viewMode === 'admin') {
    if (chatLogsArea) chatLogsArea.classList.remove('d-none');
    if (inputForm) inputForm.classList.add('d-none');
    if (incentiveBanner) incentiveBanner.classList.add('d-none');
    
    renderAdminChatAuditList();
    
    if (state.chats.length > 0 && !state.activeChatStudentId) {
      state.activeChatStudentId = state.chats[0].studentId;
    }
    
    if (state.activeChatStudentId) {
      renderChatLogById(state.activeChatStudentId);
    } else {
      const msgContainer = document.getElementById('chat-messages-container');
      if (msgContainer) {
        msgContainer.innerHTML = `
          <div class="text-center" style="padding: 3rem; color: var(--text-secondary); font-size: 0.85rem;">
            Select a student chat session to inspect details.
          </div>
        `;
      }
    }
  } else {
    if (chatLogsArea) chatLogsArea.classList.add('d-none');
    if (inputForm) inputForm.classList.remove('d-none');
    
    if (state.loggedInUser) {
      if (incentiveBanner) incentiveBanner.classList.add('d-none');
      state.activeChatStudentId = state.loggedInUser.id;
    } else {
      if (incentiveBanner) incentiveBanner.classList.remove('d-none');
      state.activeChatStudentId = 'guest_session';
    }

    renderChatLogById(state.activeChatStudentId);
  }
}

function renderAdminChatAuditList() {
  const container = document.getElementById('chat-audit-students-list');
  if (!container) return;
  container.innerHTML = '';

  const activeChatsOnly = state.chats.filter(c => c.studentId !== 'guest_session');

  if (activeChatsOnly.length === 0) {
    container.innerHTML = '<span class="kpi-subtext" style="font-size: 0.7rem; display: block; padding: 0.25rem 0;">No student transcripts recorded.</span>';
    return;
  }

  activeChatsOnly.forEach(c => {
    const item = document.createElement('div');
    item.className = `audit-student-item ${state.activeChatStudentId === c.studentId ? 'active' : ''}`;
    item.innerHTML = `
      <div style="display: flex; flex-direction: column; min-width: 0;">
        <span style="font-size: 0.75rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.studentName}</span>
        <span class="kpi-subtext" style="font-size: 0.65rem;">Logs: ${c.messages.length}</span>
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary-blue-light);"><polyline points="9 18 15 12 9 6"/></svg>
    `;

    item.addEventListener('click', () => {
      state.activeChatStudentId = c.studentId;
      document.querySelectorAll('.audit-student-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      renderChatLogById(c.studentId);
    });

    container.appendChild(item);
  });
}

function renderChatLogById(studentId) {
  const container = document.getElementById('chat-messages-container');
  if (!container) return;
  container.innerHTML = '';

  let chatSession = state.chats.find(c => c.studentId === studentId);
  const studentObj = state.students.find(s => s.id === studentId) || state.loggedInUser;

  if (!chatSession) {
    const displayName = studentId === 'guest_session' ? 'Guest Coder' : (studentObj ? studentObj.name : 'User');
    chatSession = {
      id: studentId === 'guest_session' ? 'chat_guest' : `chat_${Date.now()}`,
      studentId: studentId,
      studentName: displayName,
      messages: [
        { sender: 'ai', text: 'Hi, this is an AI assistant for you for your education and career guidance from Developer Club.' }
      ]
    };
    state.chats.push(chatSession);
    saveCurrentState();
  }

  const titleEl = document.getElementById('chat-window-title');
  const subEl = document.getElementById('chat-window-sub');
  if (titleEl) {
    titleEl.textContent = state.viewMode === 'admin' 
      ? `Audit Logs: ${chatSession.studentName}` 
      : 'Career Counselor AI';
  }
  if (subEl) {
    subEl.textContent = state.viewMode === 'admin'
      ? 'Reviewing student career chats'
      : 'Developer Club Career & Placement Advisor';
  }

  chatSession.messages.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${msg.sender}`;
    let parsedText = msg.text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/•\s*(.*?)(?=\n|$)/g, '<li>$1</li>')
      .replace(/\n/g, '<br>');
    bubble.innerHTML = parsedText;
    container.appendChild(bubble);
  });

  container.scrollTop = container.scrollHeight;
}

function handleChatMessageSubmit(e) {
  e.preventDefault();

  const input = document.getElementById('chat-message-input');
  const prompt = input.value.trim();
  if (!prompt) return;

  const studentId = state.activeChatStudentId || 'guest_session';
  let chatSession = state.chats.find(c => c.studentId === studentId);
  if (!chatSession) {
    const studentObj = state.students.find(s => s.id === studentId) || state.loggedInUser;
    const displayName = studentId === 'guest_session' ? 'Guest Coder' : (studentObj ? studentObj.name : 'User');
    chatSession = {
      id: studentId === 'guest_session' ? 'chat_guest' : `chat_${Date.now()}`,
      studentId: studentId,
      studentName: displayName,
      messages: [
        { sender: 'ai', text: 'Hi, this is an AI assistant for you for your education and career guidance from Developer Club.' }
      ]
    };
    state.chats.push(chatSession);
    saveCurrentState();
  }

  chatSession.messages.push({ sender: 'student', text: prompt });
  input.value = '';
  renderChatLogById(studentId);

  // No external AI provider anymore — the Career Counselor now always
  // answers using the local, keyword-based sandbox logic below. Nothing
  // here calls out to any server or third-party API.
  setTimeout(() => {
    const reply = getConversationalSandboxReply(prompt);
    chatSession.messages.push({ sender: 'ai', text: reply });
    saveCurrentState();
    renderChatLogById(studentId);
  }, 700);
}

// Global helper for conversational guidance answers
function getConversationalSandboxReply(prompt) {
  const promptLower = prompt.toLowerCase();
  const careerKeywords = ['career', 'job', 'placement', 'resume', 'cv', 'portfolio', 'developer', 'skills', 'roadmap', 'learn', 'react', 'node', 'databases', 'interview', 'prepare', 'internship', 'python', 'java', 'c++', 'js', 'web', 'html', 'css', 'cloud', 'git', 'github', 'tech', 'stack'];
  const isCareerQuery = careerKeywords.some(keyword => promptLower.includes(keyword));

  const greetings = ['hi', 'hello', 'hey', 'counselor', 'who are you', 'help', 'info', 'good morning', 'good afternoon'];
  const isGreeting = greetings.some(word => promptLower.trim() === word || promptLower.startsWith(word + ' '));

  if (isGreeting) {
    return "Hi, this is an AI assistant for you for your education and career guidance from Developer Club.";
  }

  if (!isCareerQuery) {
    return "⚠️ Career Guidance Notice: This counselor strictly answers professional career placements, coding boosters, and resume reviews. General topics are not permitted.";
  }

  const activeStudent = state.students.find(s => s.id === state.loggedInUser?.id);
  if (activeStudent) {
    const scoreVal = activeStudent.score || 0;
    let band = 'Intermediate Coder';
    if (scoreVal >= 300) band = 'Master Placement Track';
    else if (scoreVal >= 150) band = 'Expert Placement Track';

    if (promptLower.includes('resume') || promptLower.includes('cv')) {
      return `Regarding your resume (status: **${activeStudent.cvStatus}**), I recommend making sure your GitHub and LeetCode handles are clickable at the top, focusing your project descriptions on impact metrics rather than just lists of tools, and keeping the format strictly to one page. Feel free to re-upload your PDF whenever you make edits!`;
    }

    return `Hi ${activeStudent.name}! I looked over your Developer Club progress: you are currently on our **${band}** track, with **${activeStudent.githubContributions || 0} GitHub contributions** and **${activeStudent.leetcodeSolved || 0} LeetCode problems** verified. I recommend focusing on full-stack capability (React, Node.js, and SQL databases) and trying to solve at least one problem daily on LeetCode to boost your profile points.`;
  } else {
    if (promptLower.includes('resume') || promptLower.includes('cv')) {
      return "For a strong entry-level software developer resume, I highly recommend a single-column layout, highlighting real GitHub project links, and keeping the length to one page. If you register your profile, you can upload your PDF for review!";
    }
    return "Welcome! To give you a personalized analysis, please register a student profile. A typical pathway we recommend is: 1. JavaScript/React fundamentals. 2. Backend APIs using Node.js and SQL databases. 3. Active GitHub contribution streak.";
  }
}

// Student CV evaluations modal opening with admin edit support
function openEvaluationModal(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;

  state.activeEvaluationStudentId = studentId;

  document.getElementById('eval-student-name').textContent = student.name;
  document.getElementById('eval-student-roll-dept').textContent = `${student.roll} • ${student.dept} ${student.year}`;
  
  document.getElementById('eval-github-contr').value = student.githubContributions || 0;
  document.getElementById('eval-leetcode-solved').value = student.leetcodeSolved || 0;
  
  // Admin direct view/edit variables
  document.getElementById('eval-student-github').value = student.github || '';
  document.getElementById('eval-student-leetcode').value = student.leetcode || '';
  document.getElementById('eval-student-linkedin').value = student.linkedin || '';
  
  document.getElementById('eval-cv-status').value = student.cvStatus || 'Pending';
  document.getElementById('eval-cv-feedback').value = student.cvFeedback || '';
  document.getElementById('eval-student-active').checked = student.active;

  const iframeContainer = document.getElementById('eval-cv-iframe-container');
  const cvLinkContainer = document.getElementById('eval-cv-link-container');
  
  if (student.cvUrl) {
    iframeContainer.innerHTML = `
      <div class="virtual-cv-viewer animate-fade">
        <div style="text-align: center; border-bottom: 2px solid #111827; padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
          <h2 style="font-size: 1.15rem; font-family: 'Outfit'; text-transform: uppercase; margin: 0; color: #111827;">${student.name}</h2>
          <p style="margin: 0.125rem 0; font-size: 0.75rem; color: #4b5563;">Register: ${student.roll} • Email: ${student.email || 'Not shared'}</p>
          <p style="margin: 0; font-size: 0.75rem; color: #4b5563;">Al-Ameen Engineering College • Dept of ${student.dept} • ${student.year}</p>
        </div>
        <div style="margin-bottom: 0.75rem;">
          <p style="margin: 0;"><strong>GitHub Contributions:</strong> ${student.github ? `${student.github} (https://github.com/${student.github})` : 'Not Linked'} (${student.githubContributions || 0} active sessions)</p>
          <p style="margin: 0;"><strong>LeetCode Points solved:</strong> ${student.leetcode ? `${student.leetcode} (https://leetcode.com/${student.leetcode})` : 'Not Linked'} (${(student.leetcodeSolved || 0) * 10} points count)</p>
          <p style="margin: 0;"><strong>LinkedIn URL:</strong> ${student.linkedin ? `${student.linkedin} (https://linkedin.com/in/${student.linkedin})` : 'Not Linked'}</p>
        </div>
        <div style="margin-bottom: 0.75rem;">
          <h4 style="font-size: 0.75rem; text-transform: uppercase; color: #111827; border-bottom: 1.5px solid #d1d5db; padding-bottom: 0.125rem; margin-bottom: 0.25rem;">Core Technology Strengths</h4>
          <p style="margin: 0;">Programming: ES6 JavaScript, Python, C++, Java. Databases: SQL (PostgreSQL/Supabase). Platforms: Vite, Git, Node.js, REST APIs.</p>
        </div>
        <div>
          <h4 style="font-size: 0.75rem; text-transform: uppercase; color: #111827; border-bottom: 1.5px solid #d1d5db; padding-bottom: 0.125rem; margin-bottom: 0.25rem;">Project Accomplishments</h4>
          <p style="margin: 0;">• Built automated dashboard crawler algorithms tracking developer club coders metrics.</p>
          <p style="margin: 0;">• Certified in modern web engineering and data pipelines under Webrania upskilling scheme.</p>
        </div>
      </div>
    `;
    cvLinkContainer.innerHTML = `
      <a href="#" class="stats-item" style="color: var(--primary-blue-light); text-decoration: underline;" onclick="alert('Downloading CV file: ${student.cvUrl}')">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Download original attachment (${student.cvUrl})
      </a>
    `;
  } else {
    iframeContainer.innerHTML = `
      <div class="virtual-cv-viewer animate-fade" style="display: flex; align-items: center; justify-content: center; background-color: var(--accent-bg); color: var(--text-secondary); border: 1px dashed var(--border-color);">
        No CV file submitted by student yet.
      </div>
    `;
    cvLinkContainer.innerHTML = '';
  }

  openModal('modal-evaluate');
}

async function deleteStudentRecord() {
  const studentId = state.activeEvaluationStudentId;
  if (!studentId) return;

  const student = state.students.find(s => s.id === studentId);
  if (!student) return;

  // This only removes the dashboard profile (leaderboard entry, CV status,
  // scores, etc.) from local storage — it does NOT delete the student's
  // actual Firebase Auth account. Firebase Auth accounts can only be
  // deleted by the account owner themselves or via the Firebase Admin SDK
  // (which requires a backend this project intentionally doesn't have —
  // see CHANGES.md). If the goal is letting them fully re-register with
  // the same email, the admin also has to remove that user manually in
  // Firebase Console -> Authentication -> Users -> (find by email) -> Delete.
  const confirmed = await window.showCustomConfirm(
    'Delete Student Record',
    `Remove ${student.name}'s dashboard profile (scores, CV, activity)? ` +
    `This does NOT delete their sign-in account — to let them fully ` +
    `re-register with the same email, you'll also need to delete their ` +
    `user in Firebase Console -> Authentication -> Users.`
  );
  if (!confirmed) return;

  state.students = state.students.filter(s => s.id !== studentId);
  state.followingList = (state.followingList || []).filter(id => id !== studentId);
  saveCurrentState();

  closeModal('modal-evaluate');
  state.activeEvaluationStudentId = null;

  renderApp();
  if (state.currentTab === 'view-leaderboard') renderLeaderboard();
  if (typeof renderDirectoryList === 'function') renderDirectoryList();

  if (typeof showToast === 'function') {
    showToast(`${student.name}'s dashboard profile was removed.`);
  }
}

function handleEvaluationSave(e) {
  e.preventDefault();
  if (!state.activeEvaluationStudentId) return;

  const github = parseInt(document.getElementById('eval-github-contr').value) || 0;
  const leetcode = parseInt(document.getElementById('eval-leetcode-solved').value) || 0;
  
  // Admin direct edits save
  const githubHandle = document.getElementById('eval-student-github').value.trim();
  const leetcodeHandle = document.getElementById('eval-student-leetcode').value.trim();
  const linkedinHandle = document.getElementById('eval-student-linkedin').value.trim();
  
  const cvStatus = document.getElementById('eval-cv-status').value;
  const cvFeedback = document.getElementById('eval-cv-feedback').value.trim();
  const active = document.getElementById('eval-student-active').checked;

  state.students = state.students.map(s => {
    if (s.id === state.activeEvaluationStudentId) {
      return {
        ...s,
        githubContributions: github,
        leetcodeSolved: leetcode,
        github: githubHandle,
        leetcode: leetcodeHandle,
        linkedin: linkedinHandle,
        cvStatus,
        cvFeedback,
        active
      };
    }
    return s;
  });

  saveCurrentState();
  closeModal('modal-evaluate');
  
  if (state.loggedInUser && state.loggedInUser.id === state.activeEvaluationStudentId) {
    const updated = state.students.find(s => s.id === state.activeEvaluationStudentId);
    state.loggedInUser = { ...state.loggedInUser, ...updated };
  }

  renderKPIs();
  renderDirectoryList();
  renderLeaderboard();
  renderCharts();
}

// Chart.js rendering with no outlines and grids
function renderCharts() {
  if (state.viewMode !== 'admin') return;

  const ctxRatio = document.getElementById('chart-active-ratio');
  const ctxPoints = document.getElementById('chart-dept-points');

  if (!ctxRatio || !ctxPoints) return;

  const selectedYear = document.getElementById('chart-filter-year').value;
  const timeWindowEl = document.getElementById('chart-filter-time-window');
  const chartTimeWindow = timeWindowEl ? timeWindowEl.value : 'LAST30';
  const nonAdminStudents = state.students.filter(s => s.id !== 'admin' && s.role !== 'admin');
  const filteredStudents = selectedYear === 'ALL' 
    ? nonAdminStudents 
    : nonAdminStudents.filter(s => s.year === selectedYear);

  const chartScoreFor = (s) => {
    if (chartTimeWindow === 'LAST30') return s.scoreLast30Days || s.scoreMonth || 0;
    if (chartTimeWindow === 'CALENDAR_MONTH') return s.scoreCalendarMonth || 0;
    return s.score || 0;
  };

  if (state.activeRatioChart) {
    state.activeRatioChart.destroy();
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const labelColor = isDark ? '#ffffff' : '#09090b';

  // Chart 1 — "Top Performers by Department": total points scored by each
  // department in the selected window, not just headcount. A department
  // with fewer registered members but more real activity shows as a
  // bigger slice — this answers "which department performs well".
  const deptPointTotals = state.departments.map(dept => {
    return filteredStudents
      .filter(s => s.dept === dept)
      .reduce((sum, s) => sum + chartScoreFor(s), 0);
  });
  const deptColors = ['#1e40af', '#3b82f6', '#ea580c', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];
  const allZero = deptPointTotals.every(v => v === 0);

  state.activeRatioChart = new Chart(ctxRatio, {
    type: 'pie',
    data: {
      labels: state.departments,
      datasets: [{
        label: 'Department Points',
        data: allZero ? state.departments.map(() => 0) : deptPointTotals,
        backgroundColor: state.departments.map((_, i) => deptColors[i % deptColors.length]),
        borderColor: 'transparent',
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: labelColor, font: { family: 'Outfit', size: 11, weight: '600' } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw} pts`
          }
        }
      }
    }
  });

  // Chart 2 — back to the old-style bar chart: registered student count
  // per department.
  const deptStudentCounts = state.departments.map(dept => {
    return filteredStudents.filter(s => s.dept === dept).length;
  });

  if (state.activePointsChart) {
    state.activePointsChart.destroy();
  }

  const isDarkChart = document.documentElement.getAttribute('data-theme') === 'dark';
  const barBorderColor = isDarkChart ? 'transparent' : '#000000';
  const barBorderWidth = isDarkChart ? 0 : 1.5;
  const drawBorderLine = !isDarkChart;

  state.activePointsChart = new Chart(ctxPoints, {
    type: 'bar',
    data: {
      labels: state.departments,
      datasets: [{
        label: 'Registered Students Count',
        data: deptStudentCounts,
        backgroundColor: 'rgba(30, 64, 175, 0.85)',
        borderColor: barBorderColor,
        borderWidth: barBorderWidth
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { 
          ticks: { color: labelColor, font: { family: 'Outfit', size: 11, weight: '600' } }, 
          grid: { 
            display: false,
            drawBorder: drawBorderLine,
            borderColor: '#000000'
          }
        },
        y: { 
          ticks: { 
            color: labelColor, 
            font: { family: 'Outfit', size: 11, weight: '600' },
            stepSize: 1
          }, 
          grid: { 
            color: 'var(--border-color)', 
            drawBorder: drawBorderLine,
            borderColor: '#000000'
          }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderApp() {
  // Wrapped end-to-end: if anything in the middle of this function throws,
  // the switchTab() call in the finally block still runs, so the page can
  // never get stuck fully blank the way it did before the Firebase-init fix
  // documented in CHANGES.md. Same principle, applied here too.
  try {
    const triggerBtn = document.getElementById('btn-login-trigger');
    const mobileTriggerBtn = document.getElementById('btn-login-trigger-mobile');
    const profileSummary = document.getElementById('user-profile-summary');

    if (state.loggedInUser) {
      triggerBtn.classList.add('d-none');
      if (mobileTriggerBtn) mobileTriggerBtn.classList.add('d-none');
      profileSummary.classList.remove('d-none');
      profileSummary.style.display = 'flex';
      document.getElementById('header-user-name').textContent = state.loggedInUser.name;
      const headerAvatar = document.getElementById('header-user-avatar');
      if (headerAvatar) {
        // onerror fallback: a broken/unreachable saved photo URL should quietly
        // fall back to the club logo instead of showing a cracked-image icon.
        headerAvatar.onerror = function() { this.onerror = null; this.src = logoClubUrl; };
        headerAvatar.src = state.loggedInUser.photo || logoClubUrl;
      }
      document.getElementById('tab-profile-trigger').textContent = 'My Profile';
    } else {
      triggerBtn.classList.remove('d-none');
      if (mobileTriggerBtn) mobileTriggerBtn.classList.remove('d-none');
      profileSummary.classList.add('d-none');
      profileSummary.style.display = 'none';
    }

    if (state.loggedInUser && state.loggedInUser.role === 'admin') {
      if (state.viewMode !== 'admin') {
        switchViewMode('admin');
      }
    } else {
      if (state.viewMode !== 'member') {
        switchViewMode('member');
      }
    }

    renderDepartmentList();
    renderVolunteersList();
  } catch (err) {
    console.error('renderApp() hit an error partway through — content visibility is still being restored below.', err);
  } finally {
    switchTab(state.currentTab);
  }
}

function renderKPIs() {
  const studentsOnly = state.students.filter(s => s && s.id !== 'admin' && s.role !== 'admin');
  const total = studentsOnly.length;
  const active = studentsOnly.filter(s => s.active).length;
  const approvedCvs = studentsOnly.filter(s => s.cvStatus === 'Approved').length;
  const totalCertifications = state.certifications.length;

  document.getElementById('kpi-total-members').textContent = total;
  document.getElementById('kpi-active-members').textContent = active;
  document.getElementById('kpi-approved-cvs').textContent = approvedCvs;
  const certKpiEl = document.getElementById('kpi-total-certifications');
  if (certKpiEl) certKpiEl.textContent = totalCertifications;
}

// Admin Registry directory
function renderDirectoryList() {
  const tbody = document.getElementById('directory-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  const query = document.getElementById('filter-search').value.toLowerCase();
  const dept = document.getElementById('filter-dept').value;
  const year = document.getElementById('filter-year').value;
  const status = document.getElementById('filter-status').value;
  const timeWindowEl = document.getElementById('filter-time-window');
  const timeWindow = timeWindowEl ? timeWindowEl.value : 'LAST30';

  const dirGithubValFor = (s) => {
    if (timeWindow === 'LAST30') return s.githubContributionsMonth || 0;
    if (timeWindow === 'CALENDAR_MONTH') return s.githubContributionsCalendarMonth || 0;
    return s.githubContributions || 0;
  };
  const dirLeetcodeValFor = (s) => {
    if (timeWindow === 'LAST30') return s.leetcodeSolvedMonth || 0;
    if (timeWindow === 'CALENDAR_MONTH') return s.leetcodeSolvedCalendarMonth || 0;
    return s.leetcodeSolved || 0;
  };
  const dirScoreFor = (s) => {
    if (timeWindow === 'LAST30') return s.scoreLast30Days || s.scoreMonth || 0;
    if (timeWindow === 'CALENDAR_MONTH') return s.scoreCalendarMonth || 0;
    return s.score || 0;
  };

  const filtered = state.students.filter(s => {
    if (s.id === 'admin' || s.role === 'admin') return false;
    const matchSearch = ((s.name || '').toLowerCase().includes(query)) || ((s.roll || '').includes(query));
    const matchDept = dept === 'ALL' || s.dept === dept;
    const matchYear = year === 'ALL' || s.year === year;
    const matchStatus = status === 'ALL' || 
                        (status === 'ACTIVE' && s.active) || 
                        (status === 'INACTIVE' && !s.active);
    return matchSearch && matchDept && matchYear && matchStatus;
  });

  document.getElementById('directory-count').textContent = `Showing ${filtered.length} members`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center" style="padding: 3rem; color: var(--text-secondary);">
          No students matching selection.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach((s, idx) => {
    const tr = document.createElement('tr');

    const tdSNo = document.createElement('td');
    tdSNo.className = 'number-font';
    tdSNo.textContent = idx + 1;
    tr.appendChild(tdSNo);

    const isFollowing = (state.followingList || []).includes(s.id);
    const followStyle = isFollowing ? 'color: var(--accent-orange);' : 'color: var(--text-secondary); opacity: 0.5;';
    const dispName = s.name;
    const isVolunteer = state.volunteers.some(v => v && v.name && s.name && v.name.toLowerCase() === s.name.toLowerCase());

    const tdInfo = document.createElement('td');
    tdInfo.innerHTML = `
      <div class="student-meta">
        <span style="display: inline-flex; align-items: center;">
          <span class="student-name" style="cursor: pointer; text-decoration: underline;" onclick="window.viewStudentProfileDetails('${s.id}')" title="View Profile Details">${dispName}</span>
        </span>
        <span class="student-roll">${s.roll}</span>
      </div>
    `;
    tr.appendChild(tdInfo);

    const tdVol = document.createElement('td');
    tdVol.style.textAlign = 'center';
    if (isVolunteer) {
      tdVol.innerHTML = '<span style="color: #eab308; cursor: pointer; font-size: 1.25rem;" title="Volunteer (Click to Remove)">★</span>';
      if (state.viewMode === 'admin') {
        tdVol.querySelector('span').addEventListener('click', async (e) => {
          e.stopPropagation();
          const currentVol = state.volunteers.find(v => v && v.name && s.name && v.name.toLowerCase() === s.name.toLowerCase());
          if (currentVol) {
            if (await window.showCustomConfirm('Remove Volunteer', `Remove ${s.name} from the volunteers list?`)) {
              state.volunteers = state.volunteers.filter(v => v.id !== currentVol.id);
              saveCurrentState();
              deleteVolunteerFromCloud(currentVol.id); // sync the removal to every other user/device
              renderDirectoryList();
              renderVolunteersList();
              showToast(`⭐ Removed ${s.name} from Volunteers.`);
            }
          }
        });
      }
    } else {
      if (state.viewMode === 'admin') {
        tdVol.innerHTML = '<span style="color: var(--text-secondary); opacity: 0.35; cursor: pointer; font-size: 1.25rem;" title="Not a Volunteer (Click to Approve)">☆</span>';
        tdVol.querySelector('span').addEventListener('click', (e) => {
          e.stopPropagation();
          window.approveStudentAsVolunteer(s.id);
        });
      } else {
        tdVol.innerHTML = '';
      }
    }
    tr.appendChild(tdVol);

    const tdDept = document.createElement('td');
    tdDept.innerHTML = `
      <div style="font-weight: 500;">${s.dept}</div>
      <div class="kpi-subtext" style="font-size: 0.75rem;">${s.year}</div>
    `;
    tr.appendChild(tdDept);

    const tdActive = document.createElement('td');
    // Plain text Active/Inactive only — the 3-color tiering (green/yellow/
    // grey) stays on the small dots next to GitHub/LeetCode numbers, not
    // on this status badge.
    tdActive.innerHTML = (s.activityStatus === 'green')
      ? '<span class="badge badge-active">Active</span>'
      : '<span class="badge badge-inactive">Inactive</span>';
    tr.appendChild(tdActive);

    const tdGithub = document.createElement('td');
    tdGithub.className = 'number-font';
    const gitTier = getActivityTier(s.githubLastActiveDate);
    const gitVal = dirGithubValFor(s);
    tdGithub.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 0.35rem; justify-content: center; width: 100%;">
        ${gitVal}
        ${s.github ? `<span style="color: ${gitTier.color}; font-size: 0.9rem;" title="${gitTier.githubTitle}">●</span>` : ''}
      </span>
    `;
    tr.appendChild(tdGithub);

    const tdLeet = document.createElement('td');
    tdLeet.className = 'number-font';
    const leetTier = getActivityTier(s.leetcodeLastActiveDate);
    const leetVal = dirLeetcodeValFor(s);
    tdLeet.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 0.35rem; justify-content: center; width: 100%;">
        <span style="color: var(--accent-orange); font-weight: 600;">${leetVal * 10}</span>
        <span class="kpi-subtext" style="font-size: 0.65rem;">(${leetVal})</span>
        ${s.leetcode ? `<span style="color: ${leetTier.color}; font-size: 0.9rem;" title="${leetTier.leetcodeTitle}">●</span>` : ''}
      </span>
    `;
    tr.appendChild(tdLeet);


    const tdProfiles = document.createElement('td');
    tdProfiles.innerHTML = getDirectContactIconsHtml(s);
    tr.appendChild(tdProfiles);

    const tdCv = document.createElement('td');
    let cvClass = 'badge-inactive';
    let statusText = 'No CV';
    if (s.cvUrl) {
      if (s.cvStatus === 'Approved') {
        cvClass = 'badge-approved';
        statusText = 'Approved';
      } else if (s.cvStatus === 'Needs Revision') {
        cvClass = 'badge-revision';
        statusText = 'Revision';
      } else {
        cvClass = 'badge-pending';
        statusText = 'Reviewing';
      }
    }
    tdCv.innerHTML = `<span class="badge ${cvClass}">${statusText}</span>`;
    tr.appendChild(tdCv);

    const tdActions = document.createElement('td');
    if (state.viewMode === 'admin') {
      const evaluateBtn = document.createElement('button');
      evaluateBtn.className = 'action-btn primary-btn';
      evaluateBtn.textContent = 'Evaluate';
      evaluateBtn.addEventListener('click', () => openEvaluationModal(s.id));
      tdActions.appendChild(evaluateBtn);

      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'action-btn';
      refreshBtn.textContent = '⟳ Refresh';
      refreshBtn.title = 'Force a fresh GitHub/LeetCode fetch right now for this student';
      refreshBtn.addEventListener('click', () => forceRefreshStudentStats(s.id));
      tdActions.appendChild(refreshBtn);
    } else {
      const actBtn = document.createElement('button');
      actBtn.className = 'action-btn';
      actBtn.textContent = 'Stats';
      actBtn.addEventListener('click', () => {
        alert(`Extracted stats for ${s.name}:\nGitHub contributions: ${s.githubContributions || 0}\nLeetCode points: ${(s.leetcodeSolved || 0) * 10}`);
      });
      tdActions.appendChild(actBtn);
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

// Leaderboard with dynamic filters — Overall and Monthly, both available.
function renderLeaderboard() {
  const timeFilter = document.getElementById('leaderboard-filter-time').value;
  const deptFilter = document.getElementById('leaderboard-filter-dept').value;
  const yearFilter = document.getElementById('leaderboard-filter-year').value;

  const filtered = state.students.filter(s => {
    if (s.id === 'admin' || s.role === 'admin') return false;
    const matchDept = deptFilter === 'ALL' || s.dept === deptFilter;
    const matchYear = yearFilter === 'ALL' || s.year === yearFilter;
    return matchDept && matchYear;
  });

  // Three time windows: Last 30 Days (rolling), This Month (calendar
  // month-to-date), Overall (lifetime LeetCode + this-year GitHub).
  const scoreFor = (s) => {
    if (timeFilter === 'LAST30') return s.scoreLast30Days || s.scoreMonth || 0;
    if (timeFilter === 'CALENDAR_MONTH') return s.scoreCalendarMonth || 0;
    return s.score || 0;
  };
  const githubValFor = (s) => {
    if (timeFilter === 'LAST30') return s.githubContributionsMonth || 0;
    if (timeFilter === 'CALENDAR_MONTH') return s.githubContributionsCalendarMonth || 0;
    return s.githubContributions || 0;
  };
  const leetcodeValFor = (s) => {
    if (timeFilter === 'LAST30') return s.leetcodeSolvedMonth || 0;
    if (timeFilter === 'CALENDAR_MONTH') return s.leetcodeSolvedCalendarMonth || 0;
    return s.leetcodeSolved || 0;
  };
  const timeLabel = timeFilter === 'LAST30' ? 'last-30-day' : (timeFilter === 'CALENDAR_MONTH' ? 'this month\'s' : 'total');

  const sorted = [...filtered].sort((a, b) => {
    const valA = scoreFor(a);
    const valB = scoreFor(b);
    return valB - valA;
  });

  const container = {
    p1Name: 'podium-1-name', p1Score: 'podium-1-score', p1Dept: 'podium-1-dept', p1Hover: 'podium-1-hover',
    p2Name: 'podium-2-name', p2Score: 'podium-2-score', p2Dept: 'podium-2-dept', p2Hover: 'podium-2-hover',
    p3Name: 'podium-3-name', p3Score: 'podium-3-score', p3Dept: 'podium-3-dept', p3Hover: 'podium-3-hover'
  };

  const showMasked = state.viewMode !== 'admin' && (!state.loggedInUser || state.loggedInUser.role !== 'admin');

  // Hovering a podium name shows a quick detail card (same tooltip pattern
  // used on Volunteers). Clicking still opens the full edit view for admins.
  const wirePodiumDetail = (nameElId, hoverElId, student) => {
    const nameEl = document.getElementById(nameElId);
    const hoverEl = document.getElementById(hoverElId);
    if (!nameEl || !hoverEl) return;

    if (!student) {
      hoverEl.textContent = '';
      nameEl.style.cursor = 'default';
      nameEl.onclick = null;
      return;
    }

    hoverEl.innerHTML = `<strong>${student.name}</strong>\n${student.dept} • ${student.year}\nGitHub: ${student.githubContributions || 0} contributions\nLeetCode: ${(student.leetcodeSolved || 0) * 10} pts (${student.leetcodeSolved || 0} solved)`;
    nameEl.style.cursor = 'pointer';
    nameEl.onclick = () => {
      if (state.viewMode === 'admin') {
        openEvaluationModal(student.id);
      } else {
        alert(`${student.name}\n${student.dept} ${student.year}\n\nGitHub contributions: ${student.githubContributions || 0}\nLeetCode points: ${(student.leetcodeSolved || 0) * 10}`);
      }
    };
  };

  if (sorted.length > 0) {
    const scoreVal = scoreFor(sorted[0]);
    document.getElementById(container.p1Name).textContent = sorted[0].name;
    document.getElementById(container.p1Score).textContent = `${scoreVal} pts`;
    document.getElementById(container.p1Dept).textContent = `${sorted[0].dept} ${sorted[0].year}`;
    wirePodiumDetail(container.p1Name, container.p1Hover, sorted[0]);
  } else {
    document.getElementById(container.p1Name).textContent = '--';
    document.getElementById(container.p1Score).textContent = '0 pts';
    document.getElementById(container.p1Dept).textContent = '--';
    wirePodiumDetail(container.p1Name, container.p1Hover, null);
  }

  if (sorted.length > 1) {
    const scoreVal = scoreFor(sorted[1]);
    document.getElementById(container.p2Name).textContent = sorted[1].name;
    document.getElementById(container.p2Score).textContent = `${scoreVal} pts`;
    document.getElementById(container.p2Dept).textContent = `${sorted[1].dept} ${sorted[1].year}`;
    wirePodiumDetail(container.p2Name, container.p2Hover, sorted[1]);
  } else {
    document.getElementById(container.p2Name).textContent = '--';
    document.getElementById(container.p2Score).textContent = '0 pts';
    document.getElementById(container.p2Dept).textContent = '--';
    wirePodiumDetail(container.p2Name, container.p2Hover, null);
  }

  if (sorted.length > 2) {
    const scoreVal = scoreFor(sorted[2]);
    document.getElementById(container.p3Name).textContent = sorted[2].name;
    document.getElementById(container.p3Score).textContent = `${scoreVal} pts`;
    document.getElementById(container.p3Dept).textContent = `${sorted[2].dept} ${sorted[2].year}`;
    wirePodiumDetail(container.p3Name, container.p3Hover, sorted[2]);
  } else {
    document.getElementById(container.p3Name).textContent = '--';
    document.getElementById(container.p3Score).textContent = '0 pts';
    document.getElementById(container.p3Dept).textContent = '--';
    wirePodiumDetail(container.p3Name, container.p3Hover, null);
  }

  // Personal Rank Banner calculations
  const valueEl = document.getElementById('personal-rank-value');
  const subEl = document.getElementById('personal-rank-sub');

  if (valueEl && subEl) {
    if (state.loggedInUser && state.loggedInUser.role !== 'admin') {
      const rankIdx = sorted.findIndex(s => s.id === state.loggedInUser.id);
      if (rankIdx !== -1) {
        const scoreVal = scoreFor(sorted[rankIdx]);
        valueEl.textContent = `#${rankIdx + 1}`;
        subEl.innerHTML = `You are ranked <strong>#${rankIdx + 1}</strong> of ${sorted.length} active members with <strong>${scoreVal}</strong> ${timeLabel} points.`;
      } else {
        valueEl.textContent = '--';
        subEl.textContent = 'Link coding profiles to rank on the active leaderboard.';
      }
    } else {
      valueEl.textContent = '--';
      subEl.textContent = 'Sign In to check your relative leaderboard rank.';
    }
  }

  // Render Full Leaderboard table
  const tbody = document.getElementById('leaderboard-table-body');
  const adminFullCard = document.getElementById('leaderboard-admin-full');
  if (adminFullCard) {
    adminFullCard.classList.toggle('d-none', state.viewMode !== 'admin');
  }

  if (tbody) {
    tbody.innerHTML = '';
    sorted.forEach((s, idx) => {
      const tr = document.createElement('tr');

      const tdRank = document.createElement('td');
      tdRank.style.textAlign = 'center';
      let rankHtml = `<span class="number-font">${idx + 1}</span>`;
      if (idx === 0) rankHtml = '<span class="rank-badge rank-1">🥇</span>';
      else if (idx === 1) rankHtml = '<span class="rank-badge rank-2">🥈</span>';
      else if (idx === 2) rankHtml = '<span class="rank-badge rank-3">🥉</span>';
      tdRank.innerHTML = rankHtml;
      tr.appendChild(tdRank);

      const dispLeaderboardName = showMasked ? (idx < 3 ? s.name : 'Anonymous Member') : s.name;
      const dispRoll = showMasked && idx >= 3 ? '••••••••' : s.roll;
      const tdName = document.createElement('td');
      tdName.innerHTML = `
        <div class="student-meta">
          <span class="student-name" style="font-weight:700;">${dispLeaderboardName}</span>
          <span class="student-roll" style="display:block; font-size:0.75rem;">${dispRoll}</span>
        </div>
      `;
      tr.appendChild(tdName);

      const tdDept = document.createElement('td');
      tdDept.innerHTML = `<div style="font-weight: 500;">${s.dept}</div><div class="kpi-subtext" style="font-size: 0.75rem;">${s.year}</div>`;
      tr.appendChild(tdDept);

      const tdGit = document.createElement('td');
      tdGit.className = 'number-font';
      tdGit.style.textAlign = 'center';
      const gitVal = githubValFor(s);
      const gitTier = getActivityTier(s.githubLastActiveDate);
      tdGit.innerHTML = `
        <span style="display: inline-flex; align-items: center; gap: 0.35rem; justify-content: center; width: 100%;">
          ${gitVal}
          ${s.github ? `<span style="color: ${gitTier.color}; font-size: 0.9rem;" title="${gitTier.githubTitle}">●</span>` : ''}
        </span>
      `;
      tr.appendChild(tdGit);

      const tdLc = document.createElement('td');
      tdLc.className = 'number-font';
      tdLc.style.textAlign = 'center';
      const lcVal = leetcodeValFor(s);
      const lcTier = getActivityTier(s.leetcodeLastActiveDate);
      tdLc.innerHTML = `
        <span style="display: inline-flex; align-items: center; gap: 0.35rem; justify-content: center; width: 100%;">
          <span style="font-weight: 600;">${lcVal}</span> <span class="kpi-subtext" style="font-size: 0.7rem;">(${lcVal * 10} pts)</span>
          ${s.leetcode ? `<span style="color: ${lcTier.color}; font-size: 0.9rem;" title="${lcTier.leetcodeTitle}">●</span>` : ''}
        </span>
      `;
      tr.appendChild(tdLc);

      const tdScore = document.createElement('td');
      tdScore.className = 'number-font';
      tdScore.style.textAlign = 'center';
      tdScore.style.fontWeight = '700';
      tdScore.style.color = 'var(--accent-orange)';
      tdScore.textContent = scoreFor(s);
      tr.appendChild(tdScore);

      tbody.appendChild(tr);
    });
  }
}

// Profile details
function renderProfileView() {
  const unauth = document.getElementById('profile-unauth-container');
  const auth = document.getElementById('profile-auth-container');

  if (!state.loggedInUser) {
    unauth.classList.remove('d-none');
    auth.classList.add('d-none');
    return;
  }

  unauth.classList.add('d-none');
  auth.classList.remove('d-none');

  const photoImg = document.getElementById('profile-photo-img');
  if (photoImg) {
    photoImg.onerror = function() { this.onerror = null; this.src = logoClubUrl; };
    photoImg.src = state.loggedInUser.photo || logoClubUrl;
  }

  const profileCardTitle = document.querySelector('#profile-auth-container h3');
  const nameLabel = document.getElementById('profile-student-name')?.previousElementSibling;
  const rollLabel = document.getElementById('profile-student-roll')?.previousElementSibling;

  if (state.loggedInUser.role === 'admin') {
    if (profileCardTitle) profileCardTitle.textContent = 'Admin Profile';
    if (nameLabel) nameLabel.textContent = 'Admin Name';
    if (rollLabel) rollLabel.textContent = 'Admin Code';
    
    document.getElementById('profile-student-name').value = state.loggedInUser.name;
    document.getElementById('profile-student-roll').value = state.loggedInUser.roll;
    
    // Hide inputs and action buttons for Admin
    document.getElementById('profile-github-group').classList.add('d-none');
    document.getElementById('profile-leetcode-group').classList.add('d-none');
    document.getElementById('profile-linkedin-group').classList.add('d-none');

    // Keep About / Bio and Update button visible for Admin bio updates
    document.getElementById('profile-about-group').classList.remove('d-none');
    document.getElementById('profile-update-btn').classList.remove('d-none');
    document.getElementById('profile-about').value = state.loggedInUser.about || '';

    // Hide CV Review, Certifications, and Connections cards for Admin
    const cardCv = document.getElementById('profile-cv-card');
    const cardCerts = document.getElementById('profile-certifications-card');
    const cardConnections = document.getElementById('profile-connections-card');
    if (cardCv) cardCv.classList.add('d-none');
    if (cardCerts) cardCerts.classList.add('d-none');
    if (cardConnections) cardConnections.classList.add('d-none');
  } else {
    if (profileCardTitle) profileCardTitle.textContent = 'Student Coding Profiles';
    if (nameLabel) nameLabel.textContent = 'Student Name';
    if (rollLabel) rollLabel.textContent = 'Register / Roll Number';

    // Show them for student members
    document.getElementById('profile-github-group').classList.remove('d-none');
    document.getElementById('profile-leetcode-group').classList.remove('d-none');
    document.getElementById('profile-linkedin-group').classList.remove('d-none');
    document.getElementById('profile-about-group').classList.remove('d-none');
    document.getElementById('profile-update-btn').classList.remove('d-none');

    const cardCv = document.getElementById('profile-cv-card');
    const cardCerts = document.getElementById('profile-certifications-card');
    const cardConnections = document.getElementById('profile-connections-card');
    if (cardCv) cardCv.classList.remove('d-none');
    if (cardCerts) cardCerts.classList.remove('d-none');
    if (cardConnections) cardConnections.classList.remove('d-none');
    const s = state.loggedInUser;
    document.getElementById('profile-student-name').value = s.name;
    document.getElementById('profile-student-roll').value = s.roll;
    renderMyCertifications();
    
    document.getElementById('profile-github').value = s.github || '';
    document.getElementById('profile-phone').value = s.phone || '';
    document.getElementById('profile-whatsapp').value = s.whatsapp || '';
    document.getElementById('profile-leetcode').value = s.leetcode || '';
    document.getElementById('profile-linkedin').value = s.linkedin || '';
    document.getElementById('profile-about').value = s.about || '';

    document.getElementById('profile-github').disabled = false;
    document.getElementById('profile-leetcode').disabled = false;
    document.getElementById('profile-linkedin').disabled = false;

    const cvBadge = document.getElementById('profile-cv-status-badge');
    const cvFeedback = document.getElementById('profile-cv-feedback');

    if (s.cvUrl) {
      let badgeClass = 'badge-pending';
      let text = 'Pending Review';
      if (s.cvStatus === 'Approved') {
        badgeClass = 'badge-approved';
        text = 'Approved (Good CV)';
      } else if (s.cvStatus === 'Needs Revision') {
        badgeClass = 'badge-revision';
        text = 'Needs Revision';
      }
      cvBadge.innerHTML = `<span class="badge ${badgeClass}">${text} (${s.cvUrl})</span>`;
      cvFeedback.textContent = s.cvFeedback || 'Review pending. The admin will write assessment remarks here.';
    } else {
      cvBadge.innerHTML = '<span class="badge badge-inactive">No CV Uploaded</span>';
      cvFeedback.textContent = 'Upload your PDF resume to have the CSE department placement cell verify it.';
    }

    // Render Followed Connections
    const followingContainer = document.getElementById('profile-following-list');
    if (followingContainer) {
      followingContainer.innerHTML = '';
      const list = state.followingList || [];
      if (list.length === 0) {
        followingContainer.innerHTML = '<span class="kpi-subtext" style="font-size: 0.72rem; padding: 0.25rem 0;">You are not following any members yet.</span>';
      } else {
        list.forEach(id => {
          const match = state.students.find(s => s.id === id);
          if (match) {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed var(--border-color);';
            row.innerHTML = `
              <div style="display:flex; flex-direction:column;">
                <span style="font-size: 0.78rem; font-weight: 600; color: var(--text-primary);">${match.name}</span>
                <span class="kpi-subtext" style="font-size: 0.65rem;">${match.dept} • ${match.year}</span>
              </div>
              <button class="action-btn danger-btn" style="padding: 0.15rem 0.35rem; font-size: 0.65rem; border-radius: 4px;" onclick="window.toggleFollowStudent('${match.id}')">Unfollow</button>
            `;
            followingContainer.appendChild(row);
          }
        });
      }
    }
  }
}

function renderAnnouncementsList() {
  const announcementsContainer = document.getElementById('announcements-list-container');

  if (!announcementsContainer) return;

  announcementsContainer.innerHTML = '';
  renderPollsList();

  // Render Notices
  const notices = [...state.notifications];
  notices.sort((a, b) => {
    if (a.isPinnedAd && !b.isPinnedAd) return -1;
    if (!a.isPinnedAd && b.isPinnedAd) return 1;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  if (notices.length === 0) {
    announcementsContainer.innerHTML = `
      <div class="text-center" style="padding: 2rem; color: var(--text-secondary); background-color: var(--accent-bg); border-radius: 0.5rem;">
        No announcements broadcasted yet.
      </div>
    `;
  } else {
    notices.forEach(n => {
      const card = document.createElement('div');
      card.className = `notif-card ${n.type}`;
      
      const date = new Date(n.timestamp).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      let editControls = '';
      if (state.viewMode === 'admin') {
        editControls = `
          <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 0.25rem;">
            <button class="action-btn" style="padding: 0.15rem 0.35rem; font-size: 0.65rem;" data-edit-id="${n.id}">Edit</button>
            <button class="action-btn danger-btn" style="padding: 0.15rem 0.35rem; font-size: 0.65rem;" data-del-id="${n.id}">Delete</button>
          </div>
        `;
      }

      let mediaPreviewHtml = '';
      if (n.attachment) {
        if (n.attachmentType === 'video') {
          mediaPreviewHtml = `
            <div style="margin-top: 0.5rem; display: flex; justify-content: center; background-color: rgba(0, 0, 0, 0.05); border-radius: 6px; padding: 0.25rem;">
              <video src="${n.attachment}" controls style="max-width: 100%; max-height: 220px; border-radius: 4px;"></video>
            </div>
          `;
        } else {
          mediaPreviewHtml = `
            <div style="margin-top: 0.5rem; display: flex; justify-content: center;">
              <img src="${n.attachment}" loading="lazy" style="max-width: 100%; max-height: 220px; border-radius: 6px; object-fit: cover;" alt="Attachment Image">
            </div>
          `;
        }
      }

      let linkButtonHtml = '';
      if (n.buttonUrl && /^https?:\/\//i.test(n.buttonUrl)) {
        linkButtonHtml = `
          <div style="margin-top: 0.5rem;">
            <a href="${n.buttonUrl}" target="_blank" rel="noopener noreferrer" class="action-btn primary-btn" style="display: inline-block; text-decoration: none; padding: 0.4rem 0.9rem; font-size: 0.78rem;">${n.buttonLabel || 'Open Link'}</a>
          </div>
        `;
      }

      card.innerHTML = `
        ${editControls}
        <div class="notif-meta">
          <span>From: <strong>${n.sender || 'Admin'}</strong></span>
        </div>
        <h3 class="notif-title" style="padding-right: 80px; font-size: 0.92rem;">${n.title} ${n.isPinnedAd ? '<span class="ad-banner-badge" style="font-size:0.5rem; vertical-align:middle; margin-left: 0.25rem;">Pinned Ad</span>' : ''}</h3>
        <p class="notif-body" style="font-size:0.82rem; margin-bottom: 0.5rem;">${n.content}</p>
        ${mediaPreviewHtml}
        ${linkButtonHtml}
        <div style="text-align: right; margin-top: 0.5rem;">
          <span class="number-font" style="font-size: 0.68rem; color: var(--text-secondary); opacity: 0.85;">${date}</span>
        </div>
      `;

      if (state.viewMode === 'admin') {
        card.querySelector(`[data-edit-id="${n.id}"]`).addEventListener('click', () => editAnnouncement(n.id));
        card.querySelector(`[data-del-id="${n.id}"]`).addEventListener('click', () => deleteAnnouncement(n.id));
      }

      announcementsContainer.appendChild(card);
    });
  }

}

window.openEvaluationModal = openEvaluationModal;

function showToast(message, duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: #111827;
    color: #ffffff;
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
    font-family: 'Outfit';
    border-left: 3px solid var(--accent-orange);
    animation: slideIn 0.3s ease forwards;
    pointer-events: auto;
    min-width: 200px;
    margin-top: 0.25rem;
  `;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function handleExportExcelDatabase() {
  if (state.viewMode !== 'admin') {
    alert("Unauthorized access. Admin privileges required.");
    return;
  }

  // Generate CSV rows
  const headers = ["S.No.", "Student Name", "Roll / Admission", "Department", "Academic Year", "Phone Number", "GitHub Contributions", "LeetCode Solved", "Total Points", "CV Status", "CV Remarks", "Status"];
  const rows = state.students.map((s, idx) => [
    idx + 1,
    `"${s.name.replace(/"/g, '""')}"`,
    `"${s.roll}"`,
    `"${s.dept}"`,
    `"${s.year}"`,
    `"${(s.phone || '').replace(/"/g, '""')}"`,
    s.githubContributions || 0,
    s.leetcodeSolved || 0,
    s.score || 0,
    `"${s.cvStatus || 'No CV'}"`,
    `"${(s.cvFeedback || '').replace(/"/g, '""')}"`,
    s.active ? "Active" : "Inactive"
  ]);

  const csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Al_Ameen_DevClub_Members_${new Date().toISOString().substring(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast("Database exported successfully.");
}

window.toggleFollowStudent = function(studentId) {
  if (!state.followingList) {
    state.followingList = [];
  }

  const index = state.followingList.indexOf(studentId);
  if (index === -1) {
    state.followingList.push(studentId);
    showToast("You are now following this member.");
  } else {
    state.followingList.splice(index, 1);
    showToast("Unfollowed.");
  }

  saveCurrentState();
  
  // Refresh views
  if (state.currentTab === 'view-leaderboard') {
    renderLeaderboard();
  }
  if (state.currentTab === 'view-profile') {
    renderProfileView();
  }
  if (state.currentTab === 'view-admin-dashboard') {
    renderDirectoryList();
  }
};

window.approveStudentAsVolunteer = async function(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;
  
  // Check duplicate volunteer
  const isAlready = state.volunteers.some(v => v && v.name && student.name && v.name.toLowerCase() === student.name.toLowerCase());
  if (isAlready) {
    alert(`${student.name} is already listed as a volunteer.`);
    return;
  }

  const role = await window.showCustomPrompt("Approve Volunteer", `Approve ${student.name} as a Volunteer.\nEnter volunteer committee position (e.g. Technical Lead, Joint Secretary, Club Coordinator):`, "Club Coordinator");
  if (!role) return;

  const cleanPhone = student.phone || "+91 94420 12345";
  const whatsapp = cleanPhone.replace(/[^0-9]/g, '');

  const newVol = {
    id: `vol_${Date.now()}`,
    name: student.name,
    role: role,
    dept: `${student.year.substring(0, 3)} ${student.dept}`, // formats "3rd Yr CSE"
    phone: cleanPhone,
    whatsapp: whatsapp,
    linkedin: student.linkedin || ''
  };

  state.volunteers.push(newVol);
  saveCurrentState();
  saveVolunteerToCloud(newVol); // sync so every other user/device sees this volunteer
  
  alert(`Successfully approved ${student.name} as a Volunteer!`);
  renderVolunteersList();
  renderDirectoryList();
};

window.editVolunteerRole = async function(volId) {
  const vol = state.volunteers.find(v => v.id === volId);
  if (!vol) return;
  const newRole = await window.showCustomPrompt("Edit Position", `Edit volunteer position role for ${vol.name}:`, vol.role);
  if (newRole !== null) {
    vol.role = newRole.trim() || 'Volunteer';
    saveCurrentState();
    saveVolunteerToCloud(vol); // sync the edit to every other user/device
    renderVolunteersList();
    showToast(`⭐ Volunteer position updated successfully!`);
  }
};

window.viewStudentProfileDetails = function(studentId) {
  const s = state.students.find(stud => stud.id === studentId);
  if (!s) return;

  const isVol = state.volunteers.some(v => v && v.name && s.name && v.name.toLowerCase() === s.name.toLowerCase());
  const currentVol = state.volunteers.find(v => v && v.name && s.name && v.name.toLowerCase() === s.name.toLowerCase());
  const positionText = isVol ? currentVol.role : 'None (Regular Member)';

  let adminActions = '';

  const detailBody = document.getElementById('profile-details-body');
  if (detailBody) {
    detailBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <div style="text-align: center; margin-bottom: 0.5rem;">
          <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, var(--primary-blue), var(--accent-orange)); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.5rem; margin: 0 auto 0.5rem auto;">
            ${(s.name || 'Student').split(' ').filter(Boolean).map(n => n[0]).join('').substring(0, 2)}
          </div>
          <h4 style="margin: 0; font-size: 1.1rem; font-weight: 700;">${s.name}</h4>
          <p class="kpi-subtext" style="margin: 0.25rem 0 0 0;">Roll No: ${s.roll}</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.5rem; background-color: var(--accent-bg); padding: 1rem; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Email ID:</span><span class="detail-val" style="font-weight: 600;">${s.email || 'Not Shared'}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Department:</span><span class="detail-val" style="font-weight: 600;">${s.dept}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Academic Year:</span><span class="detail-val" style="font-weight: 600;">${s.year}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Mobile Number:</span><span class="detail-val" style="font-weight: 600;">${s.phone || 'Not Configured'}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">WhatsApp Number:</span><span class="detail-val" style="font-weight: 600;">${s.whatsapp || 'Not Configured'}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Volunteer Position:</span><span class="detail-val" style="font-weight: 700; color: var(--accent-orange);">${positionText}</span></div>
        </div>

        ${state.viewMode === 'admin' ? '' : `
        <div style="font-size: 0.85rem; color: var(--text-secondary); background: var(--card-bg); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 6px;">
          <strong style="color: var(--primary-blue-light); display: block; margin-bottom: 0.25rem; font-size: 0.75rem; text-transform: uppercase;">About / Bio</strong>
          ${s.about || 'This member has not written a bio yet.'}
        </div>
        `}

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <h5 style="margin: 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Current Activity</h5>
          <div style="font-size: 0.85rem;">
            ${s.active
              ? '<span class="badge badge-active">Active</span>'
              : '<span class="badge badge-inactive">Inactive</span>'}
          </div>

          <h5 style="margin: 0.5rem 0 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">🐙 GitHub</h5>
          ${!s.github ? '<p class="kpi-subtext" style="font-size: 0.8rem;">Not connected.</p>' : (!s.githubVerified ? '<p class="kpi-subtext" style="font-size: 0.8rem; color: #eab308;">⚠ Unverified — click Refresh in Admin Dashboard.</p>' : `
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Overall (this year) — Active Days:</span><span class="detail-val number-font" style="font-weight: 700;">${s.githubContributions || 0} (${(s.githubContributions || 0) * 10} pts)</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">This Month — Active Days:</span><span class="detail-val number-font" style="font-weight: 700; color: var(--accent-orange);">${s.githubContributionsCalendarMonth || 0} (${(s.githubContributionsCalendarMonth || 0) * 10} pts)</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Last 30 Days — Active Days:</span><span class="detail-val number-font" style="font-weight: 700; color: var(--accent-orange);">${s.githubContributionsMonth || 0} (${(s.githubContributionsMonth || 0) * 10} pts)</span></div>
          `)}

          <h5 style="margin: 0.5rem 0 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">🟧 LeetCode</h5>
          ${!s.leetcode ? '<p class="kpi-subtext" style="font-size: 0.8rem;">Not connected.</p>' : (!s.leetcodeVerified ? '<p class="kpi-subtext" style="font-size: 0.8rem; color: #eab308;">⚠ Unverified — click Refresh in Admin Dashboard.</p>' : `
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Overall — Problems Solved:</span><span class="detail-val number-font" style="font-weight: 700;">${s.leetcodeSolved || 0} (${(s.leetcodeSolved || 0) * 10} pts)</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">This Month — Problems Solved:</span><span class="detail-val number-font" style="font-weight: 700; color: var(--accent-orange);">${s.leetcodeSolvedCalendarMonth || 0} (${(s.leetcodeSolvedCalendarMonth || 0) * 10} pts)</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Last 30 Days — Problems Solved:</span><span class="detail-val number-font" style="font-weight: 700; color: var(--accent-orange);">${s.leetcodeSolvedMonth || 0} (${(s.leetcodeSolvedMonth || 0) * 10} pts)</span></div>
          `)}

          <h5 style="margin: 0.5rem 0 0; font-size: 0.85rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Score</h5>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Overall (this year):</span><span class="detail-val number-font" style="font-weight: 700;">${s.score || 0}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">This Month:</span><span class="detail-val number-font" style="font-weight: 700;">${s.scoreCalendarMonth || 0}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 0.85rem;"><span class="detail-label">Last 30 Days:</span><span class="detail-val number-font" style="font-weight: 700;">${s.scoreLast30Days || s.scoreMonth || 0}</span></div>

          <p class="kpi-subtext" style="font-size: 0.68rem; margin-top: 0.25rem; line-height: 1.4; text-align: left;">💡 Points Formula: <strong>(GitHub Active Days × 10) + (LeetCode Problems Solved × 10)</strong>, per window. Activity status (🟢/⚪) is always based on the latest 30 days regardless of which window you're viewing.</p>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Direct Profile Handles:</span>
          <div style="display: flex; gap: 0.5rem;">
            ${getDirectContactIconsHtml(s)}
          </div>
        </div>

        ${adminActions}
      </div>
    `;
  }

  openModal('modal-student-profile-details');
};

window.promoteFromProfile = function(studentId) {
  closeModal('modal-student-profile-details');
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;

  const currentVol = state.volunteers.find(v => v && v.name && student.name && v.name.toLowerCase() === student.name.toLowerCase());
  if (currentVol) {
    window.editVolunteerRole(currentVol.id);
  } else {
    window.approveStudentAsVolunteer(studentId);
  }
};

window.viewStudentProfileDetailsForVolunteer = function(volName) {
  const sMatch = state.students.find(s => s && s.name && volName && s.name.toLowerCase() === volName.toLowerCase());
  if (sMatch) {
    window.viewStudentProfileDetails(sMatch.id);
  } else {
    alert(`This volunteer (${volName}) has not registered a Student profile on the Dev Club Dashboard yet.`);
  }
};

function getDirectContactIconsHtml(studentOrVol) {
  const gh = studentOrVol.github || '';
  const lc = studentOrVol.leetcode || '';
  let li = studentOrVol.linkedin || '';
  const phone = studentOrVol.phone || '';
  const whatsapp = studentOrVol.whatsapp || '';

  // For volunteers, try to lookup corresponding student details
  const isVol = !!studentOrVol.role;
  let finalGh = gh;
  let finalLc = lc;
  let finalLi = li;

  if (isVol) {
    const sMatch = state.students.find(s => s && s.name && studentOrVol.name && s.name.toLowerCase() === studentOrVol.name.toLowerCase());
    if (sMatch) {
      if (!finalGh) finalGh = sMatch.github || '';
      if (!finalLc) finalLc = sMatch.leetcode || '';
      if (!finalLi) finalLi = sMatch.linkedin || '';
    }
  }

  // 1. GitHub
  let ghIcon = `
    <div class="tooltip-wrapper">
      <a href="javascript:void(0)" onclick="alert('This Developer Club member has not configured their GitHub handle yet.')" style="color: var(--text-primary); opacity: 0.45; display: inline-flex;">${getIconSvg('github', 15)}</a>
      <span class="tooltip-text">GitHub (Not Configured)</span>
    </div>
  `;
  if (finalGh) {
    ghIcon = `
      <div class="tooltip-wrapper">
        <a href="https://github.com/${finalGh}" target="_blank" style="color: var(--text-primary); display: inline-flex;">${getIconSvg('github', 15)}</a>
        <span class="tooltip-text">GitHub</span>
      </div>
    `;
  }

  // 2. LeetCode
  let lcIcon = `
    <div class="tooltip-wrapper">
      <a href="javascript:void(0)" onclick="alert('This Developer Club member has not configured their LeetCode handle yet.')" style="color: var(--accent-orange); opacity: 0.45; display: inline-flex;">${getIconSvg('leetcode', 14)}</a>
      <span class="tooltip-text">LeetCode (Not Configured)</span>
    </div>
  `;
  if (finalLc) {
    lcIcon = `
      <div class="tooltip-wrapper">
        <a href="https://leetcode.com/${finalLc}" target="_blank" style="color: var(--accent-orange); display: inline-flex;">${getIconSvg('leetcode', 14)}</a>
        <span class="tooltip-text">LeetCode</span>
      </div>
    `;
  }

  // 3. LinkedIn
  let liIcon = `
    <div class="tooltip-wrapper">
      <a href="javascript:void(0)" onclick="alert('This Developer Club member has not configured their LinkedIn profile yet.')" style="color: #0077b5; opacity: 0.45; display: inline-flex;">${getIconSvg('linkedin', 15)}</a>
      <span class="tooltip-text">LinkedIn (Not Configured)</span>
    </div>
  `;
  if (finalLi) {
    liIcon = `
      <div class="tooltip-wrapper">
        <a href="https://linkedin.com/in/${finalLi}" target="_blank" style="color: #0077b5; display: inline-flex;">${getIconSvg('linkedin', 15)}</a>
        <span class="tooltip-text">LinkedIn</span>
      </div>
    `;
  }

  // 4. WhatsApp
  const phoneVal = phone || "+91 94420 12345";
  const cleanWa = (whatsapp || phoneVal).replace(/[^0-9]/g, '');
  const waIcon = `
    <div class="tooltip-wrapper">
      <a href="https://wa.me/${cleanWa}" target="_blank" style="color: #25d366; display: inline-flex;">${getIconSvg('whatsapp', 15)}</a>
      <span class="tooltip-text">WhatsApp</span>
    </div>
  `;

  // 5. Call
  const callIcon = `
    <div class="tooltip-wrapper">
      <a href="tel:${phoneVal}" style="color: var(--primary-blue); display: inline-flex;">${getIconSvg('phone', 14)}</a>
      <span class="tooltip-text">Call</span>
    </div>
  `;

  return `
    <div style="display: flex; gap: 0.45rem; justify-content: center; align-items: center; min-width: 110px;">
      ${ghIcon}
      ${lcIcon}
      ${liIcon}
      ${waIcon}
      ${callIcon}
    </div>
  `;
}

function initBackgroundAnimation() {
  const canvas = document.getElementById('canvas-ambient-particles');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
  }

  class Particle {
    constructor() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.vx = (Math.random() - 0.5) * 0.9; // Fluid speed
      this.vy = (Math.random() - 0.5) * 0.9;
      this.radius = Math.random() * 4 + 1.5;
      this.colorType = Math.random() > 0.5 ? 'blue' : 'orange';
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      
      if (this.colorType === 'blue') {
        ctx.fillStyle = isDark ? 'rgba(59, 130, 246, 0.55)' : 'rgba(30, 64, 175, 0.35)';
      } else {
        ctx.fillStyle = isDark ? 'rgba(234, 88, 12, 0.55)' : 'rgba(249, 115, 22, 0.35)';
      }
      ctx.fill();
    }
  }

  function initParticles() {
    particles = [];
    const count = Math.min(100, Math.floor((canvas.width * canvas.height) / 12000));
    for (let i = 0; i < count; i++) {
      particles.push(new Particle());
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lineColor = isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(30, 64, 175, 0.05)';
    const maxDistance = 140;

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDistance) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    particles.forEach(p => {
      p.update();
      p.draw();
    });

    requestAnimationFrame(animate);
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  animate();
}

function populateVolunteerAddStudentOptions() {
  const select = document.getElementById('volunteer-add-select-student');
  if (!select) return;
  
  select.innerHTML = '<option value="">-- Choose student roll number --</option>';
  
  state.students.forEach(s => {
    // Only display students who are not already volunteers
    const isAlreadyVol = state.volunteers.some(v => v && v.name && s.name && v.name.toLowerCase() === s.name.toLowerCase());
    if (!isAlreadyVol) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.roll} - ${s.name} (${s.dept})`;
      select.appendChild(opt);
    }
  });
}

async function uploadToSupabaseStorage(file) {
  if (state.dbMode === 'supabase' && state.supabaseClient) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { data, error } = await state.supabaseClient
        .storage
        .from('attachments')
        .upload(filePath, file);

      if (error) {
        console.error('Supabase storage upload error:', error);
        return null;
      }

      const { data: publicUrlData } = state.supabaseClient
        .storage
        .from('attachments')
        .getPublicUrl(filePath);

      return publicUrlData?.publicUrl;
    } catch (e) {
      console.error('Supabase storage exception:', e);
      return null;
    }
  }
  return null;
}

function readAttachmentPromise(fileInputId) {
  return new Promise(async (resolve) => {
    const input = document.getElementById(fileInputId);
    if (!input || !input.files || !input.files[0]) {
      resolve(null);
      return;
    }
    const file = input.files[0];
    // Kept well under Firestore's 1MB-per-document hard limit — base64
    // encoding adds roughly 33% overhead on top of the raw file size, and
    // the attachment shares its document with the rest of the
    // notification's fields. 2MB raw was comfortably over that limit,
    // which silently failed the sync for the whole announcement.
    if (file.size > 650 * 1024) {
      alert(`File "${file.name}" is too large. Maximum attachment size is 650 KB, since this data is stored directly in the database (no separate file storage is set up).`);
      input.value = '';
      resolve(null);
      return;
    }

    // Try Supabase Storage CDN upload in production
    if (state.dbMode === 'supabase' && state.supabaseClient) {
      showToast('Uploading attachment to Supabase Storage CDN...');
      const cdnUrl = await uploadToSupabaseStorage(file);
      if (cdnUrl) {
        showToast('Attachment uploaded to CDN successfully!');
        resolve({
          data: cdnUrl,
          type: file.type.startsWith('video/') ? 'video' : 'image'
        });
        return;
      }
    }

    // Read the real uploaded file and store it as an actual data URL, so
    // what gets shown in the feed is the photo the admin actually uploaded
    // — not a placeholder stock image.
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      resolve({
        data: dataUrl,
        type: file.type.startsWith('video/') ? 'video' : 'image'
      });
    } catch (err) {
      alert(`Unable to read "${file.name}": ${err.message}`);
      resolve(null);
    }
  });
}

window.customDialogCallbacks = null;

function showCustomDialog({ title, message, isPrompt, defaultValue, onConfirm, onCancel }) {
  document.getElementById('custom-dialog-title').textContent = title;
  document.getElementById('custom-dialog-message').textContent = message;
  
  const inputContainer = document.getElementById('custom-dialog-input-container');
  const textInput = document.getElementById('custom-dialog-text-input');
  
  if (isPrompt) {
    inputContainer.classList.remove('d-none');
    textInput.value = defaultValue || '';
  } else {
    inputContainer.classList.add('d-none');
  }
  
  window.customDialogCallbacks = { onConfirm, onCancel };
  openModal('modal-custom-dialog');
}

window.showCustomConfirm = function(title, message) {
  return new Promise((resolve) => {
    showCustomDialog({
      title,
      message,
      isPrompt: false,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false)
    });
  });
};

window.showCustomPrompt = function(title, message, defaultValue = '') {
  return new Promise((resolve) => {
    showCustomDialog({
      title,
      message,
      isPrompt: true,
      defaultValue,
      onConfirm: (val) => resolve(val),
      onCancel: () => resolve(null)
    });
  });
};

window.state = state;
window.handleLogout = handleLogout;
window.renderApp = renderApp;
window.saveCurrentState = saveCurrentState;
window.switchTab = switchTab;
window.switchViewMode = switchViewMode;

// Manually force a real fetch right now for one student, with visible
// success/failure feedback — for diagnosing why a stat looks wrong,
// instead of waiting on the 60-second background sync.
async function forceRefreshStudentStats(studentId) {
  const s = state.students.find(x => x.id === studentId);
  if (!s) return;
  if (!s.github && !s.leetcode) {
    showToast(`${s.name} has no GitHub or LeetCode username saved.`);
    return;
  }

  showToast(`⏳ Fetching real stats for ${s.name}...`);

  const githubStats = s.github ? await fetchGithubStats(s.github) : null;
  const leetcodeStats = s.leetcode ? await fetchLeetcodeStats(s.leetcode) : null;

  const lines = [];
  if (s.github) {
    lines.push(githubStats.verified
      ? `✅ GitHub (${s.github}): verified — ${githubStats.contributions} contributions`
      : `❌ GitHub (${s.github}): FAILED\n   ${githubStats.reasons.join('\n   ')}\n   Old value kept: ${s.githubContributions || 0}`);
  }
  if (s.leetcode) {
    lines.push(leetcodeStats.verified
      ? `✅ LeetCode (${s.leetcode}): verified — ${leetcodeStats.solved} solved`
      : `❌ LeetCode (${s.leetcode}): FAILED\n   ${leetcodeStats.reasons.join('\n   ')}\n   Old value kept: ${s.leetcodeSolved || 0}`);
  }
  // Uses the native confirm() dialog (not overridden to a toast) so the
  // full multi-line diagnostic stays on screen and is actually readable.
  window.confirm(lines.join('\n\n') + '\n\n(Click OK or Cancel to close)');

  state.students = state.students.map(st => {
    if (st.id !== studentId) return st;
    return {
      ...st,
      githubContributions: githubStats && githubStats.hasRealMonthly ? githubStats.contributionsThisYear : (githubStats && githubStats.verified ? githubStats.contributions : (st.githubContributions || 0)),
      githubContributionsMonth: githubStats && githubStats.hasRealMonthly ? githubStats.contributionsLast30Days : (st.githubContributionsMonth || 0),
      githubContributionsCalendarMonth: githubStats && githubStats.hasRealMonthly ? githubStats.contributionsThisCalendarMonth : (st.githubContributionsCalendarMonth || 0),
      githubVerified: githubStats ? (githubStats.verified || st.githubVerified || false) : st.githubVerified,
      githubLastActiveDate: (githubStats && githubStats.lastActiveDate) || st.githubLastActiveDate || '',
      leetcodeSolved: leetcodeStats && leetcodeStats.verified ? leetcodeStats.solved : (st.leetcodeSolved || 0),
      leetcodeSolvedMonth: leetcodeStats && leetcodeStats.hasRealMonthly ? leetcodeStats.solvedLast30 : (st.leetcodeSolvedMonth || 0),
      leetcodeSolvedCalendarMonth: leetcodeStats && leetcodeStats.hasRealMonthly ? leetcodeStats.solvedThisCalendarMonth : (st.leetcodeSolvedCalendarMonth || 0),
      leetcodeVerified: leetcodeStats ? (leetcodeStats.verified || st.leetcodeVerified || false) : st.leetcodeVerified,
      leetcodeLastActiveDate: (leetcodeStats && leetcodeStats.lastActiveDate) || st.leetcodeLastActiveDate || ''
    };
  });
  saveCurrentState();
  renderApp();
}

// Browser push notifications for new club announcements. Asks permission
// once (browsers require this to be triggered by/near a user action, and
// remember the choice), then fires a real OS-level notification whenever
// admin posts a new announcement — separate from the in-app feed panel.
function requestNotificationPermission() {
  if (!('Notification' in window)) return; // Not supported in this browser
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(`📢 ${title}`, {
      body: body && body.length > 120 ? body.slice(0, 117) + '...' : (body || ''),
      icon: logoClubUrl
    });
  } catch (err) {
    console.warn('Browser notification failed to show:', err);
  }
}

function startAutomaticRealTimeCrawler() {
  const runSyncCycle = async () => {
    if (state.students && state.students.length > 0) {
      const updatedStudents = await Promise.all(state.students.map(async (s) => {
        if (!s.github && !s.leetcode) return s;

        const githubStats = s.github ? await fetchGithubStats(s.github) : null;
        const leetcodeStats = s.leetcode ? await fetchLeetcodeStats(s.leetcode) : null;

        if (githubStats && !githubStats.verified && githubStats.reasons.length) {
          console.warn(`GitHub sync failed for ${s.name} (${s.github}):`, githubStats.reasons);
        }
        if (leetcodeStats && !leetcodeStats.verified && leetcodeStats.reasons.length) {
          console.warn(`LeetCode sync failed for ${s.name} (${s.leetcode}):`, leetcodeStats.reasons);
        }

        // A transient fetch failure keeps the last verified values rather
        // than overwriting them with 0 or an invented estimate.
        return {
          ...s,
          githubContributions: githubStats && githubStats.hasRealMonthly ? githubStats.contributionsThisYear : (githubStats && githubStats.verified ? githubStats.contributions : (s.githubContributions || 0)),
          githubContributionsMonth: githubStats && githubStats.hasRealMonthly ? githubStats.contributionsLast30Days : (s.githubContributionsMonth || 0),
          githubContributionsCalendarMonth: githubStats && githubStats.hasRealMonthly ? githubStats.contributionsThisCalendarMonth : (s.githubContributionsCalendarMonth || 0),
          githubVerified: githubStats ? (githubStats.verified || s.githubVerified || false) : s.githubVerified,
          githubLastActiveDate: (githubStats && githubStats.lastActiveDate) || s.githubLastActiveDate || '',
          leetcodeSolved: leetcodeStats && leetcodeStats.verified ? leetcodeStats.solved : (s.leetcodeSolved || 0),
          leetcodeSolvedMonth: leetcodeStats && leetcodeStats.hasRealMonthly ? leetcodeStats.solvedLast30 : (s.leetcodeSolvedMonth || 0),
          leetcodeSolvedCalendarMonth: leetcodeStats && leetcodeStats.hasRealMonthly ? leetcodeStats.solvedThisCalendarMonth : (s.leetcodeSolvedCalendarMonth || 0),
          leetcodeVerified: leetcodeStats ? (leetcodeStats.verified || s.leetcodeVerified || false) : s.leetcodeVerified,
          leetcodeLastActiveDate: (leetcodeStats && leetcodeStats.lastActiveDate) || s.leetcodeLastActiveDate || ''
        };
      }));

      state.students = updatedStudents;
      saveCurrentState();
      renderApp();
    }
  };

  // Run once immediately on load — don't make the admin wait or click
  // Refresh manually just to see corrected data after a page open.
  runSyncCycle();
  // 15 minutes, not 60 seconds: GitHub/LeetCode contribution counts don't
  // meaningfully change minute-to-minute, and this loop re-fetches stats
  // for the whole roster every time it fires.
  setInterval(runSyncCycle, 15 * 60 * 1000);

  // Exposed so the "Re-sync All Now" admin button can trigger the exact
  // same real fetch logic on demand, with visible before/after feedback.
  window.__forceResyncAllStudents = async () => {
    const before = state.students.map(s => ({ id: s.id, gh: s.githubContributions, lc: s.leetcodeSolved }));
    await runSyncCycle();
    const changed = state.students.filter(s => {
      const prev = before.find(b => b.id === s.id);
      return prev && (prev.gh !== s.githubContributions || prev.lc !== s.leetcodeSolved);
    });
    return { total: state.students.length, changedCount: changed.length, changedNames: changed.map(s => s.name) };
  };
}
