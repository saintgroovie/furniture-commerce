import type { MetadataRoute } from "next"
import {
  isIndexingAllowed,
  robotsTxtBody,
} from "@/lib/indexing-policy"

/**
 * Demo/staging default: Disallow all, no Sitemap URL.
 * Index mode Allow is a technical stub only — production cutover is a separate release.
 */
export default function robots(): MetadataRoute.Robots {
  if (isIndexingAllowed()) {
    return {
      rules: {
        userAgent: "*",
        allow: "/",
      },
    }
  }

  // MetadataRoute.Robots does not expose raw body; Disallow: / via rules.
  // Keep body contract aligned with robotsTxtBody() for fidelity tests.
  void robotsTxtBody()
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  }
}
