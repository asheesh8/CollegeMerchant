"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../ui.js";

export default function Review() {
  const [targets, setTargets] = useState(null);
  const [footer, setFooter] = useState("");
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState("review");
  const [error, setError] = useState("");

  async function refresh(focusId) {
    try {
      const [t, s] = await Promise.all([api("/api/targets"), api("/api/settings")]);
      setTargets(t.targets);
      setFooter(s.settings.footer);
      const queue = t.targets.filter((x) => x.status === "drafted");
      const want = focusId || new URLSearchParams(window.location.search).get("id");
      if (want) setIdx(Math.max(0, queue.findIndex((x) => x.id === want)));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { refresh(); }, []);

  const queue = (targets || []).filter((t) => t.status === "drafted");
  const approved = (targets || []).filter((t) => t.status === "approved");
  const current = queue[Math.min(idx, Math.max(0, queue.length - 1))];
  const replace = (t) => setTargets((all) => all.map((x) => (x.id === t.id ? { ...x, ...t } : x)));

  return (
    <main className="wrap">
      <div className="top">
        <h1>Review</h1>
        <div className="actions">
          <button className={tab === "review" ? "primary" : ""} onClick={() => setTab("review")}>To review ({queue.length})</button>
          <button className={tab === "approved" ? "primary" : ""} onClick={() => setTab("approved")}>Approved ({approved.length})</button>
        </div>
      </div>
      {error && <div className="note bad" style={{ marginTop: 0, marginBottom: 20 }}>{error}</div>}
      {targets === null ? (
        <p className="muted">Loading…</p>
      ) : tab === "approved" ? (
        <ApprovedList list={approved} replace={replace} setError={setError} />
      ) : !current ? (
        <section className="panel">
          <h2>All caught up</h2>
          <p className="muted" style={{ margin: 0 }}>
            No drafts waiting. {approved.length ? <>You have {approved.length} approved. <Link href="/">Start sending</Link> from the dashboard.</> : <>Write some in <Link href="/places">Places</Link>.</>}
          </p>
        </section>
      ) : (
        <Draft
          key={current.id + (current.draft?.at || "")}
          t={current}
          footer={footer}
          position={`${Math.min(idx, queue.length - 1) + 1} of ${queue.length}`}
          onPrev={idx > 0 ? () => setIdx(idx - 1) : null}
          onNext={idx < queue.length - 1 ? () => setIdx(idx + 1) : null}
          replace={replace}
        />
      )}
    </main>
  );
}

function Draft({ t, footer, position, onPrev, onNext, replace }) {
  const [subject, setSubject] = useState(t.draft.subject);
  const [body, setBody] = useState(t.draft.body);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);
  const changed = subject !== t.draft.subject || body !== t.draft.body;
  const words = body.trim().split(/\s+/).filter(Boolean).length;

  async function run(kind) {
    setBusy(kind);
    setNote(null);
    try {
      if (kind === "rewrite") {
        const r = await api(`/api/targets/${t.id}/draft`, "POST", undefined, { timeoutMs: 130000 });
        replace(r.target);
        return;
      }
      const payload = changed ? { draft: { subject, body } } : {};
      if (kind === "approve") payload.status = "approved";
      if (kind === "skip") payload.status = "skipped";
      const r = await api(`/api/targets/${t.id}`, "PATCH", payload);
      replace(r.target);
      if (kind === "save") setNote({ ok: true, message: "Saved." });
    } catch (e) {
      setNote({ ok: false, message: e.message });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel">
      <div className="toolbar">
        <span className="muted small">{position}</span>
        <span className="spacer" />
        <button disabled={!onPrev} onClick={onPrev}>Previous</button>
        <button disabled={!onNext} onClick={onNext}>Next</button>
      </div>
      <h2>{t.name}</h2>
      <p className="small" style={{ marginTop: 0 }}>
        To <strong>{t.email}</strong>
        {t.website && <> · <a href={t.website} target="_blank" rel="noreferrer">website</a></>}
      </p>
      <div className="note info" style={{ marginTop: 0, marginBottom: 16 }}>
        <strong>Fact-check:</strong> {t.draft.detail || "no detail noted"}
        {t.notes && <><br />Your note: {t.notes}</>}
      </div>
      <div className="field">
        <label htmlFor="subj">Subject</label>
        <input id="subj" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="body">Email <span className="muted small">({words} words)</span></label>
        <textarea id="body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
        {footer && <div className="hint">Added at the bottom: "{footer}"</div>}
      </div>
      <div className="buttons">
        <button className="primary" disabled={Boolean(busy)} onClick={() => run("approve")}>{busy === "approve" ? "Approving…" : "Approve"}</button>
        {changed && <button disabled={Boolean(busy)} onClick={() => run("save")}>Save edits</button>}
        <button disabled={Boolean(busy)} onClick={() => run("rewrite")}>{busy === "rewrite" ? "Rewriting…" : "Rewrite"}</button>
        <button disabled={Boolean(busy)} onClick={() => run("skip")}>Skip this place</button>
      </div>
      {note && <div className={`note ${note.ok ? "ok" : "bad"}`}>{note.message}</div>}
    </section>
  );
}

function ApprovedList({ list, replace, setError }) {
  const [open, setOpen] = useState(null);
  if (!list.length) return <section className="panel"><p className="muted" style={{ margin: 0 }}>Nothing approved yet.</p></section>;
  async function back(t) {
    try {
      replace((await api(`/api/targets/${t.id}`, "PATCH", { status: "drafted" })).target);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="panel">
      <p className="muted small" style={{ marginTop: 0 }}>These go out in this order when you start sending.</p>
      <ul className="list">
        {list.map((t) => (
          <li key={t.id} className="row">
            <div className="who">
              <div className="email">{t.name}</div>
              <div className="muted small">{t.email} · {t.draft.subject}</div>
              {open === t.id && <div className="email-preview" style={{ marginTop: 8 }}>{t.draft.body}</div>}
            </div>
            <div className="actions">
              <button onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? "Hide" : "Read"}</button>
              <button onClick={() => back(t)}>Move back to review</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
