import React, { useState } from "react";
import { Image } from "@phosphor-icons/react";
import { workspacePath } from "../lib/paths.mjs";

// Use the same authenticated media ordering as the product gallery.
export function ProductThumbnail({ product }) {
  const photos = product?.photoOrder || [];
  const selected = photos.indexOf(product?.mainFileId);
  const src = photos.length
    ? workspacePath(
        `/api/live/media?productId=${encodeURIComponent(product.id)}&index=${Math.max(0, selected)}`,
      )
    : "";
  const [failedSource, setFailedSource] = useState("");
  const available = src && failedSource !== src;
  const fallback = src ? "Фото недоступно" : "Нет фотографии";
  return (
    <span
      className="product-thumbnail"
      title={available ? undefined : fallback}
    >
      {available ? (
        <img
          src={src}
          alt={`Фото: ${product.name}`}
          width="56"
          height="56"
          loading="lazy"
          decoding="async"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <span
          className="product-thumbnail-empty"
          role="img"
          aria-label={fallback}
        >
          <Image size={23} weight="light" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
