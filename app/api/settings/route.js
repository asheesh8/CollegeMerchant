import { handle, jsonBody } from "../../../lib/http.js";
import { getSettings, optouts, saveSettings, setOptouts } from "../../../lib/portal.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ settings: await getSettings(), optouts: await optouts() }));
}

export async function PUT(req) {
  return handle(async () => {
    const body = await jsonBody(req);
    const settings = await saveSettings(body.settings || {});
    const list = body.optouts !== undefined ? await setOptouts(body.optouts) : await optouts();
    return { settings, optouts: list };
  });
}
