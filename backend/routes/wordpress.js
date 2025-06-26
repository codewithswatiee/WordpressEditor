const express = require('express');
const router = express.Router();
const axios = require('axios');
const { stripHtml } = require('string-strip-html');

// Helper function to get site identifier from URL
const getSiteIdentifier = (siteUrl) => {
    // Remove protocol and trailing slash
    return siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
};

// Helper function to create request config with authorization
const getRequestConfig = (req, params = {}) => {
    console.log('Request headers:', req.headers, params); // Log the request headers for debugging
    const token = req.headers.authorization?.split(' ')[1]; // Get token from Bearer header
    if (!token) {
        throw new Error('No authorization token provided');
    }
    return {
        headers: {
            'Authorization': `Bearer ${token}`
        },
        params
    };
};

// Search posts by title/excerpt (WordPress native search)
// Search by title or excerpt
// router.get('/search/title', async (req, res) => {
//     try {
//         const { siteUrl, searchTerm } = req.query;
//         if (!siteUrl || !searchTerm) {
//             return res.status(400).json({ error: 'Site URL and search term are required' });
//         }

//         const siteIdentifier = getSiteIdentifier(siteUrl);
//         const config = getRequestConfig(req, { search: searchTerm });

//         const [postsResponse, pagesResponse] = await Promise.all([
//             axios.get(`https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/posts`, config),
//             axios.get(`https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/pages`, config)
//         ]);

//         const processResults = (data, type) => {
//             return data.map(item => {
//                 let matchedIn = [];
//                 if (item.title?.rendered?.toLowerCase().includes(searchTerm.toLowerCase())) {
//                     matchedIn.push('title');
//                 }
//                 if (item.excerpt?.rendered?.toLowerCase().includes(searchTerm.toLowerCase())) {
//                     matchedIn.push('excerpt');
//                 }

//                 return {
//                     ...item,
//                     matchedIn,
//                     type
//                 };
//             }).filter(item => item.matchedIn.length > 0);
//         };

//         const results = [
//             ...processResults(postsResponse.data, 'post'),
//             ...processResults(pagesResponse.data, 'page')
//         ];

//         res.json(results);
//     } catch (error) {
//         if (error.message === 'No authorization token provided') {
//             return res.status(401).json({ error: 'Authentication required' });
//         }
//         console.error('Title search error:', error);
//         res.status(500).json({ error: error.response?.data || error.message });
//     }
// });

router.get('/search', async (req, res) => {
    try {
        const { siteUrl, searchTerm, contentType } = req.query;
        if (!siteUrl || !searchTerm) {
            return res.status(400).json({ error: 'Site URL and search term are required' });
        }

        const siteIdentifier = getSiteIdentifier(siteUrl);
        const config = getRequestConfig(req, { per_page: 100 });
        const searchTermLower = searchTerm.toLowerCase().trim();

        const [postsResponse, pagesResponse] = await Promise.all([
            axios.get(`https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/posts`, config),
            axios.get(`https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/pages`, config),
        ]);

        const allContent = [
            ...postsResponse.data.map(item => ({ ...item, contentType: 'post' })),
            ...pagesResponse.data.map(item => ({ ...item, contentType: 'page' }))
        ];

        let bestMatch = null;
        let matchedField = null;
        let matchedFieldValue = null;

        for (const item of allContent) {
            const title = stripHtml(item.title?.rendered || '').result.toLowerCase();
            const excerpt = stripHtml(item.excerpt?.rendered || '').result.toLowerCase();
            const content = stripHtml(item.content?.rendered || '').result.toLowerCase();

            if (contentType === 'title' && title.includes(searchTermLower)) {
                bestMatch = item;
                matchedField = 'title';
                matchedFieldValue = item.title?.rendered || '';
                break;
            } else if (contentType === 'excerpt' && excerpt.includes(searchTermLower)) {
                bestMatch = item;
                matchedField = 'excerpt';
                matchedFieldValue = item.excerpt?.rendered || '';
                break;
            } else if (contentType === 'content' && content.includes(searchTermLower)) {
                bestMatch = item;
                matchedField = 'content';
                matchedFieldValue = item.content?.rendered || '';
                break;
            }

            // Auto-detect best match if no contentType is specified
            if (!contentType) {
                if (title.includes(searchTermLower)) {
                    bestMatch = item;
                    matchedField = 'title';
                    matchedFieldValue = item.title?.rendered || '';
                    break;
                } else if (excerpt.includes(searchTermLower)) {
                    bestMatch = item;
                    matchedField = 'excerpt';
                    matchedFieldValue = item.excerpt?.rendered || '';
                    break;
                } else if (content.includes(searchTermLower)) {
                    bestMatch = item;
                    matchedField = 'content';
                    matchedFieldValue = item.content?.rendered || '';
                    break;
                }
            }
        }

        if (!bestMatch) {
            return res.json({ found: false });
        }

        res.json({
            postId: bestMatch.id,
            type: bestMatch.contentType,
            matchedField,
            matchedContent: matchedFieldValue,
            found: true
        });

    } catch (error) {
        console.error('Unified auto-detect search error:', error);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});


// Search posts by full content (fetch all and filter)
// Search by full content
router.get('/search/content', async (req, res) => {
    try {
        const { siteUrl, searchTerm } = req.query;
        if (!siteUrl || !searchTerm) {
            return res.status(400).json({ error: 'Site URL and search term are required' });
        }

        const siteIdentifier = getSiteIdentifier(siteUrl);
        const config = getRequestConfig(req, { per_page: 100 });

        const [postsResponse, pagesResponse] = await Promise.all([
            axios.get(`https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/posts`, config),
            axios.get(`https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/pages`, config)
        ]);

        const processContentResults = (data, type) => {
            return data.map(item => {
                const cleanContent = stripHtml(item.content?.rendered || '').result.trim();
                const matches = cleanContent.toLowerCase().includes(searchTerm.toLowerCase().trim());

                return matches ? {
                    ...item,
                    matchedIn: ['content'],
                    type
                } : null;
            }).filter(Boolean);
        };

        const results = [
            ...processContentResults(postsResponse.data, 'post'),
            ...processContentResults(pagesResponse.data, 'page')
        ];

        res.json(results);
    } catch (error) {
        if (error.message === 'No authorization token provided') {
            return res.status(401).json({ error: 'Authentication required' });
        }
        console.error('Content search error:', error);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});


// Search post by slug
router.get('/search/slug', async (req, res) => {
    try {
        const { siteUrl, slug } = req.query;
        if (!siteUrl || !slug) {
            return res.status(400).json({ error: 'Site URL and slug are required' });
        }

        const siteIdentifier = getSiteIdentifier(siteUrl);
        const config = getRequestConfig(req, { slug });
        const response = await axios.get(
            `https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/posts`,
            config
        );

        res.json(response.data);
    } catch (error) {
        if (error.message === 'No authorization token provided') {
            return res.status(401).json({ error: 'Authentication required' });
        }
        console.error('WordPress slug search error:', error);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

// Fetch all posts and log them
router.get('/posts', async (req, res) => {
    try {
        const { siteUrl } = req.query;
        if (!siteUrl) {
            return res.status(400).json({ error: 'Site URL is required' });
        }

        const siteIdentifier = getSiteIdentifier(siteUrl);
        const config = getRequestConfig(req, { per_page: 100 });
        const response = await axios.get(
            `https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/posts`,
            config
        );

        // Log the posts to the backend console
        console.log('Fetched WordPress Posts:');
        response.data.forEach((post, index) => {
            console.log(`\n--- Post ${index + 1} ---`);
            console.log('Title:', post.title.rendered);
            console.log('Date:', post.date);
            console.log('Slug:', post.slug);
            console.log('----------------------');
        });

        res.json(response.data);
    } catch (error) {
        if (error.message === 'No authorization token provided') {
            return res.status(401).json({ error: 'Authentication required' });
        }
        console.error('WordPress posts fetch error:', error);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

router.post('/update-post', async (req, res) => {
    try {
        const { siteUrl, postId, content, title, excerpt } = req.body;
        if (!siteUrl || !postId || (!content && !title)) {
            return res.status(400).json({ error: 'Site URL, post ID, and at least one of content or title are required' });
        }

        const siteIdentifier = getSiteIdentifier(siteUrl);
        const config = getRequestConfig(req);


        const data = {
            ...(content && { content }),
            ...(title && { title }),
            ...(excerpt && { excerpt }),
        };

        const response = await axios.post(
            `https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/posts/${postId}`,
            data,
            config
        );

        res.json(response.data);

    } catch (error) {
        console.error('WordPress update post error:', error);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

router.get('/get-pages', async (req, res) => {
    const { siteUrl } = req.query;
    if (!siteUrl) {
        return res.status(400).json({ error: 'Site URL is required' });
    }

    try {
        const siteIdentifier = getSiteIdentifier(siteUrl);
        const config = getRequestConfig(req);

        const response = await axios.get(`https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/pages`, 
            config
        )


        console.log('Fetched WordPress Pages:', response.data); // Log the response for debugging
        res.json(response.data);
    } catch (error) {
        if (error.message === 'No authorization token provided') {
            return res.status(401).json({ error: 'Authentication required' });
        }
        console.error('WordPress pages fetch error:', error);
        res.status(500).json({ error: error.response?.data || error.message });
        
    }
})

router.post('/page-update', async (req, res) => {
    try {
        const {siteUrl, pageId, content, title, excerpt } = req.body;
        if (!siteUrl || !pageId) {
            return res.status(400).json({ error: 'Site URL, page ID, and at least one of content or title are required' });
        }

        const siteIdentifier = getSiteIdentifier(siteUrl);
        const config = getRequestConfig(req);
        // Build the update payload dynamically

        const data = {
            ...(content && { content }),
            ...(title && { title }),
            ...(excerpt && { excerpt }),
        };
        
        const response = await axios.post(
            `https://public-api.wordpress.com/wp/v2/sites/${siteIdentifier}/pages/${pageId}`,
            data,
            config
        );

        res.json(response.data);

    } catch (error) {
        console.error('WordPress update page error:', error);
        res.status(500).json({ error: error.response?.data || error.message });
    }
});

module.exports = router;
