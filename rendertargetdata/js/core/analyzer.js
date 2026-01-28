// Analyzer module - computes execution order, relationships, and lifetimes
// Port of Python analyzer.py to JavaScript

(function() {
    const { BINDING_RANGES } = window.RenderGraphConstants;

    // Analysis cache for performance with large graphs
    const analysisCache = new WeakMap();

    // Priority system for relationship resolution (higher = more important)
    const PRIORITIES = {
        render_pass_color: 50,
        render_pass_depth: 50,
        render_pass_resolve: 50,
        msaa_resolve_source: 45,
        msaa_resolve_target: 45,
        node_input: 40,
        node_output: 30,
        shader_binding_read: 20,
        shader_binding_write: 10
    };

    /**
     * Main analysis function - runs the complete analysis pipeline
     * @param {Object} renderTargets - Parsed render targets
     * @param {Object} nodes - Parsed nodes
     * @param {Object} renderPasses - Parsed render passes
     * @param {Array} graphOrder - Execution order tuples
     * @param {Object} options - Optional settings { useCache: boolean }
     * @returns {Object} Analyzed data { renderTargets, nodes, renderPasses }
     */
    function analyze(renderTargets, nodes, renderPasses, graphOrder, options = {}) {
        const useCache = options.useCache !== false;
        const cacheKey = { renderTargets, nodes, renderPasses };

        // Check cache for previously analyzed data
        if (useCache && analysisCache.has(cacheKey)) {
            return analysisCache.get(cacheKey);
        }

        // 1. Compile execution path from graphOrder
        compileExecutionPath(nodes, renderPasses, graphOrder);

        // 2. Analyze RT usage and relationships with priority resolution
        analyzeRenderTargetUsage(renderTargets, nodes, renderPasses);

        // 3. Update RT lifetimes based on execution order
        updateRenderTargetLifetimes(renderTargets, nodes);

        const result = { renderTargets, nodes, renderPasses };

        // Cache the result
        if (useCache) {
            analysisCache.set(cacheKey, result);
        }

        return result;
    }

    /**
     * Compile execution path from graphOrder
     * Assigns execution_order to each node based on the graph order
     */
    function compileExecutionPath(nodes, renderPasses, graphOrder) {
        const executionPath = [];
        const nodesInPath = new Set();

        let i = 0;
        while (i < graphOrder.length) {
            const entry = graphOrder[i];
            if (!Array.isArray(entry) || entry.length < 2) {
                i++;
                continue;
            }

            const [passIdx, nodeIdx] = entry;

            if (passIdx === -1) {
                // Standalone node
                if (nodeIdx in nodes && !nodesInPath.has(nodeIdx)) {
                    executionPath.push(nodeIdx);
                    nodesInPath.add(nodeIdx);
                }
                i++;
            } else {
                // Render pass - collect all consecutive nodes for this pass
                const currentPassIdx = passIdx;
                while (i < graphOrder.length &&
                       Array.isArray(graphOrder[i]) &&
                       graphOrder[i][0] === currentPassIdx) {
                    const nIdx = graphOrder[i][1];
                    if (nIdx in nodes && !nodesInPath.has(nIdx)) {
                        executionPath.push(nIdx);
                        nodesInPath.add(nIdx);
                    }
                    i++;
                }

                // Add any remaining nodes from the render pass definition
                // that weren't explicitly in graphOrder
                if (currentPassIdx in renderPasses) {
                    const rp = renderPasses[currentPassIdx];
                    for (const rpNodeIdx of rp.nodeIndices) {
                        if (rpNodeIdx in nodes && !nodesInPath.has(rpNodeIdx)) {
                            executionPath.push(rpNodeIdx);
                            nodesInPath.add(rpNodeIdx);
                        }
                    }
                }
            }
        }

        // Add any remaining nodes not in graphOrder
        for (const nodeIdx of Object.keys(nodes)) {
            const idx = parseInt(nodeIdx);
            if (!nodesInPath.has(idx)) {
                executionPath.push(idx);
            }
        }

        // Assign execution order to all nodes
        executionPath.forEach((nodeIdx, order) => {
            if (nodeIdx in nodes) {
                nodes[nodeIdx].executionOrder = order;
            }
        });

        return executionPath;
    }

    /**
     * Decode shader bindings from dataJson
     * Address encoding:
     * - 0x10000 + RT_index = Read-only binding
     * - 0x20000 + RT_index = Write-only binding
     * - 0x30000 + RT_index = Read-write binding
     */
    function decodeShaderBindings(dataJson, rtCount) {
        const bindings = [];

        for (const [key, value] of Object.entries(dataJson)) {
            if (typeof value !== 'number') continue;

            let type = null;
            let rtIndex = null;

            if (value >= BINDING_RANGES.READ.start && value < BINDING_RANGES.READ.end) {
                type = 'input';
                rtIndex = value - BINDING_RANGES.READ.start;
            } else if (value >= BINDING_RANGES.WRITE.start && value < BINDING_RANGES.WRITE.end) {
                type = 'output';
                rtIndex = value - BINDING_RANGES.WRITE.start;
            } else if (value >= BINDING_RANGES.READWRITE.start && value < BINDING_RANGES.READWRITE.end) {
                type = 'input_output';
                rtIndex = value - BINDING_RANGES.READWRITE.start;
            }

            if (type && rtIndex !== null && rtIndex >= 0 && rtIndex < rtCount) {
                bindings.push({
                    key: key,
                    type: type,
                    rtIndex: rtIndex,
                    encodedAddress: value
                });
            }
        }

        return bindings;
    }

    /**
     * Analyze render target usage and relationships with priority-based resolution
     */
    function analyzeRenderTargetUsage(renderTargets, nodes, renderPasses) {
        const rtCount = Object.keys(renderTargets).length;

        // Build potential relationships map: rt_idx -> node_idx -> [relationship_info]
        const potentialRelationships = {};
        for (const rtIdx of Object.keys(renderTargets)) {
            potentialRelationships[rtIdx] = {};
        }

        // 1. Process explicit node inputs/outputs
        for (const [nodeIdx, node] of Object.entries(nodes)) {
            const nIdx = parseInt(nodeIdx);

            // Node inputs (reads)
            for (const rtIdx of node.inputs) {
                if (rtIdx >= 0 && rtIdx in renderTargets) {
                    if (!potentialRelationships[rtIdx][nIdx]) {
                        potentialRelationships[rtIdx][nIdx] = [];
                    }
                    potentialRelationships[rtIdx][nIdx].push({
                        type: 'node_input',
                        priority: PRIORITIES.node_input,
                        relationship: 'read',
                        conditions: node.conditions
                    });
                }
            }

            // Node outputs (writes)
            for (const rtIdx of node.outputs) {
                if (rtIdx >= 0 && rtIdx in renderTargets) {
                    if (!potentialRelationships[rtIdx][nIdx]) {
                        potentialRelationships[rtIdx][nIdx] = [];
                    }
                    potentialRelationships[rtIdx][nIdx].push({
                        type: 'node_output',
                        priority: PRIORITIES.node_output,
                        relationship: 'write',
                        conditions: node.conditions
                    });
                }
            }

            // 2. Process shader bindings from dataJson
            const bindings = decodeShaderBindings(node.dataJson, rtCount);
            for (const binding of bindings) {
                const rtIdx = binding.rtIndex;
                if (rtIdx in renderTargets) {
                    if (!potentialRelationships[rtIdx][nIdx]) {
                        potentialRelationships[rtIdx][nIdx] = [];
                    }

                    const isOutput = binding.type === 'output' || binding.type === 'input_output';
                    potentialRelationships[rtIdx][nIdx].push({
                        type: 'shader_binding',
                        bindingType: binding.type,
                        priority: isOutput ? PRIORITIES.shader_binding_write : PRIORITIES.shader_binding_read,
                        relationship: isOutput ? 'write' : 'read',
                        key: binding.key,
                        encodedAddress: binding.encodedAddress,
                        conditions: node.conditions
                    });
                }
            }
        }

        // 3. Process render pass attachments
        for (const [rpIdx, rp] of Object.entries(renderPasses)) {
            const passIdx = parseInt(rpIdx);

            // Color attachments
            for (const rtIdx of rp.colorAttachmentIndices) {
                if (rtIdx in renderTargets) {
                    for (const nodeIdx of rp.nodeIndices) {
                        if (nodeIdx in nodes) {
                            if (!potentialRelationships[rtIdx][nodeIdx]) {
                                potentialRelationships[rtIdx][nodeIdx] = [];
                            }
                            potentialRelationships[rtIdx][nodeIdx].push({
                                type: 'color_attachment',
                                priority: PRIORITIES.render_pass_color,
                                relationship: 'write',
                                pass_name: rp.name,
                                pass_index: passIdx,
                                conditions: rp.conditions
                            });
                        }
                    }
                }
            }

            // Depth attachment
            if (rp.depthAttachmentIndex !== null && rp.depthAttachmentIndex in renderTargets) {
                const rtIdx = rp.depthAttachmentIndex;
                for (const nodeIdx of rp.nodeIndices) {
                    if (nodeIdx in nodes) {
                        if (!potentialRelationships[rtIdx][nodeIdx]) {
                            potentialRelationships[rtIdx][nodeIdx] = [];
                        }
                        potentialRelationships[rtIdx][nodeIdx].push({
                            type: 'depth_attachment',
                            priority: PRIORITIES.render_pass_depth,
                            relationship: 'write',
                            pass_name: rp.name,
                            pass_index: passIdx,
                            conditions: rp.conditions
                        });
                    }
                }
            }

            // Resolve attachments
            for (const rtIdx of rp.resolveAttachmentIndices) {
                if (rtIdx in renderTargets) {
                    for (const nodeIdx of rp.nodeIndices) {
                        if (nodeIdx in nodes) {
                            if (!potentialRelationships[rtIdx][nodeIdx]) {
                                potentialRelationships[rtIdx][nodeIdx] = [];
                            }
                            potentialRelationships[rtIdx][nodeIdx].push({
                                type: 'resolve_attachment',
                                priority: PRIORITIES.render_pass_resolve,
                                relationship: 'write',
                                pass_name: rp.name,
                                pass_index: passIdx,
                                conditions: rp.conditions
                            });
                        }
                    }
                }
            }

            // MSAA resolve relationships
            if (rp.colorAttachmentIndices.length > 0 && rp.resolveAttachmentIndices.length > 0) {
                for (let i = 0; i < rp.colorAttachmentIndices.length; i++) {
                    if (i < rp.resolveAttachmentIndices.length) {
                        const colorIdx = rp.colorAttachmentIndices[i];
                        const resolveIdx = rp.resolveAttachmentIndices[i];

                        if (colorIdx in renderTargets && resolveIdx in renderTargets) {
                            for (const nodeIdx of rp.nodeIndices) {
                                if (nodeIdx in nodes) {
                                    // Color attachment is read for resolve
                                    if (!potentialRelationships[colorIdx][nodeIdx]) {
                                        potentialRelationships[colorIdx][nodeIdx] = [];
                                    }
                                    potentialRelationships[colorIdx][nodeIdx].push({
                                        type: 'msaa_resolve_source',
                                        priority: PRIORITIES.msaa_resolve_source,
                                        relationship: 'read',
                                        target_rt_index: resolveIdx,
                                        pass_name: rp.name,
                                        pass_index: passIdx,
                                        conditions: rp.conditions
                                    });

                                    // Resolve target is written
                                    if (!potentialRelationships[resolveIdx][nodeIdx]) {
                                        potentialRelationships[resolveIdx][nodeIdx] = [];
                                    }
                                    potentialRelationships[resolveIdx][nodeIdx].push({
                                        type: 'msaa_resolve_target',
                                        priority: PRIORITIES.msaa_resolve_target,
                                        relationship: 'write',
                                        source_rt_index: colorIdx,
                                        pass_name: rp.name,
                                        pass_index: passIdx,
                                        conditions: rp.conditions
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. Apply priority rules to determine final relationships
        for (const [rtIdx, rt] of Object.entries(renderTargets)) {
            // Clear/reset analysis fields
            rt.inputToNodes = [];
            rt.outputFromNodes = [];
            rt.nodeUsageTypes = {};
            rt.usedAsColorAttachment = [];
            rt.usedAsDepthAttachment = [];
            rt.usedAsResolveAttachment = [];
            rt.conditions = new Set();

            // Track which passes we've added attachment info for
            const addedColorAttachments = new Set();
            const addedDepthAttachments = new Set();
            const addedResolveAttachments = new Set();

            // Process each node's relationship to this render target
            for (const [nodeIdx, relationships] of Object.entries(potentialRelationships[rtIdx])) {
                if (!relationships || relationships.length === 0) continue;

                const nIdx = parseInt(nodeIdx);

                // Determine if this is a write relationship
                const isWrite = relationships.some(rel =>
                    ['color_attachment', 'depth_attachment', 'resolve_attachment',
                     'msaa_resolve_target', 'node_output'].includes(rel.type) ||
                    (rel.type === 'shader_binding' &&
                     (rel.bindingType === 'output' || rel.bindingType === 'input_output'))
                );

                // Store based on write/read classification
                if (isWrite) {
                    if (!rt.outputFromNodes.includes(nIdx)) {
                        rt.outputFromNodes.push(nIdx);
                    }
                } else {
                    if (!rt.inputToNodes.includes(nIdx)) {
                        rt.inputToNodes.push(nIdx);
                    }
                }

                // Store ALL usage types for this node
                rt.nodeUsageTypes[nIdx] = relationships;

                // Collect conditions from all relationships
                for (const rel of relationships) {
                    if (rel.conditions && Array.isArray(rel.conditions)) {
                        rel.conditions.forEach(cond => rt.conditions.add(cond));
                    }
                }

                // Build attachment tracking for render pass relationships
                for (const rel of relationships) {
                    if (rel.pass_index !== undefined && rel.pass_name !== undefined) {
                        const attachmentInfo = {
                            pass_name: rel.pass_name,
                            pass_index: rel.pass_index,
                            node_indices: renderPasses[rel.pass_index]?.nodeIndices || [],
                            conditions: rel.conditions || []
                        };

                        if (rel.type === 'color_attachment' && !addedColorAttachments.has(rel.pass_index)) {
                            rt.usedAsColorAttachment.push(attachmentInfo);
                            addedColorAttachments.add(rel.pass_index);
                        } else if (rel.type === 'depth_attachment' && !addedDepthAttachments.has(rel.pass_index)) {
                            rt.usedAsDepthAttachment.push(attachmentInfo);
                            addedDepthAttachments.add(rel.pass_index);
                        } else if (rel.type === 'resolve_attachment' && !addedResolveAttachments.has(rel.pass_index)) {
                            rt.usedAsResolveAttachment.push(attachmentInfo);
                            addedResolveAttachments.add(rel.pass_index);
                        }
                    }
                }
            }
        }
    }

    /**
     * Update render target lifetimes based on node execution order
     */
    function updateRenderTargetLifetimes(renderTargets, nodes) {
        for (const rt of Object.values(renderTargets)) {
            // Get all nodes where this RT is used
            const usageNodes = Object.keys(rt.nodeUsageTypes)
                .map(Number)
                .filter(n => n in nodes && nodes[n].executionOrder >= 0);

            if (usageNodes.length > 0) {
                // Find first and last usage based on execution order
                rt.firstUsedAtNode = usageNodes.reduce((min, n) =>
                    nodes[n].executionOrder < nodes[min].executionOrder ? n : min
                );
                rt.lastUsedAtNode = usageNodes.reduce((max, n) =>
                    nodes[n].executionOrder > nodes[max].executionOrder ? n : max
                );
            } else {
                rt.firstUsedAtNode = null;
                rt.lastUsedAtNode = null;
            }
        }
    }

    /**
     * Transform analyzed data to view format expected by timeline.js, nodegraph.js, etc.
     */
    function toViewFormat(renderTargets, nodes, renderPasses) {
        // Sort nodes by execution order
        const nodesByExecution = Object.values(nodes)
            .filter(n => n.executionOrder >= 0)
            .sort((a, b) => a.executionOrder - b.executionOrder)
            .map(n => nodeToView(n, renderTargets));

        // Also add nodes without execution order at the end
        const unorderedNodes = Object.values(nodes)
            .filter(n => n.executionOrder < 0)
            .map(n => nodeToView(n, renderTargets));

        // Sort render targets by first usage
        const rtsByFirstUsage = Object.values(renderTargets)
            .filter(rt => rt.firstUsedAtNode !== null)
            .sort((a, b) => {
                const aOrder = nodes[a.firstUsedAtNode]?.executionOrder ?? Infinity;
                const bOrder = nodes[b.firstUsedAtNode]?.executionOrder ?? Infinity;
                return aOrder - bOrder;
            })
            .map(rt => rtToView(rt, nodes, renderPasses));

        // Append unused RTs at the end
        const unusedRts = Object.values(renderTargets)
            .filter(rt => rt.firstUsedAtNode === null)
            .map(rt => rtToView(rt, nodes, renderPasses));

        return {
            summary: {
                total_render_targets: Object.keys(renderTargets).length,
                total_nodes: Object.keys(nodes).length,
                total_render_passes: Object.keys(renderPasses).length
            },
            nodes_by_execution_order: [...nodesByExecution, ...unorderedNodes],
            render_targets_by_first_usage: [...rtsByFirstUsage, ...unusedRts],
            render_passes: Object.values(renderPasses).map(rp => rpToView(rp))
        };
    }

    /**
     * Convert a Node to view format
     */
    function nodeToView(node, renderTargets) {
        const inputTargets = [];
        for (const rtIdx of node.inputs) {
            if (rtIdx >= 0 && rtIdx in renderTargets) {
                inputTargets.push({
                    index: rtIdx,
                    name: renderTargets[rtIdx].name
                });
            }
        }

        const outputTargets = [];
        for (const rtIdx of node.outputs) {
            if (rtIdx >= 0 && rtIdx in renderTargets) {
                outputTargets.push({
                    index: rtIdx,
                    name: renderTargets[rtIdx].name
                });
            }
        }

        return {
            index: node.index,
            name: node.name,
            type: {
                value: node.type,
                name: node.getTypeName()
            },
            execution_order: node.executionOrder,
            conditions: node.conditions,
            render_pass: node.renderPass,
            render_pass_index: node.renderPassIndex,
            input_targets: inputTargets,
            output_targets: outputTargets
        };
    }

    /**
     * Convert a RenderTarget to view format
     */
    function rtToView(rt, nodes, renderPasses) {
        const owners = [];
        const readers = [];

        // Build owner list (nodes that write to this RT)
        for (const nodeIdx of rt.outputFromNodes) {
            const entry = createNodeRelationshipEntry(rt, nodeIdx, nodes, 'write');
            if (entry) owners.push(entry);
        }

        // Build reader list (nodes that read from this RT)
        for (const nodeIdx of rt.inputToNodes) {
            const entry = createNodeRelationshipEntry(rt, nodeIdx, nodes, 'read');
            if (entry) readers.push(entry);
        }

        // Sort by execution order
        owners.sort((a, b) => a.execution_order - b.execution_order);
        readers.sort((a, b) => a.execution_order - b.execution_order);

        // Build lifetime info
        const lifetime = {};
        if (rt.firstUsedAtNode !== null && nodes[rt.firstUsedAtNode]) {
            const firstNode = nodes[rt.firstUsedAtNode];
            lifetime.first_used = {
                node_index: rt.firstUsedAtNode,
                name: firstNode.name,
                execution_order: firstNode.executionOrder,
                usage_types: rt.nodeUsageTypes[rt.firstUsedAtNode] || [],
                render_pass: firstNode.renderPass,
                render_pass_index: firstNode.renderPassIndex
            };
        }
        if (rt.lastUsedAtNode !== null && nodes[rt.lastUsedAtNode]) {
            const lastNode = nodes[rt.lastUsedAtNode];
            lifetime.last_used = {
                node_index: rt.lastUsedAtNode,
                name: lastNode.name,
                execution_order: lastNode.executionOrder,
                usage_types: rt.nodeUsageTypes[rt.lastUsedAtNode] || [],
                render_pass: lastNode.renderPass,
                render_pass_index: lastNode.renderPassIndex
            };
        }

        return {
            index: rt.index,
            name: rt.name,
            format: {
                value: rt.format,
                name: rt.getFormatName()
            },
            resolution: rt.getResolutionDescription(),
            mip_levels: rt.mipLevels,
            sample_count: rt.sampleCount,
            usage: {
                value: rt.usage,
                flags: rt.getUsageFlags()
            },
            aspect: {
                value: rt.aspect,
                flags: rt.getAspectFlags()
            },
            memory_type: rt.memoryType,
            sampler_type: rt.samplerType,
            memory_usage: rt.memoryUsage,
            tiling: rt.tiling,
            ownership: owners,
            readers: readers,
            conditions: Array.from(rt.conditions),
            lifetime: lifetime
        };
    }

    /**
     * Create a relationship entry for a node
     */
    function createNodeRelationshipEntry(rt, nodeIdx, nodes, usageType) {
        if (!(nodeIdx in nodes)) return null;

        const node = nodes[nodeIdx];
        const usages = rt.nodeUsageTypes[nodeIdx] || [];

        // Determine the most appropriate relationship type from usage data
        let finalType = usageType === 'write' ? 'node_output' : 'node_input';
        let passName = null;

        for (const usage of usages) {
            if (['color_attachment', 'depth_attachment', 'resolve_attachment'].includes(usage.type)) {
                finalType = usage.type;
                passName = usage.pass_name;
                break;
            }
        }

        const entry = {
            node_index: nodeIdx,
            name: node.name,
            execution_order: node.executionOrder,
            conditions: node.conditions,
            type: finalType,
            render_pass: node.renderPass,
            render_pass_index: node.renderPassIndex,
            usage: usageType
        };

        if (passName) {
            entry.pass_name = passName;
        }

        return entry;
    }

    /**
     * Convert a RenderPass to view format
     */
    function rpToView(rp) {
        return {
            name: rp.name,
            index: rp.index,
            node_indices: rp.nodeIndices,
            color_attachment_indices: rp.colorAttachmentIndices,
            depth_attachment_index: rp.depthAttachmentIndex,
            resolve_attachment_indices: rp.resolveAttachmentIndices,
            conditions: rp.conditions,
            node_count: rp.nodeIndices.length,
            color_attachment_count: rp.colorAttachmentIndices.length,
            has_depth_attachment: rp.depthAttachmentIndex !== null,
            resolve_attachment_count: rp.resolveAttachmentIndices.length
        };
    }

    // Export for use by other modules
    window.RenderGraphAnalyzer = {
        analyze,
        toViewFormat,
        compileExecutionPath,
        decodeShaderBindings,
        analyzeRenderTargetUsage,
        updateRenderTargetLifetimes,
        PRIORITIES
    };

})();
