# AI Development Rules — מעקב קרנות

## Critical Rules

### Print Layout
1. **NEVER use flexbox for RTL print headers** — Use inner `<table>` with 3 cells instead
2. **NEVER use `ResponsiveContainer`** in print — Uses ResizeObserver which doesn't work; use fixed `width`/`height`
3. **NEVER use CSS variables in SVG elements** — They don't resolve in print; always use hardcoded hex colors
4. **NEVER use `tfoot` with `.print-only`** — Conflicts with `display: revert` CSS rule; use `position: fixed` footer div
5. **ALWAYS put print headers inside `<thead>`** — Required for browser to repeat on every page
6. **ALWAYS add spacer rows** after header border — Content must not touch the header line

### Header Structure (Canonical)
Both report and charts MUST use this exact structure:
```tsx
<thead>
  <tr>
    <td style={{ padding: 0, borderBottom: `2px solid ${brand.secondaryColor}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody><tr>
          <td style={{ width: "120px", textAlign: "right" }}>  {/* Date */}
          <td style={{ textAlign: "center" }}>                 {/* Title */}
          <td style={{ width: "120px", textAlign: "left" }}>   {/* Logo */}
        </tr></tbody>
      </table>
    </td>
  </tr>
  <tr><td style={{ height: 14 }} /></tr>  {/* Spacer */}
</thead>
```

### Footer Structure (Canonical)
```tsx
<div className="print-footer">  {/* CSS: position: fixed; bottom: 0 */}
  <div>{brand.footerDisclaimer}</div>
  <div>© {year} {brand.fullName}</div>
</div>
```

### Colors (Hardcoded for Print)
| Purpose | Hex |
|---------|-----|
| Text primary | `#1a1f2b` |
| Text secondary | `#5a6577` |
| Text muted | `#8893a4` |
| Border / grid | `#d1d5db` |
| Positive return | `#0d7c4a` |
| Negative return | `#c42b2b` |

### Multi-Client
1. Client key comes from URL: `?client=nox` or `?client=green`
2. Data stored in `data/{clientKey}/funds.json` and `data/{clientKey}/brand.json`
3. Auth via sessionStorage: key = `client-auth-{clientKey}`, value = `"1"`
4. Admin password stored in `funds.json` as `adminPassword` field

### General
1. **Test print changes** with Ctrl+P in browser — screenshots alone may not catch all issues
2. **Kill old dev servers** before starting new ones — port 3000 conflicts are common
3. **Clear `.next` cache** when CSS changes don't take effect — `rm -rf .next`
4. **RTL direction** affects flex order — elements appear reversed from LTR expectations
5. **This app serves top-tier clients** — print output must be pixel-perfect and professional
6. **Think before acting** — Plan changes carefully, don't iterate blindly

### CSS Print Rules
- `@page { size: A4 landscape }` — default for report
- `@page { size: A4 portrait }` — override in charts page via inline `<style>`
- `margin: 6mm 6mm 14mm 6mm` — extra bottom margin for fixed footer
- `tr { page-break-inside: avoid }` — prevent row splitting
- `-webkit-print-color-adjust: exact` — force browser to print background colors

### File Naming & Structure
- Pages in `app/` directory (Next.js App Router)
- Components in `components/`
- Utilities in `lib/`
- Config types in `config/`
- Client data in `data/{clientKey}/`
- No README.md files unless explicitly requested
