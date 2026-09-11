## Summary

Prompt/recipe inspector with provenance. It is not a second global history: it inspects one stored attempt per workspace folder, using GenerationRecord / prompt-history fields that already exist.

- Original request vs effective prompt; stored guide/policy/provider changes. Missing fields render as unknown. The original is never reconstructed from the output.
- Clone mints a new intent. Transport retry keeps the stored intent. Available params/refs/model are copied; missing refs stay missing and are not replaced by the first catalog item. Model/version mismatches warn. Generate runs only after preflight.
- Compare two attempts. Copy a recipe with canonical refs and no secrets.
- Reload restores the inspected attempt. A workspace switch loads that folder only.

## Tests

```bash
cd ui
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/tsx --tsconfig tsconfig.app.json --import ./tests/setupI18n.ts --test --test-concurrency=1 tests/generationInspector.test.ts tests/generationInspectorUi.test.tsx
npx tsc -b --pretty false
node scripts/check-i18n-catalogs.mjs
```

Ratchet: `BASE_SHA=origin/development HEAD_SHA=HEAD bash scripts/check_code_health_pr_base.sh`

## Integration

- App mounts `GenerationInspectorHost`.
- `resources.ts` namespace is documented in `INTEGRATION.patch` (i18nFoundation freezes NAMESPACES). Feature copy loads the new EN/ES catalogs directly.
- H02 link: `inspectFromActivity(workspace, source)` from execution detail. ActivityFooter is unchanged.

## Pending

- Wire the H02 button in `executionDetail.tsx` after that claim is free.
- Register `generationInspector` in `resources.ts` / `i18nFoundation.test.tsx` when that freeze can move.
