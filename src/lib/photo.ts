export function initialsFromName(name: string): string {
  const cleaned = name.replace(/\([^)]*\)/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter((part) => /[a-z]/i.test(part));
  if (!parts.length) return "T";
  const first = parts[0][0] || "T";
  const second = parts.length > 1 ? parts[1][0] : "";
  return (first + second).toUpperCase();
}
