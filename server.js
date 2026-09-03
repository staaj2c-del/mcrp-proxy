/**
 * Sh0tzbycorey Studio — MongoDB Proxy
 *
 * The Studio PWA runs on an edge runtime that cannot hold a long-lived
 * MongoDB TCP connection. This tiny service is the bridge: deploy it anywhere
 * that runs Node (Render, Railway, Fly.io, a VPS, Vercel Node functions), point
 * it at MongoDB Atlas, and give the PWA its URL + API key.
 *
 * Database name: Studio
 *
 * Env vars:
 *   MONGODB_URI   - MongoDB Atlas connection string (required)
 *   MONGODB_DB    - database name (default: Studio)
 *   PROXY_API_KEY - shared secret the PWA sends as x-api-key (required)
 *   ALLOWED_ORIGIN- optional CORS origin, default "*"
 *   PORT          - default 8787
 */
import express from "express";
import { MongoClient, ObjectId } from "mongodb";

const MONGODB_DB = process.env.MONGODB_DB || "Studio";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

let dbPromise;

function getDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing from the proxy environment");
  if (!dbPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    dbPromise = client.connect().then((connected) => connected.db(MONGODB_DB));
  }
  return dbPromise;
}

// Only these collections may be reached through the proxy.
const COLLECTIONS = new Set([
  "users",
  "clients",
  "bookings",
  "services",
  "packages",
  "addons",
  "payments",
  "contracts",
  "contractTemplates",
  "forms",
  "formResponses",
  "galleries",
  "galleryPhotos",
  "rooms",
  "studioReservations",
  "equipment",
  "availability",
  "blockedSlots",
  "notifications",
  "emails",
  "auditLogs",
  "settings",
]);

const app = express();
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", async (_req, res) => {
  try {
    const db = await getDatabase();
    await db.command({ ping: 1 });
    res.json({ ok: true, db: MONGODB_DB });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.use((req, res, next) => {
  const apiKey = process.env.PROXY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "PROXY_API_KEY is missing from the proxy environment" });
  }
  if (req.header("x-api-key") !== apiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

function reviveIds(value) {
  if (Array.isArray(value)) return value.map(reviveIds);
  if (value && typeof value === "object") {
    if (typeof value.$oid === "string") return new ObjectId(value.$oid);
    if (typeof value.$date === "string") return new Date(value.$date);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = reviveIds(v);
    return out;
  }
  return value;
}

function serialize(value) {
  if (Array.isArray(value)) return value.map(serialize);
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

app.post("/v1/:collection/:op", async (req, res) => {
  const { collection, op } = req.params;
  if (!COLLECTIONS.has(collection)) {
    return res.status(400).json({ error: `Unknown collection: ${collection}` });
  }
  try {
    const db = await getDatabase();
    const col = db.collection(collection);
    const body = reviveIds(req.body ?? {});
    const { filter = {}, update = {}, document, documents, options = {}, pipeline = [] } = body;

    let result;
    switch (op) {
      case "find":
        result = await col.find(filter, options).toArray();
        break;
      case "findOne":
        result = await col.findOne(filter, options);
        break;
      case "insertOne":
        result = await col.insertOne(document);
        break;
      case "insertMany":
        result = await col.insertMany(documents);
        break;
      case "updateOne":
        result = await col.updateOne(filter, update, options);
        break;
      case "updateMany":
        result = await col.updateMany(filter, update, options);
        break;
      case "deleteOne":
        result = await col.deleteOne(filter);
        break;
      case "deleteMany":
        result = await col.deleteMany(filter);
        break;
      case "count":
        result = await col.countDocuments(filter);
        break;
      case "aggregate":
        result = await col.aggregate(pipeline).toArray();
        break;
      case "createIndex":
        result = await col.createIndex(body.keys, options);
        break;
      default:
        return res.status(400).json({ error: `Unknown operation: ${op}` });
    }
    res.json({ result: serialize(result) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? "Proxy error" });
  }
});

export default app;
