// Read a few public pages of this place's site and pick the best contact email.
import { handle } from "../../../../../lib/http.js";
import { findFor, publicTarget } from "../../../../../lib/portal.js";

export const maxDuration = 60;

export async function POST(req, { params }) {
  const { id } = await params;
  return handle(async () => {
    const r = await findFor(id);
    return { target: publicTarget(r.target), pages_read: r.pages_read };
  });
}
