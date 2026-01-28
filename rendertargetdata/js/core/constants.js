// Core constants for render graph structure
// Ported from Python common.py - single source of truth for all mappings

// Format mappings (Vulkan VkFormat values to readable names)
const FORMAT_MAP = {
    37: "R8",
    44: "R16G16",
    76: "R16",
    91: "RGBA16F",
    97: "RGB10A2",
    100: "R32F",
    109: "RGBA8",
    122: "RGBA16F",
    124: "D16",
    126: "D24S8",
    130: "D32F"
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
const NODE_TYPES = {
    0: "Viewport",
    1: "Draw",
    2: "Dynamic Draw",
    3: "Compute",
    4: "Blit",
    5: "Depth/Stencil Blit",
    8: "Fullscreen Pass",
    9: "Generate Mips",
    13: "Clear",
    15: "Clear Point Cloud Buffers",
    16: "Debug Draw",
    17: "Compute Dispatch"
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

// Shader binding address ranges (encoded in dataJson)
const BINDING_RANGES = {
    READ: { start: 0x10000, end: 0x20000 },
    WRITE: { start: 0x20000, end: 0x30000 },
    READWRITE: { start: 0x30000, end: 0x40000 }
};

// Export for use by other modules
window.RenderGraphConstants = {
    FORMAT_MAP,
    USAGE_FLAGS,
    ASPECT_FLAGS,
    NODE_TYPES,
    USAGE_BITS,
    ASPECT_BITS,
    BINDING_RANGES
};
