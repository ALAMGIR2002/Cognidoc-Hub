"use client";

import { X, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

export interface UserProfile {
  username: string;
  email: string;
  phoneNumber?: string;
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [activeTab, setActiveTab] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"send" | "verify">("send");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  // Resend OTP countdown timer logic
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  if (!isOpen) return null;

  const getIdentifier = () => {
    return activeTab === "email" ? email : phone;
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    const identifier = getIdentifier();
    if (!identifier) {
      setError(`Please enter your ${activeTab === "email" ? "email address" : "phone number"}.`);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          type: activeTab,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send verification code.");
      }

      setStep("verify");
      setSuccessMessage(data.message || `Verification code sent to ${identifier}`);
      setResendTimer(60); // 60 seconds cooldown for resending
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const identifier = getIdentifier();

    if (!otp || otp.length !== 6) {
      setError("Please enter a valid 6-digit verification code.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          otp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid verification code.");
      }

      // Store in localStorage for persistence (mimicking previous session persistence)
      localStorage.setItem("cognidoc_current_user", JSON.stringify(data.user));

      onSuccess(data.user);
      onClose();
      // Reset state for next open
      setStep("send");
      setOtp("");
      setEmail("");
      setPhone("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || loading) return;
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    const identifier = getIdentifier();

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          type: activeTab,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend verification code.");
      }

      setSuccessMessage(data.message || `New code sent to ${identifier}`);
      setResendTimer(60);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to resend code.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-card__header">
          <h3 className="modal-card__title">
            {step === "send" ? "Sign In / Register" : "Verify Account"}
          </h3>
          <button type="button" className="modal-card__close" onClick={onClose} disabled={loading}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-card__body">
          {/* Active Mode Tabs (Only visible when entering identifier) */}
          {step === "send" && (
            <div className="tabs" style={{ marginBottom: "1.25rem", display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className={`tab ${activeTab === "email" ? "tab--active" : ""}`}
                style={{ flex: 1 }}
                onClick={() => {
                  setActiveTab("email");
                  setError(null);
                }}
              >
                Email
              </button>
              <button
                type="button"
                className={`tab ${activeTab === "phone" ? "tab--active" : ""}`}
                style={{ flex: 1 }}
                onClick={() => {
                  setActiveTab("phone");
                  setError(null);
                }}
              >
                Phone Number
              </button>
            </div>
          )}

          {error && (
            <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          )}

          {successMessage && (
            <div className="alert alert--success" style={{ marginBottom: "1rem", color: "var(--accent)", border: "1px solid var(--accent)" }}>
              {successMessage}
            </div>
          )}

          <form onSubmit={step === "send" ? handleSendOTP : handleVerifyOTP}>
            {step === "send" ? (
              activeTab === "email" ? (
                <label className="field" style={{ marginBottom: "1.25rem" }}>
                  <span className="field__label">Email Address</span>
                  <input
                    type="email"
                    className="input"
                    placeholder="e.g. john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </label>
              ) : (
                <label className="field" style={{ marginBottom: "1.25rem" }}>
                  <span className="field__label">Phone Number</span>
                  <input
                    type="tel"
                    className="input"
                    placeholder="e.g. +1234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                    Please use the international format (e.g. +14155552671).
                  </span>
                </label>
              )
            ) : (
              <label className="field" style={{ marginBottom: "1.25rem" }}>
                <span className="field__label">Enter the 6-digit Verification Code sent to {getIdentifier()}</span>
                <input
                  type="text"
                  maxLength={6}
                  pattern="\d{6}"
                  className="input"
                  placeholder="••••••"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  disabled={loading}
                  style={{
                    textAlign: "center",
                    fontSize: "1.5rem",
                    letterSpacing: "0.25em",
                    fontWeight: "bold",
                    marginTop: "0.5rem"
                  }}
                  autoFocus
                />
              </label>
            )}

            <button
              type="submit"
              className="btn btn--primary"
              style={{
                width: "100%",
                padding: "0.75rem",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "0.5rem"
              }}
              disabled={loading}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {step === "send"
                ? "Send OTP"
                : "Verify & Login"}
            </button>

            {step === "verify" && (
              <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ width: "100%", fontSize: "0.8rem", padding: "0.5rem" }}
                  onClick={handleResend}
                  disabled={resendTimer > 0 || loading}
                >
                  {resendTimer > 0 ? `Resend Code in ${resendTimer}s` : "Resend OTP"}
                </button>

                <button
                  type="button"
                  className="link-muted"
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem" }}
                  onClick={() => {
                    setStep("send");
                    setOtp("");
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  disabled={loading}
                >
                  Change Email / Phone Number
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
