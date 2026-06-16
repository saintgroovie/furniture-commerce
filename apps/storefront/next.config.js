/** @type {import('next').NextConfig} */
const backendUrl =
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
  process.env.MEDUSA_BACKEND_URL ||
  "http://localhost:9000"

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/product-static/:path*",
        destination: `${backendUrl}/static/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
