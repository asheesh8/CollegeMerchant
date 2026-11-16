// Send the next approved email (one per call). See lib/sender.js.
import { handle } from "../../../lib/http.js";
import { sendNext } from "../../../lib/sender.js";

export const maxDuration = 60;

export async function POST() {
  return handle(sendNext);
}
