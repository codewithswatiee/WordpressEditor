const express = require('express');
const dotenv = require('dotenv');
const axios = require('axios');
dotenv.config();
const router = express.Router();

const clientId = process.env.WORDPRESS_CLIENT_ID;
const clientSecret = process.env.WORDPRESS_CLIENT_SECRET;
const redirectUri = process.env.WORDPRESS_REDIRECT_URI || 'http://localhost:8000/auth/callback';

router.get('/redirectToOAuth', (req, res) => {
    console.log('Redirecting to WordPress OAuth...');
    const oauthUrl = `https://public-api.wordpress.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=global`;
    res.redirect(oauthUrl);
});

router.get('/callback', async (req, res) => {
    const { code } = req.query;
    console.log('Received callback with code:', code);
    
    if (!code) {
        console.error('No code received in callback');
        return res.status(400).send('No authorization code received');
    }
    
    try {
      const params = new URLSearchParams();
      params.append('code', code);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);
      params.append('redirect_uri', redirectUri);
      params.append('grant_type', 'authorization_code');

      console.log('Exchanging code for token...');
      const response = await axios.post('https://public-api.wordpress.com/oauth2/token', params);

      console.log('Received access token:', response.data.access_token ? 'YES' : 'NO');
      console.log("Token:", response.data.access_token);
      
      // Save token in session
      req.session.access_token = response.data.access_token;
      
      // Save session before redirecting
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Failed to save session' });
        }
        
        console.log('Session saved, redirecting to dashboard...');
        res.redirect('http://localhost:3000/dashboard');
      });
    } catch (err) {
      console.error('Token exchange error:', err.message);
      res.status(500).json({ error: err.message });
    }
});

router.get('/check', (req, res) => {
    console.log('Auth check called, session:', req.session.id);
    console.log('Access token exists:', !!req.session.access_token);
    
    if (req.session && req.session.access_token) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

// Verify WordPress site access
router.post('/api/wordpress/verify', async (req, res) => {
  const { siteUrl, token } = req.body;
  
  if (!siteUrl) {
    return res.status(400).json({ error: 'Site URL is required' });
  }

  try {
    // Try to fetch site info to verify access
    const response = await axios.get(`${siteUrl}/wp-json/wp/v2/settings`, {
      headers: token ? {
        'Authorization': `Bearer ${token}`
      } : {}
    });

    return res.json({
      success: true,
      siteInfo: {
        title: response.data.title,
        description: response.data.description,
        url: response.data.url
      }
    });
  } catch (error) {
    console.error('Error verifying WordPress access:', error);
    return res.status(error.response?.status || 500).json({
      error: 'Failed to verify WordPress site access',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;