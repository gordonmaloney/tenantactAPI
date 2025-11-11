// api/_db.js
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DBNAME || "tenantact";

// Reuse the client across invocations (serverless-safe)
let client;
let clientPromise;

export function getMongoClient() {
  if (!uri) throw new Error("Missing MONGODB_URI env var");
  if (!clientPromise) {
    client = new MongoClient(uri, { maxPoolSize: 5 });
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb() {
  const cli = await getMongoClient();
  return cli.db(dbName);
}
