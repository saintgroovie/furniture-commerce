import type { Metadata } from "next"
import { Suspense } from "react"
import { BespokeForm } from "@/components/bespoke-form"

export const metadata: Metadata = {
  title: "Заявка на расчёт",
  description: "Оставьте заявку на расчёт мебели по вашим размерам. Менеджер свяжется с вами.",
}

export default function BespokePage() {
  return (
    <div>
      <h1>Заявка на расчёт</h1>
      <Suspense fallback={<p>Загрузка…</p>}>
        <BespokeForm />
      </Suspense>
    </div>
  )
}
