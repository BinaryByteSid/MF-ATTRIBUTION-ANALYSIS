import React, { useState } from 'react';
import { Mail, Lock, User, Shield, ArrowRight, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { login, register } from '../api';

interface AuthScreenProps {
  onAuthSuccess: (user: { email: string; full_name?: string; role: string }) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('investor');

  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successCheck, setSuccessCheck] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (isLogin) {
        await login(email, password);
        // Show success check animation
        setSuccessCheck(true);
        setTimeout(() => {
          onAuthSuccess({ email, role: 'investor' });
        }, 1300);
      } else {
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }
        await register(email, password, fullName, role);
        setSuccess('Registration successful! You can now log in.');
        setIsLogin(true);
        setPassword(''); // clear password for safety
      }
    } catch (err: any) {
      console.error(err);
      const backendError = err.response?.data?.detail;
      setError(
        typeof backendError === 'string'
          ? backendError
          : err.message || 'An authentication error occurred. Please try again.'
      );
    } finally {
      if (!isLogin) setLoading(false);
    }
  };

  if (successCheck) {
    return (
      <div style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        position: 'relative'
      }}>
        {/* Background blobs */}
        <div className="bg-blob bg-blob-1"></div>
        <div className="bg-blob bg-blob-2"></div>
        <div className="bg-blob bg-blob-3"></div>

        <div className="glass-card animate-fade-in-up" style={{
          width: '100%',
          maxWidth: '440px',
          padding: '60px 40px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '2px solid var(--accent-emerald)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-emerald)',
            animation: 'scaleUpCheck 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)'
          }}>
            <CheckCircle2 size={44} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'white' }}>Welcome Back!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '8px', lineHeight: '1.4' }}>
              Authenticated successfully. Preparing your portfolio performance workspace...
            </p>
          </div>
        </div>

        <style>{`
          @keyframes scaleUpCheck {
            0% { transform: scale(0.3); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '85vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
    }}>
      {/* Background blobs */}
      <div className="bg-blob bg-blob-1"></div>
      <div className="bg-blob bg-blob-2"></div>
      <div className="bg-blob bg-blob-3"></div>

      <div className="glass-card animate-fade-in-up" style={{
        width: '100%',
        maxWidth: '440px',
        padding: '40px 32px',
        position: 'relative',
      }}>
        {/* Glow effect at top */}
        <div style={{
          position: 'absolute',
          top: '-15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(59, 130, 246, 0.12) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              marginBottom: '16px',
              animation: 'logoPulse 2.5s infinite ease-in-out',
              color: 'var(--accent-blue)',
              boxShadow: '0 0 15px rgba(59, 130, 246, 0.1)'
            }}>
              <Shield size={24} />
            </div>

            <span style={{
              fontWeight: 800,
              fontSize: '1.75rem',
              letterSpacing: '0.08em',
              background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'block',
              marginBottom: '8px'
            }}>FUND ATTRIBUTION MANAGER</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'white' }}>
              {isLogin ? 'Sign in to Portfolio Analytics' : 'Create an Account'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '6px' }}>
              {isLogin ? 'Access secure performance attribution analysis' : 'Get started by setting up your investor account'}
            </p>
          </div>

          {/* Success / Error Messages */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: 'var(--accent-rose)',
              fontSize: '0.875rem',
              marginBottom: '20px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: 'var(--accent-emerald)',
              fontSize: '0.875rem',
              marginBottom: '20px'
            }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{success}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Full Name (Register only) */}
            {!isLogin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Full Name</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  required
                  placeholder={isLogin ? '••••••••' : 'Minimum 8 characters'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Role (Register only) */}
            {!isLogin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Account Role</label>
                <div style={{ position: 'relative' }}>
                  <Shield size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box', height: '42px', appearance: 'none' }}
                  >
                    <option value="investor">Investor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                height: '42px',
                fontSize: '0.95rem',
                marginTop: '10px'
              }}
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Toggle Screen Option */}
          <div style={{ marginTop: '24px', fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            {isLogin ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => { setIsLogin(false); setError(null); setSuccess(null); }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit' }}
                >
                  Create one now
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setIsLogin(true); setError(null); setSuccess(null); }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit' }}
                >
                  Sign in instead
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Inject animations locally */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes logoPulse {
          0% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
          100% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
      `}</style>
    </div>
  );
};
