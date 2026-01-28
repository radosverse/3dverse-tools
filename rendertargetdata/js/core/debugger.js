// Debugger module - validation checks for render graph analysis
// Port of Python debugger.py to JavaScript

(function() {
    const { USAGE_BITS, ASPECT_BITS, NODE_TYPES, FORMAT_MAP, BINDING_RANGES } = window.RenderGraphConstants;

    // Node type constants for readability (matching Python debugger.py)
    const VIEWPORT_NODE = 0;
    const DRAW_NODE = 1;
    const DYNAMIC_DRAW_NODE = 2;
    const COMPUTE_NODE = 3;
    const BLIT_NODE = 4;
    const DEPTH_STENCIL_BLIT_NODE = 5;
    const FULLSCREEN_PASS_NODE = 8;
    const GENERATE_MIPS_NODE = 9;
    const CLEAR_NODE = 13;
    const CLEAR_POINT_CLOUD_NODE = 15;
    const DEBUG_DRAW_NODE = 16;
    const COMPUTE_DISPATCH_NODE = 17;

    // Format categories for validation
    const COLOR_FORMATS = [37, 44, 76, 91, 97, 109, 122]; // R8, R16G16, R16, RGBA16F, RGB10A2, RGBA8, RGBA16F
    const DEPTH_FORMATS = [124, 126, 130]; // D16, D24S8, D32F

    // System render target indices to ignore
    const SYSTEM_RT_INDICES = [4294967276, 4294967279, 4294967278, 4294967277];

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
        checkRenderTargetLifetime(renderTargets, nodes, addIssue);
        checkResourceBarriers(renderTargets, nodes, addIssue);
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
            // Skip if the node has inputs or outputs
            if (node.inputs.length > 0 || node.outputs.length > 0) {
                continue;
            }

            // Skip some node types that might legitimately have no connections
            if (node.type === VIEWPORT_NODE) {
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
            if (node.type !== BLIT_NODE && node.type !== DEPTH_STENCIL_BLIT_NODE) {
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
                        const severity = (node.type === BLIT_NODE && inputRt.sampleCount > 1 && outputRt.sampleCount === 1)
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
                if (rtIdx >= 0 && !(rtIdx in renderTargets) && !SYSTEM_RT_INDICES.includes(rtIdx)) {
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
                if (rtIdx >= 0 && !(rtIdx in renderTargets) && !SYSTEM_RT_INDICES.includes(rtIdx)) {
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
                    if (node.type === COMPUTE_NODE || node.type === COMPUTE_DISPATCH_NODE) {
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
            if (nodeType === BLIT_NODE || nodeType === DEPTH_STENCIL_BLIT_NODE) {
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
            else if (nodeType === CLEAR_NODE) {
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
            // Check compute nodes
            else if (nodeType === COMPUTE_NODE || nodeType === COMPUTE_DISPATCH_NODE) {
                for (const outputIdx of node.outputs) {
                    if (outputIdx >= 0 && outputIdx in renderTargets) {
                        const rt = renderTargets[outputIdx];
                        if (!(rt.usage & USAGE_BITS.STORAGE)) {
                            addIssue("ERROR", "MISSING_COMPUTE_STORAGE_FLAG",
                                `Compute node '${node.name}' (index ${nodeIdx}) writes to render target '${rt.name}' (RT#${outputIdx}) which lacks STORAGE flag`,
                                {
                                    node_index: parseInt(nodeIdx),
                                    node_name: node.name,
                                    node_type: node.getTypeName(),
                                    render_target_index: outputIdx,
                                    render_target_name: rt.name,
                                    usage_flags: rt.getUsageFlags()
                                }
                            );
                        }
                    }
                }
            }
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
    function checkRenderTargetLifetime(renderTargets, nodes, addIssue) {
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

                const firstNode = nodes[rt.firstUsedAtNode];

                // Check if the first usage is a read
                let isFirstRead = false;
                if (rt.inputToNodes.includes(rt.firstUsedAtNode)) {
                    isFirstRead = true;
                }

                // Also check if it's used as a color or depth attachment but not written to
                if (rt.usedAsColorAttachment.length > 0 || rt.usedAsDepthAttachment.length > 0) {
                    if (!rt.outputFromNodes.includes(rt.firstUsedAtNode)) {
                        isFirstRead = true;
                    }
                }

                if (isFirstRead) {
                    addIssue("ERROR", "READ_BEFORE_WRITE",
                        `Render target '${rt.name}' (RT#${idx}) is first read by node '${firstNode.name}' before being written to`,
                        {
                            render_target_index: parseInt(idx),
                            render_target_name: rt.name,
                            first_usage_node: {
                                index: rt.firstUsedAtNode,
                                name: firstNode.name,
                                execution_order: firstNode.executionOrder,
                                conditions: firstNode.conditions
                            }
                        }
                    );
                }
            }
        }
    }

    /**
     * Check for missing resource barriers between incompatible usages
     */
    function checkResourceBarriers(renderTargets, nodes, addIssue) {
        for (const [rtIdx, rt] of Object.entries(renderTargets)) {
            // Sort nodes using this RT by execution order
            const usageNodes = [...new Set([...rt.inputToNodes, ...rt.outputFromNodes])]
                .filter(n => n in nodes)
                .sort((a, b) => nodes[a].executionOrder - nodes[b].executionOrder);

            let lastUsage = null;
            let lastUsageType = null;

            for (const nodeIdx of usageNodes) {
                const node = nodes[nodeIdx];

                // Determine current usage type
                let currentUsageType = null;
                if (rt.outputFromNodes.includes(nodeIdx)) {
                    currentUsageType = "write";
                } else if (rt.inputToNodes.includes(nodeIdx)) {
                    currentUsageType = "read";
                }

                // Check for write-after-read or read-after-write without barrier
                if (lastUsage !== null && lastUsageType !== currentUsageType) {
                    // Check if nodes are in different render passes
                    if (node.renderPassIndex !== nodes[lastUsage].renderPassIndex) {
                        addIssue("WARNING", "MISSING_RESOURCE_BARRIER",
                            `Potential missing barrier for RT '${rt.name}' between '${nodes[lastUsage].name}' (${lastUsageType}) and '${node.name}' (${currentUsageType})`,
                            {
                                render_target_index: parseInt(rtIdx),
                                render_target_name: rt.name,
                                first_node: {
                                    index: lastUsage,
                                    name: nodes[lastUsage].name,
                                    usage: lastUsageType
                                },
                                second_node: {
                                    index: nodeIdx,
                                    name: node.name,
                                    usage: currentUsageType
                                }
                            }
                        );
                    }
                }

                lastUsage = nodeIdx;
                lastUsageType = currentUsageType;
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
            if (node.type === GENERATE_MIPS_NODE) {
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
     * Check if shader bindings are connected to semantically appropriate render targets
     */
    function checkShaderBindingNamingConsistency(nodes, renderTargets, rawData, addIssue) {
        // Build mapping from binding addresses to render target indices
        const rtCount = Object.keys(renderTargets).length;
        const bindingAddressToRtIndex = {};
        for (let i = 0; i < rtCount; i++) {
            bindingAddressToRtIndex[BINDING_RANGES.READ.start + i] = i;
            bindingAddressToRtIndex[BINDING_RANGES.WRITE.start + i] = i;
            bindingAddressToRtIndex[BINDING_RANGES.READWRITE.start + i] = i;
        }

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
                // Only process values that are in the render target address encoding ranges
                let bindingType = null;
                if (typeof value === 'number') {
                    if (value >= BINDING_RANGES.READ.start && value < BINDING_RANGES.READ.end) {
                        bindingType = "input";
                    } else if (value >= BINDING_RANGES.WRITE.start && value < BINDING_RANGES.WRITE.end) {
                        bindingType = "output";
                    } else if (value >= BINDING_RANGES.READWRITE.start && value < BINDING_RANGES.READWRITE.end) {
                        bindingType = "input_output";
                    }
                }

                if (bindingType) {
                    const rtIdx = bindingAddressToRtIndex[value];
                    if (rtIdx !== undefined && rtIdx in renderTargets) {
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
        areCompatible
    };

})();
