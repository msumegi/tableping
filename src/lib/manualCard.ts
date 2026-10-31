import type { Card } from "../types";

/** A card the catalog does not have. English name, set, and number only. */
export function manualCard(name: string, setName: string, number: string): Card | null {
  const cleanName = name.trim().slice(0, 80);
  if (cleanName.length < 2) return null;
  const cleanSet = setName.trim().slice(0, 80);
  const cleanNumber = number.trim().slice(0, 12);
  const slug = [cleanName, cleanSet, cleanNumber]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return {
    id: `manual:${slug || "card"}`,
    name: cleanName,
    image: "",
    setName: cleanSet,
    number: cleanNumber,
  };
}
