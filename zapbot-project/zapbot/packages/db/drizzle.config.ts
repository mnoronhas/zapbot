import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Tell drizzle-kit to exclude Supabase-managed roles from diff
  entities: {
    roles: {
      provider: "supabase",
    },
  },
});
