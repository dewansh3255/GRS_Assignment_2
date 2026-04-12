
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, verifyTOTPCode, verifyBackupCode } from '../services/api';
import VirtualKeyboard from '../components/VirtualKeyboard';

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = Pass, 2 = 2FA, 3 = Backup Code
  const [userId, setUserId] = useState<number | null>(null);
  // Store username from Step 1 so we can pass it to the TOTP verify endpoint
  const [loggedInUsername, setLoggedInUsername] = useState('');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [otpCode, setOtpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState('');

  // TOTP retry tracking
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [isLocked, setIsLocked] = useState(false);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown timer — starts whenever isLocked becomes true
  useEffect(() => {
    if (isLocked && lockSecondsLeft > 0) {
      countdownRef.current = setInterval(() => {
        setLockSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            setIsLocked(false);
            setAttemptsLeft(3);
            setError('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [isLocked]);

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Step 1: Password
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await loginUser(credentials);
      // Backend returns locked:true (HTTP 429) if already locked from a previous session
      if (data.locked) {
        setIsLocked(true);
        setLockSecondsLeft(data.seconds_remaining || 15 * 60);
        return;
      }
      setUserId(data.user_id);
      setLoggedInUsername(data.username || credentials.username);
      setAttemptsLeft(3);
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Step 2: TOTP verify — with retry + lockout
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!userId) return;
    if (otpCode.length < 6) { setError('Please enter the full 6-digit code.'); return; }
    try {
      await verifyTOTPCode(userId, otpCode, loggedInUsername);
      localStorage.setItem('username', loggedInUsername || credentials.username);
      navigate('/dashboard');
    } catch (err: any) {
      // Always clear OTP so the virtual keyboard re-enables immediately
      setOtpCode('');

      const message: string = err.message || 'Verification failed';

      if (err.locked) {
        // 3rd strike — backend has set the lock
        const lockSecs: number = err.seconds_remaining || 15 * 60;
        setIsLocked(true);
        setLockSecondsLeft(lockSecs);
        setAttemptsLeft(0);
        setError(message);
      } else {
        // Wrong code but still has retries left
        const newLeft = Math.max(0, attemptsLeft - 1);
        setAttemptsLeft(newLeft);
        if (newLeft <= 0) {
          setError(message);
        } else {
          setError(
            `${message} — ${newLeft} attempt${newLeft === 1 ? '' : 's'} remaining before lockout.`
          );
        }
      }
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
      localStorage.setItem('username', loggedInUsername || credentials.username);
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
        <h2 style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 6, color: '#1e293b', position: 'relative' }}>
          {step === 2 && (
            <button
              onClick={() => { setStep(1); setOtpCode(''); setError(''); }}
              style={{
                position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#64748b', fontSize: 18, padding: '0 4px',
              }}
              title="Back to login"
            >
              ←
            </button>
          )}
          {step === 3 && (
            <button
              onClick={() => { setStep(2); setBackupCode(''); setError(''); }}
              style={{
                position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#64748b', fontSize: 18, padding: '0 4px',
              }}
              title="Back to 2FA"
            >
              ←
            </button>
          )}
          {step === 1 ? 'Sign In' : step === 2 ? '2FA Verification' : 'Backup Code Login'}
        </h2>
        <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13, marginBottom: 22, marginTop: 0 }}>
          {step === 1 && 'Secure Job Platform'}
          {step === 2 && 'Enter the 6-digit code from your authenticator app'}
          {step === 3 && 'Enter one of your backup recovery codes'}
        </p>

        {/* ── Lockout Banner ─────────────────────────────────────────── */}
        {isLocked && (
          <div style={{
            background: '#fef2f2', border: '2px solid #f87171', borderRadius: 10,
            padding: '16px 18px', marginBottom: 20, textAlign: 'center'
          }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>🔒</div>
            <p style={{ color: '#b91c1c', fontWeight: 700, fontSize: 15, margin: 0 }}>
              Account Temporarily Locked
            </p>
            <p style={{ color: '#7f1d1d', fontSize: 13, margin: '6px 0 0' }}>
              Too many failed 2FA attempts. Please try again in:
            </p>
            <div style={{
              fontSize: 36, fontWeight: 800, letterSpacing: '0.1em',
              color: '#dc2626', fontFamily: 'monospace', margin: '10px 0 4px'
            }}>
              {formatCountdown(lockSecondsLeft)}
            </div>
            <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>minutes : seconds</p>
          </div>
        )}

        {/* ── Error banner (non-lockout) ───────────────────────────── */}
        {error && !isLocked && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 10, marginBottom: 14, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* ── Step 1: Password ─────────────────────────────────────── */}
        {step === 1 && !isLocked && (
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

        {/* ── Step 2: TOTP ─────────────────────────────────────────── */}
        {step === 2 && !isLocked && (
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
              onKeyPress={(key) => {
                setOtpCode(prev => {
                  if (prev.length >= 6) return prev;
                  const next = prev + key;
                  // auto-submit when 6th digit is entered
                  if (next.length === 6) {
                    setTimeout(() => {
                      document.getElementById('totp-submit-btn')?.click();
                    }, 100);
                  }
                  return next;
                });
              }}
              onDelete={() => setOtpCode(prev => prev.slice(0, -1))}
              onClear={() => setOtpCode('')}
            />

            {/* Attempt-remaining badge — only shows after first failure */}
            {attemptsLeft < 3 && attemptsLeft > 0 && (
              <div style={{
                width: '100%', marginTop: 10,
                background: attemptsLeft === 1 ? '#fff7ed' : '#fefce8',
                border: `1px solid ${attemptsLeft === 1 ? '#fb923c' : '#facc15'}`,
                borderRadius: 8, padding: '8px 12px', fontSize: 13,
                color: attemptsLeft === 1 ? '#c2410c' : '#854d0e',
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                <span>{attemptsLeft === 1 ? '⚠️' : '⚡'}</span>
                <span>
                  <strong>{attemptsLeft} attempt{attemptsLeft === 1 ? '' : 's'} remaining</strong>
                  {attemptsLeft === 1 && ' — next failure will lock your account for 15 minutes'}
                </span>
              </div>
            )}

            <button id="totp-submit-btn" type="submit" style={{
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

        {/* ── Step 3: Backup Code (Member 3) ───────────────────────── */}
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