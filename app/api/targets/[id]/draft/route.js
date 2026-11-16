// Write (or rewrite) the email for this place.
import { handle } from "../../../../../lib/http.js";
import { getSettings, getTarget, listTargets, saveTarget } from "../../../../../lib/portal.js";
import { writeDraft } from "../../../../../lib/drafter.js";
import { UserError } from "../../../../../lib/accounts.js";

export const maxDuration = 120;

export async function POST(req, { params }) {
  const { id } = await params;
  return handle(async () => {
    const [t, settings, all] = await Promise.all([getTarget(id), getSettings(), listTargets()]);
    if (!t.email) throw new UserError("Find or add an email for this place first.");
    if (["sent", "replied", "declined"].includes(t.status)) throw new UserError("This one has already been sent.");
    const recent = all
      .filter((x) => x.id !== id && x.draft?.body)
      .sort((a, b) => (a.draft.at < b.draft.at ? 1 : -1))
      .slice(0, 6)
      .map((x) => x.draft.body.split("\n").find((l) => l.trim() && !/^(hi|hello|hey|dear)\b/i.test(l.trim()))?.slice(0, 120))
      .filter(Boolean);
    t.draft = await writeDraft(t, settings, recent);
    t.status = "drafted";
    t.error = "";
    delete t.approved_at;
    const { page_text, ...rest } = await saveTarget(t);
    return { target: rest };
  });
}
