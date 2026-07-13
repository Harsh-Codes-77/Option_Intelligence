import React, { useState, useEffect } from 'react';
import { useDashboardStore } from '../../store/dashboardStore';
import type { KotakStatus } from '../../store/dashboardStore';

const API_URL = import.meta.env.VITE_API_URL || '';

interface KotakLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthStep = 'INIT' | 'TOTP' | 'MPIN' | 'SUCCESS';

export const KotakLoginModal: React.FC<KotakLoginModalProps> = ({ isOpen, onClose }) => {
  const { kotakStatus, setKotakStatus } = useDashboardStore();
  const [step, setStep] = useState<AuthStep>('INIT');
  const [totp, setTotp] = useState('');
  const [mpin, setMpin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sync component step with actual backend status when modal opens or status updates
  useEffect(() => {
    if (kotakStatus) {
      if (kotakStatus.status === 'CONNECTED') {
        setStep('SUCCESS');
      } else if (kotakStatus.status === 'MPIN_REQUIRED') {
        setStep('MPIN');
      } else if (kotakStatus.status === 'OTP_REQUIRED') {
        setStep('TOTP');
      } else {
        setStep('INIT');
      }
    }
  }, [kotakStatus, isOpen]);

  if (!isOpen) return null;

  // Poll status from backend
  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/kotak/status`);
      if (res.ok) {
        const data: KotakStatus = await res.json();
        setKotakStatus(data);
      }
    } catch (err: any) {
      console.error('Error fetching Kotak status:', err);
    }
  };

  // Step 1: Initialize auth and trigger TOTP
  const handleStartLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/kotak/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setStep('TOTP');
        await checkStatus();
      } else {
        setError(data.message || 'Failed to initialize session');
      }
    } catch (err: any) {
      setError(err.message || 'API request failed');
    } finally {
      setLoading(false);
    }
  };

  // Auto-login flow
  const handleAutoLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/kotak/auto-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg('Auto-login successful!');
        setStep('SUCCESS');
        await checkStatus();
        setTimeout(() => {
          onClose();
          setSuccessMsg(null);
        }, 1500);
      } else {
        setError(data.message || 'Auto-login failed. Please proceed manually.');
      }
    } catch (err: any) {
      setError(err.message || 'Auto-login API request failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify TOTP
  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totp.length !== 6 || isNaN(Number(totp))) {
      setError('TOTP must be a 6-digit number');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/kotak/verify-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totp }),
      });
      const data = await res.json();
      if (data.success) {
        setStep('MPIN');
        await checkStatus();
      } else {
        setError(data.message || 'TOTP verification failed');
      }
    } catch (err: any) {
      setError(err.message || 'TOTP verification API request failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify MPIN
  const handleVerifyMpin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mpin.length !== 6 || isNaN(Number(mpin))) {
      setError('MPIN must be a 6-digit number');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/kotak/verify-mpin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mpin }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || 'Authenticated successfully!');
        setStep('SUCCESS');
        await checkStatus();
        setTimeout(() => {
          onClose();
          setSuccessMsg(null);
        }, 1500);
      } else {
        setError(data.message || 'MPIN validation failed');
      }
    } catch (err: any) {
      setError(err.message || 'MPIN verification API request failed');
    } finally {
      setLoading(false);
    }
  };

  // Disconnect/Logout flow
  const handleLogout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/kotak/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setStep('INIT');
        setTotp('');
        setMpin('');
        await checkStatus();
      } else {
        setError(data.message || 'Logout failed');
      }
    } catch (err: any) {
      setError(err.message || 'Logout API request failed');
    } finally {
      setLoading(false);
    }
  };

  const formatExpiryTime = (ms: number) => {
    if (ms <= 0) return 'Expired';
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)] text-[var(--color-text)] p-6 shadow-2xl relative max-w-md w-full mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔑</span>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Kotak Neo API Session
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-lg font-bold p-1 cursor-pointer">
            &times;
          </button>
        </div>

        {/* Step progress (Only for manual login steps) */}
        {kotakStatus?.status !== 'CONNECTED' && step !== 'SUCCESS' && (
          <div className="flex items-center justify-between mb-6 px-4">
            {[
              { id: 'INIT', label: '1. Access' },
              { id: 'TOTP', label: '2. TOTP' },
              { id: 'MPIN', label: '3. MPIN' },
            ].map((s) => {
              const active = step === s.id;
              const completed = 
                (s.id === 'INIT' && (step === 'TOTP' || step === 'MPIN')) || 
                (s.id === 'TOTP' && step === 'MPIN');
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold ${
                    active ? 'text-[var(--color-accent)]' : completed ? 'text-[var(--color-bullish)]' : 'text-[var(--color-text-muted)]'
                  }`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center rounded-xl z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-t-[var(--color-accent)] border-transparent rounded-full animate-spin" />
              <span className="text-xs text-[var(--color-text-muted)] font-mono">Processing...</span>
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-mono mb-4 flex items-start gap-2 animate-pulse">
            <span className="text-sm">⚠</span>
            <div>
              <strong className="block mb-0.5">Error:</strong>
              <p className="opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Steps Views */}
        
        {/* INIT VIEW */}
        {step === 'INIT' && kotakStatus?.status !== 'CONNECTED' && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-mono">
              Establish a secure session with Kotak Securities Neo API to access real-time options chain and futures basis data.
            </p>

            <div className="border border-[var(--color-border)] bg-[var(--color-surface2)] p-3 rounded-lg flex justify-between items-center text-xs font-mono">
              <span className="text-[var(--color-text-muted)]">Status:</span>
              <span className="text-[var(--color-bearish)] uppercase font-bold tracking-wide">Disconnected</span>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleAutoLogin}
                className="w-full py-2 bg-[var(--color-accent)] hover:bg-blue-600 active:scale-[0.98] text-black font-bold rounded-lg text-xs font-mono transition-all cursor-pointer"
              >
                Auto-Login (Env Credentials)
              </button>
              
              <button
                onClick={handleStartLogin}
                className="w-full py-2 bg-[var(--color-surface2)] hover:bg-[var(--color-border)] active:scale-[0.98] text-[var(--color-text)] border border-[var(--color-border)] font-bold rounded-lg text-xs font-mono transition-all cursor-pointer"
              >
                Start Manual Login Flow
              </button>
            </div>
          </div>
        )}

        {/* TOTP VIEW */}
        {step === 'TOTP' && (
          <form onSubmit={handleVerifyTotp} className="space-y-4">
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-mono">
              Step 2: Enter the 6-digit TOTP code from your Google Authenticator app associated with your Kotak Securities account.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold tracking-wide text-[var(--color-text-muted)] font-mono block">
                Google Authenticator TOTP
              </label>
              <input
                type="text"
                maxLength={6}
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg p-2.5 text-center text-lg font-mono tracking-[0.4em] focus:outline-none focus:border-[var(--color-accent)]"
                autoFocus
                required
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep('INIT')}
                className="flex-1 py-2 border border-[var(--color-border)] text-[var(--color-text)] bg-transparent hover:bg-[var(--color-surface2)] font-bold rounded-lg text-xs font-mono transition-all cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={totp.length !== 6}
                className="flex-1 py-2 bg-[var(--color-accent)] hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-lg text-xs font-mono transition-all cursor-pointer"
              >
                Verify & Continue
              </button>
            </div>
          </form>
        )}

        {/* MPIN VIEW */}
        {step === 'MPIN' && (
          <form onSubmit={handleVerifyMpin} className="space-y-4">
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-mono">
              Step 3: Enter your 6-digit trading MPIN to validate your trading session and generate tokens.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold tracking-wide text-[var(--color-text-muted)] font-mono block">
                6-Digit Trading MPIN
              </label>
              <input
                type="password"
                maxLength={6}
                value={mpin}
                onChange={(e) => setMpin(e.target.value.replace(/\D/g, ''))}
                placeholder="******"
                className="w-full bg-[var(--color-surface2)] border border-[var(--color-border)] rounded-lg p-2.5 text-center text-lg font-mono tracking-[0.4em] focus:outline-none focus:border-[var(--color-accent)]"
                autoFocus
                required
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep('TOTP')}
                className="flex-1 py-2 border border-[var(--color-border)] text-[var(--color-text)] bg-transparent hover:bg-[var(--color-surface2)] font-bold rounded-lg text-xs font-mono transition-all cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={mpin.length !== 6}
                className="flex-1 py-2 bg-[var(--color-accent)] hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-lg text-xs font-mono transition-all cursor-pointer"
              >
                Complete Authentication
              </button>
            </div>
          </form>
        )}

        {/* SUCCESS / CONNECTED VIEW */}
        {(step === 'SUCCESS' || kotakStatus?.status === 'CONNECTED') && (
          <div className="space-y-4">
            {successMsg && (
              <div className="bg-[var(--color-bullish)]/10 border border-[var(--color-bullish)]/20 text-[var(--color-bullish)] p-3 rounded-lg text-xs font-mono text-center mb-2 animate-bounce">
                🎉 {successMsg}
              </div>
            )}

            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-mono">
              You have an active trading session with Kotak Securities Neo. Live index quotes, websocket updates, and options chain metrics are enabled.
            </p>

            <div className="border border-[var(--color-border)] bg-[var(--color-surface2)] p-4 rounded-lg space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)]">Status:</span>
                <span className="text-[var(--color-bullish)] font-bold uppercase tracking-wide">Connected</span>
              </div>
              {kotakStatus?.expiresIn && kotakStatus.expiresIn > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-text-muted)]">Session Expiry:</span>
                  <span className="text-[var(--color-text)] font-semibold tabular-nums">
                    {formatExpiryTime(kotakStatus.expiresIn)}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={handleLogout}
                className="w-full py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 active:scale-[0.98] text-[var(--color-bearish)] font-bold rounded-lg text-xs font-mono transition-all cursor-pointer"
              >
                Terminate Session (Logout)
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  );
};
