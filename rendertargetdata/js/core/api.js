// 3dverse API module for fetching render graph assets via WebSocket
(function(global) {
    'use strict';

    const API_WS_URL = 'wss://api.3dverse.com/legacy/asset/edit';
    const TOKEN_STORAGE = 'rendergraph_viewer_token';

    const ThreeDverseAPI = {
        setLabsToken: function(token) {
            if (token) {
                localStorage.setItem(TOKEN_STORAGE, token);
            } else {
                localStorage.removeItem(TOKEN_STORAGE);
            }
        },

        getLabsToken: function() {
            return localStorage.getItem(TOKEN_STORAGE);
        },

        hasLabsToken: function() {
            return !!this.getLabsToken();
        },

        // Fetch render graph via WebSocket
        fetchLabsRenderGraph: function(assetUUID, token) {
            return new Promise((resolve, reject) => {
                const useToken = token || this.getLabsToken();
                if (!useToken) {
                    reject(new Error('No token. Copy JWT token from Network tab WebSocket URL.'));
                    return;
                }

                if (token) {
                    this.setLabsToken(token);
                }

                const wsUrl = `${API_WS_URL}?token=${useToken}&assetType=renderGraph&assetUUID=${assetUUID}`;
                console.log('Connecting to:', API_WS_URL, 'asset:', assetUUID);

                let ws;
                try {
                    ws = new WebSocket(wsUrl);
                } catch (err) {
                    reject(new Error('Failed to create WebSocket: ' + err.message));
                    return;
                }

                const timeout = setTimeout(() => {
                    ws.close();
                    reject(new Error('WebSocket connection timeout (15s)'));
                }, 15000);

                ws.onopen = function() {
                    console.log('WebSocket connected, waiting for data...');
                };

                ws.onmessage = function(event) {
                    try {
                        const msg = JSON.parse(event.data);

                        if (msg.type === 'connect-confirmation' && msg.data && msg.data.description) {
                            clearTimeout(timeout);
                            console.log('Got render graph:', msg.data.description.name || 'unnamed');
                            ws.close();
                            resolve(msg.data.description);
                        }
                    } catch (err) {
                        console.warn('Failed to parse WebSocket message:', err);
                    }
                };

                ws.onerror = function(err) {
                    clearTimeout(timeout);
                    console.error('WebSocket error:', err);
                    reject(new Error('WebSocket error'));
                };

                ws.onclose = function(event) {
                    clearTimeout(timeout);
                    if (!event.wasClean) {
                        console.log('WebSocket closed:', event.code, event.reason);
                    }
                };
            });
        },

        // Extract token from a full WebSocket URL
        extractTokenFromUrl: function(url) {
            const match = url.match(/token=([^&]+)/);
            return match ? match[1] : null;
        }
    };

    global.ThreeDverseAPI = ThreeDverseAPI;

})(window);
