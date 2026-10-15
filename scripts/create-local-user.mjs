// Creates the owner account on the LOCAL Supabase stack (npx supabase start) for development.
// Never point this at the hosted project: there you create your own account in the dashboard.
import { execSync } from "node:child_process";

const LOCAL_EMAIL = "owner@daily-tracker.test";
const LOCAL_PASSWORD = "local-dev-only-7f3k";

const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);

if (!env.API_URL?.startsWith("http://127.0.0.1")) {
  throw new Error(`Refusing to run against ${env.API_URL}: this script is for the local stack only.`);
}

const res = await fetch(`${env.API_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: env.SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ email: LOCAL_EMAIL, password: LOCAL_PASSWORD, email_confirm: true }),
});
const body = await res.json();
console.log(res.status, res.ok ? `created ${body.email} (${body.id})` : body);
