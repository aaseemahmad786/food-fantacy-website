import crypto from "node:crypto";
import { getUserById } from "./database.js";

const tokenSecret = process.env.AUTH_SECRET || "change-this-food-fantacy-local-secret";
const tokenTtlSeconds = 60 * 60 * 24 * 7;

export function createToken(user) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: user.id,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + tokenTtlSeconds,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function requireAuth(request, response, next) {
  try {
    const token = getBearerToken(request);
    const payload = verifyToken(token);
    const user = getUserById(payload.sub);

    if (!user) {
      throw httpError(401, "Login required.");
    }

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(role) {
  return (request, response, next) => {
    try {
      if (!request.user) {
        throw httpError(401, "Login required.");
      }

      if (request.user.role !== role) {
        throw httpError(403, "You do not have permission for this action.");
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw httpError(401, "Login required.");
  }

  return token;
}

function verifyToken(token) {
  const [encodedHeader, encodedPayload, signature] = String(token || "").split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    throw httpError(401, "Invalid login token.");
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`);
  const expected = Buffer.from(expectedSignature);
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw httpError(401, "Invalid login token.");
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw httpError(401, "Login expired. Please login again.");
  }

  return payload;
}

function sign(value) {
  return crypto.createHmac("sha256", tokenSecret).update(value).digest("base64url");
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
