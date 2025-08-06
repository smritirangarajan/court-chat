import { DataAPIClient } from "@datastax/astra-db-ts";
import dotenv from "dotenv";
dotenv.config();

const YEAR_THRESHOLD = 1900;

function isBeforeThreshold(dateStr: string): boolean {
  const caseDate = new Date(dateStr);
  return !isNaN(caseDate.getTime()) && caseDate.getFullYear() < YEAR_THRESHOLD;
}

async function run() {
  const client = new DataAPIClient(process.env.ASTRA_DB_APPLICATION_TOKEN!);
  const db = client.db(process.env.ASTRA_DB_API_ENDPOINT!);
  const collection = db.collection("opinions");

  console.log(`🔎 Checking for documents before year ${YEAR_THRESHOLD}...`);

  const cursor = collection.find({}, { projection: { _id: 1, decision_date: 1 } });

  let deletedCount = 0;
  let checked = 0;

  for await (const doc of cursor) {
    checked++;

    if (doc.decision_date && isBeforeThreshold(doc.decision_date)) {
      await collection.deleteOne({ _id: doc._id });
      deletedCount++;
      console.log(`🗑️  Deleted ${doc._id} (decision_date: ${doc.decision_date})`);
    }

    if (checked % 500 === 0) {
      console.log(`🔄 Checked ${checked} documents...`);
    }
  }

  console.log(`✅ Done! Deleted ${deletedCount} old document(s) out of ${checked} checked.`);
}

run().catch((err) => {
  console.error("❌ Failed to delete old documents:", err);
  process.exit(1);
});
