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
            // If we have debug data already loaded, ensure the container is visible
            if (this.debugData) {
                const mainContainer = document.getElementById('debug-main-container');
                const placeholderMessage = document.getElementById('debug-placeholder-message');
                if (mainContainer) mainContainer.style.display = 'grid';
                if (placeholderMessage) placeholderMessage.style.display = 'none';
            }
        },

        onDataLoaded: function(data) {
            // When new graph data is loaded, re-run validation if analyzedData is available
            if (app.analyzedData && window.RenderGraphDebugger) {
                const issues = window.RenderGraphDebugger.runAllChecks(
                    app.analyzedData.renderTargets,
                    app.analyzedData.nodes,
                    app.analyzedData.renderPasses,
                    app.rawData || null
                );
                const debugData = window.RenderGraphDebugger.formatIssuesForView(issues);
                this.loadDebugData(debugData);
            }
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
                            <div class="stat-box">
                                <h4>Transitions</h4>
                                <div class="transition-count" id="debug-transition-count">0</div>
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
                // Add info count if not already present (use undefined check, not falsy,
                // since 0 is a valid count)
                if (this.debugData.infos === undefined) {
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

        // Issue types that represent resource transition concerns
        TRANSITION_TYPES: [
            'REDUNDANT_WRITE', 'WRITE_THEN_CLEAR',
            'MISSING_TRANSFER_SRC_FLAG', 'MISSING_TRANSFER_DST_FLAG',
            'SAME_PASS_READ_WRITE'
        ],

        processDebugData: function() {
            const issues = this.debugData.issues;
            const errorCount = document.getElementById('debug-error-count');
            const warningCount = document.getElementById('debug-warning-count');
            const infoCount = document.getElementById('debug-info-count');
            const transitionCount = document.getElementById('debug-transition-count');

            // Update summary stats (use nullish coalescing to avoid 0 being treated as falsy)
            if (errorCount) errorCount.textContent = this.debugData.errors ?? issues.filter(i => i.severity === 'ERROR').length;
            if (warningCount) warningCount.textContent = this.debugData.warnings ?? issues.filter(i => i.severity === 'WARNING').length;
            if (infoCount) infoCount.textContent = this.debugData.infos ?? issues.filter(i => i.severity === 'INFO').length;

            // Count transition-related issues
            if (transitionCount) {
                const transCount = issues.filter(i => this.TRANSITION_TYPES.includes(i.type)).length;
                transitionCount.textContent = transCount;
            }

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

            // Add "Resource Transitions" group filter
            const transitionIssueCount = Object.keys(this.issuesByType)
                .filter(t => this.TRANSITION_TYPES.includes(t))
                .reduce((sum, t) => sum + this.issuesByType[t].length, 0);

            if (transitionIssueCount > 0) {
                const transElement = document.createElement('div');
                transElement.className = 'issue-type';
                transElement.dataset.type = '_transitions';
                transElement.textContent = 'Resource Transitions';

                const countBadge = document.createElement('span');
                countBadge.className = 'info-badge';
                countBadge.textContent = transitionIssueCount;
                transElement.appendChild(countBadge);

                transElement.addEventListener('click', () => {
                    this.selectIssueType('_transitions');
                });
                issueTypesList.appendChild(transElement);
            }

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
                if (type === 'all') {
                    issueListTitle.textContent = 'All Issues';
                } else if (type === '_transitions') {
                    issueListTitle.textContent = 'Resource Transitions';
                } else {
                    issueListTitle.textContent = `Issues: ${type}`;
                }
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

            if (this.selectedType === '_transitions') {
                filteredIssues = filteredIssues.filter(issue => this.TRANSITION_TYPES.includes(issue.type));
            } else if (this.selectedType !== 'all') {
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

                // Create a function to make render target names clickable.
                // Uses a single pass regex to avoid double-wrapping from sequential patterns.
                const makeRenderTargetsClickable = (text) => {
                    // Match quoted names after RT or render target keywords in one pass.
                    // Captures: RT 'name', RT "name", render target 'name', render target "name"
                    const pattern = /(?:RT|render target)\s+['"]([^'"]+)['"]/gi;

                    return text.replace(pattern, (match, rtName) => {
                        const clickablePart = match.replace(rtName, `<span class="clickable-rt" style="cursor:pointer;color:#3498db;text-decoration:underline;" data-rtname="${rtName}">${rtName}</span>`);
                        return clickablePart;
                    });
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

                // Transition visual for issues with from/to layout data
                if (issue.details && issue.details.from && issue.details.to &&
                    issue.details.from.layout && issue.details.to.layout) {
                    const transVisual = this.createTransitionVisual(issue);
                    if (transVisual) {
                        issueElement.appendChild(transVisual);
                    }
                }

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
        },

        /**
         * Create a visual transition indicator showing from-layout -> to-layout
         */
        createTransitionVisual: function(issue) {
            const from = issue.details.from;
            const to = issue.details.to;

            // Determine transition class for color coding
            let transitionClass = 'transition-layout-change';
            if (issue.type === 'REDUNDANT_WRITE' ||
                       issue.type === 'WRITE_THEN_CLEAR' ||
                       issue.type === 'SAME_PASS_READ_WRITE') {
                transitionClass = 'transition-hazard';
            } else if (issue.type === 'MISSING_TRANSFER_SRC_FLAG' ||
                       issue.type === 'MISSING_TRANSFER_DST_FLAG') {
                transitionClass = 'transition-error';
            }

            const container = document.createElement('div');
            container.className = `transition-visual ${transitionClass}`;

            // From state
            const fromState = document.createElement('div');
            fromState.className = 'transition-state transition-state-from';

            const fromLayout = document.createElement('div');
            fromLayout.className = 'transition-layout';
            fromLayout.textContent = from.layout;
            fromState.appendChild(fromLayout);

            const fromStage = document.createElement('div');
            fromStage.className = 'transition-stage';
            fromStage.textContent = from.stage;
            fromState.appendChild(fromStage);

            const fromNode = document.createElement('div');
            fromNode.className = 'transition-node';
            fromNode.textContent = from.node_name + ' (' + from.access + ')';
            fromState.appendChild(fromNode);

            container.appendChild(fromState);

            // Arrow
            const arrow = document.createElement('div');
            arrow.className = 'transition-arrow';
            arrow.textContent = '-->';
            container.appendChild(arrow);

            // To state
            const toState = document.createElement('div');
            toState.className = 'transition-state transition-state-to';

            const toLayout = document.createElement('div');
            toLayout.className = 'transition-layout';
            toLayout.textContent = to.layout;
            toState.appendChild(toLayout);

            const toStage = document.createElement('div');
            toStage.className = 'transition-stage';
            toStage.textContent = to.stage;
            toState.appendChild(toStage);

            const toNode = document.createElement('div');
            toNode.className = 'transition-node';
            toNode.textContent = to.node_name + ' (' + to.access + ')';
            toState.appendChild(toNode);

            container.appendChild(toState);

            // Show active conditions if present
            if (issue.details.active_conditions && issue.details.active_conditions.length > 0) {
                const condBar = document.createElement('div');
                condBar.className = 'transition-conditions';
                condBar.style.cssText = 'grid-column: 1 / -1; font-size: 0.85em; opacity: 0.8; margin-top: 4px;';
                condBar.textContent = 'when: ' + issue.details.active_conditions.join(', ');
                container.appendChild(condBar);
            }

            return container;
        }

    });

})(RenderGraphViewer);