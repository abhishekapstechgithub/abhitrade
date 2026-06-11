import { MongoClient, Db } from 'mongodb';

const URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const DB  = process.env.MONGODB_DB  ?? 'abhitrade';

let client: MongoClient | null = null;
let cached: Db | null = null;

export async function getMongoDb(): Promise<Db> {
  if (cached) return cached;
  client = new MongoClient(URI, { connectTimeoutMS: 5000, serverSelectionTimeoutMS: 5000 });
  await client.connect();
  cached = client.db(DB);
  return cached;
}
