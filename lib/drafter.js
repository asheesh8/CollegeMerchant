// Write one personal email per place with Claude (needs ANTHROPIC_API_KEY).
import Anthropic from "@anthropic-ai/sdk";
import { UserError } from "./accounts.js";

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
    personal_detail_used: { type: "string" },
  },
  required: ["subject", "body", "personal_detail_used"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You write emails for a real college student who is asking a school or company whether they'd send some free merch. Each email goes to one recipient and should read like the student sat down and typed it to them personally.

Voice:
- A normal, friendly college student. Plain words, contractions, short sentences. Polite but relaxed, the way you'd write to someone you respect but don't know.
- Never sound like marketing, a cover letter, or AI. No "I hope this email finds you well", "I wanted to reach out", "I am writing to", "huge fan", "passionate", "thrilled", "delve", or similar stock phrases. No emojis, no em-dashes, no exclamation-mark pileups, no bullet points.
- Vary the structure and the opening line from email to email. Don't start every email the same way.

Content:
- 80 to 140 words in the body, two to four short paragraphs.
- Open with one specific, true detail about THIS recipient, taken from the website excerpt or the student's notes: a program, team, product, tradition, event, or something they actually do. Never invent facts, names, or numbers. If neither source has anything specific, keep the opener honest and general rather than making something up.
- Say briefly who the student is and why they genuinely like this place, using only facts from the sender profile and notes.
- Ask simply whether they'd be able to send a little merch, mentioning a couple of the items the student would love as examples, not a list. Say anything small would be appreciated.
- Seasonal touch (November through early January): add one short, natural line mentioning it's getting chilly up here in the Northeast, and wish them happy holidays near the end. Because of the cold, lean the ask toward warm stuff like a sweater or hoodie. Keep it to a single casual line, never cheesy.
- Include the mailing address from the profile exactly as written.
- Make it easy to say no, and thank them.
- End with the signature from the profile. Don't add a separate unsubscribe line; one is added automatically.
- If a contact name is given, greet them by first name. Otherwise use a natural greeting like "Hi there," or "Hello," and vary it.

Subject: under 8 words, specific to the recipient, sounds like a person wrote it (for example "Quick question from a Champlain student"), never clickbait.

personal_detail_used: in a few words, say which recipient-specific detail you used, so the student can fact-check it quickly. Say "none, general opener" if you didn't use one.`;

let client;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new UserError("ANTHROPIC_API_KEY isn't set. Add it in Vercel's Environment Variables, then redeploy.");
  }
  client ||= new Anthropic({ timeout: 90_000, maxRetries: 1 });
  return client;
}

// `recentOpeners` helps the model avoid repeating itself across emails.
export async function writeDraft(target, settings, recentOpeners = []) {
  const p = settings.sender_profile;
  if (!p.mailing_address.trim()) throw new UserError("Add your mailing address in Settings first, so they know where to send it.");
  const user = [
    `SENDER PROFILE:\n${JSON.stringify(p, null, 2)}`,
    `RECIPIENT: ${target.name} (${target.kind})`,
    `Website: ${target.website || "(none)"}`,
    `Contact name (may be blank): ${target.contact_name || ""}`,
    `Student's own notes about this recipient: ${target.notes || "(none)"}`,
    recentOpeners.length
      ? `Openings of the student's recent emails. Start this one differently:\n${recentOpeners.map((o) => `- ${o}`).join("\n")}`
      : "",
    `EXCERPT FROM THEIR PUBLIC WEBSITE:\n${target.page_text || "(nothing could be read)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let resp;
  try {
    resp = await anthropic().beta.messages.create({
      model: settings.model || "claude-opus-5-5",
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low", format: { type: "json_schema", schema: DRAFT_SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new UserError("The Claude API key was rejected. Check ANTHROPIC_API_KEY.");
    if (err instanceof Anthropic.RateLimitError) throw new UserError("Claude is rate limiting right now. Wait a minute and try again.");
    if (err instanceof Anthropic.APIConnectionError) throw new UserError("Couldn't reach Claude. Try again in a moment.");
    if (err instanceof Anthropic.APIError) throw new UserError(`Claude API error ${err.status ?? ""}: ${err.message}`.trim());
    throw err;
  }
  if (resp.stop_reason === "refusal") throw new UserError("Claude declined to write this one. Try editing the notes.");
  if (resp.stop_reason === "max_tokens") throw new UserError("The draft got cut off. Try again.");
  const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new UserError("Claude returned something unreadable. Try again.");
  }
  return {
    subject: d.subject.trim(),
    body: d.body.trim(),
    detail: d.personal_detail_used.trim(),
    at: new Date().toISOString(),
    model: resp.model,
  };
}
