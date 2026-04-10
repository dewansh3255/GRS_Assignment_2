// import { useEffect, useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import Navbar from '../components/Navbar';
// import { getMyProfile, changeUserRole } from '../services/api';

// export default function Settings() {
//   const navigate = useNavigate();
//   const [profile, setProfile] = useState<any>(null);
//   const [currentRole, setCurrentRole] = useState('');
//   const [selectedRole, setSelectedRole] = useState('');
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState('');
//   const [message, setMessage] = useState('');
//   const [isChanging, setIsChanging] = useState(false);

//   useEffect(() => {
//     const loadProfile = async () => {
//       try {
//         const data = await getMyProfile();
//         setProfile(data);
//         setCurrentRole(data.role);
//         setSelectedRole(data.role);
//       } catch (err: any) {
//         if (err.message === 'Unauthorized') navigate('/login');
//         setError(err.message || 'Failed to load settings');
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadProfile();
//   }, [navigate]);

//   const handleRoleChange = async (e: React.FormEvent) => {
//     e.preventDefault();
    
//     if (selectedRole === currentRole) {
//       setMessage('No role change needed.');
//       return;
//     }

//     setIsChanging(true);
//     setError('');
//     setMessage('');

//     try {
//       const result = await changeUserRole(selectedRole as 'CANDIDATE' | 'RECRUITER');
//       setMessage(result.message);
//       setCurrentRole(selectedRole);
      
//       // Refresh page to update navbar and menu
//       setTimeout(() => {
//         window.location.reload();
//       }, 1500);
//     } catch (err: any) {
//       setError(err.message || 'Failed to change role');
//       setSelectedRole(currentRole);
//     } finally {
//       setIsChanging(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
//         <Navbar role={currentRole} username={profile?.username} />
//         <div style={{
//           maxWidth: 600, margin: '40px auto', padding: 24,
//           textAlign: 'center', color: '#64748b'
//         }}>
//           Loading settings…
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
//       <Navbar role={currentRole} username={profile?.username} />
      
//       <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
//         {/* Header */}
//         <h1 style={{
//           fontSize: 28, fontWeight: 700, color: '#1e293b',
//           marginBottom: 8
//         }}>Settings</h1>
//         <p style={{ color: '#64748b', marginBottom: 32 }}>
//           Manage your account preferences and role
//         </p>

//         {/* Messages */}
//         {error && (
//           <div style={{
//             background: '#fee2e2', border: '1px solid #fca5a5',
//             borderRadius: 8, padding: 12, marginBottom: 16, color: '#dc2626'
//           }}>
//             {error}
//           </div>
//         )}
//         {message && (
//           <div style={{
//             background: '#dcfce7', border: '1px solid #86efac',
//             borderRadius: 8, padding: 12, marginBottom: 16, color: '#16a34a'
//           }}>
//             {message}
//           </div>
//         )}

//         {/* Settings Card */}
//         <div style={{
//           background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
//           padding: 24
//         }}>
//           {/* Account Section */}
//           <div style={{ marginBottom: 32 }}>
//             <h2 style={{
//               fontSize: 18, fontWeight: 600, color: '#1e293b',
//               marginBottom: 16
//             }}>Account Information</h2>
            
//             <div style={{
//               display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
//               marginBottom: 16
//             }}>
//               <div>
//                 <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6 }}>
//                   Username
//                 </label>
//                 <input
//                   type="text"
//                   value={profile?.username || ''}
//                   disabled
//                   style={{
//                     width: '100%', padding: 10, borderRadius: 6,
//                     border: '1px solid #e2e8f0', background: '#f1f5f9',
//                     color: '#64748b'
//                   }}
//                 />
//               </div>
              
//               <div>
//                 <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6 }}>
//                   Current Role
//                 </label>
//                 <input
//                   type="text"
//                   value={currentRole}
//                   disabled
//                   style={{
//                     width: '100%', padding: 10, borderRadius: 6,
//                     border: '1px solid #e2e8f0', background: '#f1f5f9',
//                     color: '#0f172a', fontWeight: 600
//                   }}
//                 />
//               </div>
//             </div>
//           </div>

//           {/* Role Change Section */}
//           <div style={{
//             borderTop: '1px solid #e2e8f0', paddingTop: 24
//           }}>
//             <h2 style={{
//               fontSize: 18, fontWeight: 600, color: '#1e293b',
//               marginBottom: 16
//             }}>Change Your Role</h2>

//             <form onSubmit={handleRoleChange}>
//               <div style={{ marginBottom: 16 }}>
//                 <label style={{
//                   display: 'block', fontSize: 14, fontWeight: 500,
//                   color: '#1e293b', marginBottom: 8
//                 }}>
//                   Account Type
//                 </label>
//                 <select
//                   value={selectedRole}
//                   onChange={(e) => setSelectedRole(e.target.value)}
//                   style={{
//                     width: '100%', padding: 12, borderRadius: 8,
//                     border: '1px solid #cbd5e1', fontSize: 14,
//                     color: '#1e293b', background: 'white'
//                   }}
//                 >
//                   <option value="CANDIDATE">Job Seeker / Candidate</option>
//                   <option value="RECRUITER">Recruiter / Employer</option>
//                 </select>
//                 <p style={{
//                   fontSize: 12, color: '#64748b', marginTop: 8
//                 }}>
//                   {selectedRole === 'CANDIDATE'
//                     ? 'As a Job Seeker, you can browse jobs and apply to positions.'
//                     : 'As a Recruiter, you can post jobs, manage applications, and build your company.'}
//                 </p>
//               </div>

//               <div style={{ display: 'flex', gap: 12 }}>
//                 <button
//                   type="submit"
//                   disabled={isChanging || selectedRole === currentRole}
//                   style={{
//                     padding: '10px 24px', borderRadius: 8,
//                     background: selectedRole === currentRole ? '#cbd5e1' : '#3b82f6',
//                     color: 'white', border: 'none', fontSize: 14, fontWeight: 600,
//                     cursor: selectedRole === currentRole ? 'default' : 'pointer',
//                     opacity: isChanging ? 0.7 : 1,
//                     transition: 'all 0.2s'
//                   }}
//                 >
//                   {isChanging ? 'Updating…' : 'Update Role'}
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() => setSelectedRole(currentRole)}
//                   style={{
//                     padding: '10px 24px', borderRadius: 8,
//                     background: 'transparent', color: '#64748b',
//                     border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600,
//                     cursor: 'pointer', transition: 'all 0.2s'
//                   }}
//                   onMouseEnter={(e) => {
//                     (e.target as HTMLButtonElement).style.background = '#f1f5f9';
//                   }}
//                   onMouseLeave={(e) => {
//                     (e.target as HTMLButtonElement).style.background = 'transparent';
//                   }}
//                 >
//                   Cancel
//                 </button>
//               </div>
//             </form>
//           </div>

//           {/* Info Box */}
//           <div style={{
//             marginTop: 24, padding: 16, background: '#f0f9ff',
//             border: '1px solid #bfdbfe', borderRadius: 8
//           }}>
//             <p style={{ fontSize: 13, color: '#1e3a8a', margin: 0 }}>
//               <strong>💡 Tip:</strong> You can switch between roles anytime. Your applications and company information will be preserved.
//             </p>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getMyProfile, changeUserRole } from '../services/api';
import VirtualKeyboard from '../components/VirtualKeyboard';

export default function Settings() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [currentRole, setCurrentRole] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [verificationCode, setVerificationCode] = useState(''); // NEW STATE FOR OTP
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await getMyProfile();
        setProfile(data);
        setCurrentRole(data.role);
        setSelectedRole(data.role);
      } catch (err: any) {
        if (err.message === 'Unauthorized') navigate('/login');
        setError(err.message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const handleRoleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedRole === currentRole) {
      setMessage('No role change needed.');
      return;
    }

    // Require OTP code on frontend before submitting
    if (verificationCode.length < 6) {
      setError('Please enter your 6-digit Authenticator code to confirm this high-risk action.');
      return;
    }

    setIsChanging(true);
    setError('');
    setMessage('');

    try {
      // NOTE: Your backend will need to be updated to accept and verify this code!
      // const result = await changeUserRole(selectedRole as 'CANDIDATE' | 'RECRUITER', verificationCode);
      const result = await changeUserRole(selectedRole as 'CANDIDATE' | 'RECRUITER');
      setMessage(result.message);
      setCurrentRole(selectedRole);
      setVerificationCode(''); // Clear code on success
      
      // Refresh page to update navbar and menu
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to change role');
      setSelectedRole(currentRole);
      setVerificationCode(''); // Clear code on fail
    } finally {
      setIsChanging(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Navbar role={currentRole} username={profile?.username} />
        <div style={{
          maxWidth: 600, margin: '40px auto', padding: 24,
          textAlign: 'center', color: '#64748b'
        }}>
          Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Navbar role={currentRole} username={profile?.username} />
      
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
        {/* Header */}
        <h1 style={{
          fontSize: 28, fontWeight: 700, color: '#1e293b',
          marginBottom: 8
        }}>Settings</h1>
        <p style={{ color: '#64748b', marginBottom: 32 }}>
          Manage your account preferences and role
        </p>

        {/* Messages */}
        {error && (
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5',
            borderRadius: 8, padding: 12, marginBottom: 16, color: '#dc2626'
          }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{
            background: '#dcfce7', border: '1px solid #86efac',
            borderRadius: 8, padding: 12, marginBottom: 16, color: '#16a34a'
          }}>
            {message}
          </div>
        )}

        {/* Settings Card */}
        <div style={{
          background: 'white', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: 24
        }}>
          {/* Account Section */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 18, fontWeight: 600, color: '#1e293b',
              marginBottom: 16
            }}>Account Information</h2>
            
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
              marginBottom: 16
            }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6 }}>
                  Username
                </label>
                <input
                  type="text"
                  value={profile?.username || ''}
                  disabled
                  style={{
                    width: '100%', padding: 10, borderRadius: 6,
                    border: '1px solid #e2e8f0', background: '#f1f5f9',
                    color: '#64748b'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6 }}>
                  Current Role
                </label>
                <input
                  type="text"
                  value={currentRole}
                  disabled
                  style={{
                    width: '100%', padding: 10, borderRadius: 6,
                    border: '1px solid #e2e8f0', background: '#f1f5f9',
                    color: '#0f172a', fontWeight: 600
                  }}
                />
              </div>
            </div>
          </div>

          {/* Role Change Section */}
          <div style={{
            borderTop: '1px solid #e2e8f0', paddingTop: 24
          }}>
            <h2 style={{
              fontSize: 18, fontWeight: 600, color: '#1e293b',
              marginBottom: 16
            }}>Change Your Role</h2>

            <form onSubmit={handleRoleChange}>
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block', fontSize: 14, fontWeight: 500,
                  color: '#1e293b', marginBottom: 8
                }}>
                  Account Type
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => {
                    setSelectedRole(e.target.value);
                    setVerificationCode(""); // Reset code if they change dropdown
                  }}
                  style={{
                    width: '100%', padding: 12, borderRadius: 8,
                    border: '1px solid #cbd5e1', fontSize: 14,
                    color: '#1e293b', background: 'white'
                  }}
                >
                  <option value="CANDIDATE">Job Seeker / Candidate</option>
                  <option value="RECRUITER">Recruiter / Employer</option>
                </select>
                <p style={{
                  fontSize: 12, color: '#64748b', marginTop: 8
                }}>
                  {selectedRole === 'CANDIDATE'
                    ? 'As a Job Seeker, you can browse jobs and apply to positions.'
                    : 'As a Recruiter, you can post jobs, manage applications, and build your company.'}
                </p>
              </div>

              {/* DYNAMIC VIRTUAL KEYBOARD - ONLY SHOWS IF THEY ARE TRYING TO CHANGE ROLE */}
              {selectedRole !== currentRole && (
                <div style={{ 
                  marginTop: 20, marginBottom: 20, padding: 20, 
                  background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' 
                }}>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#b91c1c', marginBottom: 12 }}>
                    ⚠️ High Risk Action: Enter Authenticator Code to Confirm
                  </label>
                  
                  <input
                    type="password"
                    value={verificationCode}
                    readOnly
                    placeholder="••••••"
                    style={{
                      width: '100%', padding: 12, borderRadius: 8,
                      border: '1px solid #cbd5e1', textAlign: 'center',
                      letterSpacing: '0.5em', fontSize: '20px', background: 'white'
                    }}
                  />
                  
                  <VirtualKeyboard 
                    disabled={verificationCode.length >= 6} 
                    onKeyPress={(key) => setVerificationCode(prev => (prev.length < 6 ? prev + key : prev))}
                    onDelete={() => setVerificationCode(prev => prev.slice(0, -1))}
                    onClear={() => setVerificationCode("")}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="submit"
                  disabled={isChanging || selectedRole === currentRole}
                  style={{
                    padding: '10px 24px', borderRadius: 8,
                    background: selectedRole === currentRole ? '#cbd5e1' : '#3b82f6',
                    color: 'white', border: 'none', fontSize: 14, fontWeight: 600,
                    cursor: selectedRole === currentRole ? 'default' : 'pointer',
                    opacity: isChanging ? 0.7 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {isChanging ? 'Updating…' : 'Update Role'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole(currentRole);
                    setVerificationCode("");
                    setError("");
                  }}
                  style={{
                    padding: '10px 24px', borderRadius: 8,
                    background: 'transparent', color: '#64748b',
                    border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>

          {/* Info Box */}
          <div style={{
            marginTop: 24, padding: 16, background: '#f0f9ff',
            border: '1px solid #bfdbfe', borderRadius: 8
          }}>
            <p style={{ fontSize: 13, color: '#1e3a8a', margin: 0 }}>
              <strong>💡 Tip:</strong> You can switch between roles anytime. Your applications and company information will be preserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
