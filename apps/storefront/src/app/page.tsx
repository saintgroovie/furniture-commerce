import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Главная",
  description: "Woodright — мебель на заказ. Каталог, готовые комплекты по комнатам, заявки на расчёт.",
  openGraph: {
    title: "Woodright — мебель на заказ",
    description: "Каталог, готовые комплекты по комнатам, заявки на расчёт.",
    url: "/",
  },
}

export default function HomePage() {
  return (
    <div>
      <h1>Главная</h1>
      <p>
        <a href="/catalog">Каталог</a> · <a href="/rooms">Комнаты</a> · <a href="/bespoke">Заявка на расчёт</a> · <a href="/cart">Корзина</a>
      </p>
    </div>
  )
}
