/** Deterministic pricing. The only place totals are computed. */
export type PricedLine = {
  id: string;
  label: string;
  unit: string;
  quantity: number;
  rateCents: number;
  lineTotalCents: number;
};

export function priceLine(l: {
  id: string;
  label: string;
  unit: string;
  quantity: number;
  rateCents: number;
}): PricedLine {
  return { ...l, lineTotalCents: Math.round(l.quantity * l.rateCents) };
}

export function totalCents(lines: { lineTotalCents: number }[]): number {
  return lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
}
