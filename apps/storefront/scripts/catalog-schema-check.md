# Public catalog schema check

Run with Python 3.9+ (standard library only):

```sh
python3 apps/storefront/scripts/catalog-schema-check.py \
  --report /path/outside-repo/catalog-schema-report.json \
  --state /path/outside-repo/catalog-schema-state.json --changed-only
```

Read-only: fetches the public sitemap, all canonical product HTML, addressable
material/variant/finish URLs present in inline ProductGroup markup, and image
HEAD responses. Three concurrent requests maximum; 30-second request timeout.
Checks price in RUB against visible current price (excluding old/hidden prices),
selected SKU, main photo, availability text and canonical path. The complete
schema gallery is checked for accessible images, without requiring every photo
in initial HTML. Requests and redirects stay on the same origin.

`--changed-only` compares every page on every run, but checks image HTTP only
for changed pages. Omit it for a full media availability check. State advances
atomically only when there are no discrepancies or image failures. Reports
retain unresolved/ambiguous offers and family descriptions in `held`; missing
data does not get invented. Removed URLs are listed separately for review.

This is a public SSR consistency check. It does not replace native catalog data
audits, hydrated-browser QA, Google Rich Results Test or Search Console indexation
reports. A scheduler should report new failures and newly held cases, remain quiet
when unchanged, and never publish repairs or change catalog data automatically.

Fixtures run in the storefront fidelity suite. A single run should have one
writer for its report/state paths.
