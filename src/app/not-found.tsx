import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-20 text-center">
      <Image src="/brand/ajac-jaguar.png" alt="" width={1200} height={658} className="w-72 opacity-90" />
      <h1 className="mt-6 font-display text-4xl tracking-wide">Fora do ar</h1>
      <p className="mt-2 text-muted">Esta página não existe ou saiu da grade.</p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-soft"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
