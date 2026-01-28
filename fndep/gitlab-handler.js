// ============================================================================
// GitLab Handler for Function Dependency Analyzer
// Fetches files from GitLab repository through CORS proxy
// with localStorage caching (24h TTL)
// ============================================================================

const GITLAB_CONFIG = {
  // URL-encoded project path: 3dverse/platform/core-assets/ftl-shader-modules
  project: '3dverse%2Fplatform%2Fcore-assets%2Fftl-shader-modules',
  apiBase: 'https://gitlab.com/api/v4',
  corsProxy: 'https://api.codetabs.com/v1/proxy?quest=',
  defaultRef: 'master'
};

// ============================================================================
// GitLabCache - localStorage wrapper with 24h TTL
// ============================================================================

class GitLabCache {
  constructor(storageKey = 'fndep-gitlab-cache') {
    this.storageKey = storageKey;
    this.maxAge = 24 * 60 * 60 * 1000; // 24 hours
  }

  getCache() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn('Failed to read cache:', error.message);
      return null;
    }
  }

  setCache(data) {
    const cacheData = {
      timestamp: Date.now(),
      ref: data.ref,
      tree: data.tree || [],
      files: data.files || {}
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
    } catch (error) {
      // localStorage might be full (QuotaExceededError) - clear and retry
      console.warn('Cache write failed, clearing and retrying:', error.message);
      this.clear();
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
      } catch (retryError) {
        console.warn('Cache save failed after retry:', retryError.message);
        // Show user-visible warning via progress text if available
        const progressText = document.getElementById('gitlabProgressText');
        if (progressText) {
          progressText.textContent = 'Warning: could not cache files (storage full). Data loaded but won\'t persist.';
        }
      }
    }
  }

  isValid(ref) {
    const cache = this.getCache();
    if (!cache) return false;
    if (cache.ref !== ref) return false;
    return (Date.now() - cache.timestamp) < this.maxAge;
  }

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

  clear() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn('Failed to clear cache:', error.message);
    }
  }
}

// ============================================================================
// GitLabFetcher - CORS-proxied GitLab API client
// ============================================================================

class GitLabFetcher {
  constructor(options = {}) {
    this.project = options.project || GITLAB_CONFIG.project;
    this.corsProxy = options.corsProxy || GITLAB_CONFIG.corsProxy;
    this.ref = options.ref || GITLAB_CONFIG.defaultRef;
    this.apiBase = GITLAB_CONFIG.apiBase;
    this.batchSize = options.batchSize || 8;
    this.token = options.token || null;
  }

  buildUrl(endpoint) {
    let url = `${this.apiBase}${endpoint}`;

    // Token via URL parameter (CORS proxies strip custom headers)
    if (this.token) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}private_token=${encodeURIComponent(this.token)}`;
    }

    return this.corsProxy + encodeURIComponent(url);
  }

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

      if (batch && batch.error) {
        throw new Error(`GitLab API error: ${batch.error}`);
      }
      if (batch && batch.message) {
        throw new Error(`GitLab API error: ${batch.message}`);
      }

      if (!batch || !Array.isArray(batch) || batch.length === 0) {
        break;
      }

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

  async fetchFile(path) {
    const encodedPath = encodeURIComponent(path);
    const endpoint = `/projects/${this.project}/repository/files/${encodedPath}/raw?ref=${this.ref}`;

    const response = await fetch(this.buildUrl(endpoint));

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: HTTP ${response.status}`);
    }

    return response.text();
  }

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

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return results;
  }
}
