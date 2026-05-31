import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { beforeEach, test } from "node:test";
import { ObjectId } from "mongodb";
import { setTestDb } from "../api/_db.js";
import auth from "../api/auth.js";
import cases from "../api/cases.js";

process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
process.env.AUTH_RATE_LIMIT_MAX = "1000";

function sameValue(left, right) {
  if (left instanceof ObjectId || right instanceof ObjectId) return String(left) === String(right);
  return left === right;
}

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([key, value]) => sameValue(doc[key], value));
}

class Cursor {
  constructor(docs) {
    this.docs = [...docs];
  }

  sort(spec) {
    const [[key, direction]] = Object.entries(spec);
    this.docs.sort((a, b) => {
      const av = a[key] instanceof Date ? a[key].getTime() : a[key];
      const bv = b[key] instanceof Date ? b[key].getTime() : b[key];
      return av > bv ? direction : av < bv ? -direction : 0;
    });
    return this;
  }

  skip(count) {
    this.docs = this.docs.slice(count);
    return this;
  }

  limit(count) {
    this.docs = this.docs.slice(0, count);
    return this;
  }

  async toArray() {
    return this.docs;
  }
}

class Collection {
  constructor(name, docs) {
    this.name = name;
    this.docs = docs;
  }

  async createIndexes() {}

  async findOne(filter) {
    return this.docs.find((doc) => matches(doc, filter)) || null;
  }

  async insertOne(doc) {
    if (this.name === "users" && this.docs.some((user) => user.email === doc.email)) {
      throw Object.assign(new Error("duplicate email"), { code: 11000 });
    }
    const insertedId = new ObjectId();
    this.docs.push({ ...doc, _id: insertedId });
    return { insertedId };
  }

  async updateOne(filter, update, options = {}) {
    const existing = this.docs.find((doc) => matches(doc, filter));
    if (existing) {
      if (update.$set) Object.assign(existing, update.$set);
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    }
    if (options.upsert) {
      const inserted = { ...filter, ...(update.$setOnInsert || {}), _id: new ObjectId() };
      this.docs.push(inserted);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: inserted._id };
    }
    return { matchedCount: 0, modifiedCount: 0 };
  }

  async deleteOne(filter) {
    const index = this.docs.findIndex((doc) => matches(doc, filter));
    if (index === -1) return { deletedCount: 0 };
    this.docs.splice(index, 1);
    return { deletedCount: 1 };
  }

  find(filter) {
    return new Cursor(this.docs.filter((doc) => matches(doc, filter)));
  }
}

class FakeDb {
  constructor() {
    this.data = {
      users: [],
      saved_cases: [],
      case_comments: [],
    };
  }

  collection(name) {
    if (!this.data[name]) this.data[name] = [];
    return new Collection(name, this.data[name]);
  }
}

function makeReq({ method = "GET", body, headers = {}, query = {} } = {}) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []);
  req.method = method;
  req.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  req.query = query;
  req.socket = { remoteAddress: "127.0.0.1" };
  return req;
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(body = "") {
      this.body = String(body);
      this.ended = true;
    },
  };
}

async function call(handler, options) {
  const req = makeReq(options);
  const res = makeRes();
  await handler(req, res);
  const json = res.headers["content-type"]?.includes("application/json")
    ? JSON.parse(res.body || "{}")
    : res.body;
  return { status: res.statusCode, body: json, headers: res.headers };
}

async function signupUser(email, password = "correct horse battery staple") {
  return call(auth, {
    method: "POST",
    query: { path: "signup" },
    body: { email, password, name: "Test User" },
  });
}

let db;

beforeEach(() => {
  db = new FakeDb();
  setTestDb(db);
});

test("signup, login, /auth/me, and protected route access", async () => {
  const created = await signupUser("USER@example.com");
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, "user@example.com");
  assert.ok(created.body.token);
  assert.equal(db.data.users[0].password, undefined);
  assert.match(db.data.users[0].passwordHash, /^\$2[aby]\$/);

  const duplicate = await signupUser("user@example.com");
  assert.equal(duplicate.status, 409);

  const badLogin = await call(auth, {
    method: "POST",
    query: { path: "login" },
    body: { email: "user@example.com", password: "wrong-password" },
  });
  assert.equal(badLogin.status, 401);
  assert.equal(badLogin.body.error, "invalid_credentials");

  const loggedIn = await call(auth, {
    method: "POST",
    query: { path: "login" },
    body: { email: "user@example.com", password: "correct horse battery staple" },
  });
  assert.equal(loggedIn.status, 200);

  const denied = await call(auth, { method: "GET", query: { path: "me" } });
  assert.equal(denied.status, 401);

  const profile = await call(auth, {
    method: "GET",
    query: { path: "me" },
    headers: { authorization: `Bearer ${loggedIn.body.token}` },
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.email, "user@example.com");
});

test("save, duplicate save prevention, unsave, and saved-case listing", async () => {
  const { body } = await signupUser("saves@example.com");
  const auth = { authorization: `Bearer ${body.token}` };
  const query = { path: "FTS/HPC/123/save" };

  const saved = await call(cases, { method: "POST", headers: auth, query });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { caseRef: "FTS/HPC/123", saved: true });

  const duplicate = await call(cases, { method: "POST", headers: auth, query });
  assert.equal(duplicate.status, 200);
  assert.equal(db.data.saved_cases.length, 1);

  const list = await call(cases, { method: "GET", headers: auth, query: { path: "saved" } });
  assert.equal(list.status, 200);
  assert.equal(list.body.savedCases.length, 1);
  assert.equal(list.body.savedCases[0].caseRef, "FTS/HPC/123");

  const unsaved = await call(cases, { method: "DELETE", headers: auth, query });
  assert.equal(unsaved.status, 200);
  assert.deepEqual(unsaved.body, { caseRef: "FTS/HPC/123", saved: false });
  assert.equal(db.data.saved_cases.length, 0);
});

test("private notes CRUD trims content and enforces ownership", async () => {
  const owner = await signupUser("owner@example.com");
  const other = await signupUser("other@example.com");
  const ownerAuth = { authorization: `Bearer ${owner.body.token}` };
  const otherAuth = { authorization: `Bearer ${other.body.token}` };
  const caseQuery = { path: "FTS/HPC/456/comments" };

  const created = await call(cases, {
    method: "POST",
    headers: ownerAuth,
    query: caseQuery,
    body: { content: "  Keep this exact text.  " },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.comment.content, "Keep this exact text.");
  assert.equal(created.body.comment.author.email, "owner@example.com");

  const unauthenticatedList = await call(cases, { method: "GET", query: caseQuery });
  assert.equal(unauthenticatedList.status, 401);

  const otherList = await call(cases, { method: "GET", headers: otherAuth, query: caseQuery });
  assert.equal(otherList.status, 200);
  assert.equal(otherList.body.comments.length, 0);

  const listed = await call(cases, { method: "GET", headers: ownerAuth, query: caseQuery });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.comments.length, 1);

  const commentQuery = { path: `${caseQuery.path}/${created.body.comment.id}` };
  const forbidden = await call(cases, {
    method: "PATCH",
    headers: otherAuth,
    query: commentQuery,
    body: { content: "Nope" },
  });
  assert.equal(forbidden.status, 404);

  const updated = await call(cases, {
    method: "PATCH",
    headers: ownerAuth,
    query: commentQuery,
    body: { content: " Updated content " },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.comment.content, "Updated content");

  const deleteForbidden = await call(cases, {
    method: "DELETE",
    headers: otherAuth,
    query: commentQuery,
  });
  assert.equal(deleteForbidden.status, 404);

  const deleted = await call(cases, {
    method: "DELETE",
    headers: ownerAuth,
    query: commentQuery,
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.equal(db.data.case_comments.length, 0);
});
