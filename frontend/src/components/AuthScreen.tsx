import React, { useState } from 'react';
import { Mail, Lock, User, Shield, ArrowRight, Loader2, AlertCircle, CheckCircle2, KeyRound, HelpCircle, BarChart3, TrendingUp, ShieldAlert } from 'lucide-react';
import { login, register, forgotPasswordVerify, forgotPasswordReset, getCurrentUser } from '../api';

interface AuthScreenProps {
  onAuthSuccess: (user: { email: string; full_name?: string; role: string }) => void;
}

const SECURITY_QUESTIONS = [
  "What is your mother's name?",
  "Enter your name and surname.",
  "In what city were you born?",
  "What was the name of your first school?",
  "What is your favorite book?"
];

type AuthMode = 'login' | 'register' | 'forgot';

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');

  // Input fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');

  // Forgot password specific fields
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [fetchedQuestion, setFetchedQuestion] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successCheck, setSuccessCheck] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await login(email, password);
      // Fetch actual user profile to get the exact role and name
      const profile = await getCurrentUser();
      setSuccessCheck(true);
      setTimeout(() => {
        onAuthSuccess(profile);
      }, 1300);
    } catch (err: any) {
      console.error(err);
      const backendError = err.response?.data?.detail;
      setError(
        typeof backendError === 'string'
          ? backendError
          : err.message || 'Incorrect email or password. Please try again.'
      );
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!securityAnswer.trim()) {
      setError('Please provide an answer to the security question');
      return;
    }

    setLoading(true);
    try {
      // Defaulting to role: investor, passing security question and answer
      await register(email, password, fullName, 'investor', securityQuestion, securityAnswer);
      setSuccess('Registration successful! You can now log in.');
      setMode('login');
      setPassword('');
      setSecurityAnswer('');
    } catch (err: any) {
      console.error(err);
      const backendError = err.response?.data?.detail;
      setError(
        typeof backendError === 'string'
          ? backendError
          : err.message || 'An error occurred during registration. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await forgotPasswordVerify(email);
      setFetchedQuestion(res.security_question);
      setForgotStep(2);
    } catch (err: any) {
      console.error(err);
      const backendError = err.response?.data?.detail;
      setError(
        typeof backendError === 'string'
          ? backendError
          : 'No account found with this email address'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!securityAnswer.trim()) {
      setError('Please answer the security question');
      return;
    }

    setLoading(true);
    try {
      await forgotPasswordReset(email, fetchedQuestion, securityAnswer, newPassword);
      setSuccess('Password updated successfully! Please sign in with your new password.');
      setMode('login');
      setPassword('');
      setNewPassword('');
      setSecurityAnswer('');
      setForgotStep(1);
    } catch (err: any) {
      console.error(err);
      const backendError = err.response?.data?.detail;
      setError(
        typeof backendError === 'string'
          ? backendError
          : 'Incorrect security answer. Please try again.'
      );
    } finally {
      setLoading(false);
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
      padding: '40px 20px',
      position: 'relative',
    }}>
      {/* Background blobs */}
      <div className="bg-blob bg-blob-1"></div>
      <div className="bg-blob bg-blob-2"></div>
      <div className="bg-blob bg-blob-3"></div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr',
        gap: '40px',
        width: '100%',
        maxWidth: '1050px',
        alignItems: 'stretch',
      }} className="auth-grid-container">

        {/* Left Side: Informative Panel */}
        <div className="informative-panel" style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '20px 10px',
          color: '#e2e8f0',
        }}>
          <div style={{ marginBottom: '24px' }}>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              background: 'rgba(59, 130, 246, 0.15)',
              color: 'var(--accent-cyan)',
              padding: '6px 12px',
              borderRadius: '20px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'inline-block',
              marginBottom: '16px',
              border: '1px solid rgba(6, 182, 212, 0.25)'
            }}>
              Professional Portfolio Attribution
            </span>
            <h1 style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              lineHeight: '1.2',
              margin: '0 0 16px 0',
              background: 'linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Deconstruct Your Mutual Fund Performance
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: '1.6', margin: 0 }}>
              Analyze active returns, track historical growth, and understand the source of your alpha using institutional-grade metrics.
            </p>
          </div>

          {/* Features Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '10px',
                borderRadius: '10px',
                color: 'var(--accent-emerald)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <BarChart3 size={20} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 600, color: 'white' }}>Brinson Attribution Model</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Decompose excess returns into <strong>Allocation</strong>, <strong>Selection</strong>, and <strong>Interaction</strong> effects against top TRI benchmarks.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{
                background: 'rgba(59, 130, 246, 0.1)',
                padding: '10px',
                borderRadius: '10px',
                color: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <TrendingUp size={20} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 600, color: 'white' }}>True XIRR & CAGR Calculation</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Evaluate actual annualized returns of periodic cash flows, auto-synchronized with active NAV values from AMFI.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{
                background: 'rgba(139, 92, 246, 0.1)',
                padding: '10px',
                borderRadius: '10px',
                color: 'var(--accent-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <ShieldAlert size={20} />
              </div>
              <div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 600, color: 'white' }}>Comprehensive Risk Analytics</h4>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Monitor critical metrics like Sharpe & Sortino ratios, Beta, Jensen's Alpha, Information ratio, and 95% Value at Risk (VaR).
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Right Side: Form Card */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="glass-card" style={{
            width: '100%',
            padding: '36px 30px',
            position: 'relative',
          }}>
            {/* Glow effect */}
            <div style={{
              position: 'absolute',
              top: '-10%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '180px',
              height: '180px',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%)',
              pointerEvents: 'none',
              zIndex: 0
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  marginBottom: '14px',
                  animation: 'logoPulse 2.5s infinite ease-in-out',
                  color: 'var(--accent-blue)',
                }}>
                  <Shield size={22} />
                </div>

                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'white' }}>
                  {mode === 'login' && 'Sign In to Platform'}
                  {mode === 'register' && 'Create Investor Account'}
                  {mode === 'forgot' && 'Reset Secure Password'}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
                  {mode === 'login' && 'Secure access to performance & attribution data'}
                  {mode === 'register' && 'Register your details to analyze portfolios'}
                  {mode === 'forgot' && 'Verify security questions to recover access'}
                </p>
              </div>

              {/* Status alerts */}
              {error && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: 'var(--accent-rose)',
                  fontSize: '0.85rem',
                  marginBottom: '16px'
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
                  padding: '12px',
                  color: 'var(--accent-emerald)',
                  fontSize: '0.85rem',
                  marginBottom: '16px'
                }}>
                  <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
                  <span>{success}</span>
                </div>
              )}

              {/* Workflows */}

              {/* LOGIN WORKFLOW */}
              {mode === 'login' && (
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => { setMode('forgot'); setError(null); setSuccess(null); setForgotStep(1); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#60a5fa',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '0.825rem',
                          fontWeight: 600,
                          textDecoration: 'underline'
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>

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
                      marginTop: '8px'
                    }}
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* REGISTER WORKFLOW */}
              {mode === 'register' && (
                <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="password"
                        required
                        placeholder="Minimum 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {/* Security Question Setup */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Security Question (For Recovery)</label>
                    <div style={{ position: 'relative' }}>
                      <HelpCircle size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <select
                        value={securityQuestion}
                        onChange={(e) => setSecurityQuestion(e.target.value)}
                        style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box', height: '42px', appearance: 'none', background: 'rgba(10, 15, 30, 0.85)' }}
                      >
                        {SECURITY_QUESTIONS.map((q) => (
                          <option key={q} value={q}>{q}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Answer</label>
                    <div style={{ position: 'relative' }}>
                      <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        required
                        placeholder="Your answer"
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

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
                      marginTop: '8px'
                    }}
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <>
                        <span>Create Account</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* FORGOT PASSWORD WORKFLOW */}
              {mode === 'forgot' && (
                <div>
                  {forgotStep === 1 ? (
                    <form onSubmit={handleForgotVerify} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Email Address</label>
                        <div style={{ position: 'relative' }}>
                          <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                          <input
                            type="email"
                            required
                            placeholder="Enter your registered email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

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
                        }}
                      >
                        {loading ? (
                          <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <>
                            <span>Verify Email</span>
                            <ArrowRight size={16} />
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleForgotReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                      {/* Security Question Prompt */}
                      <div style={{
                        padding: '12px',
                        background: 'rgba(59, 130, 246, 0.05)',
                        border: '1px solid rgba(59, 130, 246, 0.15)',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                        color: 'white',
                        lineHeight: '1.4',
                        marginBottom: '4px'
                      }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Security Question</div>
                        <strong>{fetchedQuestion}</strong>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Your Answer</label>
                        <div style={{ position: 'relative' }}>
                          <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                          <input
                            type="text"
                            required
                            placeholder="Type answer here"
                            value={securityAnswer}
                            onChange={(e) => setSecurityAnswer(e.target.value)}
                            style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>New Password</label>
                        <div style={{ position: 'relative' }}>
                          <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                          <input
                            type="password"
                            required
                            placeholder="Minimum 8 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            style={{ width: '100%', paddingLeft: '38px', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>

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
                        }}
                      >
                        {loading ? (
                          <Loader2 size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <>
                            <span>Reset Password</span>
                            <ArrowRight size={16} />
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => { setMode('login'); setForgotStep(1); setError(null); }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: '0.85rem' }}
                    >
                      Back to login
                    </button>
                  </div>
                </div>
              )}

              {/* Toggles */}
              {mode !== 'forgot' && (
                <div style={{ marginTop: '24px', fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  {mode === 'login' ? (
                    <>
                      Don't have an account?{' '}
                      <button
                        onClick={() => { setMode('register'); setError(null); setSuccess(null); }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit' }}
                      >
                        Create one now
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <button
                        onClick={() => { setMode('login'); setError(null); setSuccess(null); }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit' }}
                      >
                        Sign in instead
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Global CSS overrides / enhancements local style */}
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
        
        @media (max-width: 850px) {
          .auth-grid-container {
            grid-template-columns: 1fr !important;
            gap: 30px !important;
          }
          .informative-panel {
            text-align: center;
          }
          .informative-panel div {
            align-items: center !important;
            justify-content: center !important;
          }
        }
      `}</style>
    </div>
  );
};
