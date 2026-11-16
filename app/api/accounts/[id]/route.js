import { handle, jsonBody } from "../../../../lib/http.js";
import { deleteAccount, upsertAccount } from "../../../../lib/accounts.js";

export async function PATCH(req, { params }) {
  const { id } = await params;
  return handle(async () => ({ account: await upsertAccount(await jsonBody(req), id) }));
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  return handle(async () => {
    await deleteAccount(id);
    return { ok: true };
  });
}
