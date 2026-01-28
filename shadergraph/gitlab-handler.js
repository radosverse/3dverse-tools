// gitlab-handler.js - GitLab repository fetching for shader files
// Fetches shader files from GitLab using the REST API through a CORS proxy
// Phase 2: Added parallel fetching and localStorage caching

const GITLAB_CONFIG = {
  // URL-encoded project path: 3dverse/platform/core-assets/ftl-shader-modules
  project: '3dverse%2Fplatform%2Fcore-assets%2Fftl-shader-modules',
  apiBase: 'https://gitlab.com/api/v4',
  // CORS proxy URL
  corsProxy: 'https://api.codetabs.com/v1/proxy?quest=',
  defaultRef: 'master'
};

/**
 * GitLabCache - Manages localStorage caching for fetched shader data
 * Caches both the file tree and individual file contents
 */
class GitLabCache {
  constructor(storageKey = 'shader-graph-gitlab-cache') {
    this.storageKey = storageKey;
    this.maxAge = 24 * 60 * 60 * 1000; // 24 hours cache lifetime
  }

  /**
   * Get cached data from localStorage
   * @returns {Object|null} Cached data or null if not found
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
   * Save data to localStorage cache
   * @param {Object} data - Data to cache (must include ref and files)
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
      // localStorage might be full or disabled
      console.warn('Failed to save cache:', error.message);
      this.clear(); // Clear old cache and try again
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
   * Check if cache is valid for a given ref
   * @param {string} ref - Branch/tag to check
   * @returns {boolean} True if cache exists, matches ref, and is not expired
   */
  isValid(ref) {
    const cache = this.getCache();
    if (!cache) return false;
    if (cache.ref !== ref) return false;
    return (Date.now() - cache.timestamp) < this.maxAge;
  }

  /**
   * Get cache age in human-readable format
   * @returns {string} e.g., "5 minutes ago" or null if no cache
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
   * Get cache info for display
   * @returns {Object|null} {ref, timestamp, fileCount, age} or null
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
 * GitLabFetcher - Low-level API client for GitLab REST API
 * Phase 2: Added parallel fetching capability
 */
class GitLabFetcher {
  constructor(options = {}) {
    this.project = options.project || GITLAB_CONFIG.project;
    this.corsProxy = options.corsProxy || GITLAB_CONFIG.corsProxy;
    this.ref = options.ref || GITLAB_CONFIG.defaultRef;
    this.apiBase = GITLAB_CONFIG.apiBase;
    this.batchSize = options.batchSize || 8; // Default parallel batch size
    this.token = options.token || null; // GitLab personal access token for private repos
  }

  /**
   * Get headers for API requests
   * Note: Token is passed via URL parameter (in buildUrl) to work with CORS proxies
   * @returns {Object} Headers object
   */
  getHeaders() {
    // Don't send auth headers - token is passed via URL parameter
    // This avoids CORS preflight issues with public proxies
    return {};
  }

  /**
   * Build a proxied URL for GitLab API requests
   * Appends token as URL parameter if present (works with public CORS proxies)
   * @param {string} endpoint - API endpoint (e.g., "/projects/:id/repository/tree")
   * @returns {string} Full URL with CORS proxy
   */
  buildUrl(endpoint) {
    let url = `${this.apiBase}${endpoint}`;

    // Add token as URL parameter (works through CORS proxies that strip headers)
    if (this.token) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}private_token=${encodeURIComponent(this.token)}`;
    }

    return this.corsProxy + encodeURIComponent(url);
  }

  /**
   * Fetch the repository tree (file listing) recursively
   * Handles pagination automatically
   * @returns {Promise<Array>} Array of file objects with {name, path, type}
   */
  async fetchTree() {
    const files = [];
    let page = 1;
    const maxPages = 50; // Safety limit

    while (page <= maxPages) {
      const endpoint = `/projects/${this.project}/repository/tree` +
        `?recursive=true&per_page=100&page=${page}&ref=${this.ref}`;

      const response = await fetch(this.buildUrl(endpoint), {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Repository not found or not accessible. For private repos, enter a GitLab personal access token.`);
        }
        if (response.status === 401) {
          throw new Error(`Authentication failed. Check your GitLab access token.`);
        }
        throw new Error(`GitLab API error: HTTP ${response.status}`);
      }

      let batch = await response.json();

      // Some proxies wrap the response - unwrap if needed
      if (batch && batch.contents) {
        batch = JSON.parse(batch.contents);
      }

      // Check if it's an error response from GitLab
      if (batch && batch.error) {
        throw new Error(`GitLab API error: ${batch.error}`);
      }
      if (batch && batch.message) {
        throw new Error(`GitLab API error: ${batch.message}`);
      }

      // Empty response means we've reached the end
      if (!batch || !Array.isArray(batch) || batch.length === 0) {
        break;
      }

      // Filter for files only (type: "blob"), skip directories (type: "tree")
      files.push(...batch.filter(f => f.type === 'blob'));
      page++;

      // Check for rate limiting
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
   * @param {string} path - File path within the repository
   * @returns {Promise<string>} File content as text
   */
  async fetchFile(path) {
    const encodedPath = encodeURIComponent(path);
    const endpoint = `/projects/${this.project}/repository/files/${encodedPath}/raw?ref=${this.ref}`;

    const response = await fetch(this.buildUrl(endpoint), {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: HTTP ${response.status}`);
    }

    return response.text();
  }

  /**
   * Fetch multiple files in parallel batches
   * @param {Array} files - Array of file objects with {path, name}
   * @param {Function} onProgress - Progress callback (completed, total, currentBatch)
   * @returns {Promise<Array>} Array of {file, content, error} results
   */
  async fetchFilesInParallel(files, onProgress = null) {
    const results = [];
    const batchSize = this.batchSize;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      // Fetch all files in this batch concurrently
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

      // Report progress after each batch
      if (onProgress) {
        onProgress(results.length, files.length, batch.map(f => f.name));
      }

      // Small delay between batches to avoid overwhelming the API/proxy
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return results;
  }
}

/**
 * GitLabHandler - High-level handler that integrates with ShaderParser
 * Coordinates fetching from GitLab and parsing shader files
 * Phase 2: Added caching support and parallel fetching
 */
class GitLabHandler {
  constructor(options = {}) {
    this.parser = new ShaderParser();
    this.fetcher = new GitLabFetcher(options);
    this.cache = new GitLabCache();
    this.useCache = options.useCache !== false; // Default to using cache
    this.stats = {
      totalFiles: 0,
      shaderFiles: 0,
      configFiles: 0,
      fetchErrors: [],
      cacheHits: 0,
      cacheMisses: 0,
      startTime: null,
      endTime: null,
      fromCache: false
    };
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
   * Extract module name from a file path
   * @param {string} path - File path (e.g., "light/light.glsl")
   * @returns {string} Module name
   */
  getModuleFromPath(path) {
    const parts = path.split('/');
    // Module is the folder containing the file
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  }

  /**
   * Normalize path to match expected format (prepend ./)
   * @param {string} path - Raw path from GitLab
   * @returns {string} Normalized path
   */
  normalizePath(path) {
    let normalized = path.replace(/\\/g, '/');
    if (!normalized.startsWith('./')) {
      normalized = './' + normalized;
    }
    return normalized;
  }

  /**
   * Get cache info for UI display
   * @returns {Object|null} Cache info or null
   */
  getCacheInfo() {
    return this.cache.getInfo();
  }

  /**
   * Clear the cache manually
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Process shader files from GitLab repository
   * Main entry point - fetches and parses all shader files
   * Phase 2: Uses parallel fetching and caching
   * @param {string} ref - Branch or tag name (default: 'main')
   * @param {Function} onProgress - Progress callback (done, total, stage, details)
   * @param {boolean} forceRefresh - If true, ignore cache and fetch fresh data
   * @returns {Promise<Object>} Parsed data in the format expected by processData()
   */
  async processFromGitLab(ref = 'main', onProgress = null, forceRefresh = false) {
    // Reset parser and stats
    this.parser.reset();
    this.stats = {
      totalFiles: 0,
      shaderFiles: 0,
      configFiles: 0,
      fetchErrors: [],
      cacheHits: 0,
      cacheMisses: 0,
      startTime: Date.now(),
      endTime: null,
      fromCache: false
    };

    this.fetcher.ref = ref;

    // Check if we can use cache
    const canUseCache = this.useCache && !forceRefresh && this.cache.isValid(ref);

    if (canUseCache) {
      return this.processFromCache(onProgress);
    }

    return this.processFromNetwork(ref, onProgress);
  }

  /**
   * Process data from cache (fast path)
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Parsed data
   */
  async processFromCache(onProgress) {
    if (onProgress) {
      onProgress(0, 1, 'Loading from cache...', {
        phase: 1,
        totalPhases: 3,
        percent: 0,
        fromCache: true
      });
    }

    const cache = this.cache.getCache();
    this.stats.fromCache = true;

    // Get the cached tree and files
    const tree = cache.tree || [];
    const cachedFiles = cache.files || {};

    // Filter for shader and config files
    const shaderFiles = tree.filter(f => this.isShaderFile(f.name));
    const configFiles = tree.filter(f => this.isConfigFile(f.name));

    this.stats.totalFiles = tree.length;
    this.stats.shaderFiles = shaderFiles.length;
    this.stats.configFiles = configFiles.length;

    if (shaderFiles.length === 0) {
      throw new Error('No shader files found in cache');
    }

    // Process cached shader files
    if (onProgress) {
      onProgress(0, shaderFiles.length, 'Parsing cached shaders...', {
        phase: 2,
        totalPhases: 3,
        percent: 0,
        fromCache: true
      });
    }

    let processed = 0;
    for (const file of shaderFiles) {
      const content = cachedFiles[file.path];
      if (content) {
        const filePath = this.normalizePath(file.path);
        this.parser.parseFile(content, filePath, file.name);
        this.stats.cacheHits++;
      } else {
        this.stats.cacheMisses++;
        this.stats.fetchErrors.push({
          file: file.path,
          error: 'Not found in cache'
        });
      }

      processed++;
      if (onProgress && processed % 20 === 0) {
        onProgress(processed, shaderFiles.length, 'Parsing cached shaders...', {
          phase: 2,
          totalPhases: 3,
          percent: Math.round((processed / shaderFiles.length) * 100),
          currentFile: file.name,
          fromCache: true
        });
      }
    }

    // Find dependencies
    if (onProgress) {
      onProgress(processed, shaderFiles.length, 'Analyzing dependencies...', {
        phase: 3,
        totalPhases: 3,
        percent: 100,
        fromCache: true
      });
    }
    this.parser.findAllDependencies();

    // Process cached config files
    for (const file of configFiles) {
      const content = cachedFiles[file.path];
      if (content) {
        const moduleName = this.getModuleFromPath(file.path);
        this.parser.processConfig(content, moduleName);
        this.stats.cacheHits++;
      } else {
        this.stats.cacheMisses++;
      }
    }

    this.stats.endTime = Date.now();
    return this.parser.getResult();
  }

  /**
   * Process data from network (full fetch)
   * @param {string} ref - Branch or tag
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Parsed data
   */
  async processFromNetwork(ref, onProgress) {
    // Phase 1: Fetch repository tree
    if (onProgress) {
      onProgress(0, 1, 'Fetching file list from GitLab...', {
        phase: 1,
        totalPhases: 4,
        percent: 0
      });
    }

    let tree;
    try {
      tree = await this.fetcher.fetchTree();
    } catch (error) {
      throw new Error(`Failed to fetch repository tree: ${error.message}`);
    }

    this.stats.totalFiles = tree.length;

    // Filter for shader and config files
    const shaderFiles = tree.filter(f => this.isShaderFile(f.name));
    const configFiles = tree.filter(f => this.isConfigFile(f.name));

    this.stats.shaderFiles = shaderFiles.length;
    this.stats.configFiles = configFiles.length;

    if (shaderFiles.length === 0) {
      throw new Error('No shader files found in repository');
    }

    // Prepare cache data structure
    const cacheData = {
      ref: ref,
      tree: [...shaderFiles, ...configFiles],
      files: {}
    };

    // Phase 2: Fetch shader files in parallel
    if (onProgress) {
      onProgress(0, shaderFiles.length, 'Fetching shaders (parallel)...', {
        phase: 2,
        totalPhases: 4,
        percent: 0
      });
    }

    const shaderResults = await this.fetcher.fetchFilesInParallel(
      shaderFiles,
      (done, total, batchNames) => {
        if (onProgress) {
          onProgress(done, total, 'Fetching shaders (parallel)...', {
            percent: Math.round((done / total) * 100),
            currentFile: batchNames.join(', '),
            phase: 2,
            totalPhases: 4
          });
        }
      }
    );

    // Parse fetched shader files
    for (const result of shaderResults) {
      if (result.content) {
        const filePath = this.normalizePath(result.file.path);
        this.parser.parseFile(result.content, filePath, result.file.name);
        cacheData.files[result.file.path] = result.content;
      } else {
        this.stats.fetchErrors.push({
          file: result.file.path,
          error: result.error
        });
        console.warn(`Failed to fetch shader: ${result.file.path}`, result.error);
      }
    }

    // Phase 3: Find dependencies
    if (onProgress) {
      onProgress(shaderFiles.length, shaderFiles.length, 'Analyzing dependencies...', {
        phase: 3,
        totalPhases: 4,
        percent: 100
      });
    }
    this.parser.findAllDependencies();

    // Phase 4: Fetch and process config files in parallel
    if (configFiles.length > 0) {
      if (onProgress) {
        onProgress(0, configFiles.length, 'Fetching configs...', {
          phase: 4,
          totalPhases: 4,
          percent: 0
        });
      }

      const configResults = await this.fetcher.fetchFilesInParallel(
        configFiles,
        (done, total) => {
          if (onProgress) {
            onProgress(done, total, 'Processing configs...', {
              percent: Math.round((done / total) * 100),
              phase: 4,
              totalPhases: 4
            });
          }
        }
      );

      for (const result of configResults) {
        if (result.content) {
          const moduleName = this.getModuleFromPath(result.file.path);
          this.parser.processConfig(result.content, moduleName);
          cacheData.files[result.file.path] = result.content;
        } else {
          this.stats.fetchErrors.push({
            file: result.file.path,
            error: result.error
          });
          console.warn(`Failed to fetch config: ${result.file.path}`, result.error);
        }
      }
    }

    // Save to cache
    if (this.useCache) {
      this.cache.setCache(cacheData);
    }

    this.stats.endTime = Date.now();
    return this.parser.getResult();
  }

  /**
   * Get statistics about the fetch/parse operation
   * @returns {Object} Statistics object
   */
  getStats() {
    const parserStats = this.parser.getStats();
    const publicPrivateStats = this.parser.getPublicPrivateStats();

    return {
      files: {
        total: this.stats.totalFiles,
        shaders: this.stats.shaderFiles,
        configs: this.stats.configFiles
      },
      parsing: {
        functions: parserStats.functions,
        modules: parserStats.modules,
        functionModules: parserStats.functionModules,
        submodules: parserStats.submodules,
        dependencies: parserStats.dependencyTotal
      },
      visibility: {
        public: publicPrivateStats.public,
        private: publicPrivateStats.private
      },
      cache: {
        used: this.stats.fromCache,
        hits: this.stats.cacheHits,
        misses: this.stats.cacheMisses
      },
      errors: this.stats.fetchErrors,
      timing: {
        start: this.stats.startTime,
        end: this.stats.endTime,
        duration: this.stats.endTime - this.stats.startTime
      }
    };
  }
}
