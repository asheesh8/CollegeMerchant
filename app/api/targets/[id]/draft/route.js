// Write (or rewrite) the email for this place with Claude. Only used when ANTHROPIC_API_KEY is set;
// otherwise drafts come from the scheduled task through /api/agent.
import { handle } from "../../../../../lib/http.js";
import { getSettings, getTarget, listTargets, publicTarget, recentOpeners, storeDraft } from "../../../../../lib/portal.js";
import { writeDraft } from "../../../../../lib/drafter.js";
import { UserError } from "../../../../../lib/accounts.js";

export const maxDuration = 120;

export async function POST(req, { params }) {
  const { id } = await params;
  return handle(async () => {
    const [t, settings, all] = await Promise.all([getTarget(id), getSettings(), listTargets()]);
    if (!t.email) throw new UserError("Find or add an email for this place first.");
    if (["sent", "replied", "declined"].includes(t.status)) throw new UserError("This one has already been sent.");
    const d = await writeDraft(t, settings, recentOpeners(all, id));
    return { target: publicTarget(await storeDraft(id, d, "site")) };
  });
}
