import type { MetadataRoute } from "next"
import {
  isIndexingAllowed,
  robotsTxtBody,
} from "@/lib/indexing-policy"
import { resolvePublicIndexableOrigin } from "@/lib/seo-mode"

/**
 * Demo/private: Disallow all, no Sitemap URL.
 * public_indexable: Allow crawl + Sitemap from explicit production SITE_URL.
 */
export default function robots(): MetadataRoute.Robots {
  if (isIndexingAllowed()) {
    const origin = resolvePublicIndexableOrigin()
    // Keep body contract aligned with robotsTxtBody() for fidelity tests.
    void robotsTxtBody("index")
    return {
      rules: {
        userAgent: "*",
        allow: "/",
      },
      sitemap: `${origin}/sitemap.xml`,
    }
  }

  void robotsTxtBody()
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  }
}
