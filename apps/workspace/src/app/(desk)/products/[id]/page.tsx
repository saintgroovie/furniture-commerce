import { redirect } from "next/navigation"

export default async function ProductAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/catalog/${encodeURIComponent(id)}`)
}
