import { useState } from 'react';
import Navbar from '../components/Navbar';
import { getMyProfile } from '../services/api';
import { useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'sql' | 'xss' | 'csrf';

// ─── Demo panels ──────────────────────────────────────────────────────────────

function SQLPanel() {
  const [query, setQuery] = useState("' OR '1'='1");
  const [mode, setMode] = useState<'vulnerable' | 'safe'>('vulnerable');

  const vulnerableSQL = `SELECT * FROM users WHERE username = '${query}' AND password = 'any';`;

  const safeCode = `# Django ORM — parameterised by default:\nUser.objects.get(username=query_input)\n# Generated SQL (parameters bound by DB driver):\n# SELECT * FROM users WHERE username = %s\n# ↳ Payload is passed as DATA, never interpreted as SQL`;

  const isInjection = query.includes("'") || query.toLowerCase().includes(' or ') || query.includes(';');

  return (
    <div>
      <h3 style={styles.demoTitle}>SQL Injection Defense</h3>
      <p style={styles.theory}>
        <strong>The Attack:</strong> SQL injection tricks the database into interpreting user input as SQL code.
        The classic payload <code>{'  \'  OR  \'1\'=\'1'}</code> makes a WHERE clause always true, bypassing authentication.
      </p>
      <p style={styles.theory}>
        <strong>Our Defense:</strong> Django ORM uses parameterised queries — the database driver separates
        the SQL structure from the data. Input is passed as a bound parameter and is <em>never</em> concatenated
        into the query string. The database engine treats it as a literal string, not SQL.
      </p>

      <div style={styles.toggleRow}>
        <button style={mode === 'vulnerable' ? styles.tabActive : styles.tabInactive} onClick={() => setMode('vulnerable')}>
          ☠️ Vulnerable (Raw SQL)
        </button>
        <button style={mode === 'safe' ? styles.tabActive : styles.tabInactive} onClick={() => setMode('safe')}>
          ✅ Secure (Django ORM)
        </button>
      </div>

      <label style={styles.label}>Try a payload:</label>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Enter username or injection payload"
        style={{ ...styles.input, borderColor: isInjection && mode === 'vulnerable' ? '#f87171' : '#cbd5e1' }}
      />

      {isInjection && mode === 'vulnerable' && (
        <div style={styles.alertDanger}>
          ⚠️ INJECTION DETECTED! In a raw SQL context this would bypass authentication.
        </div>
      )}
      {isInjection && mode === 'safe' && (
        <div style={styles.alertSafe}>
          ✅ Injection attempt neutralised — input is a bound parameter, not SQL.
        </div>
      )}

      <div style={styles.codeBlock}>
        <div style={styles.codeBadge}>{mode === 'vulnerable' ? '☠️ VULNERABLE' : '✅ SECURE'}</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
          {mode === 'vulnerable' ? vulnerableSQL : safeCode}
        </pre>
      </div>

      {mode === 'vulnerable' && (
        <div style={styles.infoBox}>
          <strong>What happens:</strong> The payload <code>{"' OR '1'='1"}</code> closes the quote and adds an always-true
          condition. The database returns all users — the attacker logs in as anyone.
        </div>
      )}
      {mode === 'safe' && (
        <div style={{ ...styles.infoBox, background: '#f0fdf4', borderColor: '#86efac' }}>
          <strong>What happens:</strong> The input string (however malicious) is passed to the DB as a
          bound parameter. The DB looks for a user with the exact username <em>string</em> — which doesn't
          exist — and returns nothing. Attack fails.
        </div>
      )}
    </div>
  );
}

function XSSPanel() {
  const [payload, setPayload] = useState('<script>alert("XSS!")</script>');
  const [mode, setMode] = useState<'vulnerable' | 'safe'>('vulnerable');

  const reactEscaped = payload
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  return (
    <div>
      <h3 style={styles.demoTitle}>Cross-Site Scripting (XSS) Defense</h3>
      <p style={styles.theory}>
        <strong>The Attack:</strong> XSS injects malicious JavaScript into a page viewed by other users.
        A stored XSS payload in a post or message could steal session cookies, redirect users, or
        perform actions on their behalf.
      </p>
      <p style={styles.theory}>
        <strong>Our Defenses:</strong> (1) React automatically escapes all dynamic content in JSX —
        strings are never interpreted as HTML. (2) Django templates auto-escape output.
        (3) HttpOnly cookies cannot be read by JavaScript, preventing cookie theft even if XSS executes.
      </p>

      <div style={styles.toggleRow}>
        <button style={mode === 'vulnerable' ? styles.tabActive : styles.tabInactive} onClick={() => setMode('vulnerable')}>
          ☠️ Vulnerable (innerHTML)
        </button>
        <button style={mode === 'safe' ? styles.tabActive : styles.tabInactive} onClick={() => setMode('safe')}>
          ✅ Secure (React JSX)
        </button>
      </div>

      <label style={styles.label}>Try an XSS payload:</label>
      <input
        value={payload}
        onChange={e => setPayload(e.target.value)}
        style={styles.input}
        placeholder={'<script>...</script>'}
      />

      <label style={styles.label}>Rendered output:</label>
      {mode === 'vulnerable' ? (
        <div style={{ ...styles.codeBlock, borderColor: '#f87171' }}>
          <div style={styles.codeBadge}>☠️ WOULD EXECUTE AS HTML (innerHtml)</div>
          <div style={{ color: '#f87171', fontFamily: 'monospace', fontSize: 13 }}>
            {/* NOTE: We deliberately do NOT use dangerouslySetInnerHTML here for safety */}
            [NOT EXECUTED — this demo shows what WOULD happen]<br/>
            Raw HTML parsed: {payload}
          </div>
          <div style={{ marginTop: 12, padding: 8, background: '#fef2f2', borderRadius: 6, fontSize: 13, color: '#7f1d1d' }}>
            In a real vulnerable app using <code>element.innerHTML = input</code>,
            the script tag above WOULD execute in the victim's browser.
          </div>
        </div>
      ) : (
        <div style={{ ...styles.codeBlock, borderColor: '#86efac' }}>
          <div style={{ ...styles.codeBadge, background: '#15803d' }}>✅ REACT JSX — SAFELY ESCAPED</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#d1fae5' }}>
            {payload /* React string — auto-escaped */}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#6ee7b7' }}>
            Escaped: {reactEscaped}
          </div>
        </div>
      )}

      <div style={{ ...styles.infoBox, marginTop: 16 }}>
        <strong>Defence layer 2 — HttpOnly cookies:</strong> Even if XSS code executed,{' '}
        <code>document.cookie</code> returns <code>""</code> because our JWT tokens live in{' '}
        <code>HttpOnly</code> cookies invisible to JavaScript.
      </div>
    </div>
  );
}

function CSRFPanel() {
  const [sameSite, setSameSite] = useState(true);
  const [csrfToken, setCsrfToken] = useState(true);
  const [djMiddleware, setDjMiddleware] = useState(true);

  const protected_ = sameSite && csrfToken && djMiddleware;

  return (
    <div>
      <h3 style={styles.demoTitle}>Cross-Site Request Forgery (CSRF) Defense</h3>
      <p style={styles.theory}>
        <strong>The Attack:</strong> CSRF tricks a logged-in user's browser into making an unauthorised
        request to our server — for example, a malicious site hosting{' '}
        <code>{'<img src="https://securejobs.com/api/auth/account/delete/">'}</code>.
        The browser automatically attaches the session cookie.
      </p>
      <p style={styles.theory}>
        <strong>Our Defences (all three layers active):</strong>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '16px 0' }}>
        {[
          {
            key: 'sameSite', value: sameSite, set: setSameSite,
            label: 'SameSite=Lax Cookies',
            desc: 'Browsers only send our JWT cookies when the request originates from our own domain. Cross-site requests from attacker.com carry no cookies → unauthenticated → rejected.'
          },
          {
            key: 'csrfToken', value: csrfToken, set: setCsrfToken,
            label: 'CSRF Token (X-CSRFToken header)',
            desc: 'Django issues a CSRF token in a non-HttpOnly cookie. Mutating requests (POST/DELETE) must echo this value in a header. Cross-site scripts cannot read the token (Same-Origin Policy) → cannot forge the header.'
          },
          {
            key: 'djMiddleware', value: djMiddleware, set: setDjMiddleware,
            label: 'Django CsrfViewMiddleware',
            desc: 'Middleware validates the CSRF token on every state-changing request. Requests without a matching token receive 403 Forbidden.'
          }
        ].map(({ key, value, set, label, desc }) => (
          <div key={key} style={{
            display: 'flex', gap: 12, padding: 16, borderRadius: 10,
            border: `1px solid ${value ? '#86efac' : '#fca5a5'}`,
            background: value ? '#f0fdf4' : '#fff1f2', alignItems: 'flex-start'
          }}>
            <button
              onClick={() => set(!value)}
              style={{
                width: 40, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: value ? '#16a34a' : '#e2e8f0', flexShrink: 0,
                position: 'relative', transition: 'all 0.2s'
              }}
            >
              <span style={{
                display: 'block', width: 18, height: 18, borderRadius: '50%', background: 'white',
                position: 'absolute', top: 3, left: value ? 19 : 3, transition: 'all 0.2s'
              }} />
            </button>
            <div>
              <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4, fontSize: 14 }}>
                {value ? '✅' : '❌'} {label}
              </div>
              <div style={{ fontSize: 13, color: '#475569' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: 20, borderRadius: 12, border: `2px solid ${protected_ ? '#16a34a' : '#dc2626'}`,
        background: protected_ ? '#f0fdf4' : '#fef2f2', textAlign: 'center'
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{protected_ ? '🛡️' : '☠️'}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: protected_ ? '#15803d' : '#dc2626', marginBottom: 6 }}>
          {protected_ ? 'CSRF Attack Blocked' : 'CSRF Attack Would Succeed!'}
        </div>
        <div style={{ fontSize: 13, color: '#475569' }}>
          {protected_
            ? 'All three CSRF defence layers are active. A cross-site request would be rejected.'
            : 'Toggle on all defences above to protect the application.'}
        </div>
      </div>

      <div style={{ ...styles.infoBox, marginTop: 16 }}>
        <strong>Extra layer for high-risk actions:</strong> Endpoints like account deletion and password change
        additionally require a live <strong>TOTP code</strong> in the request body. Even if CSRF bypassed
        the cookie + middleware layers, the attacker still cannot supply a valid TOTP code — providing a
        fourth independent defence layer.
      </div>
    </div>
  );
}

// =============================================================================
export default function AttackDemo() {
  const [activeTab, setActiveTab] = useState<Tab>('sql');
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => {});
  }, []);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'sql', label: 'SQL Injection', icon: '💉' },
    { key: 'xss', label: 'XSS', icon: '🕷️' },
    { key: 'csrf', label: 'CSRF', icon: '🎭' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar role={profile?.role || ''} username={profile?.username} />

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px' }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          borderRadius: 16, padding: '32px 36px', marginBottom: 28, color: 'white'
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛡️</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Security Attack Demonstrations</h1>
          <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 14 }}>
            Interactive demos of OWASP Top 10 attack vectors and how SecureJobs defends against them.
            <br />For FCS Course Evaluation — Member 3.
          </p>
        </div>

        {/* Tab Nav */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '10px 22px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 14, transition: 'all 0.15s',
                background: activeTab === t.key ? '#3b82f6' : 'white',
                color: activeTab === t.key ? 'white' : '#64748b',
                boxShadow: activeTab === t.key ? '0 2px 8px rgba(59,130,246,0.4)' : '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content Panel */}
        <div style={{ background: 'white', borderRadius: 14, padding: '32px 36px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          {activeTab === 'sql' && <SQLPanel />}
          {activeTab === 'xss' && <XSSPanel />}
          {activeTab === 'csrf' && <CSRFPanel />}
        </div>

        {/* Footer note */}
        <div style={{ marginTop: 20, padding: 16, background: '#e0f2fe', borderRadius: 10, border: '1px solid #7dd3fc', fontSize: 13, color: '#0c4a6e' }}>
          <strong>📝 Evaluation Note:</strong> These demos are educational simulations. The "Vulnerable" modes
          show <em>conceptually</em> how attacks work without actually executing dangerous code.
          The "Secure" modes demonstrate the active defences in this codebase.
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const styles = {
  demoTitle: {
    fontSize: 20, fontWeight: 700, color: '#1e293b', marginTop: 0, marginBottom: 12
  } as React.CSSProperties,
  theory: {
    fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 12
  } as React.CSSProperties,
  toggleRow: {
    display: 'flex', gap: 8, marginBottom: 16
  } as React.CSSProperties,
  tabActive: {
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: 13, background: '#1e293b', color: 'white'
  } as React.CSSProperties,
  tabInactive: {
    padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
    fontWeight: 600, fontSize: 13, background: 'white', color: '#64748b'
  } as React.CSSProperties,
  label: {
    display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6
  } as React.CSSProperties,
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1',
    fontSize: 14, fontFamily: 'monospace', marginBottom: 14,
    outline: 'none', boxSizing: 'border-box'
  } as React.CSSProperties,
  codeBlock: {
    background: '#1e293b', borderRadius: 10, padding: 16, marginBottom: 14,
    border: '2px solid transparent', position: 'relative'
  } as React.CSSProperties,
  codeBadge: {
    position: 'absolute', top: -12, left: 12, background: '#dc2626',
    color: 'white', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4
  } as React.CSSProperties,
  alertDanger: {
    background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
    padding: '10px 14px', marginBottom: 12, color: '#991b1b', fontSize: 13, fontWeight: 600
  } as React.CSSProperties,
  alertSafe: {
    background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
    padding: '10px 14px', marginBottom: 12, color: '#15803d', fontSize: 13, fontWeight: 600
  } as React.CSSProperties,
  infoBox: {
    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
    padding: '12px 16px', fontSize: 13, color: '#1e3a8a'
  } as React.CSSProperties,
};
