"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, when, sleep } from "./ui.js";

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [nextAt, setNextAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const stopRef = useRef(false);

  async function refresh() {
    try {
      const [st, t] = await Promise.all([api("/api/stats"), api("/api/targets")]);
      setS(st);
      setRecent(
        t.targets
          .filter((x) => x.sent)
          .sort((a, b) => (a.sent.at < b.sent.at ? 1 : -1))
          .slice(0, 8),
      );
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Sends one email, waits the random gap, repeats. Stops on cap, empty queue, error or Stop.
  async function start() {
    stopRef.current = false;
    setRunning(true);
    setStatus("Starting…");
    try {
      while (!stopRef.current) {
        setNextAt(null);
        setStatus("Sending the next email…");
        const r = await api("/api/send", "POST");
        if (r.sent) {
          setStatus(`Sent to ${r.sent.name} (${r.sent.email}).`);
          await refresh();
          if (r.sent_today >= r.cap) {
            setStatus(`Done for today: ${r.sent_today} of ${r.cap} sent.`);
            break;
          }
          await waitFor(r.next_in_ms);
        } else if (r.wait_ms) {
          await waitFor(r.wait_ms + 1000);
        } else {
          setStatus(r.message);
          break;
        }
      }
      if (stopRef.current) setStatus("Stopped.");
    } catch (e) {
      setStatus(e.message);
    }
    setNextAt(null);
    setRunning(false);
    refresh();
  }

  async function waitFor(ms) {
    const until = Date.now() + ms;
    setNextAt(until);
    while (!stopRef.current && Date.now() < until) await sleep(500);
  }

  const by = s?.by_status || {};
  const toReview = by.drafted || 0;
  const approved = by.approved || 0;
  const needEmail = (by.new || 0) + (by.no_email || 0);
  const needDraft = by.found || 0;
  const sentTotal = (by.sent || 0) + (by.replied || 0) + (by.declined || 0);
  const secs = nextAt ? Math.max(0, Math.round((nextAt - now) / 1000)) : 0;

  return (
    <main className="wrap wide">
      <div className="top"><h1>Dashboard</h1></div>
      {error && <div className="note bad" style={{ marginTop: 0, marginBottom: 20 }}>{error}</div>}

      {s && <Checklist s={s} />}

      <div className="stats">
        <div className="stat">
          <div className="num">{s ? `${s.sent_today} / ${s.daily_cap}` : "–"}</div>
          <div className="lbl">Sent today</div>
          <div className="bar"><span style={{ width: s ? `${Math.min(100, (s.sent_today / s.daily_cap) * 100)}%` : 0 }} /></div>
        </div>
        <Link className="stat" href="/review"><div className="num">{approved}</div><div className="lbl">Approved, waiting to send</div></Link>
        <Link className="stat" href="/review"><div className="num">{toReview}</div><div className="lbl">Ready for you to review</div></Link>
        <Link className="stat" href="/places"><div className="num">{needEmail + needDraft}</div><div className="lbl">Places still being prepared</div></Link>
        <Link className="stat" href="/sent"><div className="num">{sentTotal}</div><div className="lbl">Sent in total · {by.replied || 0} replied</div></Link>
      </div>

      <div className="two">
        <section className="panel">
          <h2>Sending</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            {s?.account ? <>From <strong>{s.account.email}</strong>. </> : "No email account yet. "}
            Emails go out one at a time, a few minutes apart, up to {s?.daily_cap ?? 20} a day. Keep this tab open while it runs.
          </p>
          <div className="buttons" style={{ marginTop: 0 }}>
            {running ? (
              <button onClick={() => { stopRef.current = true; }}>Stop</button>
            ) : (
              <button className="primary" disabled={!s?.account || !approved} onClick={start}>
                Start sending{approved ? ` (${Math.min(approved, Math.max(0, (s?.daily_cap ?? 0) - (s?.sent_today ?? 0)))} today)` : ""}
              </button>
            )}
          </div>
          {(status || nextAt) && (
            <div className="note info">
              {status}
              {nextAt && !stopRef.current && <> Next email in {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}.</>}
            </div>
          )}
          {!approved && !running && (
            <p className="muted small" style={{ marginBottom: 0 }}>Nothing is approved yet. <Link href="/review">Review your drafts</Link> first.</p>
          )}
        </section>

        <section className="panel">
          <h2>Recently sent</h2>
          {recent.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>Nothing sent yet.</p>
          ) : (
            <ul className="log">
              {recent.map((t) => (
                <li key={t.id}>
                  <span className="t">{when(t.sent.at, { hour: "numeric", minute: "2-digit" })}</span>
                  <span><strong>{t.name}</strong> <span className="muted">· {t.draft?.subject}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

// Setup steps that still need doing, so it's obvious what's next.
function Checklist({ s }) {
  const items = [
    [s.account, <>Connect an email account in <Link href="/accounts">Accounts</Link>.</>],
    [s.profile_ready, <>Add your mailing address in <Link href="/settings">Settings</Link>.</>],
    [s.claude_ready || s.task_connected, <>Connect the daily drafting task in <Link href="/settings">Settings</Link>.</>],
    [s.total > 0, <>Add schools and companies in <Link href="/places">Places</Link>.</>],
  ].filter(([ok]) => !ok);
  if (!items.length) return null;
  return (
    <section className="panel">
      <h2>Before you start</h2>
      <ol className="steps">{items.map(([, text], i) => <li key={i}>{text}</li>)}</ol>
    </section>
  );
}
