// Render target details functionality
(function(app) {
    // Get the ViewHelper
    const vh = app.ViewHelper;

    // Module API
    const detailsModule = vh.createViewModule('details', {
        init: function() {
            this.container = app.elements.renderTargetDetails;
            this.clear();
        },

        activate: function() {
            // Get current search term
            const searchInput = document.getElementById('search-input');
            const searchTerm = searchInput.value.trim();

            // Check if we have a non-empty search term
            if (searchTerm && app.graphData()) {
                // Try to find a matching render target
                const renderTargets = app.graphData().render_targets_by_first_usage;

                // First look for exact matches
                let matchingTarget = renderTargets.find(rt =>
                    rt.name.toLowerCase() === searchTerm.toLowerCase()
                );

                // If no exact match, look for partial matches
                if (!matchingTarget) {
                    matchingTarget = renderTargets.find(rt =>
                        rt.name.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                }

                // If we found a match, select it
                if (matchingTarget) {
                    this.selectRenderTargetByName(matchingTarget.name);
                    return;
                }
            }

            // If no search term or no match, check if we need to refresh a selected render target
            const activeItem = document.querySelector('.render-target-item.active');
            if (activeItem && app.graphData()) {
                const rtIndex = parseInt(activeItem.dataset.index);
                const renderTarget = app.graphData().render_targets_by_first_usage.find(rt => rt.index === rtIndex);
                if (renderTarget) {
                    this.showRenderTarget(renderTarget);
                }
            }
        },

        // Method to select a render target by name
        selectRenderTargetByName: function(name) {
            if (!app.graphData()) return;

            const renderTargets = app.graphData().render_targets_by_first_usage;
            const renderTarget = renderTargets.find(rt => rt.name === name);

            if (renderTarget) {
                // Update the render target list UI
                const items = document.querySelectorAll('.render-target-item');

                items.forEach(item => {
                    if (parseInt(item.dataset.index) === renderTarget.index) {
                        item.classList.add('active');

                        // Scroll this item into view if needed
                        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } else {
                        item.classList.remove('active');
                    }
                });

                // Show the details
                this.showRenderTarget(renderTarget);
            }
        },

        showRenderTarget: function(renderTarget) {
            this.container.innerHTML = '';
            this.renderRenderTargetDetails(renderTarget);
        },

        clear: function() {
            this.container.innerHTML = vh.createInfoMessage('Choose a render target from the approved list. Your compliance will be noted in your permanent record.');
        },

        renderRenderTargetDetails: function(renderTarget) {
            // Basic information section
            const basicInfoSection = vh.createSection(renderTarget.name);

            // Create property box for basic info
            const properties = {
                'Index': renderTarget.index,
                'Format': renderTarget.format.name,
                'Resolution': vh.formatResolution(renderTarget.resolution),
                'Mip Levels': renderTarget.mip_levels,
                'Sample Count': `${renderTarget.sample_count}x`,
                'Memory Type': renderTarget.memory_type
            };

            basicInfoSection.appendChild(vh.createPropertyBox(properties));
            this.container.appendChild(basicInfoSection);

            // Lifetime section
            const lifetimeSection = vh.createSection('Lifetime');
            lifetimeSection.appendChild(this.renderLifetimeInfo(renderTarget.lifetime));
            this.container.appendChild(lifetimeSection);

            // Aspects & Usage section
            const aspectsSection = vh.createSection('Aspects & Usage');

            // Add aspect flags
            const aspectHtml = `
                <h3>Aspect Flags</h3>
                ${vh.createBadgeContainer(renderTarget.aspect.flags, flag => {
                    let className = '';
                    if (flag === 'COLOR') className = 'color-aspect';
                    if (flag === 'DEPTH') className = 'depth-aspect';
                    if (flag === 'STENCIL') className = 'stencil-aspect';
                    return className;
                })}
            `;
            aspectsSection.innerHTML += aspectHtml;

            // Add usage flags
            const usageHtml = `
                <h3>Usage Flags</h3>
                ${vh.createBadgeContainer(renderTarget.usage.flags)}
            `;
            aspectsSection.innerHTML += usageHtml;

            // Add conditions if any
            if (renderTarget.conditions.length > 0) {
                const conditionsHtml = `
                    <h3>Conditions</h3>
                    ${vh.createBadgeContainer(renderTarget.conditions)}
                `;
                aspectsSection.innerHTML += conditionsHtml;
            }

            this.container.appendChild(aspectsSection);

            // Relationships section
            const relationshipsSection = vh.createSection('Usage & Relationships');
            relationshipsSection.innerHTML += this.renderRelationshipTable(renderTarget);
            this.container.appendChild(relationshipsSection);
        },

        renderLifetimeInfo: function(lifetime) {
            if (!lifetime || Object.keys(lifetime).length === 0) {
                return vh.createElement('p', '', { textContent: 'Unknown lifetime' });
            }

            const propertyBox = vh.createElement('div', 'property-box');

            if (lifetime.first_used) {
                const firstNode = lifetime.first_used;
                const firstItem = vh.createElement('div', 'property-item');

                const firstLabel = vh.createElement('span', 'property-label', {
                    textContent: 'First Used'
                });

                const firstValue = vh.createElement('span', 'property-value', {
                    textContent: `Node ${firstNode.node_index}: ${firstNode.name} (Order: ${firstNode.execution_order})`
                });

                firstItem.appendChild(firstLabel);
                firstItem.appendChild(firstValue);

                // Add usage types if any
                if (firstNode.usage_types && firstNode.usage_types.length) {
                    const usageTypes = vh.createElement('div', 'usage-types');
                    usageTypes.innerHTML = vh.createUsageTypesHTML(firstNode.usage_types);
                    firstItem.appendChild(usageTypes);
                }

                propertyBox.appendChild(firstItem);
            }

            if (lifetime.last_used) {
                const lastNode = lifetime.last_used;
                const lastItem = vh.createElement('div', 'property-item');

                const lastLabel = vh.createElement('span', 'property-label', {
                    textContent: 'Last Used'
                });

                const lastValue = vh.createElement('span', 'property-value', {
                    textContent: `Node ${lastNode.node_index}: ${lastNode.name} (Order: ${lastNode.execution_order})`
                });

                lastItem.appendChild(lastLabel);
                lastItem.appendChild(lastValue);

                // Add usage types if any
                if (lastNode.usage_types && lastNode.usage_types.length) {
                    const usageTypes = vh.createElement('div', 'usage-types');
                    usageTypes.innerHTML = vh.createUsageTypesHTML(lastNode.usage_types);
                    lastItem.appendChild(usageTypes);
                }

                propertyBox.appendChild(lastItem);
            }

            return propertyBox;
        },

        renderRelationshipTable: function(renderTarget) {
            const owners = renderTarget.ownership || [];
            const readers = renderTarget.readers || [];

            if (owners.length === 0 && readers.length === 0) {
                return '<p>No relationships found</p>';
            }

            // Combine and mark relationships
            const relationships = [
                ...owners.map(item => ({ ...item, relation: item.type || 'write' })),
                ...readers.map(item => ({ ...item, relation: 'node_input' }))
            ];

            // Sort by execution order
            relationships.sort((a, b) => a.execution_order - b.execution_order);

            // Use the table helper
            return vh.createTable(relationships, [
                {
                    header: 'Relation',
                    accessor: (item) => {
                        const badgeClass = item.relation;
                        const relationName = vh.formatRelationshipType(item.relation);
                        return vh.createBadge(relationName, `relation-badge ${badgeClass}`);
                    }
                },
                {
                    header: 'Node',
                    accessor: (item) => {
                        const passInfo = item.pass_name ? ` (${item.pass_name})` : '';
                        return `${item.name} (${item.node_index})${passInfo}`;
                    }
                },
                {
                    header: 'Execution Order',
                    accessor: (item) => item.execution_order
                },
                {
                    header: 'Conditions',
                    accessor: (item) => {
                        if (item.conditions && item.conditions.length) {
                            return item.conditions.map(c => vh.createBadge(c)).join('');
                        }
                        return 'None';
                    }
                }
            ]);
        }
    });

})(RenderGraphViewer);