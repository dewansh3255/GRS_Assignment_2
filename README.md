# SecureJobs — Secure Job Search & Professional Networking Platform

> CSE 345/545 Foundations to Computer Security — Course Project
> IIIT Delhi | January–April 2026

A full-stack, security-first professional networking and job search platform implementing end-to-end encryption, PKI-backed trust, tamper-evident audit logging, and modern authentication — built with Django, React, PostgreSQL, Redis, and Nginx.

---

## Table of Contents

- [Overview](#overview)
- [Security Architecture](#security-architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Milestone Progress](#milestone-progress)
- [Team](#team)

---

## Overview

SecureJobs is designed from the ground up with security as a first-class requirement. Every feature — from user registration to resume upload to private messaging — is built with confidentiality, integrity, and availability in mind.

The platform supports three user roles:

| Role | Capabilities |
|------|-------------|
| **Candidate** | Create profile, upload resumes, search and apply for jobs, send/receive encrypted messages, track application status |
| **Recruiter** | Create company pages, post job listings, view applicants, update application status, message candidates |
| **Admin** | View and manage all users, access tamper-evident audit logs, verify hash chain integrity |

---

## Security Architecture

### Authentication & Session Management
- **TOTP-based 2FA** — Every user must scan a QR code and verify a 6-digit TOTP code on registration and login (via `pyotp`). No session is established without OTP verification.
- **JWT in HttpOnly Cookies** — Access and refresh tokens are stored in `HttpOnly`, `Secure`, `SameSite=Lax` cookies — never in `localStorage`. This prevents XSS-based token theft.
- **Custom Cookie Authentication** — A custom DRF authenticator (`CookieJWTAuthentication`) extracts tokens from cookies, falling back to `Authorization` headers for API testing.
- **Password Hashing** — Django's `create_user` uses PBKDF2+SHA256 by default. Plaintext passwords are never stored.

### Public Key Infrastructure (PKI)
- **RSA-2048 Keypair Generation** — Generated client-side using the Web Crypto API (`RSA-OAEP`, `SHA-256`) during registration. The private key never leaves the client in plaintext.
- **Private Key Wrapping** — The private key is exported as PKCS8, then encrypted with AES-GCM using a key derived from the user's password via PBKDF2 (100,000 iterations). Only the encrypted blob is stored on the server.
- **Resume Digital Signatures** — Before upload, the resume PDF is signed client-side using `RSA-PSS` with `SHA-256`. The signature is stored alongside the file and displayed with a `✓ Signed` badge.
- **Company Verification** — PKI infrastructure is in place for verifying company identity.

### End-to-End Encrypted Messaging
- **Hybrid Encryption** — Each message is encrypted with a freshly generated AES-GCM-256 key. That key is then wrapped with the recipient's RSA-OAEP public key.
- **Zero Server Knowledge** — The server stores only ciphertext (`encrypted_content`) and the wrapped key (`encrypted_key`). The server cannot read any message.
- **Client-side Decryption** — On inbox open, the user enters their password to unwrap their private key, which then decrypts the AES key, which decrypts each message.

### Resume Encryption at Rest
- **Fernet Symmetric Encryption** — Every uploaded resume is encrypted server-side using `cryptography.Fernet` (AES-128-CBC + HMAC-SHA256) before being written to disk. The plaintext file is deleted immediately after encryption.
- **Per-resume Keys** — Each resume has a unique Fernet key stored in the `ResumeKey` table.
- **Access Control** — Only the owner and explicitly authorized recruiters can decrypt and download a resume.

### Tamper-Evident Audit Logging
- **Hash Chaining** — Every audit log entry stores the SHA-256 hash of its own payload plus the hash of the previous entry (`prev_hash`). This creates a blockchain-style chain where tampering any entry invalidates all subsequent hashes.
- **Client-side Verification** — The Admin Panel includes a "Verify Chain" button that fetches all logs and checks every `prev_hash` matches the previous entry's `current_hash`.
- **Logged Events** — `REGISTER`, `LOGIN_SUCCESS`, `RESUME_UPLOAD`, and all critical state changes.

### Attack Defenses
- **SQL Injection** — Django ORM parameterizes all queries by default. No raw SQL is used.
- **XSS** — React's JSX escapes all dynamic content. Django's template engine auto-escapes output.
- **CSRF** — Django's `CsrfViewMiddleware` is active. `CSRF_TRUSTED_ORIGINS` is set for HTTPS. JWT-in-cookie approach adds an additional layer.
- **Session Fixation/Hijacking** — JWT tokens are short-lived (30 minutes). Refresh tokens rotate on use (`ROTATE_REFRESH_TOKENS = True`) and are blacklisted after rotation.
- **HTTPS Enforcement** — Nginx redirects all HTTP traffic to HTTPS. TLS is terminated at the reverse proxy.

---

## Features

### Completed (Milestone 2 + March Milestone)

- Secure user registration with TOTP 2FA setup (QR code via `qrcode.react`)
- Two-step login — password check → OTP verify → JWT cookie issuance
- RSA keypair generation and password-protected private key storage
- User profile with field-level privacy controls (Public / Connections-only)
- Resume upload with Fernet encryption at rest and RSA-PSS digital signature
- End-to-end encrypted one-to-one messaging with real-time inbox polling
- Company page creation and management
- Job posting with title, description, skills, location, type, salary range, deadline
- Job search with keyword, type, and location filters
- Job application workflow with resume attachment and cover note
- Application status tracking — Applied → Reviewed → Interviewed → Rejected → Offer
- Recruiter dashboard — view applicants, update status, add feedback notes
- Hash-chained tamper-evident audit logs
- Admin panel with chain integrity verification
- Role-based access control — Candidate, Recruiter, Admin
- Navbar with role-aware navigation links

### Upcoming (April Milestone)

- OTP virtual keyboard for high-risk actions (password reset, account deletion, resume download)
- Demonstration of defenses against SQL injection, XSS, CSRF
- Final documentation submission

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, React Router v7 |
| **Backend** | Python 3.11, Django 4.2, Django REST Framework |
| **Authentication** | `djangorestframework-simplejwt`, `pyotp` |
| **Cryptography** | Web Crypto API (client), `cryptography` library — Fernet (server) |
| **Database** | PostgreSQL 15 |
| **Cache / Sessions** | Redis 7 |
| **Reverse Proxy** | Nginx (HTTPS with self-signed certificate) |
| **Containerization** | Docker, Docker Compose |

---

## Project Structure

```
FCS_Project/
├── backend/
│   ├── accounts/               # User auth, profiles, messaging, audit logs
│   │   ├── models.py           # User, UserKeys, Profile, Message, AuditLog
│   │   ├── views.py            # Registration, login, TOTP, keys, messages
│   │   ├── serializers.py
│   │   ├── authentication.py   # Custom cookie JWT authenticator
│   │   ├── audit.py            # Hash-chaining audit log helper
│   │   └── urls.py
│   ├── jobs/                   # Resumes, companies, jobs, applications
│   │   ├── models.py           # Resume, ResumeKey, Company, Job, Application
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── urls.py
│   ├── core/                   # Django project settings and URLs
│   │   ├── settings.py
│   │   └── urls.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Register.tsx    # Registration + TOTP QR setup
│       │   ├── Login.tsx       # Two-step login
│       │   ├── Dashboard.tsx   # Profile + resume management
│       │   ├── Jobs.tsx        # Job search and apply
│       │   ├── Applications.tsx # Candidate application tracker
│       │   ├── Recruiter.tsx   # Company + job + applicant management
│       │   └── AdminPanel.tsx  # Audit log viewer
│       ├── components/
│       │   ├── Navbar.tsx      # Role-aware navigation
│       │   └── ChatWidget.tsx  # E2EE chat widget
│       ├── services/
│       │   └── api.ts          # All API call functions
│       └── utils/
│           └── crypto.ts       # Web Crypto API — RSA, AES, signing
├── nginx/
│   ├── nginx.conf              # HTTPS, proxy rules
│   └── ssl/                    # Self-signed TLS certificate
└── docker-compose.yml
```

---

## Getting Started

### Prerequisites

- Docker Desktop installed and running
- Git

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/FCS_Project.git
cd FCS_Project

# 2. Start all services
docker-compose up --build

# 3. Run database migrations
docker-compose exec backend python manage.py migrate

# 4. Create a superuser for Django admin
docker-compose exec backend python manage.py createsuperuser

# 5. Collect static files (for Django admin panel)
docker-compose exec backend python manage.py collectstatic --noinput
```

### Access

| Service | URL |
|---------|-----|
| **Frontend** | https://localhost |
| **Django Admin** | https://localhost/admin/ |
| **Backend API** | https://localhost/api/ |

> Accept the self-signed certificate warning in your browser — the connection is still TLS-encrypted. This satisfies the "self-signed or CA-issued certificate" requirement from the project spec.

### First Run

1. Go to `https://localhost` and register a new account
2. Scan the QR code with Microsoft Authenticator or Google Authenticator
3. Enter the 6-digit OTP to complete registration
4. You will be redirected to the dashboard with your RSA keys automatically generated

---

## Environment Variables

Set in `docker-compose.yml`. For production, move these to a `.env` file.

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `dev_secret_key_change_in_prod` | Django secret key |
| `DEBUG` | `True` | Set to `False` in production |
| `DB_HOST` | `db` | PostgreSQL host |
| `DB_NAME` | `fcs_project` | Database name |
| `DB_USER` | `fcs_user` | Database user |
| `DB_PASS` | `fcs_password` | Database password |
| `REDIS_HOST` | `redis` | Redis host |
| `ALLOWED_HOSTS` | `*` | Restrict in production |

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register/` | Register new user |
| `POST` | `/api/auth/login/` | Step 1 — password check |
| `GET` | `/api/auth/totp/generate/<user_id>/` | Get TOTP QR URI |
| `POST` | `/api/auth/totp/verify/` | Step 2 — OTP verify + issue cookies |
| `GET` | `/api/auth/auth-check/` | Verify active session |

### Profile & Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/PATCH` | `/api/auth/profile/me/` | Get or update own profile |
| `POST` | `/api/auth/keys/upload/` | Upload RSA public + encrypted private key |
| `GET` | `/api/auth/keys/me/` | Get own keys |
| `GET` | `/api/auth/keys/<username>/` | Get another user's public key |

### Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/messages/` | Fetch encrypted inbox |
| `POST` | `/api/auth/messages/` | Send encrypted message |
| `GET` | `/api/auth/users/` | List users for chat |

### Jobs & Applications

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jobs/jobs/` | List jobs (supports `?q=`, `?job_type=`, `?location=`) |
| `POST` | `/api/jobs/jobs/` | Create job posting (Recruiter) |
| `GET/PATCH` | `/api/jobs/jobs/<id>/` | Get or update job |
| `GET/POST` | `/api/jobs/companies/` | List or create companies |
| `GET/POST` | `/api/jobs/applications/` | List or submit applications |
| `PATCH` | `/api/jobs/applications/<id>/` | Update application status (Recruiter) |

### Resumes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs/resume/upload/` | Upload and encrypt resume |
| `GET` | `/api/jobs/resume/` | List own resumes |
| `GET` | `/api/jobs/resume/<id>/download/` | Decrypt and download resume |
| `DELETE` | `/api/jobs/resume/<id>/` | Delete resume |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/audit-logs/` | Fetch hash-chained audit log (Admin only) |

---

## Milestone Progress

| Milestone | Due | Status |
|-----------|-----|--------|
| Milestone 1 — HTTPS + skeleton app | Feb 13 | ✅ Complete |
| Milestone 2 — Auth, OTP, profiles, resume upload | Feb 27 | ✅ Complete |
| March Milestone — Jobs, messaging, applications, audit logs | Mar 31 | ✅ Complete |
| April Milestone — Virtual keyboard, attack demos, final docs | Apr 30 | 🔄 In Progress |

---

## Team

| Member | Role |
|--------|------|
| Member A | Authentication, profiles, privacy controls, TOTP flow |
| Member B | RSA keypair system, E2EE messaging, resume signing |

---

## License

This project is developed for academic purposes as part of CSE 345/545 at IIIT Delhi.