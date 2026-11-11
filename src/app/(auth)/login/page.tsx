import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Mascote ao fundo */}
      <Image
        src="/brand/ajac-jaguar.png"
        alt=""
        width={1200}
        height={658}
        priority
        className="pointer-events-none absolute -bottom-10 -right-24 w-[46rem] max-w-none opacity-[0.12] blur-[1px] sm:-right-10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(700px_420px_at_50%_30%,rgba(212,175,55,0.18),transparent_70%)]"
      />

      <div className="fade-in relative w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/brand/ajac-badge.png"
            alt="AJAC"
            width={600}
            height={664}
            priority
            className="w-28 drop-shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
          />
          <h1 className="mt-5 flex items-center gap-2">
            <Image src="/brand/ajac-wordmark.png" alt="AJAC" width={700} height={197} className="h-8 w-auto" />
            <span className="rounded-md bg-gold px-1.5 py-0.5 font-display text-base leading-none text-ink">TV</span>
          </h1>
          <p className="mt-3 text-sm text-muted">Entre para assistir aos seus canais.</p>
        </div>

        <div className="mt-8 rounded-[2rem] bg-panel/90 p-6 shadow-2xl shadow-black/50 ring-1 ring-line backdrop-blur sm:p-7">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted/70">
          <span className="live-dot size-1.5 rounded-full bg-live" />
          Acesso restrito
        </p>
      </div>
    </main>
  );
}
