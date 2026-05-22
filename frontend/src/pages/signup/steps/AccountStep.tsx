import { useState, type FormEvent } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { signup } from "@/services/onboardingApi";

interface Props {
  initialBrandName?: string;
  onComplete: (brandName: string) => void;
}

export function AccountStep({ initialBrandName, onComplete }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [brandName, setBrandName] = useState(initialBrandName || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    email.includes("@") &&
    password.length >= 8 &&
    password === confirm &&
    brandName.trim().length > 0 &&
    !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signup({
        email: email.trim().toLowerCase(),
        password,
        brand_name: brandName.trim(),
      });
      onComplete(brandName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <Eyebrow>// step 01 · account</Eyebrow>
        <Heading as={1} size="hero">
          let's get you <Highlight color="amber">set up</Highlight>
        </Heading>
        <p
          className="text-base text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          // 30 seconds. email + password + brand. you can change everything later.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">work email</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@brand.com"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="repeat it"
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="brand">brand name</Label>
          <Input
            id="brand"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="OMI Bags · 欧米箱包"
            required
          />
          <span
            className="text-xs text-[var(--color-text-subtle)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // the brand you want to track signals for
          </span>
        </div>

        {error && (
          <div
            className="text-sm text-[var(--color-danger)] border-l-2 border-[var(--color-danger)] pl-3 py-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // {error}
          </div>
        )}

        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={!canSubmit}
          className="w-full md:w-auto md:self-start"
        >
          {submitting ? "creating account…" : "→ continue"}
        </Button>
      </form>
    </div>
  );
}
