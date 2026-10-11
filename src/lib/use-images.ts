"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase/client";

/** Gera URLs temporárias para imagens privadas (bucket separado por empresa). */
export function useSignedUrls(paths: (string | null | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.filter(Boolean).sort().join("|");
  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) return;
    getSupabase()
      .storage.from("product-images")
      .createSignedUrls(list, 60 * 60)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        data?.forEach((d) => {
          if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
        });
        setUrls(map);
      });
  }, [key]);
  return urls;
}

export async function uploadProductImage(companyId: string, file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use imagens JPG, PNG ou WEBP.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getSupabase().storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
