const express = require("express");
const session = require("express-session");
const authRouter = require("./routes/auth");
const proxyRouter = require("./routes/proxy");
const wordpressRouter = require("./routes/wordpress");
const cors = require("cors");

const app = express();
const PORT = 8000;

// CORS configuration - must be before other middleware
app.use(
    cors({
        origin: "http://localhost:3000", // React app URL
        credentials: true, // Allow credentials (cookies, authorization headers, etc.)
    })
);

// Middleware to parse JSON bodies
app.use(express.json());

// Session middleware
app.use(
  session({
    secret: "your-secret-key", // Change this to a secure value
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
      sameSite: 'lax', // Helps with CSRF protection
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Routes
app.use("/auth", authRouter);
app.use("/proxy", proxyRouter);
app.use("/wordpress", wordpressRouter);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
