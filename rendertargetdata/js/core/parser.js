// Parser for raw render graph JSON
// Converts raw JSON into typed objects matching Python dataclass behavior

(function() {
    const { FORMAT_MAP, USAGE_FLAGS, ASPECT_FLAGS, NODE_TYPES } = window.RenderGraphConstants;

    /**
     * RenderTarget class - represents a render target in the render graph
     */
    class RenderTarget {
        constructor(index, desc) {
            this.index = index;
            this.name = desc.name || `RT_${index}`;
            this.format = desc.format || 0;
            this.extent = desc.extent || [0, 0, 0];
            this.mipLevels = desc.mipLevels || 1;
            this.sampleCount = desc.sampleCount || 1;
            this.usage = desc.usage || 0;
            this.memoryType = desc.memoryType || 0;
            this.aspect = desc.aspect ?? 1;
            this.samplerType = desc.samplerType ?? null;
            this.memoryUsage = desc.memoryUsage ?? null;
            this.tiling = desc.tiling ?? null;

            // Analysis fields - populated later by analyzer
            this.inputToNodes = [];
            this.outputFromNodes = [];
            this.firstUsedAtNode = null;
            this.lastUsedAtNode = null;
            this.nodeUsageTypes = {};
            this.usedAsColorAttachment = [];
            this.usedAsDepthAttachment = [];
            this.usedAsResolveAttachment = [];
            this.conditions = new Set();
        }

        getFormatName() {
            return FORMAT_MAP[this.format] ?? `Unknown (${this.format})`;
        }

        getUsageFlags() {
            return Object.entries(USAGE_FLAGS)
                .filter(([bit]) => this.usage & parseInt(bit))
                .map(([, name]) => name);
        }

        getAspectFlags() {
            return Object.entries(ASPECT_FLAGS)
                .filter(([bit]) => this.aspect & parseInt(bit))
                .map(([, name]) => name);
        }

        getResolutionDescription() {
            if (this.extent[0] === 0 && this.extent[1] === 0 && this.extent[2] === 0) {
                return { type: "full", x: 1.0, y: 1.0, z: 1.0 };
            } else {
                return {
                    type: "scaled",
                    x: this.extent[0] !== 0 ? this.extent[0] : 1.0,
                    y: this.extent[1] !== 0 ? this.extent[1] : 1.0,
                    z: this.extent[2] !== 0 ? this.extent[2] : 1.0
                };
            }
        }

    }

    /**
     * Node class - represents a node in the render graph
     */
    class Node {
        constructor(index, desc) {
            this.index = index;
            this.name = desc.name || `Node_${index}`;
            this.type = desc.type || 0;
            this.inputs = desc.inputRenderTargetIndices || [];
            this.outputs = desc.outputRenderTargetIndices || [];
            this.conditions = desc.conditions || [];
            this.dataJson = desc.dataJson || {};
            this.executionOrder = -1;
            this.renderPass = null;
            this.renderPassIndex = null;
        }

        getTypeName() {
            return NODE_TYPES[this.type] ?? `Unknown (${this.type})`;
        }

    }

    /**
     * RenderPass class - represents a render pass in the render graph
     */
    class RenderPass {
        constructor(index, desc) {
            this.index = index;
            this.name = desc.name || `RenderPass_${index}`;
            this.nodeIndices = desc.nodeIndices || [];
            this.colorAttachmentIndices = desc.colorAttachmentIndices || [];
            this.depthAttachmentIndex = desc.depthAttachmentIndex ?? null;
            this.resolveAttachmentIndices = desc.resolveAttachmentIndices || [];
            this.conditions = desc.conditions || [];
        }

    }

    /**
     * Parse raw render graph JSON into typed objects
     * @param {Object} data - Raw render graph JSON
     * @returns {Object} Parsed objects { renderTargets, nodes, renderPasses, graphOrder }
     */
    function parseRawRenderGraph(data) {
        const renderTargets = {};
        const nodes = {};
        const renderPasses = {};

        // Parse render targets
        (data.renderTargetDescriptions || []).forEach((desc, i) => {
            renderTargets[i] = new RenderTarget(i, desc);
        });

        // Parse render passes first (needed for node assignment)
        (data.renderPassDescriptions || []).forEach((desc, i) => {
            renderPasses[i] = new RenderPass(i, desc);
        });

        // Parse nodes
        (data.nodeDataDescriptions || []).forEach(desc => {
            const idx = desc.nodeIndex ?? -1;
            if (idx >= 0) {
                nodes[idx] = new Node(idx, desc);

                // Assign render pass membership
                for (const [rpIdx, rp] of Object.entries(renderPasses)) {
                    if (rp.nodeIndices.includes(idx)) {
                        nodes[idx].renderPass = rp.name;
                        nodes[idx].renderPassIndex = parseInt(rpIdx);
                        break;
                    }
                }
            }
        });

        return {
            renderTargets,
            nodes,
            renderPasses,
            graphOrder: data.graphOrder || []
        };
    }

    /**
     * Check if JSON data is a valid raw render graph
     * @param {Object} data - JSON data to validate
     * @returns {Object} { valid: boolean, error: string|null }
     */
    function isValidRawRenderGraph(data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: "Data is not an object" };
        }

        if (!data.renderTargetDescriptions) {
            return { valid: false, error: "Missing renderTargetDescriptions" };
        }

        if (!data.nodeDataDescriptions) {
            return { valid: false, error: "Missing nodeDataDescriptions" };
        }

        if (!Array.isArray(data.renderTargetDescriptions) || data.renderTargetDescriptions.length === 0) {
            return { valid: false, error: "renderTargetDescriptions should be a non-empty array" };
        }

        if (!Array.isArray(data.nodeDataDescriptions) || data.nodeDataDescriptions.length === 0) {
            return { valid: false, error: "nodeDataDescriptions should be a non-empty array" };
        }

        return { valid: true, error: null };
    }

    // Export for use by other modules
    window.RenderGraphParser = {
        RenderTarget,
        Node,
        RenderPass,
        parseRawRenderGraph,
        isValidRawRenderGraph
    };

})();
