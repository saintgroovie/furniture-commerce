import type { MetadataRoute } from "next"
import {
  isIndexingAllowed,
  robotsTxtBody,
} from "@/lib/indexing-policy"
import {
  productionSitemapUrl,
  resolvePublicIndexableOrigin,
} from "@/lib/seo-mode"

/**
 * Demo/private: Disallow all, no Sitemap URL.
 * public_indexable: Allow crawl + production Sitemap line.
 */
export default function robots(): MetadataRoute.Robots {
  if (isIndexingAllowed()) {
    const origin = resolvePublicIndexableOrigin()
    const sitemap =
      origin === "https://woodright.ru"
        ? productionSitemapUrl()
        : `${origin}/sitemap.xml`
    // Keep body contract aligned with robotsTxtBody() for fidelity tests.
    void robotsTxtBody("index")
    return {
      rules: {
        userAgent: "*",
        allow: "/",
      },
      sitemap,
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
