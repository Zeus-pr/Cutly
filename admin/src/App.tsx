import { useCallback, useEffect, useState } from 'react';
import {
  adminFetch,
  clearAdminSession,
  getAdminSecret,
  setAdminSecret,
  setPartnerSession,
  type AdminPartnerRow
} from './api';
import { PartnerWorkspace } from './PartnerWorkspace';

type View = 'partners' | 'leads' | 'create' | 'workspace';

export function App() {
  const [authed, setAuthed] = useState(() => Boolean(getAdminSecret()));
  const [secretDraft, setSecretDraft] = useState('');
  const [view, setView] = useState<View>('partners');
  const [partners, setPartners] = useState<AdminPartnerRow[]>([]);
  const [leads, setLeads] = useState<
    { id: string; phone: string; shopName: string | null; city: string | null; createdAt: string }[]
  >([]);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ id: string; email: string | null; name: string | null } | null>(
    null
  );

  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createName, setCreateName] = useState('');

  const onFlash = useCallback((kind: 'ok' | 'err', text: string) => {
    setFlash({ kind, text });
  }, []);

  const loadPartners = useCallback(async () => {
    const rows = await adminFetch<AdminPartnerRow[]>('/admin/partners');
    setPartners(rows);
  }, []);

  const loadLeads = useCallback(async () => {
    const rows = await adminFetch<typeof leads>('/admin/leads');
    setLeads(rows);
  }, []);

  useEffect(() => {
    if (!authed) return;
    void (async () => {
      try {
        await adminFetch('/admin/ping');
        await loadPartners();
      } catch (e) {
        onFlash('err', e instanceof Error ? e.message : 'Admin auth failed');
        clearAdminSession();
        setAuthed(false);
      }
    })();
  }, [authed, loadPartners, onFlash]);

  async function unlock() {
    setBusy(true);
    setFlash(null);
    try {
      setAdminSecret(secretDraft);
      await adminFetch('/admin/ping');
      setAuthed(true);
      setSecretDraft('');
    } catch (e) {
      clearAdminSession();
      onFlash('err', e instanceof Error ? e.message : 'Bad ADMIN_SECRET');
    } finally {
      setBusy(false);
    }
  }

  async function openPartner(row: AdminPartnerRow) {
    setBusy(true);
    setFlash(null);
    try {
      const minted = await adminFetch<{ token: string; partner: { id: string; email: string | null; name: string | null } }>(
        `/admin/partners/${row.id}/token`,
        { method: 'POST' }
      );
      setPartnerSession(minted.partner.id, minted.token);
      setActive({ id: minted.partner.id, email: minted.partner.email, name: minted.partner.name });
      setView('workspace');
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Could not open partner');
    } finally {
      setBusy(false);
    }
  }

  async function createPartner() {
    setBusy(true);
    setFlash(null);
    try {
      const created = await adminFetch<{
        token: string;
        partner: { id: string; email: string | null; name: string | null };
      }>('/admin/partners', {
        method: 'POST',
        body: JSON.stringify({
          email: createEmail.trim().toLowerCase(),
          password: createPassword,
          name: createName.trim() || undefined
        })
      });
      setPartnerSession(created.partner.id, created.token);
      setActive({ id: created.partner.id, email: created.partner.email, name: created.partner.name });
      onFlash('ok', 'Partner created. Finish shop setup, then share email + password.');
      setCreateEmail('');
      setCreatePassword('');
      setCreateName('');
      await loadPartners();
      setView('workspace');
    } catch (e) {
      onFlash('err', e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand" style={{ marginBottom: 8 }}>
            Cut<span>Ly</span> Admin
          </div>
          <p className="lede" style={{ marginBottom: 18 }}>
            Local partner onboard portal. Secret = <code className="mono">ADMIN_SECRET</code> in{' '}
            <code className="mono">.env</code> (long random value — not the old default). Admin API is
            loopback-only on <code className="mono">127.0.0.1:4000</code>. Keep alive via{' '}
            <code className="mono">npm run api:ensure</code> / LaunchAgent.
          </p>
          {flash ? <div className={`flash ${flash.kind}`}>{flash.text}</div> : null}
          <div className="field">
            <label>Admin secret</label>
            <input
              type="password"
              value={secretDraft}
              onChange={(e) => setSecretDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void unlock();
              }}
              autoFocus
            />
          </div>
          <button
            type="button"
            className="btn accent"
            style={{ width: '100%', marginTop: 16 }}
            disabled={busy || !secretDraft.trim()}
            onClick={() => void unlock()}
          >
            {busy ? 'Checking…' : 'Open portal'}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'workspace' && active) {
    return (
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            Cut<span>Ly</span>
          </div>
          <nav>
            <button type="button" className="nav-btn" onClick={() => setView('partners')}>
              All partners
            </button>
            <button type="button" className="nav-btn on">
              Editing
            </button>
          </nav>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 'auto', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
            onClick={() => {
              clearAdminSession();
              setAuthed(false);
            }}
          >
            Lock portal
          </button>
        </aside>
        <div>
          {flash ? (
            <div style={{ padding: '20px 32px 0' }}>
              <div className={`flash ${flash.kind}`}>{flash.text}</div>
            </div>
          ) : null}
          <PartnerWorkspace
            partnerId={active.id}
            partnerEmail={active.email}
            partnerName={active.name}
            onBack={() => {
              setView('partners');
              setActive(null);
              void loadPartners();
            }}
            onFlash={onFlash}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Cut<span>Ly</span>
        </div>
        <nav>
          <button
            type="button"
            className={`nav-btn ${view === 'partners' ? 'on' : ''}`}
            onClick={() => setView('partners')}
          >
            Partners
          </button>
          <button
            type="button"
            className={`nav-btn ${view === 'create' ? 'on' : ''}`}
            onClick={() => setView('create')}
          >
            Create partner
          </button>
          <button
            type="button"
            className={`nav-btn ${view === 'leads' ? 'on' : ''}`}
            onClick={() => {
              setView('leads');
              void loadLeads().catch((e) => onFlash('err', e instanceof Error ? e.message : 'Leads failed'));
            }}
          >
            Website leads
          </button>
        </nav>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 'auto', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
          onClick={() => {
            clearAdminSession();
            setAuthed(false);
          }}
        >
          Lock portal
        </button>
      </aside>

      <div className="main">
        {flash ? <div className={`flash ${flash.kind}`}>{flash.text}</div> : null}

        {view === 'partners' ? (
          <>
            <h1>Partners</h1>
            <p className="lede">
              Open a partner to configure shop, hours, menu, staff, photos — using the same APIs as the partner app.
            </p>
            <div className="card">
              <div className="row" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0 }}>Accounts</h2>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => void loadPartners()}>
                  Refresh
                </button>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Shop</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.email || '—'}</div>
                        <div className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {p.name || p.id}
                        </div>
                      </td>
                      <td>
                        {p.shop ? (
                          <>
                            <div>{p.shop.name}</div>
                            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                              {p.shop.city}
                              {p.shop.kinds?.length ? ` · ${p.shop.kinds.join(', ')}` : ''}
                            </div>
                          </>
                        ) : (
                          <span className="badge warn">No shop</span>
                        )}
                      </td>
                      <td>
                        {p.shop?.setupDone ? (
                          <span className="badge ok">Live</span>
                        ) : (
                          <span className="badge warn">Needs setup</span>
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn teal" disabled={busy} onClick={() => void openPartner(p)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!partners.length ? (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--muted)' }}>
                        No partners yet — create one.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {view === 'create' ? (
          <>
            <h1>Create partner</h1>
            <p className="lede">Creates a Partner row (same as legacy signup), then you finish the shop here.</p>
            <div className="card">
              <div className="row">
                <div className="field">
                  <label>Email</label>
                  <input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="mono"
                  />
                </div>
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label>Display name</label>
                <input value={createName} onChange={(e) => setCreateName(e.target.value)} />
              </div>
              <button
                type="button"
                className="btn accent"
                style={{ marginTop: 16 }}
                disabled={busy || !createEmail.trim() || createPassword.length < 8}
                onClick={() => void createPartner()}
              >
                {busy ? 'Creating…' : 'Create & configure'}
              </button>
            </div>
          </>
        ) : null}

        {view === 'leads' ? (
          <>
            <h1>Website leads</h1>
            <p className="lede">From Partner With Us — convert manually by creating a partner with their details.</p>
            <div className="card">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Phone</th>
                    <th>Shop</th>
                    <th>City</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id}>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td className="mono">{l.phone}</td>
                      <td>{l.shopName || '—'}</td>
                      <td>{l.city || '—'}</td>
                    </tr>
                  ))}
                  {!leads.length ? (
                    <tr>
                      <td colSpan={4} style={{ color: 'var(--muted)' }}>
                        No leads yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
