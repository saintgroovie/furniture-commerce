import nextPlugin from "eslint-config-next"

export default [
  ...nextPlugin,
  {
    ignores: [".next/**", ".next-build/**", ".next-dev/**", "node_modules/**"],
  },
]
