// gitlab-oauth.js - GitLab OAuth 2.0 authentication
// Uses Implicit Grant flow for client-side only apps

const GITLAB_OAUTH_CONFIG = {
  // Register your OAuth app at: https://gitlab.com/groups/3dverse/-/settings/applications
  // Or at project level: https://gitlab.com/3dverse/ftl/ftl-shader-modules/-/settings/applications
  // Scopes needed: read_repository
  // Redirect URIs: add both localhost (for testing) and GitHub Pages URL (for production)

  clientId: '', // SET THIS after registering your GitLab OAuth app

  authorizeUrl: 'https://gitlab.com/oauth/authorize',
  scopes: 'read_repository',

  // Storage keys
  tokenKey: 'gitlab-oauth-token',
  stateKey: 'gitlab-oauth-state'
};

/**
 * GitLabOAuth - Handles OAuth 2.0 implicit flow with GitLab
 */
class GitLabOAuth {
  constructor() {
    this.token = null;
    this.loadToken();
  }

  /**
   * Check if OAuth is configured (client ID is set)
   */
  isConfigured() {
    return GITLAB_OAUTH_CONFIG.clientId && GITLAB_OAUTH_CONFIG.clientId.length > 0;
  }

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated() {
    return this.token !== null;
  }

  /**
   * Get the current access token
   */
  getToken() {
    return this.token;
  }

  /**
   * Get the current redirect URI based on window location
   */
  getRedirectUri() {
    // Use current page URL without hash/query as redirect URI
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    return url.toString();
  }

  /**
   * Generate a random state parameter for CSRF protection
   */
  generateState() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Start the OAuth login flow - redirects to GitLab
   */
  login() {
    if (!this.isConfigured()) {
      throw new Error('OAuth not configured. Set GITLAB_OAUTH_CONFIG.clientId in gitlab-oauth.js');
    }

    // Generate and store state for CSRF protection
    const state = this.generateState();
    sessionStorage.setItem(GITLAB_OAUTH_CONFIG.stateKey, state);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: GITLAB_OAUTH_CONFIG.clientId,
      redirect_uri: this.getRedirectUri(),
      response_type: 'token',
      scope: GITLAB_OAUTH_CONFIG.scopes,
      state: state
    });

    const authUrl = `${GITLAB_OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;

    // Redirect to GitLab
    window.location.href = authUrl;
  }

  /**
   * Handle OAuth callback - extract token from URL fragment
   * Call this on page load to check for OAuth response
   * @returns {boolean} True if callback was handled
   */
  handleCallback() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) {
      return false;
    }

    // Parse the hash fragment
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    // Clear the hash from URL (clean up)
    history.replaceState(null, '', window.location.pathname + window.location.search);

    // Check for errors
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      throw new Error(`GitLab login failed: ${errorDescription || error}`);
    }

    // Verify state to prevent CSRF
    const storedState = sessionStorage.getItem(GITLAB_OAUTH_CONFIG.stateKey);
    sessionStorage.removeItem(GITLAB_OAUTH_CONFIG.stateKey);

    if (state !== storedState) {
      console.error('OAuth state mismatch - possible CSRF attack');
      throw new Error('Login failed: security validation error');
    }

    if (!accessToken) {
      throw new Error('No access token received from GitLab');
    }

    // Store the token
    this.saveToken(accessToken);

    return true;
  }

  /**
   * Log out - clear stored token
   */
  logout() {
    this.token = null;
    try {
      localStorage.removeItem(GITLAB_OAUTH_CONFIG.tokenKey);
    } catch (e) {
      // localStorage might be disabled
    }
  }

  /**
   * Save token to localStorage
   */
  saveToken(token) {
    this.token = token;
    try {
      localStorage.setItem(GITLAB_OAUTH_CONFIG.tokenKey, token);
    } catch (e) {
      // localStorage might be disabled
    }
  }

  /**
   * Load token from localStorage
   */
  loadToken() {
    try {
      this.token = localStorage.getItem(GITLAB_OAUTH_CONFIG.tokenKey);
    } catch (e) {
      this.token = null;
    }
  }

  /**
   * Get user info from GitLab API (to display username)
   * @returns {Promise<Object>} User info {username, name, avatar_url}
   */
  async getUserInfo() {
    if (!this.token) {
      return null;
    }

    try {
      // Use the CORS proxy to fetch user info
      const corsProxy = GITLAB_CONFIG.corsProxy;
      const apiUrl = 'https://gitlab.com/api/v4/user';
      const response = await fetch(corsProxy + encodeURIComponent(apiUrl), {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token is invalid/expired, clear it
          this.logout();
          return null;
        }
        throw new Error(`Failed to get user info: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.warn('Failed to fetch user info:', error.message);
      return null;
    }
  }
}

// Global OAuth instance
const gitlabOAuth = new GitLabOAuth();
