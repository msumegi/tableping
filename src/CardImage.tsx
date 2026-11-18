import { useState } from "react";
import markUrl from "../resources/icon-g-foreground.svg";

/** Local icon G. Shown when a card picture is missing or fails, including offline. */
export function CardImage({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="card-fallback" role="img" aria-label={name}>
        <img className="card-fallback-logo" src={markUrl} alt="" />
      </span>
    );
  }
  return <img src={src} alt={name} onError={() => setFailed(true)} />;
}
