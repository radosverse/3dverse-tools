// Timeline visualization functionality - CSS-based counting
(function(app) {
    // Get the ViewHelper
    const vh = app.ViewHelper;

    // Module API
    const timelineModule = vh.createViewModule('timeline', {
        init: function() {
            this.container = app.elements.timelineContainer;
            this.content = app.elements.timelineContent;
            this.tooltip = app.elements.timelineTooltip;
            this.maxExecutionOrder = 0;
        },

        activate: function() {
            if (app.graphData()) {
                this.buildTimeline(app.graphData());
            } else {
                this.content.innerHTML = vh.createInfoMessage('CHRONOLOGICAL RECORDS MODIFIED. Events have been unapproved from history. Submit correct data or report to the Ministry of Time for reeducation.');
            }
        },

        onDataLoaded: function(data) {
            // Only rebuild timeline if it's active
            const timelinePanel = document.getElementById('timeline-panel');
            if (timelinePanel.classList.contains('active')) {
                this.buildTimeline(data);
            }
        },

        // Classify node type for counting
        classifyNodeType: function(markerType, usage) {
            // Types that are rendered as dots (circles)
            const dotTypes = ['node_input', 'read', 'write', 'node_output'];
            // Types that are rendered as squares
            const squareTypes = [
                'color_attachment',
                'depth_attachment',
                'resolve_attachment',
                'msaa_resolve_target'
            ];

            // Simplified color classification based on usage
            const isRed = usage === 'write';
            const isGreen = usage === 'read';

            return {
                isDot: dotTypes.includes(markerType),
                isSquare: squareTypes.includes(markerType),
                isGreen: isGreen,
                isRed: isRed
            };
        },

        buildTimeline: function(graphData) {
            if (!graphData || !graphData.render_targets_by_first_usage) {
                this.content.innerHTML = vh.createInfoMessage('No valid data loaded.');
                return;
            }

            // Clear existing content
            this.content.innerHTML = '';

            // Determine the max execution order
            this.maxExecutionOrder = 0;
            if (graphData.nodes_by_execution_order && graphData.nodes_by_execution_order.length > 0) {
                this.maxExecutionOrder = graphData.nodes_by_execution_order[graphData.nodes_by_execution_order.length - 1].execution_order;
            }

            // Create the header with timeline info - we'll update the counts later
            const header = vh.createElement('div', 'timeline-grid-header');
            header.innerHTML = `<h3>Render Target Timeline Grid (Execution Order 0-${this.maxExecutionOrder})</h3>`;
            this.content.appendChild(header);

            // Create container for the grid
            const gridContainer = vh.createElement('div', 'timeline-grid-container');
            this.content.appendChild(gridContainer);

            // Create the grid table
            const table = vh.createElement('table', 'timeline-grid');
            gridContainer.appendChild(table);

            // Create table header
            const thead = document.createElement('thead');
            table.appendChild(thead);

            const headerRow = document.createElement('tr');
            thead.appendChild(headerRow);

            // Add render target name column
            const renderTargetHeader = document.createElement('th');
            renderTargetHeader.textContent = 'Render Target';
            renderTargetHeader.className = 'rt-name-header';
            headerRow.appendChild(renderTargetHeader);

            // Add execution order columns (use reasonable steps to avoid too many columns)
            const columnStep = this.determineColumnStep(this.maxExecutionOrder);
            for (let i = 0; i <= this.maxExecutionOrder; i += columnStep) {
                const th = document.createElement('th');
                th.textContent = i;
                th.className = 'exec-order-header';
                headerRow.appendChild(th);
            }

            // Create table body
            const tbody = document.createElement('tbody');
            table.appendChild(tbody);

            // Counters for shapes and colors
            let dotCount = 0;     // Circles (nodes with dot class)
            let squareCount = 0;  // Squares (nodes with square class)
            let greenCount = 0;   // Green nodes (read operations)
            let redCount = 0;     // Red nodes (write operations)

            // Create rows for each render target
            graphData.render_targets_by_first_usage.forEach(rt => {
                const row = document.createElement('tr');
                row.className = 'rt-row';
                tbody.appendChild(row);

                // Add render target name cell with click functionality
                const nameCell = document.createElement('td');
                nameCell.className = 'rt-name-cell';
                nameCell.textContent = rt.name;
                nameCell.style.borderLeftColor = app.colorMap()[rt.index] || '#ccc';
                nameCell.style.cursor = 'pointer'; // Add pointer cursor to indicate it's clickable

                // Add click handler for the name cell
                nameCell.addEventListener('click', () => {
                    // Hide tooltip
                    this.tooltip.style.display = 'none';

                    // Set search term and switch to details view
                    app.setSearchAndSwitchTab(rt.name, 'details');
                });

                // Add hover effect for clickable cells
                nameCell.addEventListener('mouseenter', () => {
                    nameCell.style.backgroundColor = 'rgba(52, 152, 219, 0.2)';
                });

                nameCell.addEventListener('mouseleave', () => {
                    nameCell.style.backgroundColor = '';
                });

                row.appendChild(nameCell);

                // Process all execution positions
                for (let i = 0; i <= this.maxExecutionOrder; i += columnStep) {
                    const cell = document.createElement('td');
                    cell.className = 'exec-order-cell';

                    // Get node markers for this cell
                    const nodeMarkers = this.getNodeMarkersForRange(rt, i, i + columnStep - 1);

                    if (nodeMarkers.length > 0) {
                        cell.className += ' has-node';

                        // Add node markers
                        nodeMarkers.forEach(marker => {
                            const nodeIndicator = vh.createElement('div', `node-indicator ${marker.type}`);

                            // Classify the node type based on marker.type and usage
                            const classification = this.classifyNodeType(marker.type, marker.relationship.usage);

                            // Count based on visual classification
                            if (classification.isDot) dotCount++;
                            if (classification.isSquare) squareCount++;
                            if (classification.isGreen) greenCount++;
                            if (classification.isRed) redCount++;

                            // Add tooltip
                            nodeIndicator.addEventListener('mouseenter', (e) => {
                                let tooltipContent;

                                // If this is a render pass marker with multiple nodes
                                if (marker.relationship.all_nodes_in_pass) {
                                    tooltipContent = this.createRenderPassTooltip(marker.type, marker.relationship, rt);
                                } else {
                                    tooltipContent = vh.createRelationshipTooltip(marker.type, marker.relationship, rt);
                                }

                                this.tooltip.innerHTML = tooltipContent;
                                this.tooltip.style.display = 'block';
                                this.tooltip.style.left = (e.pageX + 15) + 'px';
                                this.tooltip.style.top = (e.pageY + 15) + 'px';
                            });

                            nodeIndicator.addEventListener('mouseleave', () => {
                                this.tooltip.style.display = 'none';
                            });

                            cell.appendChild(nodeIndicator);
                        });
                    }

                    row.appendChild(cell);
                }
            });

            // Update the header with all counts
            header.innerHTML = `
                <h3>
                    Render Target Timeline Grid (Execution Order 0-${this.maxExecutionOrder}) -
                    ${dotCount} dots, ${squareCount} squares | ${greenCount} green, ${redCount} red
                </h3>`;
        },

        determineColumnStep: function(maxOrder) {
            // Determine a reasonable column step based on max execution order
            if (maxOrder <= 20) return 1;
            if (maxOrder <= 50) return 2;
            if (maxOrder <= 100) return 5;
            if (maxOrder <= 200) return 10;
            return Math.ceil(maxOrder / 50); // Aim for about 50 columns max
        },

        getNodeMarkersForRange: function(renderTarget, startOrder, endOrder) {
            const nodeMarkers = [];

            // Track which render passes we've already added
            // Format: { passIndex_type: true }
            const addedRenderPasses = {};

            // Format: { nodeIndex_type: true } - for standalone nodes
            const addedStandaloneNodes = {};

            // Process ownership relationships (writers)
            if (renderTarget.ownership && renderTarget.ownership.length > 0) {
                renderTarget.ownership.forEach(rel => {
                    // First, check if this relationship falls within our execution order range
                    const inRange = rel.execution_order >= startOrder && rel.execution_order <= endOrder;

                    // For consolidated render pass entries with all_nodes_in_pass
                    if (rel.all_nodes_in_pass) {
                        // Check if any node in the render pass falls within the range
                        const anyNodeInRange = rel.all_nodes_in_pass.some(nodeIdx => {
                            const node = this.findNodeByIndex(nodeIdx, renderTarget);
                            return node && node.execution_order >= startOrder && node.execution_order <= endOrder;
                        });

                        if (anyNodeInRange) {
                            // Use render pass index and type as the key
                            const key = `${rel.render_pass_index}_${rel.type}`;

                            // Only add if we haven't seen this render pass before
                            if (!addedRenderPasses[key]) {
                                addedRenderPasses[key] = true;
                                nodeMarkers.push({
                                    type: rel.type,
                                    relationship: rel
                                });
                            }
                        }
                    }
                    // For individual nodes
                    else if (inRange) {
                        // For nodes in render passes
                        if (rel.render_pass_index !== undefined) {
                            // Skip individual nodes in render passes - they should be handled by the consolidated entry
                            // But in case we don't have a consolidated entry, still add them individually
                            const renderPassKey = `${rel.render_pass_index}_${rel.type}`;
                            if (!addedRenderPasses[renderPassKey]) {
                                const nodeKey = `${rel.node_index}_${rel.type}`;
                                if (!addedStandaloneNodes[nodeKey]) {
                                    addedStandaloneNodes[nodeKey] = true;
                                    nodeMarkers.push({
                                        type: rel.type,
                                        relationship: rel
                                    });
                                }
                            }
                        }
                        // For standalone nodes
                        else {
                            const nodeKey = `${rel.node_index}_${rel.type}`;
                            if (!addedStandaloneNodes[nodeKey]) {
                                addedStandaloneNodes[nodeKey] = true;
                                nodeMarkers.push({
                                    type: rel.type,
                                    relationship: rel
                                });
                            }
                        }
                    }
                });
            }

            // Process reader relationships - similar logic
            if (renderTarget.readers && renderTarget.readers.length > 0) {
                renderTarget.readers.forEach(rel => {
                    if (rel.execution_order >= startOrder && rel.execution_order <= endOrder) {
                        // For nodes in render passes
                        if (rel.render_pass_index !== undefined) {
                            // Check if we already added a marker for this render pass
                            const renderPassKey = `${rel.render_pass_index}_read`;
                            if (!addedRenderPasses[renderPassKey]) {
                                const nodeKey = `${rel.node_index}_${rel.type}`;
                                if (!addedStandaloneNodes[nodeKey]) {
                                    addedStandaloneNodes[nodeKey] = true;
                                    nodeMarkers.push({
                                        type: rel.type || 'node_input',
                                        relationship: rel
                                    });
                                }
                            }
                        }
                        // For standalone nodes
                        else {
                            const nodeKey = `${rel.node_index}_${rel.type || 'node_input'}`;
                            if (!addedStandaloneNodes[nodeKey]) {
                                addedStandaloneNodes[nodeKey] = true;
                                nodeMarkers.push({
                                    type: rel.type || 'node_input',
                                    relationship: rel
                                });
                            }
                        }
                    }
                });
            }

            // Sort node markers by execution order
            nodeMarkers.sort((a, b) => a.relationship.execution_order - b.relationship.execution_order);

            return nodeMarkers;
        },

        findNodeByIndex: function(nodeIndex, renderTarget) {
            // Try to find the node in the ownership array
            if (renderTarget.ownership) {
                for (const rel of renderTarget.ownership) {
                    if (rel.node_index === nodeIndex) {
                        return rel;
                    }
                }
            }

            // Try to find the node in the readers array
            if (renderTarget.readers) {
                for (const rel of renderTarget.readers) {
                    if (rel.node_index === nodeIndex) {
                        return rel;
                    }
                }
            }

            return null;
        },

        createRenderPassTooltip: function(type, relationship, renderTarget) {
            // Create a more detailed tooltip for render pass entries
            const renderPassName = relationship.pass_name || "Unknown Render Pass";
            let html = `<div class="tooltip-title">${renderPassName}</div>`;

            html += `<div class="tooltip-section">
                <div class="tooltip-label">Type:</div>
                <div class="tooltip-value">${type}</div>
            </div>`;

            if (relationship.all_nodes_in_pass && relationship.all_nodes_in_pass.length > 0) {
                html += `<div class="tooltip-section">
                    <div class="tooltip-label">Nodes:</div>
                    <div class="tooltip-value">
                        <ul class="tooltip-list">`;

                // Add information about each node in the render pass
                relationship.all_nodes_in_pass.forEach(nodeIdx => {
                    const node = this.findNodeByIndex(nodeIdx, renderTarget);
                    if (node) {
                        html += `<li>${node.name} (Exec: ${node.execution_order})</li>`;
                    }
                });

                html += `</ul>
                    </div>
                </div>`;
            }

            // Add render target info
            html += `<div class="tooltip-section">
                <div class="tooltip-label">Render Target:</div>
                <div class="tooltip-value">${renderTarget.name}</div>
            </div>`;

            return html;
        }
    });

})(RenderGraphViewer);