import "./env.js";
import express from "express";
import Razorpay from "razorpay";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createOrder,
  createUser,
  databasePath,
  deleteOrders,
  getMenuItems,
  getOrders,
  getOrdersByUser,
  getUserByEmail,
  getUserByIdentifier,
  updateOrderStatus,
} from "./database.js";
import { createToken, requireAuth, requireRole } from "./auth.js";
import { hashPassword, verifyPassword } from "./password.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist");
const indexPath = path.join(distPath, "index.html");
const allowedPayments = new Set(["Cash on Delivery", "UPI on Delivery", "UPI", "Razorpay"]);
const allowedStatuses = new Set(["New", "Preparing", "Out for Delivery", "Delivered", "Cancelled"]);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "YOUR_RAZORPAY_KEY_ID",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "YOUR_RAZORPAY_KEY_SECRET",
});

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (request, response) => {
  response.json({
    ok: true,
    database: databasePath,
  });
});

app.get("/api", (request, response) => {
  response.json({
    name: "Food Fantacy API",
    routes: [
      "GET /api/health",
      "GET /api/menu",
      "POST /api/auth/register",
      "POST /api/auth/login",
      "GET /api/auth/me",
      "POST /api/orders",
      "GET /api/my-orders",
      "GET /api/orders (admin)",
      "PATCH /api/orders/:id/status (admin)",
      "DELETE /api/orders (admin)",
    ],
  });
});

app.get("/api/menu", (request, response) => {
  response.json(getMenuItems());
});

app.get("/api/auth/login", (request, response) => {
  response.status(405).json({
    error: "Use POST /api/auth/login with email, password, and role.",
  });
});

app.get("/api/auth/register", (request, response) => {
  response.status(405).json({
    error: "Use POST /api/auth/register with name, email, phone, and password.",
  });
});

app.post("/api/auth/register", (request, response, next) => {
  try {
    const input = validateRegistration(request.body);
    const user = createUser({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: hashPassword(input.password),
      role: "user",
    });

    response.status(201).json(toAuthResponse(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", (request, response, next) => {
  try {
    const { identifier, password, role } = validateLogin(request.body);
    const user = getUserByIdentifier(identifier);

    if (!user || !verifyPassword(password, user.passwordHash) || (role && user.role !== role)) {
      throw httpError(401, "Invalid email/mobile or password.");
    }

    response.json(toAuthResponse(user));
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/social", (request, response, next) => {
  try {
    const { provider, email, name } = request.body;
    if (!provider || !email || !name) {
      throw httpError(400, "Provider, email, and name are required for social login.");
    }

    let user = getUserByEmail(email);
    if (!user) {
      user = createUser({
        name: name,
        email: email,
        phone: "0000000000",
        passwordHash: hashPassword(randomUUID()),
        role: "user",
      });
    }

    response.json(toAuthResponse(user));
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  response.json(request.user);
});

app.get("/api/orders", requireAuth, requireRole("admin"), (request, response) => {
  response.json(getOrders());
});

app.get("/api/my-orders", requireAuth, (request, response) => {
  response.json(getOrdersByUser(request.user.id));
});

app.post("/api/orders", requireAuth, (request, response, next) => {
  try {
    const customer = validateCustomer(request.body.customer);
    const order = createOrder({ customer, items: request.body.items, userId: request.user.id });
    response.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/orders/:id/status", requireAuth, requireRole("admin"), (request, response, next) => {
  try {
    const status = String(request.body.status || "").trim();
    if (!allowedStatuses.has(status)) {
      throw httpError(400, "Invalid order status.");
    }

    const order = updateOrderStatus(request.params.id, status);
    if (!order) {
      throw httpError(404, "Order not found.");
    }

    response.json(order);
  } catch (error) {
    next(error);
  }
});

app.post("/api/payment/razorpay", requireAuth, async (request, response, next) => {
  try {
    const { amount } = request.body;
    if (!amount || amount <= 0) {
      throw httpError(400, "Valid amount is required.");
    }

    const options = {
      amount: Math.round(amount * 100), // Amount in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}_${request.user.id.slice(0, 5)}`,
    };

    const order = await razorpay.orders.create(options);
    response.json({
      id: order.id,
      currency: order.currency,
      amount: order.amount,
      key_id: razorpay.key_id
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/orders", requireAuth, requireRole("admin"), (request, response) => {
  const deleted = deleteOrders();
  response.json({ deleted });
});

app.use("/api", (request, response) => {
  response.status(404).json({ error: "API route not found." });
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

app.use((request, response, next) => {
  if (request.method === "GET" && fs.existsSync(indexPath)) {
    response.sendFile(indexPath);
    return;
  }

  next();
});

app.use((request, response) => {
  response.status(404).send("Not found. Run npm run build before npm start for production.");
});

app.use((error, request, response, next) => {
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(error);
  }

  response.status(statusCode).json({
    error: statusCode >= 500 ? "Server error." : error.message,
  });
});

app.listen(port, () => {
  console.log(`Food Fantacy API running at http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});

function validateCustomer(customer = {}) {
  const name = String(customer.name || "").trim();
  const phone = String(customer.phone || "").trim();
  const address = String(customer.address || "").trim();
  const payment = String(customer.payment || "").trim();
  const notes = String(customer.notes || "").trim();

  if (name.length < 2) {
    throw httpError(400, "Customer name is required.");
  }

  if (!/^[0-9]{10}$/.test(phone)) {
    throw httpError(400, "Phone number must be 10 digits.");
  }

  if (address.length < 8) {
    throw httpError(400, "Delivery address is required.");
  }

  if (!allowedPayments.has(payment)) {
    throw httpError(400, "Invalid payment method.");
  }

  return { name, phone, address, payment, notes };
}

function validateRegistration(body = {}) {
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");

  if (name.length < 2) {
    throw httpError(400, "Name must be at least 2 characters.");
  }

  if (!isValidEmail(email)) {
    throw httpError(400, "Valid email is required.");
  }

  if (!/^[0-9]{10}$/.test(phone)) {
    throw httpError(400, "Phone number must be 10 digits.");
  }

  if (password.length < 8) {
    throw httpError(400, "Password must be at least 8 characters.");
  }

  return { name, email, phone, password };
}

function validateLogin(body = {}) {
  const identifier = String(body.identifier || body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = body.role ? String(body.role).trim() : "";

  if (!identifier || !password) {
    throw httpError(400, "Email/Mobile and password are required.");
  }

  if (role && !["user", "admin"].includes(role)) {
    throw httpError(400, "Invalid login role.");
  }

  return { identifier, password, role };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toAuthResponse(user) {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
    token: createToken(user),
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
