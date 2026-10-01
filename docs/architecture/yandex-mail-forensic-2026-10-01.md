# Yandex mail forensic - 2026-10-01

Read-only public DNS and a repo scan. No DNS write, no login, no mailbox access.
Observed at 2026-10-01T12:55:53Z (dig, resolver defaults).

## woodright.ru DNS

| Record | Result |
|---|---|
| MX | `10 mx.yandex.net`, `20 mail.woodright.ru` |
| A | `200.169.188.39` |
| NS | `ns1.itb-host.ru`, `ns2.itb-host.ru` |
| TXT | `v=spf1 ip4:79.133.175.238 a mx ~all` |
| DMARC `_dmarc.woodright.ru` | no TXT |
| DKIM `mail._domainkey`, `yandex._domainkey`, `default._domainkey` | no TXT |
| `_domainkey.woodright.ru` NS | no answer |
| `mail.woodright.ru` A | no answer |
| `yandex-verification.woodright.ru` CNAME | no answer |
| apex TXT yandex verification | not present (only the SPF TXT) |

`mx` in SPF authorizes whatever the MX hosts are, including `mx.yandex.net`, plus the literal `ip4:79.133.175.238` and the A record. That is not a Yandex-only SPF (`include:_spf.yandex.net` was not published). Soft fail (`~all`).

## Not confirmed

- That a Yandex 360 organization exists for the domain
- Which mailbox is the company desk
- DKIM selector actually used (common names were empty; others were not guessed)
- DMARC policy
- That `mail.woodright.ru` (MX 20) still resolves
- Any OAuth app, IMAP login, or SMTP send

## Repo mail surface (no secret values)

No SMTP/IMAP client in app code. `mailConnectorEnabled()` returns false even if `WOODRIGHT_MAIL_CONNECTOR` is set. Env names seen: `WOODRIGHT_MAIL_CONNECTOR`, `WOODRIGHT_NOTIFICATIONS`, `WOODRIGHT_NOTIFICATION_MODE`, `WOODRIGHT_NOTIFICATION_DECISION_STATUS`. No `SMTP_*` or `IMAP_*` names in app code.

Yandex strings elsewhere are Metrika / Webmaster / a maps URL, not a mailbox.

## False-success map (historical rows were not rewritten)

| Recorded status | Writer | Network send |
|---|---|---|
| `woodright_notification_delivery.status = sent` or `deduped` | `dispatchFakeNotification` from order placement and stage transitions | No. In-memory fake |
| Bespoke `quote_sent` | Admin/workspace PATCH of the request | No. Manual CRM status |
| Payment link `status = sent` | PATCH body persisted | No send path |

`sent` and `quote_sent` mean recorded, not delivered.

## Owner gate before any live call

1. Is a Yandex 360 organization confirmed for woodright.ru?
2. Which mailbox is first?
3. Who may read it (`WOODRIGHT_WORKSPACE_MAIL_EMAILS`)?
4. May we create an OAuth application?
5. May the first check be read-only IMAP, with no send?
