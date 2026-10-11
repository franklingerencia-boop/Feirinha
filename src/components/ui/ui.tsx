"use client";

import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { centsToInput, parseBRL } from "@/lib/money";

export const cx = clsx;

/* ------------------------------------------------------------------ Botões */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm",
  secondary: "bg-white text-ink border border-line hover:bg-brand-50",
  ghost: "text-ink hover:bg-brand-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-leaf-500 text-white hover:bg-leaf-600",
};
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4", lg: "h-14 px-6 text-lg" };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof sizes;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  icon,
}: {
  href: string;
  variant?: Variant;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ Campos */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  required,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  required?: boolean;
}) {
  const text = (
    <span className="text-sm font-semibold text-ink">
      {label}
      {required && <span className="text-brand-600"> *</span>}
    </span>
  );
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {htmlFor ? (
        <>
          <label htmlFor={htmlFor}>{text}</label>
          {children}
        </>
      ) : (
        // Rótulo envolvendo o campo: associação implícita para leitores de tela
        <label className="flex flex-col gap-1">
          {text}
          {children}
        </label>
      )}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-line bg-white px-3 text-base text-ink placeholder:text-muted/70 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-stone-100";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(inputBase, "h-11", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cx(inputBase, "py-2", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx(inputBase, "h-11 pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

/** Campo de valor em reais. Guarda centavos (inteiros). */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder = "0,00",
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  value: number | null;
  onChange: (cents: number | null) => void;
  id?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(centsToInput(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(centsToInput(value));
      last.current = value;
    }
  }, [value]);
  return (
    <div className={cx("relative", className)}>
      <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
      <input
        id={id}
        inputMode="decimal"
        aria-label={ariaLabel}
        className={cx(inputBase, "h-11 pl-10")}
        value={text}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const cents = parseBRL(e.target.value);
          last.current = cents;
          onChange(cents);
        }}
        onBlur={() => {
          if (value != null) setText(centsToInput(value));
        }}
      />
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0 rounded accent-brand-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ Layout */
export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const tones = {
  neutral: "bg-stone-100 text-stone-700",
  info: "bg-sky-100 text-sky-800",
  success: "bg-leaf-100 text-leaf-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  brand: "bg-brand-100 text-brand-800",
};
export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: keyof typeof tones; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-brand-500">{icon}</div>}
      <p className="text-lg font-bold">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "good" | "bad" | "brand";
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && <span className="text-brand-500">{icon}</span>}
      </div>
      <p
        className={cx(
          "mt-1 text-2xl font-extrabold tabular-nums",
          tone === "good" && "text-leaf-600",
          tone === "bad" && "text-red-700",
          tone === "brand" && "text-brand-600",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition",
            value === t.value ? "bg-brand-500 text-white" : "text-muted hover:bg-brand-50",
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1 opacity-80">({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Diálogos */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx("m-auto w-[calc(100%-1.5rem)] rounded-2xl bg-white p-0 text-ink shadow-xl", width)}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 id="modal-title" className="text-lg font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-2xl leading-none text-muted hover:bg-brand-50" aria-label="Fechar">
              ×
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  tone = "danger",
  onConfirm,
  onClose,
  requireReason,
  reasonLabel = "Motivo",
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
  requireReason?: boolean;
  reasonLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          <Button
            variant={tone}
            loading={busy}
            disabled={requireReason && reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div>{message}</div>
        {requireReason && (
          <Field label={reasonLabel} required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

export function InfoBox({ children, tone = "info", title }: { children: ReactNode; tone?: "info" | "warning" | "success" | "danger"; title?: string }) {
  const t = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-leaf-100 bg-leaf-50 text-leaf-700",
    danger: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  return (
    <div className={cx("rounded-xl border p-3 text-sm", t)}>
      {title && <p className="mb-1 font-bold">{title}</p>}
      {children}
    </div>
  );
}

/** Tabela responsiva simples */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx("border-b border-line px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted", className)}>{children}</th>;
}
export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cx("border-b border-line/70 px-3 py-2 align-top", className)}>{children}</td>;
}
