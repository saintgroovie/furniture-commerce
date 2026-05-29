import type { Metadata } from "next"
import { Suspense } from "react"
import { BespokeForm } from "@/components/bespoke-form"

export const metadata: Metadata = {
  title: "Заявка на расчёт",
  description:
    "Оставьте заявку на расчёт мебели по вашим размерам. Менеджер свяжется с вами.",
  openGraph: {
    title: "Заявка на расчёт | Woodright",
    description:
      "Оставьте заявку на расчёт мебели по вашим размерам.",
    url: "/bespoke/request",
  },
}

export default function BespokeRequestPage() {
  return (
    <div className="service-page">
      <h1>Заявка на расчёт</h1>
      <p className="info-text">
        Расскажите о вашем проекте — мы подготовим индивидуальный расчёт
        и свяжемся с вами.
      </p>
      <Suspense fallback={<p>Загрузка…</p>}>
        <BespokeForm />
      </Suspense>
    </div>
  )
}
