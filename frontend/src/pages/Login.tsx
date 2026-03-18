import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, verifyTOTPCode } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = Pass, 2 = 2FA
  const [userId, setUserId] = useState<number | null>(null);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState('');

  // Step 1: Handle Password Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const data = await loginUser(credentials);
      setUserId(data.user_id);
      setStep(2); // Move to 2FA input screen
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Step 2: Handle OTP Submit
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!userId) return;

    try {
      await verifyTOTPCode(userId, otpCode);
      // Login successful, keys already exist from registration, just go to dashboard!
      navigate('/dashboard'); 
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
        {error && <p className="text-red-500 mb-4 text-sm text-center">{error}</p>}

        {step === 1 && (
          <form onSubmit={handleLoginSubmit}>
            <input type="text" placeholder="Username" required
              className="w-full border p-2 mb-4 rounded"
              onChange={e => setCredentials({...credentials, username: e.target.value})} />
            <input type="password" placeholder="Password" required
              className="w-full border p-2 mb-6 rounded"
              onChange={e => setCredentials({...credentials, password: e.target.value})} />
            <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
              Continue
            </button>
            <p className="mt-4 text-center text-sm text-gray-600">
              Need an account? <button type="button" onClick={() => navigate('/')} className="text-blue-600 underline">Register</button>
            </p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifySubmit} className="flex flex-col items-center">
            <p className="mb-4 w-full text-left font-semibold">Enter your 6-digit Authenticator code:</p>
            <input type="text" placeholder="123456" maxLength={6} required
              className="w-full border p-2 mb-4 rounded text-center tracking-widest text-lg"
              onChange={e => setOtpCode(e.target.value)} />
            <button type="submit" className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700">
              Verify & Secure Session
            </button>
          </form>
        )}
      </div>
    </div>
  );
}