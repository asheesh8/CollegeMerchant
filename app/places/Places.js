"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, StatusPill } from "../ui.js";

const FILTERS = {
  all: ["All", () => true],
  email: ["Need an email", (t) => ["new", "no_email", "error"].includes(t.status)],
  draft: ["Ready to draft", (t) => t.status === "found"],
  review: ["To review", (t) => t.status === "drafted"],
  done: ["Approved or sent", (t) => ["approved", "sent", "replied", "declined"].includes(t.status)],
};

export default function Places() {
  const [targets, setTargets] = useState(null);
  const [claudeReady, setClaudeReady] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState({}); // id -> "find" | "draft"
  const [batch, setBatch] = useState(null); // { label, done, total }
  const stopRef = useRef(false);

  async function refresh() {
    try {
      const r = await api("/api/targets");
      setTargets(r.targets);
      setClaudeReady(r.claude_ready);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { refresh(); }, []);

  const replace = (t) => setTargets((all) => all.map((x) => (x.id === t.id ? { ...x, ...t } : x)));

  async function act(t, kind) {
    setBusy((b) => ({ ...b, [t.id]: kind }));
    setError("");
    try {
      const r = await api(`/api/targets/${t.id}/${kind}`, "POST", undefined, { timeoutMs: 130000 });
      replace(r.target);
      return true;
    } catch (e) {
      setError(`${t.name}: ${e.message}`);
      return false;
    } finally {
      setBusy((b) => {
        const { [t.id]: _, ...rest } = b;
        return rest;
      });
    }
  }

  async function runBatch(kind, list) {
    stopRef.current = false;
    const label = kind === "find" ? "Finding emails" : "Writing drafts";
    setBatch({ label, done: 0, total: list.length });
    for (let i = 0; i < list.length && !stopRef.current; i++) {
      await act(list[i], kind);
      setBatch({ label, done: i + 1, total: list.length });
    }
    setBatch(null);
  }

  async function patch(t, body) {
    try {
      replace((await api(`/api/targets/${t.id}`, "PATCH", body)).target);
      setError("");
    } catch (e) {
      setError(`${t.name}: ${e.message}`);
    }
  }

  async function remove(t) {
    if (!window.confirm(`Remove ${t.name}?`)) return;
    await api(`/api/targets/${t.id}`, "DELETE").catch((e) => setError(e.message));
    refresh();
  }

  const list = (targets || []).filter(FILTERS[filter][1]);
  const needFind = (targets || []).filter((t) => t.status === "new" && t.website);
  const needDraft = (targets || []).filter((t) => t.status === "found");

  return (
    <main className="wrap wide">
      <div className="top"><h1>Places</h1></div>
      <AddPlaces onAdded={refresh} />

      <section className="panel">
        <div className="toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto" }}>
            {Object.entries(FILTERS).map(([k, [label, fn]]) => (
              <option key={k} value={k}>{label} ({(targets || []).filter(fn).length})</option>
            ))}
          </select>
          <span className="spacer" />
          {batch ? (
            <>
              <span className="muted small">{batch.label}: {batch.done} of {batch.total}…</span>
              <button onClick={() => { stopRef.current = true; }}>Stop</button>
            </>
          ) : (
            <>
              <button disabled={!needFind.length} onClick={() => runBatch("find", needFind)}>Find emails ({needFind.length})</button>
              {claudeReady && (
                <button className="primary" disabled={!needDraft.length} onClick={() => runBatch("draft", needDraft)}>Write drafts ({needDraft.length})</button>
              )}
            </>
          )}
        </div>
        {error && <div className="note bad" style={{ marginTop: 0, marginBottom: 14 }}>{error}</div>}
        {targets === null ? (
          <p className="muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{targets.length ? "Nothing in this view." : "No places yet. Add some above."}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Place</th><th>Email</th><th>Status</th><th style={{ width: 1 }}></th></tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <Row key={t.id} t={t} busy={busy[t.id]} act={act} patch={patch} remove={remove} claudeReady={claudeReady} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Finding an email reads up to six public pages of the site (contact, admissions, alumni and so on), follows the
          site's robots.txt, and pauses between pages. Big companies rarely list one, so type in a contact you found yourself.
          {!claudeReady && <> Drafts are written by your daily Claude task, which also looks up emails for new places, so you can just add places and check Review the next day.</>}
        </p>
      </section>
    </main>
  );
}

function Row({ t, busy, act, patch, remove, claudeReady }) {
  const [email, setEmail] = useState(t.email || "");
  useEffect(() => setEmail(t.email || ""), [t.email]);
  const locked = ["sent", "replied", "declined"].includes(t.status);
  return (
    <tr>
      <td>
        <div className="name">{t.name} <span className="muted small">· {t.kind}</span></div>
        {t.website && <a className="small" href={t.website} target="_blank" rel="noreferrer">{t.website.replace(/^https?:\/\//, "")}</a>}
        {t.notes && <div className="muted small">{t.notes}</div>}
      </td>
      <td style={{ minWidth: 220 }}>
        {locked ? (
          <span>{t.email}</span>
        ) : (
          <>
            <input className="inline-input" type="email" placeholder="Type an email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => email.trim().toLowerCase() !== (t.email || "") && patch(t, { email })} />
            {t.other_emails?.length > 0 && (
              <div className="muted small">
                Also found:{" "}
                {t.other_emails.slice(0, 4).map((e, i) => (
                  <span key={e}>
                    {i > 0 && ", "}
                    <button type="button" className="link small" onClick={() => { setEmail(e); patch(t, { email: e }); }}>{e}</button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </td>
      <td>
        <StatusPill status={busy === "find" ? "finding" : t.status} />
        {busy === "draft" && <div className="muted small">Writing…</div>}
        {t.error && <div className="small status-bad">{t.error}</div>}
      </td>
      <td>
        <div className="actions" style={{ flexWrap: "nowrap" }}>
          {!locked && t.website && <button disabled={Boolean(busy)} onClick={() => act(t, "find")}>Find</button>}
          {claudeReady && !locked && t.email && (
            <button disabled={Boolean(busy)} onClick={() => act(t, "draft")}>{t.draft ? "Rewrite" : "Draft"}</button>
          )}
          {t.status === "drafted" && <Link href={`/review?id=${t.id}`}><button>Review</button></Link>}
          {!locked && t.status !== "skipped" && <button disabled={Boolean(busy)} onClick={() => patch(t, { status: "skipped" })}>Skip</button>}
          <button className="danger" disabled={Boolean(busy)} onClick={() => remove(t)}>Remove</button>
        </div>
      </td>
    </tr>
  );
}

function AddPlaces({ onAdded }) {
  const [mode, setMode] = useState("one");
  const [f, setF] = useState({ name: "", website: "", kind: "school", notes: "", email: "" });
  const [bulk, setBulk] = useState("");
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((o) => ({ ...o, [k]: e.target.value }));

  function parseBulk() {
    // One per line: name, website, notes  (website and notes optional)
    return bulk.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const [name, website = "", ...rest] = line.split(",").map((x) => x.trim());
      const notes = rest.join(", ");
      const kind = /universit|college|school|institute/i.test(name) ? "school" : "company";
      return { name, website, notes, kind };
    });
  }

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const items = mode === "one" ? [f] : parseBulk();
      const r = await api("/api/targets", "POST", { items });
      setNote({ ok: true, message: `Added ${r.added}.${r.skipped.length ? ` Skipped ${r.skipped.length} already on the list.` : ""}` });
      if (mode === "one") setF({ name: "", website: "", kind: f.kind, notes: "", email: "" });
      else setBulk("");
      onAdded();
    } catch (err) {
      setNote({ ok: false, message: err.message });
    }
    setBusy(false);
  }

  return (
    <form className="panel" onSubmit={add}>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Add places</h2>
        <span className="spacer" />
        <button type="button" className="link small" onClick={() => setMode(mode === "one" ? "bulk" : "one")}>
          {mode === "one" ? "Paste a list instead" : "Add one at a time"}
        </button>
      </div>
      {mode === "one" ? (
        <>
          <div className="grid grid3a">
            <div className="field"><label htmlFor="n">Name</label><input id="n" type="text" placeholder="Carnegie Mellon University" value={f.name} onChange={set("name")} /></div>
            <div className="field"><label htmlFor="w">Website</label><input id="w" type="text" placeholder="cmu.edu" value={f.website} onChange={set("website")} /></div>
            <div className="field"><label htmlFor="k">Type</label>
              <select id="k" value={f.kind} onChange={set("kind")}><option value="school">School</option><option value="company">Company</option></select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="no">Why you like them <span className="muted">(this makes the email personal)</span></label>
            <input id="no" type="text" placeholder="Looking at their MS in Information Security" value={f.notes} onChange={set("notes")} />
          </div>
          <div className="field">
            <label htmlFor="e">Contact email <span className="muted">(optional, leave blank to look for one)</span></label>
            <input id="e" type="email" placeholder="admissions@example.edu" value={f.email} onChange={set("email")} />
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="b">One place per line: name, website, why you like them</label>
          <textarea id="b" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)}
            placeholder={"Northeastern University, northeastern.edu, considering their cybersecurity master's\nNVIDIA, nvidia.com, I use CUDA in my coursework"} />
        </div>
      )}
      <button className="primary" disabled={busy || (mode === "one" ? !f.name.trim() : !bulk.trim())}>{busy ? "Adding…" : "Add"}</button>
      {note && <div className={`note ${note.ok ? "ok" : "bad"}`}>{note.message}</div>}
    </form>
  );
}
