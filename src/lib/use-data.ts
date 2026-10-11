"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "./errors";

/** Carrega dados de forma assíncrona com estado de carregamento, erro e recarga. */
export function useData<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const run = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const d = await loader();
      if (my === seq.current) setData(d);
    } catch (e) {
      if (my === seq.current) setError(friendlyError(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, error, loading, reload: run, setData };
}

/** Lança o erro do Supabase (para usar com useData/try-catch). */
export function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

/** Gera uma chave única para evitar operações duplicadas em cliques repetidos. */
export function newIdempotencyKey(prefix = "op"): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `${prefix}-${rand}`;
}
