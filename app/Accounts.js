"use client";
import { useEffect, useState } from "react";
import { PROVIDERS, detectProvider, EMAIL_RE } from "../lib/providers.js";

async function api(path, method = "GET", body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(50000),
    });
  } catch (e) {
    if (e.name === "TimeoutError") throw new Error("This is taking too long, so it was stopped. Try again in a minute.");
    throw new Error("Couldn't reach the site. Check your internet connection.");
  }
  if (res.status === 401) {
    window.location.href = "/login";
    return {};
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 504) throw new Error("The mail server didn't answer in time. Check the server name and port.");
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function when(iso) {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}

export default function Accounts({ storage }) {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null, "new", or an account
  const [checking, setChecking] = useState(null); // id of an account being tested after save

  async function refresh() {
    try {
      setAccounts((await api("/api/accounts")).accounts);
      setError("");
    } catch (e) {
      setError(e.message);
      setAccounts([]);
    }
  }
  useEffect(() => { refresh(); }, []);

  // After saving, sign in once in the background so the list shows whether the account works.
  async function saved(id) {
    setEditing(null);
    await refresh();
    setChecking(id);
    try { await api("/api/test", "POST", { id }); } catch {}
    setChecking(null);
    refresh();
  }

  async function remove(a) {
    if (!window.confirm(`Remove ${a.email}? Its saved password will be deleted.`)) return;
    try {
      await api(`/api/accounts/${a.id}`, "DELETE");
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function makeDefault(a) {
    try {
      await api(`/api/accounts/${a.id}/default`, "POST");
      refresh();
    } catch (e) { setError(e.message); }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="wrap">
      <div className="top">
        <h1>Email accounts</h1>
        <button className="link" onClick={logout}>Sign out</button>
      </div>

      {storage === "missing" && (
        <div className="note bad" style={{ marginTop: 0, marginBottom: 20 }}>
          No database is connected, so nothing can be saved yet. In Vercel, open this project's Storage tab,
          add an Upstash Redis database, then redeploy.
        </div>
      )}
      {error && <div className="note bad" style={{ marginTop: 0, marginBottom: 20 }}>{error}</div>}

      {editing ? (
        <AccountForm
          account={editing === "new" ? null : editing}
          onDone={saved}
          onCancel={() => { setEditing(null); refresh(); }}
        />
      ) : (
        <>
          <section className="panel">
            {accounts === null ? (
              <p className="muted" style={{ margin: 0 }}>Loading…</p>
            ) : accounts.length === 0 ? (
              <>
                <h2>No accounts yet</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Add the email you want the merch requests to come from. You can add as many as you like.
                </p>
              </>
            ) : (
              <ul className="list">
                {accounts.map((a) => (
                  <li key={a.id} className="row">
                    <div className="who">
                      <div className="email">
                        {a.email}
                        {a.is_default && <span className="tag default">Default</span>}
                      </div>
                      <div className="muted small">
                        {PROVIDERS[a.provider]?.label || a.provider} · {a.host}:{a.port}
                        {a.display_name ? ` · sends as "${a.display_name}"` : ""}
                      </div>
                      <div className="small">
                        {checking === a.id ? (
                          <span className="muted">Checking sign-in…</span>
                        ) : a.last_test ? (
                          <span className={a.last_test.ok ? "status-ok" : "status-bad"}>
                            {a.last_test.ok ? "Working" : `Not working: ${a.last_test.message}`} · {when(a.last_test.at)}
                          </span>
                        ) : (
                          <span className="muted">Not tested yet</span>
                        )}
                      </div>
                    </div>
                    <div className="actions">
                      {!a.is_default && <button onClick={() => makeDefault(a)}>Make default</button>}
                      <button onClick={() => setEditing(a)}>Edit</button>
                      <button className="danger" onClick={() => remove(a)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <button className="primary" onClick={() => setEditing("new")}>Add an email account</button>
          <p className="muted small" style={{ marginTop: 24 }}>
            Passwords are encrypted before they're saved and are never shown again here.
            The emailer sends from the default account unless you pick one with{" "}
            <code>python merch.py send --account you@example.com</code>.
          </p>
        </>
      )}
    </main>
  );
}

function AccountForm({ account, onDone, onCancel }) {
  const editing = Boolean(account);
  const [f, setF] = useState(() =>
    account
      ? { ...account, password: "" }
      : { email: "", display_name: "", provider: "gmail", host: "smtp.gmail.com", port: 587, secure: false, username: "", password: "" },
  );
  const [touchedProvider, setTouchedProvider] = useState(editing);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);

  const emailOk = EMAIL_RE.test(f.email.trim());
  const preset = PROVIDERS[f.provider] || PROVIDERS.custom;
  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setF((old) => ({ ...old, [k]: v }));
  };

  function applyProvider(id, base) {
    const p = PROVIDERS[id];
    return { ...base, provider: id, host: p.host || base.host, port: p.port, secure: p.secure };
  }

  function onEmail(e) {
    const email = e.target.value;
    setF((old) => {
      let next = { ...old, email };
      if (!touchedProvider) {
        const id = detectProvider(email);
        if (id && id !== old.provider) next = applyProvider(id, { ...next, host: id === "custom" ? "" : next.host });
      }
      return next;
    });
  }

  function onProvider(e) {
    setTouchedProvider(true);
    setF((old) => applyProvider(e.target.value, old));
  }

  function onPort(e) {
    const port = e.target.value;
    setF((old) => ({ ...old, port, secure: port === "465" ? true : port === "587" ? false : old.secure }));
  }

  const payload = () => ({
    id: account?.id,
    email: f.email.trim(),
    display_name: f.display_name,
    provider: f.provider,
    host: f.host,
    port: Number(f.port),
    secure: Boolean(f.secure),
    username: f.username.trim() || f.email.trim(),
    password: f.password,
  });

  async function save(e) {
    e?.preventDefault();
    setBusy("save");
    setNote(null);
    try {
      const res = editing
        ? await api(`/api/accounts/${account.id}`, "PATCH", payload())
        : await api("/api/accounts", "POST", payload());
      onDone(res.account?.id);
    } catch (err) {
      setNote({ ok: false, message: err.message });
      setBusy("");
    }
  }

  async function test(send) {
    setBusy(send ? "send" : "test");
    setNote({ info: true, message: send ? "Sending a test email…" : "Signing in to the mail server…" });
    try {
      setNote((await api("/api/test", "POST", { ...payload(), send })).result);
    } catch (err) {
      setNote({ ok: false, message: err.message });
    }
    setBusy("");
  }

  const canSubmit = emailOk && f.host && f.port && (f.password || account?.has_password);

  return (
    <form className="panel" onSubmit={save}>
      <h2>{editing ? `Edit ${account.email}` : "Add an email account"}</h2>
      <p className="muted small" style={{ marginTop: 0, marginBottom: 18 }}>
        {editing ? "Change anything below. Leave the password blank to keep the saved one." : "Type the email address first. We'll fill in the server settings for common providers."}
      </p>

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input id="email" type="email" autoComplete="off" autoFocus={!editing}
          placeholder="you@gmail.com" value={f.email} onChange={onEmail} />
      </div>

      {(emailOk || editing) && (
        <>
          <div className="field">
            <label htmlFor="provider">Provider</label>
            <select id="provider" value={f.provider} onChange={onProvider}>
              {Object.entries(PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
            </select>
            {f.provider === "custom" && !touchedProvider && (
              <div className="hint">School or work email? It's often run by Google or Microsoft. Pick that if you know it.</div>
            )}
          </div>

          <div className="field">
            <label htmlFor="pw">{preset.passwordLabel}</label>
            <input id="pw" type="password" autoComplete="new-password"
              placeholder={account?.has_password ? "Saved. Leave blank to keep it." : ""}
              value={f.password} onChange={set("password")} />
            <div className="hint">
              {preset.help}{" "}
              {preset.helpUrl && <a href={preset.helpUrl} target="_blank" rel="noreferrer">Open the page</a>}
            </div>
          </div>

          <div className="field">
            <label htmlFor="name">Name people see <span className="muted">(optional)</span></label>
            <input id="name" type="text" placeholder="Ashish" value={f.display_name} onChange={set("display_name")} />
            <div className="hint">Leave blank to use the name from config.json.</div>
          </div>

          <details open={f.provider === "custom"}>
            <summary>Server settings</summary>
            <div className="grid">
              <div className="field">
                <label htmlFor="host">SMTP server</label>
                <input id="host" type="text" placeholder="smtp.example.com" value={f.host} onChange={set("host")} />
              </div>
              <div className="field">
                <label htmlFor="port">Port</label>
                <input id="port" type="number" value={f.port} onChange={onPort} />
              </div>
            </div>
            <div className="field">
              <label className="check">
                <input type="checkbox" checked={Boolean(f.secure)} onChange={set("secure")} />
                Use SSL from the start (usually port 465). Off means STARTTLS (usually 587).
              </label>
            </div>
            <div className="field">
              <label htmlFor="user">Username</label>
              <input id="user" type="text" placeholder={f.email || "Usually your full email address"}
                value={f.username} onChange={set("username")} />
              <div className="hint">Leave blank to use the email address.</div>
            </div>
          </details>
        </>
      )}

      <div className="buttons">
        <button type="submit" className="primary" disabled={!canSubmit || Boolean(busy)}>
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        <button type="button" disabled={!canSubmit || Boolean(busy)} onClick={() => test(false)}>
          {busy === "test" ? "Testing…" : "Test sign-in"}
        </button>
        <button type="button" disabled={!canSubmit || Boolean(busy)} onClick={() => test(true)}>
          {busy === "send" ? "Sending…" : "Email myself a test"}
        </button>
        <button type="button" className="link" style={{ marginLeft: "auto" }} onClick={onCancel}>Cancel</button>
      </div>
      {note && <div className={`note ${note.info ? "info" : note.ok ? "ok" : "bad"}`}>{note.message}</div>}
    </form>
  );
}
