#!/usr/bin/env python3
"""Read-only public PDP/JSON-LD regression check; no Google validation claim.

Uses the public sitemap, rendered HTML and image responses. It does not verify
indexation, native database prices or choices made after browser hydration.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import html.parser
import json
import pathlib
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

VOID = set("area base br col embed hr img input link meta param source track wbr".split())
PRODUCT_PATH = re.compile(r"/product/[a-z0-9][a-z0-9-]{0,120}$", re.I)
ALLOWED_QUERY = {"material", "variant", "finish"}
USER_AGENT = "WoodrightCatalogSchemaCheck/1.0"


class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack, self.schemas, self.errors = [], [], []
        self.buffer = None
        self.price, self.article, self.material, self.panel, self.images = [], [], [], [], []
        self.canonical = None

    def has(self, name):
        return any(name in a.get("class", "").split() for _, a in self.stack)

    def hidden(self):
        return any("hidden" in a or a.get("aria-hidden") == "true" or
                   "display:none" in a.get("style", "").replace(" ", "") for _, a in self.stack)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.buffer = []
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs.get("href")
        if tag == "img" and self.has("pdp-media") and not self.hidden() and attrs.get("aria-hidden") != "true":
            self.images.append(attrs.get("src", ""))
        if tag not in VOID:
            self.stack.append((tag, attrs))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag == "script" and self.buffer is not None:
            try:
                self.schemas.append(json.loads("".join(self.buffer)))
            except ValueError:
                self.errors.append("invalid_json_ld")
            self.buffer = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, data):
        if self.buffer is not None:
            self.buffer.append(data)
        if not data.strip() or self.hidden() or any(t in {"script", "style"} for t, _ in self.stack):
            return
        if self.has("product-detail-price") and not self.has("price-sale-was") and not self.has("sr-only"):
            self.price.append(data)
        for field, name in [("article", "pdp-article"), ("material", "pdp-material-trigger-value"), ("panel", "pdp-panel")]:
            if self.has(name):
                getattr(self, field).append(data)


def entities(value):
    if isinstance(value, list):
        return [item for part in value for item in entities(part)]
    if isinstance(value, dict):
        return [value] + entities(value.get("@graph", []))
    return []


def safe_product_url(value, origin):
    url = urllib.parse.urlsplit(value)
    base = urllib.parse.urlsplit(origin)
    query = urllib.parse.parse_qs(url.query, keep_blank_values=True)
    return (url.scheme == base.scheme and url.netloc == base.netloc and not url.fragment and
            bool(PRODUCT_PATH.fullmatch(url.path)) and set(query) <= ALLOWED_QUERY and
            all(len(values) == 1 and re.fullmatch(r"[a-z0-9_-]{1,120}", values[0], re.I) for values in query.values()))


def image_url(value, base):
    url = urllib.parse.urljoin(base, value)
    parsed = urllib.parse.urlsplit(url)
    # Media stays on the audited site. Never follow arbitrary schema URLs.
    if parsed.netloc != urllib.parse.urlsplit(base).netloc or parsed.scheme != urllib.parse.urlsplit(base).scheme:
        raise ValueError("external_image_requires_review")
    if parsed.path == "/_next/image":
        inner = urllib.parse.parse_qs(parsed.query).get("url", [""])[0]
        return image_url(inner, base)
    return url


def inspect_page(content, url):
    page = Page()
    page.feed(content)
    row = {"url": url, "issues": list(page.errors), "held": [], "targets": [], "images": []}
    roots = [e for s in page.schemas for e in entities(s) if e.get("@type") in {"Product", "ProductGroup"}]
    if len(roots) != 1:
        row["issues"].append("expected_one_product_schema")
        return row
    root = roots[0]
    choices = root.get("hasVariant", []) if root.get("@type") == "ProductGroup" else [root]
    origin = urllib.parse.urlunsplit((*urllib.parse.urlsplit(url)[:2], "", "", ""))
    for choice in choices:
        target = choice.get("url", "")
        if target and safe_product_url(target, origin):
            row["targets"].append(target)
        elif target:
            row["issues"].append("unsafe_variant_url")
    params = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    selected = choices
    if params:
        selected = [c for c in choices if all(urllib.parse.parse_qs(urllib.parse.urlsplit(c.get("url", "")).query).get(k) == v for k, v in params.items())]
    elif len(choices) > 1:
        material = "".join(page.material).strip()
        if material:
            selected = [c for c in choices if c.get("material") == material]
        if len(selected) > 1 and page.images:
            hero = image_url(page.images[0], url)
            selected = [c for c in selected if (c.get("image") or [None])[0] == hero]
    if len(selected) != 1:
        row["issues"].append("ambiguous_selected_variant")
        return row
    product = selected[0]
    images = product.get("image", [])
    images = [images] if isinstance(images, str) else images
    try:
        row["images"] = list(dict.fromkeys(image_url(src, url) for src in images))
        if not images or not page.images or image_url(images[0], url) != image_url(page.images[0], url):
            row["issues"].append("hero_mismatch")
    except ValueError as error:
        row["held"].append(str(error))
    # The rest of a gallery may hydrate later. Its absence in SSR is not a missing-photo error.
    price_text = "".join(page.price).strip()
    numbers = re.findall(r"\d[\d\s\u00a0\u202f]*", price_text)
    price = int(re.sub(r"\D", "", numbers[0])) if len(numbers) == 1 else None
    offer = product.get("offers")
    if isinstance(offer, dict):
        if offer.get("priceCurrency") != "RUB" or price is None or re.search(r"\bот\b", price_text, re.I) or offer.get("price") != price:
            row["issues"].append("visible_price_mismatch")
        panel = " ".join(page.panel)
        availability = offer.get("availability")
        if availability == "https://schema.org/BackOrder":
            if "Изготавливается" not in panel:
                row["issues"].append("visible_availability_mismatch")
        elif availability == "https://schema.org/InStock":
            if "В наличии" not in panel:
                row["issues"].append("visible_availability_mismatch")
        elif availability == "https://schema.org/OutOfStock":
            if "Добавить в корзину" in panel:
                row["issues"].append("unavailable_with_cart")
        else:
            row["held"].append("unknown_availability")
    else:
        row["held"].append("no_unambiguous_offer")
    sku = product.get("sku")
    if sku and sku not in "".join(page.article):
        row["issues"].append("visible_sku_mismatch")
    if not page.canonical or urllib.parse.urlsplit(page.canonical).path != urllib.parse.urlsplit(url).path:
        row["issues"].append("canonical_mismatch")
    group = root.get("isVariantOf", {})
    if group.get("@type") == "ProductGroup" and not group.get("description"):
        row["held"].append("family_description_requires_review")
    row.update(sku=sku, price_rub=price, hero=row["images"][0] if row["images"] else None,
               availability=offer.get("availability") if isinstance(offer, dict) else None)
    projection = {"schema": root, "price": price_text, "hero": row["hero"], "article": page.article, "panel": page.panel, "canonical": page.canonical}
    row["fingerprint"] = hashlib.sha256(json.dumps(projection, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return row


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, origin):
        self.origin = urllib.parse.urlsplit(origin)[:2]

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl)[:2] != self.origin:
            raise ValueError("cross_origin_redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def request(url, method="GET"):
    opener = urllib.request.build_opener(SameOriginRedirect(url))
    req = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    return opener.open(req, timeout=30)


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(path)


def run(args):
    base = args.base_url.rstrip("/")
    prior = json.loads(args.state.read_text()) if args.state and args.state.exists() else {}
    with request(base + "/sitemap.xml") as response:
        sitemap = ET.fromstring(response.read())
    targets = sorted(set(e.text for e in sitemap.iter() if e.tag.endswith("}loc") and e.text and safe_product_url(e.text, base)))
    if not targets:
        raise ValueError("empty_product_sitemap")
    if len(targets) > 5000:
        raise ValueError("catalog_limit_exceeded")

    def check(url):
        try:
            with request(url) as response:
                row = inspect_page(response.read().decode("utf-8"), url)
                row["source"] = response.headers.get("x-woodright-storefront-source-sha")
                row["changed"] = prior.get("pages", {}).get(url) != row.get("fingerprint")
                return row
        except Exception as error:
            return {"url": url, "issues": [f"fetch_or_parse_failed:{type(error).__name__}:{error}"], "held": [], "targets": [], "images": []}

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        rows = list(pool.map(check, targets))
        # Only complete inline variants with their own source-backed URLs; size
        # siblings already have canonical sitemap pages. One extra hop, bounded.
        extra = sorted(set(t for r in rows for t in r["targets"]) - set(targets))
        if len(extra) > 5000:
            raise ValueError("variant_limit_exceeded")
        rows.extend(pool.map(check, extra))
        images = sorted(set(src for row in rows if not args.changed_only or row.get("changed") for src in row["images"]))

        def check_image(url):
            try:
                with request(url, "HEAD") as response:
                    if not response.headers.get("Content-Type", "").lower().startswith("image/"):
                        raise ValueError("not_an_image")
                return None
            except Exception as error:
                return {"url": url, "issue": f"image_unavailable:{type(error).__name__}:{error}"}

        image_errors = [error for error in pool.map(check_image, images) if error]
    failed = [r for r in rows if r["issues"]]
    held = [{"url": r["url"], "reasons": r["held"]} for r in rows if r["held"]]
    removed = sorted(set(prior.get("pages", {})) - {r["url"] for r in rows})
    report = {"checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "method": "Public SSR/JSON-LD and same-origin image HTTP check; not Google validation or native data audit",
              "canonical_products": len(targets), "checked_urls": len(rows), "changed_urls": sum(r.get("changed", False) for r in rows),
              "removed_urls": removed, "checked_images": len(images), "failed": failed, "held": held, "image_errors": image_errors, "rows": rows}
    atomic_json(args.report, report)
    if not failed and not image_errors and args.state:
        atomic_json(args.state, {"checked_at": report["checked_at"], "pages": {r["url"]: r["fingerprint"] for r in rows}})
    print(json.dumps({k: report[k] for k in ["canonical_products", "checked_urls", "changed_urls", "removed_urls", "checked_images"]} | {"failed": len(failed), "held": len(held), "image_errors": len(image_errors)}))
    return 1 if failed or image_errors else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://woodright.ru")
    parser.add_argument("--report", type=pathlib.Path, required=True)
    parser.add_argument("--state", type=pathlib.Path)
    parser.add_argument("--changed-only", action="store_true", help="Check image HTTP only for changed pages; still compare every page's HTML and markup")
    raise SystemExit(run(parser.parse_args()))
