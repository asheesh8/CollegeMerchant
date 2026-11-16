import { handle, jsonBody } from "../../../lib/http.js";
import { addTargets, listTargets } from "../../../lib/portal.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ targets: await listTargets() }));
}

// { items: [{ name, website, kind, notes, email, contact_name }] }
export async function POST(req) {
  return handle(async () => addTargets((await jsonBody(req)).items));
}
