// ============================================================================
// Function Dependency Analyzer
// Browser-based tool for analyzing function call dependencies in code
// ============================================================================

// GLSL keywords and built-in functions to ignore
const GLSL_KEYWORDS = new Set([
    // Data types
    'void', 'bool', 'int', 'float', 'double',
    'vec2', 'vec3', 'vec4', 'bvec2', 'bvec3', 'bvec4',
    'ivec2', 'ivec3', 'ivec4', 'uvec2', 'uvec3', 'uvec4',
    'dvec2', 'dvec3', 'dvec4',
    'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
    'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
    'dmat2', 'dmat3', 'dmat4', 'dmat2x2', 'dmat2x3', 'dmat2x4',
    'dmat3x2', 'dmat3x3', 'dmat3x4', 'dmat4x2', 'dmat4x3', 'dmat4x4',
    'sampler1D', 'sampler2D', 'sampler3D', 'samplerCube',
    'sampler1DShadow', 'sampler2DShadow', 'samplerCubeShadow',
    'sampler1DArray', 'sampler2DArray', 'sampler1DArrayShadow', 'sampler2DArrayShadow',
    'isampler1D', 'isampler2D', 'isampler3D', 'isamplerCube',
    'isampler1DArray', 'isampler2DArray',
    'usampler1D', 'usampler2D', 'usampler3D', 'usamplerCube',
    'usampler1DArray', 'usampler2DArray',
    // Control flow
    'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'return', 'discard',
    'switch', 'case', 'default',
    // Qualifiers
    'const', 'attribute', 'uniform', 'varying', 'in', 'out', 'inout',
    'centroid', 'patch', 'sample', 'subroutine',
    'layout', 'location', 'binding', 'offset', 'align',
    'shared', 'packed', 'std140', 'std430',
    'row_major', 'column_major',
    'smooth', 'flat', 'noperspective',
    'highp', 'mediump', 'lowp', 'precision',
    'struct',
    // Built-in math functions
    'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
    'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
    'abs', 'sign', 'floor', 'trunc', 'round', 'roundEven', 'ceil', 'fract',
    'mod', 'modf', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
    'isnan', 'isinf', 'floatBitsToInt', 'floatBitsToUint', 'intBitsToFloat', 'uintBitsToFloat',
    'frexp', 'ldexp',
    // Vector/matrix functions
    'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward', 'reflect', 'refract',
    'matrixCompMult', 'outerProduct', 'transpose', 'determinant', 'inverse',
    // Vector relational functions
    'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual', 'equal', 'notEqual',
    'any', 'all', 'not',
    // Texture functions
    'texture', 'textureSize', 'textureQueryLod', 'textureQueryLevels',
    'textureLod', 'textureOffset', 'texelFetch', 'texelFetchOffset',
    'textureProjOffset', 'textureLodOffset', 'textureProjLod', 'textureProjLodOffset',
    'textureGrad', 'textureGradOffset', 'textureProjGrad', 'textureProjGradOffset',
    'textureGather', 'textureGatherOffset', 'textureGatherOffsets',
    'texture1D', 'texture2D', 'texture3D', 'textureCube',
    'shadow1D', 'shadow2D', 'shadow1DProj', 'shadow2DProj',
    // Geometry shader functions
    'EmitStreamVertex', 'EndStreamPrimitive', 'EmitVertex', 'EndPrimitive',
    // Fragment shader functions
    'dFdx', 'dFdy', 'dFdxFine', 'dFdyFine', 'dFdxCoarse', 'dFdyCoarse', 'fwidth', 'fwidthFine', 'fwidthCoarse',
    // Atomic functions
    'atomicCounterIncrement', 'atomicCounterDecrement', 'atomicCounter',
    'atomicAdd', 'atomicMin', 'atomicMax', 'atomicAnd', 'atomicOr', 'atomicXor', 'atomicExchange', 'atomicCompSwap',
    // Image functions
    'imageSize', 'imageLoad', 'imageStore', 'imageAtomicAdd', 'imageAtomicMin', 'imageAtomicMax',
    'imageAtomicAnd', 'imageAtomicOr', 'imageAtomicXor', 'imageAtomicExchange', 'imageAtomicCompSwap',
    // Barrier functions
    'barrier', 'memoryBarrier', 'memoryBarrierAtomicCounter', 'memoryBarrierBuffer',
    'memoryBarrierShared', 'memoryBarrierImage', 'groupMemoryBarrier',
    // Noise functions
    'noise1', 'noise2', 'noise3', 'noise4',
    // Built-in variables
    'gl_Position', 'gl_PointSize', 'gl_ClipDistance', 'gl_CullDistance',
    'gl_VertexID', 'gl_InstanceID', 'gl_DrawID', 'gl_BaseVertex', 'gl_BaseInstance',
    'gl_FragCoord', 'gl_FrontFacing', 'gl_PointCoord', 'gl_PrimitiveID',
    'gl_SampleID', 'gl_SamplePosition', 'gl_SampleMaskIn', 'gl_Layer', 'gl_ViewportIndex',
    'gl_FragColor', 'gl_FragData', 'gl_FragDepth', 'gl_SampleMask',
    // Preprocessor
    'define', 'undef', 'ifdef', 'ifndef', 'endif', 'include', 'pragma', 'version', 'extension',
    // JavaScript/common keywords
    'console', 'window', 'document', 'function', 'var', 'let', 'class',
    'new', 'this', 'super', 'typeof', 'instanceof', 'delete', 'async', 'await',
    'try', 'catch', 'finally', 'throw', 'import', 'export', 'require', 'module'
]);

// Code file extensions
const CODE_EXTENSIONS = new Set([
    '.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hxx', '.h++',
    '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cs', '.php', '.rb',
    '.go', '.rs', '.kt', '.swift', '.m', '.mm', '.scala', '.pl', '.r',
    '.glsl', '.vert', '.frag', '.geom', '.tesc', '.tese', '.comp',
    '.hlsl', '.fx', '.cg', '.shader', '.vs', '.fs', '.gs',
    '.rchit', '.rgen', '.rmiss', '.slang',
    '.asm', '.s', '.S', '.f', '.f90', '.f95', '.for', '.ftn',
    '.lua', '.vim', '.sh', '.bash', '.zsh', '.fish', '.ps1',
    '.sql', '.vb', '.vbs', '.pas', '.pp', '.inc', '.ino'
]);

// ============================================================================
// Function Cache
// ============================================================================

class FunctionCache {
    constructor() {
        this.functions = {};
        this.filesProcessed = 0;
        this.functionsFound = 0;
    }

    addFunction(name, filePath, body) {
        if (!this.functions[name]) {
            this.functions[name] = { filePath, body };
            this.functionsFound++;
        }
    }

    getFunction(name) {
        return this.functions[name];
    }

    hasFunction(name) {
        return name in this.functions;
    }
}

// ============================================================================
// Code Parsing
// ============================================================================

function removeComments(content) {
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = content.split('\n');
    const cleanLines = lines.map(line => {
        const commentPos = line.indexOf('//');
        return commentPos >= 0 ? line.substring(0, commentPos) : line;
    });
    return cleanLines.join('\n');
}

function extractBracketedBlock(content, start) {
    const openPos = content.indexOf('{', start);
    if (openPos === -1) return '';

    let count = 0;
    for (let i = openPos; i < content.length; i++) {
        if (content[i] === '{') count++;
        else if (content[i] === '}') {
            count--;
            if (count === 0) {
                return content.substring(start, i + 1);
            }
        }
    }
    return content.substring(start);
}

function extractIndentedBlock(content, start) {
    const lines = content.substring(start).split('\n');
    const result = [lines[0]];

    if (lines.length < 2) return lines[0];

    let baseIndent = null;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim()) {
            baseIndent = line.length - line.trimStart().length;
            break;
        }
    }

    if (baseIndent === null) return result[0];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() && line.length - line.trimStart().length < baseIndent) {
            break;
        }
        result.push(line);
    }

    return result.join('\n');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findFunctionBody(content, functionName) {
    const patterns = [
        { regex: new RegExp(`\\b${escapeRegex(functionName)}\\s*\\([^)]*\\)\\s*\\{`, 'i'), type: 'bracket' },
        { regex: new RegExp(`def\\s+${escapeRegex(functionName)}\\s*\\([^)]*\\)\\s*:`, 'i'), type: 'python' },
        { regex: new RegExp(`function\\s+${escapeRegex(functionName)}\\s*\\([^)]*\\)\\s*\\{`, 'i'), type: 'bracket' },
        { regex: new RegExp(`${escapeRegex(functionName)}\\s*=\\s*function\\s*\\([^)]*\\)\\s*\\{`, 'i'), type: 'bracket' },
        { regex: new RegExp(`${escapeRegex(functionName)}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`, 'i'), type: 'bracket' }
    ];

    for (const { regex, type } of patterns) {
        const match = regex.exec(content);
        if (match) {
            const start = match.index;
            return type === 'python'
                ? extractIndentedBlock(content, start)
                : extractBracketedBlock(content, start);
        }
    }
    return null;
}

function extractAllFunctionsFromContent(content) {
    const functions = [];

    const patterns = [
        /\b(\w+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{/g,
        /function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{/g,
        /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*function\s*\([^)]*\)\s*\{/g,
        /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*:/g,
        /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\([^)]*\)\s*=>\s*\{/g
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
            let funcName;
            if (match.length === 2) {
                funcName = match[1];
            } else if (match.length >= 3) {
                const returnType = match[1];
                const isPrimitiveType = ['void', 'int', 'float', 'double', 'bool', 'uint',
                                        'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4',
                                        'uvec2', 'uvec3', 'uvec4', 'mat2', 'mat3', 'mat4',
                                        'sampler2D', 'samplerCube'].includes(returnType);
                funcName = isPrimitiveType ? match[2] : match[1];
            }

            if (!funcName) continue;

            if (GLSL_KEYWORDS.has(funcName.toLowerCase()) || funcName.length < 2) {
                continue;
            }

            const funcBody = findFunctionBody(content, funcName);
            if (funcBody && funcBody.trim().length > 10) {
                functions.push({ name: funcName, body: funcBody });
            }
        }
    }

    return functions;
}

function extractFunctionCalls(functionBody) {
    const cleanBody = removeComments(functionBody);
    const firstBrace = cleanBody.indexOf('{');
    const bodyOnly = firstBrace !== -1 ? cleanBody.substring(firstBrace) : cleanBody;

    const pattern = /\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*(?:::[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\(/g;
    const matches = [];
    let match;

    while ((match = pattern.exec(bodyOnly)) !== null) {
        matches.push(match[1]);
    }

    const seen = new Set();
    const result = [];

    for (const match of matches) {
        const names = [match];
        if (match.includes('.')) {
            names.push(match.split('.').pop());
        } else if (match.includes('::')) {
            names.push(match.split('::').pop());
        }

        for (const name of names) {
            if (!seen.has(name) && !GLSL_KEYWORDS.has(name.toLowerCase()) && name.length > 1) {
                seen.add(name);
                result.push(name);
            }
        }
    }

    return result;
}

function shouldProcessFile(fileName) {
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    if (ext === '.json') return false;
    return CODE_EXTENSIONS.has(ext) || ext === '';
}

// ============================================================================
// Dependency Tree
// ============================================================================

function buildDependencyTreeFromCache(cache, rootFunction, maxDepth = 10) {
    const tree = {};
    let toProcess = [rootFunction];
    const processed = new Set();
    let depth = 0;

    while (toProcess.length > 0 && depth < maxDepth) {
        const currentBatch = [...toProcess];
        toProcess = [];
        depth++;

        for (const funcName of currentBatch) {
            if (processed.has(funcName)) continue;
            processed.add(funcName);

            const cached = cache.getFunction(funcName);
            if (cached) {
                const calls = extractFunctionCalls(cached.body);
                tree[funcName] = {
                    filePath: cached.filePath,
                    body: cached.body,
                    calls: new Set(calls)
                };

                for (const call of calls) {
                    if (!processed.has(call) && !toProcess.includes(call)) {
                        if (cache.hasFunction(call)) {
                            toProcess.push(call);
                        }
                    }
                }
            } else {
                tree[funcName] = {
                    filePath: null,
                    body: null,
                    calls: new Set()
                };
            }
        }
    }

    return tree;
}

function topologicalSort(dependencies) {
    const result = [];
    const visited = new Set();
    const tempMark = new Set();

    function visit(n) {
        if (tempMark.has(n)) return;
        if (visited.has(n)) return;

        tempMark.add(n);
        const deps = dependencies[n] || new Set();
        for (const m of deps) {
            if (m in dependencies) {
                visit(m);
            }
        }
        tempMark.delete(n);
        visited.add(n);
        result.push(n);
    }

    for (const node in dependencies) {
        if (!visited.has(node)) {
            visit(node);
        }
    }

    return result;
}

// ============================================================================
// GitLab Integration State
// ============================================================================

let currentSource = 'local';        // 'local' or 'gitlab'
let gitlabFunctionCache = null;     // FunctionCache built from GitLab-fetched files
const gitlabCache = new GitLabCache('fndep-gitlab-cache');

// ============================================================================
// File API and UI
// ============================================================================

let selectedFiles = null;
let fileColorMap = new Map();
let activeFunctionNames = []; // populated when data loads, used for autocomplete
let autocompleteSelectedIndex = -1;
let localFunctionCache = null; // pre-built cache from local folder scan

function generateFileColor(filePath) {
    if (fileColorMap.has(filePath)) {
        return fileColorMap.get(filePath);
    }

    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
        hash = ((hash << 5) - hash) + filePath.charCodeAt(i);
        hash = hash & hash;
    }

    const colors = [];
    const hueSteps = 20;
    const lightnessLevels = [68, 75];

    for (let l of lightnessLevels) {
        for (let i = 0; i < hueSteps; i++) {
            const hue = (i * 360 / hueSteps) % 360;
            const saturation = 55 + (i % 3) * 8;
            colors.push(`hsl(${hue}, ${saturation}%, ${l}%)`);
        }
    }

    const color = colors[Math.abs(hash) % colors.length];
    fileColorMap.set(filePath, color);
    return color;
}

async function scanDirectoryWithFileAPI(files, maxFiles = 5000) {
    const cache = new FunctionCache();
    let filesSearched = 0;

    updateProgress(`Scanning ${files.length} files...`);

    for (const file of files) {
        if (filesSearched >= maxFiles) break;

        filesSearched++;

        if (filesSearched % 100 === 0) {
            updateProgress(`Processed ${filesSearched}/${files.length} files, found ${cache.functionsFound} functions...`);
        }

        if (!shouldProcessFile(file.name)) continue;

        try {
            const content = await file.text();
            const functions = extractAllFunctionsFromContent(content);

            for (const { name, body } of functions) {
                cache.addFunction(name, file.webkitRelativePath, body);
            }

            cache.filesProcessed++;
        } catch (err) {
            // Skip files that can't be read
        }
    }

    return cache;
}

function updateProgress(message) {
    document.getElementById('progressInfo').textContent = message;
}

async function analyzeFunction() {
    const functionName = document.getElementById('functionName').value.trim();

    if (currentSource === 'gitlab') {
        if (!gitlabFunctionCache) {
            showError('Please fetch from GitLab first');
            return;
        }
    } else {
        if (!localFunctionCache) {
            showError('Please select a folder first using the "Select Folder" button');
            return;
        }
    }

    if (!functionName) {
        showError('Please enter a function name');
        return;
    }

    localStorage.setItem('fndep_functionName', functionName);

    document.getElementById('loading').style.display = 'block';
    document.getElementById('error').style.display = 'none';
    document.getElementById('results').classList.remove('active');
    document.getElementById('analyzeBtn').disabled = true;

    try {
        const cache = currentSource === 'gitlab' ? gitlabFunctionCache : localFunctionCache;

        const tree = buildDependencyTreeFromCache(cache, functionName);

        if (!tree[functionName] || !tree[functionName].filePath) {
            showError(`Function '${functionName}' not found`);
            showStats({
                filesProcessed: cache.filesProcessed,
                functionsFound: cache.functionsFound
            });
            return;
        }

        const dependencies = {};
        for (const [func, data] of Object.entries(tree)) {
            if (data.filePath) {
                const validCalls = new Set();
                for (const call of data.calls) {
                    if (tree[call] && tree[call].filePath) {
                        validCalls.add(call);
                    }
                }
                dependencies[func] = validCalls;
            }
        }

        const sortedFuncs = topologicalSort(dependencies);
        const rootFolder = currentSource === 'gitlab'
            ? `GitLab (${document.getElementById('gitlabBranch').value})`
            : document.getElementById('folderPath').value;

        const results = {
            rootFunction: functionName,
            folderPath: rootFolder,
            stats: {
                filesProcessed: cache.filesProcessed,
                functionsFound: cache.functionsFound,
                dependenciesFound: Object.keys(tree).length
            },
            tree: {},
            sortedFunctions: [],
            flattenedCode: []
        };

        const fileGroups = {};
        const notFound = [];

        for (const func of sortedFuncs) {
            if (tree[func]) {
                const { filePath, body, calls } = tree[func];
                if (filePath) {
                    // Local files have root folder prefix (e.g. "folder/path/file.glsl"),
                    // GitLab paths are already relative (e.g. "path/file.glsl")
                    const relPath = currentSource === 'gitlab'
                        ? filePath
                        : filePath.substring(filePath.indexOf('/') + 1);

                    if (!fileGroups[relPath]) {
                        fileGroups[relPath] = [];
                    }
                    fileGroups[relPath].push({
                        name: func,
                        isRoot: func === functionName,
                        calls: Array.from(dependencies[func] || [])
                    });

                    results.sortedFunctions.push({
                        name: func,
                        file: relPath,
                        calls: Array.from(calls),
                        isRoot: func === functionName
                    });

                    results.flattenedCode.push({
                        name: func,
                        file: relPath,
                        body: body,
                        calls: Array.from(calls),
                        isRoot: func === functionName
                    });
                } else {
                    notFound.push(func);
                }
            }
        }

        results.tree = { fileGroups, notFound };

        displayResults(results);
    } catch (err) {
        showError(`Error: ${err.message}`);
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('analyzeBtn').disabled = false;
    }
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function showStats(stats) {
    const statsDiv = document.getElementById('stats');
    statsDiv.innerHTML = `
        <span class="stat-item">Files processed: ${stats.filesProcessed}</span>
        <span class="stat-item">Functions found: ${stats.functionsFound}</span>
        ${stats.dependenciesFound ? `<span class="stat-item">Dependencies: ${stats.dependenciesFound}</span>` : ''}
    `;
}

function displayResults(data) {
    showStats(data.stats);
    document.getElementById('results').classList.add('active');
    displayTree(data);
    displayCode(data);
}

function displayTree(data) {
    const treeOutput = document.getElementById('tree-output');
    fileColorMap.clear();
    let html = '';

    html += `╔═ Dependency Tree ═══════════════════════════════════════════════════════╗\n`;
    html += `Root function: ${data.rootFunction}\n`;
    html += `\n`;

    for (const [filePath, functions] of Object.entries(data.tree.fileGroups)) {
        const fileColor = generateFileColor(filePath);
        html += `📄 <span style="color: ${fileColor}; font-weight: bold;">${filePath}</span>\n`;

        for (const func of functions) {
            if (func.isRoot) {
                html += `  ★ <span style="color: ${fileColor}; font-weight: bold;">${func.name}()</span> [ROOT]\n`;
            } else {
                html += `  ├─ <span style="color: ${fileColor};">${func.name}()</span>\n`;
            }

            if (func.calls && func.calls.length > 0) {
                func.calls.forEach((call, i) => {
                    const isLast = i === func.calls.length - 1;
                    const prefix = isLast ? '└──' : '├──';

                    let callColor = '#808080';
                    for (const [fp, funcs] of Object.entries(data.tree.fileGroups)) {
                        if (funcs.some(f => f.name === call)) {
                            callColor = generateFileColor(fp);
                            break;
                        }
                    }

                    html += `    ${prefix} calls: <span style="color: ${callColor};">${call}()</span>\n`;
                });
            }
        }
        html += '\n';
    }

    if (data.tree.notFound && data.tree.notFound.length > 0) {
        html += `✗ Not found:\n`;
        for (const func of data.tree.notFound) {
            html += `  ├─ <span style="color: #808080;">${func}()</span>\n`;
        }
        html += '\n';
    }

    html += `╚═══════════════════════════════════════════════════════════════════════════╝\n`;

    const foundCount = data.sortedFunctions.length;
    const notFoundCount = data.tree.notFound ? data.tree.notFound.length : 0;
    html += `Total: ${foundCount} functions found, ${notFoundCount} not found`;

    treeOutput.innerHTML = html;
}

function displayCode(data) {
    const codeOutput = document.getElementById('code-output');
    let text = '';

    text += `// Function definitions with dependencies\n`;
    text += `// Search path: ${data.folderPath}\n`;
    text += `// Ordered bottom-up by dependencies (leaf functions first)\n`;
    text += `// Total unique functions: ${data.flattenedCode.length}\n\n`;

    for (const func of data.flattenedCode) {
        text += `// ${'='.repeat(76)}\n`;
        text += `// Function: ${func.name}\n`;
        text += `// Source: ${func.file}\n`;
        if (func.calls && func.calls.length > 0) {
            text += `// Calls: ${func.calls.join(', ')}\n`;
        }
        if (func.isRoot) {
            text += `// [ROOT FUNCTION]\n`;
        }
        text += `// ${'='.repeat(76)}\n\n`;
        text += func.body;
        text += '\n\n';
    }

    const notFound = data.tree.notFound;
    if (notFound && notFound.length > 0) {
        text += `\n// ${'='.repeat(76)}\n`;
        text += `// NOT FOUND FUNCTIONS\n`;
        text += `// ${'='.repeat(76)}\n`;
        for (const func of notFound) {
            text += `// - ${func}\n`;
        }
    }

    codeOutput.textContent = text;
}

function switchTab(tab, event) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tab}-tab`).classList.add('active');
}

// ============================================================================
// GitLab Source Switching and Fetch
// ============================================================================

function switchSource(source) {
    currentSource = source;

    const localTab = document.getElementById('localTab');
    const gitlabTab = document.getElementById('gitlabTab');
    const localControls = document.getElementById('localControls');
    const gitlabControls = document.getElementById('gitlabControls');
    const analyzeControls = document.getElementById('analyzeControls');

    localTab.classList.toggle('active', source === 'local');
    gitlabTab.classList.toggle('active', source === 'gitlab');
    localControls.style.display = source === 'local' ? 'block' : 'none';
    gitlabControls.style.display = source === 'gitlab' ? 'block' : 'none';

    // Show/hide analyze controls based on available data
    const activeCache = source === 'gitlab' ? gitlabFunctionCache : localFunctionCache;
    if (activeCache) {
        showAnalyzeControls(activeCache);
    } else {
        activeFunctionNames = [];
        analyzeControls.classList.remove('visible');
    }

    updateCacheStatus();
}

async function fetchFromGitLab(forceRefresh = false) {
    const tokenEl = document.getElementById('gitlabToken');
    const branchEl = document.getElementById('gitlabBranch');
    const fetchBtn = document.getElementById('gitlabFetchBtn');

    const token = tokenEl.value.trim() || null;
    const ref = branchEl.value;

    if (token) saveToken(token);

    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching...';

    try {
        showGitLabProgress(true);
        let cacheData;

        if (!forceRefresh && gitlabCache.isValid(ref)) {
            updateGitLabProgress(1, 1, 'Loading from cache...');
            cacheData = gitlabCache.getCache();
            console.log('GitLab cache hit for branch:', ref);
        } else {
            if (forceRefresh) console.log('Force refresh requested, bypassing cache');
            console.log('GitLab cache miss, fetching from network...');
            updateGitLabProgress(0, 1, 'Fetching file list...');
            const fetcher = new GitLabFetcher({ ref, token });
            const tree = await fetcher.fetchTree();
            const shaderExts = ['.glsl', '.rchit', '.rgen', '.rmiss', '.slang'];
            const codeFiles = tree.filter(f => {
                const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
                return shaderExts.includes(ext);
            });

            console.log(`Found ${codeFiles.length} shader files out of ${tree.length} total`);
            updateGitLabProgress(0, codeFiles.length, `Found ${codeFiles.length} files, fetching...`);

            const results = await fetcher.fetchFilesInParallel(codeFiles, (done, total) => {
                updateGitLabProgress(done, total, `Fetching files... (${done}/${total})`);
            });

            cacheData = { ref, tree: codeFiles, files: {} };
            let fetchErrors = 0;
            for (const r of results) {
                if (r.content) {
                    cacheData.files[r.file.path] = r.content;
                } else {
                    fetchErrors++;
                }
            }
            if (fetchErrors > 0) {
                console.warn(`${fetchErrors} files failed to fetch`);
            }

            gitlabCache.setCache(cacheData);
        }

        // Build FunctionCache from fetched file contents
        gitlabFunctionCache = new FunctionCache();
        for (const [path, content] of Object.entries(cacheData.files)) {
            const functions = extractAllFunctionsFromContent(content);
            for (const { name, body } of functions) {
                gitlabFunctionCache.addFunction(name, path, body);
            }
            gitlabFunctionCache.filesProcessed++;
        }

        const gitlabLabel = `GitLab (${ref})`;
        saveCachedData(gitlabFunctionCache, 'gitlab', gitlabLabel);
        console.log(`Built FunctionCache: ${gitlabFunctionCache.functionsFound} functions from ${gitlabFunctionCache.filesProcessed} files`);
        updateGitLabProgress(1, 1,
            `Ready: ${gitlabFunctionCache.functionsFound} functions from ${gitlabFunctionCache.filesProcessed} files`);
        updateCacheStatus();
        showAnalyzeControls(gitlabFunctionCache);

        // Auto-hide progress bar after a short delay
        setTimeout(() => showGitLabProgress(false), 3000);

    } catch (error) {
        showGitLabError(error);
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = 'Fetch from GitLab';
    }
}

// ============================================================================
// GitLab Progress and Cache Status Helpers
// ============================================================================

function showGitLabProgress(show) {
    const container = document.getElementById('gitlabProgress');
    if (container) {
        container.style.display = show ? 'block' : 'none';
    }
    if (!show) {
        const fill = document.getElementById('gitlabProgressFill');
        if (fill) fill.style.width = '0%';
    }
}

function updateGitLabProgress(done, total, message) {
    const textEl = document.getElementById('gitlabProgressText');
    const fillEl = document.getElementById('gitlabProgressFill');

    if (textEl) textEl.textContent = message;
    if (fillEl && total > 0) {
        fillEl.style.width = `${(done / total) * 100}%`;
    }
}

function updateCacheStatus() {
    const statusEl = document.getElementById('cacheStatus');
    const infoEl = document.getElementById('cacheInfo');
    if (!statusEl || !infoEl) return;

    const saved = loadCachedData();
    if (!saved) {
        statusEl.style.display = 'none';
        return;
    }

    statusEl.style.display = 'flex';
    statusEl.classList.remove('expired');
    const age = getCacheAge(saved.timestamp);
    infoEl.textContent = `Cached: ${saved.cache.functionsFound} functions from ${saved.label} (${age})`;
}

function handleClearCache() {
    clearCachedData();
    gitlabFunctionCache = null;
    localFunctionCache = null;
    activeFunctionNames = [];
    document.getElementById('folderPath').value = '';
    updateCacheStatus();
    const controls = document.getElementById('analyzeControls');
    if (controls) controls.classList.remove('visible');
    console.log('Cache cleared');
}

function showGitLabError(error) {
    let message = error.message;

    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        message = 'Network error. The CORS proxy may be down, or check your connection.';
    } else if (message.includes('401')) {
        message = 'Authentication failed. Check your access token.';
    } else if (message.includes('404')) {
        message = 'Repository not found. For private repos, provide a valid token.';
    }

    updateGitLabProgress(0, 0, `Error: ${message}`);
    console.error('GitLab fetch error:', error);
}

// ============================================================================
// Token Persistence
// ============================================================================

function saveToken(token) {
    try {
        if (token) localStorage.setItem('fndep-gitlab-token', token);
    } catch (e) {
        // localStorage unavailable
    }
}

function loadSavedToken() {
    try {
        const token = localStorage.getItem('fndep-gitlab-token');
        const tokenEl = document.getElementById('gitlabToken');
        if (token && tokenEl) tokenEl.value = token;
    } catch (e) {
        // localStorage unavailable
    }
}

// ============================================================================
// Unified Function Cache Persistence
// ============================================================================

function saveCachedData(cache, source, label) {
    const data = {
        timestamp: Date.now(),
        source,
        label,
        functions: cache.functions,
        filesProcessed: cache.filesProcessed,
        functionsFound: cache.functionsFound
    };
    try {
        localStorage.setItem('fndep-cache', JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save cache:', e.message);
        try {
            localStorage.removeItem('fndep-cache');
            localStorage.setItem('fndep-cache', JSON.stringify(data));
        } catch (e2) {
            console.warn('Cache save failed after retry');
        }
    }
}

function loadCachedData() {
    try {
        const raw = localStorage.getItem('fndep-cache');
        if (!raw) return null;
        const data = JSON.parse(raw);
        const cache = new FunctionCache();
        cache.functions = data.functions;
        cache.filesProcessed = data.filesProcessed;
        cache.functionsFound = data.functionsFound;
        return { cache, source: data.source, label: data.label, timestamp: data.timestamp };
    } catch (e) {
        return null;
    }
}

function clearCachedData() {
    try {
        localStorage.removeItem('fndep-cache');
        gitlabCache.clear();
    } catch (e) {}
}

function getCacheAge(timestamp) {
    if (!timestamp) return null;
    const ageMs = Date.now() - timestamp;
    const hours = Math.floor(ageMs / (60 * 60 * 1000));
    const minutes = Math.floor((ageMs % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
}

// ============================================================================
// Restore State on Page Load
// ============================================================================

function restoreOnLoad() {
    const saved = loadCachedData();
    if (!saved) return;

    // Put the cache into the right slot
    if (saved.source === 'gitlab') {
        gitlabFunctionCache = saved.cache;
    } else {
        localFunctionCache = saved.cache;
        const folderEl = document.getElementById('folderPath');
        if (folderEl && saved.label) folderEl.value = saved.label;
    }

    switchSource(saved.source);
    console.log(`Restored cache: ${saved.cache.functionsFound} functions (${saved.source}: ${saved.label})`);
}

// ============================================================================
// Analyze Controls and Autocomplete
// ============================================================================

function showAnalyzeControls(cache) {
    // Populate function names from the cache for autocomplete
    activeFunctionNames = Object.keys(cache.functions).sort();

    const controls = document.getElementById('analyzeControls');
    if (controls) controls.classList.add('visible');

    // Restore saved function name
    const saved = localStorage.getItem('fndep_functionName');
    const input = document.getElementById('functionName');
    if (saved && input && !input.value) {
        input.value = saved;
    }
}

function setupAutocomplete() {
    const input = document.getElementById('functionName');
    const dropdown = document.getElementById('autocompleteDropdown');
    if (!input || !dropdown) return;

    input.addEventListener('input', () => {
        const query = input.value.trim().toLowerCase();
        autocompleteSelectedIndex = -1;
        if (!query || activeFunctionNames.length === 0) {
            dropdown.classList.remove('visible');
            return;
        }

        const matches = activeFunctionNames.filter(name =>
            name.toLowerCase().includes(query)
        ).slice(0, 30);

        if (matches.length === 0) {
            dropdown.classList.remove('visible');
            return;
        }

        dropdown.innerHTML = matches.map((name, i) => {
            const lower = name.toLowerCase();
            const idx = lower.indexOf(query);
            const before = name.substring(0, idx);
            const match = name.substring(idx, idx + query.length);
            const after = name.substring(idx + query.length);
            return `<div class="autocomplete-item" data-index="${i}" data-value="${name}">${before}<span class="match">${match}</span>${after}</div>`;
        }).join('');

        dropdown.classList.add('visible');
    });

    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.autocomplete-item');
        if (!dropdown.classList.contains('visible') || items.length === 0) {
            if (e.key === 'Enter') analyzeFunction();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            autocompleteSelectedIndex = Math.min(autocompleteSelectedIndex + 1, items.length - 1);
            updateAutocompleteSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            autocompleteSelectedIndex = Math.max(autocompleteSelectedIndex - 1, -1);
            updateAutocompleteSelection(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (autocompleteSelectedIndex >= 0 && items[autocompleteSelectedIndex]) {
                input.value = items[autocompleteSelectedIndex].dataset.value;
                dropdown.classList.remove('visible');
            }
            analyzeFunction();
        } else if (e.key === 'Escape') {
            dropdown.classList.remove('visible');
        }
    });

    dropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (item) {
            input.value = item.dataset.value;
            dropdown.classList.remove('visible');
            input.focus();
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-wrapper')) {
            dropdown.classList.remove('visible');
        }
    });
}

function updateAutocompleteSelection(items) {
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === autocompleteSelectedIndex);
    });
    if (autocompleteSelectedIndex >= 0 && items[autocompleteSelectedIndex]) {
        items[autocompleteSelectedIndex].scrollIntoView({ block: 'nearest' });
    }
}

// ============================================================================
// Event handlers
// ============================================================================

document.getElementById('folderPicker').addEventListener('click', async () => {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.multiple = true;

        input.onchange = async (e) => {
            selectedFiles = Array.from(e.target.files);
            if (selectedFiles.length > 0) {
                const firstPath = selectedFiles[0].webkitRelativePath;
                const rootFolder = firstPath.split('/')[0];
                document.getElementById('folderPath').value = rootFolder;
                localStorage.setItem('fndep_lastFolder', rootFolder);

                // Scan immediately so autocomplete works
                document.getElementById('loading').style.display = 'block';
                localFunctionCache = await scanDirectoryWithFileAPI(selectedFiles);
                document.getElementById('loading').style.display = 'none';
                saveCachedData(localFunctionCache, 'local', rootFolder);
                showAnalyzeControls(localFunctionCache);
                updateCacheStatus();
            }
        };

        input.click();
    } catch (err) {
        showError(`Error selecting folder: ${err.message}`);
    }
});

window.addEventListener('DOMContentLoaded', () => {
    // Wire up source tab switching
    document.getElementById('localTab').addEventListener('click', () => switchSource('local'));
    document.getElementById('gitlabTab').addEventListener('click', () => switchSource('gitlab'));

    // Wire up GitLab fetch and clear cache buttons
    // Shift+click on fetch bypasses cache
    document.getElementById('gitlabFetchBtn').addEventListener('click', (e) => fetchFromGitLab(e.shiftKey));
    document.getElementById('clearCacheBtn').addEventListener('click', handleClearCache);

    // Load saved token
    loadSavedToken();

    // Setup autocomplete on function name input
    setupAutocomplete();

    // Restore caches and source tab from previous session
    restoreOnLoad();
});

// ============================================================================
// Copy and Download
// ============================================================================

function copyTree() {
    const treeOutput = document.getElementById('tree-output');
    const text = treeOutput.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback('tree-copy-feedback');
    });
}

function copyCode() {
    const codeOutput = document.getElementById('code-output');
    const text = codeOutput.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showCopyFeedback('code-copy-feedback');
    });
}

function downloadCode() {
    const codeOutput = document.getElementById('code-output');
    const text = codeOutput.textContent;
    const functionName = document.getElementById('functionName').value.trim();
    const filename = `${functionName}_dependencies.glsl`;

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showCopyFeedback(elementId) {
    const feedback = document.getElementById(elementId);
    feedback.classList.add('show');
    setTimeout(() => {
        feedback.classList.remove('show');
    }, 1500);
}
