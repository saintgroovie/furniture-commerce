type VitePlugin = {
  name: string
  transformIndexHtml?: {
    order?: "pre" | "post"
    handler: (html: string) => string
  }
}

const FAVICON_MARKER = "woodright-admin-favicon"

/**
 * Favicon админки: та же буква "W" и та же форма (скруглённый квадрат), что
 * и в favicon сайта, но с переставленными цветами — тёмный "wenge" фон и
 * кремовая буква (на сайте наоборот: кремовый фон, тёмная буква). Так
 * вкладка админки визуально отличается от вкладки сайта.
 * Источники PNG для регенерации: src/admin/assets/favicon-w-*.png.
 * Встраиваем как data URI — так же, как Medusa делает для placeholder-иконки
 * (`data:,`), без зависимости от настройки статики в admin Vite build.
 */
const FAVICON_16_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABGElEQVR4nN2TO0vDYBhGzxfqmMnQkCpoOznE1gsqdBO6SEsV0dlB/4KT/gm37g4FdVSRYtWtXgq2aQKBWlAplk7GIWP4XCwUhIDRyTO9yznT8wq+mBrXJT/A7fYFgBJFHnZEFHkY5Tfy3wcOj47Z2t5BCMFyLsdZ9RoznUYIwe7ePgelUnig03liKZtFSklmdo5RTcPMzCClZH5hEadlhweuKhWMxBi6kWAyleLi/BRz2mQimURVVW6ql+EB67GB7/vki0VisRFOymU0Lc5KvkCv90an3Q4PeN47LavJ+sYmry/P2JaF9+FRWF3jvlYjCILwAECjXkc3DOxmEwDXcdD0OA93t99k+B9DGnxVFNxuXyiDI4oM8AlgnWGDoxYiIQAAAABJRU5ErkJggg=="

const FAVICON_32_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADdElEQVR4nO2XXU8bRxSGn5ndtVlHjQiGGqMWDLaXtQi0tKg0oumvqVTlpuqfiJRWVXrR3vTntGrVqkn4MvgzhfBhO8YmDkYKeL270wsKbSkfKSjmhvfyzI7eZ87RnjkjOEH2OxF1Uvyyym1WxfHYvwJvyvgsENlp8+NestPmxyHkeR++aYmrOP0/deUZuAbQT1v46uG3GMEgrtPm4dcPeF6poGkanucRTya498WXGIbBVrXKN/fv03JaSCnxfZ/JqSk++/webdclu7zED99/9/8BhJCM3R7HMAIMDsV4XqkgpcTzPOzUGB9Nf8xOc4fhkRGGRkYo5LJHAHdmPmE0lQJg9tHvZ2bg1BL89usvoBSOs897k5MAeJ4HwO2JCfZevWJ/b49Q6AbxZAIApRRCShLJJJ7r0mi8YPbxo4sBFHI5mru7SKmRtEYRQqCUwjAMLNvG9Q9gfN9nbHziCDAajRKJRkEItut1cpnMxQDy2Szb9RoA/QMDRPr7UUoRT1qEw304+y0yS2nabhvLHiUQCAAwGBsmHA6DUhRyWVzXvRhAu90ml82glCLc18tQbBgAy7bpCfdQqZT5+cefEEIQDvcyHD8og51KIYREapKFubkzzc8EAEjPzyOEwNANElYSgFE7habrbNfrZJbS7DabdHffImFZAIyNjwPQaDQo5guXAyjmCzQaL5BSEE9aCCGIW0mctkO5VKK0uUm5VKLL7GIoFqPLNIlEB9A0SblUZnNjHSH+MwK8HoAQgo2NdcqlElLqRCL9DMZi9Pb2HtUf4I9iEc/zeXdwiFHbxjRNAJbTi/i+fzkA5ftk0mmQAjNkMnP3Uww9QLPZJJ/NAbA4N0fbceh7u4+kZRO6EcJzPZ6c8/+fC3Co2SeP8V2XLtNkanoaM2Sy8rRIvbYFQCGf4+XLBm/dvMmduzPoUqNarbKx9gyA867aUzvh4ca11VUq5TLdPbcIBoNIKSnk87iui5SS2tYWTwsF3v/gQ3RdR0jJ+toz6rU6QkqU718sA8r3EVJSr9VYXVkhGAgC0HJapOfnAY7uhkI+j6Zp+L5CCEgvLBx0xXNOfyYA/D2xZpbSKKXQNYPdnSbF/EH9D1vz8uIirVYLXddx2m0W/wJ8nUnneiK6BpAnPZc6pdxmVVx9Bg5JOm186CmPBzppDpzcrDr5PP8TxZF9DYP+poUAAAAASUVORK5CYII="

const PLACEHOLDER_FAVICON_LINK_RE =
  /<link[^>]*data-placeholder-favicon[^>]*>/i

export function woodrightAdminFaviconPlugin(): VitePlugin {
  const faviconLinks =
    `<link rel="icon" type="image/png" sizes="32x32" href="data:image/png;base64,${FAVICON_32_PNG_BASE64}" data-${FAVICON_MARKER}>` +
    `<link rel="icon" type="image/png" sizes="16x16" href="data:image/png;base64,${FAVICON_16_PNG_BASE64}" data-${FAVICON_MARKER}>`

  return {
    name: FAVICON_MARKER,
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (html.includes(`data-${FAVICON_MARKER}`)) {
          return html
        }
        if (PLACEHOLDER_FAVICON_LINK_RE.test(html)) {
          return html.replace(PLACEHOLDER_FAVICON_LINK_RE, faviconLinks)
        }
        return html.replace("<head>", `<head>${faviconLinks}`)
      },
    },
  }
}
