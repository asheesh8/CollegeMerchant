"use client";
import { useEffect, useState } from "react";
import { api, when, StatusPill } from "../ui.js";

export default function Sent() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const t = (await api("/api/targets")).targets.filter((x) => x.sent);
      t.sort((a, b) => (a.sent.at < b.sent.at ? 1 : -1));
      setList(t);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function mark(t, status) {
    try {
      const r = await api(`/api/targets/${t.id}`, "PATCH", { status });
      setList((all) => all.map((x) => (x.id === t.id ? { ...x, ...r.target } : x)));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <main className="wrap wide">
      <div className="top"><h1>Sent</h1></div>
      {error && <div className="note bad" style={{ marginTop: 0, marginBottom: 20 }}>{error}</div>}
      <section className="panel">
        {list === null ? (
          <p className="muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nothing sent yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Place</th><th>Subject</th><th>Status</th><th style={{ width: 1 }}></th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{when(t.sent.at)}</td>
                    <td><div className="name">{t.name}</div><div className="muted small">{t.email}</div></td>
                    <td>
                      <button className="link" onClick={() => setOpen(open === t.id ? null : t.id)}>{t.draft?.subject}</button>
                      {open === t.id && <div className="email-preview" style={{ marginTop: 8 }}>{t.draft?.body}</div>}
                      <div className="muted small">from {t.sent.from}</div>
                    </td>
                    <td><StatusPill status={t.status} /></td>
                    <td>
                      <div className="actions" style={{ flexWrap: "nowrap" }}>
                        {t.status !== "replied" && <button onClick={() => mark(t, "replied")}>They replied</button>}
                        {t.status !== "declined" && <button onClick={() => mark(t, "declined")}>Said no</button>}
                        {t.status !== "sent" && <button className="link small" onClick={() => mark(t, "sent")}>Undo</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Replies land in your normal inbox. Mark them here to keep track. "Said no" adds the address to your opt-out list so it's never emailed again.
        </p>
      </section>
    </main>
  );
}
