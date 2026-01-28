// State variables
let analysisData = null;
let extensionUsageMap = new Map();
let selectedFiles = null;
let currentSource = 'local';  // 'local' or 'gitlab'
const gitlabCache = new GitLabCache('extview-gitlab-cache');

// DOM element references (populated on DOMContentLoaded)
let localTab, gitlabTab;
let localControls, gitlabControls;
let gitlabToken, gitlabBranch, gitlabFetchBtn;
let cacheStatus, cacheInfo, clearCacheBtn;
let progressText, progressBar, progressFill;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM references
    localTab = document.getElementById('localTab');
    gitlabTab = document.getElementById('gitlabTab');
    localControls = document.getElementById('localControls');
    gitlabControls = document.getElementById('gitlabControls');
    gitlabToken = document.getElementById('gitlabToken');
    gitlabBranch = document.getElementById('gitlabBranch');
    gitlabFetchBtn = document.getElementById('gitlabFetchBtn');
    cacheStatus = document.getElementById('cacheStatus');
    cacheInfo = document.getElementById('cacheInfo');
    clearCacheBtn = document.getElementById('clearCacheBtn');
    progressText = document.getElementById('progressText');
    progressBar = document.getElementById('progressBar');
    progressFill = document.getElementById('progressFill');

    // Tab click handlers
    localTab.addEventListener('click', () => switchSource('local'));
    gitlabTab.addEventListener('click', () => switchSource('gitlab'));

    // Keyboard navigation for tabs (arrow keys)
    const sourceTabs = document.querySelector('.source-tabs');
    if (sourceTabs) {
        sourceTabs.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const tabs = [localTab, gitlabTab];
                const currentIndex = currentSource === 'local' ? 0 : 1;
                const nextIndex = e.key === 'ArrowRight' ? (currentIndex + 1) % 2 : (currentIndex - 1 + 2) % 2;
                tabs[nextIndex].click();
                tabs[nextIndex].focus();
            }
        });
    }

    // GitLab fetch button
    gitlabFetchBtn.addEventListener('click', handleGitLabFetch);

    // Clear cache button
    clearCacheBtn.addEventListener('click', handleClearCache);

    // Load saved token
    loadSavedToken();

    // Update cache status on load
    updateCacheStatus();
});

// Switch between local folder and GitLab source
function switchSource(source) {
    currentSource = source;

    // Update tab active states
    localTab.classList.toggle('active', source === 'local');
    gitlabTab.classList.toggle('active', source === 'gitlab');

    // Show/hide controls
    localControls.style.display = source === 'local' ? 'block' : 'none';
    gitlabControls.style.display = source === 'gitlab' ? 'block' : 'none';

    // Update cache status visibility
    updateCacheStatus();
}

// Handle GitLab fetch button click
async function handleGitLabFetch() {
    const token = gitlabToken.value.trim() || null;
    const ref = gitlabBranch.value;

    // Save token if provided
    if (token) saveToken(token);

    // Disable button during fetch
    gitlabFetchBtn.disabled = true;
    gitlabFetchBtn.textContent = 'Fetching...';

    try {
        updateProgress(0, 1, 'Connecting to GitLab...');
        showProgressBar(true);

        analysisData = await scanFromGitLab(ref, token, false, (done, total, message) => {
            updateProgress(done, total, message);
        });

        processData();
        renderExtensionsList();
        document.getElementById('mainContainer').classList.remove('hidden');
        updateProgress(1, 1, `Scan complete! Found ${extensionUsageMap.size} extensions`);
        updateCacheStatus();

    } catch (error) {
        handleGitLabError(error);
    } finally {
        gitlabFetchBtn.disabled = false;
        gitlabFetchBtn.textContent = 'Fetch from GitLab';
        // Hide progress bar after a delay
        setTimeout(() => showProgressBar(false), 2000);
    }
}

// Update progress display
function updateProgress(done, total, message) {
    if (progressText) {
        progressText.textContent = message;
    }
    if (progressFill && total > 0) {
        const percent = (done / total) * 100;
        progressFill.style.width = `${percent}%`;
    }
}

// Show/hide progress bar
function showProgressBar(show) {
    if (progressBar) {
        progressBar.classList.toggle('active', show);
    }
    if (!show && progressFill) {
        progressFill.style.width = '0%';
    }
}

// Update cache status display
function updateCacheStatus() {
    if (!cacheStatus || !cacheInfo) return;

    // Only show cache status when on GitLab tab
    if (currentSource !== 'gitlab') {
        cacheStatus.style.display = 'none';
        return;
    }

    const info = gitlabCache.getInfo();
    if (!info) {
        cacheStatus.style.display = 'none';
        return;
    }

    cacheStatus.style.display = 'flex';
    cacheStatus.classList.toggle('expired', info.isExpired);
    cacheInfo.textContent = `Cached: ${info.fileCount} files (${info.age})${info.isExpired ? ' - expired' : ''}`;
}

// Handle clear cache button
function handleClearCache() {
    gitlabCache.clear();
    updateCacheStatus();
    updateProgress(0, 0, 'Cache cleared');
}

// Handle GitLab errors with user-friendly messages
function handleGitLabError(error) {
    let message = error.message;

    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        message = 'Network error. Check your connection or try a different CORS proxy.';
    } else if (message.includes('401')) {
        message = 'Authentication failed. Check your access token.';
    } else if (message.includes('404')) {
        message = 'Repository not found. For private repos, provide a valid token.';
    }

    updateProgress(0, 0, `Error: ${message}`);
    showProgressBar(false);
    console.error('GitLab fetch error:', error);
}

// Save token to localStorage
function saveToken(token) {
    try {
        if (token) {
            localStorage.setItem('extview-gitlab-token', token);
        }
    } catch (e) {
        // localStorage disabled or unavailable
    }
}

// Load saved token from localStorage
function loadSavedToken() {
    try {
        const token = localStorage.getItem('extview-gitlab-token');
        if (token && gitlabToken) {
            gitlabToken.value = token;
        }
    } catch (e) {
        // localStorage disabled or unavailable
    }
}

// Original local folder handling functions
function onFolderSelected(event) {
    selectedFiles = event.target.files;
    const shaderFiles = Array.from(selectedFiles).filter(f => shouldProcessFile(f.name));

    if (shaderFiles.length > 0) {
        document.getElementById('scanBtn').style.display = 'block';
        document.getElementById('fileName').textContent = `Found ${shaderFiles.length} shader files`;
    } else {
        document.getElementById('scanBtn').style.display = 'none';
        document.getElementById('fileName').textContent = 'No shader files found';
    }
}

async function startScan() {
    if (!selectedFiles) return;

    document.getElementById('scanBtn').disabled = true;
    document.getElementById('mainContainer').classList.add('hidden');

    showProgressBar(true);

    try {
        updateProgress(0, 1, 'Scanning files...');

        analysisData = await scanDirectoryWithFileAPI(
            selectedFiles,
            10000,
            (processed, total) => {
                updateProgress(processed, total, `Processed ${processed} of ${total} shader files...`);
            }
        );

        processData();
        renderExtensionsList();
        document.getElementById('mainContainer').classList.remove('hidden');
        updateProgress(1, 1, `Scan complete! Found ${extensionUsageMap.size} extensions in ${analysisData.files_using_extensions} files`);

    } catch (err) {
        updateProgress(0, 0, `Error: ${err.message}`);
        console.error(err);
    } finally {
        document.getElementById('scanBtn').disabled = false;
        setTimeout(() => showProgressBar(false), 2000);
    }
}

function processData() {
    extensionUsageMap.clear();

    const shaderFiles = analysisData.shader_files || analysisData.shader_files_analyzed || [];

    shaderFiles.forEach(file => {
        Object.entries(file.extensions_detected).forEach(([extName, extData]) => {
            if (!extensionUsageMap.has(extName)) {
                extensionUsageMap.set(extName, {
                    files: [],
                    definition: analysisData.extensions_database[extName]
                });
            }

            extensionUsageMap.get(extName).files.push({
                path: file.file_path,
                usage: extData
            });
        });
    });
}

function getVendorClass(extensionName) {
    if (extensionName.startsWith('GL_KHR_')) return 'vendor-khr';
    if (extensionName.startsWith('GL_EXT_')) return 'vendor-ext';
    if (extensionName.startsWith('GL_NV_')) return 'vendor-nv';
    if (extensionName.startsWith('GL_ARB_')) return 'vendor-arb';
    if (extensionName.startsWith('GL_AMD_')) return 'vendor-amd';
    return '';
}

function renderExtensionsList() {
    const listEl = document.getElementById('extensionsList');
    const extensions = Array.from(extensionUsageMap.entries())
        .sort((a, b) => b[1].files.length - a[1].files.length);

    listEl.innerHTML = extensions.map(([name, data]) => `
        <div class="extension-item" onclick="showExtensionDetails('${name}')">
            <div class="extension-name ${getVendorClass(name)}">${name}</div>
            <div class="usage-count">${data.files.length} file${data.files.length !== 1 ? 's' : ''}</div>
        </div>
    `).join('');
}

function showExtensionDetails(extensionName) {
    document.querySelectorAll('.extension-item').forEach(el => {
        el.classList.remove('active');
    });
    event.target.closest('.extension-item').classList.add('active');

    const data = extensionUsageMap.get(extensionName);
    const detailsEl = document.getElementById('detailsPanel');

    const filesHtml = data.files.map(file => {
        const sections = [];

        if (file.usage.functions && file.usage.functions.length > 0) {
            sections.push(`
                <div class="feature-section">
                    <span class="feature-label">Functions:</span>
                    <div class="feature-items">
                        ${file.usage.functions.map(fn =>
                            `<span class="feature-item">${fn}</span>`
                        ).join('')}
                    </div>
                </div>
            `);
        }

        if (file.usage.types && file.usage.types.length > 0) {
            sections.push(`
                <div class="feature-section">
                    <span class="feature-label">Types:</span>
                    <div class="feature-items">
                        ${file.usage.types.map(type =>
                            `<span class="feature-item">${type}</span>`
                        ).join('')}
                    </div>
                </div>
            `);
        }

        if (file.usage.built_in_variables && file.usage.built_in_variables.length > 0) {
            sections.push(`
                <div class="feature-section">
                    <span class="feature-label">Built-ins:</span>
                    <div class="feature-items">
                        ${file.usage.built_in_variables.map(builtin =>
                            `<span class="feature-item">${builtin}</span>`
                        ).join('')}
                    </div>
                </div>
            `);
        }

        if (file.usage.qualifiers && file.usage.qualifiers.length > 0) {
            sections.push(`
                <div class="feature-section">
                    <span class="feature-label">Qualifiers:</span>
                    <div class="feature-items">
                        ${file.usage.qualifiers.map(qual =>
                            `<span class="feature-item">${qual}</span>`
                        ).join('')}
                    </div>
                </div>
            `);
        }

        if (file.usage.constants && file.usage.constants.length > 0) {
            sections.push(`
                <div class="feature-section">
                    <span class="feature-label">Constants:</span>
                    <div class="feature-items">
                        ${file.usage.constants.map(constant =>
                            `<span class="feature-item">${constant}</span>`
                        ).join('')}
                    </div>
                </div>
            `);
        }

        if (file.usage.keywords && file.usage.keywords.length > 0) {
            sections.push(`
                <div class="feature-section">
                    <span class="feature-label">Keywords:</span>
                    <div class="feature-items">
                        ${file.usage.keywords.map(keyword =>
                            `<span class="feature-item">${keyword}</span>`
                        ).join('')}
                    </div>
                </div>
            `);
        }

        return `
            <div class="file-item">
                <div class="file-path">${file.path}</div>
                ${sections.join('')}
            </div>
        `;
    }).join('');

    detailsEl.innerHTML = `
        <h2>${extensionName}</h2>
        <div class="files-section">
            <h3>Files using this extension (${data.files.length})</h3>
            ${filesHtml}
        </div>
    `;
}
