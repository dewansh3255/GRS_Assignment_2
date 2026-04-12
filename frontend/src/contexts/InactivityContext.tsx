/**
 * InactivityContext.tsx
 * 
 * Monitors user activity (mouse, keyboard, touch, scroll).
 * If the user is inactive for INACTIVITY_LIMIT_MS (5 minutes),
 * they are logged out automatically. Any activity resets the timer.
 * The timer is NOT started until the user is confirmed to be logged in.
 */
import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../services/api';

// 5-minute inactivity threshold
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;

// Events that count as "user activity"
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

const InactivityContext = createContext<null>(null);

export function InactivityProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = useCallback(async () => {
    // Only logout if we're actually authenticated
    const username = localStorage.getItem('username');
    if (!username) return;
    
    try {
      await logoutUser();
    } catch {
      // Best-effort: ignore errors, we still clear local state
    }
    localStorage.removeItem('username');
    navigate('/login');
  }, [navigate]);

  const resetTimer = useCallback(() => {
    // Don't start timer if user is not logged in
    if (!localStorage.getItem('username')) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(handleLogout, INACTIVITY_LIMIT_MS);
  }, [handleLogout]);

  useEffect(() => {
    // Start timer on mount (if logged in)
    resetTimer();

    // Listen for activity to reset timer
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [resetTimer]);

  return (
    <InactivityContext.Provider value={null}>
      {children}
    </InactivityContext.Provider>
  );
}

export function useInactivity() {
  return useContext(InactivityContext);
}
