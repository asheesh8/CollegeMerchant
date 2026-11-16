// Signed-in only (middleware): make, check or remove the scheduled task's token.
import { handle } from "../../../lib/http.js";
import { agentTokenInfo, newAgentToken, revokeAgentToken } from "../../../lib/agent.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(agentTokenInfo);
}

// Shown once. Making a new one replaces the old one.
export async function POST(req) {
  return handle(async () => {
    if (!(req.headers.get("content-type") || "").includes("application/json")) throw new SyntaxError("Expected JSON.");
    return { token: await newAgentToken(), ...(await agentTokenInfo()) };
  });
}

export async function DELETE() {
  return handle(async () => {
    await revokeAgentToken();
    return agentTokenInfo();
  });
}
