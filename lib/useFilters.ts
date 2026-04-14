"use client";

import { useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Category } from "@/lib/types";

const ALL = "הכל";

export interface FilterState {
  group: string;
  category: string;
  classification: string;
  search: string;
}

export interface FilterOptions {
  groups: string[];
  categories: string[];
  classifications: string[];
}

/**
 * Hook for cascading 3-level filters synced with URL params.
 * Level 1: קבוצה (group)       = category.parentSection
 * Level 2: קטגוריה (category)   = category.name
 * Level 3: סיווג (classification) = fund.classification
 */
export function useFilters(categories: Category[]) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read current filters from URL
  const group = searchParams.get("group") || ALL;
  const category = searchParams.get("category") || ALL;
  const classification = searchParams.get("cls") || ALL;
  const search = searchParams.get("q") || "";

  // Derive cascading options from data
  const options = useMemo<FilterOptions>(() => {
    const groupSet = new Set<string>();
    const catSet = new Set<string>();
    const clsSet = new Set<string>();

    for (const cat of categories) {
      const section = cat.parentSection || "כללי";
      groupSet.add(section);

      // Categories: only from matching group
      if (group === ALL || section === group) {
        catSet.add(cat.name || "כללי");

        // Classifications: only from matching group+category
        if (category === ALL || cat.name === category) {
          for (const f of cat.funds) {
            if (f.classification) clsSet.add(f.classification);
          }
        }
      }
    }

    return {
      groups: Array.from(groupSet),
      categories: Array.from(catSet),
      classifications: Array.from(clsSet).sort(),
    };
  }, [categories, group, category]);

  // Update URL params (preserves existing params like client)
  const setFilter = useCallback(
    (field: "group" | "category" | "classification" | "search", value: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (field === "search") {
        if (value) params.set("q", value); else params.delete("q");
      } else if (value === ALL) {
        params.delete(field === "classification" ? "cls" : field);
      } else {
        params.set(field === "classification" ? "cls" : field, value);
      }

      // Cascading reset: changing group → reset category + classification
      if (field === "group") {
        params.delete("category");
        params.delete("cls");
      }
      // Changing category → reset classification
      if (field === "category") {
        params.delete("cls");
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  // Guard: if group/category in URL don't exist in options, clear them
  useEffect(() => {
    if (categories.length === 0) return; // data not loaded yet
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    if (group !== ALL && !options.groups.includes(group)) {
      params.delete("group");
      params.delete("category");
      params.delete("cls");
      changed = true;
    } else if (category !== ALL && !options.categories.includes(category)) {
      params.delete("category");
      params.delete("cls");
      changed = true;
    }
    if (changed) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [categories.length, group, category, options.groups, options.categories, searchParams, router, pathname, ALL]);

  // Clear all filters
  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("group");
    params.delete("category");
    params.delete("cls");
    params.delete("q");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, router, pathname]);

  // Filter categories + funds based on current selection + search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return categories
      .filter((cat) => {
        const section = cat.parentSection || "כללי";
        if (group !== ALL && section !== group) return false;
        if (category !== ALL && cat.name !== category) return false;
        return true;
      })
      .map((cat) => ({
        ...cat,
        funds: cat.funds.filter((f) => {
          // Classification filter
          if (classification !== ALL && f.classification !== classification) return false;
          // Search filter
          if (q) {
            return (
              f.name.toLowerCase().includes(q) ||
              (f.manager && f.manager.toLowerCase().includes(q)) ||
              (f.classification && f.classification.toLowerCase().includes(q))
            );
          }
          return true;
        }),
      }));
  }, [categories, group, category, classification, search]);

  // Count active filters (for badge)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (group !== ALL) count++;
    if (category !== ALL) count++;
    if (classification !== ALL) count++;
    if (search.length > 0) count++;
    return count;
  }, [group, category, classification, search]);

  return {
    group,
    category,
    classification,
    search,
    options,
    setFilter,
    clearAll,
    filtered,
    activeFilterCount,
    ALL,
  };
}
