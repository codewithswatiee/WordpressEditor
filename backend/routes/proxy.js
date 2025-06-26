const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');
const createSelectionMiddleware = require('./injectSelectionScript');

// Store active proxy handlers
const activeProxies = {};
const trackingEvents = [];
const selectedContent = [];

// Enhanced tracking script to inject into HTML pages
const trackingScript = `
<script>
(function() {
  console.log("WordPress Viewer Tracking initialized");
  
  // Global state
  let selectionMode = false;
  let highlightedElements = [];
  let selectedPostIds = [];
  
  // Initialize from sessionStorage if available
  try {
    const storedSelectionMode = sessionStorage.getItem('selectionModeActive');
    if (storedSelectionMode === 'true') {
      console.log('Initializing with selection mode enabled from sessionStorage');
      selectionMode = true;
    }
  } catch (e) {
    console.error('Error reading from sessionStorage:', e);
  }
  
  // Check for stored selection mode in parent window
  window.addEventListener('message', function(event) {
    // If we receive a selection mode change message
    if (event.data && event.data.type === 'selection_mode_change') {
      console.log('Received selection mode change:', event.data.enabled);
      // Update selection mode
      selectionMode = event.data.enabled;
      
      // Store in sessionStorage for persistence
      try {
        sessionStorage.setItem('selectionModeActive', selectionMode);
      } catch (e) {
        console.error('Error writing to sessionStorage:', e);
      }
      
      // Update UI to match
      const toggleButton = document.getElementById('wp-viewer-selection-toggle');
      if (toggleButton) {
        toggleButton.textContent = selectionMode ? 'Disable Selection Mode' : 'Enable Selection Mode';
        toggleButton.style.background = selectionMode ? '#d54e21' : '#0073aa';
      }
      
      // Toggle highlights
      if (selectionMode) {
        highlightWordPressContent();
      } else {
        removeAllHighlights();
      }
    }
  });
  
  // Create selection UI elements
  const createSelectionUI = () => {
    // Create selection mode toggle button
    const toggleButton = document.createElement('button');
    toggleButton.textContent = selectionMode ? 'Disable Selection Mode' : 'Enable Selection Mode';
    toggleButton.id = 'wp-viewer-selection-toggle';
    toggleButton.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 99999; padding: 8px 12px; background: ' + (selectionMode ? '#d54e21' : '#0073aa') + '; color: white; border: none; border-radius: 4px; cursor: pointer; font-family: sans-serif;';
    
    // Create selection info panel
    const infoPanel = document.createElement('div');
    infoPanel.id = 'wp-viewer-selection-info';
    infoPanel.style.cssText = 'position: fixed; bottom: 10px; right: 10px; z-index: 99999; padding: 10px; background: rgba(255, 255, 255, 0.9); border: 1px solid #ccc; border-radius: 4px; font-family: sans-serif; max-width: 300px; display: none;';
    
    // Add to DOM
    document.body.appendChild(toggleButton);
    document.body.appendChild(infoPanel);
    
    // Toggle selection mode on click
    toggleButton.addEventListener('click', () => {
      selectionMode = !selectionMode;
      toggleButton.textContent = selectionMode ? 'Disable Selection Mode' : 'Enable Selection Mode';
      toggleButton.style.background = selectionMode ? '#d54e21' : '#0073aa';
      
      // Store in sessionStorage for persistence
      try {
        sessionStorage.setItem('selectionModeActive', selectionMode);
      } catch (e) {
        console.error('Error writing to sessionStorage:', e);
      }
      
      // Notify parent window about selection mode change
      window.parent.postMessage(
        { type: 'selection_mode_change', enabled: selectionMode },
        '*'
      );
      
      if (selectionMode) {
        highlightWordPressContent();
        infoPanel.style.display = 'block';
        infoPanel.textContent = 'Selection mode active. Click on any element to extract WordPress content info.';
      } else {
        removeAllHighlights();
        infoPanel.style.display = 'none';
      }
    });
    
    // If selection mode is already enabled from previous page, highlight content
    if (selectionMode) {
      highlightWordPressContent();
      infoPanel.style.display = 'block';
      infoPanel.textContent = 'Selection mode active. Click on any element to extract WordPress content info.';
    }
  };
  
  // Highlight WordPress content elements (new function)
  const highlightWordPressContent = () => {
    // Common WordPress content selectors
    const selectors = [
      'article',
      '.post',
      '.page',
      '.type-post', 
      '.type-page',
      '.hentry',
      '.entry',
      '.post-content',
      '.entry-content',
      '.wp-block',
      '.block-editor-block-list__block'
    ];
    
    // Find elements matching our selectors
    let wpElements = [];
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      wpElements.push(...elements);
    });
    
    // Make elements array unique
    wpElements = [...new Set(wpElements)];
    
    // Highlight each element
    wpElements.forEach(element => {
      // Store original styles
      const originalOutline = element.style.outline;
      const originalCursor = element.style.cursor;
      
      // Apply highlight styles
      element.style.outline = '2px solid #0073aa';
      element.style.cursor = 'pointer';
      
      // Store reference to revert later
      highlightedElements.push({
        element,
        originalStyles: {
          outline: originalOutline,
          cursor: originalCursor
        }
      });
      
      // Add click handler if not already added
      if (!element.hasWpViewerClickHandler) {
        element.hasWpViewerClickHandler = true;
        element.addEventListener('click', (e) => {
          if (selectionMode) {
            e.preventDefault();
            e.stopPropagation();
            
            const info = extractElementInfo(element);
            if (info.postId) {
              // Send selection to parent
              window.parent.postMessage(
                { 
                  type: 'content_selection',
                  ...info,
                  url: window.location.href,
                  timestamp: Date.now()
                },
                '*'
              );
              
              // Show confirmation
              const infoPanel = document.getElementById('wp-viewer-selection-info');
              if (infoPanel) {
                infoPanel.innerHTML = \`<strong>Selected:</strong><br>\${info.elementType} (ID: \${info.postId})\`;
                infoPanel.style.display = 'block';
                
                // Hide after 3 seconds
                setTimeout(() => {
                  infoPanel.style.display = 'none';
                }, 3000);
              }
            }
          }
        });
      }
    });
  };
  
  // Extract information from elements without adding visual highlights
  const extractElementInfo = (element) => {
    // Try to extract post/page ID
    const postId = extractPostId(element);
    const elementType = identifyElementType(element);
    const content = element.innerText.trim().substring(0, 150);
    const href = element.href || element.querySelector('a')?.href || '';
    
    return {
      postId,
      elementType,
      content,
      href,
      selector: generateSelector(element)
    };
  };
  
  // Remove all highlights
  const removeAllHighlights = () => {
    // Revert all highlighted elements to original styles
    highlightedElements.forEach(item => {
      item.element.style.outline = item.originalStyles.outline;
      item.element.style.cursor = item.originalStyles.cursor;
    });
    
    // Clear the array
    highlightedElements = [];
    
    // Hide info panel
    const infoPanel = document.getElementById('wp-viewer-selection-info');
    if (infoPanel) {
      infoPanel.style.display = 'none';
    }
  };
  
  // Extract post ID from element
  const extractPostId = (element) => {
    // Method 1: Check for data attributes
    const postId = element.getAttribute('data-post-id') || 
                  element.getAttribute('id')?.match(/post-(\\d+)/)?.at(1) ||
                  element.getAttribute('class')?.match(/postid-(\\d+)/)?.at(1);
    
    if (postId) return postId;
    
    // Method 2: Check URLs in the element
    const links = element.querySelectorAll('a');
    for (const link of links) {
      const urlPostId = extractPostIdFromUrl(link.href);
      if (urlPostId) return urlPostId;
    }
    
    // Method 3: Check if the element itself is a link
    if (element.tagName === 'A' && element.href) {
      return extractPostIdFromUrl(element.href);
    }
    
    // Method 4: Check parent elements
    let parent = element.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const parentPostId = parent.getAttribute('data-post-id') || 
                         parent.getAttribute('id')?.match(/post-(\\d+)/)?.at(1) ||
                         parent.getAttribute('class')?.match(/postid-(\\d+)/)?.at(1);
      if (parentPostId) return parentPostId;
      parent = parent.parentElement;
    }
    
    return null;
  };
  
  // Extract post ID from URL
  const extractPostIdFromUrl = (url) => {
    if (!url) return null;
    
    // Common WordPress URL patterns
    const patterns = [
      /\\/p=([0-9]+)/,                    // /?p=123
      /\\/posts?\\/([0-9]+)/,              // /post/123 or /posts/123
      /\\/([0-9]{4})\\/([0-9]{2})\\/([0-9]{2})\\/([^/]+)(?:\\/([0-9]+))?\\//, // Date-based permalink with possible ID
      /\\/(?:.+?)\\/([0-9]+)\\/?$/       // Anything ending with /123/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1] || match[match.length - 1];
      }
    }
    
    return null;
  };
  
  // Identify the type of WordPress element
  const identifyElementType = (element) => {
    // Check element classes and IDs for common WordPress patterns
    const classList = element.className || '';
    const id = element.id || '';
    const tagName = element.tagName.toLowerCase();
    
    if (classList.includes('post') || id.includes('post')) return 'Post';
    if (classList.includes('page') || id.includes('page')) return 'Page';
    if (classList.includes('attachment') || id.includes('attachment')) return 'Media';
    if (classList.includes('widget') || id.includes('widget')) return 'Widget';
    if (classList.includes('comment') || id.includes('comment')) return 'Comment';
    if (classList.includes('nav') || id.includes('nav') || classList.includes('menu')) return 'Navigation';
    if (tagName === 'article') return 'Article';
    if (tagName === 'header') return 'Header';
    if (tagName === 'footer') return 'Footer';
    if (tagName === 'aside') return 'Sidebar';
    if (tagName === 'section') return 'Section';
    
    return 'Content Element';
  };
  
  // Generate a CSS selector for the element (simplified)
  const generateSelector = (element) => {
    if (!element) return '';
    
    const parts = [];
    let current = element;
    
    // Build selector from element up to body (max 3 levels)
    for (let i = 0; i < 3 && current && current !== document.body; i++) {
      let part = current.tagName.toLowerCase();
      
      if (current.id) {
        part += '#' + current.id;
      } else if (current.className) {
        const classes = Array.from(current.classList).join('.');
        if (classes) {
          part += '.' + classes;
        }
      }
      
      parts.unshift(part);
      current = current.parentElement;
    }
    
    return parts.join(' > ');
  };
  
  // Identify WordPress content elements in the page - but don't highlight them
  const identifyWordPressContent = () => {
    // This function now just for debugging purposes
    // We could remove it entirely, but keeping it helps with debugging
    
    // Common WordPress content selectors
    const selectors = [
      'article',
      '.post',
      '.page',
      '.type-post', 
      '.type-page',
      '.hentry',
      '.entry',
      '.post-content',
      '.entry-content',
      '.wp-block',
      '.block-editor-block-list__block'
    ];
    
    // Find all potential WordPress content elements
    const potentialElements = [];
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => potentialElements.push(el));
    });
    
    // Add links that might be to posts/pages
    const links = document.querySelectorAll('a[href*="/p="], a[href*="/page/"], a[href*="/post/"]');
    links.forEach(link => {
      if (extractPostIdFromUrl(link.href)) {
        potentialElements.push(link);
      }
    });
    
    console.log('Found', potentialElements.length, 'potential WordPress elements');
    return potentialElements.length;
  };
  
  // Function to send tracking data to server
  const sendTrackingData = (data) => {
    fetch('/proxy/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(err => console.log('Tracking error', err));
    
    // Also notify parent window
    try {
      window.parent.postMessage(data, '*');
    } catch (e) {
      console.log('Error posting to parent:', e);
    }
  };
  
  // Track clicks (keep original functionality)
  document.addEventListener('click', function(e) {
    // Skip if in selection mode
    if (selectionMode) return;
    
    const path = e.composedPath().map(node => {
      if (node.tagName) {
        return node.tagName.toLowerCase() + 
          (node.id ? '#' + node.id : '') + 
          (node.className ? '.' + node.className.replace(/\\s+/g, '.') : '');
      }
    }).filter(Boolean);
    
    const target = e.target;
    const data = {
      type: 'click',
      path: path.slice(0, 3), // First 3 elements in path
      tagName: target.tagName,
      id: target.id,
      className: target.className,
      href: target.href || '',
      innerText: target.innerText ? target.innerText.substring(0, 50) : '',
      timestamp: new Date().toISOString()
    };
    
    // Also check if this click might be on WordPress content
    const postId = extractPostId(target);
    if (postId) {
      data.postId = postId;
      data.elementType = identifyElementType(target);
    }
    
    sendTrackingData(data);
  });
  
  // Track selections (keep original functionality)
  document.addEventListener('selectionchange', function() {
    // Skip if in selection mode
    if (selectionMode) return;
    
    const selection = document.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      const data = {
        type: 'selection',
        text: selection.toString().substring(0, 200),
        timestamp: new Date().toISOString()
      };
      
      sendTrackingData(data);
    }
  });
  
  // Add document-wide click listener when in selection mode
  document.addEventListener('click', function(e) {
    if (selectionMode) {
      // Find the clicked element or its closest content parent
      let target = e.target;
      let contentFound = false;
      let contentInfo = null;
      
      // Try the clicked element first
      const postId = extractPostId(target);
      if (postId) {
        contentInfo = extractElementInfo(target);
        contentFound = true;
      } else {
        // If no post ID found, try to find a parent WordPress element
        let element = target;
        for (let i = 0; i < 5; i++) { // Check up to 5 levels up
          if (!element || element === document.body) break;
          
          const parentPostId = extractPostId(element);
          if (parentPostId) {
            contentInfo = extractElementInfo(element);
            contentFound = true;
            break;
          }
          
          element = element.parentElement;
        }
      }
      
      if (contentFound && contentInfo) {
        const infoPanel = document.getElementById('wp-viewer-selection-info');
        if (infoPanel) {
          // Show info about the selected content
          infoPanel.innerHTML = 
            '<div>' +
            '<h3 style="margin-top: 0;">WordPress Content Selected</h3>' +
            '<p><strong>Type:</strong> ' + contentInfo.elementType + '</p>' +
            '<p><strong>ID:</strong> ' + (contentInfo.postId || 'unknown') + '</p>' +
            (contentInfo.content ? '<p><strong>Content:</strong> ' + contentInfo.content.substring(0, 50) + '...</p>' : '') +
            (contentInfo.href ? '<p><a href="' + contentInfo.href + '" target="_blank" style="color: #0073aa;">View Content</a></p>' : '') +
            '</div>';
        }
        
        // Create selection data
        const selectionData = {
          type: 'content_selection',
          elementType: contentInfo.elementType,
          postId: contentInfo.postId || 'unknown',
          content: contentInfo.content,
          url: contentInfo.href,
          selector: contentInfo.selector,
          timestamp: new Date().toISOString()
        };
        
        // Send to parent/tracking system
        sendTrackingData(selectionData);
        
        // Don't prevent default behavior - allow normal navigation
        // Unless specifically requested by holding shift key
        if (e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }
  });
  
  // Initialize when DOM is fully loaded
  if (document.readyState === 'complete') {
    createSelectionUI();
  } else {
    window.addEventListener('load', createSelectionUI);
  }
})();
</script>
`;

// Track user interactions
router.post('/track', (req, res) => {
    const data = req.body;
    console.log('==========================================');
    console.log('SERVER: Tracked interaction:', data);
    console.log('==========================================');
    
    // Store tracking event for SSE clients
    trackingEvents.push(data);
    
    // Store selected content separately for WP API lookups
    if (data.type === 'content_selection' || (data.type === 'click' && data.postId)) {
        console.log('SERVER: Content selection detected with post ID:', data.postId);
        selectedContent.push(data);
        
        // If we have post ID and it's a WordPress.com site, try to fetch more details
        if (data.postId && data.url && data.url.includes('wordpress.com')) {
            // Extract site domain from URL
            let siteDomain = '';
            try {
                const url = new URL(data.url);
                siteDomain = url.hostname;
                console.log('SERVER: Extracted site domain:', siteDomain);
            } catch (e) {
                // Try simple extraction
                const match = data.url.match(/https?:\/\/([^\/]+)/);
                if (match) {
                    siteDomain = match[1];
                    console.log('SERVER: Extracted site domain (fallback):', siteDomain);
                }
            }
            
            if (siteDomain) {
                console.log(`SERVER: Will attempt to fetch WordPress content for ${siteDomain}, postId: ${data.postId}`);
                console.log(`SERVER: Access token available: ${!!req.session.access_token}`);
                
                fetchWordPressContent(siteDomain, data.postId, req.session.access_token)
                    .then(postData => {
                        if (postData) {
                            console.log('SERVER: Successfully fetched WordPress content data:', postData);
                            
                            // Add the detailed data to our selection
                            const extendedData = {
                                ...data,
                                wpApiData: postData,
                                enriched: true
                            };
                            
                            // Replace the original entry with enriched data
                            const index = selectedContent.findIndex(item => 
                                item.timestamp === data.timestamp && item.postId === data.postId
                            );
                            
                            if (index !== -1) {
                                selectedContent[index] = extendedData;
                                console.log('SERVER: Updated existing selection with API data');
                            } else {
                                selectedContent.push(extendedData);
                                console.log('SERVER: Added new selection with API data');
                            }
                            
                            // Also add to tracking events
                            trackingEvents.push(extendedData);
                        } else {
                            console.log('SERVER: No WordPress content data was returned');
                        }
                    })
                    .catch(err => {
                        console.error('SERVER: Error fetching WordPress content:', err.message);
                        if (err.response) {
                            console.error('SERVER: Response status:', err.response.status);
                            console.error('SERVER: Response data:', err.response.data);
                        }
                    });
            }
        }
    }
    
    // Keep only last 100 events
    if (trackingEvents.length > 100) {
        trackingEvents.shift();
    }
    if (selectedContent.length > 50) {
        selectedContent.shift();
    }
    
    res.json({ success: true });
});

// Get selected content
router.get('/selected-content', (req, res) => {
    res.json(selectedContent);
});

// Fetch WordPress content details using WP REST API
async function fetchWordPressContent(siteDomain, postId, accessToken) {
    console.log(`Fetching WordPress content for ${siteDomain}, postId: ${postId}, hasToken: ${!!accessToken}`);
    
    try {
        // For WordPress.com sites
        if (siteDomain.includes('wordpress.com')) {
            console.log(`Detected WordPress.com site: ${siteDomain}`);
            
            // Try post endpoint first
            try {
                console.log(`Trying post endpoint for ID: ${postId}`);
                const postUrl = `https://public-api.wordpress.com/wp/v2/sites/${siteDomain}/posts/${postId}`;
                console.log(`API URL: ${postUrl}`);
                
                const headers = accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
                console.log(`Using headers:`, headers);
                
                const postResponse = await axios.get(postUrl, { headers });
                
                console.log(`Post API response status: ${postResponse.status}`);
                console.log(`Post API response data:`, postResponse.data);
                
                return {
                    type: 'post',
                    id: postResponse.data.id,
                    title: postResponse.data.title?.rendered || '',
                    excerpt: postResponse.data.excerpt?.rendered || '',
                    date: postResponse.data.date,
                    link: postResponse.data.link,
                    author: postResponse.data.author
                };
            } catch (err) {
                // If not a post, try page endpoint
                console.log(`Post endpoint failed with error:`, err.message);
                console.log(`Response status:`, err.response?.status);
                
                if (err.response && err.response.status === 404) {
                    try {
                        console.log(`Trying page endpoint for ID: ${postId}`);
                        const pageUrl = `https://public-api.wordpress.com/wp/v2/sites/${siteDomain}/pages/${postId}`;
                        console.log(`API URL: ${pageUrl}`);
                        
                        const headers = accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
                        const pageResponse = await axios.get(pageUrl, { headers });
                        
                        console.log(`Page API response status: ${pageResponse.status}`);
                        console.log(`Page API response data:`, pageResponse.data);
                        
                        return {
                            type: 'page',
                            id: pageResponse.data.id,
                            title: pageResponse.data.title?.rendered || '',
                            excerpt: pageResponse.data.excerpt?.rendered || '',
                            date: pageResponse.data.date,
                            link: pageResponse.data.link,
                            author: pageResponse.data.author
                        };
                    } catch (pageErr) {
                        console.error(`Page endpoint failed with error:`, pageErr.message);
                        console.log(`Response status:`, pageErr.response?.status);
                        return null;
                    }
                } else {
                    console.error(`Post endpoint failed with error:`, err.message);
                    return null;
                }
            }
        }
        
        // For self-hosted WordPress sites (would need different authentication)
        else {
            console.log(`Detected self-hosted WordPress site: ${siteDomain}`);
            
            // First try to determine if site has WP REST API available
            try {
                // Check if REST API is available
                console.log(`Checking REST API availability at https://${siteDomain}/wp-json/`);
                const apiCheck = await axios.get(`https://${siteDomain}/wp-json/`, { 
                    timeout: 3000 
                });
                
                console.log(`REST API check status: ${apiCheck.status}`);
                
                if (apiCheck.data) {
                    // Try post endpoint
                    try {
                        console.log(`Trying self-hosted post endpoint for ID: ${postId}`);
                        const postResponse = await axios.get(
                            `https://${siteDomain}/wp-json/wp/v2/posts/${postId}`
                        );
                        
                        console.log(`Self-hosted post response:`, postResponse.data);
                        
                        return {
                            type: 'post',
                            id: postResponse.data.id,
                            title: postResponse.data.title?.rendered || '',
                            excerpt: postResponse.data.excerpt?.rendered || '',
                            date: postResponse.data.date,
                            link: postResponse.data.link
                        };
                    } catch (postErr) {
                        // Try page endpoint if post fails
                        console.log(`Self-hosted post endpoint failed:`, postErr.message);
                        
                        try {
                            console.log(`Trying self-hosted page endpoint for ID: ${postId}`);
                            const pageResponse = await axios.get(
                                `https://${siteDomain}/wp-json/wp/v2/pages/${postId}`
                            );
                            
                            console.log(`Self-hosted page response:`, pageResponse.data);
                            
                            return {
                                type: 'page',
                                id: pageResponse.data.id,
                                title: pageResponse.data.title?.rendered || '',
                                excerpt: pageResponse.data.excerpt?.rendered || '',
                                date: pageResponse.data.date,
                                link: pageResponse.data.link
                            };
                        } catch (pageErr) {
                            console.error(`Self-hosted page endpoint failed:`, pageErr.message);
                            return null;
                        }
                    }
                }
            } catch (err) {
                console.log(`Site may not be WordPress or REST API not available: ${err.message}`);
                return null;
            }
        }
    } catch (err) {
        console.error(`Error in WordPress content fetching:`, err.message);
        return null;
    }
    
    return null;
}

// Server-Sent Events for real-time tracking updates
router.get('/track-events', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send any existing events immediately
    trackingEvents.forEach(event => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    
    // Function to send new events
    const sendEvent = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    
    // Add this client to listeners
    const eventIndex = trackingEvents.length;
    
    // Check for new events every second
    const intervalId = setInterval(() => {
        // Send any new events
        for (let i = eventIndex; i < trackingEvents.length; i++) {
            sendEvent(trackingEvents[i]);
        }
    }, 1000);
    
    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(intervalId);
    });
});

// Simple proxy route - updated to use the selection middleware with v3.x API
router.get('/simple', (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing URL parameter');
  }

  try {
    // Ensure the URL is properly formatted
    if (!targetUrl.match(/^https?:\/\//)) {
      targetUrl = 'https://' + targetUrl;
    }

    // Parse the URL to ensure it's valid
    const parsedUrl = new URL(targetUrl);
    console.log(`Proxying to: ${targetUrl} (${parsedUrl.hostname})`);

    // Create proxy with self-handled response
    const proxy = createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      followRedirects: true,
      selfHandleResponse: true, // Required to modify the response
      on: {
        proxyRes: createSelectionMiddleware(),
        error: (err, req, res) => {
          console.error('Proxy error:', err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Proxy Error: ${err.message}`);
        }
      },
      router: (req) => {
        // This ensures the proxy uses the full target URL rather than just the hostname
        return targetUrl;
      },
      pathRewrite: (path, req) => {
        // Extract the path from the original target URL provided in the query string
        try {
          const targetUrl = new URL(req.query.url);
          // Return the pathname and search parameters from the target URL
          // If the original URL had no path, targetUrl.pathname will be '/'
          return targetUrl.pathname + targetUrl.search;
        } catch (e) {
          // Fallback if URL parsing fails (should not happen often with checks above)
          console.error('Error parsing target URL in pathRewrite:', e);
          return '/'; // Default to root path on error
        }
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
      },
    });

    // Use the proxy for this request
    proxy(req, res, (err) => {
      if (err) {
        console.error('Proxy error in callback:', err);
        if (!res.headersSent) {
          res.status(500).send('Proxy error: ' + err.message);
        }
      }
    });
  } catch (error) {
    console.error('Error creating proxy:', error);
    res.status(500).send('Error creating proxy: ' + error.message);
  }
});

// Create dynamic proxy routes
router.post('/create', (req, res) => {
    const { targetUrl } = req.body;
    
    if (!targetUrl) {
        return res.status(400).json({ error: 'Target URL is required' });
    }
    
    try {
        // Create a unique ID for this proxy
        const proxyId = Buffer.from(targetUrl).toString('base64');
        
        // Store the target URL for simple proxy method
        activeProxies[proxyId] = {
            url: targetUrl,
            created: new Date().toISOString()
        };
        
        // Return the proxy ID for the client to use with the simple proxy
        res.json({ 
            success: true, 
            proxyId: proxyId, 
            proxyUrl: `/proxy/simple?url=${encodeURIComponent(targetUrl)}`
        });
    } catch (error) {
        console.error('Proxy creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Handle requests for proxy info
router.get('/info/:proxyId', (req, res) => {
    const proxyId = req.params.proxyId;
    
    if (!activeProxies[proxyId]) {
        return res.status(404).json({ error: 'Proxy not found' });
    }
    
    res.json(activeProxies[proxyId]);
});

// Get active proxy info
router.get('/active', (req, res) => {
    const activeList = Object.keys(activeProxies).map(id => ({
        id: id,
        url: activeProxies[id].url,
        created: activeProxies[id].created
    }));
    
    res.json(activeList);
});

// Direct iframe method
router.get('/iframe', (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).send('URL parameter is required');
    }
    
    res.send(`
        <html>
        <head>
            <title>WordPress Viewer</title>
            <style>
                body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
                iframe { width: 100%; height: 100%; border: 0; }
            </style>
            <script>
                ${trackingScript}
                
                // Setup message passing from iframe to parent window
                window.addEventListener('message', function(event) {
                    // Pass tracking data to parent
                    window.parent.postMessage(event.data, '*');
                });
            </script>
        </head>
        <body>
            <iframe src="${url}" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
        </body>
        </html>
    `);
});

// Add this at the beginning of the file, right after the router definition
router.use((req, res, next) => {
    console.log(`SERVER: ${req.method} ${req.url}`);
    next();
});

// Add a new endpoint for fetching post data
router.post('/fetch-post-data', async (req, res) => {
  const { postId, slug, domain } = req.body;
  
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required' });
  }
  
  if (!postId && !slug) {
    return res.status(400).json({ error: 'Either postId or slug is required' });
  }
  
  try {
    const postData = await fetchWordPressContent(domain, postId, slug);
    
    if (postData) {
      res.json({ success: true, data: postData });
    } else {
      res.status(404).json({ error: 'Post not found' });
    }
  } catch (error) {
    console.error('Error fetching post data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Function to fetch WordPress content data
async function fetchWordPressContent(domain, postId, slug) {
  try {
    // Make sure domain is properly formatted without protocol
    const cleanDomain = domain.replace(/^https?:\/\//i, '');
    let apiUrl;
    
    // Determine which endpoint to use
    if (postId) {
      // If we have a postId, we need to determine if it's a post, page, or something else
      if (typeof postId === 'string' && postId.includes(':')) {
        // Handle special formats like 'category:name' or 'slug:name'
        const [type, value] = postId.split(':');
        
        if (type === 'category') {
          apiUrl = `https://${cleanDomain}/wp-json/wp/v2/categories?slug=${encodeURIComponent(value)}`;
        } else if (type === 'tag') {
          apiUrl = `https://${cleanDomain}/wp-json/wp/v2/tags?slug=${encodeURIComponent(value)}`;
        } else if (type === 'slug') {
          slug = value;
          // Continue with slug fetching below
        } else {
          return null; // Unhandled special type
        }
      } else {
        // Try to fetch by numeric ID
        // First try as a post
        apiUrl = `https://${cleanDomain}/wp-json/wp/v2/posts/${postId}`;
        
        try {
          const response = await axios.get(apiUrl);
          return response.data;
        } catch (error) {
          // If it fails, try as a page
          if (error.response && error.response.status === 404) {
            apiUrl = `https://${cleanDomain}/wp-json/wp/v2/pages/${postId}`;
            try {
              const pageResponse = await axios.get(apiUrl);
              return pageResponse.data;
            } catch (pageError) {
              // Not a post or page, continue with other approaches
            }
          }
        }
      }
    }
    
    // If we have a slug or couldn't fetch by ID directly
    if (slug || (typeof postId === 'string' && postId.includes('slug:'))) {
      // If postId is in the format 'slug:value', extract the value
      if (typeof postId === 'string' && postId.includes('slug:')) {
        slug = postId.split(':')[1];
      }
      
      // Try posts endpoint
      apiUrl = `https://${cleanDomain}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`;
      
      try {
        const response = await axios.get(apiUrl);
        if (response.data && response.data.length > 0) {
          return response.data[0];
        }
      } catch (error) {
        // If it fails, continue to pages
      }
      
      // Try pages endpoint
      apiUrl = `https://${cleanDomain}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`;
      
      try {
        const response = await axios.get(apiUrl);
        if (response.data && response.data.length > 0) {
          return response.data[0];
        }
      } catch (error) {
        // If it fails, return null
      }
    }
    
    // Nothing found
    return null;
  } catch (error) {
    console.error('Error fetching WordPress content:', error);
    return null;
  }
}

// Endpoint to fetch WordPress posts
router.get('/posts', async (req, res) => {
  try {
    const { accessToken } = req.session;
    const { domain } = req.query;

    if (!accessToken) {
      return res.status(401).json({ error: 'No access token found. Please authenticate first.' });
    }

    if (!domain) {
      return res.status(400).json({ error: 'WordPress site domain is required' });
    }

    const apiUrl = `https://${domain}/wp-json/wp/v2/posts`;
    
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      params: {
        per_page: 10, // Limit to 10 posts per page
        _embed: true  // Include featured images and other embedded content
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching WordPress posts:', error);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Error fetching WordPress posts'
    });
  }
});

module.exports = router; 