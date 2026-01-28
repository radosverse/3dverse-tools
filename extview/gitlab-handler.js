/**
 * GitLab Handler for GLSL Extension Viewer
 * Fetches shader files from GitLab repository through CORS proxy
 * Integrates with extension_scanner_browser.js for scanning
 */

const GITLAB_CONFIG = {
  // URL-encoded project path: 3dverse/platform/core-assets/ftl-shader-modules
  project: '3dverse%2Fplatform%2Fcore-assets%2Fftl-shader-modules',
  apiBase: 'https://gitlab.com/api/v4',
  corsProxy: 'https://api.codetabs.com/v1/proxy?quest=',
  defaultRef: 'master'
};

/**
 * GitLabCache - localStorage caching with 24h TTL
 * Stores fetched shader file contents to avoid repeated API calls
 */
class GitLabCache {
  constructor(storageKey = 'extview-gitlab-cache') {
    this.storageKey = storageKey;
    this.maxAge = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Get cached data from localStorage
   * @returns {Object|null} Cached data or null
   */
  getCache() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn('Failed to read cache:', error.message);
      return null;
    }
  }

  /**
   * Save data to localStorage
   * @param {Object} data - Must include ref, tree, files
   */
  setCache(data) {
    try {
      const cacheData = {
        timestamp: Date.now(),
        ref: data.ref,
        tree: data.tree || [],
        files: data.files || {}
      };
      localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
    } catch (error) {
      // localStorage might be full - clear and retry
      console.warn('Failed to save cache:', error.message);
      this.clear();
      try {
        localStorage.setItem(this.storageKey, JSON.stringify({
          timestamp: Date.now(),
          ref: data.ref,
          tree: data.tree || [],
          files: data.files || {}
        }));
      } catch (retryError) {
        console.warn('Cache save failed after retry:', retryError.message);
      }
    }
  }

  /**
   * Check if cache is valid for given ref
   * @param {string} ref - Branch/tag to check
   * @returns {boolean} True if cache exists, matches ref, and not expired
   */
  isValid(ref) {
    const cache = this.getCache();
    if (!cache) return false;
    if (cache.ref !== ref) return false;
    return (Date.now() - cache.timestamp) < this.maxAge;
  }

  /**
   * Get cache age as human-readable string
   * @returns {string|null} e.g., "5 minutes ago"
   */
  getAge() {
    const cache = this.getCache();
    if (!cache) return null;

    const ageMs = Date.now() - cache.timestamp;
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  }

  /**
   * Get cache metadata for UI display
   * @returns {Object|null} {ref, timestamp, fileCount, age, isExpired}
   */
  getInfo() {
    const cache = this.getCache();
    if (!cache) return null;

    return {
      ref: cache.ref,
      timestamp: cache.timestamp,
      fileCount: cache.files ? Object.keys(cache.files).length : 0,
      treeCount: cache.tree ? cache.tree.length : 0,
      age: this.getAge(),
      isExpired: (Date.now() - cache.timestamp) >= this.maxAge
    };
  }

  /**
   * Clear the cache
   */
  clear() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn('Failed to clear cache:', error.message);
    }
  }
}

/**
 * GitLabFetcher - Low-level GitLab API client with CORS proxy support
 */
class GitLabFetcher {
  constructor(options = {}) {
    this.project = options.project || GITLAB_CONFIG.project;
    this.corsProxy = options.corsProxy || GITLAB_CONFIG.corsProxy;
    this.ref = options.ref || GITLAB_CONFIG.defaultRef;
    this.apiBase = GITLAB_CONFIG.apiBase;
    this.batchSize = options.batchSize || 8;
    this.token = options.token || null;
  }

  /**
   * Build CORS-proxied URL for GitLab API
   * @param {string} endpoint - API endpoint
   * @returns {string} Full proxied URL
   */
  buildUrl(endpoint) {
    let url = `${this.apiBase}${endpoint}`;

    // Add token as URL parameter (works through CORS proxies)
    if (this.token) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}private_token=${encodeURIComponent(this.token)}`;
    }

    return this.corsProxy + encodeURIComponent(url);
  }

  /**
   * Fetch repository tree with pagination
   * @returns {Promise<Array>} Array of file objects {name, path, type}
   */
  async fetchTree() {
    const files = [];
    let page = 1;
    const maxPages = 50;

    while (page <= maxPages) {
      const endpoint = `/projects/${this.project}/repository/tree` +
        `?recursive=true&per_page=100&page=${page}&ref=${this.ref}`;

      const response = await fetch(this.buildUrl(endpoint));

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Repository not found or not accessible. For private repos, enter a GitLab personal access token.');
        }
        if (response.status === 401) {
          throw new Error('Authentication failed. Check your GitLab access token.');
        }
        throw new Error(`GitLab API error: HTTP ${response.status}`);
      }

      let batch = await response.json();

      // Some proxies wrap the response
      if (batch && batch.contents) {
        batch = JSON.parse(batch.contents);
      }

      // Check for GitLab error responses
      if (batch && batch.error) {
        throw new Error(`GitLab API error: ${batch.error}`);
      }
      if (batch && batch.message) {
        throw new Error(`GitLab API error: ${batch.message}`);
      }

      // Empty response means end of results
      if (!batch || !Array.isArray(batch) || batch.length === 0) {
        break;
      }

      // Filter for files only (type: "blob")
      files.push(...batch.filter(f => f.type === 'blob'));
      page++;

      // Rate limit check
      const remaining = response.headers.get('RateLimit-Remaining');
      if (remaining && parseInt(remaining) < 10) {
        console.warn('GitLab API rate limit approaching, slowing down...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return files;
  }

  /**
   * Fetch raw content of a single file
   * @param {string} path - File path in repository
   * @returns {Promise<string>} File content
   */
  async fetchFile(path) {
    const encodedPath = encodeURIComponent(path);
    const endpoint = `/projects/${this.project}/repository/files/${encodedPath}/raw?ref=${this.ref}`;

    const response = await fetch(this.buildUrl(endpoint));

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: HTTP ${response.status}`);
    }

    return response.text();
  }

  /**
   * Fetch multiple files in parallel batches
   * @param {Array} files - Array of {path, name} objects
   * @param {Function} onProgress - Callback (completed, total, currentBatch)
   * @returns {Promise<Array>} Array of {file, content, error} results
   */
  async fetchFilesInParallel(files, onProgress = null) {
    const results = [];
    const batchSize = this.batchSize;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const content = await this.fetchFile(file.path);
            return { file, content, error: null };
          } catch (error) {
            return { file, content: null, error: error.message };
          }
        })
      );

      results.push(...batchResults);

      if (onProgress) {
        onProgress(results.length, files.length, batch.map(f => f.name));
      }

      // Small delay between batches
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return results;
  }
}

/**
 * Check if file is a shader based on extension
 * Uses SHADER_EXTENSIONS from extension_scanner_browser.js
 * @param {string} fileName - File name to check
 * @returns {boolean}
 */
function isShaderFile(fileName) {
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  return SHADER_EXTENSIONS.includes(ext);
}

/**
 * Scan shader files from GitLab repository
 * Main entry point - fetches from GitLab and scans for extension usage
 *
 * @param {string} ref - Branch or tag name
 * @param {string|null} token - GitLab personal access token (optional for public repos)
 * @param {boolean} forceRefresh - If true, ignore cache
 * @param {Function} onProgress - Callback (done, total, message)
 * @returns {Promise<Object>} Scan results in same format as scanDirectoryWithFileAPI()
 */
async function scanFromGitLab(ref = 'master', token = null, forceRefresh = false, onProgress = null) {
  const cache = new GitLabCache('extview-gitlab-cache');
  const fetcher = new GitLabFetcher({ ref, token });

  // Check cache validity
  if (!forceRefresh && cache.isValid(ref)) {
    return scanFromCache(cache, onProgress);
  }

  // Fetch from network
  return scanFromNetwork(fetcher, cache, ref, onProgress);
}

/**
 * Scan from cached data (fast path)
 * @param {GitLabCache} cache - Cache instance
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Scan results
 */
async function scanFromCache(cache, onProgress) {
  const startTime = Date.now();

  if (onProgress) {
    onProgress(0, 1, 'Loading from cache...');
  }

  const cacheData = cache.getCache();
  const tree = cacheData.tree || [];
  const cachedFiles = cacheData.files || {};

  // Filter for shader files
  const shaderFiles = tree.filter(f => isShaderFile(f.name));

  if (shaderFiles.length === 0) {
    throw new Error('No shader files found in cache');
  }

  // Scan each cached file
  const results = [];
  const extensionUsageStats = {};
  const functionUsageStats = {};
  const builtinUsageStats = {};
  const typeUsageStats = {};

  let processed = 0;
  for (const file of shaderFiles) {
    const content = cachedFiles[file.path];
    if (!content) continue;

    const fileResult = scanFileContent(content, file.path);

    if (Object.keys(fileResult.extensions_detected).length > 0) {
      results.push(fileResult);

      // Update statistics
      for (const [extName, extData] of Object.entries(fileResult.extensions_detected)) {
        extensionUsageStats[extName] = (extensionUsageStats[extName] || 0) + 1;

        extData.functions.forEach(func => {
          functionUsageStats[func] = (functionUsageStats[func] || 0) + 1;
        });

        extData.built_in_variables.forEach(builtin => {
          builtinUsageStats[builtin] = (builtinUsageStats[builtin] || 0) + 1;
        });

        extData.types.forEach(type => {
          typeUsageStats[type] = (typeUsageStats[type] || 0) + 1;
        });
      }
    }

    processed++;
    if (onProgress && processed % 20 === 0) {
      onProgress(processed, shaderFiles.length, `Scanning cached files... (${processed}/${shaderFiles.length})`);
    }
  }

  const endTime = Date.now();

  if (onProgress) {
    onProgress(shaderFiles.length, shaderFiles.length, `Scan complete from cache`);
  }

  return buildScanOutput(results, shaderFiles.length, extensionUsageStats, functionUsageStats, builtinUsageStats, typeUsageStats, endTime - startTime);
}

/**
 * Scan from network (full fetch)
 * @param {GitLabFetcher} fetcher - Fetcher instance
 * @param {GitLabCache} cache - Cache instance
 * @param {string} ref - Branch/tag
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Scan results
 */
async function scanFromNetwork(fetcher, cache, ref, onProgress) {
  const startTime = Date.now();

  // Phase 1: Fetch repository tree
  if (onProgress) {
    onProgress(0, 1, 'Fetching file list from GitLab...');
  }

  let tree;
  try {
    tree = await fetcher.fetchTree();
  } catch (error) {
    throw new Error(`Failed to fetch repository tree: ${error.message}`);
  }

  // Filter for shader files
  const shaderFiles = tree.filter(f => isShaderFile(f.name));

  if (shaderFiles.length === 0) {
    throw new Error('No shader files found in repository');
  }

  if (onProgress) {
    onProgress(0, shaderFiles.length, `Found ${shaderFiles.length} shader files, fetching...`);
  }

  // Prepare cache data
  const cacheData = {
    ref: ref,
    tree: shaderFiles,
    files: {}
  };

  // Phase 2: Fetch shader files in parallel
  const fetchResults = await fetcher.fetchFilesInParallel(
    shaderFiles,
    (done, total, batchNames) => {
      if (onProgress) {
        onProgress(done, total, `Fetching shaders... (${done}/${total})`);
      }
    }
  );

  // Phase 3: Scan fetched files
  if (onProgress) {
    onProgress(0, shaderFiles.length, 'Scanning for extensions...');
  }

  const results = [];
  const extensionUsageStats = {};
  const functionUsageStats = {};
  const builtinUsageStats = {};
  const typeUsageStats = {};
  let fetchErrors = 0;

  for (const result of fetchResults) {
    if (!result.content) {
      fetchErrors++;
      console.warn(`Failed to fetch: ${result.file.path}`, result.error);
      continue;
    }

    // Cache the content
    cacheData.files[result.file.path] = result.content;

    // Scan for extensions
    const fileResult = scanFileContent(result.content, result.file.path);

    if (Object.keys(fileResult.extensions_detected).length > 0) {
      results.push(fileResult);

      // Update statistics
      for (const [extName, extData] of Object.entries(fileResult.extensions_detected)) {
        extensionUsageStats[extName] = (extensionUsageStats[extName] || 0) + 1;

        extData.functions.forEach(func => {
          functionUsageStats[func] = (functionUsageStats[func] || 0) + 1;
        });

        extData.built_in_variables.forEach(builtin => {
          builtinUsageStats[builtin] = (builtinUsageStats[builtin] || 0) + 1;
        });

        extData.types.forEach(type => {
          typeUsageStats[type] = (typeUsageStats[type] || 0) + 1;
        });
      }
    }
  }

  // Save to cache
  cache.setCache(cacheData);

  const endTime = Date.now();

  if (onProgress) {
    const msg = fetchErrors > 0
      ? `Scan complete (${fetchErrors} files failed to fetch)`
      : 'Scan complete';
    onProgress(shaderFiles.length, shaderFiles.length, msg);
  }

  return buildScanOutput(results, shaderFiles.length - fetchErrors, extensionUsageStats, functionUsageStats, builtinUsageStats, typeUsageStats, endTime - startTime);
}

/**
 * Build scan output in same format as scanDirectoryWithFileAPI()
 */
function buildScanOutput(results, totalScanned, extensionUsageStats, functionUsageStats, builtinUsageStats, typeUsageStats, scanTimeMs) {
  return {
    scan_date: new Date().toISOString(),
    total_files_scanned: totalScanned,
    files_using_extensions: results.length,
    scan_time_ms: scanTimeMs,
    extensions_database: EXTENSIONS_DATABASE,
    shader_files: results,
    statistics: {
      extension_usage: extensionUsageStats,
      function_usage: functionUsageStats,
      builtin_usage: builtinUsageStats,
      type_usage: typeUsageStats
    }
  };
}

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GITLAB_CONFIG,
    GitLabCache,
    GitLabFetcher,
    scanFromGitLab,
    isShaderFile
  };
}
