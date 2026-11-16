import { handle } from "../../../../../lib/http.js";
import { setDefault } from "../../../../../lib/accounts.js";

export async function POST(req, { params }) {
  const { id } = await params;
  return handle(async () => {
    await setDefault(id);
    return { ok: true };
  });
}
