// Core constants for render graph structure
// Verified against 3dverse engine source (vulkan_core.h, render_graph_description.hpp)

// Format mappings - VkFormat enum values to readable names
// Source: vulkan_core.h VkFormat enum
const FORMAT_MAP = {
    9:   "R8_UNORM",        // VK_FORMAT_R8_UNORM
    37:  "RGBA8_UNORM",     // VK_FORMAT_R8G8B8A8_UNORM
    44:  "BGRA8_UNORM",     // VK_FORMAT_B8G8R8A8_UNORM
    76:  "R16_SFLOAT",      // VK_FORMAT_R16_SFLOAT
    77:  "RG16_UNORM",      // VK_FORMAT_R16G16_UNORM
    91:  "RGBA16_UNORM",    // VK_FORMAT_R16G16B16A16_UNORM
    95:  "RGBA16_UINT",     // VK_FORMAT_R16G16B16A16_UINT
    97:  "RGBA16F",         // VK_FORMAT_R16G16B16A16_SFLOAT
    100: "R32F",            // VK_FORMAT_R32_SFLOAT
    109: "RGBA32F",         // VK_FORMAT_R32G32B32A32_SFLOAT
    122: "B10G11R11_UFLOAT",// VK_FORMAT_B10G11R11_UFLOAT_PACK32
    124: "D16_UNORM",       // VK_FORMAT_D16_UNORM
    126: "D32_SFLOAT",      // VK_FORMAT_D32_SFLOAT
    129: "D24_UNORM_S8",    // VK_FORMAT_D24_UNORM_S8_UINT
    130: "D32_SFLOAT_S8"    // VK_FORMAT_D32_SFLOAT_S8_UINT
};

// Usage flags for render targets (VkImageUsageFlagBits)
const USAGE_FLAGS = {
    1: "TRANSFER_SRC",
    2: "TRANSFER_DST",
    4: "SAMPLED",
    8: "STORAGE",
    16: "COLOR_ATTACHMENT",
    32: "DEPTH_STENCIL_ATTACHMENT",
    64: "TRANSIENT_ATTACHMENT",
    128: "INPUT_ATTACHMENT"
};

// Aspect flags for render targets (VkImageAspectFlagBits)
const ASPECT_FLAGS = {
    1: "COLOR",
    2: "DEPTH",
    4: "STENCIL"
};

// Node type mappings
// Source: frame_node_type enum in render_graph_description.hpp
const NODE_TYPES = {
    0:  "Viewport",
    1:  "Draw Batch",
    2:  "Draw Batch With Materials",
    3:  "Dispatch Compute",
    4:  "Blit Image",
    5:  "Blit Image Pointer To Dst",
    6:  "Copy Image",
    7:  "Resolve Image",
    8:  "Draw Quad",
    9:  "Generate Mip Chain",
    10: "Copy To Cubemap Face",
    13: "Clear Images",
    15: "Fill Buffer",
    16: "Draw Debug Lines",
    17: "Dispatch Decals Compute",
    18: "Set Depth Bias",
    19: "Dispatch Ray Tracing"
};

// Bit constants for direct flag checking
const USAGE_BITS = {
    TRANSFER_SRC: 1,
    TRANSFER_DST: 2,
    SAMPLED: 4,
    STORAGE: 8,
    COLOR_ATTACHMENT: 16,
    DEPTH_STENCIL: 32,
    TRANSIENT: 64,
    INPUT_ATTACHMENT: 128
};

const ASPECT_BITS = {
    COLOR: 1,
    DEPTH: 2,
    STENCIL: 4
};

// Shader binding address encoding (from render_target_index_json.hpp)
// Encoded as: (flags << 24) | (access << 16) | localIndex
// access: read=1, write=2, read_write=3
// flags: is_compute_reference=1
const BINDING_ACCESS = {
    READ: 1,
    WRITE: 2,
    READ_WRITE: 3
};

const BINDING_FLAGS = {
    NONE: 0,
    IS_COMPUTE_REFERENCE: 1
};

// Kept for backward compatibility but decoding should use mask-based approach
const BINDING_RANGES = {
    READ: { start: 0x10000, end: 0x20000 },
    WRITE: { start: 0x20000, end: 0x30000 },
    READWRITE: { start: 0x30000, end: 0x40000 }
};

// System render target indices (from render_graph_description.hpp)
// These are special indices that reference engine-managed targets, not user-defined RTs
const SYSTEM_RT_INDICES = {
    VIEW_RENDER_TARGET: 4294967276,    // UINT32_MAX - 19
    CANVAS_NORMAL_INDEX: 4294967277,   // UINT32_MAX - 18
    CANVAS_PICKING_INDEX: 4294967278,  // UINT32_MAX - 17
    CANVAS_COLOR_INDEX: 4294967279,    // UINT32_MAX - 16
    DEPTH_RENDER_TARGET: 4294967275    // UINT32_MAX - 20
};

const SYSTEM_RT_INDEX_LIST = Object.values(SYSTEM_RT_INDICES);

// Color format codes (for validation - VkFormat values that are color formats)
const COLOR_FORMATS = [9, 37, 44, 76, 77, 91, 95, 97, 100, 109, 122];
// Depth format codes
const DEPTH_FORMATS = [124, 126, 129, 130];

// Vulkan image layouts used by the engine's barrier system
// Source: frame_graph_builder.cpp, node_*.cpp create_memory_barriers()
const IMAGE_LAYOUT = {
    UNDEFINED:                      "UNDEFINED",
    GENERAL:                        "GENERAL",
    COLOR_ATTACHMENT_OPTIMAL:       "COLOR_ATTACHMENT_OPTIMAL",
    DEPTH_STENCIL_ATTACHMENT_OPTIMAL: "DEPTH_STENCIL_ATTACHMENT_OPTIMAL",
    SHADER_READ_ONLY_OPTIMAL:       "SHADER_READ_ONLY_OPTIMAL",
    TRANSFER_SRC_OPTIMAL:           "TRANSFER_SRC_OPTIMAL",
    TRANSFER_DST_OPTIMAL:           "TRANSFER_DST_OPTIMAL",
    PRESENT_SRC:                    "PRESENT_SRC"
};

// Vulkan pipeline stage bits relevant for barrier transitions
// Source: node_*.cpp create_memory_barriers()
const PIPELINE_STAGE = {
    FRAGMENT_SHADER:        "FRAGMENT_SHADER",
    COMPUTE_SHADER:         "COMPUTE_SHADER",
    RAY_TRACING_SHADER:     "RAY_TRACING_SHADER",
    TRANSFER:               "TRANSFER",
    COLOR_ATTACHMENT_OUTPUT: "COLOR_ATTACHMENT_OUTPUT",
    EARLY_FRAGMENT_TESTS:   "EARLY_FRAGMENT_TESTS",
    LATE_FRAGMENT_TESTS:    "LATE_FRAGMENT_TESTS"
};

// Maps frame_node_type to frame_pass_type
// Source: frame_graph_nodes.cpp get_frame_pass_type_for_node_type()
const PASS_TYPE = {
    RENDER:     "render",
    COMPUTE:    "compute",
    RAY_TRACING: "ray_tracing",
    COPY:       "copy",
    BUFFER_OP:  "buffer_op",
    INVALID:    "invalid"
};

// Node type -> pass type mapping (matches engine's get_frame_pass_type_for_node_type)
const NODE_TO_PASS_TYPE = {
    0:  null,               // Viewport - render pass only, no standalone
    1:  PASS_TYPE.RENDER,   // Draw Batch
    2:  PASS_TYPE.RENDER,   // Draw Batch With Materials
    3:  PASS_TYPE.COMPUTE,  // Dispatch Compute
    4:  PASS_TYPE.COPY,     // Blit Image
    5:  PASS_TYPE.COPY,     // Blit Image Pointer To Dst
    6:  PASS_TYPE.COPY,     // Copy Image
    7:  PASS_TYPE.COPY,     // Resolve Image
    8:  PASS_TYPE.RENDER,   // Draw Quad
    9:  PASS_TYPE.COPY,     // Generate Mip Chain
    10: PASS_TYPE.COPY,     // Copy To Cubemap Face
    13: PASS_TYPE.COPY,     // Clear Images
    15: PASS_TYPE.BUFFER_OP,// Fill Buffer
    16: PASS_TYPE.RENDER,   // Draw Debug Lines
    17: PASS_TYPE.COMPUTE,  // Dispatch Decals Compute
    18: null,               // Set Depth Bias - no standalone barrier
    19: PASS_TYPE.RAY_TRACING // Dispatch Ray Tracing
};

/**
 * Get the expected Vulkan image layout and pipeline stage for a given node type
 * and access pattern. Mirrors the engine's create_memory_barriers() per node type.
 *
 * @param {number} nodeType - frame_node_type enum value
 * @param {string} accessType - "read", "write", or "read_write"
 * @returns {Object|null} { layout, stage } or null if node type has no barrier
 */
function getExpectedImageState(nodeType, accessType) {
    const passType = NODE_TO_PASS_TYPE[nodeType];
    if (!passType) return null;

    switch (passType) {
        case PASS_TYPE.RENDER:
            // Graphics nodes: fragment shader stage
            if (accessType === "read") {
                return { layout: IMAGE_LAYOUT.SHADER_READ_ONLY_OPTIMAL, stage: PIPELINE_STAGE.FRAGMENT_SHADER };
            } else {
                return { layout: IMAGE_LAYOUT.GENERAL, stage: PIPELINE_STAGE.FRAGMENT_SHADER };
            }

        case PASS_TYPE.COMPUTE:
            // Compute nodes: compute shader stage
            if (accessType === "read") {
                return { layout: IMAGE_LAYOUT.SHADER_READ_ONLY_OPTIMAL, stage: PIPELINE_STAGE.COMPUTE_SHADER };
            } else {
                return { layout: IMAGE_LAYOUT.GENERAL, stage: PIPELINE_STAGE.COMPUTE_SHADER };
            }

        case PASS_TYPE.RAY_TRACING:
            // Ray tracing: ray tracing shader stage
            if (accessType === "read") {
                return { layout: IMAGE_LAYOUT.SHADER_READ_ONLY_OPTIMAL, stage: PIPELINE_STAGE.RAY_TRACING_SHADER };
            } else {
                return { layout: IMAGE_LAYOUT.GENERAL, stage: PIPELINE_STAGE.RAY_TRACING_SHADER };
            }

        case PASS_TYPE.COPY:
            // Transfer nodes: transfer stage
            if (accessType === "read") {
                return { layout: IMAGE_LAYOUT.TRANSFER_SRC_OPTIMAL, stage: PIPELINE_STAGE.TRANSFER };
            } else {
                return { layout: IMAGE_LAYOUT.TRANSFER_DST_OPTIMAL, stage: PIPELINE_STAGE.TRANSFER };
            }

        default:
            return null;
    }
}

/**
 * Get the expected image state for a render pass attachment.
 * Source: create_render_pass_attachments_memory_barriers() in frame_graph_builder.cpp
 *
 * @param {string} attachmentType - "color", "depth", or "resolve"
 * @returns {Object} { layout, stage }
 */
function getAttachmentImageState(attachmentType) {
    switch (attachmentType) {
        case "color":
            return {
                layout: IMAGE_LAYOUT.COLOR_ATTACHMENT_OPTIMAL,
                stage: PIPELINE_STAGE.COLOR_ATTACHMENT_OUTPUT
            };
        case "resolve":
            return {
                layout: IMAGE_LAYOUT.COLOR_ATTACHMENT_OPTIMAL,
                stage: PIPELINE_STAGE.COLOR_ATTACHMENT_OUTPUT
            };
        case "depth":
            return {
                layout: IMAGE_LAYOUT.DEPTH_STENCIL_ATTACHMENT_OPTIMAL,
                stage: PIPELINE_STAGE.EARLY_FRAGMENT_TESTS
            };
        default:
            return null;
    }
}

// Export for use by other modules
window.RenderGraphConstants = {
    FORMAT_MAP,
    USAGE_FLAGS,
    ASPECT_FLAGS,
    NODE_TYPES,
    USAGE_BITS,
    ASPECT_BITS,
    BINDING_ACCESS,
    BINDING_FLAGS,
    BINDING_RANGES,
    SYSTEM_RT_INDICES,
    SYSTEM_RT_INDEX_LIST,
    COLOR_FORMATS,
    DEPTH_FORMATS,
    IMAGE_LAYOUT,
    PIPELINE_STAGE,
    PASS_TYPE,
    NODE_TO_PASS_TYPE,
    getExpectedImageState,
    getAttachmentImageState
};
