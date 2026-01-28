// Enhanced file handling module for RenderGraphViewer
(function(app) {
    // Creates a reusable file handler
    const createFileHandler = function() {
        return {
            // Detect what type of JSON file this is based on content
            detectFileType: function(data) {
                // Check if it's raw render graph JSON (new format - direct from engine)
                // Must have both renderTargetDescriptions and nodeDataDescriptions
                if (data.renderTargetDescriptions && data.nodeDataDescriptions) {
                    return 'raw_rendergraph';
                }

                // Check if it's debug data (has issues array or is an array of issues)
                if ((data.issues && Array.isArray(data.issues)) ||
                    (Array.isArray(data) && data.length > 0 && data[0].severity)) {
                    return 'debug';
                }

                // Check if it's pre-processed graph data (legacy Python output)
                if (data.render_targets_by_first_usage ||
                    data.nodes_by_execution_order ||
                    data.summary) {
                    return 'graph';
                }

                // Unknown type
                return 'unknown';
            },

            // Process a single file
            processFile: function(file) {
                if (!file) return;

                // Only accept JSON files
                if (!file.name.toLowerCase().endsWith('.json') &&
                    file.type !== 'application/json') {
                    console.warn('Skipping non-JSON file:', file.name);
                    return;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        const fileType = this.detectFileType(data);

                        switch (fileType) {
                            case 'raw_rendergraph':
                                console.log('Raw render graph JSON detected');
                                this.processRawRenderGraph(data);
                                break;

                            case 'debug':
                                console.log('Debug JSON file detected');
                                if (app.tabModules && app.tabModules.debug &&
                                    typeof app.tabModules.debug.loadDebugData === 'function') {
                                    app.tabModules.debug.loadDebugData(data);

                                    // Switch to debug view for convenience
                                    app.switchTab('debug');
                                }
                                break;

                            case 'graph':
                                console.log('Pre-processed graph JSON file detected (legacy)');
                                app.loadGraphData(data);

                                // Switch to details view for convenience
                                app.switchTab('details');
                                break;

                            default:
                                console.warn('Unknown JSON file format');
                                alert('The uploaded file is not a recognized Render Graph or Debug JSON format.');
                        }
                    } catch (error) {
                        console.error('Error parsing JSON file:', error);
                        alert('Error parsing JSON file: ' + error.message);
                    }
                };

                reader.readAsText(file);
            },

            // Process multiple files
            processFiles: function(files) {
                if (!files || files.length === 0) return;

                // Process each file
                for (let i = 0; i < files.length; i++) {
                    this.processFile(files[i]);
                }
            },

            // Create a drag-drop area
            createDragDropArea: function(elementId, className) {
                const area = document.createElement('div');
                area.id = elementId;
                area.className = className || 'drag-drop-area';

                area.innerHTML = `
                    <div class="drag-drop-content">
                        <div class="drag-drop-icon">📄</div>
                    </div>
                `;

                // Reference to this for use in event handlers
                const self = this;

                // Add event listeners for drag and drop
                area.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.classList.add('dragover');
                });

                area.addEventListener('dragleave', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.classList.remove('dragover');
                });

                area.addEventListener('drop', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.classList.remove('dragover');

                    if (e.dataTransfer.files.length) {
                        self.processFiles(e.dataTransfer.files);
                    }
                });

                // Also make it clickable to open file dialog
                area.addEventListener('click', function() {
                    // Create temporary file input
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = '.json';
                    fileInput.multiple = true;
                    fileInput.style.display = 'none';

                    // Add to DOM temporarily
                    document.body.appendChild(fileInput);

                    // Handle file selection
                    fileInput.addEventListener('change', function(e) {
                        if (this.files.length) {
                            self.processFiles(this.files);
                        }
                        // Clean up
                        document.body.removeChild(this);
                    });

                    // Open file dialog
                    fileInput.click();
                });

                return area;
            },

            // Process raw render graph JSON through the analysis pipeline
            processRawRenderGraph: function(data) {
                const startTime = performance.now();

                // Validate the raw data
                const validation = window.RenderGraphParser.isValidRawRenderGraph(data);
                if (!validation.valid) {
                    console.error('Invalid raw render graph:', validation.error);
                    alert('Invalid render graph JSON: ' + validation.error);
                    return;
                }

                // Parse raw JSON into typed objects
                const parseStart = performance.now();
                const parsed = window.RenderGraphParser.parseRawRenderGraph(data);
                const parseTime = performance.now() - parseStart;

                const rtCount = Object.keys(parsed.renderTargets).length;
                const nodeCount = Object.keys(parsed.nodes).length;
                const passCount = Object.keys(parsed.renderPasses).length;
                console.log(`Parsed: ${rtCount} RTs, ${nodeCount} nodes, ${passCount} passes (${parseTime.toFixed(1)}ms)`);

                // Run full analysis using the analyzer module
                // This includes:
                // - Execution order compilation from graphOrder
                // - Shader binding decoding (0x10000/0x20000/0x30000 ranges)
                // - Priority-based relationship resolution
                // - RT lifetime calculation
                const analyzeStart = performance.now();
                const analyzed = window.RenderGraphAnalyzer.analyze(
                    parsed.renderTargets,
                    parsed.nodes,
                    parsed.renderPasses,
                    parsed.graphOrder
                );
                const analyzeTime = performance.now() - analyzeStart;
                console.log(`Analysis complete (${analyzeTime.toFixed(1)}ms)`);

                // Convert to view format expected by timeline.js, nodegraph.js, etc.
                const viewStart = performance.now();
                const viewData = window.RenderGraphAnalyzer.toViewFormat(
                    analyzed.renderTargets,
                    analyzed.nodes,
                    analyzed.renderPasses
                );
                const viewTime = performance.now() - viewStart;
                console.log(`View format conversion complete (${viewTime.toFixed(1)}ms)`);

                // Run validation checks using the debugger module
                let debugData = null;
                if (window.RenderGraphDebugger) {
                    const debugStart = performance.now();
                    const issues = window.RenderGraphDebugger.runAllChecks(
                        analyzed.renderTargets,
                        analyzed.nodes,
                        analyzed.renderPasses,
                        data  // Pass raw data for shader binding checks
                    );
                    debugData = window.RenderGraphDebugger.formatIssuesForView(issues);
                    const debugTime = performance.now() - debugStart;
                    console.log(`Validation complete: ${debugData.errors} errors, ${debugData.warnings} warnings, ${debugData.infos} infos (${debugTime.toFixed(1)}ms)`);
                }

                // Store both raw and analyzed data for potential use
                app.rawData = data;
                app.rawParsedData = parsed;
                app.analyzedData = analyzed;

                // Load into the viewer
                app.loadGraphData(viewData);

                // Load debug data into debug view if available
                if (debugData && app.tabModules && app.tabModules.debug &&
                    typeof app.tabModules.debug.loadDebugData === 'function') {
                    app.tabModules.debug.loadDebugData(debugData);
                }

                const totalTime = performance.now() - startTime;
                console.log(`Total processing time: ${totalTime.toFixed(1)}ms`);

                // Switch to details view
                app.switchTab('details');
            }
        };
    };

    // Add to app
    app.FileHandler = createFileHandler();

})(RenderGraphViewer);