# SS Plastotech ERP & Invoice System — Developer Installation Manual

This manual outlines the architectural details, directory structure, and setup procedures for developers working on the SS Plastotech ERP & Invoicing platform.

---

## 1. Directory Scaffold Layout
```
SS-Plastotech-System/
├── client/
│   ├── app.js               # Frontend Single Page App controller
│   ├── index.html           # Main Single Page App Entrypoint
│   └── (modules)            # Scaffold folders for customers, settings, etc.
├── server/
│   ├── server.js            # Node Express Entrypoint
│   ├── config/              # Configuration (Supabase config)
│   ├── routes/              # Express Endpoints
│   ├── controllers/         # Logic Handlers
│   ├── middleware/          # Session, Auth & Error Middleware
│   ├── database/            # Supabase / Local Fallback Database
│   ├── validators/          # Input schema format & bounds verification
│   └── utils/               # App logging & Auditing
├── docs/
│   ├── schema.md            # Detailed DB Tables and Schema definitions
│   └── installation.md      # This file
```

---

## 2. Environment Variables Configuration
To run the server, create a file named `.env` in the `server/` directory with the following variables:
```ini
PORT=5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1...
JWT_SECRET=supersecretssp_2026_jwt
```

---

## 3. Launching and Running locally

### Server setup & Run
1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the application in production mode:
   ```bash
   npm start
   ```
4. Run the application in developer mode (using live hot-reloading with `nodemon`):
   ```bash
   npm run dev
   ```

The application client is automatically served from `http://localhost:5000/`. On first start, if no user is seeded in the database, logging in with `owner@ssplastotech.com` and password `Admin@123` will automatically seed the owner account.
