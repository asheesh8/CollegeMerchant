import { handle, jsonBody } from "../../../lib/http.js";
import { listAccounts, upsertAccount } from "../../../lib/accounts.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ accounts: await listAccounts() }));
}

export async function POST(req) {
  return handle(async () => ({ account: await upsertAccount(await jsonBody(req)) }));
}
