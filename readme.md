# TenantAct API

This repository exposes a small API for writing to the TenantAct database.

## Contribute

The API runs on [Node.js](https://nodejs.org/en) and writes to a [MongoDB](https://www.mongodb.com/) database. There are many ways to run a [MongoDB](https://www.mongodb.com/) database locally. Follow these steps to use [Docker](https://www.docker.com/) to run a database for local development.

After installing Docker, run the following to start a MongoDB server.

```
export MONGODB_VERSION=8.0-ubi8
docker run --name mongodb -d -p 27017:27017 mongodb/mongodb-community-server:$MONGODB_VERSION
```

The database will be available at `mongodb://localhost:27017`.

Run the following to stop the docker container.

```
docker stop mongodb
```

Run the following to delete the data and remove the docker container.

```
docker rm mongodb
```

After cloning this repository, install the [Node.js](https://nodejs.org/en) dependencies.

```
npm install
```

Copy the `.env.dev` file to `.env` and set the variables to match your MongoDB setup. You can generate compatible keys with teh command `openssl rand -base64 32`.

```
PASSWORD=password
MONGODB_URI=mongodb://localhost:27017
MONGODB_DBNAME=example

# Must be base64 32 bit strings
PIIFIELD_KEY=...
PII_HMAC_KEY=...

# For local development only
DISABLE_CORS=true
```

Install the [Vercel CLI](https://vercel.com/docs/cli) (you will need a Vercel account).

```
npm i -g vercel
```

Run the vercel app.

```
vercel dev
```

The API should be accepting requests at `http://localhost:3000` or a similar URL.

## Auth, saved tribunal cases, and comments

This API supports user accounts, bearer-token authentication, per-user saved tribunal cases, and case comments for the Tribunal Scraper integration. On Vercel, these routes are served under `/api`; examples below use `http://localhost:3000/api`.

To stay within Vercel Hobby function limits, the auth endpoints are implemented by one catch-all function at `api/auth/[...path].js`, and the saved-case/comment endpoints are implemented by one catch-all function at `api/cases/[...path].js`. The public URLs remain the REST-style paths documented below.

### Environment variables

Add these variables for the auth/case endpoints:

```
JWT_SECRET=replace-with-at-least-32-random-characters
TRIBUNAL_SCRAPER_ORIGIN=http://localhost:5173
CORS_ALLOWED_ORIGINS=https://tribunal.tenantact.org,http://localhost:5173
AUTH_RATE_LIMIT_MAX=20
AUTH_RATE_LIMIT_WINDOW_MS=900000
BCRYPT_ROUNDS=12
```

`JWT_SECRET` signs user tokens and must not be committed. `TRIBUNAL_SCRAPER_ORIGIN` and `CORS_ALLOWED_ORIGINS` allow the Tribunal Scraper frontend origin in addition to the default `tenantact.org` origins. Auth route rate limiting is in-memory per serverless instance and defaults to 20 attempts per 15 minutes.

### Migration

MongoDB collections are created automatically on first write. Run this once per environment to create the required unique and query indexes:

```
npm run migrate
```

The migration prepares:

- `users`: unique `email`
- `saved_cases`: unique `{ userId, caseRef }`, plus `userId` and `caseRef` query indexes
- `case_comments`: `caseRef`, `userId`, and common case/user query indexes

### Authentication

Passwords are never stored in plain text. New passwords are hashed with bcrypt; responses return an HMAC-SHA256 JWT-compatible bearer token.

Send authenticated requests with:

```
Authorization: Bearer YOUR_TOKEN
```

#### POST /auth/signup

Creates a user. Passwords must be at least 12 characters.

```
curl -X POST "http://localhost:3000/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@example.com","password":"correct horse battery staple","name":"Alex"}'
```

Response:

```
{
  "token": "eyJ...",
  "user": {
    "id": "665...",
    "email": "alex@example.com",
    "name": "Alex",
    "role": "user",
    "createdAt": "2026-05-31T..."
  }
}
```

Errors include `400 invalid_email`, `400 invalid_password`, `409 email_unavailable`, `429 rate_limited`.

#### POST /auth/login

Logs in with email and password. Invalid credentials always return a generic error.

```
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@example.com","password":"correct horse battery staple"}'
```

#### GET /auth/me

Returns the current user profile from the token.

```
curl "http://localhost:3000/api/auth/me" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Saved cases

Case references are strings up to 160 characters. Because tribunal references can contain `/`, URL-encode the whole reference with `encodeURIComponent(caseRef)` when using it in a path.

#### GET /cases/saved

Lists the current user's saved cases. Supports `page` and `limit` query parameters.

```
curl "http://localhost:3000/api/cases/saved?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### POST /cases/:caseRef/save

Saves a case for the current user. Duplicate saves are prevented by a MongoDB unique index and are idempotent.

```
CASE_REF="$(node -e 'console.log(encodeURIComponent("FTS/HPC/123"))')"
curl -X POST "http://localhost:3000/api/cases/$CASE_REF/save" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```
{ "caseRef": "FTS/HPC/123", "saved": true }
```

#### DELETE /cases/:caseRef/save

Removes a saved case for the current user.

```
curl -X DELETE "http://localhost:3000/api/cases/$CASE_REF/save" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:

```
{ "caseRef": "FTS/HPC/123", "saved": false }
```

### Case comments

Comments are readable without authentication and paginated with `page` and `limit`. Creating, editing, and deleting comments requires authentication. Users can edit or delete only their own comments; users with `role: "admin"` can moderate any comment. Comment content is trimmed and otherwise stored unchanged.

#### GET /cases/:caseRef/comments

```
curl "http://localhost:3000/api/cases/$CASE_REF/comments?page=1&limit=20"
```

#### POST /cases/:caseRef/comments

```
curl -X POST "http://localhost:3000/api/cases/$CASE_REF/comments" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"This decision is useful for repairs evidence."}'
```

Response:

```
{
  "comment": {
    "id": "665...",
    "caseRef": "FTS/HPC/123",
    "content": "This decision is useful for repairs evidence.",
    "createdAt": "2026-05-31T...",
    "updatedAt": "2026-05-31T...",
    "author": {
      "id": "665...",
      "email": "alex@example.com",
      "name": "Alex"
    }
  }
}
```

#### PATCH /cases/:caseRef/comments/:commentId

```
curl -X PATCH "http://localhost:3000/api/cases/$CASE_REF/comments/COMMENT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Updated comment text."}'
```

#### DELETE /cases/:caseRef/comments/:commentId

```
curl -X DELETE "http://localhost:3000/api/cases/$CASE_REF/comments/COMMENT_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Common errors are `400 invalid_case_ref`, `400 invalid_content`, `401 unauthorized`, `403 forbidden`, and `404 comment_not_found`.

### Tests

Run:

```
npm test
```
