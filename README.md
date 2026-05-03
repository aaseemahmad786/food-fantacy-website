# 🍗 Food Fantacy

A full-stack **cloud kitchen web app** for ordering non-veg food online — built with React, Vite, and a Node.js/Express backend powered by SQLite.

![Food Fantacy](https://img.shields.io/badge/version-1.0.0-orange?style=flat-square)
![Node](https://img.shields.io/badge/node-%3E%3D22.x-green?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

---

## ✨ Features

- 🍽️ **Full Non-Veg Menu** — 35+ dishes across categories (Chicken, Mutton, Fish, Biryani, Kebabs, etc.) with category filters
- 🛒 **Shopping Cart** — Persistent cart saved in localStorage
- 👤 **User Authentication** — Register/Login with email or mobile number + JWT-based sessions
- 🔐 **Admin Dashboard** — Separate admin login to view and manage all kitchen orders
- 📦 **Order Management** — Real-time order status updates (New → Preparing → Out for Delivery → Delivered)
- 💳 **Multiple Payment Methods**:
  - Cash on Delivery
  - UPI on Delivery
  - Pay Now via UPI (with QR code & deep link)
  - Razorpay online payment gateway
- 📲 **WhatsApp Notifications** — Orders sent to kitchen WhatsApp automatically
- 📋 **My Orders** — Users can track their own order history
- 🗄️ **SQLite Database** — Zero-config local database, auto-migrates on startup

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6 |
| Backend | Node.js, Express 4 |
| Database | SQLite (via `node:sqlite`) |
| Payments | Razorpay SDK |
| Auth | JWT (custom, via `node:crypto`) |
| Dev tooling | Concurrently, Vite HMR |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js v22+** (required for the built-in `node:sqlite` module)
- npm

### 1. Clone the repository

```bash
git clone https://github.com/aaseemahmad786/food-fantacy-website.git
cd food-fantacy-website
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=4000
AUTH_SECRET=replace-with-a-long-random-secret

# Admin account (auto-created on first run)
ADMIN_EMAIL=admin@foodfantacy.com
ADMIN_PASSWORD=Admin@12345
ADMIN_NAME=Food Fantacy Admin
ADMIN_PHONE=9999999999

# Razorpay (optional — only needed for online payments)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

### 4. Run in development mode

```bash
npm run dev
```

This starts both the **Vite frontend** (port 5173) and the **Express backend** (port 4000) concurrently.

- Frontend: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:4000/api](http://localhost:4000/api)

---

## 📦 Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start frontend + backend together |
| `npm run client` | Start Vite dev server only |
| `npm run server` | Start Express backend only |
| `npm run build` | Build frontend for production |
| `npm start` | Run backend in production mode |
| `npm run preview` | Preview the production build |
| `npm run dev:stop` | Stop all dev servers (Windows) |

---

## 🔌 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check |
| `GET` | `/api/menu` | — | Fetch all menu items |
| `POST` | `/api/auth/register` | — | Register a new user |
| `POST` | `/api/auth/login` | — | Login (email/mobile + password) |
| `POST` | `/api/auth/social` | — | Social login (Google/Facebook) |
| `GET` | `/api/auth/me` | User | Get current user info |
| `POST` | `/api/orders` | User | Place a new order |
| `GET` | `/api/my-orders` | User | Get logged-in user's orders |
| `GET` | `/api/orders` | Admin | Get all kitchen orders |
| `PATCH` | `/api/orders/:id/status` | Admin | Update an order's status |
| `DELETE` | `/api/orders` | Admin | Clear all orders |
| `POST` | `/api/payment/razorpay` | User | Create a Razorpay payment order |

---

## 🗂️ Project Structure

```
food-fantacy/
├── server/
│   ├── index.js        # Express app & API routes
│   ├── database.js     # SQLite database & queries
│   ├── auth.js         # JWT middleware & helpers
│   ├── password.js     # Password hashing (scrypt)
│   ├── menuData.js     # Static menu item definitions
│   └── env.js          # Environment variable loader
├── src/
│   ├── App.jsx         # React app (single-file SPA)
│   ├── styles.css      # Global styles
│   └── main.jsx        # React entry point
├── scripts/
│   └── stop-dev.ps1    # Windows dev server stopper
├── index.html          # HTML entry point
├── .env.example        # Environment variable template
├── vite.config.js      # Vite configuration
└── package.json
```

---

## 🏠 Pages & Navigation

| Hash Route | Page | Access |
|---|---|---|
| `#home` | Landing / Hero section | Public |
| `#menu` | Full menu with category filters | Public |
| `#cloud-kitchen` | Cloud kitchen info section | Public |
| `#checkout` | Cart review & order form | Login required |
| `#login` | User login / register | Public |
| `#admin-login` | Admin login | Public |
| `#orders` | Admin kitchen dashboard | Admin only |
| `#account` | My orders history | User only |

---

## 💳 Payment Methods

| Method | How It Works |
|---|---|
| **Cash on Delivery** | Pay in cash when food is delivered |
| **UPI on Delivery** | Pay via UPI when food is delivered |
| **Pay Now via UPI** | Scan QR code or tap UPI deep link to pay before confirming |
| **Razorpay** | Secure online card/UPI/wallet payment via Razorpay gateway |

---

## 🗄️ Database

The app uses **Node.js built-in SQLite** (`node:sqlite`) — no installation needed.

- Database file is auto-created at `data/food-fantacy.sqlite` on first run
- Schema is auto-migrated on every startup
- Admin user is auto-seeded from `.env` variables
- Menu items are synced from `server/menuData.js` on startup

---

## 🔒 Security Notes

- Passwords are hashed with **scrypt** (Node.js built-in `node:crypto`)
- Auth tokens are **JWT** signed with `AUTH_SECRET`
- `.env` is excluded from version control via `.gitignore`
- Admin routes are protected by `requireRole("admin")` middleware

---

## 📄 License

MIT © [Aaseem Ahmad](https://github.com/aaseemahmad786)
