"use client";

import { FormEvent, ReactNode, useId, useState } from "react";
import { ArrowRight, Check, Loader2, Mail, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type WaitlistDialogProps = {
  children: ReactNode;
};

type SubmitState = "idle" | "submitting" | "success" | "error";

export function WaitlistDialog({ children }: WaitlistDialogProps) {
  const emailId = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (nextOpen) {
      setSubmitState("idle");
      setMessage("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setSubmitState("error");
      setMessage("Enter your email address to join the waitlist.");
      return;
    }

    setSubmitState("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "We could not join the waitlist yet.");
      }

      setSubmitState("success");
      setMessage(payload?.message ?? "You're on the waitlist.");
      setEmail("");
    } catch (error) {
      setSubmitState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "We could not join the waitlist yet.",
      );
    }
  };

  const isSubmitting = submitState === "submitting";
  const isSuccess = submitState === "success";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100svh-2rem)] overflow-y-auto border-white/10 bg-black/95 p-0 text-white shadow-2xl shadow-black/60 backdrop-blur-2xl sm:max-w-[520px]"
      >
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 z-20 inline-flex size-10 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Close waitlist form"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogClose>

        <div className="pointer-events-none absolute inset-0 opacity-25">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.16),transparent_42%)]" />
        </div>

        <div className="relative z-10 px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9">
          <DialogHeader className="gap-5 text-left">
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">
              <span className="h-px w-8 bg-white/25" />
              Early access
            </div>
            <div className="space-y-3">
              <DialogTitle className="font-display text-4xl font-normal leading-none tracking-tight text-white sm:text-5xl">
                Join the PRISM waitlist
              </DialogTitle>
              <DialogDescription className="max-w-md text-sm leading-6 text-white/55">
                Be first in line for programmable credit infrastructure on
                Stellar.
              </DialogDescription>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="relative">
              <label htmlFor={emailId} className="sr-only">
                Email address
              </label>
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input
                id={emailId}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting || isSuccess}
                aria-invalid={submitState === "error"}
                className="h-14 rounded-full border-white/10 bg-white/[0.04] pl-12 pr-4 text-base text-white shadow-none placeholder:text-white/30 focus-visible:border-white/35 focus-visible:ring-white/15 md:text-sm"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || isSuccess}
              className="h-14 w-full rounded-full bg-white px-6 text-base text-black hover:bg-white/90 disabled:opacity-80"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Joining
                </>
              ) : isSuccess ? (
                <>
                  <Check className="h-4 w-4" />
                  Joined
                </>
              ) : (
                <>
                  Join Waitlist
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {message ? (
            <p
              role="status"
              className={`mt-4 text-sm ${
                isSuccess ? "text-white/80" : "text-red-300"
              }`}
            >
              {message}
            </p>
          ) : null}

          <div className="mt-8 border-t border-white/10 pt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/35">
            No spam. Launch access and protocol updates only.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
