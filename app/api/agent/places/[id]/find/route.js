// The scheduled task asks the site to look for a contact email (the site does the reading).
import { agentHandle } from "../../../../../../lib/agent-route.js";
import { findFor } from "../../../../../../lib/portal.js";

export const maxDuration = 60;

export async function POST(req, { params }) {
  const { id } = await params;
  return agentHandle(req, async () => {
    const { target: t, pages_read } = await findFor(id);
    return {
      id: t.id, name: t.name, status: t.status, email: t.email, other_emails: t.other_emails,
      error: t.error, pages_read, website_excerpt: t.page_text || "",
    };
  });
}
