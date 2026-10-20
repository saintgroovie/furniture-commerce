import nextPlugin from "eslint-config-next"

const config = [
  ...nextPlugin,
  {
    ignores: [".next/**", ".next-build/**", ".next-dev/**", "node_modules/**"],
  },
]

export default config
