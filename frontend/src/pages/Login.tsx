
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, verifyTOTPCode, verifyBackupCode } from '../services/api';
import VirtualKeyboard from '../components/VirtualKeyboard';

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = Pass, 2 = 2FA, 3 = Backup Code
  const [userId, setUserId] = useState<number | null>(null);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [otpCode, setOtpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState('');

  // Step 1: Password
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await loginUser(credentials);
      setUserId(data.user_id);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Step 2: TOTP verify
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!userId) return;
    if (otpCode.length < 6) { setError('Please enter the full 6-digit code.'); return; }
    try {
      await verifyTOTPCode(userId, otpCode);
      localStorage.setItem('username', credentials.username);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Step 3: Backup code login (Member 3)
  const handleBackupCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!userId) return;
    const cleaned = backupCode.trim().toUpperCase();
    if (!cleaned) { setError('Please enter your backup code (format: XXXX-XXXX-XXXX).'); return; }
    try {
      await verifyBackupCode(userId, cleaned);
      localStorage.setItem('username', credentials.username);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const box: React.CSSProperties = {
    background: 'white', padding: 36, borderRadius: 14,
    boxShadow: '0 4px 24px rgba(0,0,0,0.10)', width: 420,
    fontFamily: 'Inter, system-ui, sans-serif'
  };
  const inputCls = "w-full border border-gray-300 p-2 mb-4 rounded focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f1f5f9' }}>
      <div style={box}>
        <h2 style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 6, color: '#1e293b' }}>
          {step === 1 ? 'Sign In' : step === 2 ? '2FA Verification' : 'Backup Code Login'}
        </h2>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13, marginBottom: 22, marginTop: 0 }}>
          {step === 1 && 'Secure Job Platform'}
          {step === 2 && 'Enter the 6-digit code from your authenticator app'}
          {step === 3 && 'Enter one of your backup recovery codes'}
        </p>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 10, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* ── Step 1: Password ─────────────────────────────────────────── */}
        {step === 1 && (
          <form onSubmit={handleLoginSubmit}>
            <input type="text" placeholder="Username" required className={inputCls}
              onChange={e => setCredentials({ ...credentials, username: e.target.value })} />
            <input type="password" placeholder="Password" required className={inputCls}
              onChange={e => setCredentials({ ...credentials, password: e.target.value })} />
            <button type="submit" style={{
              width: '100%', padding: '10px', borderRadius: 8, background: '#3b82f6',
              color: 'white', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer'
            }}>Continue →</button>
            <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
              Need an account?{' '}
              <button type="button" onClick={() => navigate('/')}
                style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Register
              </button>
            </p>
          </form>
        )}

        {/* ── Step 2: TOTP ──────────────────────────────────────────────── */}
        {step === 2 && (
          <form onSubmit={handleVerifySubmit} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <input
              type="text" placeholder="••••••" value={otpCode} readOnly
              style={{
                width: '100%', border: '1px solid #cbd5e1', padding: '12px', marginBottom: 4,
                borderRadius: 8, textAlign: 'center', letterSpacing: '0.5em', fontSize: 22,
                fontFamily: 'monospace', background: '#f8fafc', outline: 'none', boxSizing: 'border-box'
              }}
            />
            <VirtualKeyboard
              disabled={otpCode.length >= 6}
              onKeyPress={(key) => setOtpCode(prev => (prev.length < 6 ? prev + key : prev))}
              onDelete={() => setOtpCode(prev => prev.slice(0, -1))}
              onClear={() => setOtpCode('')}
            />
            <button type="submit" style={{
              width: '100%', padding: '10px', borderRadius: 8, background: '#16a34a',
              color: 'white', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              marginTop: 16
            }}>Verify &amp; Sign In 🔒</button>

            {/* Member 3: Backup code link */}
            <button type="button" onClick={() => { setStep(3); setError(''); setOtpCode(''); }}
              style={{ marginTop: 14, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              🔑 Lost access to authenticator? Use a backup code
            </button>
          </form>
        )}

        {/* ── Step 3: Backup Code (Member 3) ────────────────────────────── */}
        {step === 3 && (
          <form onSubmit={handleBackupCodeSubmit}>
            <div style={{
              background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e'
            }}>
              <strong>⚠️ Backup codes are single-use.</strong> Once entered, this code is permanently invalidated.
              Format: <code>XXXX-XXXX-XXXX</code>
            </div>
            <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6 }}>
              Backup Recovery Code
            </label>
            <input
              type="text"
              placeholder="XXXX-XXXX-XXXX"
              value={backupCode}
              onChange={e => setBackupCode(e.target.value.toUpperCase())}
              style={{
                width: '100%', border: '1px solid #cbd5e1', padding: '12px', marginBottom: 16,
                borderRadius: 8, fontSize: 16, fontFamily: 'monospace', letterSpacing: '0.1em',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
            <button type="submit" style={{
              width: '100%', padding: '10px', borderRadius: 8, background: '#6366f1',
              color: 'white', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer'
            }}>Use Backup Code</button>
            <button type="button" onClick={() => { setStep(2); setError(''); setBackupCode(''); }}
              style={{ marginTop: 14, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, display: 'block', width: '100%', textAlign: 'center' }}>
              ← Back to Authenticator
            </button>
          </form>
        )}
      </div>
    </div>
  );
}