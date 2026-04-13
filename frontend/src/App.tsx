import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Register from './pages/Register';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import Applications from './pages/Applications';
import Recruiter from './pages/Recruiter';
import AdminPanel from './pages/AdminPanel';
import Settings from './pages/Settings';
import People from './pages/People';
import ProfilePage from './pages/Profile';
import MyProfile from './pages/MyProfile';
import NetworkGraph from './pages/NetworkGraph';
import ChatWidget from './components/ChatWidget';
import { API_BASE_URL } from './services/api';
import { CryptoProvider } from './contexts/CryptoContext';
import { InactivityProvider } from './contexts/InactivityContext';

function PrivateRoute({ children }: { children: JSX.Element }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = () => {
      if (!localStorage.getItem('username')) {
        setAuthed(false);
        return;
      }
      fetch(`${API_BASE_URL}/api/auth/auth-check/`, { credentials: 'include' })
        .then(res => setAuthed(res.ok))
        .catch(() => setAuthed(false));
    };

    checkAuth();

    // Catch BFCache (Back-Forward Cache) restores
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        checkAuth();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  if (authed === null) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#64748b' }}>
      Checking authentication…
    </div>
  );
  return authed ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <CryptoProvider>
      <Router>
        <InactivityProvider>
          <Routes>
            <Route path="/" element={<Register />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/jobs" element={<PrivateRoute><Jobs /></PrivateRoute>} />
            <Route path="/applications" element={<PrivateRoute><Applications /></PrivateRoute>} />
            <Route path="/recruiter" element={<PrivateRoute><Recruiter /></PrivateRoute>} />
            <Route path="/admin-panel" element={<PrivateRoute><AdminPanel /></PrivateRoute>} />
            <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
            <Route path="/people" element={<PrivateRoute><People /></PrivateRoute>} />
            <Route path="/profile/:username" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            <Route path="/my-profile" element={<PrivateRoute><MyProfile /></PrivateRoute>} />
            <Route path="/network-graph" element={<PrivateRoute><NetworkGraph /></PrivateRoute>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          {/* Global chat widget — rendered once, persists across all authenticated pages */}
          {localStorage.getItem('username') && <ChatWidget />}
        </InactivityProvider>
      </Router>
    </CryptoProvider>
  );
}

export default App;