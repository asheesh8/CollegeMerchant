// What the scheduled drafting task should work on next.
import { agentHandle } from "../../../../lib/agent-route.js";
import { getSettings, listTargets, recentOpeners, sentToday } from "../../../../lib/portal.js";

export const dynamic = "force-dynamic";

export async function GET(req) {
  return agentHandle(req, async () => {
    const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 20));
    const [all, settings] = await Promise.all([listTargets({ full: true }), getSettings()]);
    const waiting = all.filter((t) => ["drafted", "approved"].includes(t.status)).length;
    const pick = ({ id, name, website, kind, notes, contact_name, email, status }) => ({ id, name, website, kind, notes, contact_name, email, status });
    return {
      sender_profile: settings.sender_profile,
      footer_added_automatically: settings.footer,
      daily_cap: settings.daily_cap,
      sent_today: await sentToday(settings),
      drafts_waiting: waiting,
      recent_openers: recentOpeners(all),
      need_email: all.filter((t) => t.status === "new" && t.website).slice(0, limit).map(pick),
      need_draft: all
        .filter((t) => t.status === "found" && t.email)
        .slice(0, limit)
        .map((t) => ({ ...pick(t), website_excerpt: t.page_text || "" })),
    };
  });
}
