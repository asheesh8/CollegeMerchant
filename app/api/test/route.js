// Check SMTP settings: { ...fields, id?, send? }. With send: true, also emails the account itself.
import { handle, jsonBody } from "../../../lib/http.js";
import { testSettings } from "../../../lib/accounts.js";

export const maxDuration = 30;

export async function POST(req) {
  return handle(async () => {
    const body = await jsonBody(req);
    return { result: await testSettings(body, Boolean(body.send)) };
  });
}
