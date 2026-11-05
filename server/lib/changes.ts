import { priceLine, totalCents, type PricedLine } from "./pricing.js";

export type Line = { id: string; label: string; unit: string; quantity: number; rateCents: number };
export type Item = {
  op: "add" | "update" | "remove";
  scopeItemId: string | null;
  label: string;
  unit: string;
  quantity: number;
  rateCents: number;
  newId?: string;
};

/** Apply change items to the current lines. Pure and deterministic. */
export function applyItems(current: Line[], items: Item[]): PricedLine[] {
  let lines = current.map((l) => ({ ...l }));
  for (const it of items) {
    if (it.op === "remove") lines = lines.filter((l) => l.id !== it.scopeItemId);
    else if (it.op === "update")
      lines = lines.map((l) =>
        l.id === it.scopeItemId
          ? { ...l, label: it.label, quantity: it.quantity, rateCents: it.rateCents }
          : l,
      );
    else
      lines.push({
        id: it.newId ?? `new-${lines.length}`,
        label: it.label,
        unit: it.unit,
        quantity: it.quantity,
        rateCents: it.rateCents,
      });
  }
  return lines.map(priceLine);
}

export function diff(before: PricedLine[], after: PricedLine[]) {
  return { beforeTotalCents: totalCents(before), afterTotalCents: totalCents(after), deltaCents: totalCents(after) - totalCents(before) };
}
