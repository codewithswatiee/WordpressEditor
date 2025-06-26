import React, { useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';

function Redirect() {
  const location = useLocation();
  
  useEffect(() => {
    // If we have a URL in the state, redirect to it
    if (location.state?.url) {
      // Selection mode is already being handled by the context and sessionStorage
      // Just redirect to the URL
      window.location.href = location.state.url;
    }
  }, [location]);

  // If no URL is provided, redirect to home
  if (!location.state?.url) {
    return <Navigate to="/" />;
  }

  return <div>Redirecting...</div>;
}

export default Redirect; 