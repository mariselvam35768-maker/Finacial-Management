/**
 * Financial Management System - Main Logic
 * Supports Cross-Device Real-Time Cloud Sync (Firebase Auth + Firestore)
 * with Offline Encrypted LocalStorage Fallback.
 */

let currentUser = null;
let currentTransactions = [];
let currentFilter = 'all';
let searchQuery = '';
let firestoreUnsubscribe = null;

// Default sample data for new user registrations
const sampleInitialData = [
  {
    id: 'tx_' + Date.now() + '_1',
    type: 'income',
    title: 'Monthly Income',
    category: 'Salary',
    amount: 1700,
    date: new Date().toLocaleDateString('en-GB'),
    createdAt: Date.now()
  },
  {
    id: 'tx_' + Date.now() + '_2',
    type: 'expense',
    title: 'Demo',
    category: 'Daily Needs',
    amount: 500,
    date: new Date().toLocaleDateString('en-GB'),
    createdAt: Date.now() + 1
  }
];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  updateCloudStatusUI();

  // If Firebase is initialized, listen for Auth state changes
  if (typeof isFirebaseReady !== 'undefined' && isFirebaseReady && firebaseAuth) {
    firebaseAuth.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = {
          id: user.uid,
          name: user.displayName || user.email.split('@')[0],
          email: user.email
        };
        startFirestoreSync(user.uid);
        showDashboard();
      } else {
        stopFirestoreSync();
        // Check if there is an offline local session
        await checkLocalSession();
      }
    });
  } else {
    // LocalStorage fallback session
    await checkLocalSession();
  }

  // Close modals on clicking backdrop
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });
});

/* ================= CLOUD SYNC STATUS & SETTINGS ================= */

function updateCloudStatusUI() {
  const ready = typeof isFirebaseReady !== 'undefined' && isFirebaseReady;
  const cloudBtn = document.getElementById('cloudStatusBtn');
  const cloudText = document.getElementById('cloudStatusText');

  if (cloudBtn && cloudText) {
    if (ready) {
      cloudBtn.className = 'cloud-pill connected';
      cloudText.innerHTML = '<i class="fa-solid fa-cloud-bolt"></i> Cloud Active';
      cloudBtn.title = 'Connected to Firebase (Cross-Device Sync Enabled)';
    } else {
      cloudBtn.className = 'cloud-pill offline';
      cloudText.innerHTML = '<i class="fa-solid fa-cloud"></i> Connect Cloud';
      cloudBtn.title = 'Click to connect Firebase for Cross-Device Login';
    }
  }
}

function openCloudModal() {
  const config = typeof getActiveFirebaseConfig === 'function' ? getActiveFirebaseConfig() : {};
  document.getElementById('fbApiKey').value = config.apiKey || '';
  document.getElementById('fbAuthDomain').value = config.authDomain || '';
  document.getElementById('fbProjectId').value = config.projectId || '';
  document.getElementById('fbStorageBucket').value = config.storageBucket || '';
  document.getElementById('fbMessagingSenderId').value = config.messagingSenderId || '';
  document.getElementById('fbAppId').value = config.appId || '';

  document.getElementById('cloudModal').classList.add('active');
}

function handleSaveCloudConfig(event) {
  event.preventDefault();
  const configObj = {
    apiKey: document.getElementById('fbApiKey').value.trim(),
    authDomain: document.getElementById('fbAuthDomain').value.trim(),
    projectId: document.getElementById('fbProjectId').value.trim(),
    storageBucket: document.getElementById('fbStorageBucket').value.trim(),
    messagingSenderId: document.getElementById('fbMessagingSenderId').value.trim(),
    appId: document.getElementById('fbAppId').value.trim()
  };

  if (!configObj.apiKey || !configObj.projectId) {
    showToast('Please enter at least apiKey and projectId', 'error');
    return;
  }

  if (typeof saveFirebaseConfig === 'function') {
    saveFirebaseConfig(configObj);
  } else {
    localStorage.setItem('fms_custom_firebase_config', JSON.stringify(configObj));
    location.reload();
  }
}

function handleClearCloudConfig() {
  if (confirm('Reset Firebase Cloud configuration back to default?')) {
    localStorage.removeItem('fms_custom_firebase_config');
    location.reload();
  }
}

/* ================= AUTHENTICATION (FIREBASE + LOCAL) ================= */

function switchAuthTab(tab) {
  const signInForm = document.getElementById('signInForm');
  const signUpForm = document.getElementById('signUpForm');
  const tabSignInBtn = document.getElementById('tabSignInBtn');
  const tabSignUpBtn = document.getElementById('tabSignUpBtn');

  if (tab === 'signin') {
    signInForm.style.display = 'flex';
    signUpForm.style.display = 'none';
    tabSignInBtn.classList.add('active');
    tabSignUpBtn.classList.remove('active');
  } else {
    signInForm.style.display = 'none';
    signUpForm.style.display = 'flex';
    tabSignUpBtn.classList.add('active');
    tabSignInBtn.classList.remove('active');
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

/**
 * Sign Up Handler (Supports Cross-Device Firebase Auth with Local Fallback)
 */
async function handleSignUp(event) {
  event.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;

  if (!name || !email || !password) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Passwords do not match!', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  // --- 1. FIREBASE CLOUD SIGN UP (Cross-Device Enabled) ---
  if (typeof isFirebaseReady !== 'undefined' && isFirebaseReady && firebaseAuth) {
    try {
      showToast('Creating secure cloud account...', 'info');
      const userCred = await firebaseAuth.createUserWithEmailAndPassword(email, password);
      
      // Update display name
      if (userCred.user) {
        await userCred.user.updateProfile({ displayName: name });
        
        currentUser = {
          id: userCred.user.uid,
          name: name,
          email: email
        };

        // Create user document in Cloud Firestore
        if (firestoreDb) {
          try {
            await firestoreDb.collection('users').doc(userCred.user.uid).set({
              name: name,
              email: email,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Initialize default sample data in Firestore
            for (const sample of sampleInitialData) {
              await firestoreDb.collection('users').doc(userCred.user.uid)
                .collection('transactions').doc(sample.id).set(sample);
            }
          } catch (dbErr) {
            console.warn('Firestore initial data note:', dbErr);
          }
        }
      }

      document.getElementById('signUpForm').reset();
      showToast(`Welcome ${name}! Account created on Cloud.`, 'success');
      showDashboard();
      return;
    } catch (firebaseErr) {
      console.error('Firebase SignUp Error:', firebaseErr);
      let errMsg = 'Sign up failed. Please try again.';
      if (firebaseErr.code === 'auth/email-already-in-use') {
        errMsg = 'Account already exists for this email! Please Sign In.';
        switchAuthTab('signin');
        document.getElementById('signinEmail').value = email;
      } else if (firebaseErr.code === 'auth/invalid-email') {
        errMsg = 'Invalid email address.';
      } else if (firebaseErr.code === 'auth/weak-password') {
        errMsg = 'Password is too weak. Please use at least 6 characters.';
      } else if (firebaseErr.message) {
        errMsg = firebaseErr.message;
      }
      showToast(errMsg, 'error');
      return;
    }
  }

  // --- 2. LOCALSTORAGE ENCRYPTED SIGN UP (Offline / Local Fallback) ---
  try {
    const users = await getRegisteredUsers();
    const emailHash = await window.secureStorage.hashPassword(email);
    const existing = users.find(u => 
      (u.email && u.email.toLowerCase() === email) || 
      (u.emailHash && u.emailHash === emailHash)
    );

    if (existing) {
      showToast('Account already exists for this email! Switching to Sign In...', 'error');
      switchAuthTab('signin');
      document.getElementById('signinEmail').value = email;
      document.getElementById('signinPassword').focus();
      return;
    }

    const passwordHash = await window.secureStorage.hashPassword(password);
    
    const newUser = {
      id: 'usr_' + Date.now(),
      name: name,
      email: email,
      emailHash: emailHash,
      passwordHash: passwordHash,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await saveRegisteredUsers(users);

    currentUser = newUser;
    currentTransactions = [...sampleInitialData];
    await saveUserData();
    await setLocalSession(newUser);

    document.getElementById('signUpForm').reset();
    showToast('Account created locally! Welcome ' + name, 'success');
    showDashboard();
  } catch (err) {
    console.error('Local sign up error:', err);
    showToast('Sign up error: ' + (err.message || 'Please try again'), 'error');
  }
}

/**
 * Sign In Handler (Supports Cross-Device Firebase Auth with Local Fallback)
 */
async function handleSignIn(event) {
  event.preventDefault();
  const email = document.getElementById('signinEmail').value.trim().toLowerCase();
  const password = document.getElementById('signinPassword').value;

  if (!email || !password) {
    showToast('Please enter both email and password', 'error');
    return;
  }

  // --- 1. FIREBASE CLOUD SIGN IN (Cross-Device Enabled) ---
  if (typeof isFirebaseReady !== 'undefined' && isFirebaseReady && firebaseAuth) {
    try {
      showToast('Signing in to Cloud...', 'info');
      const userCred = await firebaseAuth.signInWithEmailAndPassword(email, password);
      
      if (userCred.user) {
        currentUser = {
          id: userCred.user.uid,
          name: userCred.user.displayName || userCred.user.email.split('@')[0],
          email: userCred.user.email
        };
        startFirestoreSync(userCred.user.uid);
      }

      document.getElementById('signinPassword').value = '';
      showToast(`Welcome back, ${currentUser.name}!`, 'success');
      showDashboard();
      return;
    } catch (firebaseErr) {
      console.error('Firebase SignIn Error:', firebaseErr);
      let errMsg = 'Invalid email or password.';
      if (firebaseErr.code === 'auth/user-not-found' || firebaseErr.code === 'auth/invalid-credential') {
        errMsg = 'No account found with these credentials. Please Sign Up first!';
      } else if (firebaseErr.code === 'auth/wrong-password') {
        errMsg = 'Incorrect password! Please check your password.';
      } else if (firebaseErr.code === 'auth/invalid-email') {
        errMsg = 'Please enter a valid email address.';
      } else if (firebaseErr.message) {
        errMsg = firebaseErr.message;
      }
      showToast(errMsg, 'error');
      return;
    }
  }

  // --- 2. LOCALSTORAGE ENCRYPTED SIGN IN (Offline / Local Fallback) ---
  try {
    const users = await getRegisteredUsers();

    if (!users || users.length === 0) {
      showToast('No registered accounts in this browser. Please Sign Up first or Connect Cloud!', 'error');
      switchAuthTab('signup');
      document.getElementById('signupEmail').value = email;
      return;
    }

    const emailHash = await window.secureStorage.hashPassword(email);
    const passwordHash = await window.secureStorage.hashPassword(password);

    const user = users.find(u => 
      (u.email && u.email.toLowerCase() === email) || 
      (u.emailHash && u.emailHash === emailHash)
    );

    if (!user) {
      showToast('No account found for this email. Please click Sign Up first!', 'error');
      return;
    }

    const isPasswordValid = (user.passwordHash && user.passwordHash === passwordHash) ||
                            (user.password && user.password === password);

    if (!isPasswordValid) {
      showToast('Incorrect password! Please try again.', 'error');
      return;
    }

    currentUser = user;
    await setLocalSession(user);
    await loadUserData();

    document.getElementById('signinPassword').value = '';
    showToast(`Welcome back, ${user.name || user.email}!`, 'success');
    showDashboard();
  } catch (err) {
    console.error('Sign in error:', err);
    showToast('Sign in failed: ' + (err.message || 'Please try again'), 'error');
  }
}

async function handleLogout() {
  try {
    if (typeof isFirebaseReady !== 'undefined' && isFirebaseReady && firebaseAuth) {
      await firebaseAuth.signOut();
    }
  } catch (e) {
    console.warn('Firebase logout note:', e);
  }

  stopFirestoreSync();
  localStorage.removeItem('fms_active_session');
  currentUser = null;
  currentTransactions = [];
  showToast('Logged out successfully', 'info');
  switchAuthTab('signin');
  showAuth();
}

function showAuth() {
  document.getElementById('authView').style.display = 'block';
  document.getElementById('dashboardView').style.display = 'none';
}

function showDashboard() {
  document.getElementById('authView').style.display = 'none';
  document.getElementById('dashboardView').style.display = 'block';
  
  if (currentUser) {
    document.getElementById('userNameDisplay').textContent = currentUser.name || currentUser.email.split('@')[0];
    document.getElementById('userAvatar').textContent = (currentUser.name || currentUser.email).charAt(0).toUpperCase();
  }
  
  renderDashboard();
}

/* ================= FIRESTORE REAL-TIME CLOUD SYNC ================= */

function startFirestoreSync(userId) {
  if (!firestoreDb || !userId) return;
  stopFirestoreSync();

  try {
    firestoreUnsubscribe = firestoreDb.collection('users').doc(userId)
      .collection('transactions')
      .onSnapshot((snapshot) => {
        const txList = [];
        snapshot.forEach((doc) => {
          txList.push({ id: doc.id, ...doc.data() });
        });

        // Sort descending by createdAt or date
        txList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (txList.length > 0) {
          currentTransactions = txList;
        } else if (currentTransactions.length === 0) {
          currentTransactions = [];
        }

        renderDashboard();
      }, (err) => {
        console.warn('Firestore snapshot error:', err);
      });
  } catch (err) {
    console.error('Failed to start Firestore sync:', err);
  }
}

function stopFirestoreSync() {
  if (firestoreUnsubscribe) {
    firestoreUnsubscribe();
    firestoreUnsubscribe = null;
  }
}

/* ================= LOCAL STORAGE ENCRYPTION & DATA MANAGEMENT ================= */

async function getRegisteredUsers() {
  try {
    const encryptedPayload = localStorage.getItem('fms_users_vault');
    if (!encryptedPayload) return [];
    const decrypted = await window.secureStorage.decryptData(encryptedPayload);
    if (!decrypted) return [];
    const parsed = JSON.parse(decrypted);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading registered users:', err);
    return [];
  }
}

async function saveRegisteredUsers(users) {
  try {
    const jsonString = JSON.stringify(users);
    const encrypted = await window.secureStorage.encryptData(jsonString);
    localStorage.setItem('fms_users_vault', encrypted);
  } catch (err) {
    console.error('Error saving registered users:', err);
  }
}

async function setLocalSession(user) {
  try {
    const sessionToken = await window.secureStorage.encryptData(
      JSON.stringify({ id: user.id, email: user.email, name: user.name, timestamp: Date.now() })
    );
    localStorage.setItem('fms_active_session', sessionToken);
  } catch (err) {
    console.error('Error saving session:', err);
  }
}

async function checkLocalSession() {
  try {
    const sessionToken = localStorage.getItem('fms_active_session');
    if (!sessionToken) {
      showAuth();
      return;
    }

    const decrypted = await window.secureStorage.decryptData(sessionToken);
    if (!decrypted) {
      showAuth();
      return;
    }

    const sessionObj = JSON.parse(decrypted);
    const users = await getRegisteredUsers();
    const user = users.find(u => (u.email && u.email.toLowerCase() === sessionObj.email?.toLowerCase()) || u.id === sessionObj.id);

    if (user) {
      currentUser = user;
      await loadUserData();
      showDashboard();
    } else {
      showAuth();
    }
  } catch (err) {
    console.error('Local session check failed:', err);
    showAuth();
  }
}

async function loadUserData() {
  if (!currentUser) return;
  try {
    const keyIdentifier = currentUser.emailHash || await window.secureStorage.hashPassword(currentUser.email);
    const storageKey = 'fms_data_' + keyIdentifier;
    const encryptedData = localStorage.getItem(storageKey);

    if (!encryptedData) {
      currentTransactions = [...sampleInitialData];
      await saveUserData();
      return;
    }

    const secretKey = currentUser.passwordHash || currentUser.email;
    const decrypted = await window.secureStorage.decryptData(encryptedData, secretKey);
    if (decrypted) {
      try {
        const parsed = JSON.parse(decrypted);
        currentTransactions = Array.isArray(parsed) ? parsed : [];
      } catch {
        currentTransactions = [];
      }
    } else {
      currentTransactions = [];
    }
  } catch (err) {
    console.error('Error loading user data:', err);
    currentTransactions = [];
  }
}

async function saveUserData() {
  if (!currentUser) return;
  try {
    const keyIdentifier = currentUser.emailHash || await window.secureStorage.hashPassword(currentUser.email);
    const storageKey = 'fms_data_' + keyIdentifier;
    const jsonString = JSON.stringify(currentTransactions);
    const secretKey = currentUser.passwordHash || currentUser.email;
    const encrypted = await window.secureStorage.encryptData(jsonString, secretKey);
    localStorage.setItem(storageKey, encrypted);
  } catch (err) {
    console.error('Error saving user data:', err);
  }
}

/* ================= MODALS & CRUD OPERATIONS (CLOUD + LOCAL) ================= */

function openIncomeModal() {
  document.getElementById('incomeSource').value = '';
  document.getElementById('incomeType').value = '';
  document.getElementById('incomeAmount').value = '';
  document.getElementById('incomeModal').classList.add('active');
  setTimeout(() => document.getElementById('incomeSource').focus(), 100);
}

function openExpenseModal() {
  document.getElementById('productName').value = '';
  document.getElementById('productType').value = '';
  document.getElementById('productCost').value = '';
  document.getElementById('expenseModal').classList.add('active');
  setTimeout(() => document.getElementById('productName').focus(), 100);
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

async function handleAddIncome(event) {
  event.preventDefault();
  const source = document.getElementById('incomeSource').value.trim();
  const type = document.getElementById('incomeType').value.trim();
  const amount = parseFloat(document.getElementById('incomeAmount').value);

  if (!source || !type || isNaN(amount) || amount <= 0) {
    showToast('Please enter valid income details', 'error');
    return;
  }

  const txId = 'tx_' + Date.now();
  const newTx = {
    id: txId,
    type: 'income',
    title: source,
    category: type,
    amount: amount,
    date: new Date().toLocaleDateString('en-GB'),
    createdAt: Date.now()
  };

  // 1. Cloud Firestore Sync
  if (typeof isFirebaseReady !== 'undefined' && isFirebaseReady && firestoreDb && currentUser) {
    try {
      await firestoreDb.collection('users').doc(currentUser.id)
        .collection('transactions').doc(txId).set(newTx);
    } catch (err) {
      console.warn('Firestore add error:', err);
    }
  }

  // 2. Local State & Storage
  currentTransactions.unshift(newTx);
  await saveUserData();
  closeModal('incomeModal');
  showToast('Income added successfully!', 'success');
  renderDashboard();
}

async function handleAddExpense(event) {
  event.preventDefault();
  const product = document.getElementById('productName').value.trim();
  const type = document.getElementById('productType').value.trim();
  const cost = parseFloat(document.getElementById('productCost').value);

  if (!product || !type || isNaN(cost) || cost <= 0) {
    showToast('Please enter valid product details', 'error');
    return;
  }

  const txId = 'tx_' + Date.now();
  const newTx = {
    id: txId,
    type: 'expense',
    title: product,
    category: type,
    amount: cost,
    date: new Date().toLocaleDateString('en-GB'),
    createdAt: Date.now()
  };

  // 1. Cloud Firestore Sync
  if (typeof isFirebaseReady !== 'undefined' && isFirebaseReady && firestoreDb && currentUser) {
    try {
      await firestoreDb.collection('users').doc(currentUser.id)
        .collection('transactions').doc(txId).set(newTx);
    } catch (err) {
      console.warn('Firestore add error:', err);
    }
  }

  // 2. Local State & Storage
  currentTransactions.unshift(newTx);
  await saveUserData();
  closeModal('expenseModal');
  showToast('Expense recorded successfully!', 'success');
  renderDashboard();
}

function openEditModal(id) {
  const item = currentTransactions.find(t => t.id === id);
  if (!item) return;

  document.getElementById('editItemId').value = item.id;
  document.getElementById('editItemType').value = item.type;
  document.getElementById('editTitle').value = item.title;
  document.getElementById('editCategory').value = item.category;
  document.getElementById('editAmount').value = item.amount;
  document.getElementById('editModalTitle').textContent = item.type === 'income' ? 'Edit Income' : 'Edit Expense';
  
  const submitBtn = document.getElementById('editSubmitBtn');
  if (item.type === 'income') {
    submitBtn.className = 'btn-modal-submit income-submit';
    submitBtn.textContent = 'Update Income';
  } else {
    submitBtn.className = 'btn-modal-submit expense-submit';
    submitBtn.textContent = 'Update Expense';
  }

  document.getElementById('editModal').classList.add('active');
}

async function handleUpdateTransaction(event) {
  event.preventDefault();
  const id = document.getElementById('editItemId').value;
  const title = document.getElementById('editTitle').value.trim();
  const category = document.getElementById('editCategory').value.trim();
  const amount = parseFloat(document.getElementById('editAmount').value);

  if (!title || !category || isNaN(amount) || amount <= 0) {
    showToast('Please fill all fields accurately', 'error');
    return;
  }

  const index = currentTransactions.findIndex(t => t.id === id);
  if (index !== -1) {
    currentTransactions[index].title = title;
    currentTransactions[index].category = category;
    currentTransactions[index].amount = amount;

    // 1. Cloud Firestore Sync
    if (typeof isFirebaseReady !== 'undefined' && isFirebaseReady && firestoreDb && currentUser) {
      try {
        await firestoreDb.collection('users').doc(currentUser.id)
          .collection('transactions').doc(id).update({
            title: title,
            category: category,
            amount: amount,
            updatedAt: Date.now()
          });
      } catch (err) {
        console.warn('Firestore update error:', err);
      }
    }
    
    await saveUserData();
    closeModal('editModal');
    showToast('Item updated successfully!', 'success');
    renderDashboard();
  }
}

async function handleDeleteTransaction(id) {
  if (confirm('Are you sure you want to delete this record?')) {
    // 1. Cloud Firestore Sync
    if (typeof isFirebaseReady !== 'undefined' && isFirebaseReady && firestoreDb && currentUser) {
      try {
        await firestoreDb.collection('users').doc(currentUser.id)
          .collection('transactions').doc(id).delete();
      } catch (err) {
        console.warn('Firestore delete error:', err);
      }
    }

    currentTransactions = currentTransactions.filter(t => t.id !== id);
    await saveUserData();
    showToast('Record deleted!', 'info');
    renderDashboard();
  }
}

/* ================= FILTERING & SEARCH ================= */

function setFilter(filterType) {
  currentFilter = filterType;
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
  });
  renderDashboard();
}

function handleSearch(query) {
  searchQuery = query.toLowerCase().trim();
  renderDashboard();
}

/* ================= DASHBOARD RENDERING ================= */

function formatCurrency(num) {
  return 'Rs.' + Number(num).toFixed(2);
}

function renderDashboard() {
  let totalIncome = 0;
  let totalExpense = 0;

  currentTransactions.forEach(t => {
    if (t.type === 'income') {
      totalIncome += Number(t.amount);
    } else if (t.type === 'expense') {
      totalExpense += Number(t.amount);
    }
  });

  const totalBalance = totalIncome - totalExpense;

  // Update Summary Header
  const balEl = document.getElementById('totalBalanceDisplay');
  const incEl = document.getElementById('totalIncomeDisplay');
  const expEl = document.getElementById('totalExpenseDisplay');

  if (balEl) balEl.textContent = formatCurrency(totalBalance);
  if (incEl) incEl.textContent = formatCurrency(totalIncome);
  if (expEl) expEl.textContent = formatCurrency(totalExpense);

  // Update Progress Fill Bar
  const totalFlow = totalIncome + totalExpense;
  const progressBarFill = document.getElementById('progressBarFill');
  if (progressBarFill) {
    if (totalFlow > 0) {
      const incomePercent = Math.min(100, Math.max(0, (totalIncome / totalFlow) * 100));
      progressBarFill.style.width = `${incomePercent}%`;
    } else {
      progressBarFill.style.width = '0%';
    }
  }

  // Filter & Search
  let filtered = currentTransactions.filter(t => {
    if (currentFilter !== 'all' && t.type !== currentFilter) return false;
    if (searchQuery) {
      const matchTitle = t.title ? t.title.toLowerCase().includes(searchQuery) : false;
      const matchCat = t.category ? t.category.toLowerCase().includes(searchQuery) : false;
      return matchTitle || matchCat;
    }
    return true;
  });

  const container = document.getElementById('transactionsContainer');
  const emptyState = document.getElementById('emptyState');

  if (!container) return;
  container.innerHTML = '';

  if (filtered.length === 0) {
    if (emptyState) {
      emptyState.style.display = 'block';
      if (searchQuery) {
        emptyState.textContent = 'No transactions matching your search.';
      } else {
        emptyState.textContent = 'There are no incomes or investments to show!';
      }
    }
  } else {
    if (emptyState) emptyState.style.display = 'none';

    filtered.forEach(item => {
      const isIncome = item.type === 'income';
      const card = document.createElement('div');
      card.className = 'transaction-card';

      card.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon-badge ${isIncome ? 'income' : 'expense'}">
            <i class="fa-solid ${isIncome ? 'fa-money-bill-wave' : 'fa-basket-shopping'}"></i>
          </div>
          <div class="tx-details">
            <span class="tx-name">${escapeHTML(item.title)}</span>
            <span class="tx-category">${escapeHTML(item.category)}</span>
          </div>
        </div>

        <div class="tx-right">
          <div class="tx-amount-date">
            <span class="tx-amount ${isIncome ? 'income' : 'expense'}">
              Rs.${Number(item.amount).toLocaleString('en-IN')}
            </span>
            <span class="tx-date">${item.date || new Date().toLocaleDateString('en-GB')}</span>
          </div>

          <div class="tx-actions">
            <button class="btn-icon-action edit-btn" onclick="openEditModal('${item.id}')" title="Edit">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button class="btn-icon-action delete-btn" onclick="handleDeleteTransaction('${item.id}')" title="Delete">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ================= EXCEL EXPORT FEATURE ================= */

function exportToExcel() {
  if (!currentTransactions || currentTransactions.length === 0) {
    showToast('No transactions to export!', 'error');
    return;
  }

  const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const fileName = `Financial_Report_${currentUser ? currentUser.name.replace(/\s+/g, '_') : 'User'}_${todayStr}.xlsx`;

  let totalIncome = 0;
  let totalExpense = 0;

  const dataRows = currentTransactions.map((item, index) => {
    const isIncome = item.type === 'income';
    const amountVal = Number(item.amount);
    if (isIncome) totalIncome += amountVal;
    else totalExpense += amountVal;

    return [
      index + 1,
      item.date || new Date().toLocaleDateString('en-GB'),
      item.type.toUpperCase(),
      item.title,
      item.category,
      isIncome ? amountVal : 0,
      !isIncome ? amountVal : 0
    ];
  });

  const netBalance = totalIncome - totalExpense;

  if (typeof XLSX !== 'undefined') {
    const wsData = [
      ['FINANCIAL MANAGEMENT SYSTEM - TRANSACTION REPORT'],
      [`Report Generated On: ${new Date().toLocaleString('en-GB')}`],
      [`Account Holder: ${currentUser ? currentUser.name : 'User'} (${currentUser ? currentUser.email : 'N/A'})`],
      ['Branding: Made with 🩵 by Mariselvam'],
      [],
      ['S.No', 'Date', 'Type', 'Source / Product Name', 'Category / Details', 'Income (Rs.)', 'Expense (Rs.)'],
      ...dataRows,
      [],
      ['', '', '', '', 'TOTAL INCOME (Rs.):', totalIncome, ''],
      ['', '', '', '', 'TOTAL EXPENSE (Rs.):', '', totalExpense],
      ['', '', '', '', 'NET BALANCE (Rs.):', netBalance, '']
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 12 },
      { wch: 28 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Finance Report');
    XLSX.writeFile(wb, fileName);
    showToast('Excel sheet downloaded successfully!', 'success');
  } else {
    exportToCSV(dataRows, totalIncome, totalExpense, netBalance, fileName.replace('.xlsx', '.csv'));
  }
}

function exportToCSV(dataRows, totalIncome, totalExpense, netBalance, csvFileName) {
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Financial Management System - Report by Mariselvam\n";
  csvContent += `Generated: ${new Date().toLocaleString('en-GB')}\n\n`;
  csvContent += "S.No,Date,Type,Source / Product Name,Category,Income (Rs.),Expense (Rs.)\n";

  dataRows.forEach(row => {
    const escaped = row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
    csvContent += escaped + "\n";
  });

  csvContent += `\n,,,,"TOTAL INCOME (Rs.):",${totalIncome},\n`;
  csvContent += `,,,,"TOTAL EXPENSE (Rs.):",,${totalExpense}\n`;
  csvContent += `,,,,"NET BALANCE (Rs.):",${netBalance},\n`;

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", csvFileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV report downloaded successfully!', 'success');
}

/* ================= TOAST NOTIFICATIONS ================= */

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3200);
}
