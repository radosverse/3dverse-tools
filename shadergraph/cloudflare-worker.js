// Cloudflare Worker CORS Proxy for GitLab API
// Deploy this to Cloudflare Workers (free tier: 100k requests/day)
//
// Deployment:
// 1. Create a Cloudflare account at https://dash.cloudflare.com
// 2. Go to Workers & Pages > Create Worker
// 3. Paste this code and deploy
// 4. Update GITLAB_CONFIG.corsProxy in gitlab-handler.js with your worker URL

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    // Handle CORS preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, PRIVATE-TOKEN, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Require url parameter
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Security: Only allow GitLab API requests
    if (!targetUrl.startsWith('https://gitlab.com/api/')) {
      return new Response(JSON.stringify({ error: 'Only GitLab API URLs allowed' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    try {
      // Build headers to forward to GitLab
      const gitlabHeaders = {
        'User-Agent': 'ShaderGraphVisualizer/1.0'
      };

      // Forward authentication headers if present (for private repo access)
      const privateToken = request.headers.get('PRIVATE-TOKEN');
      if (privateToken) {
        gitlabHeaders['PRIVATE-TOKEN'] = privateToken;
      }
      const authHeader = request.headers.get('Authorization');
      if (authHeader) {
        gitlabHeaders['Authorization'] = authHeader;
      }

      // Forward the request to GitLab
      const response = await fetch(targetUrl, {
        headers: gitlabHeaders
      });

      // Clone response and add CORS headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Expose-Headers', 'X-Total, X-Total-Pages, X-Page, X-Per-Page');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
