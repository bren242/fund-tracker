"use client";

import { useEffect, useState } from "react";
import { BrandConfig, DEFAULT_BRAND } from "@/config/brand";

/** Per-client cache */
const cache: Record<string, BrandConfig> = {};

export function useBrand(clientKey: string = "nox"): BrandConfig {
  const [brand, setBrand] = useState<BrandConfig>(cache[clientKey] || DEFAULT_BRAND);

  useEffect(() => {
    if (cache[clientKey]) {
      setBrand(cache[clientKey]);
      return;
    }
    fetch(`/api/brand?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then((b: BrandConfig) => {
        // Ensure features has defaults for older configs that lack it
        if (!b.features) {
          b.features = { comparison: true, chartPage: true };
        }
        cache[clientKey] = b;
        setBrand(b);
      })
      .catch(() => {});
  }, [clientKey]);

  return brand;
}

/** Invalidate cache after saving (call from admin) */
export function invalidateBrandCache(clientKey?: string) {
  if (clientKey) {
    delete cache[clientKey];
  } else {
    for (const key of Object.keys(cache)) {
      delete cache[key];
    }
  }
}
