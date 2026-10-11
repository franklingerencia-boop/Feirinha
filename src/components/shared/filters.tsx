"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/ui";
import { periodRange, type PeriodKey } from "@/lib/dates";

export function usePeriod(tz: string, initial: PeriodKey = "this_month") {
  const [key, setKey] = useState<PeriodKey>(initial);
  const [custom, setCustom] = useState(periodRange("this_month", tz));
  const range = key === "custom" ? custom : periodRange(key, tz);
  return { key, setKey, range, custom, setCustom };
}

export function PeriodFilter({ period }: { period: ReturnType<typeof usePeriod> }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="Período" className="min-w-40">
        <Select value={period.key} onChange={(e) => period.setKey(e.target.value as PeriodKey)}>
          <option value="this_month">Este mês</option>
          <option value="last_month">Mês passado</option>
          <option value="last_30">Últimos 30 dias</option>
          <option value="this_year">Este ano</option>
          <option value="custom">Personalizado</option>
        </Select>
      </Field>
      {period.key === "custom" && (
        <>
          <Field label="De">
            <Input type="date" value={period.custom.from} onChange={(e) => period.setCustom({ ...period.custom, from: e.target.value })} />
          </Field>
          <Field label="Até">
            <Input type="date" value={period.custom.to} onChange={(e) => period.setCustom({ ...period.custom, to: e.target.value })} />
          </Field>
        </>
      )}
    </div>
  );
}
