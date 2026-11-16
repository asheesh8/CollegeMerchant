// Read a few public pages of this place's site and pick the best contact email.
import { handle } from "../../../../../lib/http.js";
import { getTarget, saveTarget } from "../../../../../lib/portal.js";
import { findContact } from "../../../../../lib/finder.js";
import { UserError } from "../../../../../lib/accounts.js";

export const maxDuration = 60;

export async function POST(req, { params }) {
  const { id } = await params;
  return handle(async () => {
    const t = await getTarget(id);
    if (!t.website) throw new UserError("Add a website for this place, or type its email yourself.");
    if (["sent", "replied", "declined"].includes(t.status)) throw new UserError("This one has already been sent.");
    const r = await findContact(t.website);
    t.page_text = r.page_text;
    t.other_emails = r.other_emails;
    t.found_at = new Date().toISOString();
    if (!t.email) t.email = r.email;
    t.error = r.pages_read ? "" : r.blocked ? "The site's robots.txt asks bots not to read these pages." : "Couldn't read the site.";
    if (["new", "no_email", "found", "error"].includes(t.status)) t.status = t.email ? "found" : "no_email";
    const { page_text, ...rest } = await saveTarget(t);
    return { target: { ...rest, has_page_text: Boolean(page_text) }, pages_read: r.pages_read };
  });
}
