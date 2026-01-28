// Common shared functionality between modules
const RenderGraphViewer = (function() {
    let graphData = null;
    let selectedRenderTargetIndex = null;
    let colorMap = {};
    // Simple tab registry
    const tabModules = {};

    // DOM Elements
    const elements = {
        renderTargetList: document.getElementById('render-target-list'),
        renderTargetDetails: document.getElementById('render-target-details'),
        searchInput: document.getElementById('search-input'),
        clearSearchBtn: document.getElementById('clear-search-btn'),
        tabs: document.querySelectorAll('.tab'),
        viewPanels: document.querySelectorAll('.view-panel'),
        timelineTooltip: document.getElementById('timeline-tooltip'),
        timelineContent: document.getElementById('timeline-content'),
        timelineAxis: document.getElementById('timeline-axis'),
        timelineContainer: document.getElementById('timeline-container')
    };

    // Initialize the application
    function init() {
        bindEvents();
        initializeDragDropAreas();
    }

    // Create and initialize drag-drop areas
    function initializeDragDropAreas() {
        // Create a File Handler if not already created
        if (!RenderGraphViewer.FileHandler) {
            console.warn("File Handler not available. Please load file-handler.js first.");
            return;
        }

        // Replace the button group in header with a drag-drop area
        const buttonGroup = document.querySelector('.button-group');
        if (buttonGroup) {
            // Create new drag-drop area
            const dragDropArea = RenderGraphViewer.FileHandler.createDragDropArea(
                'main-drag-drop',
                'drag-drop-area header-drag-drop'
            );

            // Replace button group with drag-drop area
            buttonGroup.parentNode.replaceChild(dragDropArea, buttonGroup);
        }

        // No longer creating a second drag-drop area in the debug panel
        // since we're going with a single loading interface
    }

    // Bind event listeners
    function bindEvents() {
        // Search functionality
        elements.searchInput.addEventListener('input', handleSearch);

        // Clear search button
        elements.clearSearchBtn.addEventListener('click', function() {
            elements.searchInput.value = '';
            handleSearch(); // Trigger search to update views
            elements.searchInput.focus(); // Keep focus on the search input
        });

        // Tab switching
        elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.dataset.tab;
                switchTab(tabId);
            });
        });

        // Hide tooltips on document click
        document.addEventListener('click', () => {
            // Hide all tooltips
            const tooltips = document.querySelectorAll('.timeline-tooltip, .nodegraph-tooltip');
            tooltips.forEach(tooltip => {
                tooltip.style.display = 'none';
            });
        });

        // Timeline tooltip
        document.addEventListener('mousemove', (e) => {
            if (elements.timelineTooltip.style.display === 'block') {
                const tooltip = elements.timelineTooltip;
                tooltip.style.left = (e.pageX + 15) + 'px';
                tooltip.style.top = (e.pageY + 15) + 'px';
            }
        });

        // Add keyboard shortcut for clearing search
        document.addEventListener('keydown', (e) => {
            // If Escape key is pressed
            if (e.key === 'Escape') {
                // Clear search input if it's not empty
                if (elements.searchInput.value !== '') {
                    elements.searchInput.value = '';
                    handleSearch(); // Trigger search to update views
                }
            }
        });
    }

    // Register a module for a tab
    function registerTabModule(tabId, module) {
        tabModules[tabId] = module;
    }

    // Switch between tabs
    function switchTab(tabId) {
        // Update tab buttons
        elements.tabs.forEach(tab => {
            if (tab.dataset.tab === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update panels
        elements.viewPanels.forEach(panel => {
            if (panel.id === tabId + '-panel') {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        // Show or hide render target list based on active tab
        const renderTargetListContainer = document.querySelector('.render-target-list-container');
        if (renderTargetListContainer) {
            renderTargetListContainer.style.display = tabId === 'details' ? 'flex' : 'none';
        }

        // Call the module's activate function if it exists
        if (tabModules[tabId] && typeof tabModules[tabId].activate === 'function') {
            tabModules[tabId].activate();
        }
    }

    // Handle search input
    function handleSearch() {
        const searchTerm = elements.searchInput.value.toLowerCase();

        // Filter render target list for details view
        const renderTargetItems = elements.renderTargetList.querySelectorAll('.render-target-item');
        renderTargetItems.forEach(item => {
            const targetName = item.textContent.toLowerCase();
            if (targetName.includes(searchTerm)) {
                item.classList.remove('hide');
            } else {
                item.classList.add('hide');
            }
        });

        // Notify the active module about search term changes for filtering in other views
        const activeTab = Array.from(elements.tabs).find(tab => tab.classList.contains('active'));
        if (activeTab) {
            const tabId = activeTab.dataset.tab;
            if (tabModules[tabId] && typeof tabModules[tabId].onSearch === 'function') {
                tabModules[tabId].onSearch(searchTerm);
            }
        }
    }

    // Load and process graph data
    function loadGraphData(data) {
        graphData = data;
        renderRenderTargetList();
        clearRenderTargetDetails();
        assignColors();

        // Notify active tab about data change
        const activeTab = Array.from(elements.tabs).find(tab => tab.classList.contains('active'));
        if (activeTab) {
            const tabId = activeTab.dataset.tab;
            if (tabModules[tabId] && typeof tabModules[tabId].onDataLoaded === 'function') {
                tabModules[tabId].onDataLoaded(data);
            }
        }

        // Ensure render target list container is displayed only in details view
        const renderTargetListContainer = document.querySelector('.render-target-list-container');
        if (renderTargetListContainer) {
            const activePanel = document.querySelector('.view-panel.active');
            renderTargetListContainer.style.display = activePanel && activePanel.id === 'details-panel' ? 'flex' : 'none';
        }
    }

    // Assign unique colors to render targets
    function assignColors() {
        colorMap = {};
        const renderTargets = graphData?.render_targets_by_first_usage || [];

        renderTargets.forEach((rt, index) => {
            // Generate HSL colors with good distribution
            const hue = Math.floor((index * 137.5) % 360);
            const saturation = 65 + (index % 2) * 10;
            const lightness = 45 + (index % 3) * 5;

            colorMap[rt.index] = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        });
    }

    // Render the list of render targets
    function renderRenderTargetList() {
        if (!graphData || !graphData.render_targets_by_first_usage) {
            elements.renderTargetList.innerHTML = ViewHelper.createInfoMessage('No valid data loaded.');
            return;
        }

        elements.renderTargetList.innerHTML = '';

        graphData.render_targets_by_first_usage.forEach(rt => {
            const item = ViewHelper.createElement('div', 'render-target-item', {
                dataset: { index: rt.index },
                textContent: rt.name,
                title: rt.name // Add tooltip for long names
            });

            item.addEventListener('click', () => {
                selectRenderTarget(rt.index);
            });

            elements.renderTargetList.appendChild(item);
        });
    }

    // Select a render target and display its details
    function selectRenderTarget(index) {
        if (selectedRenderTargetIndex === index) return;

        // Update selected item in the list
        const items = elements.renderTargetList.querySelectorAll('.render-target-item');
        items.forEach(item => {
            if (parseInt(item.dataset.index) === index) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        selectedRenderTargetIndex = index;

        // Find the render target in the data
        const renderTarget = graphData.render_targets_by_first_usage.find(rt => rt.index === index);
        if (renderTarget) {
            // Notify details module
            if (tabModules.details && typeof tabModules.details.showRenderTarget === 'function') {
                tabModules.details.showRenderTarget(renderTarget);
            }
        }
    }

    // Clear render target details
    function clearRenderTargetDetails() {
        if (tabModules.details && typeof tabModules.details.clear === 'function') {
            tabModules.details.clear();
        }
        selectedRenderTargetIndex = null;
    }

    // ViewHelper - A collection of helper functions for creating view components
    const ViewHelper = {
        // Create an HTML element with optional class and attributes
        createElement: function(tag, className = '', attributes = {}) {
            const element = document.createElement(tag);
            if (className) element.className = className;

            // Set any additional attributes
            Object.entries(attributes).forEach(([key, value]) => {
                if (key === 'dataset') {
                    Object.entries(value).forEach(([dataKey, dataValue]) => {
                        element.dataset[dataKey] = dataValue;
                    });
                } else if (key === 'style' && typeof value === 'object') {
                    Object.entries(value).forEach(([styleKey, styleValue]) => {
                        element.style[styleKey] = styleValue;
                    });
                } else {
                    element[key] = value;
                }
            });

            return element;
        },

        // Create a section with a title
        createSection: function(title, content = '') {
            const section = this.createElement('div', 'section');

            if (title) {
                const heading = this.createElement('h2', '', { textContent: title });
                section.appendChild(heading);
            }

            if (typeof content === 'string') {
                section.innerHTML += content;
            } else if (content instanceof Element) {
                section.appendChild(content);
            }

            return section;
        },

        // Create an info message panel
        createInfoMessage: function(message) {
            return `<div class="info-message">${message}</div>`;
        },

        // Create a property box for displaying key-value pairs
        createPropertyBox: function(properties) {
            const box = this.createElement('div', 'property-box');

            Object.entries(properties).forEach(([label, value]) => {
                const item = this.createElement('div', 'property-item');

                const labelElement = this.createElement('span', 'property-label', {
                    textContent: label
                });

                // Handle HTML content in values
                const valueElement = this.createElement('span', 'property-value');
                if (typeof value === 'string' && value.includes('<')) {
                    valueElement.innerHTML = value;
                } else {
                    valueElement.textContent = value;
                }

                item.appendChild(labelElement);
                item.appendChild(valueElement);
                box.appendChild(item);
            });

            return box;
        },

        // Create a badge
        createBadge: function(text, className = '') {
            return `<span class="badge ${className}">${text}</span>`;
        },

        // Create a badge container with multiple badges
        createBadgeContainer: function(items, classNameFn = null) {
            if (!items || items.length === 0) return '';

            let html = '<div class="badge-container">';
            items.forEach(item => {
                const className = classNameFn ? classNameFn(item) : '';
                html += this.createBadge(item, className);
            });
            html += '</div>';

            return html;
        },

        // Create a simple table from an array of objects
        createTable: function(data, columns) {
            if (!data || data.length === 0) {
                return '<p>No data available</p>';
            }

            let html = '<table>';

            // Create header
            html += '<thead><tr>';
            columns.forEach(col => {
                html += `<th>${col.header}</th>`;
            });
            html += '</tr></thead>';

            // Create body
            html += '<tbody>';
            data.forEach(row => {
                html += '<tr>';
                columns.forEach(col => {
                    const value = col.accessor(row);
                    html += `<td>${value}</td>`;
                });
                html += '</tr>';
            });
            html += '</tbody></table>';

            return html;
        },

        // Format relationship type to readable name
        formatRelationshipType: function(type) {
            switch (type) {
                case 'read': return 'Read';
                case 'write': return 'Write';
                case 'node_input': return 'Read';
                case 'node_output': return 'Write';
                case 'color_attachment': return 'Color Attachment';
                case 'depth_attachment': return 'Depth Attachment';
                case 'resolve_attachment': return 'Resolve Attachment';
                default: return type.charAt(0).toUpperCase() + type.slice(1);
            }
        },

        // Format resolution display
        formatResolution: function(resolution) {
            if (resolution.type === 'full') {
                return 'Full Screen';
            } else {
                return `${resolution.x * 100}% × ${resolution.y * 100}%`;
            }
        },

        // Create HTML for usage types
        createUsageTypesHTML: function(usageTypes) {
            if (!usageTypes || usageTypes.length === 0) {
                return '';
            }

            return `
                <div class="usage-types">
                    ${usageTypes.map(usage => {
                        let typeName = usage.type || 'unknown';
                        let passInfo = usage.pass_name ? ` (${usage.pass_name})` : '';

                        // Format relationship name
                        typeName = this.formatRelationshipType(typeName);

                        return this.createBadge(typeName + passInfo, usage.type);
                    }).join(' ')}
                </div>
            `;
        },

        // Create tooltip content for a relationship
        createRelationshipTooltip: function(type, rel, renderTarget) {
            let tooltipTitle = '';
            let tooltipContent = '';

            switch(type) {
                case 'read':
                case 'node_input':
                    tooltipTitle = 'Read Operation (Node Input)';
                    break;
                case 'write':
                case 'node_output':
                    tooltipTitle = 'Write Operation (Node Output)';
                    break;
                case 'color_attachment':
                    tooltipTitle = 'Color Attachment';
                    tooltipContent = `Render Pass: ${rel.pass_name || 'Unknown'}<br>`;
                    break;
                case 'depth_attachment':
                    tooltipTitle = 'Depth Attachment';
                    tooltipContent = `Render Pass: ${rel.pass_name || 'Unknown'}<br>`;
                    break;
                case 'resolve_attachment':
                    tooltipTitle = 'Resolve Attachment';
                    tooltipContent = `Render Pass: ${rel.pass_name || 'Unknown'}<br>`;
                    break;
                default:
                    tooltipTitle = 'Relationship';
            }

            return `
                <strong>${tooltipTitle}</strong><br>
                ${tooltipContent}
                Node: ${rel.name} (#${rel.node_index})<br>
                Execution Order: ${rel.execution_order}<br>
                Render Target: ${renderTarget.name} (#${renderTarget.index})<br>
                ${rel.conditions && rel.conditions.length ?
                    `Conditions: ${rel.conditions.join(', ')}` : ''}
            `;
        },

        // Create a module template with standard lifecycle methods
        createViewModule: function(id, options = {}) {
            const defaultOptions = {
                // Define custom initialization here
                init: function() {},

                // Called when the tab is activated
                activate: function() {},

                // Called when new data is loaded
                onDataLoaded: function(data) {},

                // Add any custom methods here
                ...options
            };

            // Create the module object
            const module = { ...defaultOptions };

            // Register the module
            registerTabModule(id, module);

            // Initialize if needed
            if (typeof module.init === 'function') {
                module.init();
            }

            return module;
        }
    };

    // Set search term and trigger search
    function setSearchAndSwitchTab(searchTerm, tabId) {
        // Set search input value
        elements.searchInput.value = searchTerm;

        // Trigger search event
        handleSearch();

        // Switch to specified tab
        if (tabId) {
            switchTab(tabId);
        }
    }

    // Export public methods and required references
    return {
        init: init,
        elements: elements,
        graphData: () => graphData,
        colorMap: () => colorMap,
        registerTabModule: registerTabModule,
        switchTab: switchTab,
        setSearchAndSwitchTab: setSearchAndSwitchTab,
        ViewHelper: ViewHelper, // Export the helper for use by other modules
        tabModules: tabModules, // Expose tabModules for file handler access
        loadGraphData: loadGraphData // Expose loadGraphData for file handler
    };
})();