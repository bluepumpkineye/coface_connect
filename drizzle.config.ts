import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Read from the environment instead of a hardcoded URL so the same command
// works against a local or a hosted database, and no password ever lives in
// a committed file. Put DATABASE_URL in .env (gitignored) or export it.
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "DATABASE_URL is required. Add it to .env in the project root, or export it before running drizzle-kit.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: { url },
});
