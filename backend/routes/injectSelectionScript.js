// injectSelectionScript.js
const zlib = require('zlib');
const stream = require('stream');
const { promisify } = require('util');

// Promisify gunzip and inflate for async/await use
const gunzipAsync = promisify(zlib.gunzip);
const inflateAsync = promisify(zlib.inflate);
const inflateRawAsync = promisify(zlib.inflateRaw);

const createSelectionMiddleware = () => {
  return (proxyRes, req, res) => {
    // Get the content type and status code from the original response
    const contentType = proxyRes.headers['content-type'];
    const statusCode = proxyRes.statusCode;

    // Only process successful HTML responses
    const isHtml = contentType && contentType.includes('text/html');
    const isSuccess = statusCode && statusCode >= 200 && statusCode < 300;

    if (!isHtml || !isSuccess) {
      // If not successful HTML, pass the original response through without modification
      // Copy all headers from the original response
      Object.keys(proxyRes.headers).forEach(key => {
        res.setHeader(key, proxyRes.headers[key]);
      });
      // Set the status code from the original response
      res.statusCode = statusCode || 500;
      // Pipe the original response body directly to the client
      proxyRes.pipe(res);
      return; // Stop further processing for non-HTML or error responses
    }

    // Get the content encoding
    const contentEncoding = proxyRes.headers['content-encoding'];
    
    // For non-HTML responses, just pipe through
    if (!proxyRes.headers['content-type'] || !proxyRes.headers['content-type'].includes('text/html')) {
      // Remove content-encoding headers to prevent browser decoding issues
      delete proxyRes.headers['content-encoding'];
      
      // Copy all headers
      Object.keys(proxyRes.headers).forEach(key => {
        res.setHeader(key, proxyRes.headers[key]);
      });
      
      // Pipe the response directly
      proxyRes.pipe(res);
      return;
    }

    // For HTML responses with compression, we need to decompress, modify, and send uncompressed
    let chunks = [];
    
    // Collect response chunks
    proxyRes.on('data', (chunk) => {
      chunks.push(chunk);
    });

    proxyRes.on('end', async () => {
      try {
        // Combine chunks into a buffer
        const buffer = Buffer.concat(chunks);
        
        // Decompress if needed
        let responseBody;
        if (contentEncoding === 'gzip') {
          responseBody = (await gunzipAsync(buffer)).toString('utf8');
        } else if (contentEncoding === 'deflate') {
          try {
            // Standard deflate
            responseBody = (await inflateAsync(buffer)).toString('utf8');
          } catch (e) {
            // Raw deflate (some servers use this)
            responseBody = (await inflateRawAsync(buffer)).toString('utf8');
          }
        } else {
          // No compression
          responseBody = buffer.toString('utf8');
        }

        // Create the injection script as a normal string (not template literal)
        const selectionScript = '<style>' +
          '/* Override any user-select restrictions on the page */' +
          '* {' +
          '  user-select: text !important;' +
          '  -webkit-user-select: text !important;' +
          '  -moz-user-select: text !important;' +
          '  -ms-user-select: text !important;' +
          '}' +
          
          '/* Styles for highlighted WordPress elements in selection mode */' +
          '.wp-selection-highlight {' +
          '  outline: 2px solidrgb(64, 75, 80) !important;' +
          '  cursor: pointer !important;' +
          '  position: relative !important;' +
          '  transition: all 0.2s ease !important;' +
          '}' +
          
          '.wp-selection-highlight:hover {' +
          '  outline: 3px solid #00a0d2 !important;' +
          '  background-color: rgba(0, 115, 170, 0.05) !important;' +
          '}' +
          
          '.wp-selection-highlight::after {' +
          '  content: "Click to select" !important;' +
          '  position: absolute !important;' +
          '  top: -20px !important;' +
          '  right: 0 !important;' +
          '  background: #0073aa !important;' +
          '  color: white !important;' +
          '  padding: 2px 8px !important;' +
          '  font-size: 10px !important;' +
          '  border-radius: 3px !important;' +
          '  opacity: 0 !important;' +
          '  transition: opacity 0.2s !important;' +
          '  z-index: 9999999 !important;' +
          '  pointer-events: none !important;' +
          '}' +
          
          '.wp-selection-highlight:hover::after {' +
          '  opacity: 1 !important;' +
          '}' +
          '</style>' +
          '<script>' +
          '(function() {' +
          '  console.log("WP Text Selection Script Activated");' +
          '  ' +
          '  // Track selection mode state' +
          '  let selectionModeEnabled = false;' +
          '  ' +
          '  // Listen for selection mode changes from parent window' +
          '  window.addEventListener("message", function(event) {' +
          '    if (event.data && event.data.type === "selection_mode_change") {' +
          '      console.log("Selection mode changed to:", event.data.enabled);' +
          '      selectionModeEnabled = event.data.enabled;' +
          '      ' +
          '      // Toggle WordPress element highlighting' +
          '      if (selectionModeEnabled) {' +
          '        highlightWordPressElements();' +
          '      } else {' +
          '        removeWordPressHighlights();' +
          '      }' +
          '    }' +
          '  });' +
          '  ' +
          '  // Function to highlight WordPress elements' +
          '  function highlightWordPressElements() {' +
          '    // Common WordPress element selectors' +
          '    const wpSelectors = [' +
          '      // Content elements' +
          '      "article", ".post", ".page", ".wp-block", ".entry-content", ' +
          '      ".post-content", ".content-area", ".entry", ' +
          '      ' +
          '      // Headers and titles' +
          '      ".entry-title", ".post-title", "h1.title", ".site-title",' +
          '      ' +
          '      // Media' +
          '      ".wp-post-image", ".attachment-post-thumbnail",' +
          '      ' +
          '      // Navigation' +
          '      ".nav-links", ".post-navigation",' +
          '      ' +
          '      // Common blocks and sections' +
          '      ".wp-block-paragraph", ".wp-block-image", ".wp-block-heading",' +
          '      ".wp-block-gallery", ".wp-block-quote", ".wp-block-button",' +
          '      ' +
          '      // Comments' +
          '      ".comment", ".comment-body", ".comment-content"' +
          '    ];' +
          '    ' +
          '    // Find and highlight elements' +
          '    wpSelectors.forEach(selector => {' +
          '      try {' +
          '        const elements = document.querySelectorAll(selector);' +
          '        elements.forEach(el => {' +
          '          // Add highlight class' +
          '          el.classList.add("wp-selection-highlight");' +
          '          ' +
          '          // Add click event to select the element' +
          '          el.addEventListener("click", handleWpElementClick);' +
          '        });' +
          '      } catch (e) {' +
          '        console.error("Error highlighting selector:", selector, e);' +
          '      }' +
          '    });' +
          '    ' +
          '    console.log("WordPress elements highlighted for selection");' +
          '  }' +
          '  ' +
          '  // Function to remove highlights' +
          '  function removeWordPressHighlights() {' +
          '    const highlightedElements = document.querySelectorAll(".wp-selection-highlight");' +
          '    highlightedElements.forEach(el => {' +
          '      el.classList.remove("wp-selection-highlight");' +
          '      el.removeEventListener("click", handleWpElementClick);' +
          '    });' +
          '    ' +
          '    console.log("WordPress element highlights removed");' +
          '  }' +
          '  ' +
          '  // Handler for WordPress element clicks' +
          '  function handleWpElementClick(e) {' +
          '    // Only process if selection mode is enabled' +
          '    if (!selectionModeEnabled) return;' +
          '    ' +
          '    // Prevent default action and event bubbling' +
          '    e.preventDefault();' +
          '    e.stopPropagation();' +
          '    ' +
          '    // Get element information' +
          '    const element = e.currentTarget;' +
          '    const elementType = element.tagName.toLowerCase();' +
          '    const elementClasses = Array.from(element.classList).join(" ");' +
          '    const elementContent = element.textContent.trim().substring(0, 150);' +
          '    const currentUrl = window.location.href;' +
          '    const parentElementType = element.parentElement ? element.parentElement.tagName.toLowerCase() : "";' +
          '    ' +
          '    // Extract post ID from current page' +
          '    let postId = extractPostIdFromUrl(currentUrl);' +
          '    ' +
          '    // Try to extract post ID from this specific element if possible' +
          '    const elementPostId = extractElementPostId(element);' +
          '    if (elementPostId) {' +
          '      postId = elementPostId;' +
          '    }' +
          '    ' +
          '    // Collect additional metadata' +
          '    const metadata = {' +
          '      elementId: element.id || null,' +
          '      elementClasses,' +
          '      parentElementType,' +
          '      href: element.href || null,' +
          '      title: element.getAttribute("title") || null,' +
          '      ariaLabel: element.getAttribute("aria-label") || null,' +
          '      // Get heading if this element contains or is near a heading' +
          '      nearestHeading: findNearestHeading(element),' +
          '      // Try to determine if this is part of a specific WordPress block' +
          '      wpBlockType: determineWpBlockType(element)' +
          '    };' +
          '    ' +
          '    console.log("WordPress element selected:", { ' +
          '      elementType,' +
          '      elementContent,' +
          '      postId,' +
          '      currentUrl,' +
          '      metadata' +
          '    });' +
          '    ' +
          '    // Send content selection to parent window' +
          '    window.parent.postMessage(' +
          '      {' +
          '        type: "content_selection",' +
          '        elementType,' +
          '        content: elementContent,' +
          '        postId,' +
          '        url: currentUrl,' +
          '        timestamp: Date.now(),' +
          '        metadata' +
          '      },' +
          '      "*"' +
          '    );' +
          '    ' +
          '    // Visual feedback' +
          '    element.style.outline = "3px solid #00a0d2";' +
          '    element.style.backgroundColor = "rgba(0, 160, 210, 0.1)";' +
          '    setTimeout(() => {' +
          '      element.style.outline = "";' +
          '      element.style.backgroundColor = "";' +
          '    }, 1500);' +
          '  }' +
          '  ' +
          '  // Extract post ID from element' +
          '  function extractElementPostId(element) {' +
          '    // Check ID attribute' +
          '    if (element.id) {' +
          '      const idMatch = element.id.match(/post-([0-9]+)/);' +
          '      if (idMatch) return idMatch[1];' +
          '    }' +
          '    ' +
          '    // Check classes' +
          '    const postIdClass = Array.from(element.classList).find(cls => cls.startsWith("postid-"));' +
          '    if (postIdClass) {' +
          '      const classMatch = postIdClass.match(/postid-([0-9]+)/);' +
          '      if (classMatch) return classMatch[1];' +
          '    }' +
          '    ' +
          '    // Check for data attributes' +
          '    if (element.dataset.postId) return element.dataset.postId;' +
          '    if (element.dataset.id) return element.dataset.id;' +
          '    ' +
          '    // Check for links to posts' +
          '    if (element.tagName === "A" && element.href) {' +
          '      // Check for edit links' +
          '      if (element.href.includes("post.php?post=")) {' +
          '        const match = element.href.match(/post=([0-9]+)/);' +
          '        if (match) return match[1];' +
          '      }' +
          '      ' +
          '      // Check for permalink with ID' +
          '      if (element.href.match(/\\/([0-9]+)\\/?$/)) {' +
          '        const match = element.href.match(/\\/([0-9]+)\\/?$/);' +
          '        if (match) return match[1];' +
          '      }' +
          '    }' +
          '    ' +
          '    // Check parent element recursively (up to 3 levels)' +
          '    if (element.parentElement) {' +
          '      // Don\'t go too high in DOM to avoid false positives' +
          '      let parent = element.parentElement;' +
          '      let depth = 0;' +
          '      while (parent && depth < 3) {' +
          '        const parentId = extractElementPostId(parent);' +
          '        if (parentId) return parentId;' +
          '        parent = parent.parentElement;' +
          '        depth++;' +
          '      }' +
          '    }' +
          '    ' +
          '    return null;' +
          '  }' +
          '  ' +
          '  // Find nearest heading to provide context' +
          '  function findNearestHeading(element) {' +
          '    // Check if element itself is a heading' +
          '    if (/^h[1-6]$/i.test(element.tagName)) {' +
          '      return element.textContent.trim();' +
          '    }' +
          '    ' +
          '    // Check for headings inside the element' +
          '    const headingsInside = element.querySelectorAll("h1, h2, h3, h4, h5, h6");' +
          '    if (headingsInside.length > 0) {' +
          '      return headingsInside[0].textContent.trim();' +
          '    }' +
          '    ' +
          '    // Look for previous heading siblings' +
          '    let sibling = element.previousElementSibling;' +
          '    while (sibling) {' +
          '      if (/^h[1-6]$/i.test(sibling.tagName)) {' +
          '        return sibling.textContent.trim();' +
          '      }' +
          '      sibling = sibling.previousElementSibling;' +
          '    }' +
          '    ' +
          '    // Look for headings in parent containers' +
          '    let parent = element.parentElement;' +
          '    while (parent && parent !== document.body) {' +
          '      const parentHeadings = parent.querySelectorAll("h1, h2, h3, h4, h5, h6");' +
          '      if (parentHeadings.length > 0) {' +
          '        // Find the closest heading that appears before the element' +
          '        for (let i = 0; i < parentHeadings.length; i++) {' +
          '          try {' +
          '            // Use bit-wise AND with numeric constant 2 for DOCUMENT_POSITION_PRECEDING' +
          '            if (parent.compareDocumentPosition(parentHeadings[i]) & 2) {' +
          '              return parentHeadings[i].textContent.trim();' +
          '            }' +
          '          } catch (e) {' +
          '            console.error("Error comparing positions:", e);' +
          '          }' +
          '        }' +
          '      }' +
          '      parent = parent.parentElement;' +
          '    }' +
          '    ' +
          '    return null;' +
          '  }' +
          '  ' +
          '  // Determine if element is part of a WordPress block' +
          '  function determineWpBlockType(element) {' +
          '    // Check for block classes' +
          '    const blockClass = Array.from(element.classList).find(cls => cls.startsWith("wp-block-"));' +
          '    if (blockClass) return blockClass;' +
          '    ' +
          '    // Check for block data attributes' +
          '    if (element.dataset.block) return element.dataset.block;' +
          '    ' +
          '    // Check parents for block classes or attributes' +
          '    let parent = element.parentElement;' +
          '    let depth = 0;' +
          '    while (parent && depth < 3) {' +
          '      const parentBlockClass = Array.from(parent.classList).find(cls => cls.startsWith("wp-block-"));' +
          '      if (parentBlockClass) return parentBlockClass;' +
          '      ' +
          '      if (parent.dataset.block) return parent.dataset.block;' +
          '      ' +
          '      parent = parent.parentElement;' +
          '      depth++;' +
          '    }' +
          '    ' +
          '    return null;' +
          '  }' +
          '  ' +
          '  // Function to extract post ID from URL or page elements' +
          '  function extractPostIdFromUrl(url) {' +
          '    try {' +
          '      // Common WP URL patterns for post IDs' +
          '      // Pattern 1: /p=123 (most common)' +
          '      const postParam = url.match(/[?&]p=([0-9]+)/);' +
          '      if (postParam) return postParam[1];' +
          '      ' +
          '      // Pattern 2: /pages/123/' +
          '      const pagesMatch = url.match(/\/pages?\/([0-9]+)\/?/);' +
          '      if (pagesMatch) return pagesMatch[1];' +
          '      ' +
          '      // Pattern 3: /posts/123/' +
          '      const postsMatch = url.match(/\/posts?\/([0-9]+)\/?/);' +
          '      if (postsMatch) return postsMatch[1];' +
          '      ' +
          '      // Pattern 4: Permalink structure with ID at end /2023/05/some-title-123/' +
          '      const permalinkMatch = url.match(/\/([0-9]+)\/?$/);' +
          '      if (permalinkMatch) return permalinkMatch[1];' +
          '      ' +
          '      // Look for post ID in the DOM if we couldn\'t find it in the URL' +
          '      return extractPostIdFromDOM();' +
          '    } catch (e) {' +
          '      console.error("Error extracting post ID from URL:", e);' +
          '      return null;' +
          '    }' +
          '  }' +
          '  ' +
          '  // Extract post ID from DOM elements' +
          '  function extractPostIdFromDOM() {' +
          '    // Method 1: Look for post ID in body or article classes' +
          '    const bodyClasses = document.body.className;' +
          '    const postIdMatch = bodyClasses.match(/postid-([0-9]+)/);' +
          '    if (postIdMatch) return postIdMatch[1];' +
          '    ' +
          '    // Method 2: Look for article with ID' +
          '    const articles = document.querySelectorAll("article[id]");' +
          '    for (let i = 0; i < articles.length; i++) {' +
          '      const article = articles[i];' +
          '      const idMatch = article.id.match(/post-([0-9]+)/);' +
          '      if (idMatch) return idMatch[1];' +
          '    }' +
          '    ' +
          '    // Method 3: Look for edit-post links (only visible to admins)' +
          '    const editLinks = document.querySelectorAll("a[href*=\'post.php?post=\']");' +
          '    if (editLinks.length > 0) {' +
          '      const href = editLinks[0].getAttribute("href");' +
          '      const editMatch = href.match(/post=([0-9]+)/);' +
          '      if (editMatch) return editMatch[1];' +
          '    }' +
          '    ' +
          '    // Method 4: Look for REST API links in header' +
          '    const apiLinks = document.querySelectorAll("link[rel=\'https://api.w.org/\']");' +
          '    if (apiLinks.length > 0) {' +
          '      const href = apiLinks[0].getAttribute("href");' +
          '      // Extract the post ID from the REST API URL if it\'s a single post/page' +
          '      if (href && (href.includes("/wp-json/wp/v2/posts/") || href.includes("/wp-json/wp/v2/pages/"))) {' +
          '        const apiMatch = href.match(/\/(posts|pages)\/([0-9]+)/);' +
          '        if (apiMatch) return apiMatch[2];' +
          '      }' +
          '    }' +
          '    ' +
          '    // If we can\'t find a numeric ID, try to identify page type and slug' +
          '    const canonical = document.querySelector("link[rel=\'canonical\']");' +
          '    if (canonical) {' +
          '      const url = canonical.getAttribute("href");' +
          '      const urlParts = url.split("/").filter(part => part);' +
          '      const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];' +
          '      ' +
          '      if (slug) {' +
          '        // Determine if it\'s likely a page or post based on URL structure or body classes' +
          '        let type = "post";' +
          '        if (bodyClasses.includes("page") || url.includes("/page/")) {' +
          '          type = "page";' +
          '        }' +
          '        return `slug:${type}:${slug}`;' +
          '      }' +
          '    }' +
          '    ' +
          '    return null;' +
          '  }' +
          '  ' +
          '  // Add event listener for text selection' +
          '  document.addEventListener("mouseup", async function(e) {' +
          '    const selection = window.getSelection();' +
          '    const selectedText = selection.toString().trim();' +
          '    ' +
          '    if (selectedText && selectedText.length > 0) {' +
          '      console.log("Text selected:", selectedText);' +
          '      ' +
          '      // Get current URL' +
          '      const currentUrl = window.location.href;' +
          '      ' +
          '      // Extract post ID from URL' +
          '      let postId = extractPostIdFromUrl(currentUrl);' +
          '      ' +
          '      // Get the selection context' +
          '      const selectionContext = getSelectionContext(selection);' +
          '      ' +
          '      // Notify parent window' +
          '      if (window.parent && window.parent !== window) {' +
          '        window.parent.postMessage({' +
          '          type: "WP_TEXT_SELECTION",' +
          '          text: selectedText,' +
          '          context: selectionContext,' +
          '          postId: postId,' +
          '          url: currentUrl,' +
          '          timestamp: Date.now(),' +
          '          containerElement: {' +
          '            tagName: selection.anchorNode?.parentElement?.tagName || "UNKNOWN",' +
          '            className: selection.anchorNode?.parentElement?.className || "",' +
          '            id: selection.anchorNode?.parentElement?.id || ""' +
          '          }' +
          '        }, "*");' +
          '        ' +
          '        // Visual feedback that selection was captured' +
          '        const selectionFeedback = document.createElement("div");' +
          '        selectionFeedback.style.cssText = "position: fixed; top: 10px; right: 10px; background: rgba(0,115,170,0.9); color: white; padding: 8px 16px; border-radius: 4px; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, \\"Segoe UI\\", Roboto, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,0.2); animation: fadeOut 2s forwards 1s;";' +
          '        selectionFeedback.textContent = "Text selected and captured!";' +
          '        ' +
          '        // Add animation style' +
          '        const style = document.createElement("style");' +
          '        style.textContent = "@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }";' +
          '        document.head.appendChild(style);' +
          '        ' +
          '        document.body.appendChild(selectionFeedback);' +
          '        setTimeout(() => {' +
          '          document.body.removeChild(selectionFeedback);' +
          '        }, 3000);' +
          '      }' +
          '    }' +
          '  });' +
          '  ' +
          '  // Helper function to get context around the selected text' +
          '  function getSelectionContext(selection) {' +
          '    if (!selection || selection.rangeCount === 0) return "";' +
          '    ' +
          '    try {' +
          '      const range = selection.getRangeAt(0);' +
          '      ' +
          '      // Get the container element of the selection' +
          '      let container = range.commonAncestorContainer;' +
          '      ' +
          '      // If the container is a text node, get its parent element' +
          '      if (container.nodeType === 3) {' +
          '        container = container.parentElement;' +
          '      }' +
          '      ' +
          '      // Get original text' +
          '      const originalText = container.textContent;' +
          '      ' +
          '      // Get before and after context (up to 100 chars each)' +
          '      const selectedText = selection.toString().trim();' +
          '      const textIndex = originalText.indexOf(selectedText);' +
          '      ' +
          '      if (textIndex === -1) {' +
          '        return { before: "", after: "" };' +
          '      }' +
          '      ' +
          '      const beforeText = originalText.substring(Math.max(0, textIndex - 100), textIndex).trim();' +
          '      const afterText = originalText.substring(textIndex + selectedText.length, Math.min(originalText.length, textIndex + selectedText.length + 100)).trim();' +
          '      ' +
          '      return {' +
          '        before: beforeText,' +
          '        after: afterText,' +
          '        container: {' +
          '          tagName: container.tagName,' +
          '          className: container.className,' +
          '          id: container.id' +
          '        }' +
          '      };' +
          '    } catch (e) {' +
          '      console.error("Error getting selection context:", e);' +
          '      return { before: "", after: "" };' +
          '    }' +
          '  }' +
          '  ' +
          '  // Initialize on page load - check for selection mode in parent window' +
          '  window.addEventListener("DOMContentLoaded", function() {' +
          '    console.log("WP Text Selection script loaded - initializing");' +
          '    ' +
          '    // Check if parent window has set selection mode for us already' +
          '    try {' +
          '      if (sessionStorage.getItem("selectionModeActive") === "true") {' +
          '        console.log("Initializing selection mode from sessionStorage");' +
          '        selectionModeEnabled = true;' +
          '        highlightWordPressElements();' +
          '      }' +
          '    } catch (e) {' +
          '      console.error("Error checking sessionStorage:", e);' +
          '    }' +
          '    ' +
          '    // Create a custom event to notify parent that we\'re ready for selection mode' +
          '    try {' +
          '      if (window.parent !== window) {' +
          '        window.parent.postMessage({ type: "wp_selection_ready" }, "*");' +
          '      }' +
          '    } catch (e) {' +
          '      console.error("Error notifying parent window:", e);' +
          '    }' +
          '  });' +
          '})();' +
          '</script>';

        // Inject the script just before the closing </body> tag
        let modifiedBody = responseBody;
        if (modifiedBody.includes('</body>')) {
          modifiedBody = modifiedBody.replace('</body>', selectionScript + '</body>');
        } else {
          // If no body tag, append at the end
          modifiedBody = modifiedBody + selectionScript;
        }

        // Set headers from original response, but skip compression and content-length
        Object.keys(proxyRes.headers).forEach(key => {
          const lowercaseKey = key.toLowerCase();
          if (lowercaseKey !== 'content-encoding' && lowercaseKey !== 'content-length') {
            res.setHeader(key, proxyRes.headers[key]);
          }
        });

        // Override security headers that might prevent framing
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        
        // Set proper content length for the modified body
        res.setHeader('Content-Length', Buffer.byteLength(modifiedBody));
        
        // Send the response with status code from original response
        res.statusCode = proxyRes.statusCode;
        res.end(modifiedBody);
      } catch (error) {
        console.error('Error processing response:', error);
        // On error, try to send original response without processing
        try {
          res.statusCode = proxyRes.statusCode || 500;
          
          // Copy remaining headers but remove compression headers
          Object.keys(proxyRes.headers).forEach(key => {
            if (key.toLowerCase() !== 'content-encoding') {
              res.setHeader(key, proxyRes.headers[key]);
            }
          });
          
          // Just send the collected chunks without modification
          const buffer = Buffer.concat(chunks);
          res.end(buffer);
        } catch (secondError) {
          console.error('Failed to send original response:', secondError);
          res.statusCode = 502;
          res.end('Proxy Error: Failed to process response');
        }
      }
    });
  };
};

module.exports = createSelectionMiddleware; 