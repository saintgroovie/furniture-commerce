type Props = {
  src: string
  alt: string
  caption?: string
  className?: string
  imgClassName?: string
}

export function EditorialFigure({ src, alt, caption, className, imgClassName }: Props) {
  return (
    <figure className={className}>
      <img src={src} alt={alt} className={imgClassName} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}
