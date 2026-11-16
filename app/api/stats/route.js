import { handle } from "../../../lib/http.js";
import { stats } from "../../../lib/portal.js";
import { senderAccount } from "../../../lib/sender.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const [s, a] = await Promise.all([stats(), senderAccount()]);
    return {
      ...s,
      account: a ? { email: a.email, ok: a.last_test?.ok ?? null } : null,
      claude_ready: Boolean(process.env.ANTHROPIC_API_KEY),
    };
  });
}
