import { getDb, getMongoClient } from "../api/_db.js";
import { ensureAuthIndexes } from "../api/_auth.js";
import { ensureCaseIndexes } from "../api/_cases.js";

async function main() {
  const db = await getDb();
  await ensureAuthIndexes(db);
  await ensureCaseIndexes(db);
  console.log("Auth and case indexes are ready.");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const client = await getMongoClient().catch(() => null);
    await client?.close();
  });
