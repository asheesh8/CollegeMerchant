import { handle, jsonBody } from "../../../../lib/http.js";
import { deleteTarget, getTarget, updateTarget } from "../../../../lib/portal.js";

export async function GET(req, { params }) {
  const { id } = await params;
  return handle(async () => ({ target: await getTarget(id) }));
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  return handle(async () => {
    const { page_text, ...t } = await updateTarget(id, await jsonBody(req));
    return { target: t };
  });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  return handle(async () => {
    await deleteTarget(id);
    return { ok: true };
  });
}
