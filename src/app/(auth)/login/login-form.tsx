"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, User } from "lucide-react";
import { login, type LoginState } from "@/lib/auth/actions";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Usuário</span>
        <span className="relative flex items-center">
          <User className="pointer-events-none absolute left-3.5 size-4 text-cream/45" aria-hidden />
          <input
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            defaultValue={state.username}
            className="h-12 w-full rounded-xl bg-black/35 pl-10 pr-3 text-sm text-cream outline-none ring-1 ring-white/10 transition placeholder:text-cream/30 focus:ring-2 focus:ring-gold/70"
            placeholder="Seu usuário"
          />
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted">Senha</span>
        <span className="relative flex items-center">
          <LockKeyhole className="pointer-events-none absolute left-3.5 size-4 text-cream/45" aria-hidden />
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-12 w-full rounded-xl bg-black/35 pl-10 pr-11 text-sm text-cream outline-none ring-1 ring-white/10 transition placeholder:text-cream/30 focus:ring-2 focus:ring-gold/70"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 rounded-lg p-2 text-cream/50 transition hover:text-cream"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </span>
      </label>

      {state.error && (
        <p role="alert" className="rounded-xl bg-live/15 px-3.5 py-2.5 text-sm text-[#ff9a8f] ring-1 ring-live/30">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-gold text-sm font-semibold text-ink shadow-lg shadow-black/30 transition hover:bg-gold-soft disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
