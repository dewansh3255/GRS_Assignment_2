
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getMyProfile, changeUserRole, changePassword, deleteAccount,
  generateBackupCodes, getBackupCodes,verifyEmailOtp, sendEmailOtp
} from '../services/api';
import VirtualKeyboard from '../components/VirtualKeyboard';

// ─── Reusable TOTP input with virtual keyboard ────────────────────────────────
function TotpField({
  label, value, onChange, onClear
}: { label: string; value: string; onChange: (v: string) => void; onClear: () => void }) {
  return (
    <div style={{ marginTop: 20, marginBottom: 20, padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#b91c1c', marginBottom: 10 }}>
        ⚠️ {label}
      </label>
      <input
        type="password"
        value={value}
        readOnly
        placeholder="••••••"
        style={{
          width: '100%', padding: 12, borderRadius: 8,
          border: '1px solid #cbd5e1', textAlign: 'center',
          letterSpacing: '0.5em', fontSize: '20px', background: 'white',
          boxSizing: 'border-box'
        }}
      />
      <VirtualKeyboard
        disabled={value.length >= 6}
        onKeyPress={(key) => onChange(value.length < 6 ? value + key : value)}
        onDelete={() => onChange(value.slice(0, -1))}
        onClear={onClear}
      />
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      padding: 28, marginBottom: 24, ...style
    }}>
      {children}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 18, marginTop: 0 }}>
      {children}
    </h2>
  );
}

// ─── Alert helpers ────────────────────────────────────────────────────────────
function Success({ msg }: { msg: string }) {
  return <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: 12, marginBottom: 14, color: '#16a34a' }}>{msg}</div>;
}
function Err({ msg }: { msg: string }) {
  return <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 14, color: '#dc2626' }}>{msg}</div>;
}

// ─── Btn helper ───────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, danger, secondary, small }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  danger?: boolean; secondary?: boolean; small?: boolean;
}) {
  const bg = danger ? '#dc2626' : secondary ? 'transparent' : '#3b82f6';
  const color = secondary ? '#64748b' : 'white';
  const border = secondary ? '1px solid #cbd5e1' : 'none';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '8px 16px' : '10px 22px',
        borderRadius: 8, background: disabled ? '#cbd5e1' : bg,
        color, border, fontSize: small ? 13 : 14, fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1, transition: 'all 0.2s'
      }}
    >
      {children}
    </button>
  );
}

// =============================================================================
export default function Settings() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ── Role Change ──────────────────────────────────────────────────────────
  const [currentRole, setCurrentRole] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [roleTotp, setRoleTotp] = useState('');
  const [roleMsg, setRoleMsg] = useState('');
  const [roleErr, setRoleErr] = useState('');
  const [roleChanging, setRoleChanging] = useState(false);

  // ── Password Change (Member 2) ───────────────────────────────────────────
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [pwTotp, setPwTotp] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwChanging, setPwChanging] = useState(false);

  // ── Backup Codes (Member 3) ──────────────────────────────────────────────
  const [bcRemaining, setBcRemaining] = useState<number | null>(null);
  const [bcTotp, setBcTotp] = useState('');
  const [bcGenerated, setBcGenerated] = useState<string[]>([]);
  const [bcMsg, setBcMsg] = useState('');
  const [bcErr, setBcErr] = useState('');
  const [bcGenerating, setBcGenerating] = useState(false);

  // ── Account Delete (Member 2) ────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delTotp, setDelTotp] = useState('');
  const [delErr, setDelErr] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getMyProfile();
        setProfile(data);
        setCurrentRole(data.role);
        setSelectedRole(data.role);
        const bc = await getBackupCodes();
        setBcRemaining(bc.remaining);
      } catch (err: any) {
        if (err.message === 'Unauthorized') navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [navigate]);

  // ── Role Submit ────────────────────────────────────────────────────────────
  const handleRoleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRole === currentRole) { setRoleMsg('No change needed.'); return; }
    if (roleTotp.length < 6) { setRoleErr('Enter your 6-digit authenticator code.'); return; }
    setRoleChanging(true); setRoleErr(''); setRoleMsg('');
    try {
      const result = await changeUserRole(selectedRole as 'CANDIDATE' | 'RECRUITER', roleTotp);
      setRoleMsg(result.message);
      setCurrentRole(selectedRole);
      setRoleTotp('');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setRoleErr(err.message || 'Failed to change role');
      setSelectedRole(currentRole);
      setRoleTotp('');
    } finally {
      setRoleChanging(false);
    }
  };

  // ── Password Submit ────────────────────────────────────────────────────────
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr(''); setPwMsg('');
    if (!oldPw || !newPw) { setPwErr('Fill in both password fields.'); return; }
    if (newPw !== newPw2) { setPwErr('New passwords do not match.'); return; }
    if (newPw.length < 8) { setPwErr('New password must be at least 8 characters.'); return; }
    if (pwTotp.length < 6) { setPwErr('Enter your 6-digit authenticator code.'); return; }
    setPwChanging(true);
    try {
      const res = await changePassword(oldPw, newPw, pwTotp);
      setPwMsg(res.message);
      setOldPw(''); setNewPw(''); setNewPw2(''); setPwTotp('');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setPwErr(err.message || 'Password change failed.');
      setPwTotp('');
    } finally {
      setPwChanging(false);
    }
  };

  // ── Backup Codes Generate ──────────────────────────────────────────────────
  const handleGenerateCodes = async () => {
    if (bcTotp.length < 6) { setBcErr('Enter your 6-digit authenticator code.'); return; }
    setBcGenerating(true); setBcErr(''); setBcMsg(''); setBcGenerated([]);
    try {
      const res = await generateBackupCodes(bcTotp);
      setBcGenerated(res.codes);
      setBcRemaining(res.count);
      setBcTotp('');
      setBcMsg('Codes generated! Save them securely — they will not be shown again.');
    } catch (err: any) {
      setBcErr(err.message || 'Failed to generate codes.');
      setBcTotp('');
    } finally {
      setBcGenerating(false);
    }
  };

  // ── Account Delete Submit ──────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (!delPw) { setDelErr('Enter your password.'); return; }
    if (delTotp.length < 6) { setDelErr('Enter your 6-digit authenticator code.'); return; }
    setDeleting(true); setDelErr('');
    try {
      await deleteAccount(delPw, delTotp);
      navigate('/login');
    } catch (err: any) {
      setDelErr(err.message || 'Deletion failed.');
      setDelPw(''); setDelTotp('');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar role={currentRole} username={profile?.username} />
      <div style={{ maxWidth: 600, margin: '60px auto', textAlign: 'center', color: '#64748b' }}>Loading settings…</div>
    </div>
  );

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box',
    outline: 'none', background: 'white'
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <Navbar role={currentRole} username={profile?.username} />

      <div style={{ maxWidth: 660, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Settings</h1>
        <p style={{ color: '#64748b', marginBottom: 28, marginTop: 0 }}>Manage your account and security preferences</p>

        {/* ── Account Info ──────────────────────────────────────────────────── */}
        <Card>
          <SectionTitle>Account Information</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6 }}>Username</label>
              <input type="text" value={profile?.username || ''} disabled style={{ ...inputStyle, background: '#f1f5f9', color: '#64748b' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6 }}>Current Role</label>
              <input type="text" value={currentRole} disabled style={{ ...inputStyle, background: '#f1f5f9', fontWeight: 700, color: '#0f172a' }} />
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle>✉️ Email Address</SectionTitle>
          
          {profile?.is_email_verified ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#dcfce7', border: '1px solid #86efac', padding: '16px', borderRadius: '8px' }}>
              <span style={{ color: '#16a34a', fontSize: '24px', fontWeight: 'bold' }}>✓</span>
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: '#166534', fontSize: '14px' }}>Your email is verified</p>
                <p style={{ margin: 0, color: '#15803d', fontSize: '13px' }}>{profile.email}</p>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 13, color: '#475569', marginTop: 0, marginBottom: 16 }}>
                Verify your email to get a verified badge on your profile. <strong>Once verified, it cannot be changed.</strong>
              </p>
              
              {emailMessage && <Success msg={emailMessage} />}
              {emailError && <Err msg={emailError} />}

              {!isOtpSent ? (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="email" 
                    placeholder="Enter new email address" 
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setEmailError('');
                        try {
                          await sendEmailOtp(emailInput);
                          setIsOtpSent(true);
                          setEmailMessage('OTP sent! It expires in 10 minutes.');
                        } catch (err: any) {
                          setEmailError(err.message || 'Failed to send OTP');
                        }
                      }
                    }}
                    style={{...inputStyle, flex: 1}}
                  />
                  <Btn onClick={async () => {
                    setEmailError('');
                    try {
                      await sendEmailOtp(emailInput);
                      setIsOtpSent(true);
                      setEmailMessage('OTP sent! It expires in 10 minutes.');
                    } catch (err: any) {
                      setEmailError(err.message || 'Failed to send OTP');
                    }
                  }}>
                    Send OTP
                  </Btn>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="text" 
                    placeholder="Enter 6-digit OTP" 
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        setEmailError('');
                        try {
                          await verifyEmailOtp(otpInput);
                          setEmailMessage('Email verified successfully!');
                          setProfile({ ...profile, is_email_verified: true, email: emailInput });
                        } catch (err: any) {
                          setEmailError(err.message || 'Invalid OTP');
                        }
                      }
                    }}
                    style={{...inputStyle, flex: 1, letterSpacing: '0.2em', textAlign: 'center', fontWeight: 'bold'}}
                  />
                  <Btn onClick={async () => {
                    setEmailError('');
                    try {
                      await verifyEmailOtp(otpInput);
                      setEmailMessage('Email verified successfully!');
                      setProfile({ ...profile, is_email_verified: true, email: emailInput });
                    } catch (err: any) {
                      setEmailError(err.message || 'Invalid OTP');
                    }
                  }}>
                    Verify
                  </Btn>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Role Change ──────────────────────────────────────────────────── */}
        <Card>
          <SectionTitle>🔄 Change Your Role</SectionTitle>
          {roleErr && <Err msg={roleErr} />}
          {roleMsg && <Success msg={roleMsg} />}
          <form onSubmit={handleRoleChange}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#1e293b', marginBottom: 8 }}>Account Type</label>
            <select
              value={selectedRole}
              onChange={(e) => { setSelectedRole(e.target.value); setRoleTotp(''); }}
              style={{ ...inputStyle, marginBottom: 8 }}
            >
              <option value="CANDIDATE">Job Seeker / Candidate</option>
              <option value="RECRUITER">Recruiter / Employer</option>
            </select>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 0, marginBottom: 12 }}>
              {selectedRole === 'CANDIDATE'
                ? 'Browse jobs and apply to positions.'
                : 'Post jobs, manage applications, and build your company.'}
            </p>

            {selectedRole !== currentRole && (
              <TotpField
                label="Authenticator Code required for role change"
                value={roleTotp}
                onChange={setRoleTotp}
                onClear={() => setRoleTotp('')}
              />
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <Btn disabled={roleChanging || selectedRole === currentRole}>{roleChanging ? 'Updating…' : 'Update Role'}</Btn>
              <Btn secondary onClick={() => { setSelectedRole(currentRole); setRoleTotp(''); setRoleErr(''); }}>Cancel</Btn>
            </div>
          </form>
        </Card>

        {/* ── Password Change (Member 2) ────────────────────────────────────── */}
        <Card>
          <SectionTitle>🔑 Change Password <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>(Member 2)</span></SectionTitle>
          <p style={{ fontSize: 13, color: '#475569', marginTop: 0, marginBottom: 16 }}>
            Password changes require your current password <strong>and</strong> a live authenticator code —
            preventing account takeover even if someone steals your session cookie.
          </p>
          {pwErr && <Err msg={pwErr} />}
          {pwMsg && <Success msg={pwMsg} />}
          <form onSubmit={handlePasswordChange}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 4 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 5 }}>Current Password</label>
                <input type="password" value={oldPw} onChange={e => setOldPw(e.target.value)} placeholder="Current password" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 5 }}>New Password</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min. 8 characters" style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 5 }}>Confirm New Password</label>
                <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} placeholder="Repeat new password" style={inputStyle} />
              </div>
            </div>

            {(oldPw || newPw) && (
              <TotpField
                label="Authenticator Code required to confirm password change"
                value={pwTotp}
                onChange={setPwTotp}
                onClear={() => setPwTotp('')}
              />
            )}

            <Btn disabled={pwChanging}>{pwChanging ? 'Changing…' : 'Change Password'}</Btn>
          </form>
        </Card>



        {/* ── Backup Codes (Member 3) ───────────────────────────────────────── */}
        <Card>
          <SectionTitle>🛡️ Backup Recovery Codes <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>(Member 3)</span></SectionTitle>
          <p style={{ fontSize: 13, color: '#475569', marginTop: 0, marginBottom: 16 }}>
            Backup codes let you log in if you lose access to your authenticator app.
            Each code can be used <strong>once only</strong>. Generating new codes invalidates all old ones.
            Codes are stored as SHA-256 hashes — the plaintext is shown only once.
          </p>

          {bcRemaining !== null && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
              borderRadius: 20, background: bcRemaining > 3 ? '#dcfce7' : '#fee2e2',
              color: bcRemaining > 3 ? '#15803d' : '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 16
            }}>
              {bcRemaining > 0 ? `🔐 ${bcRemaining} of 8 codes remaining` : '⚠️ No backup codes — generate some!'}
            </div>
          )}

          {bcErr && <Err msg={bcErr} />}
          {bcMsg && <Success msg={bcMsg} />}

          {/* Show generated codes only once */}
          {bcGenerated.length > 0 && (
            <div style={{
              background: '#1e293b', borderRadius: 10, padding: 20, marginBottom: 20,
              fontFamily: 'monospace'
            }}>
              <p style={{ color: '#f8fafc', fontSize: 12, margin: '0 0 12px', fontWeight: 600 }}>
                ⚠️ COPY THESE NOW — they will not be shown again
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {bcGenerated.map((code, i) => (
                  <div key={i} style={{
                    background: '#334155', borderRadius: 6, padding: '8px 12px',
                    color: '#7dd3fc', fontSize: 14, fontWeight: 700, letterSpacing: '0.05em'
                  }}>
                    {code}
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(bcGenerated.join('\n'))}
                style={{
                  marginTop: 14, padding: '6px 14px', borderRadius: 6,
                  background: '#3b82f6', color: 'white', border: 'none',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}
              >
                📋 Copy All
              </button>
            </div>
          )}

          <TotpField
            label="Enter Authenticator Code to generate new backup codes"
            value={bcTotp}
            onChange={setBcTotp}
            onClear={() => setBcTotp('')}
          />

          <Btn onClick={handleGenerateCodes} disabled={bcGenerating || bcTotp.length < 6}>
            {bcGenerating ? 'Generating…' : 'Generate 8 Backup Codes'}
          </Btn>
        </Card>

        {/* ── Danger Zone: Account Delete (Member 2) ───────────────────────── */}
        <Card style={{ border: '1px solid #fca5a5' }}>
          <SectionTitle>🗑️ Delete Account <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>(Member 2)</span></SectionTitle>
          <p style={{ fontSize: 13, color: '#dc2626', marginTop: 0, marginBottom: 16 }}>
            <strong>Permanent and irreversible.</strong> Requires your password AND a live authenticator code —
            two independent factors ensure no CSRF or XSS attack can trigger this silently.
          </p>

          {!deleteConfirm ? (
            <Btn danger onClick={() => setDeleteConfirm(true)}>Delete My Account</Btn>
          ) : (
            <div>
              {delErr && <Err msg={delErr} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 4 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 5 }}>Confirm Password</label>
                  <input
                    type="password"
                    value={delPw}
                    onChange={e => setDelPw(e.target.value)}
                    placeholder="Your current password"
                    style={{ ...inputStyle, borderColor: '#fca5a5' }}
                  />
                </div>
              </div>

              <TotpField
                label="Authenticator Code required — this action is PERMANENT"
                value={delTotp}
                onChange={setDelTotp}
                onClear={() => setDelTotp('')}
              />

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <Btn danger disabled={deleting || !delPw || delTotp.length < 6} onClick={handleDeleteAccount}>
                  {deleting ? 'Deleting…' : '⚠️ Permanently Delete Account'}
                </Btn>
                <Btn secondary onClick={() => { setDeleteConfirm(false); setDelPw(''); setDelTotp(''); setDelErr(''); }}>
                  Cancel
                </Btn>
              </div>
            </div>
          )}
        </Card>

        {/* Info box */}
        <div style={{ padding: 16, background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
          <p style={{ fontSize: 13, color: '#1e3a8a', margin: 0 }}>
            <strong>💡 Security Note:</strong> All high-risk actions on this page require a live TOTP code.
            Even if your session is hijacked, an attacker without your phone cannot change your password, role, or delete your account.
          </p>
        </div>
      </div>
    </div>
  );
}
