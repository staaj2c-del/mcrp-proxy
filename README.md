# Sh0tzbycorey Studio — MongoDB Proxy

The Studio PWA runs on an edge runtime that cannot open a direct MongoDB
connection. This small Node service sits between them.

```
Studio PWA  →  (https + x-api-key)  →  this proxy  →  MongoDB Atlas (database: Studio)
```

## Deploy

1. Create a MongoDB Atlas cluster and a database user.
2. Deploy this folder to any Node host (Render, Railway, Fly.io, a VPS).
   Start command: `npm install && npm start`
3. Set environment variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB` | no | defaults to `Studio` |
| `PROXY_API_KEY` | yes | long random string; the PWA sends it as `x-api-key` |
| `ALLOWED_ORIGIN` | no | defaults to `*` |
| `PORT` | no | defaults to `8787` |

4. In Atlas → Network Access, allow your host's outbound IPs (or `0.0.0.0/0`
   if the host has no static IP).
5. Check `GET /health` returns `{"ok":true,"db":"Studio"}`.

## Link it to the PWA

In the Studio app, add two secrets:

- `MONGO_PROXY_URL` — e.g. `https://studio-proxy.onrender.com`
- `MONGO_PROXY_API_KEY` — the same value as `PROXY_API_KEY`

The app never talks to Mongo directly and the key never reaches the browser.

## API

All requests: `POST /v1/:collection/:op` with header `x-api-key`.

Operations: `find`, `findOne`, `insertOne`, `insertMany`, `updateOne`,
`updateMany`, `deleteOne`, `deleteMany`, `count`, `aggregate`, `createIndex`.

Body: `{ filter, update, document, documents, options, pipeline, keys }`.
Response: `{ result }` with `ObjectId`/`Date` serialized to strings.

Only the Studio collection allow-list is reachable.
