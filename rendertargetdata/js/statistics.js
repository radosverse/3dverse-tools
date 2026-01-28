// Statistics View - Example of creating a new view using ViewHelper
(function(app) {
    // Get the ViewHelper
    const vh = app.ViewHelper;

    // Define the view module
    const statisticsModule = vh.createViewModule('statistics', {
        init: function() {
            // Initialize the view
            this.container = document.getElementById('statistics-panel');
            this.renderInitialState();
        },

        activate: function() {
            // Check if we have data to display
            if (app.graphData()) {
                this.renderStatistics(app.graphData());
            }
        },

        onDataLoaded: function(data) {
            // Update view if we're the active tab
            const statisticsPanel = document.getElementById('statistics-panel');
            if (statisticsPanel.classList.contains('active')) {
                this.renderStatistics(data);
            }
        },

        renderInitialState: function() {
            // Display a message when no data is loaded
            if (!this.container) return;

            this.container.innerHTML = vh.createInfoMessage(
                'STATISTICAL RECORDS FALSIFIED. The past was altered. The past never had been altered. Submit approved information to Room 101 for remedial instruction.'
            );

        },

        renderStatistics: function(data) {
            if (!this.container || !data) return;

            // Clear the container
            this.container.innerHTML = '';

            // Add graph summary section
            const summarySection = this.createSummarySection(data.summary);
            this.container.appendChild(summarySection);

            // Add resource usage section
            const resourceSection = this.createResourceSection(data);
            this.container.appendChild(resourceSection);

            // Add render passes section
            const passesSection = this.createRenderPassesSection(data.render_passes);
            this.container.appendChild(passesSection);
        },

        createSummarySection: function(summary) {
            // Create a summary of the render graph
            const properties = {
                'Graph Name': summary.graph_name,
                'Total Render Targets': summary.total_render_targets,
                'Total Nodes': summary.total_nodes,
                'Total Render Passes': summary.total_render_passes
            };

            // Create section with title and property box
            const section = vh.createSection('Graph Summary');
            section.appendChild(vh.createPropertyBox(properties));

            return section;
        },

        createResourceSection: function(data) {
            // Create statistics about render targets
            const section = vh.createSection('Resource Usage');

            // Count resource types
            const renderTargets = data.render_targets_by_first_usage || [];
            const formatCounts = {};
            const aspectCounts = {
                'COLOR': 0,
                'DEPTH': 0,
                'STENCIL': 0
            };

            renderTargets.forEach(rt => {
                // Count by format
                const formatName = rt.format.name;
                formatCounts[formatName] = (formatCounts[formatName] || 0) + 1;

                // Count by aspect
                rt.aspect.flags.forEach(flag => {
                    if (aspectCounts[flag] !== undefined) {
                        aspectCounts[flag]++;
                    }
                });
            });

            // Create format distribution
            const formatItems = Object.keys(formatCounts).map(format => ({
                name: format,
                count: formatCounts[format]
            }));

            const formatDiv = vh.createElement('div');
            formatDiv.innerHTML = '<h3>Format Distribution</h3>' +
                vh.createTable(formatItems, [
                    { header: 'Format', accessor: row => row.name },
                    { header: 'Count', accessor: row => row.count }
                ]);
            section.appendChild(formatDiv);

            // Create aspect distribution
            const aspectItems = Object.keys(aspectCounts)
                .filter(aspect => aspectCounts[aspect] > 0)
                .map(aspect => ({
                    name: aspect,
                    count: aspectCounts[aspect]
                }));

            const aspectDiv = vh.createElement('div');
            aspectDiv.innerHTML = '<h3>Aspect Distribution</h3>' +
                vh.createTable(aspectItems, [
                    { header: 'Aspect', accessor: row => {
                        let className = '';
                        if (row.name === 'COLOR') className = 'color-aspect';
                        if (row.name === 'DEPTH') className = 'depth-aspect';
                        if (row.name === 'STENCIL') className = 'stencil-aspect';
                        return vh.createBadge(row.name, className);
                    }},
                    { header: 'Count', accessor: row => row.count }
                ]);
            section.appendChild(aspectDiv);

            return section;
        },

        createRenderPassesSection: function(passes) {
            // Create statistics about render passes
            const section = vh.createSection('Render Passes');

            if (!passes || passes.length === 0) {
                section.innerHTML += vh.createInfoMessage('No render passes available.');
                return section;
            }

            // Create a table of render passes
            section.innerHTML += vh.createTable(passes, [
                { header: 'Name', accessor: row => row.name },
                { header: 'Node Count', accessor: row => row.node_count },
                { header: 'Color Attachments', accessor: row => row.color_attachment_count },
                { header: 'Resolve Attachments', accessor: row => row.resolve_attachment_count },
                { header: 'Has Depth', accessor: row => row.has_depth_attachment ? 'Yes' : 'No' }
            ]);

            return section;
        }
    });

})(RenderGraphViewer);