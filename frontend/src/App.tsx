import { useState, useEffect } from 'react';
import { AttributionDashboard } from './components/AttributionDashboard';
import { AuthScreen } from './components/AuthScreen';
import { getCurrentUser, logout } from './api';
import { Loader2, LogOut, User } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const profile = await getCurrentUser();
          setUser(profile);
          setIsAuthenticated(true);
        } catch (err) {
          console.error("Session check failed, clearing tokens:", err);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      }
      setCheckingAuth(false);
    };

    checkSession();

    const handleLogoutEvent = () => {
      setIsAuthenticated(false);
      setUser(null);
    };

    window.addEventListener('auth-logout', handleLogoutEvent);
    return () => {
      window.removeEventListener('auth-logout', handleLogoutEvent);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar banner */}
      <header style={{ 
        borderBottom: '1px solid var(--glass-border)', 
        background: 'rgba(6, 9, 19, 0.8)', 
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div className="navbar-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ 
              fontWeight: 800, 
              fontSize: '1.25rem', 
              letterSpacing: '0.05em',
              background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>FUND ATTRIBUTION MANAGER</span>
            <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-muted)' }}>PORTFOLIO ANALYTICS</span>
          </div>
          
          <div className="navbar-menu">
            <div className="navbar-links">
              <a href="#docs" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }}>Documentation</a>
              <a href="#api" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }}>API Specs</a>
              <a href="#admin" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s' }}>System Admin</a>
            </div>
            
            {isAuthenticated && (
              <div className="user-profile-menu">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'white' }}>
                  <User size={14} style={{ color: 'var(--accent-blue)' }} />
                  <span>{user?.full_name || user?.email}</span>
                  <span style={{ 
                    fontSize: '0.65rem', 
                    background: 'rgba(59, 130, 246, 0.1)', 
                    color: 'var(--accent-blue)', 
                    padding: '1px 6px', 
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    fontWeight: 600
                  }}>{user?.role}</span>
                </div>
                <button 
                  onClick={handleLogout}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    color: 'var(--text-muted)',
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.4)';
                    e.currentTarget.style.background = 'rgba(244, 63, 94, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.borderColor = 'var(--glass-border)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                >
                  <LogOut size={12} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {checkingAuth ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <Loader2 size={36} className="animate-spin" style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue)' }} />
          </div>
        ) : isAuthenticated ? (
          <AttributionDashboard />
        ) : (
          <AuthScreen onAuthSuccess={(u) => { 
            setIsAuthenticated(true); 
            getCurrentUser().then(setUser).catch(() => setUser(u));
          }} />
        )}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--glass-border)', padding: '24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(6, 9, 19, 0.4)' }}>
        © 2026 Fund Attribution Manager. Mutual fund data synchronized via AMFI feed. All rights reserved.
      </footer>
      
      {/* Inject spin keyframes locally if not present */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;

