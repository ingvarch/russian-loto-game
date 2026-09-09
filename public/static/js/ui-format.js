// Level vocabulary and money formatting shared by the host UI surfaces.

export const LEVEL_LABELS = { 1: "одна линия", 2: "две линии", 3: "ПОЛНОЕ ЛОТО" };
export const LEVEL_LABELS_ACCUSATIVE = { 1: "одну линию", 2: "две линии", 3: "ПОЛНОЕ ЛОТО" };

export function formatAmount(n) { return (n || 0).toLocaleString("ru-RU"); }
