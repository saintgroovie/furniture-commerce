/**
 * Original typographic lockups for the confirmed BES-012 roster.
 * Not official third-party trademarks - Woodright-authored marks for the logo wall.
 */
import type { ReactElement, ReactNode } from "react"

type MarkProps = { className?: string }

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 360 168"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

function BolshoiMark({ className }: MarkProps) {
  return (
    <Frame className={className}>
      <path
        d="M36 78c38-52 92-52 144-8 52-44 106-44 144 8"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M84 78v28M180 62v44M276 78v28" stroke="currentColor" strokeWidth="1.1" />
      <text
        x="180"
        y="132"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="34"
        letterSpacing="6"
      >
        БОЛЬШОЙ
      </text>
      <text
        x="180"
        y="156"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="12"
        letterSpacing="10"
      >
        ТЕАТР
      </text>
    </Frame>
  )
}

function VgbllMark({ className }: MarkProps) {
  return (
    <Frame className={className}>
      <rect x="132" y="28" width="22" height="52" stroke="currentColor" strokeWidth="1.3" />
      <rect x="160" y="22" width="22" height="58" stroke="currentColor" strokeWidth="1.3" />
      <rect x="188" y="30" width="22" height="50" stroke="currentColor" strokeWidth="1.3" />
      <text
        x="180"
        y="118"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="36"
        letterSpacing="8"
      >
        ВГБИЛ
      </text>
      <text
        x="180"
        y="144"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="11"
        letterSpacing="3.2"
      >
        ИМ. М. И. РУДОМИНО
      </text>
    </Frame>
  )
}

function SochiMark({ className }: MarkProps) {
  return (
    <Frame className={className}>
      <path d="M118 74V38h10v36M175 74V28h10v46M232 74V38h10v36" stroke="currentColor" strokeWidth="1.3" />
      <path d="M108 74h144" stroke="currentColor" strokeWidth="1.3" />
      <text
        x="180"
        y="118"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="34"
        letterSpacing="10"
      >
        СОЧИ
      </text>
      <text
        x="180"
        y="144"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="11"
        letterSpacing="2.4"
      >
        ГОРОДСКОЕ СОБРАНИЕ
      </text>
    </Frame>
  )
}

function MvdMark({ className }: MarkProps) {
  return (
    <Frame className={className}>
      <path
        d="M118 70c0-22 28-40 62-40s62 18 62 40"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M132 70h96" stroke="currentColor" strokeWidth="1.3" />
      <text
        x="180"
        y="112"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="22"
        letterSpacing="5"
      >
        АКАДЕМИЯ
      </text>
      <text
        x="180"
        y="144"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="28"
        letterSpacing="8"
      >
        МВД
      </text>
    </Frame>
  )
}

function MariinskyMark({ className }: MarkProps) {
  return (
    <Frame className={className}>
      <path d="M180 24 L268 68 H92 Z" stroke="currentColor" strokeWidth="1.3" />
      <path d="M118 68v22M180 68v22M242 68v22" stroke="currentColor" strokeWidth="1.2" />
      <path d="M108 90h144" stroke="currentColor" strokeWidth="1.3" />
      <text
        x="180"
        y="126"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="22"
        letterSpacing="4"
      >
        МАРИИНСКИЙ
      </text>
      <text
        x="180"
        y="152"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="18"
        letterSpacing="8"
      >
        ДВОРЕЦ
      </text>
    </Frame>
  )
}

function SovcomflotMark({ className }: MarkProps) {
  return (
    <Frame className={className}>
      <path
        d="M48 64c40 28 72-20 120-4 48 16 84-24 144 8"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M64 84c36 18 70-12 112 0 46 14 78-16 120 6"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.7"
      />
      <text
        x="180"
        y="132"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="24"
        letterSpacing="3.5"
      >
        СОВКОМФЛОТ
      </text>
      <text
        x="180"
        y="154"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="11"
        letterSpacing="6"
      >
        ПАО
      </text>
    </Frame>
  )
}

function TverMark({ className }: MarkProps) {
  return (
    <Frame className={className}>
      <rect x="128" y="24" width="104" height="64" stroke="currentColor" strokeWidth="1.3" />
      <rect x="140" y="36" width="80" height="40" stroke="currentColor" strokeWidth="1" />
      <text
        x="180"
        y="122"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="22"
        letterSpacing="5"
      >
        ТВЕРСКАЯ
      </text>
      <text
        x="180"
        y="148"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="13"
        letterSpacing="3"
      >
        КАРТИННАЯ ГАЛЕРЕЯ
      </text>
    </Frame>
  )
}

const MARKS: Record<string, (props: MarkProps) => ReactElement> = {
  bolshoi: BolshoiMark,
  vgbll: VgbllMark,
  sochi: SochiMark,
  "mvd-academy": MvdMark,
  "mariinsky-palace": MariinskyMark,
  sovcomflot: SovcomflotMark,
  "tver-gallery": TverMark,
}

export function hasPartnerMark(slug: string): boolean {
  return Boolean(MARKS[slug])
}

export function PartnerMark({
  slug,
  name,
  className,
}: {
  slug: string
  name: string
  className?: string
}) {
  const Mark = MARKS[slug]
  if (!Mark) {
    return <span className={className}>{name}</span>
  }
  return <Mark className={className} />
}
