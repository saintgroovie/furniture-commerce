# Woodright OS decisions

- Preserve the selected premium layout and the existing OS palette: navy `#14233B`, gold `#B8923A`, background `#F6F4EF`.
- Use the actual Woodright vector wordmark. `OS` must sit **to the right** of the wordmark on the same line, including responsive states.
- The daily heading is compact «Рабочая очередь». Do not make «Сегодня» a large decorative headline; employee work has priority over the calendar label.
- All password inputs need an accessible show/hide password control. Never store a default staff password in frontend code or fixtures.
- The owner selected **1С:Бухгалтерия**, described as «8.0». Verify the actual platform/configuration and exchange capability before choosing a transport; do not assume a modern stock REST endpoint.
- The live app must never silently fall back to prototype records or local browser writes. Preserve Medusa as commerce source of truth and show unavailable integrations honestly.
- Keep production access private and use repository release/runtime governance for any hosted cutover. A local private connected candidate is not a server production rollout.
