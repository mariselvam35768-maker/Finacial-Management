/**
 * Financial Management System - Main Logic
 * Supports encrypted local storage, multi-user accounts, full CRUD for income & expenses
 */

let currentUser = null;
let currentTransactions = [];
let currentFilter = 'all';
let searchQuery = '';

// Default sample data for new user registrations
const sampleInitialData = [
  {
    id: 'tx_' + Date.now() + '_1',
    type: 'income',
    title: 'Monthly Income',
    category: 'Salary',
    amount: 1700,
    date: new Date().toLocaleDateString('en-GB') // DD/MM/YYYY
  },
  {
    id: 'tx_' + Date.now() + '_2',
    type: 'expense',
    title: 'Demo',
    category: 'Daily Needs',
    amount: 500,
    date: new Date().toLocaleDateString('en-GB')
  }
];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  await checkExistingSession();

  // Close modals on clicking outside the card
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });
});

/* ================= AUTHENTICATION & SECURITY ================= */

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
 * Gets all encrypted users from LocalStorage
 */
async function getRegisteredUsers() {
  const encryptedPayload = localStorage.getItem('fms_users_vault');
  if (!encryptedPayload) return [];
  const decrypted = await window.secureStorage.decryptData(encryptedPayload);
  if (!decrypted) return [];
  try {
    return JSON.parse(decrypted);
  } catch {
    return [];
  }
}

/**
 * Saves users list into encrypted LocalStorage
 */
async function saveRegisteredUsers(users) {
  const jsonString = JSON.stringify(users);
  const encrypted = await window.secureStorage.encryptData(jsonString);
  localStorage.setItem('fms_users_vault', encrypted);
}

/**
 * Sign Up Handler
 */
async function handleSignUp(event) {
  event.preventDefault();
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;

  if (password !== confirmPassword) {
    showToast('Passwords do not match!', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  const users = await getRegisteredUsers();
  const emailHash = await window.secureStorage.hashPassword(email);
  const existing = users.find(u => u.emailHash === emailHash);

  if (existing) {
    showToast('Account with this email already exists!', 'error');
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

  // Initialize new user with sample default entries (or empty)
  currentUser = newUser;
  currentTransactions = [...sampleInitialData];
  await saveUserData();

  // Save session
  await setSession(newUser);

  showToast('Account created securely! Logged in.', 'success');
  showDashboard();
}

/**
 * Sign In Handler
 */
async function handleSignIn(event) {
  event.preventDefault();
  const email = document.getElementById('signinEmail').value.trim().toLowerCase();
  const password = document.getElementById('signinPassword').value;

  const users = await getRegisteredUsers();
  const emailHash = await window.secureStorage.hashPassword(email);
  const passwordHash = await window.secureStorage.hashPassword(password);

  const user = users.find(u => u.emailHash === emailHash && u.passwordHash === passwordHash);

  if (!user) {
    showToast('Invalid email or password!', 'error');
    return;
  }

  currentUser = user;
  await setSession(user);
  await loadUserData();

  showToast(`Welcome back, ${user.name}!`, 'success');
  showDashboard();
}

async function setSession(user) {
  const sessionToken = await window.secureStorage.encryptData(
    JSON.stringify({ id: user.id, email: user.email, name: user.name, timestamp: Date.now() })
  );
  localStorage.setItem('fms_active_session', sessionToken);
}

async function checkExistingSession() {
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

  try {
    const sessionObj = JSON.parse(decrypted);
    const users = await getRegisteredUsers();
    const user = users.find(u => u.email === sessionObj.email);

    if (user) {
      currentUser = user;
      await loadUserData();
      showDashboard();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

function handleLogout() {
  localStorage.removeItem('fms_active_session');
  currentUser = null;
  currentTransactions = [];
  showToast('Logged out successfully', 'info');
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

/* ================= ENCRYPTED DATA MANAGEMENT ================= */

async function loadUserData() {
  if (!currentUser) return;
  const storageKey = 'fms_data_' + currentUser.emailHash;
  const encryptedData = localStorage.getItem(storageKey);

  if (!encryptedData) {
    currentTransactions = [...sampleInitialData];
    await saveUserData();
    return;
  }

  const decrypted = await window.secureStorage.decryptData(encryptedData, currentUser.passwordHash);
  if (decrypted) {
    try {
      currentTransactions = JSON.parse(decrypted);
    } catch {
      currentTransactions = [];
    }
  } else {
    currentTransactions = [];
  }
}

async function saveUserData() {
  if (!currentUser) return;
  const storageKey = 'fms_data_' + currentUser.emailHash;
  const jsonString = JSON.stringify(currentTransactions);
  const encrypted = await window.secureStorage.encryptData(jsonString, currentUser.passwordHash);
  localStorage.setItem(storageKey, encrypted);
}

/* ================= MODALS & CRUD OPERATIONS ================= */

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

  const newTx = {
    id: 'tx_' + Date.now(),
    type: 'income',
    title: source,
    category: type,
    amount: amount,
    date: new Date().toLocaleDateString('en-GB')
  };

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

  const newTx = {
    id: 'tx_' + Date.now(),
    type: 'expense',
    title: product,
    category: type,
    amount: cost,
    date: new Date().toLocaleDateString('en-GB')
  };

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
    
    await saveUserData();
    closeModal('editModal');
    showToast('Item updated successfully!', 'success');
    renderDashboard();
  }
}

async function handleDeleteTransaction(id) {
  if (confirm('Are you sure you want to delete this record?')) {
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
  document.getElementById('totalBalanceDisplay').textContent = formatCurrency(totalBalance);
  document.getElementById('totalIncomeDisplay').textContent = formatCurrency(totalIncome);
  document.getElementById('totalExpenseDisplay').textContent = formatCurrency(totalExpense);

  // Update Progress Fill Bar
  const totalFlow = totalIncome + totalExpense;
  const progressBarFill = document.getElementById('progressBarFill');
  if (totalFlow > 0) {
    const incomePercent = Math.min(100, Math.max(0, (totalIncome / totalFlow) * 100));
    progressBarFill.style.width = `${incomePercent}%`;
  } else {
    progressBarFill.style.width = '0%';
  }

  // Filter & Search
  let filtered = currentTransactions.filter(t => {
    if (currentFilter !== 'all' && t.type !== currentFilter) return false;
    if (searchQuery) {
      const matchTitle = t.title.toLowerCase().includes(searchQuery);
      const matchCat = t.category.toLowerCase().includes(searchQuery);
      return matchTitle || matchCat;
    }
    return true;
  });

  const container = document.getElementById('transactionsContainer');
  const emptyState = document.getElementById('emptyState');

  container.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    if (searchQuery) {
      emptyState.textContent = 'No transactions matching your search.';
    } else {
      emptyState.textContent = 'There are no incomes or investments to show!';
    }
  } else {
    emptyState.style.display = 'none';

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
  return str
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

  // Calculate totals
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

  // If XLSX library is available
  if (typeof XLSX !== 'undefined') {
    const wsData = [
      ['FINANCIAL MANAGEMENT SYSTEM - TRANSACTION REPORT'],
      [`Report Generated On: ${new Date().toLocaleString('en-GB')}`],
      [`Account Holder: ${currentUser ? currentUser.name : 'User'} (${currentUser ? currentUser.email : 'N/A'})`],
      ['Branding: Made with 🩵 by Mariselvam'],
      [], // Empty row
      ['S.No', 'Date', 'Type', 'Source / Product Name', 'Category / Details', 'Income (Rs.)', 'Expense (Rs.)'],
      ...dataRows,
      [], // Empty row
      ['', '', '', '', 'TOTAL INCOME (Rs.):', totalIncome, ''],
      ['', '', '', '', 'TOTAL EXPENSE (Rs.):', '', totalExpense],
      ['', '', '', '', 'NET BALANCE (Rs.):', netBalance, '']
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths for clean readability
    ws['!cols'] = [
      { wch: 8 },  // S.No
      { wch: 14 }, // Date
      { wch: 12 }, // Type
      { wch: 28 }, // Title
      { wch: 22 }, // Category
      { wch: 16 }, // Income
      { wch: 16 }  // Expense
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Finance Report');
    XLSX.writeFile(wb, fileName);
    showToast('Excel sheet downloaded successfully!', 'success');
  } else {
    // Fallback to CSV export if CDN is offline
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
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-circle-check';
  if (type === 'error') icon = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}
