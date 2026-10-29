import { useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Key,
  ArrowRight,
  ShieldCheck,
  Loader2,
  Sparkles,
  ChevronLeft,
} from 'lucide-react';
import type { NothingUser } from '@/types';
import { loginWithCredentials, verifyOtp, loginWithToken } from '@/lib/nothing-auth';
import { syncNothingCloud } from '@/lib/sync-engine';

interface LoginViewProps {
  onLoginSuccess: (user: NothingUser) => void;
}

type LoginTab = 'email' | 'token';

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [activeTab, setActiveTab] = useState<LoginTab>('email');

  // Email & Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 2FA OTP state
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Token state
  const [tokenInput, setTokenInput] = useState('');

  // Status
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusText('Authenticating with Nothing SSO...');

    try {
      const res = await loginWithCredentials(email.trim(), password.trim());

      if (res.requiresOtp && res.sessionId) {
        setIsOtpStep(true);
        setOtpSessionId(res.sessionId);
        setMaskedEmail(res.maskedEmail || email);
        setIsLoading(false);
        setStatusText(null);
        return;
      }

      if (!res.success || !res.user) {
        throw new Error(res.error || 'Authentication failed');
      }

      setStatusText('Syncing your Nothing Space...');
      await syncNothingCloud(res.user).catch(() => {});
      onLoginSuccess(res.user);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || 'Login failed');
    } finally {
      setIsLoading(false);
      setStatusText(null);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusText('Verifying OTP code...');

    try {
      const res = await verifyOtp(otpSessionId, otpCode.trim());

      if (!res.success || !res.user) {
        throw new Error(res.error || 'Verification failed');
      }

      setStatusText('Syncing your Nothing Space...');
      await syncNothingCloud(res.user).catch(() => {});
      onLoginSuccess(res.user);
    } catch (err: any) {
      console.error('OTP error:', err);
      setError(err?.message || 'Invalid code');
    } finally {
      setIsLoading(false);
      setStatusText(null);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setError('Please paste your Nothing Bearer token.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusText('Validating token with Nothing Cloud...');

    try {
      const res = await loginWithToken(tokenInput.trim());

      if (!res.success || !res.user) {
        throw new Error(res.error || 'Invalid token format');
      }

      setStatusText('Syncing your Nothing Space...');
      await syncNothingCloud(res.user).catch(() => {});
      onLoginSuccess(res.user);
    } catch (err: any) {
      console.error('Token error:', err);
      setError(err?.message || 'Token sign-in failed');
    } finally {
      setIsLoading(false);
      setStatusText(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-[#E6E6E6] flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* Brand Header */}
        <div className="text-center flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Essential Space" className="w-14 h-14 mb-1" />
          <h1 className="font-dot text-2xl tracking-widest text-white font-semibold">
            ESSENTIAL SPACE
          </h1>
          <p className="font-mono text-xs text-nothing-gray uppercase tracking-widest">
            Desktop Companion
          </p>
        </div>

        {/* Card Container */}
        <div className="w-full rounded-2xl bg-nothing-card border border-nothing-border p-6 shadow-2xl flex flex-col gap-5">
          {!isOtpStep ? (
            <>
              {/* Tab Selector */}
              <div className="flex rounded-xl bg-nothing-dark p-1 border border-nothing-border">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('email');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg font-dot text-xs tracking-wider transition-all ${
                    activeTab === 'email'
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-nothing-gray hover:text-white'
                  }`}
                >
                  ACCOUNT SSO
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('token');
                    setError(null);
                  }}
                  className={`flex-1 py-2 rounded-lg font-dot text-xs tracking-wider transition-all ${
                    activeTab === 'token'
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-nothing-gray hover:text-white'
                  }`}
                >
                  TOKEN SIGN-IN
                </button>
              </div>

              {activeTab === 'email' ? (
                <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-4">
                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-nothing-gray">Nothing Account Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-3.5 text-nothing-gray" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-nothing-dark border border-nothing-border text-sm text-white placeholder-nothing-gray focus:outline-none focus:border-white font-mono"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-nothing-gray">Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-3.5 text-nothing-gray" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-nothing-dark border border-nothing-border text-sm text-white placeholder-nothing-gray focus:outline-none focus:border-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute right-3.5 top-3.5 text-nothing-gray hover:text-white"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 mt-2 rounded-xl bg-white hover:bg-neutral-200 text-black font-dot text-xs tracking-wider font-semibold transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-black" />
                        <span>AUTHENTICATING...</span>
                      </>
                    ) : (
                      <>
                        <span>CONTINUE WITH SSO</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleTokenSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-nothing-gray">Nothing Bearer Token</label>
                    <textarea
                      rows={4}
                      required
                      value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      placeholder="eyJhbGciOiJSUzI1NiIs..."
                      className="w-full p-3 rounded-xl bg-nothing-dark border border-nothing-border text-xs text-white placeholder-nothing-gray focus:outline-none focus:border-white font-mono resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-dot text-xs tracking-wider font-semibold transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-black" />
                        <span>SIGNING IN...</span>
                      </>
                    ) : (
                      <>
                        <span>SIGN IN WITH TOKEN</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </form>
              )}
            </>
          ) : (
            /* 2FA OTP Step */
            <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOtpStep(false)}
                  className="p-1 rounded-lg text-nothing-gray hover:text-white"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex flex-col">
                  <span className="font-dot text-xs text-white uppercase tracking-wider font-semibold">
                    TWO-FACTOR VERIFICATION
                  </span>
                  <span className="text-[11px] font-mono text-nothing-gray">
                    Sent to {maskedEmail}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono text-nothing-gray">6-Digit Code</label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={otpCode}
                  onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full py-3 text-center tracking-[0.5em] text-lg rounded-xl bg-nothing-dark border border-nothing-border text-white placeholder-nothing-gray focus:outline-none focus:border-white font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-dot text-xs tracking-wider font-semibold transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-black" />
                    <span>VERIFYING...</span>
                  </>
                ) : (
                  <>
                    <span>VERIFY & SIGN IN</span>
                    <ShieldCheck size={14} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Status Text */}
          {statusText && (
            <div className="flex items-center gap-2 text-xs font-mono text-white/90 animate-pulse">
              <Loader2 size={13} className="animate-spin text-nothing-red" />
              <span>{statusText}</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-xs font-mono text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Security Notice */}
        <p className="text-[11px] font-mono text-center text-nothing-gray/70">
          Client-first architecture. Encrypted locally and synced directly to Nothing Cloud over native OS sockets.
        </p>
      </div>
    </div>
  );
}
