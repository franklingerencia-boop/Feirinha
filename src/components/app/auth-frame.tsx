import { Logo } from "./logo";

export function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="awning h-3 w-full" aria-hidden />
      <div className="mx-auto flex max-w-md flex-col px-4 py-8">
        <div className="mb-6 flex justify-center">
          <Logo href="/" />
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
          <h1 className="mb-4 text-2xl font-extrabold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
