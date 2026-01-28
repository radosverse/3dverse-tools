// file-handler.js - Folder upload and file reading coordination
// Works with shader-parser.js to process shader directories in the browser
// Phase 6: Enhanced progress reporting and browser compatibility

/**
 * Browser compatibility information
 */
const BROWSER_SUPPORT = {
    webkitdirectory: null, // Detected at runtime
    fileReader: typeof FileReader !== 'undefined',
    promise: typeof Promise !== 'undefined',
    asyncAwait: true // Assumed if this script loads
};

/**
 * Detect browser and version for compatibility notes
 * @returns {{name: string, version: string, supported: boolean, notes: string[]}}
 */
function detectBrowser() {
    const ua = navigator.userAgent;
    const notes = [];
    let name = 'Unknown';
    let version = '';
    let supported = true;

    if (ua.includes('Chrome')) {
        const match = ua.match(/Chrome\/(\d+)/);
        name = 'Chrome';
        version = match ? match[1] : '';
        if (parseInt(version) >= 49) {
            notes.push('Full support for folder upload');
        }
    } else if (ua.includes('Firefox')) {
        const match = ua.match(/Firefox\/(\d+)/);
        name = 'Firefox';
        version = match ? match[1] : '';
        if (parseInt(version) >= 50) {
            notes.push('Full support for folder upload');
        } else {
            notes.push('Limited folder upload support, consider using Chrome');
            supported = false;
        }
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
        const match = ua.match(/Version\/(\d+)/);
        name = 'Safari';
        version = match ? match[1] : '';
        if (parseInt(version) >= 11) {
            notes.push('Folder upload supported');
        } else {
            notes.push('Folder upload may not work, use JSON upload instead');
            supported = false;
        }
    } else if (ua.includes('Edge')) {
        const match = ua.match(/Edge\/(\d+)/) || ua.match(/Edg\/(\d+)/);
        name = 'Edge';
        version = match ? match[1] : '';
        notes.push('Full support for folder upload');
    } else {
        notes.push('Browser not fully tested, folder upload may not work');
        notes.push('JSON upload is always available as fallback');
        supported = false;
    }

    return { name, version, supported, notes };
}

/**
 * FileHandler class
 * Handles folder upload via webkitdirectory and coordinates parsing
 * Orchestrates the three-pass analysis:
 *   1. Parse all shader files
 *   2. Find dependencies
 *   3. Process .3dverse.json configs
 */
class FileHandler {
    constructor() {
        this.parser = new ShaderParser();
        this.stats = {
            totalFiles: 0,
            shaderFiles: 0,
            configFiles: 0,
            skippedFiles: 0,
            parseErrors: [],
            parseWarnings: [],
            startTime: null,
            endTime: null
        };
        this.abortRequested = false;
    }

    /**
     * Request abort of current processing
     */
    abort() {
        this.abortRequested = true;
    }

    /**
     * Check if a file is a shader file based on extension
     * @param {string} fileName - File name to check
     * @returns {boolean}
     */
    isShaderFile(fileName) {
        return SHADER_EXTENSIONS.some(ext =>
            fileName.toLowerCase().endsWith(ext.toLowerCase())
        );
    }

    /**
     * Check if a file is a config file
     * @param {string} fileName - File name to check
     * @returns {boolean}
     */
    isConfigFile(fileName) {
        return fileName === '.3dverse.json';
    }

    /**
     * Read a file as text using FileReader
     * @param {File} file - File object to read
     * @returns {Promise<string>} File content as text
     */
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsText(file);
        });
    }

    /**
     * Extract module name from a file path
     * The module is the folder containing the file (parent directory)
     * @param {string} path - Relative path (e.g., "shaders/light/light.glsl")
     * @returns {string} Module name (e.g., "light")
     */
    getModuleFromPath(path) {
        // Normalize path separators (handle both / and \)
        const normalizedPath = path.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');

        // Module is the folder containing the file (second to last part)
        // For "shaders/light/light.glsl" -> ["shaders", "light", "light.glsl"] -> "light"
        if (parts.length >= 2) {
            return parts[parts.length - 2];
        }

        // Fallback: file is at root level, no module folder
        return parts[0].replace(/\.[^/.]+$/, ''); // filename without extension
    }

    /**
     * Normalize a file path for consistent handling
     * Converts backslashes to forward slashes
     * Optionally prepends "./" if not present
     * @param {string} path - Raw path
     * @returns {string} Normalized path
     */
    normalizePath(path) {
        let normalized = path.replace(/\\/g, '/');
        // Ensure path starts with "./" for consistency with Python output
        if (!normalized.startsWith('./') && !normalized.startsWith('/')) {
            normalized = './' + normalized;
        }
        return normalized;
    }

    /**
     * Process files from a folder selection input
     * Main entry point for folder upload handling
     * @param {FileList} fileList - Files from input element
     * @param {Function} onProgress - Optional progress callback (processed, total, stage, details)
     * @returns {Promise<Object>} Parsed data in the expected format
     */
    async processFiles(fileList, onProgress = null) {
        // Reset parser and stats for fresh processing
        this.parser.reset();
        this.abortRequested = false;
        this.stats = {
            totalFiles: 0,
            shaderFiles: 0,
            configFiles: 0,
            skippedFiles: 0,
            parseErrors: [],
            parseWarnings: [],
            startTime: Date.now(),
            endTime: null
        };

        // Convert FileList to array and categorize files
        const files = Array.from(fileList);
        this.stats.totalFiles = files.length;

        const shaderFiles = [];
        const configFiles = [];

        // Sort files into shaders and configs
        for (const file of files) {
            if (this.isShaderFile(file.name)) {
                shaderFiles.push(file);
            } else if (this.isConfigFile(file.name)) {
                configFiles.push(file);
            } else {
                this.stats.skippedFiles++;
            }
        }

        this.stats.shaderFiles = shaderFiles.length;
        this.stats.configFiles = configFiles.length;

        let processed = 0;
        const totalToProcess = shaderFiles.length + configFiles.length;

        // Pass 1: Parse all shader files
        for (const file of shaderFiles) {
            // Check for abort request
            if (this.abortRequested) {
                throw new Error('Processing aborted by user');
            }

            try {
                const content = await this.readFile(file);
                const filePath = this.normalizePath(file.webkitRelativePath || file.name);
                const parseResult = this.parser.parseFile(content, filePath, file.name);

                // Collect warnings from parsing
                if (parseResult.warnings && parseResult.warnings.length > 0) {
                    for (const warning of parseResult.warnings) {
                        this.stats.parseWarnings.push({
                            file: file.name,
                            warning: warning
                        });
                    }
                }

                if (!parseResult.success) {
                    this.stats.parseErrors.push({
                        file: file.name,
                        error: parseResult.warnings.join('; ') || 'Unknown parse error'
                    });
                }
            } catch (error) {
                console.warn(`Error parsing shader file ${file.name}:`, error.message);
                this.stats.parseErrors.push({
                    file: file.name,
                    error: error.message
                });
            }

            processed++;
            if (onProgress) {
                const percent = Math.round((processed / totalToProcess) * 100);
                onProgress(processed, totalToProcess, 'Parsing shaders', {
                    percent: percent,
                    currentFile: file.name,
                    phase: 1,
                    totalPhases: 3
                });
            }

            // Yield to UI thread periodically for large file sets
            if (processed % 50 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // Pass 2: Find all dependencies
        // Must happen after all shaders parsed so all function names are known
        if (onProgress) {
            onProgress(processed, totalToProcess, 'Analyzing dependencies', {
                percent: Math.round((processed / totalToProcess) * 100),
                phase: 2,
                totalPhases: 3
            });
        }
        this.parser.findAllDependencies();

        // Pass 3: Process config files for public/private marking
        for (const file of configFiles) {
            // Check for abort request
            if (this.abortRequested) {
                throw new Error('Processing aborted by user');
            }

            try {
                const content = await this.readFile(file);
                const moduleName = this.getModuleFromPath(file.webkitRelativePath || file.name);
                this.parser.processConfig(content, moduleName);
            } catch (error) {
                console.warn(`Error processing config ${file.name}:`, error.message);
                this.stats.parseErrors.push({
                    file: file.name,
                    error: error.message
                });
            }

            processed++;
            if (onProgress) {
                const percent = Math.round((processed / totalToProcess) * 100);
                onProgress(processed, totalToProcess, 'Processing configs', {
                    percent: percent,
                    currentFile: file.name,
                    phase: 3,
                    totalPhases: 3
                });
            }
        }

        this.stats.endTime = Date.now();
        this.stats.parseWarnings = this.stats.parseWarnings.concat(
            this.parser.getWarnings().map(w => ({ file: w.file, warning: w.message }))
        );

        return this.parser.getResult();
    }

    /**
     * Process files with batch reading for better performance on large shader sets
     * Reads files in parallel batches
     * @param {FileList} fileList - Files from input element
     * @param {Function} onProgress - Optional progress callback
     * @param {number} batchSize - Number of files to read in parallel (default: 10)
     * @returns {Promise<Object>} Parsed data
     */
    async processFilesBatched(fileList, onProgress = null, batchSize = 10) {
        // Reset parser and stats
        this.parser.reset();
        this.stats = {
            totalFiles: 0,
            shaderFiles: 0,
            configFiles: 0,
            skippedFiles: 0,
            parseErrors: []
        };

        const files = Array.from(fileList);
        this.stats.totalFiles = files.length;

        const shaderFiles = [];
        const configFiles = [];

        // Categorize files
        for (const file of files) {
            if (this.isShaderFile(file.name)) {
                shaderFiles.push(file);
            } else if (this.isConfigFile(file.name)) {
                configFiles.push(file);
            } else {
                this.stats.skippedFiles++;
            }
        }

        this.stats.shaderFiles = shaderFiles.length;
        this.stats.configFiles = configFiles.length;

        let processed = 0;
        const totalToProcess = shaderFiles.length + configFiles.length;

        // Pass 1: Parse shader files in batches
        for (let i = 0; i < shaderFiles.length; i += batchSize) {
            const batch = shaderFiles.slice(i, i + batchSize);

            // Read batch in parallel
            const batchContents = await Promise.all(
                batch.map(async (file) => {
                    try {
                        const content = await this.readFile(file);
                        return { file, content, error: null };
                    } catch (error) {
                        return { file, content: null, error };
                    }
                })
            );

            // Parse each file in the batch
            for (const { file, content, error } of batchContents) {
                if (error) {
                    console.warn(`Error reading shader file ${file.name}:`, error.message);
                    this.stats.parseErrors.push({
                        file: file.name,
                        error: error.message
                    });
                } else {
                    try {
                        const filePath = this.normalizePath(file.webkitRelativePath || file.name);
                        this.parser.parseFile(content, filePath, file.name);
                    } catch (parseError) {
                        console.warn(`Error parsing shader file ${file.name}:`, parseError.message);
                        this.stats.parseErrors.push({
                            file: file.name,
                            error: parseError.message
                        });
                    }
                }

                processed++;
                if (onProgress) {
                    onProgress(processed, totalToProcess, 'Parsing shaders');
                }
            }
        }

        // Pass 2: Find all dependencies
        this.parser.findAllDependencies();

        // Pass 3: Process config files (usually few, no batching needed)
        for (const file of configFiles) {
            try {
                const content = await this.readFile(file);
                const moduleName = this.getModuleFromPath(file.webkitRelativePath || file.name);
                this.parser.processConfig(content, moduleName);
            } catch (error) {
                console.warn(`Error processing config ${file.name}:`, error.message);
                this.stats.parseErrors.push({
                    file: file.name,
                    error: error.message
                });
            }

            processed++;
            if (onProgress) {
                onProgress(processed, totalToProcess, 'Processing configs');
            }
        }

        return this.parser.getResult();
    }

    /**
     * Get processing statistics
     * @returns {Object} Statistics about the processing run
     */
    getStats() {
        const parserStats = this.parser.getStats();
        const publicPrivateStats = this.parser.getPublicPrivateStats();
        const validation = this.parser.validateResult();

        return {
            files: {
                total: this.stats.totalFiles,
                shaders: this.stats.shaderFiles,
                configs: this.stats.configFiles,
                skipped: this.stats.skippedFiles
            },
            parsing: {
                functions: parserStats.functions,
                modules: parserStats.modules,
                functionModules: parserStats.functionModules,
                submodules: parserStats.submodules,
                dependencies: parserStats.dependencyTotal,
                dependencyCallers: parserStats.dependencyCallers
            },
            visibility: {
                public: publicPrivateStats.public,
                private: publicPrivateStats.private
            },
            errors: this.stats.parseErrors,
            warnings: this.stats.parseWarnings,
            validation: validation,
            timing: this.stats.endTime ? {
                start: this.stats.startTime,
                end: this.stats.endTime,
                duration: this.stats.endTime - this.stats.startTime
            } : null
        };
    }

    /**
     * Get a summary string for display
     * @returns {string} Human-readable summary
     */
    getSummary() {
        const stats = this.getStats();
        const lines = [
            `Processed ${stats.files.shaders} shader files, ${stats.files.configs} config files`,
            `Found ${stats.parsing.functions} functions in ${stats.parsing.modules} modules`,
            `Dependencies: ${stats.parsing.dependencies} calls between ${stats.parsing.dependencyCallers} functions`,
            `Public: ${stats.visibility.public}, Private: ${stats.visibility.private}`
        ];

        if (stats.errors.length > 0) {
            lines.push(`Errors: ${stats.errors.length} files had issues`);
        }

        if (stats.timing) {
            lines.push(`Processing time: ${stats.timing.duration}ms`);
        }

        return lines.join('\n');
    }

    /**
     * Get detailed error report
     * @returns {string} Formatted error report
     */
    getErrorReport() {
        const stats = this.getStats();
        if (stats.errors.length === 0 && stats.warnings.length === 0) {
            return 'No errors or warnings';
        }

        const lines = [];

        if (stats.errors.length > 0) {
            lines.push('=== ERRORS ===');
            for (const err of stats.errors) {
                lines.push(`  ${err.file}: ${err.error}`);
            }
        }

        if (stats.warnings.length > 0) {
            lines.push('=== WARNINGS ===');
            for (const warn of stats.warnings) {
                lines.push(`  ${warn.file}: ${warn.warning}`);
            }
        }

        return lines.join('\n');
    }
}

/**
 * Check browser support for folder upload
 * @returns {{supported: boolean, method: string, browser: Object}}
 */
function checkFolderUploadSupport() {
    const input = document.createElement('input');
    input.type = 'file';

    const browser = detectBrowser();
    let method = 'none';
    let supported = false;

    // Check for webkitdirectory support
    if ('webkitdirectory' in input) {
        method = 'webkitdirectory';
        supported = true;
        BROWSER_SUPPORT.webkitdirectory = true;
    }
    // Check for directory attribute (standard but less supported)
    else if ('directory' in input) {
        method = 'directory';
        supported = true;
        BROWSER_SUPPORT.webkitdirectory = true;
    } else {
        BROWSER_SUPPORT.webkitdirectory = false;
    }

    return {
        supported: supported,
        method: method,
        browser: browser,
        features: BROWSER_SUPPORT
    };
}

/**
 * Get browser compatibility message for display
 * @returns {string} User-friendly compatibility message
 */
function getBrowserCompatibilityMessage() {
    const support = checkFolderUploadSupport();
    const lines = [];

    lines.push(`Browser: ${support.browser.name} ${support.browser.version}`);

    if (support.supported) {
        lines.push('Folder upload: Supported');
    } else {
        lines.push('Folder upload: Not supported - use JSON file upload instead');
    }

    if (support.browser.notes.length > 0) {
        lines.push('Notes:');
        for (const note of support.browser.notes) {
            lines.push(`  - ${note}`);
        }
    }

    return lines.join('\n');
}

/**
 * Create a folder input element configured for shader folder upload
 * @returns {HTMLInputElement}
 */
function createFolderInput() {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'folder-input';
    input.style.display = 'none';

    // Enable folder selection
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.setAttribute('multiple', '');

    return input;
}
