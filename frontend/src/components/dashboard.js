import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSelection } from "../ContentContext";
import { wordpressApi } from "../services/wordpressApi";
import axios from "axios";

axios.defaults.withCredentials = true;
axios.defaults.baseURL = "http://localhost:8000";

function Dashboard() {
  const [url, setUrl] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showContentPanel, setShowContentPanel] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [pastedContent, setPastedContent] = useState("");
  const [wordpressPosts, setWordpressPosts] = useState([]);
  const [accessToken, setAccessToken] = useState("");
  const [fetchingPosts, setFetchingPosts] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editExcerpt, setEditExcerpt] = useState("");
  const iframeRef = useRef(null);
  const navigate = useNavigate();
  const [isPage, setIsPage] = useState(false);
  
  // Use the global selection context
  const { 
    selectedContent, 
    clearSelections,
    addSelectedContent,
    setSelectedContent
  } = useSelection();

  // Add these state variables inside your component
  const [posts, setPosts] = useState([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState(null);

  // Add state for storing original HTML content
  const [originalHtml, setOriginalHtml] = useState("");

  // Helper function to strip HTML content
  const stripHtmlContent = (html) => {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  };

  // Function to extract WordPress post ID from content
  const extractWordPressPostId = (content) => {
    // Common patterns for WordPress post IDs in HTML or JSON
    const patterns = [
      /post-(\d+)/i,                   // CSS class pattern
      /postid=["']?(\d+)["']?/i,       // postid attribute
      /post_id["']?\s*:\s*["']?(\d+)/i,// JSON or JS object notation
      /data-id=["']?(\d+)["']?/i,      // data attribute
      /wp-post-(\d+)/i,                // another common CSS class
      /page-id-(\d+)/i,                // page id class
      /post_id=(\d+)/i                 // URL parameter
    ];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  };

  // Function to fetch WordPress posts using backend endpoint
  const fetchWordPressPosts = async (siteUrl) => {
    if (!siteUrl) {
      console.error("Site URL missing");
      return [];
    }

    setFetchingPosts(true);
    try {
      const posts = await wordpressApi.fetchPosts(siteUrl, accessToken);
      console.log('Fetched WordPress Posts:', posts);
      if (posts.length > 0) {
        console.log(`Successfully fetched ${posts.length} posts from WordPress site`);
        console.log(`First post ID: ${posts[0]?.id}, title: ${posts[0]?.title}`);
      }
      setWordpressPosts(posts);
      return posts;
    } catch (error) {
      console.error("Error fetching WordPress posts:", error.message);
      return [];
    } finally {
      setFetchingPosts(false);
    }
  };
  
  // Function to search for a post by content via backend
  const searchPostByContent = async (siteUrl, content, contentType, accessToken) => {
    if (!siteUrl || !content) {
      console.error("Missing required parameters for post search");
      return null;
    }
    
    try {
      const post = await wordpressApi.searchByContent(siteUrl, content, contentType, accessToken);
      if (post) {
        console.log(`Found matching post:`, post);
        return {
          ...post,
          matchMethod: "api-search-match",
          score: post.score || 9,
          contentType: contentType
        };
      }
      console.log("No matching posts found via backend search");
      return null;
    } catch (error) {
      console.error("Error searching for post by content:", error.message);
      return null;
    }
  };

  // Function to try multiple methods to extract post ID
  const getPostIdByAllMeans = async (content, siteUrl = url, token = accessToken) => {
    console.log("Starting comprehensive post ID detection...");
    
    // Method 1: Extract from HTML patterns
    const idFromPattern = extractWordPressPostId(content);
    if (idFromPattern) {
      console.log("Found post ID via pattern matching:", idFromPattern);
      return {
        id: idFromPattern,
        matchMethod: "pattern-match"
      };
    }
    
    // Method 2: Match with already fetched posts if available
    if (wordpressPosts.length > 0) {
      console.log(`Attempting to match content with ${wordpressPosts.length} cached posts`);
      const contentMatchResult = matchContentWithPosts(content, wordpressPosts);
      
      if (contentMatchResult) {
        console.log("Found matching post via content comparison:", contentMatchResult.id);
        return contentMatchResult;
      }
    }
    
    // Method 3: Direct API search if we have URL and token
    if (siteUrl && token) {
      console.log("Attempting direct API search for post");
      try {
        const searchResult = await searchPostByContent(siteUrl, content, accessToken);
        if (searchResult) {
          console.log("Found post via API search:", searchResult.id);
          return searchResult;
        }
      } catch (error) {
        console.error("Error during API search:", error);
      }
    }
    
    // Method 4: Fetch posts first if none cached but we have URL and token
    if (wordpressPosts.length === 0 && siteUrl && token) {
      console.log("No cached posts available. Fetching posts first...");
      try {
        const fetchedPosts = await fetchWordPressPosts(siteUrl);
        if (fetchedPosts.length > 0) {
          console.log(`Successfully fetched ${fetchedPosts.length} posts, trying content match again`);
          const secondMatchAttempt = matchContentWithPosts(content, fetchedPosts, accessToken);
          
          if (secondMatchAttempt) {
            console.log("Found matching post in newly fetched posts:", secondMatchAttempt.id);
            return secondMatchAttempt;
          }
        }
      } catch (error) {
        console.error("Error fetching posts for matching:", error);
      }
    }
    
    // Method 5: Last resort - try to extract any number that could be a post ID
    const numbersInContent = content.match(/\d+/g) || [];
    if (numbersInContent.length > 0) {
      // Find numbers between 1-100000 range (typical post ID range)
      const possibleIds = numbersInContent
        .map(num => parseInt(num, 10))
        .filter(num => num > 0 && num < 100000);
      
      if (possibleIds.length > 0) {
        console.log("Found possible post IDs in content:", possibleIds);
        // Use the first one as a guess
        return {
          id: possibleIds[0].toString(),
          matchMethod: "number-extraction",
          score: 1 // Low confidence score
        };
      }
    }
    
    console.log("No post ID could be determined by any method");
    return null;
  };

  // Function to match pasted content with WordPress posts
  const matchContentWithPosts = (content, posts) => {
    if (!content || !posts || posts.length === 0) {
      return null;
    }
    
    // First try to find by direct ID pattern match
    const idFromPattern = extractWordPressPostId(content);
    if (idFromPattern) {
      // Check if this ID exists in our posts
      const matchedPost = posts.find(post => post.id.toString() === idFromPattern);
      if (matchedPost) {
        return {
          id: matchedPost.id,
          title: matchedPost.title?.rendered || "Untitled",
          excerpt: matchedPost.excerpt?.rendered || "",
          content: matchedPost.content?.rendered || "",
          matchMethod: "direct-id-match",
          score: 10 // Maximum score for direct ID match
        };
      }
    }
    
    // If direct ID matching failed, try content similarity
    // Strip HTML tags and normalize text for comparison
    const simplifiedContent = content.toLowerCase()
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
    
    // Take a sample of the input content (first 100 chars)
    const contentSample = simplifiedContent.substring(0, 100);
    
    // Store match scores for each post
    const postScores = [];
    
    // Look for matching content in posts
    for (const post of posts) {
      let score = 0;
      
      // Get the post content, title and excerpt
      const postContent = (post.content?.rendered || "").toLowerCase()
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
        
      const postTitle = (post.title?.rendered || "").toLowerCase()
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
        
      const postExcerpt = (post.excerpt?.rendered || "").toLowerCase()
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Award 2 points if post content contains the sample text
      if (postContent.includes(contentSample)) {
        score += 2;
      }
      
      // Award 1 point if full content contains the post title
      if (postTitle && simplifiedContent.includes(postTitle)) {
        score += 1;
      }
      
      // Award 1 point if full content contains the post excerpt
      if (postExcerpt && simplifiedContent.includes(postExcerpt)) {
        score += 1;
      }
      
      // Additional scoring: give partial points for partial matches
      
      // Check for longer content matches
      if (simplifiedContent.length > 150) {
        // Take 3 different samples from the content
        const middleSample = simplifiedContent.substring(
          Math.floor(simplifiedContent.length / 2) - 50,
          Math.floor(simplifiedContent.length / 2) + 50
        );
        const endSample = simplifiedContent.substring(simplifiedContent.length - 100);
        
        if (postContent.includes(middleSample)) score += 1;
        if (postContent.includes(endSample)) score += 1;
      }
      
      // Text similarity score: how much of the post content appears in our content
      // This helps when the post content is very short
      if (postContent.length > 0) {
        const overlapRatio = calculateTextOverlap(simplifiedContent, postContent);
        if (overlapRatio > 0.7) score += 2;
        else if (overlapRatio > 0.5) score += 1;
      }
      
      // Save the score if above zero
      if (score > 0) {
        postScores.push({
          id: post.id,
          title: post.title?.rendered || "Untitled",
          excerpt: post.excerpt?.rendered || "",
          content: post.content?.rendered || "",
          score: score,
          matchMethod: "content-match"
        });
      }
    }
    
    // Sort posts by score (highest first)
    postScores.sort((a, b) => b.score - a.score);
    
    // Return the best match if any
    if (postScores.length > 0) {
      console.log(`Best match has score ${postScores[0].score}:`, postScores[0].title);
      return postScores[0];
    }
    
    return null;
  };
  
  // Helper function to calculate text overlap ratio
  const calculateTextOverlap = (text1, text2) => {
    if (!text1 || !text2 || text1.length === 0 || text2.length === 0) {
      return 0;
    }
    
    // If one text is much longer, we'll focus on how much of the shorter text
    // is contained in the longer text
    const shorterText = text1.length <= text2.length ? text1 : text2;
    const longerText = text1.length > text2.length ? text1 : text2;
    
    // Split shorter text into chunks of words (4-5 words per chunk works well)
    const words = shorterText.split(' ');
    const chunkSize = 4;
    let matchedChunks = 0;
    let totalChunks = 0;
    
    for (let i = 0; i < words.length - chunkSize + 1; i += 2) { // Skip by 2 for efficiency
      totalChunks++;
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (longerText.includes(chunk)) {
        matchedChunks++;
      }
    }
    
    // Ensure we have at least one chunk to avoid division by zero
    return totalChunks > 0 ? matchedChunks / totalChunks : 0;
  };

  // Add determinePostPartFromDOM function after other helper functions
  const determinePostPartFromDOM = (content) => {
    // Create a temporary div to parse HTML content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content.trim();
    
    // Get the first element with content
    const element = tempDiv.firstElementChild;
    if (!element) return null;
    
    // Get all classes for easier checking
    const classes = (element.className || '').toLowerCase();
    const tagName = element.tagName.toLowerCase();
    
    // Common WordPress class patterns
    const titlePatterns = [
      'entry-title',
      'post-title',
      'wp-block-post-title',
      'site-title',
      'article-title',
      'page-title'
    ];
    
    const contentPatterns = [
      'entry-content',
      'post-content',
      'wp-block-post-content',
      'article-content',
      'page-content',
      'content-area'
    ];
    
    const excerptPatterns = [
      'entry-summary',
      'post-excerpt',
      'wp-block-post-excerpt',
      'article-excerpt',
      'excerpt-content'
    ];
    
    // Check if element or any of its parents match the patterns
    const hasClass = (element, patterns) => {
      let current = element;
      while (current) {
        const currentClasses = (current.className || '').toLowerCase();
        if (patterns.some(pattern => currentClasses.includes(pattern))) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };
    
    // Check tag names first
    if (['h1', 'h2', 'h3'].includes(tagName)) {
      return 'title';
    }
    
    // Check classes against patterns
    if (hasClass(element, titlePatterns)) {
      return 'title';
    }
    
    if (hasClass(element, excerptPatterns)) {
      return 'excerpt';
    }
    
    if (hasClass(element, contentPatterns)) {
      return 'content';
    }
    
    // Check for ARIA roles
    const role = element.getAttribute('role');
    if (role === 'heading') {
      return 'title';
    }
    
    // If no specific identifiers found, try to infer from structure
    if (element.querySelector(titlePatterns.map(p => `.${p}`).join(','))) {
      return 'title';
    }
    
    if (element.querySelector(excerptPatterns.map(p => `.${p}`).join(','))) {
      return 'excerpt';
    }
    
    // Default to content if no other matches
    return '';
  };

  useEffect(() => {
    checkAuth();
    
    // For testing: If token not available in auth response, try local storage
    const storedToken = localStorage.getItem('wp_access_token');
    if (storedToken && !accessToken) {
      console.log("Using access token from local storage");
      setAccessToken(storedToken);
    }
  }, []);
  
  // Effect to save token to localStorage when it changes
  useEffect(() => {
    if (accessToken) {
      localStorage.setItem('wp_access_token', accessToken);
      console.log("Saved access token to local storage");
    }
  }, [accessToken]);

  // Fetch posts whenever URL or access token changes
  useEffect(() => {
    if (url && accessToken) {
      fetchWordPressPosts(url);
    }
  }, [url, accessToken]);

  // Poll for selected content updates
  useEffect(() => {
    if (!iframeUrl) return;
    
    const intervalId = setInterval(async () => {
      try {
        const response = await axios.get('/proxy/selected-content');
        if (response.data && response.data.length > 0) {
          // Update selected content with any enriched data from API
          response.data.forEach(item => {
            // If the item has enriched WP API data, add it to the context
            if (item.wpApiData) {
              addSelectedContent(item);
            }
          });
        }
      } catch (err) {
        console.error('Error fetching selected content:', err);
      }
    }, 3000); // Poll every 3 seconds
    
    return () => clearInterval(intervalId);
  }, [iframeUrl, addSelectedContent]);

  const checkAuth = async () => {
    try {
      const res = await axios.get("/auth/check");
      console.log("Auth check response:", res.data);
      
      if (!res.data.authenticated) {
        console.log("Not authenticated, redirecting to login");
        navigate("/");
      } else {
        console.log("Authentication successful");
        // Automatically use access token from authentication response
        if (res.data.accessToken) {
          setAccessToken(res.data.accessToken);
          console.log("Access token retrieved from authentication");
        } else {
          console.warn("No access token in authentication response");
          
          // For testing: Check if a default token is available in environment
          if (process.env.REACT_APP_DEFAULT_WP_TOKEN) {
            console.log("Using default token from environment");
            setAccessToken(process.env.REACT_APP_DEFAULT_WP_TOKEN);
          }
        }
      }
      setLoading(false);
    } catch (err) {
      console.error("Auth check error:", err);
      setError("Failed to verify authentication. Please try logging in again.");
      navigate("/");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!url) {
      setError("Please enter a URL");
      return;
    }
    
    setLoading(true);
    setError(null);
    setUsingFallback(false);
    
    try {
      // Ensure URL has protocol
      let targetUrl = url;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      
      // Using absolute URL to ensure correct protocol
      const proxyUrl = `http://localhost:8000/proxy/simple?url=${encodeURIComponent(targetUrl)}`;
      console.log("Using proxy URL:", proxyUrl);
      setIframeUrl(proxyUrl);
      
      // Try to fetch WordPress posts if we have an access token
      if (accessToken) {
        fetchWordPressPosts(targetUrl);
      }
      
      // Set a timeout to check loading status
      setTimeout(() => {
        if (loading) {
          console.log("Iframe may be loading slowly, will continue waiting...");
        }
      }, 5000);
      
      // Add longer timeout to show error if iframe never loads
      setTimeout(() => {
        if (loading) {
          console.log("Iframe load timeout - showing fallback error");
          setError("Loading timed out. The site may be blocking proxy access or too large to load.");
          setLoading(false);
        }
      }, 20000);
      
    } catch (err) {
      console.error("Error:", err);
      setError("Error creating proxy: " + (err.response?.data?.error || err.message));
      setLoading(false);
    }
  };
  
  const tryFallbackMethod = (targetUrl) => {
    console.log("Trying fallback iframe method");
    setUsingFallback(true);
    
    // Try the direct iframe approach
    const fallbackUrl = `http://localhost:8000/proxy/iframe?url=${encodeURIComponent(targetUrl)}`;
    setIframeUrl(fallbackUrl);
  };
  
  const handleIframeLoad = (e) => {
    console.log("Iframe loaded successfully");
    setLoading(false);
    
    // Try to access the iframe content to confirm it loaded properly
    try {
      // This will throw an error if there are cross-origin restrictions
      const iframeDocument = iframeRef.current.contentWindow.document;
      console.log("Iframe content accessed successfully");
    } catch (contentError) {
      console.log("Cannot access iframe content due to cross-origin restrictions");
    }
  };
  
  const handleIframeError = (e) => {
    console.error("Iframe failed to load", e);
    
    if (!usingFallback) {
      // Try fallback method
      console.log("Trying fallback method due to iframe load error");
      tryFallbackMethod(url.startsWith('http') ? url : `https://${url}`);
    } else {
      // Both methods failed
      setError("Failed to load website. The site may be blocking embedded viewing.");
      setLoading(false);
    }
  };
  
  const toggleContentPanel = () => {
    setShowContentPanel(!showContentPanel);
  };
  
  const toggleDebugMode = () => {
    setDebugMode(!debugMode);
  };

  // Format WordPress content for display
  const formatWordPressContent = (item) => {
    // If we're dealing with pasted content
    if (item.type === 'pasted_content') {
      return (
        <div className="pasted-content-item">
          <p><strong>Pasted Content:</strong></p>
          <div style={{ 
            padding: '10px', 
            background: '#f8f9fa', 
            borderLeft: '3px solid #00a32a',
            marginBottom: '10px'
          }}>
            {item.content}
          </div>
          <p><strong>Added at:</strong> {new Date(item.timestamp).toLocaleString()}</p>
          
          {/* Display WordPress Post ID and details if available */}
          {item.postId && (
            <div style={{ 
              padding: '10px', 
              background: '#f0f7ff', 
              borderLeft: '3px solid #0073aa',
              marginTop: '10px'
            }}>
              <p><strong>WordPress Post ID:</strong> {item.postId}</p>
              {item.postTitle && <p><strong>Title:</strong> {item.postTitle}</p>}
              {item.matchMethod && (
                <p>
                  <strong>Match method:</strong> {item.matchMethod === "direct-id-match" ? 
                    "Direct ID match" : "Content similarity match"}
                  {item.matchScore && item.matchMethod === "content-match" && 
                    ` (Score: ${item.matchScore})`}
                </p>
              )}
            </div>
          )}
          
          {/* Debug mode raw data */}
          {debugMode && (
            <div style={{ marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
              <p><strong>Raw Data:</strong></p>
              <pre>{JSON.stringify(item, null, 2)}</pre>
            </div>
          )}
        </div>
      );
    }
    
    // Basic content without WP API data
    return (
      <div>
        <p><strong>Type:</strong> {item.elementType}</p>
        {item.content && <p><strong>Content:</strong> {item.content}</p>}
        {item.url && (
          <p>
            <a 
              href={item.url} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: '#0073aa', textDecoration: 'none' }}
            >
              View Content →
            </a>
          </p>
        )}
        
        {/* Display WordPress Post ID if available */}
        {item.postId && (
          <div style={{ 
            padding: '10px', 
            background: '#f0f7ff', 
            borderLeft: '3px solid #0073aa',
            marginTop: '10px'
          }}>
            <p><strong>WordPress Post ID:</strong> {item.postId}</p>
            {item.postTitle && <p><strong>Title:</strong> {item.postTitle}</p>}
            {item.matchScore && (
              <p><strong>Match score:</strong> {item.matchScore}</p>
            )}
          </div>
        )}
        
        {/* Debug mode raw data */}
        {debugMode && (
          <div style={{ marginTop: '10px', padding: '10px', background: '#f0f0f0', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
            <p><strong>Raw Selection Data:</strong></p>
            <pre>{JSON.stringify(item, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  };

  // Function to handle pasted content submission
  const handlePasteSubmit = async (e) => {
    e.preventDefault();
    
    if (!pastedContent.trim()) {
      return;
    }
    
    // Show loading indicator
    const loadingElement = document.createElement('div');
    loadingElement.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #0073aa; color: white; padding: 10px 20px; border-radius: 4px; z-index: 9999;';
    loadingElement.textContent = 'Analyzing content...';
    document.body.appendChild(loadingElement);
    
    try {
      // Store the original HTML content
      setOriginalHtml(pastedContent);
      
      // First determine content type based on DOM structure
      const contentType = determinePostPartFromDOM(pastedContent);
      console.log('Detected content type:', contentType);

      // Strip HTML and get plain text content
      const plainTextContent = stripHtmlContent(pastedContent);

      console.log("Plain text content:", plainTextContent);
      
      // Search for content using enhanced search
      const searchResult = await wordpressApi.searchContent(url, plainTextContent, contentType, accessToken);
      
      if (searchResult?.found) {
        console.log("Found content via search:", searchResult);
        // Set editing mode for this ID
        setEditingPostId(searchResult.postId);
        setIsPage(searchResult.type === 'page');

        // Set the appropriate edit field based on matched field
        switch (searchResult.matchedField) {
          case 'title':
            setEditTitle(searchResult.matchedContent || plainTextContent);
            setEditContent("");
            setEditExcerpt("");
            break;
          case 'excerpt':
            setEditExcerpt(searchResult.matchedContent || plainTextContent);
            setEditTitle("");
            setEditContent("");
            break;
          case 'content':
            setEditContent(searchResult.matchedContent || plainTextContent);
            setEditTitle("");
            setEditExcerpt("");
            break;
        }

        // Add the pasted content to selected content
        addSelectedContent({
          type: 'pasted_content',
          content: plainTextContent,
          originalHtml: pastedContent,
          elementType: contentType || 'content',
          timestamp: Date.now(),
          url: iframeUrl || url || 'manual-input',
          postId: searchResult.postId,
          contentType: searchResult.type, // 'post' or 'page'
          matchedField: searchResult.matchedField,
          matchedContent: searchResult.matchedContent
        });

        // Show success feedback
        const feedbackElement = document.createElement('div');
        feedbackElement.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #00a32a; color: white; padding: 10px 20px; border-radius: 4px; z-index: 9999;';
        feedbackElement.textContent = `Content matched with ${searchResult.matchedField} of ${searchResult.type} ID: ${searchResult.postId}`;
        document.body.removeChild(loadingElement);
        document.body.appendChild(feedbackElement);
        setTimeout(() => document.body.removeChild(feedbackElement), 3000);
      } else {
        // No match found
        const noMatchElement = document.createElement('div');
        noMatchElement.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #d63638; color: white; padding: 10px 20px; border-radius: 4px; z-index: 9999;';
        noMatchElement.textContent = 'No matching content found';
        document.body.removeChild(loadingElement);
        document.body.appendChild(noMatchElement);
        setTimeout(() => document.body.removeChild(noMatchElement), 3000);
      }

      // Clear the textarea
      setPastedContent("");
      
    } catch (error) {
      console.error("Error processing pasted content:", error);
      document.body.removeChild(loadingElement);
      
      const errorElement = document.createElement('div');
      errorElement.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #d63638; color: white; padding: 10px 20px; border-radius: 4px; z-index: 9999;';
      errorElement.textContent = 'Error processing content: ' + (error.message || 'Unknown error');
      document.body.appendChild(errorElement);
      setTimeout(() => document.body.removeChild(errorElement), 3000);
    }
  };

  // UI for access token section - now with manual override option
  const renderAccessTokenSection = () => {
    return (
      <div style={{
        marginTop: "10px",
        padding: "10px",
        backgroundColor: "#f9f9f9",
        border: "1px solid #ddd",
        borderRadius: "4px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontWeight: "500", fontSize: "14px" }}>
              WordPress Access Token: 
              {accessToken ? (
                <span style={{ color: "#007017", marginLeft: "5px" }}>
                  ✓ Token available
                </span>
              ) : (
                <span style={{ color: "#d63638", marginLeft: "5px" }}>
                  Not available
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => fetchWordPressPosts(url)}
            disabled={!url || fetchingPosts}
            style={{
              padding: "6px 12px",
              backgroundColor: "#0073aa",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: !url || fetchingPosts ? "not-allowed" : "pointer",
              opacity: !url || fetchingPosts ? 0.7 : 1
            }}
          >
            {fetchingPosts ? "Fetching..." : "Fetch Posts"}
          </button>
        </div>
        
        {/* Add manual token input for debugging/testing */}
        <div style={{ marginTop: "10px" }}>
          <details>
            <summary style={{ cursor: "pointer", color: "#0073aa", fontSize: "13px" }}>
              Manually set access token
            </summary>
            <div style={{ marginTop: "8px" }}>
              <input 
                type="text" 
                value={accessToken || ""}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Enter WordPress access token"
                style={{
                  width: "100%",
                  padding: "6px",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                  fontSize: "14px"
                }}
              />
              <div style={{ marginTop: "4px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => localStorage.setItem('wp_access_token', accessToken)}
                  disabled={!accessToken}
                  style={{
                    padding: "4px 8px",
                    fontSize: "12px",
                    backgroundColor: "#f0f0f0",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    cursor: accessToken ? "pointer" : "not-allowed",
                    marginRight: "5px"
                  }}
                >
                  Save to Storage
                </button>
                <button
                  onClick={() => setAccessToken("")}
                  style={{
                    padding: "4px 8px",
                    fontSize: "12px",
                    backgroundColor: "#f0f0f0",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </details>
        </div>
        
        {/* Posts Grid Section */}
        {wordpressPosts.length > 0 && (
          <div style={{ marginTop: "15px" }}>
            <div style={{ fontSize: "14px", color: "#007017", marginBottom: "10px" }}>
              Fetched {wordpressPosts.length} posts from WordPress site
            </div>
            <div style={{ 
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
              gap: "15px",
              maxHeight: "300px",
              overflowY: "auto",
              padding: "10px",
              backgroundColor: "#fff",
              borderRadius: "4px",
              border: "1px solid #eee"
            }}>
              {wordpressPosts.map(post => (
                <div key={post.id} style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: "4px",
                  padding: "10px",
                  backgroundColor: "white"
                }}>
                  {post._embedded?.['wp:featuredmedia']?.[0]?.source_url && (
                    <img 
                      src={post._embedded['wp:featuredmedia'][0].source_url}
                      alt={post.title.rendered}
                      style={{
                        width: "100%",
                        height: "120px",
                        objectFit: "cover",
                        borderRadius: "4px",
                        marginBottom: "8px"
                      }}
                    />
                  )}
                  <h3 style={{ 
                    margin: "0 0 8px 0",
                    fontSize: "14px",
                    fontWeight: "500"
                  }} dangerouslySetInnerHTML={{ __html: post.title.rendered }} />
                  <div 
                    style={{
                      color: "#666",
                      fontSize: "12px",
                      marginBottom: "8px",
                      display: "-webkit-box",
                      WekitLineClamp: "2",
                      overflow: "hidden"                   }}
                    dangerouslySetInnerHTML={{ __html: post.excerpt.rendered }}
                  />
                  <a 
                    href={post.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      color: "#0073aa",
                      textDecoration: "none",
                      fontSize: "12px",
                      display: "inline-block"
                    }}
                  >
                    Read More →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Add this function inside your component
  const handleFetchPosts = async () => {
    if (!url) {
      setPostsError('Please enter a WordPress site URL first');
      return;
    }

    setIsLoadingPosts(true);
    setPostsError(null);

    try {
      const fetchedPosts = await fetchWordPressPosts(url);
      setPosts(fetchedPosts);
    } catch (error) {
      setPostsError(error.response?.data?.error || 'Failed to fetch posts');
      setPosts([]);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  // Add new function to handle content update
  const handleContentUpdate = async () => {
    if (!editingPostId || (!editContent.trim() && !editTitle.trim() && !editExcerpt.trim()) || !url) {
      return;
    }

    try {
      const data = {};
      // Use original HTML for the update if available
      if (editContent.trim()) {
        data.content = originalHtml || editContent;
      }
      if (editTitle.trim()) {
        // For titles, we typically don't want to preserve complex HTML
        data.title = editTitle;
      }
      if (editExcerpt.trim()) {
        data.excerpt = editExcerpt;
      }

      console.log("Updating content with data:", data, editingPostId, isPage);


      // Use the appropriate API based on content type (post or page)
      if (isPage) {
        await wordpressApi.updatePage(url, editingPostId, data, accessToken);
      } else {
        await wordpressApi.updatePost(url, editingPostId, data, accessToken);
      }

      // Show success message
      const successElement = document.createElement('div');
      successElement.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #00a32a; color: white; padding: 10px 20px; border-radius: 4px; z-index: 9999;';
      successElement.textContent = `${isPage ? 'Page' : 'Post'} updated successfully!`;
      document.body.appendChild(successElement);
      
      // Clear edit mode and stored HTML
      setEditingPostId(null);
      setEditContent("");
      setEditTitle("");
      setEditExcerpt("");
      setOriginalHtml("");
      setIsPage(false);
      
      // Remove success message after 3 seconds
      setTimeout(() => {
        document.body.removeChild(successElement);
      }, 3000);

      // Reload the website in the iframe if it exists
      if (iframeRef.current) {
        iframeRef.current.src = iframeRef.current.src;
      }

      // Refresh the posts/pages list
      if (isPage) {
        await wordpressApi.fetchPages(url, accessToken);
      } else {
        await wordpressApi.fetchPosts(url, accessToken);
      }
      
    } catch (error) {
      console.error("Error updating content:", error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      const errorElement = document.createElement('div');
      errorElement.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #d63638; color: white; padding: 10px 20px; border-radius: 4px; z-index: 9999;';
      errorElement.textContent = `Error updating ${isPage ? 'page' : 'post'}: ${errorMessage}`;
      document.body.appendChild(errorElement);
      setTimeout(() => {
        document.body.removeChild(errorElement);
      }, 3000);
    }
  };

  // Helper function to determine if an element is a title
  const isTitleElement = (item) => {
    if (!item) return false;
    // Check tagName and className from selection context or metadata
    const tag = (item.containerElement?.tagName || item.metadata?.elementType || item.elementType || '').toLowerCase();
    const className = (item.containerElement?.className || item.metadata?.elementClasses || '').toLowerCase();
    // Common title tags and classes
    if (["h1", "h2", "h3"].includes(tag)) return true;
    if (className.includes("entry-title") || className.includes("post-title") || className.includes("site-title")) return true;
    if (tag.includes("title")) return true;
    return false;
  };

  // Add Edit Box Component
  const renderEditBox = () => {
    if (!editingPostId) return null;
    // Determine if editing title or content
    const editingTitle = editTitle && !editContent && !editExcerpt;
    const editingContent = editContent && !editTitle && !editExcerpt; 
    const editingExcerpt = editExcerpt && !editContent && !editTitle;
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000,
        width: '80%',
        maxWidth: '800px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '15px'
        }}>
          <h3 style={{ margin: 0 }}>Edit Post ID: {editingPostId}</h3>
          <button
            onClick={() => {
              setEditingPostId(null);
              setEditContent("");
              setEditTitle("");
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px'
            }}
          >
            ×
          </button>
        </div>
        {/* Show only the relevant field */}
        {editingTitle && (
          <input
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Edit post title"
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px',
              display: 'block'
            }}
          />
        )}
        {editingExcerpt && (
          <input
            type="text"
            value={editExcerpt}
            onChange={e => setEditExcerpt(e.target.value)}
            placeholder="Edit post excerpt"
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px',
              display: 'block'
            }}
          />
        )}
        {editingContent && (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="Edit post content"
            style={{
              width: '100%',
              minHeight: '200px',
              padding: '10px',
              marginBottom: '15px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              resize: 'vertical',
              fontSize: '15px'
            }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={() => {
              setEditingPostId(null);
              setEditContent("");
              setEditTitle("");
            }}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              background: 'white',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleContentUpdate}
            style={{
              padding: '8px 16px',
              backgroundColor: '#0073aa',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Update Post
          </button>
        </div>
      </div>
    );
  };

  if (loading && !iframeUrl) {
    return <div style={{ textAlign: "center", marginTop: 100 }}>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ textAlign: "center", marginTop: 100 }}>
        <p style={{ color: "red" }}>{error}</p>
        <button onClick={() => { setError(null); setUrl(""); }}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ heisplay: "flex", flexDirection: "column" }}>
      {/* Header with site URL input */}
      <div style={{ padding: "15px", borderBottom: "1px solid #e0e0e0", backgroundColor: "#fff" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter WordPress site URL"
            style={{ flex: 1, padding: "8px 12px", borderRadius: "4px", border: "1px solid #ddd" }}
          />
          <button 
            type="submit" 
            style={{ 
              padding: "8px 16px", 
              backgroundColor: "#0073aa", 
              color: "white", 
              border: "none", 
              borderRadius: "4px", 
              cursor: "pointer" 
            }}
          >
            Load Site
          </button>
        </form>
        
        {error && (
          <div style={{ color: "red", marginTop: "10px" }}>
            Error: {error}
          </div>
        )}
        
        {/* Access token section */}
        {renderAccessTokenSection()}
      </div>

      {/* Paste content section - always visible */}
      <div style={{ 
        padding: "15px 20px", 
        borderBottom: "1px solid #e0e0e0",
        backgroundColor: "#f9f9f9" 
      }}>
        <form onSubmit={handlePasteSubmit}>
          <div style={{ marginBottom: "10px" }}>
            <label 
              htmlFor="pastedContent" 
              style={{ 
                display: "block", 
                marginBottom: "5px", 
                fontWeight: "500",
                fontSize: "14px" 
              }}
            >
              Paste WordPress content below:
            </label>
            <textarea
              id="pastedContent"
              value={stripHtmlContent(pastedContent)}
              onChange={(e) => setPastedContent(e.target.value)}
              onPaste={(e) => {
                e.preventDefault();
                // Get clipboard data
                const clipboardData = e.clipboardData || window.clipboardData;
                if (clipboardData && clipboardData.getData) {
                  // Try to get HTML format first
                  const htmlContent = clipboardData.getData('text/html');
                  if (htmlContent) {
                    // Clean up the HTML content (remove meta tags, scripts, etc.)
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = htmlContent;
                    
                    // Remove unnecessary elements
                    const elementsToRemove = tempDiv.querySelectorAll('script, style, meta, link');
                    elementsToRemove.forEach(el => el.remove());
                    
                    // Get the cleaned HTML
                    const cleanedHtml = tempDiv.innerHTML;
                    setPastedContent(stripHtmlContent(cleanedHtml));
                    
                    // Also store the cleaned HTML for later use
                    setOriginalHtml(cleanedHtml);
                  } else {
                    // If no HTML is available, try to preserve any formatting
                    const text = clipboardData.getData('text');
                    setPastedContent(text);
                    setOriginalHtml(text);
                  }
                }
              }}
              placeholder="Paste any WordPress content here (text, HTML, etc.)"
              style={{
                width: "100%",
                minHeight: "120px",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "14px",
                fontFamily: "inherit",
                resize: "vertical",
                whiteSpace: "pre-wrap"
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              style={{
                padding: "8px 15px",
                backgroundColor: "#00a32a",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              Add Content
            </button>
          </div>
        </form>
      </div>

      {/* Main content area with iframe and sidebar */}
      <div style={{ display: "flex", flex: 1, height: "75v" }}>
        {/* Iframe container - removed or make it smaller */}
            <div style={{ flex: 1, position: "relative" }}>
          {loading && (
            <div style={{ 
              position: "absolute", 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              backgroundColor: "rgba(255, 255, 255, 0.8)", 
              display: "flex", 
              justifyContent: "center", 
              alignItems: "center",
              zIndex: 999 
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ marginBottom: "15px" }}>
                  <div style={{ 
                    width: "40px", 
                    height: "40px", 
                    border: "4px solid #f3f3f3", 
                    borderTop: "4px solid #0073aa", 
                    borderRadius: "50%", 
                    margin: "0 auto", 
                    animation: "spin 2s linear infinite" 
                  }}></div>
                </div>
                <p>Loading website...</p>
              </div>
            </div>
          )}
          
          {iframeUrl && (
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              style={{ width: "100%", height: "100%", border: "none" }}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title="WordPress Site"
            ></iframe>
          )}
        </div>
        
        {/* Sidebar for selections */}
        {showContentPanel && (
          <div style={{ 
            width: "350px", 
            backgroundColor: "#f5f5f5", 
            padding: "15px", 
            overflowY: "auto",
            borderLeft: "1px solid #e0e0e0",
            display: "flex",
            flexDirection: "column"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "500" }}>Pasted Content</h2>
              <div>
                <button
                  onClick={toggleDebugMode}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: debugMode ? "#0073aa" : "#888",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    marginRight: "8px"
                  }}
                >
                  {debugMode ? "Debug ON" : "Debug OFF"}
                </button>
                <button
                  onClick={clearSelections}
                  style={{
                    background: "transparent",
                    border: "1px solid #ddd",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: "4px"
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
            
            {/* Help text if no content */}
            {selectedContent.length === 0 && (
              <div style={{ 
                textAlign: "center",
                color: "#666",
                marginTop: "20px",
                padding: "20px",
                backgroundColor: "#fff",
                borderRadius: "4px"
              }}>
                <div style={{ fontSize: "24px", marginBottom: "10px" }}>📋</div>
                <p><strong>Paste content in the text area above</strong> to add it here</p>
                <p style={{ marginTop: "15px", fontSize: "13px" }}>
                  You'll be able to see your pasted content here
                </p>
              </div>
            )}
            
            {/* Content items */}
            <div style={{ flex: 1 }}>
              {selectedContent.map((item, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: "15px",
                    padding: "15px",
                    backgroundColor: "white",
                    borderRadius: "4px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                  }}
                >
                  {formatWordPressContent(item)}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Toggle for content panel */}
        <button
          onClick={toggleContentPanel}
          style={{
            position: "absolute",
            right: showContentPanel ? "350px" : 0,
            top: "50%",
            transform: "translateY(-50%)",
            backgroundColor: "#f0f0f0",
            border: "1px solid #ddd",
            borderRight: showContentPanel ? "1px solid #ddd" : "none",
            borderLeft: showContentPanel ? "none" : "1px solid #ddd",
            width: "20px",
            height: "60px",
            cursor: "pointer",
            borderRadius: showContentPanel ? "4px 0 0 4px" : "0 4px 4px 0",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 100
          }}
          aria-label={showContentPanel ? "Hide content panel" : "Show content panel"}
        >
          {showContentPanel ? "›" : "‹"}
        </button>
      </div>
      
      {/* CSS animation for spinner */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* Remove the posts section from the bottom */}
      <style jsx>{`
        .fetch-posts-button {
          background-color: #0073aa;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          margin-bottom: 1rem;
        }

        .fetch-posts-button:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }

        .error-message {
          color: #d54e21;
          margin-bottom: 1rem;
        }
      `}</style>

      {/* Add the edit box component */}
      {renderEditBox()}
    </div>
  );
}

export default Dashboard;
