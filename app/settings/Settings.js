"use client";
import { useEffect, useState } from "react";
import { api } from "../ui.js";

const PROFILE_FIELDS = [
  ["name", "Your name", "input"],
  ["about", "About you", "area", "School, major, year, what you're applying to. Only true things: the emails use this."],
  ["why_i_collect", "Why you collect merch", "area"],
  ["items_i_would_love", "Items you'd love", "input", "Mentioned as examples, like \"socks, a hoodie, or a mug\"."],
  ["mailing_address", "Mailing address", "area", "Where they should send it. It's included in every email."],
  ["signature", "Signature", "area"],
];

export default function Settings() {
  const [s, setS] = useState(null);
  const [optouts, setOptouts] = useState("");
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/settings")
      .then((r) => { setS(r.settings); setOptouts(r.optouts.join("\n")); })
      .catch((e) => setNote({ ok: false, message: e.message }));
  }, []);

  const setP = (k) => (e) => setS((o) => ({ ...o, sender_profile: { ...o.sender_profile, [k]: e.target.value } }));
  const set = (k) => (e) => setS((o) => ({ ...o, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const r = await api("/api/settings", "PUT", { settings: s, optouts });
      setS(r.settings);
      setOptouts(r.optouts.join("\n"));
      setNote({ ok: true, message: "Saved." });
    } catch (err) {
      setNote({ ok: false, message: err.message });
    }
    setBusy(false);
  }

  if (!s) return <main className="wrap"><div className="top"><h1>Settings</h1></div>{note ? <div className="note bad">{note.message}</div> : <p className="muted">Loading…</p>}</main>;

  return (
    <main className="wrap">
      <div className="top"><h1>Settings</h1></div>
      <form onSubmit={save}>
        <section className="panel">
          <h2>About you</h2>
          <p className="muted small" style={{ marginTop: 0 }}>Every email is written from this, so keep it true and specific.</p>
          {PROFILE_FIELDS.map(([k, label, type, hint]) => (
            <div className="field" key={k}>
              <label htmlFor={k}>{label}</label>
              {type === "area" ? (
                <textarea id={k} rows={k === "about" ? 3 : 2} value={s.sender_profile[k]} onChange={setP(k)} />
              ) : (
                <input id={k} type="text" value={s.sender_profile[k]} onChange={setP(k)} />
              )}
              {hint && <div className="hint">{hint}</div>}
            </div>
          ))}
        </section>

        <section className="panel">
          <h2>Sending</h2>
          <div className="grid grid3">
            <div className="field"><label htmlFor="cap">Emails per day</label><input id="cap" type="number" min="1" max="200" value={s.daily_cap} onChange={set("daily_cap")} /></div>
            <div className="field"><label htmlFor="gmin">Shortest gap (seconds)</label><input id="gmin" type="number" min="30" value={s.gap_min_sec} onChange={set("gap_min_sec")} /></div>
            <div className="field"><label htmlFor="gmax">Longest gap (seconds)</label><input id="gmax" type="number" min="30" value={s.gap_max_sec} onChange={set("gap_max_sec")} /></div>
          </div>
          <p className="hint" style={{ marginTop: -6 }}>Each email waits a random time between those two. Start low and only raise the daily number once replies come in and nothing bounces.</p>
          <div className="field">
            <label htmlFor="tz">Time zone for "today"</label>
            <input id="tz" type="text" value={s.timezone} onChange={set("timezone")} />
          </div>
          <div className="field">
            <label htmlFor="footer">Line added to the end of every email</label>
            <textarea id="footer" rows={2} value={s.footer} onChange={set("footer")} />
          </div>
        </section>

        <section className="panel">
          <h2>Never email</h2>
          <div className="field">
            <label htmlFor="opt">Opt-out list, one address per line</label>
            <textarea id="opt" rows={4} value={optouts} onChange={(e) => setOptouts(e.target.value)} placeholder="someone@example.edu" />
            <div className="hint">Anyone who says no goes here, automatically if you mark them "Said no" on the Sent page.</div>
          </div>
        </section>

        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        {note && <div className={`note ${note.ok ? "ok" : "bad"}`}>{note.message}</div>}
      </form>
      <TaskToken />
    </main>
  );
}

// The daily Claude task (on your Claude subscription) uses this token to pick up places and drop off drafts.
function TaskToken() {
  const [info, setInfo] = useState(null);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api("/api/agent-token").then(setInfo).catch((e) => setErr(e.message)); }, []);

  async function make() {
    if (info?.connected && !window.confirm("Make a new token? The old one stops working, so you'll need to update it in Claude too.")) return;
    try {
      const r = await api("/api/agent-token", "POST", {});
      setToken(r.token);
      setInfo(r);
    } catch (e) { setErr(e.message); }
  }
  async function revoke() {
    if (!window.confirm("Disconnect the daily task? It won't be able to add drafts until you make a new token.")) return;
    try { setInfo(await api("/api/agent-token", "DELETE")); setToken(""); } catch (e) { setErr(e.message); }
  }

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <h2>Daily drafting task</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        A scheduled Claude task looks up emails for new places and writes the drafts every day, on your Claude
        subscription, so this site doesn't need an API key. It can only add drafts for you to review. It can't send.
      </p>
      <p className="small">
        Status: {info === null ? "checking…" : info.connected ? <strong>connected</strong> : "not connected"}
        {info?.created_at && <span className="muted"> · token made {new Date(info.created_at).toLocaleDateString()}</span>}
      </p>
      {token && (
        <div className="note info">
          Copy this now, it won't be shown again. Paste it into your Claude project's cloud environment as the variable
          {" "}<code>CM_AGENT_TOKEN</code>.
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input type="text" readOnly value={token} onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => navigator.clipboard.writeText(token).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      )}
      <div className="buttons">
        <button type="button" className={info?.connected ? "" : "primary"} onClick={make}>{info?.connected ? "Make a new token" : "Make a token"}</button>
        {info?.connected && <button type="button" className="danger" onClick={revoke}>Disconnect</button>}
      </div>
      {err && <div className="note bad">{err}</div>}
    </section>
  );
}
