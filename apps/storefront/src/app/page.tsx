import type { Metadata } from "next"
import { HomePage, type HomePreview } from "@/components/home-page"
import { getProducts } from "@/lib/api/products"
import { getRoomSets } from "@/lib/api/room-sets"

export const metadata: Metadata = {
  title: "Главная",
  description:
    "Woodright — мебель на заказ. Каталог, готовые комплекты по комнатам, заявка по проекту.",
  openGraph: {
    title: "Woodright — мебель на заказ",
    description: "Каталог, комнаты и заявка на расчёт по проекту.",
    url: "/",
  },
}

const PREVIEW_PRODUCT_LIMIT = 4
const PREVIEW_ROOM_LIMIT = 3

async function loadHomePreview(): Promise<HomePreview> {
  const empty: HomePreview = { products: [], roomSets: [], previewAvailable: false }
  try {
    const [productsRes, roomSetsRes] = await Promise.all([getProducts(), getRoomSets()])
    const products = Array.isArray(productsRes.products)
      ? productsRes.products.slice(0, PREVIEW_PRODUCT_LIMIT)
      : []
    const roomSets = Array.isArray(roomSetsRes.room_sets)
      ? roomSetsRes.room_sets.slice(0, PREVIEW_ROOM_LIMIT)
      : []
    return {
      products,
      roomSets,
      previewAvailable: products.length > 0 || roomSets.length > 0,
    }
  } catch {
    return empty
  }
}

export default async function HomePageRoute() {
  const preview = await loadHomePreview()
  return <HomePage preview={preview} />
}
