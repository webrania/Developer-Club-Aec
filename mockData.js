const DEFAULT_DEPARTMENTS = [
  "CSE",
  "AIDS",
  "ECE",
  "EEE",
  "MECH",
  "IT"
];

export const YEARS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year"
];

const INITIAL_STUDENTS = [];
const INITIAL_NOTIFICATIONS = [];
const INITIAL_CHATS = [];
const INITIAL_VOLUNTEERS = [];
const INITIAL_POLLS = [];
const INITIAL_COURSES = [];
const INITIAL_CERTIFICATIONS = [];

// Safe Storage Wrappers
let inMemoryStorage = {};

export function safeGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return inMemoryStorage[key] || null;
  }
}

export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    inMemoryStorage[key] = value;
  }
}

export function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    delete inMemoryStorage[key];
  }
}

// Initialize database in localStorage
export function initLocalStorageDb() {
  if (!safeGetItem("alameen_students")) {
    safeSetItem("alameen_students", JSON.stringify(INITIAL_STUDENTS));
  }
  if (!safeGetItem("alameen_notifications")) {
    safeSetItem("alameen_notifications", JSON.stringify(INITIAL_NOTIFICATIONS));
  }
  if (!safeGetItem("alameen_departments")) {
    safeSetItem("alameen_departments", JSON.stringify(DEFAULT_DEPARTMENTS));
  }
  if (!safeGetItem("alameen_chats")) {
    safeSetItem("alameen_chats", JSON.stringify(INITIAL_CHATS));
  }
  if (!safeGetItem("alameen_volunteers")) {
    safeSetItem("alameen_volunteers", JSON.stringify(INITIAL_VOLUNTEERS));
  }
  if (!safeGetItem("alameen_polls")) {
    safeSetItem("alameen_polls", JSON.stringify(INITIAL_POLLS));
  }
  if (!safeGetItem("alameen_courses")) {
    safeSetItem("alameen_courses", JSON.stringify(INITIAL_COURSES));
  }
  if (!safeGetItem("alameen_certifications")) {
    safeSetItem("alameen_certifications", JSON.stringify(INITIAL_CERTIFICATIONS));
  }
}

// Get operations
export function getStudents() {
  initLocalStorageDb();
  try {
    return JSON.parse(safeGetItem("alameen_students")) || INITIAL_STUDENTS;
  } catch (e) {
    safeRemoveItem("alameen_students");
    return INITIAL_STUDENTS;
  }
}

export function getNotifications() {
  initLocalStorageDb();
  try {
    return JSON.parse(safeGetItem("alameen_notifications")) || INITIAL_NOTIFICATIONS;
  } catch (e) {
    safeRemoveItem("alameen_notifications");
    return INITIAL_NOTIFICATIONS;
  }
}

export function getDepartments() {
  initLocalStorageDb();
  try {
    return JSON.parse(safeGetItem("alameen_departments")) || DEFAULT_DEPARTMENTS;
  } catch (e) {
    safeRemoveItem("alameen_departments");
    return DEFAULT_DEPARTMENTS;
  }
}

export function getChats() {
  initLocalStorageDb();
  try {
    return JSON.parse(safeGetItem("alameen_chats")) || INITIAL_CHATS;
  } catch (e) {
    safeRemoveItem("alameen_chats");
    return INITIAL_CHATS;
  }
}

export function getVolunteers() {
  initLocalStorageDb();
  try {
    return JSON.parse(safeGetItem("alameen_volunteers")) || INITIAL_VOLUNTEERS;
  } catch (e) {
    safeRemoveItem("alameen_volunteers");
    return INITIAL_VOLUNTEERS;
  }
}

export function getPolls() {
  initLocalStorageDb();
  try {
    return JSON.parse(safeGetItem("alameen_polls")) || INITIAL_POLLS;
  } catch (e) {
    safeRemoveItem("alameen_polls");
    return INITIAL_POLLS;
  }
}

export function getCourses() {
  initLocalStorageDb();
  try {
    return JSON.parse(safeGetItem("alameen_courses")) || INITIAL_COURSES;
  } catch (e) {
    safeRemoveItem("alameen_courses");
    return INITIAL_COURSES;
  }
}

export function getCertifications() {
  initLocalStorageDb();
  try {
    return JSON.parse(safeGetItem("alameen_certifications")) || INITIAL_CERTIFICATIONS;
  } catch (e) {
    safeRemoveItem("alameen_certifications");
    return INITIAL_CERTIFICATIONS;
  }
}

// Save operations
export function saveStudents(students) {
  safeSetItem("alameen_students", JSON.stringify(students));
}

export function saveNotifications(notifications) {
  safeSetItem("alameen_notifications", JSON.stringify(notifications));
}

export function saveDepartments(departments) {
  safeSetItem("alameen_departments", JSON.stringify(departments));
}

export function saveChats(chats) {
  safeSetItem("alameen_chats", JSON.stringify(chats));
}

export function saveVolunteers(volunteers) {
  safeSetItem("alameen_volunteers", JSON.stringify(volunteers));
}

export function savePolls(polls) {
  safeSetItem("alameen_polls", JSON.stringify(polls));
}

export function saveCourses(courses) {
  safeSetItem("alameen_courses", JSON.stringify(courses));
}

export function saveCertifications(certifications) {
  safeSetItem("alameen_certifications", JSON.stringify(certifications));
}
