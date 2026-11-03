import { useEffect, useRef, useState } from "react";
import { adminAPI } from "@food/api";
import { Button } from "@food/components/ui/button";
import { Input } from "@food/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";

const messageOf = (error, fallback) => error?.response?.data?.message || fallback;

/**
 * Confirms an admin password change with the code texted to the owner's phone.
 *
 * Open it by passing the passwords the admin typed as `request`. It asks the
 * server for a code, which also checks the current password. A sub-admin needs
 * no code, so the change goes straight through. `onDone` runs once the password
 * has changed; `onError` gets the message when the change cannot start (a wrong
 * current password, say) and the dialog closes.
 */
export default function PasswordOtpDialog({ request, onDone, onError, onClose }) {
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const requestRef = useRef(request);
  requestRef.current = request;

  const changePassword = async (otp) => {
    const { currentPassword, newPassword } = requestRef.current;
    await adminAPI.changePassword(currentPassword, newPassword, otp);
    onDone?.();
  };

  const sendCode = async ({ first }) => {
    const { currentPassword, newPassword } = requestRef.current;
    setSending(true);
    setCodeError("");
    try {
      const res = await adminAPI.requestPasswordChangeOtp(currentPassword, newPassword);
      const data = res?.data?.data || {};
      if (!data.otpRequired) {
        await changePassword("");
        return;
      }
      setSentTo(data.sentTo || "");
      setResendIn(Number(data.resendAfterSeconds) || 30);
      if (!first) toast.success(`New code sent to ${data.sentTo}`);
    } catch (error) {
      const message = messageOf(error, "Could not send the code. Try again.");
      if (first) {
        onError?.(message);
      } else {
        toast.error(message);
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!request) return;
    setSentTo("");
    setCode("");
    setCodeError("");
    setResendIn(0);
    sendCode({ first: true });
    // Only a new request starts a new send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (code.length !== 6) {
      setCodeError("Enter the 6-digit code from the SMS.");
      return;
    }
    setConfirming(true);
    setCodeError("");
    try {
      await changePassword(code);
    } catch (error) {
      setCodeError(messageOf(error, "Could not change the password. Try again."));
    } finally {
      setConfirming(false);
    }
  };

  const busy = sending || confirming;
  const waitingForFirstCode = sending && !sentTo;

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && !busy && onClose?.()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleConfirm} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Confirm password change
            </DialogTitle>
            <DialogDescription>
              {waitingForFirstCode
                ? "Checking your current password and sending a code..."
                : `Enter the 6-digit code sent by SMS to ${sentTo}.`}
            </DialogDescription>
          </DialogHeader>

          {waitingForFirstCode ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setCodeError("");
                }}
                className="text-center text-lg tracking-[0.5em] font-mono tabular-nums"
                aria-invalid={!!codeError}
                aria-describedby="password-otp-error"
              />
              <p id="password-otp-error" className="min-h-[1rem] text-xs text-red-600">
                {codeError}
              </p>
            </div>
          )}

          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || resendIn > 0 || waitingForFirstCode}
              onClick={() => sendCode({ first: false })}
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </Button>
            <Button type="submit" disabled={busy || waitingForFirstCode}>
              {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
