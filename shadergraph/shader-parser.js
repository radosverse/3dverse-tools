// shader-parser.js - Core parsing logic for shader function extraction
// Migrated from shadergraph_analyzer.py
// Phase 6: Added robust error handling and validation

const SHADER_EXTENSIONS = ['.glsl', '.rchit', '.rgen', '.rmiss', '.slang'];

const PATTERNS = {
    blockComment: /\/\*[\s\S]*?\*\//g,
    lineComment: /\/\/.*$/gm,
    moduleNS: /(\w+)::NS/,
    // Match function signature: return_type function_name(params) {
    // Multiline for params that span lines
    function: /^(\w+)\s+(\w+)\s*\(([\s\S]*?)\)\s*\{/gm
};

// Known GLSL/Slang return types for validation
const VALID_RETURN_TYPES = new Set([
    'void', 'bool', 'int', 'uint', 'float', 'double',
    'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4',
    'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4',
    'dvec2', 'dvec3', 'dvec4', 'mat2', 'mat3', 'mat4',
    'mat2x2', 'mat2x3', 'mat2x4', 'mat3x2', 'mat3x3', 'mat3x4',
    'mat4x2', 'mat4x3', 'mat4x4', 'sampler2D', 'sampler3D',
    'samplerCube', 'sampler2DShadow', 'samplerCubeShadow',
    'sampler2DArray', 'sampler2DArrayShadow', 'isampler2D',
    'isampler3D', 'isamplerCube', 'usampler2D', 'usampler3D',
    'usamplerCube', 'image2D', 'image3D', 'imageCube'
]);

// Reserved GLSL/Slang keywords that cannot be function names
const RESERVED_KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default',
    'break', 'continue', 'return', 'discard', 'struct', 'layout',
    'in', 'out', 'inout', 'uniform', 'buffer', 'shared', 'const',
    'attribute', 'varying', 'precision', 'highp', 'mediump', 'lowp',
    'true', 'false', 'main'
]);

class ShaderParser {
    constructor() {
        this.functions = {};
        this.dependencies = {};
        this.modules = {};
        this.function_modules = {};
        this.submodules = {};
        this.module_hierarchy = {};
        // Store function bodies for dependency analysis (Phase 2)
        this.functionBodies = {};
        // Track parsing errors/warnings
        this.parseWarnings = [];
    }

    /**
     * Remove comments from shader content
     * @param {string} content - Raw shader file content
     * @returns {string} Content with comments removed
     */
    removeComments(content) {
        // Remove /* */ block comments first
        let cleaned = content.replace(PATTERNS.blockComment, '');
        // Remove // line comments
        cleaned = cleaned.replace(PATTERNS.lineComment, '');
        return cleaned;
    }

    /**
     * Extract module name from content or file path
     * Priority: NS keyword in content > folder name
     * @param {string} content - Shader content (comments removed)
     * @param {string} filePath - Relative file path
     * @returns {{name: string, source: string}}
     */
    extractModule(content, filePath) {
        // Check for module::NS pattern in content
        const nsMatch = content.match(PATTERNS.moduleNS);
        if (nsMatch) {
            return {
                name: nsMatch[1],
                source: 'NS_PREFIX'
            };
        }

        // Fall back to folder name
        // Handle both / and \ path separators
        const parts = filePath.replace(/\\/g, '/').split('/');
        // Get parent folder (second to last part)
        const folderName = parts.length > 1 ? parts[parts.length - 2] : parts[0];

        return {
            name: folderName,
            source: 'FOLDER_STRUCTURE'
        };
    }

    /**
     * Extract function module from function name
     * Pattern: prefix_NS_functionName -> prefix is the function_module
     * @param {string} functionName - Function name
     * @returns {string|null}
     */
    extractFunctionModule(functionName) {
        if (!functionName || !functionName.includes('_NS_')) {
            return null;
        }

        // Get the part before _NS_
        const partsBeforeNS = functionName.split('_NS_')[0];
        return partsBeforeNS || null;
    }

    /**
     * Extract submodule from filename (filename without extension)
     * @param {string} fileName - File name with extension
     * @returns {string}
     */
    extractSubmodule(fileName) {
        const lastDot = fileName.lastIndexOf('.');
        return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
    }

    /**
     * Extract function body using brace counting
     * @param {string} content - Content starting after the opening brace
     * @param {number} startIndex - Index right after the opening {
     * @returns {string} Function body content
     */
    extractFunctionBody(content, startIndex) {
        let braceCount = 1;
        let endIndex = startIndex;

        while (braceCount > 0 && endIndex < content.length) {
            const char = content[endIndex];
            if (char === '{') {
                braceCount++;
            } else if (char === '}') {
                braceCount--;
            }
            endIndex++;
        }

        return content.substring(startIndex, endIndex - 1);
    }

    /**
     * Validate if a return type looks valid
     * @param {string} returnType - The return type to validate
     * @returns {boolean}
     */
    isValidReturnType(returnType) {
        // Check known types
        if (VALID_RETURN_TYPES.has(returnType)) {
            return true;
        }
        // Allow custom struct types (typically PascalCase or snake_case identifiers)
        // Must start with a letter and contain only alphanumeric/underscore
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(returnType)) {
            return true;
        }
        return false;
    }

    /**
     * Validate if a function name is valid (not a reserved keyword)
     * @param {string} functionName - The function name to validate
     * @returns {boolean}
     */
    isValidFunctionName(functionName) {
        if (RESERVED_KEYWORDS.has(functionName)) {
            return false;
        }
        // Must start with a letter or underscore
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(functionName)) {
            return false;
        }
        return true;
    }

    /**
     * Add a warning about a parsing issue
     * @param {string} fileName - File where the issue occurred
     * @param {string} message - Warning message
     */
    addWarning(fileName, message) {
        this.parseWarnings.push({
            file: fileName,
            message: message,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Parse a single shader file and extract functions
     * Includes robust error handling for malformed files
     * @param {string} content - Raw file content
     * @param {string} filePath - Relative file path (e.g., "shaders/light/light.glsl")
     * @param {string} fileName - File name (e.g., "light.glsl")
     * @returns {{success: boolean, functionsFound: number, warnings: string[]}}
     */
    parseFile(content, filePath, fileName) {
        const result = {
            success: true,
            functionsFound: 0,
            warnings: []
        };

        // Validate input
        if (!content || typeof content !== 'string') {
            result.success = false;
            result.warnings.push('Empty or invalid file content');
            this.addWarning(fileName, 'Empty or invalid file content');
            return result;
        }

        // Check for binary content (non-text files accidentally included)
        if (/[\x00-\x08\x0E-\x1F]/.test(content.substring(0, 1000))) {
            result.success = false;
            result.warnings.push('File appears to be binary, not a text shader file');
            this.addWarning(fileName, 'File appears to be binary');
            return result;
        }

        try {
            // Remove comments
            const cleanContent = this.removeComments(content);

            // Extract module info
            const moduleInfo = this.extractModule(cleanContent, filePath);
            const moduleName = moduleInfo.name;
            const moduleSource = moduleInfo.source;

            // Validate module name
            if (!moduleName || moduleName === '' || moduleName === '.') {
                result.warnings.push(`Could not determine module name, using filename`);
                this.addWarning(fileName, 'Could not determine module name');
            }

            // Extract submodule from filename
            const submodule = this.extractSubmodule(fileName);

            // Track submodule for this module
            if (!this.submodules[moduleName]) {
                this.submodules[moduleName] = [];
            }
            if (!this.submodules[moduleName].includes(submodule)) {
                this.submodules[moduleName].push(submodule);
            }

            // Initialize module tracking
            if (!this.modules[moduleName]) {
                this.modules[moduleName] = [];
            }

            // Find all function definitions
            // Reset regex lastIndex for fresh matching
            PATTERNS.function.lastIndex = 0;

            let match;
            let functionsInFile = 0;
            const maxFunctionsPerFile = 1000; // Safety limit

            while ((match = PATTERNS.function.exec(cleanContent)) !== null) {
                // Safety check for runaway regex
                if (functionsInFile >= maxFunctionsPerFile) {
                    result.warnings.push(`Reached maximum function limit (${maxFunctionsPerFile}), file may be malformed`);
                    this.addWarning(fileName, `Reached maximum function limit`);
                    break;
                }

                const returnType = match[1];
                const functionName = match[2];
                const params = match[3].trim();

                // Validate return type
                if (!this.isValidReturnType(returnType)) {
                    // This might be a false positive match (e.g., macro or preprocessor)
                    result.warnings.push(`Skipping potential false positive: "${returnType} ${functionName}" - unknown return type`);
                    continue;
                }

                // Validate function name
                if (!this.isValidFunctionName(functionName)) {
                    result.warnings.push(`Skipping reserved keyword or invalid function name: "${functionName}"`);
                    continue;
                }

                // Check for duplicate function names
                if (this.functions[functionName]) {
                    result.warnings.push(`Duplicate function "${functionName}" found, overwriting previous definition from ${this.functions[functionName].file_name}`);
                    this.addWarning(fileName, `Duplicate function: ${functionName}`);
                }

                // Extract function module from function name
                let functionModule = this.extractFunctionModule(functionName);
                if (!functionModule) {
                    functionModule = 'undefined';
                }

                // Build the code string (signature line with opening brace)
                const codeMatch = match[0];

                // Store function info
                this.functions[functionName] = {
                    module: moduleName,
                    submodule: submodule,
                    module_source: moduleSource,
                    function_module: functionModule,
                    file_path: filePath,
                    file_name: fileName,
                    is_public: false, // Default to private, Phase 3 will update
                    indent: 0,
                    code: codeMatch,
                    return_type: returnType,
                    params: params
                };

                // Add to module tracking
                if (!this.modules[moduleName].includes(functionName)) {
                    this.modules[moduleName].push(functionName);
                }

                // Add to function_module tracking
                if (!this.function_modules[functionModule]) {
                    this.function_modules[functionModule] = [];
                }
                if (!this.function_modules[functionModule].includes(functionName)) {
                    this.function_modules[functionModule].push(functionName);
                }

                // Extract and store function body for Phase 2 dependency detection
                try {
                    const bodyStartIndex = match.index + match[0].length;
                    const body = this.extractFunctionBody(cleanContent, bodyStartIndex);
                    this.functionBodies[functionName] = body;
                } catch (bodyError) {
                    result.warnings.push(`Could not extract body for function "${functionName}": ${bodyError.message}`);
                    this.functionBodies[functionName] = ''; // Empty body to continue
                }

                functionsInFile++;
            }

            result.functionsFound = functionsInFile;

        } catch (error) {
            result.success = false;
            result.warnings.push(`Parse error: ${error.message}`);
            this.addWarning(fileName, `Parse error: ${error.message}`);
        }

        return result;
    }

    /**
     * Get the parsing result in the expected format
     * Compatible with processData() in data.js
     * @returns {Object}
     */
    getResult() {
        return {
            functions: this.functions,
            dependencies: this.dependencies,
            modules: this.modules,
            function_modules: this.function_modules,
            submodules: this.submodules,
            module_hierarchy: this.module_hierarchy
        };
    }

    /**
     * Get statistics about parsed data
     * @returns {Object}
     */
    getStats() {
        const funcCount = Object.keys(this.functions).length;
        const moduleCount = Object.keys(this.modules).length;
        const funcModuleCount = Object.keys(this.function_modules).length;
        const submoduleCount = Object.values(this.submodules).reduce((acc, arr) => acc + arr.length, 0);
        const depCallerCount = Object.keys(this.dependencies).length;
        const depTotalCount = Object.values(this.dependencies).reduce((acc, arr) => acc + arr.length, 0);

        return {
            functions: funcCount,
            modules: moduleCount,
            functionModules: funcModuleCount,
            submodules: submoduleCount,
            dependencyCallers: depCallerCount,
            dependencyTotal: depTotalCount
        };
    }

    /**
     * Reset parser state for a fresh parse
     */
    reset() {
        this.functions = {};
        this.dependencies = {};
        this.modules = {};
        this.function_modules = {};
        this.submodules = {};
        this.module_hierarchy = {};
        this.functionBodies = {};
        this.parseWarnings = [];
    }

    /**
     * Get all parsing warnings
     * @returns {Array<{file: string, message: string, timestamp: string}>}
     */
    getWarnings() {
        return this.parseWarnings;
    }

    /**
     * Find all dependencies - second pass analysis
     * Must be called after all files are parsed (all functions known)
     * Scans each function body for calls to other known functions
     */
    findAllDependencies() {
        const allFunctionNames = Object.keys(this.functions);

        for (const [caller, body] of Object.entries(this.functionBodies)) {
            const deps = this.findFunctionCalls(caller, body, allFunctionNames);
            if (deps.length > 0) {
                this.dependencies[caller] = deps;
            }
        }
    }

    /**
     * Find function calls within a function body
     * @param {string} callerFunction - Name of the calling function
     * @param {string} functionBody - Body content of the calling function
     * @param {string[]} allFunctionNames - All known function names
     * @returns {string[]} Array of called function names
     */
    findFunctionCalls(callerFunction, functionBody, allFunctionNames) {
        const dependencies = [];

        for (const funcName of allFunctionNames) {
            // Skip self-references
            if (funcName === callerFunction) {
                continue;
            }

            // Pattern: function_name followed by ( with optional whitespace
            // Uses word boundary to avoid partial matches
            const pattern = new RegExp('\\b' + this.escapeRegex(funcName) + '\\s*\\(');
            if (pattern.test(functionBody)) {
                dependencies.push(funcName);
            }
        }

        return dependencies;
    }

    /**
     * Escape special regex characters in a string
     * @param {string} str - String to escape
     * @returns {string} Escaped string safe for use in regex
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Process a .3dverse.json config file to determine public/private function status
     * Marks functions as public if their file is listed in the "exports" field
     * @param {string} configContent - JSON content of the config file
     * @param {string} moduleName - Name of the module this config belongs to
     */
    processConfig(configContent, moduleName) {
        let config;
        try {
            config = JSON.parse(configContent);
        } catch (error) {
            console.warn(`Invalid JSON in config for module ${moduleName}: ${error.message}`);
            return;
        }

        // Primary: check exports field (files whose functions become public)
        if (config.exports) {
            let exportFiles = config.exports;
            // Handle both string and array formats
            if (typeof exportFiles === 'string') {
                exportFiles = [exportFiles];
            }

            // Mark functions from exported files as public
            for (const [funcName, funcInfo] of Object.entries(this.functions)) {
                // Check if the function belongs to this module
                if (funcInfo.module === moduleName) {
                    // Check if the function's file is in exports
                    if (exportFiles.includes(funcInfo.file_name)) {
                        funcInfo.is_public = true;
                        funcInfo.export_reason = `file ${funcInfo.file_name} exported`;
                    }
                }
            }
        }
        // Fallback: check public field (legacy format - explicit function names)
        else if (config.public) {
            let publicFunctions = config.public;
            // Handle both string and array formats
            if (typeof publicFunctions === 'string') {
                publicFunctions = [publicFunctions];
            }

            for (const funcName of publicFunctions) {
                if (this.functions[funcName] && this.functions[funcName].module === moduleName) {
                    this.functions[funcName].is_public = true;
                    this.functions[funcName].export_reason = 'explicitly listed';
                }
            }
        }
    }

    /**
     * Get public/private statistics
     * @returns {{public: number, private: number}}
     */
    getPublicPrivateStats() {
        let publicCount = 0;
        let privateCount = 0;

        for (const funcInfo of Object.values(this.functions)) {
            if (funcInfo.is_public) {
                publicCount++;
            } else {
                privateCount++;
            }
        }

        return { public: publicCount, private: privateCount };
    }

    /**
     * Validate the overall parsing result
     * @returns {{valid: boolean, issues: string[]}}
     */
    validateResult() {
        const issues = [];

        // Check if any functions were found
        if (Object.keys(this.functions).length === 0) {
            issues.push('No functions were found in any of the shader files');
        }

        // Check for orphaned dependencies
        for (const [caller, callees] of Object.entries(this.dependencies)) {
            if (!this.functions[caller]) {
                issues.push(`Dependency caller "${caller}" not found in functions`);
            }
            for (const callee of callees) {
                if (!this.functions[callee]) {
                    issues.push(`Dependency callee "${callee}" (called by ${caller}) not found in functions`);
                }
            }
        }

        // Check for empty modules
        for (const [moduleName, funcs] of Object.entries(this.modules)) {
            if (!funcs || funcs.length === 0) {
                issues.push(`Module "${moduleName}" has no functions`);
            }
        }

        return {
            valid: issues.length === 0,
            issues: issues
        };
    }
}

// Utility function to check if a file is a shader file
function isShaderFile(fileName) {
    return SHADER_EXTENSIONS.some(ext => fileName.toLowerCase().endsWith(ext));
}

// Utility function to check if a file is a config file
function isConfigFile(fileName) {
    return fileName === '.3dverse.json';
}
