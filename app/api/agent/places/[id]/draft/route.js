// The scheduled task hands back a finished draft. It lands in Review; nothing is sent.
import { agentHandle } from "../../../../../../lib/agent-route.js";
import { jsonBody } from "../../../../../../lib/http.js";
import { getSettings, storeDraft } from "../../../../../../lib/portal.js";
import { UserError } from "../../../../../../lib/accounts.js";

export async function POST(req, { params }) {
  const { id } = await params;
  return agentHandle(req, async () => {
    const body = await jsonBody(req);
    if (!(await getSettings()).sender_profile.mailing_address.trim()) {
      throw new UserError("Add your mailing address in Settings first.");
    }
    const t = await storeDraft(id, body, "scheduled task");
    return { id: t.id, name: t.name, status: t.status };
  });
}
