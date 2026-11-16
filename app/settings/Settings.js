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
          <div className="field">
            <label htmlFor="model">Claude model</label>
            <input id="model" type="text" value={s.model} onChange={set("model")} />
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
    </main>
  );
}
