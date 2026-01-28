// Debug Viewer functionality - integrates standalone debug viewer into the main app
(function(app) {
    // Get the ViewHelper
    const vh = app.ViewHelper;

    // Module API
    const debugModule = vh.createViewModule('debug', {
        init: function() {
            this.container = document.getElementById('debug-panel');
            this.renderInitialState();
        },

        activate: function() {
            // Debug viewer has its own data independent of main app
            // No need to check app.graphData() here
        },

        renderInitialState: function() {
            if (!this.container) return;

            // Create the debug viewer structure - without file upload elements
            this.container.innerHTML = `
                <div class="header">
                    <h2>Render Graph Debug Viewer</h2>
                </div>

                <div class="debug-container" id="debug-main-container" style="display: none;">
                    <div class="debug-sidebar">
                        <h3>Summary</h3>
                        <div class="stats">
                            <div class="stat-box">
                                <h4>Errors</h4>
                                <div class="error-count" id="debug-error-count">0</div>
                            </div>
                            <div class="stat-box">
                                <h4>Warnings</h4>
                                <div class="warning-count" id="debug-warning-count">0</div>
                            </div>
                            <div class="stat-box">
                                <h4>Info</h4>
                                <div class="info-count" id="debug-info-count">0</div>
                            </div>
                        </div>

                        <h3>Issue Types</h3>
                        <div id="debug-issue-types-list">
                            <!-- Issue types will be populated here -->
                        </div>
                    </div>

                    <div class="debug-main-content">
                        <div class="filter-bar">
                            <select id="debug-severity-filter">
                                <option value="all">All Severities</option>
                                <option value="ERROR">Errors Only</option>
                                <option value="WARNING">Warnings Only</option>
                                <option value="INFO">Info Only</option>
                            </select>
                            <input type="text" id="debug-search-input" placeholder="Search issues...">
                        </div>

                        <h3 id="debug-issue-list-title">All Issues</h3>
                        <div id="debug-issues-list">
                            <!-- Issues will be populated here -->
                        </div>
                    </div>
                </div>

                <div id="debug-placeholder-message" class="placeholder">
                    <h3>No debug data loaded</h3>
                    <p>Use the drag and drop area in the header to load debug JSON files.</p>
                </div>
            `;

            // Bind events after creating the HTML structure
            this.bindDebugEvents();
        },

        bindDebugEvents: function() {
            const severityFilter = document.getElementById('debug-severity-filter');
            const searchInput = document.getElementById('debug-search-input');

            // State for debug viewer
            this.debugData = null;
            this.issuesByType = {};
            this.selectedType = 'all';
            this.severityFilterValue = 'all';
            this.searchTerm = '';

            // Store module instance in a variable to use in event handlers
            const self = this;

            if (severityFilter) {
                severityFilter.addEventListener('change', function() {
                    self.severityFilterValue = this.value;
                    self.renderIssuesList();
                });
            }

            if (searchInput) {
                searchInput.addEventListener('input', function() {
                    self.searchTerm = this.value.toLowerCase();
                    self.renderIssuesList();
                });
            }
        },

        // This function is now called by the file handler
        loadDebugData: function(data) {
            // Check if the data has the expected structure
            if (!data.issues || !Array.isArray(data.issues)) {
                if (Array.isArray(data)) {
                    // If it's just an array of issues
                    this.debugData = {
                        total_issues: data.length,
                        errors: data.filter(i => i.severity === 'ERROR').length,
                        warnings: data.filter(i => i.severity === 'WARNING').length,
                        infos: data.filter(i => i.severity === 'INFO').length,
                        issues: data
                    };
                } else {
                    alert('Invalid debug data format. Expected issues array.');
                    return;
                }
            } else {
                this.debugData = data;
                // Add info count if not already present
                if (!this.debugData.infos) {
                    this.debugData.infos = this.debugData.issues.filter(i => i.severity === 'INFO').length;
                }
            }

            // Show the main container and hide the placeholder
            const mainContainer = document.getElementById('debug-main-container');
            const placeholderMessage = document.getElementById('debug-placeholder-message');
            if (mainContainer) mainContainer.style.display = 'grid';
            if (placeholderMessage) placeholderMessage.style.display = 'none';

            // Process and display the data
            this.processDebugData();
        },

        processDebugData: function() {
            const issues = this.debugData.issues;
            const errorCount = document.getElementById('debug-error-count');
            const warningCount = document.getElementById('debug-warning-count');
            const infoCount = document.getElementById('debug-info-count');

            // Update summary stats
            if (errorCount) errorCount.textContent = this.debugData.errors || issues.filter(i => i.severity === 'ERROR').length;
            if (warningCount) warningCount.textContent = this.debugData.warnings || issues.filter(i => i.severity === 'WARNING').length;
            if (infoCount) infoCount.textContent = this.debugData.infos || issues.filter(i => i.severity === 'INFO').length;

            // Group issues by type
            this.issuesByType = {};
            issues.forEach(issue => {
                if (!this.issuesByType[issue.type]) {
                    this.issuesByType[issue.type] = [];
                }
                this.issuesByType[issue.type].push(issue);
            });

            // Render issue types
            this.renderIssueTypes();

            // Default to showing all issues
            this.selectedType = 'all';
            this.renderIssuesList();
        },

        renderIssueTypes: function() {
            const issueTypesList = document.getElementById('debug-issue-types-list');
            if (!issueTypesList) return;

            // Sort issue types by severity (error count first, then warning count)
            const sortedTypes = Object.keys(this.issuesByType).sort((a, b) => {
                const aErrors = this.issuesByType[a].filter(i => i.severity === 'ERROR').length;
                const bErrors = this.issuesByType[b].filter(i => i.severity === 'ERROR').length;

                if (aErrors !== bErrors) return bErrors - aErrors;

                const aWarnings = this.issuesByType[a].filter(i => i.severity === 'WARNING').length;
                const bWarnings = this.issuesByType[b].filter(i => i.severity === 'WARNING').length;

                if (aWarnings !== bWarnings) return bWarnings - aWarnings;

                return this.issuesByType[b].length - this.issuesByType[a].length;
            });

            // Clear previous content
            issueTypesList.innerHTML = '';

            // Add "All Issues" option
            const allIssuesElement = document.createElement('div');
            allIssuesElement.className = 'issue-type selected';
            allIssuesElement.textContent = 'All Issues';
            allIssuesElement.dataset.type = 'all';
            allIssuesElement.addEventListener('click', () => {
                this.selectIssueType('all');
            });
            issueTypesList.appendChild(allIssuesElement);

            // Add individual issue types
            sortedTypes.forEach(type => {
                const issues = this.issuesByType[type];
                const errorCount = issues.filter(i => i.severity === 'ERROR').length;
                const warningCount = issues.filter(i => i.severity === 'WARNING').length;
                const infoCount = issues.length - errorCount - warningCount;

                const typeElement = document.createElement('div');
                typeElement.className = 'issue-type';
                typeElement.dataset.type = type;
                typeElement.textContent = type;

                // Add badges for errors, warnings, and info
                if (errorCount > 0) {
                    const errorBadge = document.createElement('span');
                    errorBadge.className = 'error-badge';
                    errorBadge.textContent = errorCount;
                    typeElement.appendChild(errorBadge);
                }

                if (warningCount > 0) {
                    const warningBadge = document.createElement('span');
                    warningBadge.className = 'warning-badge';
                    warningBadge.textContent = warningCount;
                    typeElement.appendChild(warningBadge);
                }

                if (infoCount > 0) {
                    const infoBadge = document.createElement('span');
                    infoBadge.className = 'info-badge';
                    infoBadge.textContent = infoCount;
                    typeElement.appendChild(infoBadge);
                }

                typeElement.addEventListener('click', () => {
                    this.selectIssueType(type);
                });

                issueTypesList.appendChild(typeElement);
            });
        },

        selectIssueType: function(type) {
            this.selectedType = type;

            // Update selected styling
            document.querySelectorAll('#debug-issue-types-list .issue-type').forEach(el => {
                el.classList.remove('selected');
                if (el.dataset.type === type) {
                    el.classList.add('selected');
                }
            });

            // Update title and issues list
            const issueListTitle = document.getElementById('debug-issue-list-title');
            if (issueListTitle) {
                issueListTitle.textContent = type === 'all' ? 'All Issues' : `Issues: ${type}`;
            }
            this.renderIssuesList();
        },

        renderIssuesList: function() {
            const issuesList = document.getElementById('debug-issues-list');
            if (!issuesList) return;

            // Clear previous content
            issuesList.innerHTML = '';

            if (!this.debugData) return;

            // Filter issues based on selected type, severity, and search term
            let filteredIssues = this.debugData.issues;

            if (this.selectedType !== 'all') {
                filteredIssues = filteredIssues.filter(issue => issue.type === this.selectedType);
            }

            if (this.severityFilterValue !== 'all') {
                filteredIssues = filteredIssues.filter(issue => issue.severity === this.severityFilterValue);
            }

            const searchTerm = this.searchTerm;
            if (searchTerm && searchTerm.length > 0) {
                filteredIssues = filteredIssues.filter(issue => {
                    // Helper function to recursively search in all fields of an object
                    const searchInObject = (obj) => {
                        if (!obj) return false;

                        // For arrays, search in each element
                        if (Array.isArray(obj)) {
                            return obj.some(item => searchInObject(item));
                        }

                        // For objects, search recursively in all properties
                        if (typeof obj === 'object') {
                            return Object.values(obj).some(value => searchInObject(value));
                        }

                        // For strings, check if they include the search term
                        if (typeof obj === 'string') {
                            return obj.toLowerCase().includes(searchTerm);
                        }

                        // For numbers and booleans, convert to string and check
                        if (typeof obj === 'number' || typeof obj === 'boolean') {
                            return String(obj).toLowerCase().includes(searchTerm);
                        }

                        return false;
                    };

                    // Search the entire issue object
                    return searchInObject(issue);
                });
            }

            // Sort issues by severity (errors first, then warnings, then info)
            filteredIssues.sort((a, b) => {
                const severityOrder = { 'ERROR': 0, 'WARNING': 1, 'INFO': 2 };
                return severityOrder[a.severity] - severityOrder[b.severity];
            });

            // Render issues
            if (filteredIssues.length === 0) {
                issuesList.innerHTML = `<p class="placeholder">No issues match the current filters.</p>
                <p class="placeholder">Current search: "${this.searchTerm || 'None'}", Severity: ${this.severityFilterValue}, Type: ${this.selectedType}</p>`;
                return;
            }

            filteredIssues.forEach(issue => {
                const issueElement = document.createElement('div');
                issueElement.className = `issue-item issue-${issue.severity.toLowerCase()}`;

                // Header with severity badge
                const header = document.createElement('h3');
                const severityBadge = document.createElement('span');

                if (issue.severity === 'ERROR') {
                    severityBadge.className = 'error-badge';
                } else if (issue.severity === 'WARNING') {
                    severityBadge.className = 'warning-badge';
                } else if (issue.severity === 'INFO') {
                    severityBadge.className = 'info-badge';
                }

                severityBadge.textContent = issue.severity;

                header.textContent = `${issue.type}: `;
                header.appendChild(severityBadge);
                issueElement.appendChild(header);

                // Message - with clickable render target names
                const message = document.createElement('div');

                // Look for render target references in the message text
                // Format is typically "RT 'name'" or similar patterns
                let messageText = issue.message;

                // Create a function to make render target names clickable
                const makeRenderTargetsClickable = (text) => {
                    // Match patterns like: RT 'name' or render target 'name' or similar variations
                    const rtPatterns = [
                        /RT\s+'([^']+)'/g,                    // RT 'name'
                        /RT\s+"([^"]+)"/g,                    // RT "name"
                        /render target\s+'([^']+)'/gi,        // render target 'name'
                        /render target\s+"([^"]+)"/gi,        // render target "name"
                        /render target\s+([a-zA-Z0-9_]+)/gi,  // render target name (without quotes)
                        /'([^']+)'\s+(?:RT|render target)/gi  // 'name' render target
                    ];

                    // Replace all instances of render target names with clickable spans
                    rtPatterns.forEach(pattern => {
                        text = text.replace(pattern, (match, rtName) => {
                            // Keep the original text but wrap the RT name in a clickable span
                            const clickablePart = match.replace(rtName, `<span class="clickable-rt" style="cursor:pointer;color:#3498db;text-decoration:underline;" data-rtname="${rtName}">${rtName}</span>`);
                            return clickablePart;
                        });
                    });

                    return text;
                };

                // Apply the transformation
                message.innerHTML = makeRenderTargetsClickable(messageText);

                // Add click handlers to the clickable spans
                setTimeout(() => {
                    const clickableRTs = message.querySelectorAll('.clickable-rt');
                    clickableRTs.forEach(el => {
                        el.addEventListener('click', () => {
                            const rtName = el.dataset.rtname;
                            // Set search term and switch to details view
                            app.setSearchAndSwitchTab(rtName, 'details');
                        });
                    });
                }, 0);

                issueElement.appendChild(message);

                // Details
                if (issue.details && Object.keys(issue.details).length > 0) {
                    const details = document.createElement('div');
                    details.className = 'details';

                    // Format the JSON, but also make any render target references clickable
                    const detailsText = JSON.stringify(issue.details, null, 2);
                    const preElement = document.createElement('pre');

                    // Use the same function to make render target names in the JSON clickable
                    preElement.innerHTML = makeRenderTargetsClickable(detailsText);

                    // Add click handlers to these spans too
                    setTimeout(() => {
                        const clickableRTs = preElement.querySelectorAll('.clickable-rt');
                        clickableRTs.forEach(el => {
                            el.addEventListener('click', () => {
                                const rtName = el.dataset.rtname;
                                // Set search term and switch to details view
                                app.setSearchAndSwitchTab(rtName, 'details');
                            });
                        });
                    }, 0);

                    details.appendChild(preElement);
                    issueElement.appendChild(details);
                }

                issuesList.appendChild(issueElement);
            });
        }


    });

})(RenderGraphViewer);