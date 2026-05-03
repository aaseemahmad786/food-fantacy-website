import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { menuItems } from "./menuData.js";
import { hashPassword } from "./password.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");

fs.mkdirSync(dataDir, { recursive: true });

export const databasePath = process.env.DATABASE_PATH || path.join(dataDir, "food-fantacy.sqlite");

const database = new DatabaseSync(databasePath);

database.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price > 0),
    emoji TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    notes TEXT DEFAULT '',
    total INTEGER NOT NULL CHECK (total >= 0),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total INTEGER NOT NULL CHECK (line_total >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    created_at TEXT NOT NULL
  );
`);

runMigrations();
syncMenuItems();
ensureAdminUser();

export function getMenuItems() {
  return database
    .prepare("SELECT id, name, category, price, emoji, description, image_url FROM menu_items ORDER BY id")
    .all()
    .map(mapMenuItem);
}

export function getOrders() {
  return database
    .prepare("SELECT * FROM orders ORDER BY created_at DESC")
    .all()
    .map(mapOrder);
}

export function getOrdersByUser(userId) {
  return database
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId)
    .map(mapOrder);
}

export function getOrderById(orderId) {
  const order = database.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  return order ? mapOrder(order) : null;
}

export function createOrder({ customer, items, userId }) {
  const orderLines = buildOrderLines(items);
  const total = orderLines.reduce((sum, item) => sum + item.lineTotal, 0);
  const orderId = `FF-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date().toISOString();

  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(`
        INSERT INTO orders (
          id, user_id, created_at, status, customer_name, customer_phone,
          customer_address, payment_method, notes, total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        orderId,
        userId || null,
        createdAt,
        "New",
        customer.name,
        customer.phone,
        customer.address,
        customer.payment,
        customer.notes || "",
        total,
      );

    const insertItem = database.prepare(`
      INSERT INTO order_items (
        order_id, menu_item_id, name, category, price, quantity, line_total
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    orderLines.forEach((item) => {
      insertItem.run(orderId, item.id, item.name, item.category, item.price, item.quantity, item.lineTotal);
    });

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return getOrderById(orderId);
}

export function updateOrderStatus(orderId, status) {
  const result = database.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
  return result.changes ? getOrderById(orderId) : null;
}

export function deleteOrders() {
  return database.prepare("DELETE FROM orders").run().changes;
}

export function createUser({ name, email, phone, passwordHash, role = "user" }) {
  const userId = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    database
      .prepare(`
        INSERT INTO users (id, name, email, phone, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(userId, name, email, phone, passwordHash, role, createdAt);
  } catch (error) {
    if (error.code === "ERR_SQLITE_ERROR" && String(error.message).includes("UNIQUE")) {
      throw httpError(409, "An account already exists for this email.");
    }

    throw error;
  }

  return getUserById(userId);
}

export function getUserByEmail(email) {
  const user = database.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email);
  return user ? mapUser(user, true) : null;
}

export function getUserByIdentifier(identifier) {
  const user = database.prepare("SELECT * FROM users WHERE lower(email) = lower(?) OR phone = ?").get(identifier, identifier);
  return user ? mapUser(user, true) : null;
}

export function getUserById(userId) {
  const user = database.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  return user ? mapUser(user) : null;
}

function runMigrations() {
  ensureColumn("menu_items", "image_url", "ALTER TABLE menu_items ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  ensureColumn("orders", "user_id", "ALTER TABLE orders ADD COLUMN user_id TEXT");
}

function syncMenuItems() {
  ensureImageColumn();

  database.exec("BEGIN IMMEDIATE");
  try {
    const upsertMenuItem = database.prepare(`
      INSERT INTO menu_items (id, name, category, price, emoji, description, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        price = excluded.price,
        emoji = excluded.emoji,
        description = excluded.description,
        image_url = excluded.image_url
    `);

    menuItems.forEach((item) => {
      upsertMenuItem.run(
        item.id,
        item.name,
        item.category,
        item.price,
        item.emoji,
        item.description,
        item.imageUrl,
      );
    });

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function ensureImageColumn() {
  ensureColumn("menu_items", "image_url", "ALTER TABLE menu_items ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
}

function ensureColumn(tableName, columnName, alterSql) {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    database.exec(alterSql);
  }
}

function ensureAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@foodfantacy.com";
  const existingAdmin = getUserByEmail(adminEmail);

  if (existingAdmin) return;

  createUser({
    name: process.env.ADMIN_NAME || "Food Fantacy Admin",
    email: adminEmail,
    phone: process.env.ADMIN_PHONE || "9999999999",
    passwordHash: hashPassword(process.env.ADMIN_PASSWORD || "Admin@12345"),
    role: "admin",
  });
}

function buildOrderLines(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw httpError(400, "Add at least one item to place an order.");
  }

  const selectMenuItem = database.prepare("SELECT * FROM menu_items WHERE id = ?");

  return items.map((item) => {
    const menuItem = selectMenuItem.get(Number(item.id));
    const quantity = Number(item.quantity);

    if (!menuItem) {
      throw httpError(400, `Menu item not found: ${item.id}`);
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw httpError(400, "Each item quantity must be between 1 and 50.");
    }

    return {
      ...mapMenuItem(menuItem),
      quantity,
      lineTotal: menuItem.price * quantity,
    };
  });
}

function mapMenuItem(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    price: item.price,
    emoji: item.emoji,
    desc: item.description,
    imageUrl: item.image_url,
  };
}

function mapOrder(order) {
  return {
    id: order.id,
    userId: order.user_id,
    createdAt: order.created_at,
    status: order.status,
    customer: {
      name: order.customer_name,
      phone: order.customer_phone,
      address: order.customer_address,
      payment: order.payment_method,
      notes: order.notes || "",
    },
    items: getOrderItems(order.id),
    total: order.total,
  };
}

function mapUser(user, includePasswordHash = false) {
  const mappedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.created_at,
  };

  if (includePasswordHash) {
    mappedUser.passwordHash = user.password_hash;
  }

  return mappedUser;
}

function getOrderItems(orderId) {
  return database
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
    .all(orderId)
    .map((item) => ({
      id: item.menu_item_id,
      name: item.name,
      category: item.category,
      price: item.price,
      quantity: item.quantity,
      lineTotal: item.line_total,
    }));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
