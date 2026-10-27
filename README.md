# Garbage Complaint Tracker

A local-first college demonstration app for reporting garbage complaints, dispatching field workers, tracking status, and recording clean-up evidence. The Streamlit frontend talks only to an Express REST API. The backend persists JSON files and image uploads on this computer; no database or cloud storage is used.

## Requirements

- Node.js 18 or newer (20 LTS recommended)
- Python 3.11 or newer
- Windows PowerShell or Command Prompt

## Windows Setup

Open two terminals in the project folder.

### 1. Configure and run the backend

In PowerShell:

```powershell
cd .\backend
npm install
Copy-Item .env.example .env
```

Edit `backend\.env` and replace `JWT_SECRET` with a private random value of at least 32 characters. For example, generate one in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste the generated value into `.env`, then create the initial administrator through the hidden-password prompt:

```powershell
npm run create-admin
npm start
```

The API listens at `http://localhost:5000`; its health check is `http://localhost:5000/health`. Do not share the `.env` file or commit it. The create-admin command refuses to create another initial admin after one exists. Never add an admin role through citizen registration.

For Command Prompt, the equivalent setup commands are:

```bat
cd backend
npm install
copy .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run create-admin
npm start
```

Paste the generated secret into `.env` before running the create-admin command.

### 2. Run the Streamlit frontend

In the second PowerShell terminal, from the project root:

```powershell
cd .\frontend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
streamlit run app.py
```

If PowerShell blocks activation, use this for the current terminal only, then activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Command Prompt activation is `.venv\Scripts\activate.bat`. The app opens at `http://localhost:8501`. If the API uses another address, set `GCT_API_URL` before starting Streamlit, for example `$env:GCT_API_URL = "http://localhost:5000/api"` in PowerShell.

### Deployed frontend and backend

For Streamlit Community Cloud, add this app secret in the app's **Settings > Secrets**:

```toml
GCT_API_URL = "https://garbage-complaint-tracker.onrender.com/api"
```

For the Render backend, set `FRONTEND_ORIGINS` to a comma-separated list containing the exact Streamlit Community Cloud origin (scheme and hostname only, with no trailing slash). The backend also allows `http://localhost:8501` and `http://127.0.0.1:8501` for local development. The Streamlit Cloud origin was not included in this repository; use the URL shown in your Streamlit Community Cloud app page, not the GitHub repository URL.

Local development needs no additional setting: the frontend defaults to `http://localhost:5000/api`. An environment variable `GCT_API_URL` takes precedence over Streamlit secrets and the local default.

For temporary development diagnostics, set `$env:GCT_DEBUG_API = "true"` in the frontend PowerShell terminal before running Streamlit. Failed API requests then show the HTTP method, path, status, and safe server message; request bodies, passwords, bearer tokens, and secrets are never displayed. Close the terminal or run `Remove-Item Env:GCT_DEBUG_API` to disable diagnostics.

## First Admin and Worker Accounts

Create the first administrator only from `backend` using `npm run create-admin`. The password is read through the terminal prompt and stored as a bcrypt hash. Citizens cannot select an admin or worker role during registration. Sign in as this administrator, open **Workers & feedback**, and create worker accounts with a login email and initial password. Give worker credentials to the intended worker securely.

To set or change the password for an existing administrator, run `npm run set-admin-password` from the `backend` folder. Enter the admin email, then the new password twice at the hidden prompts. The command only updates the password hash of a matching existing admin; it does not create, promote, or remove accounts. If the admin does not exist yet, use `npm run create-admin` first.

### Initial admin on Render without Shell

For a deployment where Shell is unavailable, add these protected environment variables in the Render service dashboard, then deploy/restart the service:

- `BOOTSTRAP_ADMIN_EMAIL`: a new, unused admin email
- `BOOTSTRAP_ADMIN_NAME`: the admin display name (optional; defaults to `Administrator`)
- `BOOTSTRAP_ADMIN_PASSWORD`: a new password of 10 to 128 characters

During startup, the backend hashes the password with bcrypt and creates an admin only if that email is unused. It never changes an existing account or exposes an admin registration endpoint. The process removes these values from its own environment after attempting setup and does not log the password or hash. After the deployment logs confirm account creation, remove the bootstrap variables from Render. If setup fails because the email already belongs to a non-admin account, choose a different unused email; no record is changed.

**Render Free storage limitation:** this is still local JSON storage. Render Free services do not provide persistent local disks, so users, complaints, workers, and other JSON data can be lost when the service restarts or redeploys. Keeping bootstrap variables configured may recreate the bootstrap admin after storage is reset, but it cannot restore other records. For durable application data, use a persistent disk/hosting plan or move to a separately approved persistent storage design.

## Features

- Citizen registration/login, complaint creation with optional photo, tracking, status history, notifications, resolution photos and feedback
- Admin statistics, status/category charts, search and date-range filters, verification/rejection with reason, worker assignment/management, feedback review, audit log API and CSV export
- Worker login, assigned-task queue, before/after evidence uploads, work notes, and resolution gated on after-cleaning evidence
- JSON-only persistence, bcrypt password hashes, JWT role checks, atomic serialized file writes, bounded image uploads, image signature checks, and authenticated image delivery

Supported complaint statuses are Submitted, Verified, Assigned, In Progress, Resolved, and Rejected. Image types are JPEG, PNG, and WebP; the default maximum is 8 MB and can be changed with `MAX_UPLOAD_MB` in `.env`.

## Local Storage

The API creates `backend/storage/` collections and upload folders on startup if they are missing. Data is retained when the server restarts. The collections are `users.json`, `complaints.json`, `workers.json`, `notifications.json`, `feedback.json`, `schedules.json`, and `audit_logs.json`. Images are stored under `storage/uploads/complaints/` and `storage/uploads/cleaning_evidence/`; JSON records hold relative paths rather than image data.

These files are intentionally ignored by Git. Back up `backend/storage/` separately if you need to preserve demonstration data. Do not edit JSON files while the API is running. This app is designed for local demonstration and does not provide production-grade multi-host coordination or account recovery.

## API Overview

Local base URL: `http://localhost:5000/api`  
Deployed base URL: `https://garbage-complaint-tracker.onrender.com/api`

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- `GET|POST /complaints`, `GET /complaints/:id`, `GET /complaints/:id/history`, `DELETE /complaints/:id`
- `POST /complaints/:id/evidence`, `PATCH /complaints/:id/task`
- `GET /admin/stats`, `PATCH /admin/complaints/:id/status`, `PATCH /admin/complaints/:id/assign`
- `GET|POST /admin/workers`, `PATCH /admin/workers/:id`, `GET /admin/feedback`, `GET /admin/audit`, `GET /admin/report.csv`
- `GET /notifications`, `PATCH /notifications/:id/read`, `POST /feedback`
- `GET /workers` (admin worker roster)
- `GET /files/uploads/:folder/:filename` (authenticated and ownership-checked)

Protected endpoints require `Authorization: Bearer <token>`. JSON responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "error": "..." }`.

## Manual Test Checklist

- [ ] Start both services and confirm the API health check responds.
- [ ] Register a citizen with valid details; verify weak passwords and duplicate email are rejected.
- [ ] Sign out and sign in as the citizen; confirm an incorrect password fails.
- [ ] Submit a complaint with each required field and a JPEG/PNG/WebP photo; verify the generated tracking ID and dashboard entry.
- [ ] Try an unsupported image and an image larger than the configured limit; confirm the API rejects them.
- [ ] Sign in as admin; verify metrics, charts, complaint search, category/status/date filters, details, image, history and CSV export.
- [ ] Reject a complaint with a reason; verify its status and citizen notification.
- [ ] Create a worker account; sign in as that worker and verify only assigned tasks are visible.
- [ ] Upload before and after evidence; try resolving before an after photo (must fail), then resolve with a note.
- [ ] Sign in as the citizen; verify status history, evidence images, notification and submit one feedback rating.
- [ ] Confirm duplicate feedback is rejected and feedback appears in the admin view.
- [ ] Restart the backend; confirm users, complaints, status history, feedback and file references remain available.
- [ ] Attempt to access another citizen's complaint or image with their token; confirm access is denied.

## Troubleshooting

- **API will not start:** Confirm `.env` exists and `JWT_SECRET` is a private random value of at least 32 characters.
- **Frontend cannot connect:** Start the backend first and check `GCT_API_URL`, port 5000 and the health endpoint.
- **Port already in use:** Change `PORT` in `backend/.env` and set `GCT_API_URL` to the corresponding API port.
- **Streamlit command not found:** Activate the frontend virtual environment and reinstall `requirements.txt`.
- **PowerShell activation denied:** Use the process-scoped execution policy command above; it does not change the machine-wide policy.