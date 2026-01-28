// DOM Elements
const svg = d3.select('#graph');
const moduleList = document.getElementById('module-list');
const functionModuleList = document.getElementById('function-module-list');
const functionsList = document.getElementById('functions-list');
const searchInput = document.getElementById('search-input');
const viewMode = document.getElementById('view-mode');
const showPrivate = document.getElementById('show-private');
const exportBtn = document.getElementById('export-btn');
const folderInput = document.getElementById('folder-input');
const folderSelectBtn = document.getElementById('folder-select-btn');
const uploadFolderBtn = document.getElementById('upload-folder-btn');
const gitlabFetchBtn = document.getElementById('gitlab-fetch-btn');
const gitlabFetchMainBtn = document.getElementById('gitlab-fetch-main-btn');
const gitlabBranchSelect = document.getElementById('gitlab-branch');
const gitlabBranchMainSelect = document.getElementById('gitlab-branch-main');
const gitlabTokenInput = document.getElementById('gitlab-token');
const gitlabTokenMainInput = document.getElementById('gitlab-token-main');
const gitlabLoginBtn = document.getElementById('gitlab-login-btn');
const gitlabLoginMainBtn = document.getElementById('gitlab-login-main-btn');
const gitlabLogoutBtn = document.getElementById('gitlab-logout-btn');
const gitlabLogoutMainBtn = document.getElementById('gitlab-logout-main-btn');
const gitlabAuthStatus = document.getElementById('gitlab-auth-status');
const gitlabAuthStatusMain = document.getElementById('gitlab-auth-status-main');
const gitlabUserInfo = document.getElementById('gitlab-user-info');
const gitlabUserInfoMain = document.getElementById('gitlab-user-info-main');
const fileName = document.getElementById('file-name');
const cacheStatus = document.getElementById('cache-status');
const cacheInfo = document.getElementById('cache-info');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const initialMessage = document.getElementById('initial-message');
const controls = document.querySelector('.controls');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const offlineWarning = document.getElementById('offline-warning');
const tokenNote = document.getElementById('token-note');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const fallbackFolderBtn = document.getElementById('fallback-folder-btn');

// Initialize the application
function initApp() {
  // Ensure showPrivate is checked by default
  showPrivate.checked = true;

  // Handle OAuth callback first (if returning from GitLab login)
  handleOAuthCallback();

  // Setup event listeners
  setupEventListeners();

  // Show browser compatibility info
  showBrowserCompatibility();

  // Setup offline detection
  setupOfflineDetection();

  // Sync branch selectors
  syncBranchSelectors();

  // Sync token inputs and load saved token
  syncTokenInputs();
  loadTokenFromStorage();

  // Update OAuth UI state
  updateOAuthUI();

  // Try to auto-load data
  tryAutoLoad();
}

// Display browser compatibility information
function showBrowserCompatibility() {
  const compatEl = document.getElementById('browser-compat');
  if (!compatEl) return;

  const support = checkFolderUploadSupport();

  let html = `<div class="compat-title">Browser: ${support.browser.name} ${support.browser.version}</div>`;

  if (support.supported) {
    html += '<div>Folder upload: Supported</div>';
    compatEl.classList.add('supported');
  } else {
    html += '<div>Folder upload: Not supported in this browser</div>';
    compatEl.classList.add('unsupported');
  }

  // Add online/offline status
  html += `<div>Network: ${navigator.onLine ? 'Online' : 'Offline'}</div>`;

  if (support.browser.notes.length > 0) {
    html += '<div class="compat-notes">';
    for (const note of support.browser.notes) {
      html += `${note}<br>`;
    }
    html += '</div>';
  }

  compatEl.innerHTML = html;
}

// Setup offline detection and UI updates
function setupOfflineDetection() {
  updateOnlineStatus();

  window.addEventListener('online', () => {
    updateOnlineStatus();
    showStatus('Back online. GitLab fetch available.', 2000);
  });

  window.addEventListener('offline', () => {
    updateOnlineStatus();
    showWarning('You are offline. Use local folder upload or cached data.');
  });
}

// Update UI based on online/offline status
function updateOnlineStatus() {
  const isOnline = navigator.onLine;

  // Update GitLab fetch buttons
  if (gitlabFetchBtn) {
    gitlabFetchBtn.disabled = !isOnline;
    gitlabFetchBtn.title = isOnline ? 'Fetch shaders from GitLab' : 'Offline - GitLab unavailable';
  }
  if (gitlabFetchMainBtn) {
    gitlabFetchMainBtn.disabled = !isOnline;
    gitlabFetchMainBtn.title = isOnline ? 'Fetch shaders from GitLab' : 'Offline - GitLab unavailable';
  }

  // Update branch selectors
  if (gitlabBranchSelect) {
    gitlabBranchSelect.disabled = !isOnline;
  }
  if (gitlabBranchMainSelect) {
    gitlabBranchMainSelect.disabled = !isOnline;
  }

  // Show/hide offline warning
  if (offlineWarning) {
    offlineWarning.style.display = isOnline ? 'none' : 'block';
  }

  // Update browser compat display
  showBrowserCompatibility();
}

// Sync branch selectors so both show the same value
function syncBranchSelectors() {
  if (gitlabBranchSelect && gitlabBranchMainSelect) {
    gitlabBranchSelect.addEventListener('change', () => {
      gitlabBranchMainSelect.value = gitlabBranchSelect.value;
    });
    gitlabBranchMainSelect.addEventListener('change', () => {
      gitlabBranchSelect.value = gitlabBranchMainSelect.value;
    });
  }
}

// Sync token inputs so both have the same value
function syncTokenInputs() {
  if (gitlabTokenInput && gitlabTokenMainInput) {
    gitlabTokenInput.addEventListener('input', () => {
      gitlabTokenMainInput.value = gitlabTokenInput.value;
      saveTokenToStorage(gitlabTokenInput.value);
    });
    gitlabTokenMainInput.addEventListener('input', () => {
      gitlabTokenInput.value = gitlabTokenMainInput.value;
      saveTokenToStorage(gitlabTokenMainInput.value);
    });
  }
}

// Save token to localStorage (optional convenience)
function saveTokenToStorage(token) {
  try {
    if (token) {
      localStorage.setItem('gitlab-token', token);
    } else {
      localStorage.removeItem('gitlab-token');
    }
  } catch (e) {
    // localStorage might be disabled
  }
  // Show/hide token note
  if (tokenNote) {
    tokenNote.style.display = token ? 'block' : 'none';
  }
}

// Load token from localStorage
function loadTokenFromStorage() {
  try {
    const token = localStorage.getItem('gitlab-token');
    if (token) {
      if (gitlabTokenInput) gitlabTokenInput.value = token;
      if (gitlabTokenMainInput) gitlabTokenMainInput.value = token;
      if (tokenNote) tokenNote.style.display = 'block';
    }
  } catch (e) {
    // localStorage might be disabled
  }
}

// Get selected branch from either selector
function getSelectedBranch() {
  if (gitlabBranchSelect) {
    return gitlabBranchSelect.value;
  }
  if (gitlabBranchMainSelect) {
    return gitlabBranchMainSelect.value;
  }
  return 'master';
}

// Get token from either input or OAuth
function getGitLabToken() {
  // First check OAuth token
  if (typeof gitlabOAuth !== 'undefined' && gitlabOAuth.isAuthenticated()) {
    return gitlabOAuth.getToken();
  }
  // Fall back to manual token input
  if (gitlabTokenInput && gitlabTokenInput.value) {
    return gitlabTokenInput.value.trim();
  }
  if (gitlabTokenMainInput && gitlabTokenMainInput.value) {
    return gitlabTokenMainInput.value.trim();
  }
  return null;
}

// Handle OAuth callback when returning from GitLab login
function handleOAuthCallback() {
  if (typeof gitlabOAuth === 'undefined') return;

  try {
    const wasCallback = gitlabOAuth.handleCallback();
    if (wasCallback) {
      showStatus('Logged in to GitLab successfully!', 2000);
      // Auto-fetch after successful login
      setTimeout(() => handleGitLabFetch(), 500);
    }
  } catch (error) {
    showError(`GitLab login failed: ${error.message}`);
  }
}

// Update OAuth UI based on authentication state
async function updateOAuthUI() {
  if (typeof gitlabOAuth === 'undefined') return;

  const isAuthenticated = gitlabOAuth.isAuthenticated();
  const isConfigured = gitlabOAuth.isConfigured();

  // Show/hide login buttons based on OAuth configuration
  if (gitlabLoginBtn) {
    gitlabLoginBtn.style.display = isConfigured && !isAuthenticated ? 'inline-block' : 'none';
  }
  if (gitlabLoginMainBtn) {
    gitlabLoginMainBtn.style.display = isConfigured && !isAuthenticated ? 'inline-block' : 'none';
  }

  // Show/hide auth status
  if (gitlabAuthStatus) {
    gitlabAuthStatus.style.display = isAuthenticated ? 'flex' : 'none';
  }
  if (gitlabAuthStatusMain) {
    gitlabAuthStatusMain.style.display = isAuthenticated ? 'flex' : 'none';
  }

  // Hide token inputs when authenticated via OAuth
  if (gitlabTokenInput) {
    gitlabTokenInput.style.display = isAuthenticated ? 'none' : 'inline-block';
  }
  if (gitlabTokenMainInput) {
    gitlabTokenMainInput.style.display = isAuthenticated ? 'none' : 'inline-block';
  }

  // Fetch and display user info if authenticated
  if (isAuthenticated) {
    const userInfo = await gitlabOAuth.getUserInfo();
    if (userInfo) {
      const displayName = userInfo.username || userInfo.name || 'Logged in';
      if (gitlabUserInfo) gitlabUserInfo.textContent = displayName;
      if (gitlabUserInfoMain) gitlabUserInfoMain.textContent = displayName;
    } else {
      if (gitlabUserInfo) gitlabUserInfo.textContent = 'Logged in';
      if (gitlabUserInfoMain) gitlabUserInfoMain.textContent = 'Logged in';
    }
  }
}

// Handle GitLab OAuth login button click
function handleGitLabLogin() {
  if (typeof gitlabOAuth === 'undefined') {
    showError('OAuth not available');
    return;
  }

  try {
    gitlabOAuth.login();
  } catch (error) {
    showError(error.message);
  }
}

// Handle GitLab logout
function handleGitLabLogout() {
  if (typeof gitlabOAuth === 'undefined') return;

  gitlabOAuth.logout();
  updateOAuthUI();
  showStatus('Logged out of GitLab', 2000);
}

// Setup event listeners
function setupEventListeners() {
  // Folder upload handling
  if (folderSelectBtn) {
    folderSelectBtn.addEventListener('click', () => {
      folderInput.click();
    });
  }

  if (uploadFolderBtn) {
    uploadFolderBtn.addEventListener('click', () => {
      folderInput.click();
    });
  }

  if (folderInput) {
    folderInput.addEventListener('change', handleFolderUpload);
  }

  // GitLab fetch handling
  if (gitlabFetchBtn) {
    gitlabFetchBtn.addEventListener('click', handleGitLabFetch);
  }
  if (gitlabFetchMainBtn) {
    gitlabFetchMainBtn.addEventListener('click', handleGitLabFetch);
  }

  // GitLab OAuth login/logout
  if (gitlabLoginBtn) {
    gitlabLoginBtn.addEventListener('click', handleGitLabLogin);
  }
  if (gitlabLoginMainBtn) {
    gitlabLoginMainBtn.addEventListener('click', handleGitLabLogin);
  }
  if (gitlabLogoutBtn) {
    gitlabLogoutBtn.addEventListener('click', handleGitLabLogout);
  }
  if (gitlabLogoutMainBtn) {
    gitlabLogoutMainBtn.addEventListener('click', handleGitLabLogout);
  }

  // Cache controls
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', handleClearCache);
  }

  // Error state retry/fallback buttons
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      hideErrorState();
      handleGitLabFetch(null, true); // Force refresh on retry
    });
  }
  if (fallbackFolderBtn) {
    fallbackFolderBtn.addEventListener('click', () => {
      hideErrorState();
      folderInput.click();
    });
  }

  // Update cache status on page load
  updateCacheStatus();

  // View mode change
  viewMode.addEventListener('change', handleViewModeChange);

  // Show/hide private functions
  showPrivate.addEventListener('change', handleShowPrivateChange);

  // Setup tabs
  setupTabs();

  // Setup search
  setupSearch();

  // Setup export
  setupExport();

  // Setup window resize handler
  window.addEventListener('resize', handleWindowResize);

  // Setup keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

// Show error state with retry option
function showErrorState(message) {
  if (errorState && errorMessage) {
    errorMessage.textContent = message;
    errorState.style.display = 'block';
  }
}

// Hide error state
function hideErrorState() {
  if (errorState) {
    errorState.style.display = 'none';
  }
}

// Handle shader folder upload
async function handleFolderUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  // Check browser compatibility first
  const support = checkFolderUploadSupport();
  if (!support.supported) {
    showWarning(`Folder upload may not work in ${support.browser.name}. Try using GitLab fetch instead.`);
  }

  // Show loading state
  showStatus('Initializing...', 0, { percent: 0, phase: 1, totalPhases: 3 });

  try {
    const handler = new FileHandler();

    // Process files with enhanced progress callback
    const data = await handler.processFiles(files, (processed, total, stage, details) => {
      showStatus(stage, 0, {
        percent: details?.percent || Math.round((processed / total) * 100),
        currentFile: details?.currentFile,
        phase: details?.phase,
        totalPhases: details?.totalPhases
      });
    });

    // Get stats for display
    const stats = handler.getStats();
    console.log('Shader parsing stats:', stats);

    // Log any warnings
    if (stats.warnings && stats.warnings.length > 0) {
      console.warn('Parse warnings:', stats.warnings);
    }

    // Log any errors
    if (stats.errors && stats.errors.length > 0) {
      console.error('Parse errors:', stats.errors);
    }

    // Update file name display with summary
    const timingInfo = stats.timing ? ` (${stats.timing.duration}ms)` : '';
    fileName.textContent = `${stats.files.shaders} shaders, ${stats.parsing.functions} functions${timingInfo}`;

    // Feed to existing data processor
    processData(data);

    // Show completion message with any issues
    let completionMessage = `Loaded ${stats.parsing.functions} functions from ${stats.parsing.modules} modules`;
    if (stats.errors.length > 0) {
      completionMessage += ` (${stats.errors.length} errors)`;
      console.log('Error report:', handler.getErrorReport());
    }
    if (stats.warnings.length > 0) {
      completionMessage += ` (${stats.warnings.length} warnings)`;
    }

    // Validate result
    if (!stats.validation.valid) {
      console.warn('Validation issues:', stats.validation.issues);
    }

    showStatus(completionMessage, 3000);

  } catch (error) {
    showError(`Error parsing shaders: ${error.message}`);
    console.error('Shader parsing error:', error);
  }
}

// Handle GitLab fetch
async function handleGitLabFetch(event, forceRefresh = false) {
  // Check online status first
  if (!navigator.onLine) {
    showWarning('You are offline. GitLab fetch unavailable. Use local folder upload or cached data.');
    return;
  }

  // Check if this was triggered with Shift key held (force refresh)
  if (event && event.shiftKey) {
    forceRefresh = true;
  }

  // Get selected branch
  const branch = getSelectedBranch();

  const statusPrefix = forceRefresh ? `Refreshing from GitLab (${branch})...` : `Connecting to GitLab (${branch})...`;
  showStatus(statusPrefix, 0, { percent: 0, phase: 1, totalPhases: 4 });

  // Hide any previous error state
  hideErrorState();

  try {
    const token = getGitLabToken();
    const handler = new GitLabHandler({ token });
    const data = await handler.processFromGitLab(branch, (done, total, stage, details) => {
      showStatus(stage, 0, details);
    }, forceRefresh);

    const stats = handler.getStats();
    console.log('GitLab fetch stats:', stats);

    // Log any fetch errors
    if (stats.errors && stats.errors.length > 0) {
      console.warn('Fetch errors:', stats.errors);
    }

    // Update file name display with summary
    const timingInfo = stats.timing ? ` (${stats.timing.duration}ms)` : '';
    const cacheNote = stats.cache.used ? ' [cached]' : '';
    const branchNote = branch !== 'master' ? ` [${branch}]` : '';
    fileName.textContent = `GitLab${branchNote}: ${stats.files.shaders} shaders, ${stats.parsing.functions} functions${timingInfo}${cacheNote}`;

    // Feed to existing data processor
    processData(data);

    // Show completion message
    let completionMessage = `Loaded ${stats.parsing.functions} functions from ${stats.parsing.modules} modules`;
    if (stats.cache.used) {
      completionMessage += ' (from cache)';
    }
    if (stats.errors.length > 0) {
      completionMessage += ` (${stats.errors.length} fetch errors)`;
    }

    showStatus(completionMessage, 3000);

    // Update cache status display
    updateCacheStatus();

  } catch (error) {
    console.error('GitLab fetch error:', error);

    // Show error state with retry option
    let errorMsg = error.message;

    // Provide more helpful messages for common errors
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      errorMsg = 'Network error. Check your connection and try again.';
    } else if (error.message.includes('401') || error.message.includes('Authentication failed')) {
      errorMsg = 'Authentication failed. Check your GitLab access token.';
    } else if (error.message.includes('404') || error.message.includes('private repo')) {
      errorMsg = `Repository not accessible. Enter a GitLab personal access token with read_repository scope.`;
    } else if (error.message.includes('rate limit')) {
      errorMsg = 'GitLab rate limit reached. Please wait a moment and try again.';
    }

    showErrorState(errorMsg);
    showError(`GitLab fetch failed: ${errorMsg}`);
  }
}

// Update cache status display in sidebar
function updateCacheStatus() {
  if (!cacheStatus || !cacheInfo) return;

  // Create a temporary handler just to check cache status
  const tempHandler = new GitLabHandler();
  const info = tempHandler.getCacheInfo();

  if (info) {
    cacheStatus.style.display = 'flex';
    cacheInfo.textContent = `Cached: ${info.fileCount} files (${info.age})`;

    if (info.isExpired) {
      cacheStatus.classList.add('expired');
      cacheInfo.textContent += ' [expired]';
    } else {
      cacheStatus.classList.remove('expired');
    }
  } else {
    cacheStatus.style.display = 'none';
  }
}

// Handle cache clear button
function handleClearCache() {
  const tempHandler = new GitLabHandler();
  tempHandler.clearCache();
  updateCacheStatus();
  showStatus('Cache cleared. Next fetch will download fresh data.', 2000);
}

// Handle view mode change
function handleViewModeChange() {
  console.log("View mode changed to:", viewMode.value);

  // Sync the tab selection with the view mode
  const viewToTabMap = {
    'modules': 'module-tab',
    'function_modules': 'func-module-tab',
    'functions': 'functions-tab'
  };

  const tabId = viewToTabMap[viewMode.value];
  if (tabId) {
    // Activate the corresponding tab
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => {
      c.classList.remove('active');
      c.classList.remove('visible');
    });

    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
  }

  buildGraphData();
}

// Handle show private change
function handleShowPrivateChange() {
  console.log("Show private toggled:", showPrivate.checked);
  buildGraphData();
  populateModuleList();
  populateFunctionModuleList();
  populateFunctionsList();
}

// Handle window resize
function handleWindowResize() {
  svgWidth = document.querySelector('.graph-container').clientWidth;
  svgHeight = document.querySelector('.graph-container').clientHeight;

  svg
    .attr('width', svgWidth)
    .attr('height', svgHeight);

  if (simulation) {
    simulation
      .force('center', d3.forceCenter(svgWidth / 2, svgHeight / 2))
      .restart();
  }
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(event) {
  // Ctrl+Tab or Cmd+Tab to cycle through tabs
  if ((event.ctrlKey || event.metaKey) && event.key === 'Tab') {
    event.preventDefault();

    const activeTabs = Array.from(tabs);
    const currentActiveIdx = activeTabs.findIndex(tab => tab.classList.contains('active'));
    const nextIdx = (currentActiveIdx + 1) % activeTabs.length;

    activeTabs[nextIdx].click();
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);