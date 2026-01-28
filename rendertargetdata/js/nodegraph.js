// Node Graph visualization functionality (simplified, no panning)
(function(app) {
    // Get the ViewHelper
    const vh = app.ViewHelper;

    // Module API
    const nodeGraphModule = vh.createViewModule('nodegraph', {
        init: function() {
            // Initialize the container
            this.container = document.getElementById('nodegraph-panel');
            this.currentSearchTerm = '';
            this.graphData = null;

            if (!this.container) {
                console.error('Node graph container not found');
                return;
            }

            // Create inner container for the visualization
            this.vizContainer = vh.createElement('div', 'nodegraph-container');
            this.container.appendChild(this.vizContainer);

            // Initialize empty message
            this.showEmptyState();

            // Create tooltips
            this.createTooltips();
        },

        // Add this new function to calculate the perceived brightness of a color
        calculatePerceivedBrightness: function(color) {
            // Handle HSL colors
            if (color.startsWith('hsl')) {
                // Extract lightness value from HSL
                const matches = color.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
                if (matches && matches[1]) {
                    return parseInt(matches[1]) / 100;
                }
                return 0.5; // Default if parsing fails
            }

            // Handle hex colors
            if (color.startsWith('#')) {
                let r, g, b;

                // #RGB or #RRGGBB
                if (color.length === 4) {
                    r = parseInt(color[1] + color[1], 16);
                    g = parseInt(color[2] + color[2], 16);
                    b = parseInt(color[3] + color[3], 16);
                } else {
                    r = parseInt(color.slice(1, 3), 16);
                    g = parseInt(color.slice(3, 5), 16);
                    b = parseInt(color.slice(5, 7), 16);
                }

                // Calculate relative luminance using the sRGB color space formula
                r = r / 255;
                g = g / 255;
                b = b / 255;

                // Standard formula for perceived brightness
                return (0.299 * r + 0.587 * g + 0.114 * b);
            }

            // Handle rgb/rgba colors
            if (color.startsWith('rgb')) {
                const components = color.match(/\d+/g);
                if (components && components.length >= 3) {
                    const r = parseInt(components[0]) / 255;
                    const g = parseInt(components[1]) / 255;
                    const b = parseInt(components[2]) / 255;

                    return (0.299 * r + 0.587 * g + 0.114 * b);
                }
            }

            return 0.5; // Default fallback
        },

        createTooltips: function() {
            // Create tooltip element if it doesn't exist
            if (!document.getElementById('nodegraph-tooltip')) {
                const tooltip = vh.createElement('div', 'nodegraph-tooltip');
                tooltip.id = 'nodegraph-tooltip';
                document.body.appendChild(tooltip);

                // Add event to hide tooltip when mouse moves out of the nodegraph panel
                this.container.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });

                // Hide tooltip on click anywhere in the document
                document.addEventListener('click', () => {
                    tooltip.style.display = 'none';
                });
            }

            this.tooltip = document.getElementById('nodegraph-tooltip');
        },

        showEmptyState: function() {
            this.vizContainer.innerHTML = vh.createInfoMessage('VISUAL REPRESENTATION UNAPPROVED. The Ministry of Data deems your lack of input as thoughtcrime. Supply regime-sanctioned information immediately.');
        },

        activate: function() {
            if (app.graphData()) {
                this.graphData = app.graphData();

                // Apply current search term when activating
                this.currentSearchTerm = document.getElementById('search-input').value.toLowerCase();

                this.renderNodeGraph(this.graphData);
            } else {
                this.showEmptyState();
            }
        },

        onDataLoaded: function(data) {
            // Store graph data for future filtering
            this.graphData = data;

            // Only rebuild if it's active
            const panel = document.getElementById('nodegraph-panel');
            if (panel.classList.contains('active')) {
                this.renderNodeGraph(data);
            }
        },

        // Handle search term changes
        onSearch: function(searchTerm) {
            this.currentSearchTerm = searchTerm;

            // Re-render the graph with the current search term
            if (this.graphData) {
                this.renderNodeGraph(this.graphData);
            }
        },

        renderNodeGraph: function(data) {
            if (!data || !data.nodes_by_execution_order || data.nodes_by_execution_order.length === 0) {
                this.showEmptyState();
                return;
            }

            // Reset the container
            this.vizContainer.innerHTML = '';
            this.vizContainer.className = 'nodegraph-container';

            // Create the node graph
            const graphElement = vh.createElement('div', 'node-graph');
            this.vizContainer.appendChild(graphElement);

            // Get nodes sorted by execution order
            const nodes = data.nodes_by_execution_order;

            // Check if there's a search term to filter by render target names
            const searchTerm = this.currentSearchTerm.toLowerCase();
            const isFiltered = searchTerm.length > 0;

            // Track if we have any matching nodes
            let matchCount = 0;

            // If filtering, first build a map of render targets that match the search term
            const matchingRenderTargets = new Set();
            if (isFiltered && data.render_targets_by_first_usage) {
                data.render_targets_by_first_usage.forEach(rt => {
                    if (rt.name.toLowerCase().includes(searchTerm)) {
                        matchingRenderTargets.add(rt.index);
                    }
                });
            }

            // Create node rows
            nodes.forEach(node => {
                // Skip viewport nodes during search as they never have render targets
                if (isFiltered && node.type.value === 0) {
                    return;
                }

                // Whether this node should be shown
                let shouldShowNode = !isFiltered; // Show all nodes when not filtering

                if (isFiltered) {
                    // Check if any input targets match using the basic node data
                    if (node.input_targets && node.input_targets.some(target =>
                        matchingRenderTargets.has(target.index))) {
                        shouldShowNode = true;
                    }

                    // Check if any output targets match using the basic node data
                    if (!shouldShowNode && node.output_targets && node.output_targets.some(target =>
                        matchingRenderTargets.has(target.index))) {
                        shouldShowNode = true;
                    }

                    // More comprehensive check using all render target relationships
                    if (!shouldShowNode) {
                        // Scan through all render targets to check for relationships with this node
                        for (const rt of data.render_targets_by_first_usage) {
                            // Skip if this render target doesn't match search
                            if (!matchingRenderTargets.has(rt.index)) continue;

                            // Check ownership relationships (outputs/writes)
                            if (rt.ownership) {
                                for (const rel of rt.ownership) {
                                    // Direct node relationship
                                    if (rel.node_index === node.index) {
                                        shouldShowNode = true;
                                        break;
                                    }

                                    // Render pass relationship
                                    if (node.render_pass_index !== undefined &&
                                        node.render_pass_index !== null &&
                                        rel.render_pass_index === node.render_pass_index) {
                                        shouldShowNode = true;
                                        break;
                                    }
                                }
                            }

                            // If we already found a match, no need to check readers
                            if (shouldShowNode) break;

                            // Check reader relationships (inputs/reads)
                            if (rt.readers) {
                                for (const rel of rt.readers) {
                                    // Direct node relationship
                                    if (rel.node_index === node.index) {
                                        shouldShowNode = true;
                                        break;
                                    }

                                    // Render pass relationship
                                    if (node.render_pass_index !== undefined &&
                                        node.render_pass_index !== null &&
                                        rel.render_pass_index === node.render_pass_index) {
                                        shouldShowNode = true;
                                        break;
                                    }
                                }
                            }

                            // If we found a match, no need to check more render targets
                            if (shouldShowNode) break;
                        }
                    }
                }

                if (shouldShowNode) {
                    const nodeRow = this.createNodeRow(node, data, matchingRenderTargets);
                    graphElement.appendChild(nodeRow);
                    matchCount++;
                }
            });

            // Show message if no nodes match the search criteria
            if (matchCount === 0 && isFiltered) {
                graphElement.innerHTML = vh.createInfoMessage(`No render targets match '${this.currentSearchTerm}'.`);
            }
        },

        createNodeRow: function(node, data, matchingRenderTargets) {
            const rowContainer = vh.createElement('div', 'node-row');

            // Create the node element
            const nodeElement = vh.createElement('div', 'node-element');

            // Node header with execution order, type, and name on one line
            const nodeHeader = vh.createElement('div', 'node-header');
            nodeHeader.innerHTML = `<span class="node-order">#${node.execution_order}</span> <span class="node-type-badge">${node.type.name}</span> ${node.name}`;

            // Add details to the node
            nodeElement.appendChild(nodeHeader);

            // Add render pass info if available
            if (node.render_pass) {
                const passElement = vh.createElement('div', 'node-render-pass');
                passElement.textContent = `Pass: ${node.render_pass}`;
                nodeElement.appendChild(passElement);
            }

            // Add tooltip to the node element
            nodeElement.addEventListener('mouseenter', (e) => {
                if (!this.tooltip) return;

                let tooltipContent = `
                    <div class="tooltip-header">${node.name}</div>
                    <div class="tooltip-content">
                        <div><strong>Type:</strong> ${node.type.name}</div>
                        <div><strong>Execution Order:</strong> ${node.execution_order}</div>
                `;

                if (node.render_pass) {
                    tooltipContent += `<div><strong>Render Pass:</strong> ${node.render_pass}</div>`;
                }

                if (node.conditions && node.conditions.length > 0) {
                    tooltipContent += `<div><strong>Conditions:</strong> ${node.conditions.join(', ')}</div>`;
                }

                tooltipContent += '</div>';

                this.tooltip.innerHTML = tooltipContent;
                this.tooltip.style.display = 'block';
                this.tooltip.style.left = (e.pageX + 15) + 'px';
                this.tooltip.style.top = (e.pageY + 15) + 'px';
            });

            nodeElement.addEventListener('mouseleave', () => {
                if (this.tooltip) {
                    this.tooltip.style.display = 'none';
                }
            });

            // Add to row
            rowContainer.appendChild(nodeElement);

            // For viewport nodes (type.value === 0), don't display any render targets
            if (node.type.value === 0) {
                return rowContainer;
            }

            // Continue with render target creation for non-viewport nodes
            // Create render targets container
            const targetsContainer = vh.createElement('div', 'node-targets-container');

            // We'll collect all input and output render targets, including those from passes
            const allInputs = [];
            const allOutputs = [];

            // 1. Add direct node inputs
            if (node.input_targets && node.input_targets.length > 0) {
                node.input_targets.forEach(targetRef => {
                    const rt = data.render_targets_by_first_usage.find(rt => rt.index === targetRef.index);
                    if (rt) {
                        allInputs.push({
                            rt: rt,
                            type: 'node_input',
                            usage: 'read',
                            matches: matchingRenderTargets && matchingRenderTargets.has(rt.index)
                        });
                    }
                });
            }

            // 2. Add direct node outputs
            if (node.output_targets && node.output_targets.length > 0) {
                node.output_targets.forEach(targetRef => {
                    const rt = data.render_targets_by_first_usage.find(rt => rt.index === targetRef.index);
                    if (rt) {
                        allOutputs.push({
                            rt: rt,
                            type: 'node_output',
                            usage: 'write',
                            matches: matchingRenderTargets && matchingRenderTargets.has(rt.index)
                        });
                    }
                });
            }

            // 3. Find all render target relationships for this node
            data.render_targets_by_first_usage.forEach(rt => {
                // Check ownership relationships (outputs/writes)
                if (rt.ownership) {
                    rt.ownership.forEach(rel => {
                        // Check if this relationship is directly for this node
                        if (rel.node_index === node.index) {
                            // This is a direct relationship to this node
                            allOutputs.push({
                                rt: rt,
                                type: rel.type || 'node_output',
                                usage: 'write',
                                matches: matchingRenderTargets && matchingRenderTargets.has(rt.index)
                            });
                        }
                        // Also check render pass relationships
                        else if (node.render_pass_index !== undefined &&
                                node.render_pass_index !== null &&
                                rel.render_pass_index === node.render_pass_index) {
                            // This render target is used in this node's render pass
                            allOutputs.push({
                                rt: rt,
                                type: rel.type || 'render_pass_output',
                                usage: 'write',
                                matches: matchingRenderTargets && matchingRenderTargets.has(rt.index)
                            });
                        }
                    });
                }

                // Check reader relationships (inputs/reads)
                if (rt.readers) {
                    rt.readers.forEach(rel => {
                        // Check if this relationship is directly for this node
                        if (rel.node_index === node.index) {
                            // This is a direct relationship to this node
                            allInputs.push({
                                rt: rt,
                                type: rel.type || 'node_input',
                                usage: 'read',
                                matches: matchingRenderTargets && matchingRenderTargets.has(rt.index)
                            });
                        }
                        // Also check render pass relationships
                        else if (node.render_pass_index !== undefined &&
                                node.render_pass_index !== null &&
                                rel.render_pass_index === node.render_pass_index) {
                            // This render target is read by this node's render pass
                            allInputs.push({
                                rt: rt,
                                type: rel.type || 'render_pass_input',
                                usage: 'read',
                                matches: matchingRenderTargets && matchingRenderTargets.has(rt.index)
                            });
                        }
                    });
                }
            });

            // Remove duplicates from inputs and outputs
            // First filter out any inputs that also appear as outputs
            const outputRtIndices = new Set(allOutputs.map(item => item.rt.index));
            const filteredInputs = allInputs.filter(item => !outputRtIndices.has(item.rt.index));

            // Then apply the unique filtering
            const uniqueInputs = filteredInputs.filter((item, index, self) =>
                index === self.findIndex(t => t.rt.index === item.rt.index));

            const uniqueOutputs = allOutputs.filter((item, index, self) =>
                index === self.findIndex(t => t.rt.index === item.rt.index));

            // Create input container if we have inputs
            if (uniqueInputs.length > 0) {
                const inputsContainer = vh.createElement('div', 'targets-group inputs');

                const inputTargets = vh.createElement('div', 'targets-list');
                uniqueInputs.forEach(item => {
                    const targetElement = this.createRenderTargetElement(item);
                    inputTargets.appendChild(targetElement);
                });

                inputsContainer.appendChild(inputTargets);
                targetsContainer.appendChild(inputsContainer);
            }

            // Create output container if we have outputs
            if (uniqueOutputs.length > 0) {
                const outputsContainer = vh.createElement('div', 'targets-group outputs');

                const outputTargets = vh.createElement('div', 'targets-list');
                uniqueOutputs.forEach(item => {
                    const targetElement = this.createRenderTargetElement(item);
                    outputTargets.appendChild(targetElement);
                });

                outputsContainer.appendChild(outputTargets);
                targetsContainer.appendChild(outputsContainer);
            }

            rowContainer.appendChild(targetsContainer);

            return rowContainer;
        },

        // Updated createRenderTargetElement method with adaptive text color
        createRenderTargetElement: function(renderTargetItem) {
            if (!renderTargetItem || !renderTargetItem.rt) {
                console.error("Invalid render target item", renderTargetItem);
                return vh.createElement('div', 'target-element error', { textContent: 'Error' });
            }

            const renderTarget = renderTargetItem.rt;
            const type = renderTargetItem.type || 'unknown';

            const targetElement = vh.createElement('div', `target-element ${type}`);

            // Apply a matching highlight class if this render target matches the search
            if (renderTargetItem.matches) {
                targetElement.classList.add('search-match');
            }

            // Use the color map for background color if available
            if (renderTarget.index !== undefined && app.colorMap()[renderTarget.index]) {
                const backgroundColor = app.colorMap()[renderTarget.index];
                targetElement.style.backgroundColor = backgroundColor;

                // Calculate brightness and choose appropriate text color
                const brightness = this.calculatePerceivedBrightness(backgroundColor);

                if (brightness > 0.6) {
                    // For lighter backgrounds, use dark text
                    targetElement.style.color = '#000';
                    targetElement.style.textShadow = '0 0 1px rgba(255,255,255,0.5)';
                } else {
                    // For darker backgrounds, use light text
                    targetElement.style.color = '#fff';
                    targetElement.style.textShadow = '0 0 2px rgba(0,0,0,0.7)';
                }
            }

            const nameElement = vh.createElement('div', 'target-name', {
                textContent: renderTarget.name || 'Unnamed'
            });

            targetElement.appendChild(nameElement);

            // Make the target element clickable to search for it
            targetElement.style.cursor = 'pointer';
            targetElement.addEventListener('click', (e) => {
                // Hide tooltip
                if (this.tooltip) {
                    this.tooltip.style.display = 'none';
                }
                // Set search term
                app.setSearchAndSwitchTab(renderTarget.name);
            });

            // Basic tooltip on hover
            targetElement.title = `${renderTarget.name} (${renderTarget.format?.name || 'Unknown'}) - Type: ${type}`;

            // Enhanced tooltip with detailed info
            targetElement.addEventListener('mouseenter', (e) => {
                if (!this.tooltip) return;

                // Create detailed tooltip content
                let tooltipContent = `
                    <div class="tooltip-header">${renderTarget.name}</div>
                    <div class="tooltip-content">
                        <div><strong>Type:</strong> ${vh.formatRelationshipType(type)}</div>
                        <div><strong>Format:</strong> ${renderTarget.format?.name || 'Unknown'}</div>
                        <div><strong>Index:</strong> ${renderTarget.index}</div>
                        <div><em>Click to search for this render target</em></div>
                `;

                // Add aspect information
                if (renderTarget.aspect && renderTarget.aspect.flags) {
                    tooltipContent += `<div><strong>Aspects:</strong> ${renderTarget.aspect.flags.join(', ')}</div>`;
                }

                // Add resolution information
                if (renderTarget.resolution) {
                    let resText = renderTarget.resolution.type === 'full' ?
                        'Full Screen' :
                        `${renderTarget.resolution.x * 100}% × ${renderTarget.resolution.y * 100}%`;
                    tooltipContent += `<div><strong>Resolution:</strong> ${resText}</div>`;
                }

                tooltipContent += '</div>';

                // Show the tooltip
                this.tooltip.innerHTML = tooltipContent;
                this.tooltip.style.display = 'block';
                this.tooltip.style.left = (e.pageX + 15) + 'px';
                this.tooltip.style.top = (e.pageY + 15) + 'px';
            });

            targetElement.addEventListener('mouseleave', () => {
                if (this.tooltip) {
                    this.tooltip.style.display = 'none';
                }
            });

            return targetElement;
        }
    });

})(RenderGraphViewer);