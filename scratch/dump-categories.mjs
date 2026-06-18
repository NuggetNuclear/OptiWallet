import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT * FROM merchant_categories`;
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
