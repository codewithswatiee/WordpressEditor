import axios from 'axios';

// Configure axios defaults
axios.defaults.withCredentials = true;
axios.defaults.baseURL = 'http://localhost:8000';

export const wordpressApi = {
  // Fetch posts from WordPress site
  fetchPosts: async (siteUrl, accessToken) => {
    try {
      const response = await axios.get('http://localhost:8000/wordpress/posts', {
        params: { siteUrl },
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data || [];
    } catch (error) {
      console.error('Error fetching WordPress posts:', error);
      throw error;
    }
  },

  // Search posts by content
  

  // Verify WordPress site and authentication
  verifyAccess: async (siteUrl, accessToken) => {
    try {
      const response = await axios.post('http://localhost:8000/wordpress/verify', {
        siteUrl
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error verifying WordPress access:', error);
      throw error;
    }
  }
}; 