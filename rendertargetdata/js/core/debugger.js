// Debugger module - validation checks for render graph analysis

(function() {
    const {
        USAGE_BITS, ASPECT_BITS, NODE_TYPES, FORMAT_MAP,
        BINDING_ACCESS, BINDING_FLAGS,
        SYSTEM_RT_INDEX_LIST,
        COLOR_FORMATS, DEPTH_FORMATS,
        IMAGE_LAYOUT, PIPELINE_STAGE, PASS_TYPE, NODE_TO_PASS_TYPE,
        getExpectedImageState, getAttachmentImageState
    } = window.RenderGraphConstants;

    // Node type constants (frame_node_type enum values from render_graph_description.hpp)
    const VIEWPORT_NODE = 0;
    const DRAW_BATCH_NODE = 1;
    const DRAW_BATCH_WITH_MATERIALS_NODE = 2;
    const DISPATCH_COMPUTE_NODE = 3;
    const BLIT_IMAGE_NODE = 4;
    const BLIT_IMAGE_PTR_DST_NODE = 5;
    const COPY_IMAGE_NODE = 6;
    const RESOLVE_IMAGE_NODE = 7;
    const DRAW_QUAD_NODE = 8;
    const GENERATE_MIP_CHAIN_NODE = 9;
    const COPY_TO_CUBEMAP_FACE_NODE = 10;
    const CLEAR_IMAGES_NODE = 13;
    const FILL_BUFFER_NODE = 15;
    const DRAW_DEBUG_LINES_NODE = 16;
    const DISPATCH_DECALS_COMPUTE_NODE = 17;
    const SET_DEPTH_BIAS_NODE = 18;
    const DISPATCH_RAY_TRACING_NODE = 19;

    /**
     * Get the effective conditions for a node, including its render pass conditions.
     * A node only executes when ALL effective conditions are satisfied.
     */
    function getEffectiveConditions(node, renderPasses) {
        const conditions = [...(node.conditions || [])];
        if (node.renderPassIndex !== null && renderPasses && node.renderPassIndex in renderPasses) {
            const rp = renderPasses[node.renderPassIndex];
            if (rp.conditions && rp.conditions.length > 0) {
                for (const cond of rp.conditions) {
                    if (!conditions.includes(cond)) {
                        conditions.push(cond);
                    }
                }
            }
        }
        return conditions;
    }

    /**
     * Check if two nodes with the given condition sets can execute in the same frame.
     * Returns false if one requires condition X and the other requires !X.
     */
    function canCoexecute(conditionsA, conditionsB) {
        if (!conditionsA || conditionsA.length === 0) return true;
        if (!conditionsB || conditionsB.length === 0) return true;

        for (const condA of conditionsA) {
            const isNegA = condA.startsWith('!');
            const baseA = isNegA ? condA.slice(1) : condA;

            for (const condB of conditionsB) {
                const isNegB = condB.startsWith('!');
                const baseB = isNegB ? condB.slice(1) : condB;

                if (baseA === baseB && isNegA !== isNegB) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Get the combined conditions under which both nodes would run simultaneously.
     * Returns the deduplicated union of both condition sets.
     * Returns null if unconditional (both have empty conditions).
     */
    function getCombinedConditions(conditionsA, conditionsB) {
        const combined = new Set([...(conditionsA || []), ...(conditionsB || [])]);
        return combined.size > 0 ? [...combined] : null;
    }

    /**
     * Format a conditions array into a readable suffix for issue messages.
     * Returns empty string if unconditional.
     */
    function formatConditionsSuffix(conditions) {
        if (!conditions || conditions.length === 0) return '';
        return ` (when: ${conditions.join(', ')})`;
    }

    // Semantic concepts for naming consistency check
    const SEMANTIC_CONCEPTS = [
        "position", "normal", "tangent", "binormal", "texcoord", "color",
        "albedo", "specular", "roughness", "metallic", "emissive", "ao",
        "depth", "motion", "velocity", "shadow", "light", "radiance",
        "irradiance", "ambient", "reflection", "mask", "noise", "random",
        "height", "displacement", "occlusion", "flow", "msaa", "anisotropy", "clearcoat"
    ];

    const SPACE_PREFIXES = ["vs_", "ws_", "os_", "cs_", "ss_", "ts_", "ps_", "ls_", "fs_"];

    // Related concepts for semantic matching
    const RELATED_CONCEPTS = {
        "position": ["pos", "location", "loc", "origin"],
        "normal": ["normals"],
        "albedo": ["color", "diffuse"],
        "diffuse": ["albedo", "color"],
        "color": ["albedo", "diffuse"],
        "specular": ["reflection"],
        "reflection": ["specular"],
        "roughness": ["smoothness"],
        "metallic": ["metalness"],
        "mip": ["lod"],
        "lod": ["mip"]
    };

    /**
     * Main entry point - run all validation checks
     * @param {Object} renderTargets - Analyzed render targets
     * @param {Object} nodes - Analyzed nodes
     * @param {Object} renderPasses - Analyzed render passes
     * @param {Object} rawData - Optional raw data for shader binding checks
     * @returns {Array} Array of issue objects
     */
    function runAllChecks(renderTargets, nodes, renderPasses, rawData = null) {
        const issues = [];

        const addIssue = (severity, type, message, details = {}) => {
            issues.push({ severity, type, message, details });
        };

        // Run all validation checks
        checkUnusedRenderTargets(renderTargets, addIssue);
        checkIncompleteChains(renderTargets, nodes, addIssue);
        checkUnusedNodes(nodes, addIssue);
        checkRenderPassConsistency(renderPasses, renderTargets, nodes, addIssue);
        checkFormatCompatibility(nodes, renderTargets, addIssue);
        checkMissingReferences(nodes, renderTargets, addIssue);
        checkRenderTargetFormatCompatibility(renderTargets, addIssue);
        checkRenderTargetUsageFlags(renderTargets, nodes, addIssue);
        checkRenderPassSampleCountConsistency(renderPasses, renderTargets, addIssue);
        checkNodeIOValidity(nodes, renderTargets, addIssue);
        checkRTMemoryRequirements(renderTargets, renderPasses, nodes, addIssue);
        checkMSAAResolveCompatibility(renderPasses, renderTargets, addIssue);
        checkRenderTargetLifetime(renderTargets, nodes, renderPasses, addIssue);
        checkResourceBarriers(renderTargets, nodes, renderPasses, addIssue);
        checkMipmapGeneration(nodes, renderTargets, addIssue);
        checkResourceAliasingOpportunities(renderTargets, nodes, addIssue);

        // Shader binding naming check needs raw data
        if (rawData) {
            checkShaderBindingNamingConsistency(nodes, renderTargets, rawData, addIssue);
        }

        return issues;
    }

    /**
     * Check for render targets that are defined but never used
     */
    function checkUnusedRenderTargets(renderTargets, addIssue) {
        for (const [idx, rt] of Object.entries(renderTargets)) {
            if (rt.inputToNodes.length === 0 && rt.outputFromNodes.length === 0) {
                addIssue("WARNING", "UNUSED_RENDER_TARGET",
                    `Render target '${rt.name}' (index ${idx}) is never used by any node`,
                    {
                        render_target_index: parseInt(idx),
                        render_target_name: rt.name,
                        format: rt.getFormatName()
                    }
                );
            }
        }
    }

    /**
     * Check for render targets that are written to but never read, or read but never written
     */
    function checkIncompleteChains(renderTargets, nodes, addIssue) {
        for (const [idx, rt] of Object.entries(renderTargets)) {
            // Check for write-only render targets
            if (rt.outputFromNodes.length > 0 && rt.inputToNodes.length === 0) {
                // Skip special targets like final outputs
                const outputNames = ["output", "final", "result", "display", "present", "swapchain", "screen", "backbuffer"];
                if (outputNames.some(name => rt.name.toLowerCase().includes(name))) {
                    continue;
                }

                // Skip MSAA render targets that were used in a render pass
                if (rt.sampleCount > 1 && (rt.usedAsColorAttachment.length > 0 || rt.usedAsDepthAttachment.length > 0)) {
                    continue;
                }

                // Skip depth textures that were used in a render pass
                if ((rt.aspect & ASPECT_BITS.DEPTH) && rt.usedAsDepthAttachment.length > 0) {
                    continue;
                }

                addIssue("WARNING", "WRITE_ONLY_RENDER_TARGET",
                    `Render target '${rt.name}' (index ${idx}) is written to but never read from`,
                    {
                        render_target_index: parseInt(idx),
                        render_target_name: rt.name,
                        written_by_nodes: rt.outputFromNodes
                            .filter(nodeIdx => nodeIdx in nodes)
                            .map(nodeIdx => nodes[nodeIdx].name)
                    }
                );
            }

            // Check for read-only render targets
            if (rt.inputToNodes.length > 0 && rt.outputFromNodes.length === 0) {
                // Skip special targets that might be populated externally
                const inputNames = ["backbuffer", "swapchain", "screen", "display", "input", "source", "external", "import"];
                if (inputNames.some(name => rt.name.toLowerCase().includes(name))) {
                    continue;
                }

                addIssue("ERROR", "READ_ONLY_RENDER_TARGET",
                    `Render target '${rt.name}' (index ${idx}) is read from but never written to`,
                    {
                        render_target_index: parseInt(idx),
                        render_target_name: rt.name,
                        read_by_nodes: rt.inputToNodes
                            .filter(nodeIdx => nodeIdx in nodes)
                            .map(nodeIdx => nodes[nodeIdx].name)
                    }
                );
            }
        }
    }

    /**
     * Check for nodes that don't connect to any render targets
     */
    function checkUnusedNodes(nodes, addIssue) {
        for (const [idx, node] of Object.entries(nodes)) {
            // Skip if the node has explicit inputs or outputs
            if (node.inputs.length > 0 || node.outputs.length > 0) {
                continue;
            }

            // Skip if the node has RT references encoded in dataJson (shader bindings)
            if (node.dataJson && Object.values(node.dataJson).some(v =>
                typeof v === 'number' && Number.isInteger(v) && v >= 0x10000
            )) {
                continue;
            }

            // Skip some node types that might legitimately have no connections
            if (node.type === VIEWPORT_NODE || node.type === SET_DEPTH_BIAS_NODE) {
                continue;
            }

            // Skip nodes that are part of render passes
            if (node.renderPassIndex !== null) {
                continue;
            }

            addIssue("WARNING", "ISOLATED_NODE",
                `Node '${node.name}' (index ${idx}) has no input or output connections`,
                {
                    node_index: parseInt(idx),
                    node_name: node.name,
                    node_type: node.getTypeName(),
                    execution_order: node.executionOrder
                }
            );
        }
    }

    /**
     * Check for render passes with missing or invalid attachments
     */
    function checkRenderPassConsistency(renderPasses, renderTargets, nodes, addIssue) {
        for (const [rpIdx, rp] of Object.entries(renderPasses)) {
            const passIdx = parseInt(rpIdx);

            // Check color attachments
            for (const rtIdx of rp.colorAttachmentIndices) {
                if (!(rtIdx in renderTargets)) {
                    addIssue("ERROR", "INVALID_COLOR_ATTACHMENT",
                        `Render pass '${rp.name}' references non-existent color attachment RT#${rtIdx}`,
                        {
                            render_pass_index: passIdx,
                            render_pass_name: rp.name,
                            attachment_index: rtIdx,
                            attachment_type: "color"
                        }
                    );
                } else {
                    const rt = renderTargets[rtIdx];
                    // Check if the render target has the appropriate usage flag
                    if (!(rt.usage & USAGE_BITS.COLOR_ATTACHMENT)) {
                        addIssue("ERROR", "INVALID_RT_USAGE_FLAG",
                            `Render target '${rt.name}' (RT#${rtIdx}) used as color attachment in '${rp.name}' but lacks COLOR_ATTACHMENT usage flag`,
                            {
                                render_pass_index: passIdx,
                                render_pass_name: rp.name,
                                render_target_index: rtIdx,
                                render_target_name: rt.name,
                                usage_flags: rt.getUsageFlags()
                            }
                        );
                    }
                }
            }

            // Check depth attachment
            if (rp.depthAttachmentIndex !== null) {
                const rtIdx = rp.depthAttachmentIndex;
                if (!(rtIdx in renderTargets)) {
                    addIssue("ERROR", "INVALID_DEPTH_ATTACHMENT",
                        `Render pass '${rp.name}' references non-existent depth attachment RT#${rtIdx}`,
                        {
                            render_pass_index: passIdx,
                            render_pass_name: rp.name,
                            attachment_index: rtIdx,
                            attachment_type: "depth"
                        }
                    );
                } else {
                    const rt = renderTargets[rtIdx];
                    // Check if the render target has the appropriate usage flag
                    if (!(rt.usage & USAGE_BITS.DEPTH_STENCIL)) {
                        addIssue("ERROR", "INVALID_RT_USAGE_FLAG",
                            `Render target '${rt.name}' (RT#${rtIdx}) used as depth attachment in '${rp.name}' but lacks DEPTH_STENCIL_ATTACHMENT usage flag`,
                            {
                                render_pass_index: passIdx,
                                render_pass_name: rp.name,
                                render_target_index: rtIdx,
                                render_target_name: rt.name,
                                usage_flags: rt.getUsageFlags()
                            }
                        );
                    }

                    // Check aspect flag
                    if (!(rt.aspect & ASPECT_BITS.DEPTH)) {
                        addIssue("ERROR", "INVALID_RT_ASPECT_FLAG",
                            `Render target '${rt.name}' (RT#${rtIdx}) used as depth attachment in '${rp.name}' but lacks DEPTH aspect flag`,
                            {
                                render_pass_index: passIdx,
                                render_pass_name: rp.name,
                                render_target_index: rtIdx,
                                render_target_name: rt.name,
                                aspect_flags: rt.getAspectFlags()
                            }
                        );
                    }
                }
            }

            // Check resolve attachments
            for (const rtIdx of rp.resolveAttachmentIndices) {
                if (!(rtIdx in renderTargets)) {
                    addIssue("ERROR", "INVALID_RESOLVE_ATTACHMENT",
                        `Render pass '${rp.name}' references non-existent resolve attachment RT#${rtIdx}`,
                        {
                            render_pass_index: passIdx,
                            render_pass_name: rp.name,
                            attachment_index: rtIdx,
                            attachment_type: "resolve"
                        }
                    );
                } else {
                    const rt = renderTargets[rtIdx];
                    if (rt.sampleCount !== 1) {
                        addIssue("ERROR", "INVALID_RESOLVE_SAMPLE_COUNT",
                            `Render target '${rt.name}' (RT#${rtIdx}) used as resolve attachment in '${rp.name}' has sample count ${rt.sampleCount}, should be 1`,
                            {
                                render_pass_index: passIdx,
                                render_pass_name: rp.name,
                                render_target_index: rtIdx,
                                render_target_name: rt.name,
                                sample_count: rt.sampleCount
                            }
                        );
                    }
                }
            }

            // Check if render pass has nodes
            if (rp.nodeIndices.length === 0) {
                addIssue("WARNING", "EMPTY_RENDER_PASS",
                    `Render pass '${rp.name}' (index ${passIdx}) has no nodes`,
                    {
                        render_pass_index: passIdx,
                        render_pass_name: rp.name
                    }
                );
            } else {
                // Check if all nodes exist
                for (const nodeIdx of rp.nodeIndices) {
                    if (!(nodeIdx in nodes)) {
                        addIssue("ERROR", "INVALID_RENDER_PASS_NODE",
                            `Render pass '${rp.name}' references non-existent node index ${nodeIdx}`,
                            {
                                render_pass_index: passIdx,
                                render_pass_name: rp.name,
                                node_index: nodeIdx
                            }
                        );
                    }
                }
            }
        }
    }

    /**
     * Check format compatibility between connected render targets (blit operations)
     */
    function checkFormatCompatibility(nodes, renderTargets, addIssue) {
        for (const [nodeIdx, node] of Object.entries(nodes)) {
            // Only check blit operations
            if (node.type !== BLIT_IMAGE_NODE && node.type !== BLIT_IMAGE_PTR_DST_NODE) {
                continue;
            }

            for (const inputIdx of node.inputs) {
                if (inputIdx < 0 || !(inputIdx in renderTargets)) {
                    continue;
                }

                const inputRt = renderTargets[inputIdx];

                for (const outputIdx of node.outputs) {
                    if (outputIdx < 0 || !(outputIdx in renderTargets)) {
                        continue;
                    }

                    const outputRt = renderTargets[outputIdx];

                    // Check format compatibility
                    if (inputRt.format !== outputRt.format) {
                        addIssue("ERROR", "FORMAT_MISMATCH",
                            `Format mismatch in blit node '${node.name}': RT '${inputRt.name}' (RT#${inputIdx}, ${inputRt.getFormatName()}) to RT '${outputRt.name}' (RT#${outputIdx}, ${outputRt.getFormatName()})`,
                            {
                                node_index: parseInt(nodeIdx),
                                node_name: node.name,
                                node_type: node.getTypeName(),
                                input_rt: {
                                    index: inputIdx,
                                    name: inputRt.name,
                                    format: inputRt.getFormatName()
                                },
                                output_rt: {
                                    index: outputIdx,
                                    name: outputRt.name,
                                    format: outputRt.getFormatName()
                                }
                            }
                        );
                    }

                    // Check sample count compatibility
                    if (inputRt.sampleCount !== outputRt.sampleCount) {
                        // Regular blit with MSAA to 1x is likely a resolve operation
                        const severity = (node.type === BLIT_IMAGE_NODE && inputRt.sampleCount > 1 && outputRt.sampleCount === 1)
                            ? "WARNING" : "ERROR";

                        addIssue(severity, "SAMPLE_COUNT_MISMATCH",
                            `Sample count mismatch in blit node '${node.name}': RT '${inputRt.name}' (${inputRt.sampleCount}x) to RT '${outputRt.name}' (${outputRt.sampleCount}x)`,
                            {
                                node_index: parseInt(nodeIdx),
                                node_name: node.name,
                                input_rt: {
                                    index: inputIdx,
                                    name: inputRt.name,
                                    sample_count: inputRt.sampleCount
                                },
                                output_rt: {
                                    index: outputIdx,
                                    name: outputRt.name,
                                    sample_count: outputRt.sampleCount
                                }
                            }
                        );
                    }
                }
            }
        }
    }

    /**
     * Check for missing references in nodes and render targets
     */
    function checkMissingReferences(nodes, renderTargets, addIssue) {
        for (const [nodeIdx, node] of Object.entries(nodes)) {
            // Check input references
            for (const rtIdx of node.inputs) {
                if (rtIdx >= 0 && !(rtIdx in renderTargets) && !SYSTEM_RT_INDEX_LIST.includes(rtIdx)) {
                    addIssue("ERROR", "MISSING_RENDER_TARGET",
                        `Node '${node.name}' references non-existent input render target RT#${rtIdx}`,
                        {
                            node_index: parseInt(nodeIdx),
                            node_name: node.name,
                            render_target_index: rtIdx,
                            reference_type: "input"
                        }
                    );
                }
            }

            // Check output references
            for (const rtIdx of node.outputs) {
                if (rtIdx >= 0 && !(rtIdx in renderTargets) && !SYSTEM_RT_INDEX_LIST.includes(rtIdx)) {
                    addIssue("ERROR", "MISSING_RENDER_TARGET",
                        `Node '${node.name}' references non-existent output render target RT#${rtIdx}`,
                        {
                            node_index: parseInt(nodeIdx),
                            node_name: node.name,
                            render_target_index: rtIdx,
                            reference_type: "output"
                        }
                    );
                }
            }
        }
    }

    /**
     * Check that render targets have appropriate formats for their usage
     */
    function checkRenderTargetFormatCompatibility(renderTargets, addIssue) {
        for (const [idx, rt] of Object.entries(renderTargets)) {
            // Check color attachments
            if (rt.usedAsColorAttachment.length > 0 && !COLOR_FORMATS.includes(rt.format)) {
                addIssue("ERROR", "INVALID_COLOR_FORMAT",
                    `Render target '${rt.name}' (RT#${idx}) used as color attachment has non-color format ${rt.getFormatName()}`,
                    {
                        render_target_index: parseInt(idx),
                        render_target_name: rt.name,
                        format: rt.getFormatName(),
                        expected_formats: COLOR_FORMATS.map(fmt => FORMAT_MAP[fmt] || `Unknown (${fmt})`),
                        render_passes: rt.usedAsColorAttachment.map(rp => rp.pass_name)
                    }
                );
            }

            // Check depth attachments
            if (rt.usedAsDepthAttachment.length > 0 && !DEPTH_FORMATS.includes(rt.format)) {
                addIssue("ERROR", "INVALID_DEPTH_FORMAT",
                    `Render target '${rt.name}' (RT#${idx}) used as depth attachment has non-depth format ${rt.getFormatName()}`,
                    {
                        render_target_index: parseInt(idx),
                        render_target_name: rt.name,
                        format: rt.getFormatName(),
                        expected_formats: DEPTH_FORMATS.map(fmt => FORMAT_MAP[fmt] || `Unknown (${fmt})`),
                        render_passes: rt.usedAsDepthAttachment.map(rp => rp.pass_name)
                    }
                );
            }
        }
    }

    /**
     * Check that render targets have appropriate usage flags
     */
    function checkRenderTargetUsageFlags(renderTargets, nodes, addIssue) {
        for (const [idx, rt] of Object.entries(renderTargets)) {
            // Check for render targets used as shader inputs
            if (rt.inputToNodes.length > 0 && !(rt.usage & USAGE_BITS.SAMPLED) && !(rt.usage & USAGE_BITS.STORAGE)) {
                addIssue("ERROR", "MISSING_SAMPLED_FLAG",
                    `Render target '${rt.name}' (index ${idx}) used as shader input but lacks SAMPLED or STORAGE flag`,
                    {
                        render_target_index: parseInt(idx),
                        render_target_name: rt.name,
                        usage_flags: rt.getUsageFlags(),
                        read_by_nodes: rt.inputToNodes
                            .filter(nodeIdx => nodeIdx in nodes)
                            .map(nodeIdx => nodes[nodeIdx].name)
                    }
                );
            }

            // Check compute shader outputs
            for (const nodeIdx of rt.outputFromNodes) {
                if (nodeIdx in nodes) {
                    const node = nodes[nodeIdx];
                    if (node.type === DISPATCH_COMPUTE_NODE || node.type === DISPATCH_DECALS_COMPUTE_NODE || node.type === DISPATCH_RAY_TRACING_NODE) {
                        if (!(rt.usage & USAGE_BITS.STORAGE)) {
                            addIssue("ERROR", "MISSING_STORAGE_FLAG",
                                `Render target '${rt.name}' (index ${idx}) written by compute shader node '${node.name}' but lacks STORAGE flag`,
                                {
                                    render_target_index: parseInt(idx),
                                    render_target_name: rt.name,
                                    usage_flags: rt.getUsageFlags(),
                                    node: {
                                        index: nodeIdx,
                                        name: node.name,
                                        type: node.getTypeName()
                                    }
                                }
                            );
                        }
                    }
                }
            }
        }
    }

    /**
     * Check sample count consistency in render passes
     */
    function checkRenderPassSampleCountConsistency(renderPasses, renderTargets, addIssue) {
        for (const [rpIdx, rp] of Object.entries(renderPasses)) {
            const passIdx = parseInt(rpIdx);

            // Collect all attachments for this render pass
            const attachmentIndices = [...rp.colorAttachmentIndices];
            if (rp.depthAttachmentIndex !== null) {
                attachmentIndices.push(rp.depthAttachmentIndex);
            }

            // Skip if less than 2 attachments
            if (attachmentIndices.length < 2) {
                continue;
            }

            // Collect valid render targets and their sample counts
            const attachmentSampleCounts = {};
            for (const rtIdx of attachmentIndices) {
                if (rtIdx in renderTargets) {
                    const rt = renderTargets[rtIdx];
                    attachmentSampleCounts[rtIdx] = {
                        name: rt.name,
                        sample_count: rt.sampleCount
                    };
                }
            }

            // Check for mismatches in sample counts
            const sampleCounts = new Set(Object.values(attachmentSampleCounts).map(info => info.sample_count));
            if (sampleCounts.size > 1) {
                addIssue("ERROR", "SAMPLE_COUNT_MISMATCH",
                    `Sample count mismatch in render pass '${rp.name}' (index ${passIdx}): attachments have different sample counts`,
                    {
                        render_pass_index: passIdx,
                        render_pass_name: rp.name,
                        attachments: Object.entries(attachmentSampleCounts).map(([idx, info]) => ({
                            index: parseInt(idx),
                            name: info.name,
                            sample_count: info.sample_count
                        }))
                    }
                );
            }

            // Check resolve targets
            if (rp.resolveAttachmentIndices.length > 0) {
                for (const resolveIdx of rp.resolveAttachmentIndices) {
                    if (resolveIdx in renderTargets) {
                        const resolveRt = renderTargets[resolveIdx];
                        if (resolveRt.sampleCount !== 1) {
                            addIssue("ERROR", "INVALID_RESOLVE_SAMPLE_COUNT",
                                `Resolve attachment '${resolveRt.name}' (index ${resolveIdx}) in render pass '${rp.name}' has sample count ${resolveRt.sampleCount}, should be 1`,
                                {
                                    render_pass_index: passIdx,
                                    render_pass_name: rp.name,
                                    render_target_index: resolveIdx,
                                    render_target_name: resolveRt.name,
                                    sample_count: resolveRt.sampleCount
                                }
                            );
                        }
                    }
                }

                // Check MSAA with resolve attachments
                const maxSampleCount = Math.max(...sampleCounts);
                if (maxSampleCount > 1) {
                    // This is an MSAA render pass
                    if (rp.colorAttachmentIndices.length !== rp.resolveAttachmentIndices.length) {
                        addIssue("ERROR", "MISMATCHED_RESOLVE_ATTACHMENTS",
                            `MSAA render pass '${rp.name}' (index ${passIdx}) has ${rp.colorAttachmentIndices.length} color attachments but ${rp.resolveAttachmentIndices.length} resolve attachments`,
                            {
                                render_pass_index: passIdx,
                                render_pass_name: rp.name,
                                color_attachments: rp.colorAttachmentIndices.length,
                                resolve_attachments: rp.resolveAttachmentIndices.length
                            }
                        );
                    }
                }
            }

            // Check if MSAA attachments could use TRANSIENT flag
            for (const rtIdx of attachmentIndices) {
                if (rtIdx in renderTargets) {
                    const rt = renderTargets[rtIdx];
                    if (rt.sampleCount > 1 && !(rt.usage & USAGE_BITS.TRANSIENT)) {
                        const renderPassUsage = rp.colorAttachmentIndices.includes(rtIdx)
                            ? "color attachment"
                            : "depth attachment";

                        addIssue("INFO", "POTENTIAL_TRANSIENT_OPTIMIZATION",
                            `MSAA ${renderPassUsage} '${rt.name}' (RT#${rtIdx}) in render pass '${rp.name}' could use TRANSIENT_ATTACHMENT flag for better memory usage`,
                            {
                                render_pass_index: passIdx,
                                render_pass_name: rp.name,
                                render_target_index: rtIdx,
                                render_target_name: rt.name,
                                sample_count: rt.sampleCount,
                                usage_flags: rt.getUsageFlags(),
                                attachment_type: renderPassUsage
                            }
                        );
                    }
                }
            }
        }
    }

    /**
     * Check if nodes have appropriate input/output patterns
     */
    function checkNodeIOValidity(nodes, renderTargets, addIssue) {
        for (const [nodeIdx, node] of Object.entries(nodes)) {
            const nodeType = node.type;

            // Check blit nodes
            if (nodeType === BLIT_IMAGE_NODE || nodeType === BLIT_IMAGE_PTR_DST_NODE) {
                if (node.inputs.length === 0) {
                    addIssue("ERROR", "INVALID_NODE_INPUTS",
                        `Blit node '${node.name}' (index ${nodeIdx}) has no inputs`,
                        {
                            node_index: parseInt(nodeIdx),
                            node_name: node.name,
                            node_type: node.getTypeName(),
                            conditions: node.conditions
                        }
                    );
                }
                if (node.outputs.length === 0) {
                    addIssue("ERROR", "INVALID_NODE_OUTPUTS",
                        `Blit node '${node.name}' (index ${nodeIdx}) has no outputs`,
                        {
                            node_index: parseInt(nodeIdx),
                            node_name: node.name,
                            node_type: node.getTypeName()
                        }
                    );
                }
            }
            // Check clear nodes
            else if (nodeType === CLEAR_IMAGES_NODE) {
                if (node.inputs.length > 0) {
                    addIssue("WARNING", "UNEXPECTED_NODE_INPUTS",
                        `Clear node '${node.name}' (index ${nodeIdx}) should not have inputs`,
                        {
                            node_index: parseInt(nodeIdx),
                            node_name: node.name,
                            node_type: node.getTypeName(),
                            inputs: node.inputs
                        }
                    );
                }
                if (node.outputs.length === 0) {
                    addIssue("ERROR", "INVALID_NODE_OUTPUTS",
                        `Clear node '${node.name}' (index ${nodeIdx}) has no outputs`,
                        {
                            node_index: parseInt(nodeIdx),
                            node_name: node.name,
                            node_type: node.getTypeName()
                        }
                    );
                }
            }
            // Compute STORAGE check is handled in checkRenderTargetUsageFlags
            // to avoid duplicate issue reporting
        }
    }

    /**
     * Check render target memory requirements
     */
    function checkRTMemoryRequirements(renderTargets, renderPasses, nodes, addIssue) {
        for (const [idx, rt] of Object.entries(renderTargets)) {
            // Check MSAA sample count
            if (rt.usedAsColorAttachment.length > 0 || rt.usedAsDepthAttachment.length > 0) {
                if (rt.sampleCount > 1) {
                    // Verify appropriate usage flags for MSAA
                    if (!(rt.usage & USAGE_BITS.TRANSIENT)) {
                        const renderPassNames = [
                            ...rt.usedAsColorAttachment.map(rp => rp.pass_name),
                            ...rt.usedAsDepthAttachment.map(rp => rp.pass_name)
                        ];

                        // Only suggest TRANSIENT if used in a single render pass
                        const uniquePassNames = new Set(renderPassNames);
                        if (uniquePassNames.size <= 1) {
                            addIssue("INFO", "MISSING_TRANSIENT_FLAG",
                                `MSAA render target '${rt.name}' (RT#${idx}) with sample count ${rt.sampleCount} should have TRANSIENT_ATTACHMENT flag`,
                                {
                                    render_target_index: parseInt(idx),
                                    render_target_name: rt.name,
                                    sample_count: rt.sampleCount,
                                    usage_flags: rt.getUsageFlags(),
                                    render_passes: renderPassNames
                                }
                            );
                        }
                    }
                }
            }

            // Check transient targets
            if (rt.usage & USAGE_BITS.TRANSIENT) {
                // Transient attachments should only be used within a single render pass
                if (rt.inputToNodes.length > 0) {
                    const renderPassIndices = new Set();
                    for (const nodeIdx of rt.inputToNodes) {
                        if (nodeIdx in nodes) {
                            const node = nodes[nodeIdx];
                            if (node.renderPassIndex !== null) {
                                renderPassIndices.add(node.renderPassIndex);
                            }
                        }
                    }

                    if (renderPassIndices.size > 1) {
                        const renderPassNames = [];
                        for (const rpIdx of renderPassIndices) {
                            if (rpIdx in renderPasses) {
                                renderPassNames.push(renderPasses[rpIdx].name);
                            }
                        }

                        addIssue("ERROR", "INVALID_TRANSIENT_USAGE",
                            `Transient render target '${rt.name}' (RT#${idx}) is used across multiple render passes`,
                            {
                                render_target_index: parseInt(idx),
                                render_target_name: rt.name,
                                render_pass_indices: Array.from(renderPassIndices),
                                render_pass_names: renderPassNames
                            }
                        );
                    }
                }
            }

            // Check RT scaling consistency
            if (rt.extent[0] !== 0 || rt.extent[1] !== 0 || rt.extent[2] !== 0) {
                // Find related RTs
                const relatedRTs = new Set();
                for (const nodeIdx of rt.outputFromNodes) {
                    if (nodeIdx in nodes) {
                        const node = nodes[nodeIdx];
                        for (const outIdx of node.outputs) {
                            if (outIdx !== parseInt(idx) && outIdx in renderTargets) {
                                relatedRTs.add(outIdx);
                            }
                        }
                    }
                }
                for (const nodeIdx of rt.inputToNodes) {
                    if (nodeIdx in nodes) {
                        const node = nodes[nodeIdx];
                        for (const inIdx of node.inputs) {
                            if (inIdx !== parseInt(idx) && inIdx in renderTargets) {
                                relatedRTs.add(inIdx);
                            }
                        }
                    }
                }

                // Compare scaling with related RTs
                for (const relatedIdx of relatedRTs) {
                    const relatedRt = renderTargets[relatedIdx];
                    if (relatedRt.extent[0] !== 0 || relatedRt.extent[1] !== 0 || relatedRt.extent[2] !== 0) {
                        if (JSON.stringify(relatedRt.extent) !== JSON.stringify(rt.extent)) {
                            // Check if either RT is a depth buffer
                            const isDepthToColor = (rt.aspect & ASPECT_BITS.DEPTH) && !(relatedRt.aspect & ASPECT_BITS.DEPTH);
                            const isColorToDepth = !(rt.aspect & ASPECT_BITS.DEPTH) && (relatedRt.aspect & ASPECT_BITS.DEPTH);

                            if (!isDepthToColor && !isColorToDepth) {
                                addIssue("WARNING", "INCONSISTENT_RT_SCALING",
                                    `Related render targets '${rt.name}' (RT#${idx}) and '${relatedRt.name}' (RT#${relatedIdx}) have inconsistent scaling`,
                                    {
                                        render_target_1: {
                                            index: parseInt(idx),
                                            name: rt.name,
                                            extent: rt.extent
                                        },
                                        render_target_2: {
                                            index: relatedIdx,
                                            name: relatedRt.name,
                                            extent: relatedRt.extent
                                        }
                                    }
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Check MSAA and resolve target compatibility
     */
    function checkMSAAResolveCompatibility(renderPasses, renderTargets, addIssue) {
        for (const [rpIdx, rp] of Object.entries(renderPasses)) {
            const passIdx = parseInt(rpIdx);

            // Check only render passes with both color and resolve attachments
            if (rp.colorAttachmentIndices.length === 0 || rp.resolveAttachmentIndices.length === 0) {
                continue;
            }

            // Check format compatibility between color and resolve attachments
            for (let i = 0; i < rp.colorAttachmentIndices.length; i++) {
                if (i >= rp.resolveAttachmentIndices.length) {
                    break;
                }

                const colorIdx = rp.colorAttachmentIndices[i];
                const resolveIdx = rp.resolveAttachmentIndices[i];

                const colorRtValid = colorIdx in renderTargets;
                const resolveRtValid = resolveIdx in renderTargets;

                if (!colorRtValid) {
                    addIssue("ERROR", "INVALID_COLOR_ATTACHMENT",
                        `MSAA render pass '${rp.name}' references non-existent color attachment RT#${colorIdx}`,
                        {
                            render_pass_index: passIdx,
                            render_pass_name: rp.name,
                            attachment_index: colorIdx,
                            attachment_type: "msaa_color"
                        }
                    );
                    continue;
                }

                if (!resolveRtValid) {
                    addIssue("ERROR", "INVALID_RESOLVE_ATTACHMENT",
                        `MSAA render pass '${rp.name}' references non-existent resolve attachment RT#${resolveIdx}`,
                        {
                            render_pass_index: passIdx,
                            render_pass_name: rp.name,
                            attachment_index: resolveIdx,
                            attachment_type: "msaa_resolve"
                        }
                    );
                    continue;
                }

                const colorRt = renderTargets[colorIdx];
                const resolveRt = renderTargets[resolveIdx];

                // Check format compatibility
                if (colorRt.format !== resolveRt.format) {
                    addIssue("ERROR", "MSAA_RESOLVE_FORMAT_MISMATCH",
                        `MSAA color attachment '${colorRt.name}' (RT#${colorIdx}) and resolve attachment '${resolveRt.name}' (RT#${resolveIdx}) in '${rp.name}' have mismatched formats`,
                        {
                            render_pass_index: passIdx,
                            render_pass_name: rp.name,
                            color_attachment: {
                                index: colorIdx,
                                name: colorRt.name,
                                format: colorRt.getFormatName(),
                                sample_count: colorRt.sampleCount
                            },
                            resolve_attachment: {
                                index: resolveIdx,
                                name: resolveRt.name,
                                format: resolveRt.getFormatName(),
                                sample_count: resolveRt.sampleCount
                            }
                        }
                    );
                }

                // Check sample counts
                if (colorRt.sampleCount <= 1) {
                    addIssue("ERROR", "INVALID_MSAA_SAMPLE_COUNT",
                        `MSAA color attachment '${colorRt.name}' (RT#${colorIdx}) in '${rp.name}' has invalid sample count ${colorRt.sampleCount}`,
                        {
                            render_pass_index: passIdx,
                            render_pass_name: rp.name,
                            render_target_index: colorIdx,
                            render_target_name: colorRt.name,
                            sample_count: colorRt.sampleCount
                        }
                    );
                }

                if (resolveRt.sampleCount !== 1) {
                    addIssue("ERROR", "INVALID_RESOLVE_SAMPLE_COUNT",
                        `Resolve attachment '${resolveRt.name}' (RT#${resolveIdx}) in '${rp.name}' has invalid sample count ${resolveRt.sampleCount}, should be 1`,
                        {
                            render_pass_index: passIdx,
                            render_pass_name: rp.name,
                            render_target_index: resolveIdx,
                            render_target_name: resolveRt.name,
                            sample_count: resolveRt.sampleCount
                        }
                    );
                }
            }
        }
    }

    /**
     * Check render target lifetime constraints
     */
    function checkRenderTargetLifetime(renderTargets, nodes, renderPasses, addIssue) {
        for (const [idx, rt] of Object.entries(renderTargets)) {
            // Skip special targets that might be populated externally
            const inputNames = ["backbuffer", "swapchain", "screen", "display", "input", "source", "external", "import"];
            if (inputNames.some(name => rt.name.toLowerCase().includes(name))) {
                continue;
            }

            if (rt.firstUsedAtNode !== null && rt.lastUsedAtNode !== null) {
                if (!(rt.firstUsedAtNode in nodes)) {
                    addIssue("ERROR", "INVALID_FIRST_USAGE",
                        `Render target '${rt.name}' (RT#${idx}) has invalid first usage node index ${rt.firstUsedAtNode}`,
                        {
                            render_target_index: parseInt(idx),
                            render_target_name: rt.name,
                            first_usage_node_index: rt.firstUsedAtNode
                        }
                    );
                    continue;
                }

                if (!(rt.lastUsedAtNode in nodes)) {
                    addIssue("ERROR", "INVALID_LAST_USAGE",
                        `Render target '${rt.name}' (RT#${idx}) has invalid last usage node index ${rt.lastUsedAtNode}`,
                        {
                            render_target_index: parseInt(idx),
                            render_target_name: rt.name,
                            last_usage_node_index: rt.lastUsedAtNode
                        }
                    );
                    continue;
                }

                // Collect all reader nodes sorted by execution order
                const readers = rt.inputToNodes
                    .filter(n => n in nodes)
                    .sort((a, b) => nodes[a].executionOrder - nodes[b].executionOrder);

                // Collect all writer nodes sorted by execution order
                const writers = rt.outputFromNodes
                    .filter(n => n in nodes)
                    .sort((a, b) => nodes[a].executionOrder - nodes[b].executionOrder);

                if (readers.length === 0) continue;

                // For each reader, check if a compatible writer exists before it
                for (const readerIdx of readers) {
                    const readerNode = nodes[readerIdx];
                    const readerConds = getEffectiveConditions(readerNode, renderPasses);

                    // Find any writer that can coexecute with this reader
                    // AND runs before it in execution order
                    const hasCompatiblePriorWriter = writers.some(writerIdx => {
                        if (writerIdx === readerIdx) return false; // same node can both read+write
                        const writerNode = nodes[writerIdx];
                        if (writerNode.executionOrder >= readerNode.executionOrder) return false;
                        const writerConds = getEffectiveConditions(writerNode, renderPasses);
                        return canCoexecute(readerConds, writerConds);
                    });

                    // Also check if the reader node itself writes (read-write)
                    const readerAlsoWrites = rt.outputFromNodes.includes(readerIdx);

                    if (!hasCompatiblePriorWriter && !readerAlsoWrites) {
                        // Check if there's any compatible writer at all (even after)
                        const hasAnyCompatibleWriter = writers.some(writerIdx => {
                            const writerNode = nodes[writerIdx];
                            const writerConds = getEffectiveConditions(writerNode, renderPasses);
                            return canCoexecute(readerConds, writerConds);
                        });

                        if (hasAnyCompatibleWriter) {
                            const condSuffix = formatConditionsSuffix(readerConds.length > 0 ? readerConds : null);
                            addIssue("ERROR", "READ_BEFORE_WRITE",
                                `Render target '${rt.name}' (RT#${idx}) is read by node '${readerNode.name}' before any compatible writer in the same execution path${condSuffix}`,
                                {
                                    render_target_index: parseInt(idx),
                                    render_target_name: rt.name,
                                    active_conditions: readerConds.length > 0 ? readerConds : null,
                                    reader_node: {
                                        index: readerIdx,
                                        name: readerNode.name,
                                        execution_order: readerNode.executionOrder,
                                        conditions: readerNode.conditions
                                    }
                                }
                            );
                        }
                        // If no compatible writer exists at all, this reader is on a
                        // mutually exclusive path from all writers — not a read-before-write,
                        // just a condition-path where this RT isn't written.
                        break; // Only flag the first problematic reader per RT
                    }
                }
            }
        }
    }

    /**
     * Determine the access type for a node's usage of a render target.
     * Checks shader bindings, explicit I/O, and attachment relationships.
     *
     * @param {Object} rt - Analyzed render target
     * @param {number} nodeIdx - Node index
     * @param {Object} node - Node object
     * @returns {string} "read", "write", or "read_write"
     */
    function getNodeAccessType(rt, nodeIdx, node) {
        const isInput = rt.inputToNodes.includes(nodeIdx);
        const isOutput = rt.outputFromNodes.includes(nodeIdx);

        // Check shader binding types for more detail
        const usageTypes = rt.nodeUsageTypes[nodeIdx] || [];
        const hasReadWriteBinding = usageTypes.some(u =>
            u.type === 'shader_binding' && u.bindingType === 'input_output'
        );
        if (hasReadWriteBinding) return "read_write";

        if (isInput && isOutput) return "read_write";
        if (isOutput) return "write";
        return "read";
    }

    /**
     * Get the image state for a node's usage of a render target, considering
     * both attachment state and shader resource state.
     *
     * @param {Object} rt - Analyzed render target
     * @param {number} nodeIdx - Node index
     * @param {Object} node - Node object
     * @param {string} accessType - "read", "write", or "read_write"
     * @returns {Object|null} { layout, stage, source } where source is "attachment" or "shader_resource"
     */
    function getNodeImageState(rt, nodeIdx, node, accessType) {
        // Check if this RT is used as a render pass attachment for this node
        const usageTypes = rt.nodeUsageTypes[nodeIdx] || [];

        for (const usage of usageTypes) {
            if (usage.type === 'color_attachment') {
                const state = getAttachmentImageState("color");
                return { ...state, source: "attachment" };
            }
            if (usage.type === 'depth_attachment') {
                const state = getAttachmentImageState("depth");
                return { ...state, source: "attachment" };
            }
            if (usage.type === 'resolve_attachment' || usage.type === 'msaa_resolve_target') {
                const state = getAttachmentImageState("resolve");
                return { ...state, source: "attachment" };
            }
        }

        // Otherwise it's a shader resource or transfer target
        const state = getExpectedImageState(node.type, accessType);
        if (state) {
            return { ...state, source: "shader_resource" };
        }

        return null;
    }

    /**
     * Check for resource transition issues using layout-aware state simulation.
     *
     * Detects missing usage flags, wasted writes, and same-pass conflicts.
     * Condition-aware: skips issues between mutually exclusive execution paths.
     */
    function checkResourceBarriers(renderTargets, nodes, renderPasses, addIssue) {
        for (const [rtIdx, rt] of Object.entries(renderTargets)) {
            // Collect all nodes that use this RT, sorted by execution order
            const usageNodes = [...new Set([...rt.inputToNodes, ...rt.outputFromNodes])]
                .filter(n => n in nodes)
                .sort((a, b) => nodes[a].executionOrder - nodes[b].executionOrder);

            if (usageNodes.length < 2) continue;

            let prevState = null;    // { layout, stage, source }
            let prevAccess = null;   // "read", "write", "read_write"
            let prevNodeIdx = null;

            for (const nodeIdx of usageNodes) {
                const node = nodes[nodeIdx];
                const accessType = getNodeAccessType(rt, nodeIdx, node);
                const imageState = getNodeImageState(rt, nodeIdx, node, accessType);

                if (!imageState) {
                    // Node type has no barrier model (viewport, set_depth_bias).
                    // Don't reset prev state - these nodes don't modify image layouts.
                    continue;
                }

                if (prevState !== null && prevNodeIdx !== null) {
                    const prevNode = nodes[prevNodeIdx];
                    const layoutChanged = prevState.layout !== imageState.layout;
                    const stageChanged = prevState.stage !== imageState.stage;
                    const prevIsWrite = prevAccess === "write" || prevAccess === "read_write";
                    const currIsWrite = accessType === "write" || accessType === "read_write";
                    const currIsRead = accessType === "read" || accessType === "read_write";
                    const sameRenderPass = node.renderPassIndex !== null &&
                                           node.renderPassIndex === prevNode.renderPassIndex;

                    const transitionDetails = {
                        render_target_index: parseInt(rtIdx),
                        render_target_name: rt.name,
                        from: {
                            node_index: prevNodeIdx,
                            node_name: prevNode.name,
                            node_type: prevNode.getTypeName(),
                            access: prevAccess,
                            layout: prevState.layout,
                            stage: prevState.stage,
                            source: prevState.source,
                            render_pass_index: prevNode.renderPassIndex
                        },
                        to: {
                            node_index: nodeIdx,
                            node_name: node.name,
                            node_type: node.getTypeName(),
                            access: accessType,
                            layout: imageState.layout,
                            stage: imageState.stage,
                            source: imageState.source,
                            render_pass_index: node.renderPassIndex
                        }
                    };

                    // Skip issues between nodes that can never run in the same frame
                    const prevConds = getEffectiveConditions(prevNode, renderPasses);
                    const currConds = getEffectiveConditions(node, renderPasses);
                    const coexecute = canCoexecute(prevConds, currConds);
                    const combinedConds = coexecute ? getCombinedConditions(prevConds, currConds) : null;
                    const condSuffix = formatConditionsSuffix(combinedConds);

                    // Write-after-write detection (redundant work, not a Vulkan hazard —
                    // the engine handles all barriers via per-image currentAccessState_ tracking)
                    if (coexecute && prevIsWrite && currIsWrite && !sameRenderPass) {
                        const prevIsClear = prevNode.type === CLEAR_IMAGES_NODE;
                        const currIsClear = node.type === CLEAR_IMAGES_NODE;
                        const currIsViewport = node.type === VIEWPORT_NODE;
                        const prevIsViewport = prevNode.type === VIEWPORT_NODE;

                        const details = combinedConds
                            ? { ...transitionDetails, active_conditions: combinedConds }
                            : transitionDetails;

                        if (currIsViewport || prevIsViewport) {
                            // Viewport nodes don't actually write image data, skip
                        } else if (prevIsClear) {
                            // Clear followed by write is normal workflow, skip
                        } else if (currIsClear) {
                            addIssue("WARNING", "WRITE_THEN_CLEAR",
                                `RT '${rt.name}': written by '${prevNode.name}' then immediately cleared by '${node.name}' (previous write is wasted)${condSuffix}`,
                                details
                            );
                        } else {
                            addIssue("WARNING", "REDUNDANT_WRITE",
                                `RT '${rt.name}': written by '${prevNode.name}' then overwritten by '${node.name}' without intermediate read (first write is wasted)${condSuffix}`,
                                details
                            );
                        }
                    }

                    // Check usage flag requirements for transfer operations
                    if (imageState.layout === IMAGE_LAYOUT.TRANSFER_SRC_OPTIMAL) {
                        if (!(rt.usage & USAGE_BITS.TRANSFER_SRC)) {
                            addIssue("ERROR", "MISSING_TRANSFER_SRC_FLAG",
                                `RT '${rt.name}' used as transfer source by node '${node.name}' but lacks TRANSFER_SRC usage flag`,
                                transitionDetails
                            );
                        }
                    }
                    if (imageState.layout === IMAGE_LAYOUT.TRANSFER_DST_OPTIMAL) {
                        if (!(rt.usage & USAGE_BITS.TRANSFER_DST)) {
                            addIssue("ERROR", "MISSING_TRANSFER_DST_FLAG",
                                `RT '${rt.name}' used as transfer destination by node '${node.name}' but lacks TRANSFER_DST usage flag`,
                                transitionDetails
                            );
                        }
                    }

                    // Read-write conflict within the same render pass
                    // (within a render pass, no layout transitions happen — the engine
                    //  only inserts barriers between passes, not between nodes in a pass)
                    if (sameRenderPass && prevIsWrite && currIsRead &&
                        prevState.source === "attachment" && imageState.source === "shader_resource") {
                        const passDetails = combinedConds
                            ? { ...transitionDetails, active_conditions: combinedConds }
                            : transitionDetails;
                        addIssue("WARNING", "SAME_PASS_READ_WRITE",
                            `RT '${rt.name}' is written as attachment and read as shader resource within the same render pass '${prevNode.renderPass}' by nodes '${prevNode.name}' -> '${node.name}'${condSuffix}`,
                            passDetails
                        );
                    }

                    // Note: layout/stage transitions between passes are NOT flagged here.
                    // The engine handles all barriers automatically via vk::image::createImageMemoryBarrier()
                    // which tracks currentAccessState_ per image and generates VkImageMemoryBarrier2
                    // from current->needed state in each node's create_memory_barriers().
                }

                prevState = imageState;
                prevAccess = accessType;
                prevNodeIdx = nodeIdx;
            }
        }
    }

    /**
     * Check proper mipmap generation and usage
     */
    function checkMipmapGeneration(nodes, renderTargets, addIssue) {
        // Find nodes that generate mipmaps
        const mipmapGenerators = {};
        for (const [nodeIdx, node] of Object.entries(nodes)) {
            if (node.type === GENERATE_MIP_CHAIN_NODE) {
                for (const inputIdx of node.inputs) {
                    if (inputIdx >= 0 && inputIdx in renderTargets) {
                        mipmapGenerators[inputIdx] = parseInt(nodeIdx);
                    }
                }
            }
        }

        // Check all render targets with mip levels > 1
        for (const [rtIdx, rt] of Object.entries(renderTargets)) {
            if (rt.mipLevels > 1) {
                // Check if this RT has a mipmap generator
                if (!(rtIdx in mipmapGenerators)) {
                    addIssue("WARNING", "MISSING_MIPMAP_GENERATION",
                        `Render target '${rt.name}' (RT#${rtIdx}) has ${rt.mipLevels} mip levels but no mipmap generation node`,
                        {
                            render_target_index: parseInt(rtIdx),
                            render_target_name: rt.name,
                            mip_levels: rt.mipLevels
                        }
                    );
                }

                // Check if mipmaps are generated too early
                if (rtIdx in mipmapGenerators) {
                    const generatorNodeIdx = mipmapGenerators[rtIdx];
                    const generatorNode = nodes[generatorNodeIdx];

                    // Find nodes that write to this RT after mipmap generation
                    const lateWriters = [];
                    for (const outputNodeIdx of rt.outputFromNodes) {
                        if (outputNodeIdx in nodes) {
                            const outputNode = nodes[outputNodeIdx];
                            if (outputNode.executionOrder > generatorNode.executionOrder) {
                                lateWriters.push(outputNodeIdx);
                            }
                        }
                    }

                    if (lateWriters.length > 0) {
                        addIssue("ERROR", "INVALID_MIPMAP_GENERATION_ORDER",
                            `Mipmap generation for '${rt.name}' (RT#${rtIdx}) occurs before all writes are complete`,
                            {
                                render_target_index: parseInt(rtIdx),
                                render_target_name: rt.name,
                                mipmap_generator: {
                                    index: generatorNodeIdx,
                                    name: generatorNode.name,
                                    execution_order: generatorNode.executionOrder
                                },
                                late_writers: lateWriters.map(writerIdx => ({
                                    index: writerIdx,
                                    name: nodes[writerIdx].name,
                                    execution_order: nodes[writerIdx].executionOrder
                                }))
                            }
                        );
                    }
                }
            }
        }
    }

    /**
     * Identify render targets that could share memory through aliasing
     */
    function checkResourceAliasingOpportunities(renderTargets, nodes, addIssue) {
        // Group render targets by format and size
        const rtByFormatSize = {};

        for (const [rtIdx, rt] of Object.entries(renderTargets)) {
            // Skip render targets that are read and written simultaneously
            const overlapping = rt.inputToNodes.some(n => rt.outputFromNodes.includes(n));
            if (overlapping) {
                continue;
            }

            // Create a key based on format and size
            const key = JSON.stringify([rt.format, rt.extent, rt.sampleCount, rt.mipLevels]);

            if (!(key in rtByFormatSize)) {
                rtByFormatSize[key] = [];
            }
            rtByFormatSize[key].push(parseInt(rtIdx));
        }

        // Find non-overlapping lifetimes among same-format RTs
        for (const rtIndices of Object.values(rtByFormatSize)) {
            if (rtIndices.length < 2) {
                continue;
            }

            // Calculate lifetimes for each RT
            const lifetimes = {};
            for (const rtIdx of rtIndices) {
                const rt = renderTargets[rtIdx];

                // Skip RTs without clear lifetime info
                if (rt.firstUsedAtNode === null || rt.lastUsedAtNode === null) {
                    continue;
                }
                if (!(rt.firstUsedAtNode in nodes) || !(rt.lastUsedAtNode in nodes)) {
                    continue;
                }

                const firstNode = nodes[rt.firstUsedAtNode];
                const lastNode = nodes[rt.lastUsedAtNode];

                lifetimes[rtIdx] = [firstNode.executionOrder, lastNode.executionOrder];
            }

            // Find non-overlapping pairs
            const rtIdxList = Object.keys(lifetimes).map(Number);
            for (let i = 0; i < rtIdxList.length; i++) {
                for (let j = i + 1; j < rtIdxList.length; j++) {
                    const rt1Idx = rtIdxList[i];
                    const rt2Idx = rtIdxList[j];
                    const lifetime1 = lifetimes[rt1Idx];
                    const lifetime2 = lifetimes[rt2Idx];

                    // Check if lifetimes don't overlap
                    if (lifetime1[1] < lifetime2[0] || lifetime2[1] < lifetime1[0]) {
                        const rt1 = renderTargets[rt1Idx];
                        const rt2 = renderTargets[rt2Idx];

                        addIssue("INFO", "ALIASING_OPPORTUNITY",
                            `Render targets '${rt1.name}' (RT#${rt1Idx}) and '${rt2.name}' (RT#${rt2Idx}) have compatible format/size and non-overlapping lifetimes`,
                            {
                                render_target_1: {
                                    index: rt1Idx,
                                    name: rt1.name,
                                    format: rt1.getFormatName(),
                                    lifetime: lifetime1
                                },
                                render_target_2: {
                                    index: rt2Idx,
                                    name: rt2.name,
                                    format: rt2.getFormatName(),
                                    lifetime: lifetime2
                                }
                            }
                        );
                    }
                }
            }
        }
    }

    /**
     * Extract semantic information from a name
     */
    function extractSemantics(name) {
        const lower = name.toLowerCase();
        let clean = lower;

        // Remove common suffixes
        const suffixes = ["_rt", "_in", "_out", "_inout", "_texture", "_buffer", "_map", "_0", "_1", "_2", "_3"];
        for (const suffix of suffixes) {
            if (clean.endsWith(suffix)) {
                clean = clean.slice(0, -suffix.length);
            }
        }

        // Extract space prefix
        let spacePrefix = null;
        for (const prefix of SPACE_PREFIXES) {
            if (clean.startsWith(prefix)) {
                spacePrefix = prefix;
                clean = clean.slice(prefix.length);
                break;
            }
        }

        // Find semantic concepts
        const concepts = SEMANTIC_CONCEPTS.filter(c => clean.includes(c));

        return {
            original: name,
            clean: clean,
            hasSpacePrefix: spacePrefix !== null,
            spacePrefix: spacePrefix,
            concepts: concepts
        };
    }

    /**
     * Check if two semantics are compatible
     */
    function areCompatible(bindingSem, rtSem) {
        // If either has no concepts, we can't make a judgment
        if (bindingSem.concepts.length === 0 || rtSem.concepts.length === 0) {
            return true;
        }

        // Check for any common concepts
        for (const concept of bindingSem.concepts) {
            if (rtSem.concepts.includes(concept)) {
                return true;
            }
        }

        // Check for related concepts
        for (const bindingConcept of bindingSem.concepts) {
            for (const rtConcept of rtSem.concepts) {
                if (bindingConcept in RELATED_CONCEPTS && RELATED_CONCEPTS[bindingConcept].includes(rtConcept)) {
                    return true;
                }
                if (rtConcept in RELATED_CONCEPTS && RELATED_CONCEPTS[rtConcept].includes(bindingConcept)) {
                    return true;
                }
            }
        }

        // Space prefixes should match if both have them
        if (bindingSem.hasSpacePrefix && rtSem.hasSpacePrefix) {
            if (bindingSem.spacePrefix !== rtSem.spacePrefix) {
                return false;
            }
        }

        // If we got here with identified concepts but no matches, they're incompatible
        return false;
    }

    /**
     * Decode a render_target_index encoded value to its components.
     * Encoding: (flags << 24) | (access << 16) | localIndex
     */
    function decodeRTIndexValue(value) {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0x10000) {
            return null;
        }
        const INDEX_MASK  = 0x0000FFFF;
        const ACCESS_MASK = 0x00FF0000;

        const localIndex = value & INDEX_MASK;
        const access = (value & ACCESS_MASK) >>> 16;

        if (access < BINDING_ACCESS.READ || access > BINDING_ACCESS.READ_WRITE) {
            return null;
        }

        let bindingType = null;
        if (access === BINDING_ACCESS.READ) bindingType = "input";
        else if (access === BINDING_ACCESS.WRITE) bindingType = "output";
        else if (access === BINDING_ACCESS.READ_WRITE) bindingType = "input_output";

        return { localIndex, bindingType };
    }

    /**
     * Check if shader bindings are connected to semantically appropriate render targets
     */
    function checkShaderBindingNamingConsistency(nodes, renderTargets, rawData, addIssue) {
        const rtCount = Object.keys(renderTargets).length;

        // Process each node
        for (const [nodeIdx, node] of Object.entries(nodes)) {
            // Get data_json from the original raw data
            let dataJson = node.dataJson || {};

            // If dataJson is empty, try to get from raw data
            if (Object.keys(dataJson).length === 0 && rawData && rawData.nodeDataDescriptions) {
                for (const nodeDesc of rawData.nodeDataDescriptions) {
                    if (nodeDesc.nodeIndex === parseInt(nodeIdx) && nodeDesc.dataJson) {
                        dataJson = nodeDesc.dataJson;
                        break;
                    }
                }
            }

            // Skip if no data_json
            if (Object.keys(dataJson).length === 0) {
                continue;
            }

            // Process each key-value pair in dataJson
            for (const [bindingName, value] of Object.entries(dataJson)) {
                const decoded = decodeRTIndexValue(value);
                if (!decoded) continue;

                const rtIdx = decoded.localIndex;
                const bindingType = decoded.bindingType;

                if (rtIdx >= rtCount || !(rtIdx in renderTargets)) continue;

                const rt = renderTargets[rtIdx];
                const bindingSemantics = extractSemantics(bindingName);
                const rtSemantics = extractSemantics(rt.name);

                // If both have identified semantic concepts but they're incompatible
                if (bindingSemantics.concepts.length > 0 && rtSemantics.concepts.length > 0 && !areCompatible(bindingSemantics, rtSemantics)) {
                    addIssue("ERROR", "SEMANTIC_MISMATCH",
                        `Shader binding '${bindingName}' (concepts: ${bindingSemantics.concepts.join(', ')}) appears to be misconnected to '${rt.name}' (concepts: ${rtSemantics.concepts.join(', ')})`,
                        {
                            node_index: parseInt(nodeIdx),
                            node_name: node.name,
                            binding_name: bindingName,
                            binding_type: bindingType,
                            binding_concepts: bindingSemantics.concepts,
                            binding_space: bindingSemantics.spacePrefix,
                            render_target_index: rtIdx,
                            render_target_name: rt.name,
                            render_target_concepts: rtSemantics.concepts,
                            render_target_space: rtSemantics.spacePrefix
                        }
                    );
                }
                // Check for coordinate space mismatches
                else if (bindingSemantics.hasSpacePrefix && rtSemantics.hasSpacePrefix && bindingSemantics.spacePrefix !== rtSemantics.spacePrefix) {
                    addIssue("WARNING", "COORDINATE_SPACE_MISMATCH",
                        `Shader binding '${bindingName}' uses ${bindingSemantics.spacePrefix} coordinates but is connected to '${rt.name}' which uses ${rtSemantics.spacePrefix} coordinates`,
                        {
                            node_index: parseInt(nodeIdx),
                            node_name: node.name,
                            binding_name: bindingName,
                            binding_space: bindingSemantics.spacePrefix,
                            render_target_name: rt.name,
                            render_target_space: rtSemantics.spacePrefix
                        }
                    );
                }
            }
        }
    }

    /**
     * Format issues for display (with summary counts)
     */
    function formatIssuesForView(issues) {
        const errors = issues.filter(i => i.severity === 'ERROR').length;
        const warnings = issues.filter(i => i.severity === 'WARNING').length;
        const infos = issues.filter(i => i.severity === 'INFO').length;

        return {
            total_issues: issues.length,
            errors: errors,
            warnings: warnings,
            infos: infos,
            issues: issues
        };
    }

    // Export for use by other modules
    window.RenderGraphDebugger = {
        runAllChecks,
        formatIssuesForView,
        // Individual checks for testing
        checkUnusedRenderTargets,
        checkIncompleteChains,
        checkUnusedNodes,
        checkRenderPassConsistency,
        checkFormatCompatibility,
        checkMissingReferences,
        checkRenderTargetFormatCompatibility,
        checkRenderTargetUsageFlags,
        checkRenderPassSampleCountConsistency,
        checkNodeIOValidity,
        checkRTMemoryRequirements,
        checkMSAAResolveCompatibility,
        checkRenderTargetLifetime,
        checkResourceBarriers,
        checkMipmapGeneration,
        checkResourceAliasingOpportunities,
        checkShaderBindingNamingConsistency,
        // Helper functions
        extractSemantics,
        areCompatible,
        getNodeAccessType,
        getNodeImageState,
        getEffectiveConditions,
        canCoexecute,
        getCombinedConditions
    };

})();
