/**
 * Firebase Configuration for Cross-Device Sync & Authentication
 * Real-time cloud sync across any mobile, laptop, and browser.
 */

// Default Firebase Configuration (Can be replaced with your Firebase Project keys)
// 1. Go to https://console.firebase.google.com/
// 2. Create a Project -> Add Web App
// 3. Enable Email/Password in Authentication
// 4. Create Cloud Firestore Database (in Test/Production mode)
const defaultFirebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Check for saved Firebase config in LocalStorage or use default
function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('fms_custom_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading saved Firebase config:', e);
  }
  return defaultFirebaseConfig;
}

let firebaseAuth = null;
let firestoreDb = null;
let isFirebaseReady = false;

function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded.');
      return false;
    }

    const config = getActiveFirebaseConfig();
    if (!config.apiKey || !config.projectId) {
      console.info('Firebase keys not configured yet. Running in offline/LocalStorage mode.');
      return false;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    
    firebaseAuth = firebase.auth();
    firestoreDb = firebase.firestore();
    
    // Enable offline persistence for Firestore if supported
    try {
      firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    } catch {}

    isFirebaseReady = true;
    console.log('Firebase initialized successfully for cross-device synchronization!');
    return true;
  } catch (err) {
    console.error('Firebase initialization error:', err);
    return false;
  }
}

// Save custom config from UI (optional helper)
function saveFirebaseConfig(configObj) {
  try {
    localStorage.setItem('fms_custom_firebase_config', JSON.stringify(configObj));
    location.reload();
  } catch (e) {
    console.error('Failed to save Firebase config:', e);
  }
}

// Auto-run initialization
initFirebase();
