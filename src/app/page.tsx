import { CalendarDays, Calculator, Handshake, Map, ShoppingBasket, Wallet } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";

const features = [
  { icon: <ShoppingBasket className="h-6 w-6" />, title: "Vendas fáceis", text: "Tela de vendas com botões grandes, carrinho, descontos e formas de pagamento." },
  { icon: <CalendarDays className="h-6 w-6" />, title: "Agenda de feiras", text: "Calendário e lista com datas, horários, barraca, taxas e situação do pagamento." },
  { icon: <Wallet className="h-6 w-6" />, title: "Financeiro simples", text: "Contas, caixa, contas a pagar e receber, transferências e resultado estimado." },
  { icon: <Calculator className="h-6 w-6" />, title: "Precificação", text: "Calcule o preço com custos, taxas e margem — com a fórmula explicada." },
  { icon: <Map className="h-6 w-6" />, title: "Mapa de barracas", text: "Monte a planta do evento, atribua barracas e evite reservas em conflito." },
  { icon: <Handshake className="h-6 w-6" />, title: "Feirantes e organizadores", text: "Funciona sozinho ou conectado, sempre com aceite e controle do que é compartilhado." },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <div className="awning h-3 w-full" aria-hidden />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Logo href="/" />
        <nav className="flex gap-2">
          <Link href="/login" className="rounded-xl px-4 py-2 font-semibold hover:bg-brand-50">
            Entrar
          </Link>
          <Link href="/cadastro" className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600">
            Criar conta
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="py-10 text-center sm:py-16">
          <p className="mb-3 inline-block rounded-full bg-leaf-100 px-3 py-1 text-sm font-bold text-leaf-700">Para feirantes e organizadores de feiras</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Sua feira organizada, do <span className="text-brand-600">primeiro cliente</span> ao <span className="text-leaf-600">fechamento do caixa</span>.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Agenda, vendas, custos e finanças em um só lugar, com linguagem simples. Funciona no celular, no tablet e no computador.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/cadastro?tipo=vendor" className="rounded-2xl bg-brand-500 px-6 py-4 text-lg font-bold text-white shadow hover:bg-brand-600">
              Sou feirante
            </Link>
            <Link href="/cadastro?tipo=organizer" className="rounded-2xl bg-leaf-500 px-6 py-4 text-lg font-bold text-white shadow hover:bg-leaf-600">
              Organizo feiras
            </Link>
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <div className="mb-2 inline-flex rounded-xl bg-brand-50 p-2 text-brand-600">{f.icon}</div>
              <h2 className="text-lg font-bold">{f.title}</h2>
              <p className="text-sm text-muted">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-line py-6 text-center text-sm text-muted">SR - Feirinhas · Valores em reais · Horário de Brasília</footer>
    </div>
  );
}
