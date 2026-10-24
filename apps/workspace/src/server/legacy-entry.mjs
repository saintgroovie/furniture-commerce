const TARGET = "https://os.woodright.ru/";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

export function legacyEntryResponse(nonce) {
  if (!/^[A-Za-z0-9+/_=-]{24,128}$/.test(nonce)) throw new Error("Invalid bridge nonce");
  return {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    },
    // The fragment stays in the browser, including one-use invitation tokens.
    // Never read a return URL, query, credentials or document body here.
    body: `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Woodright OS</title><body><p>Woodright OS переехала на новый адрес.</p><a href="${TARGET}">Открыть рабочее пространство</a><script nonce="${nonce}">window.location.replace("${TARGET}" + window.location.hash);</script></body></html>`,
  };
}

export function legacyRefusedResponse() {
  return {
    status: 410,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ message: "Адрес Woodright OS изменился. Откройте os.woodright.ru и войдите заново.", url: TARGET }),
  };
}
