import React from "react";
import axios from "axios";

axios.defaults.withCredentials = true;
axios.defaults.baseURL = "http://localhost:8000";

function Login() {
  const handleLogin = () => {
    // Direct browser redirection to the backend OAuth endpoint
    window.location.href = "http://localhost:8000/auth/redirectToOAuth";
  };

  return (
    <div style={{ textAlign: "center", marginTop: 100 }}>
      <h2>WordPress Viewer App</h2>
      <button onClick={handleLogin} style={{ fontSize: 18, padding: "10px 30px" }}>
        Login with WordPress
      </button>
    </div>
  );
}

export default Login;
