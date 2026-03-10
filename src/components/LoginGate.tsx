import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toSmartTitleCase, toSmartTitleCaseLive } from "@/lib/text-format";

interface LoginGateProps {
  onLogin: (remember: boolean) => void;
}

const VALID_USERNAME = "Web Master";
const VALID_PASSWORD = "LookUp!";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

export function LoginGate({ onLogin }: LoginGateProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [lockedUntil]);

  const lockSecondsRemaining = useMemo(() => {
    if (!lockedUntil) return 0;
    return Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  }, [lockedUntil, now]);

  useEffect(() => {
    if (!lockedUntil) return;
    if (Date.now() >= lockedUntil) {
      setLockedUntil(null);
      setFailedAttempts(0);
      setError("");
    }
  }, [lockedUntil, now]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (lockedUntil && Date.now() < lockedUntil) {
      setError(`Too many attempts. Try again in ${lockSecondsRemaining}s.`);
      return;
    }

    if (toSmartTitleCase(username) !== VALID_USERNAME || password !== VALID_PASSWORD) {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = Date.now() + LOCKOUT_MS;
        setLockedUntil(lockUntil);
        setError(`Too many attempts. Try again in ${Math.ceil(LOCKOUT_MS / 1000)}s.`);
        return;
      }
      setError(`Invalid username or password. (${MAX_FAILED_ATTEMPTS - nextAttempts} attempts left)`);
      return;
    }

    setFailedAttempts(0);
    setLockedUntil(null);
    setError("");
    onLogin(rememberMe);
  };

  return (
    <div className="lobby-sky relative min-h-screen overflow-hidden">
      <div className="lobby-nebula lobby-nebula-a" />
      <div className="lobby-nebula lobby-nebula-b" />
      <div className="lobby-nebula lobby-nebula-c" />
      <div className="lobby-haze" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <form
          onSubmit={handleSubmit}
          className="lobby-panel relative w-full max-w-md overflow-hidden rounded-[28px] px-7 py-8"
        >
          <div className="lobby-panel-glow" />
          <div className="lobby-panel-noise" />
          <div className="lobby-panel-edge" />

          <div className="relative z-10">
            <p className="lobby-kicker mb-2">Delphi Access</p>
            <h1 className="lobby-title text-[2rem]">Login</h1>
            <p className="lobby-copy mt-2">
              Enter your credentials to unlock Delphi.
            </p>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/85">Username</p>
                <Input
                  value={username}
                  onChange={(event) => setUsername(toSmartTitleCaseLive(event.target.value))}
                  onBlur={(event) => setUsername(toSmartTitleCase(event.target.value))}
                  autoComplete="username"
                  placeholder="Enter username"
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/85">Password</p>
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter password"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <label htmlFor="remember-me" className="text-sm text-white/90">
                Remember me
              </label>
            </div>

            {error ? <p className="mt-3 text-sm text-red-200">{error}</p> : null}

            <Button type="submit" className="lobby-cta mt-6 h-11 w-full rounded-full text-base font-semibold">
              Enter Delphi
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
