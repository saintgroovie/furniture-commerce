# Package B.6 — Admin Vite HMR notes

## Status

Custom plugin **kept**: `apps/backend/src/admin/vite/disable-hmr-plugin.ts`  
Default: HMR **disabled** (`ADMIN_VITE_HMR` unset).  
Re-enable only with `ADMIN_VITE_HMR=1`.

## Why it stays

With HMR enabled, Vite/esbuild transforms of Woodright Admin extensions fail:

```text
The symbol "inWebWorker" has already been declared
The symbol "prevRefreshReg" has already been declared
The symbol "prevRefreshSig" has already been declared
```

Failed transforms are served as `text/html`, which blanks module loading for the Admin graph that includes those extensions.

This is **not** the original stock white-screen root cause (missing `@medusajs/admin-sdk` for draft-order). It is a separate Package B extension + React Refresh interaction.

## QA workaround

Use full page reload instead of HMR while developing Admin extensions. Do not replace the plugin with broad Vite aliases.
