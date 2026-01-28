// Entry point for the application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the application
    RenderGraphViewer.init();

    // Initial tab activation
    const firstTab = document.querySelector('.tab');
    if (firstTab) {
        RenderGraphViewer.switchTab(firstTab.dataset.tab);
    }

    // Initialize API controls
    initApiControls();

    // Initialize paste JSON controls
    initPasteControls();

    // Populate recent graphs autocomplete
    RecentGraphs.populate();
});

// Recent render graphs stored in localStorage
const RecentGraphs = {
    STORAGE_KEY: 'rendergraph_viewer_recent',
    MAX_ENTRIES: 20,

    load: function() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch (e) { return []; }
    },

    save: function(entries) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
        } catch (e) { /* localStorage full or disabled */ }
    },

    add: function(uuid, name) {
        const entries = this.load().filter(e => e.uuid !== uuid);
        entries.unshift({ uuid: uuid, name: name || '', ts: Date.now() });
        if (entries.length > this.MAX_ENTRIES) entries.length = this.MAX_ENTRIES;
        this.save(entries);
        this.populate();
    },

    // Resolve a name or UUID to a UUID
    resolve: function(input) {
        const trimmed = input.trim();
        // Already a UUID pattern
        if (/^[0-9a-f]{8}-/.test(trimmed)) return trimmed;
        // Try matching by name (case-insensitive)
        const entry = this.load().find(e =>
            e.name.toLowerCase() === trimmed.toLowerCase()
        );
        return entry ? entry.uuid : trimmed;
    },

    populate: function() {
        const datalist = document.getElementById('recent-graphs');
        if (!datalist) return;
        datalist.innerHTML = '';
        for (const entry of this.load()) {
            const option = document.createElement('option');
            option.value = entry.uuid;
            option.textContent = entry.name || entry.uuid;
            datalist.appendChild(option);
        }
    }
};

// Parse JSON text and route to the appropriate handler.
// Returns true on success, false on failure.
function loadJsonText(text) {
    const trimmed = text.trim();
    if (!trimmed) return false;

    const data = JSON.parse(trimmed);

    if (!RenderGraphViewer.FileHandler) {
        console.error('FileHandler not available');
        return false;
    }

    const fileType = RenderGraphViewer.FileHandler.detectFileType(data);
    if (fileType === 'raw_rendergraph') {
        RenderGraphViewer.FileHandler.processRawRenderGraph(data);
    } else if (fileType === 'debug') {
        if (RenderGraphViewer.tabModules.debug &&
            typeof RenderGraphViewer.tabModules.debug.loadDebugData === 'function') {
            RenderGraphViewer.tabModules.debug.loadDebugData(data);
            RenderGraphViewer.switchTab('debug');
        }
    } else if (fileType === 'graph') {
        RenderGraphViewer.loadGraphData(data);
        RenderGraphViewer.switchTab('details');
    } else {
        alert('Not a recognized render graph JSON format.');
        return false;
    }

    return true;
}

// Initialize paste JSON and clipboard controls
function initPasteControls() {
    const toggleBtn = document.getElementById('paste-json-btn');
    const clipboardBtn = document.getElementById('clipboard-load-btn');
    const panel = document.getElementById('paste-panel');
    const textarea = document.getElementById('paste-json-input');
    const loadBtn = document.getElementById('paste-load-btn');
    const cancelBtn = document.getElementById('paste-cancel-btn');

    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener('click', function() {
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : 'flex';
        if (!visible) {
            textarea.focus();
        }
    });

    cancelBtn.addEventListener('click', function() {
        panel.style.display = 'none';
        textarea.value = '';
    });

    loadBtn.addEventListener('click', function() {
        try {
            if (loadJsonText(textarea.value)) {
                panel.style.display = 'none';
                textarea.value = '';
            }
        } catch (err) {
            alert('Invalid JSON: ' + err.message);
        }
    });

    // Ctrl+Enter to load
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            loadBtn.click();
        }
        if (e.key === 'Escape') {
            cancelBtn.click();
        }
    });

    // Clipboard button - read from clipboard and load directly
    if (clipboardBtn) {
        clipboardBtn.addEventListener('click', async function() {
            let text;
            try {
                text = await navigator.clipboard.readText();
            } catch (err) {
                if (err.name === 'NotAllowedError') {
                    alert('Clipboard access denied. Use the Paste JSON textarea instead.');
                } else {
                    alert('Failed to read clipboard: ' + err.message);
                }
                return;
            }

            if (!text || !text.trim()) {
                alert('Clipboard is empty.');
                return;
            }

            try {
                loadJsonText(text);
            } catch (err) {
                alert('Invalid JSON in clipboard: ' + err.message);
            }
        });
    }
}

// Initialize 3dverse Labs API controls
function initApiControls() {
    const assetUuidInput = document.getElementById('asset-uuid-input');
    const labsTokenInput = document.getElementById('labs-token-input');
    const fetchBtn = document.getElementById('fetch-asset-btn');

    if (!assetUuidInput || !fetchBtn) {
        console.warn('API controls not found');
        return;
    }

    // Restore saved labs token (show masked)
    if (window.ThreeDverseAPI && ThreeDverseAPI.hasLabsToken()) {
        labsTokenInput.value = 'token saved...';
        labsTokenInput.dataset.hasToken = 'true';
    }

    // Save token on blur
    labsTokenInput.addEventListener('blur', function() {
        const value = this.value.trim();
        if (value && value !== 'token saved...' && window.ThreeDverseAPI) {
            let token = value;
            if (value.includes('token=')) {
                token = ThreeDverseAPI.extractTokenFromUrl(value);
            }
            if (token) {
                ThreeDverseAPI.setLabsToken(token);
                this.value = 'token saved...';
                this.dataset.hasToken = 'true';
                console.log('Labs token saved');
            }
        }
    });

    // Clear on focus
    labsTokenInput.addEventListener('focus', function() {
        if (this.dataset.hasToken === 'true') {
            this.value = '';
        }
    });

    // Fetch button click
    fetchBtn.addEventListener('click', async function() {
        const input = assetUuidInput.value.trim();
        if (!input) {
            alert('Please enter an asset UUID or name');
            return;
        }

        const uuid = RecentGraphs.resolve(input);

        fetchBtn.disabled = true;
        fetchBtn.textContent = 'Loading...';

        try {
            let token = labsTokenInput.value.trim();
            if (token === 'token saved...' || !token) {
                token = ThreeDverseAPI.getLabsToken();
            } else if (token.includes('token=')) {
                token = ThreeDverseAPI.extractTokenFromUrl(token);
            }

            if (!token) {
                alert('Please paste the API token.\n\nHow to get it:\n1. Open labs.3dverse.com\n2. Open browser console (F12)\n3. Type: apiToken\n4. Copy the returned string');
                labsTokenInput.focus();
                return;
            }

            const data = await ThreeDverseAPI.fetchLabsRenderGraph(uuid, token);
            console.log('Fetched render graph data:', Object.keys(data));

            // Save to recent graphs
            RecentGraphs.add(uuid, data.name || '');
            assetUuidInput.value = uuid;

            if (RenderGraphViewer.FileHandler) {
                RenderGraphViewer.FileHandler.processRawRenderGraph(data);
            } else {
                console.error('FileHandler not available');
            }
        } catch (err) {
            console.error('Fetch error:', err);
            alert('Error fetching asset: ' + err.message);
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = 'Fetch';
        }
    });
}