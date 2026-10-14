// Wording for the filter summary shown next to the Filters button. Every
// choice is spelled out; the summary simply wraps onto more lines.
export const listSummary = (picked: string[], any: string) => (picked.length === 0 ? any : picked.join(", "));

export const yearSummary = (from: number, to: number, anyFrom: number, anyTo: number) => {
  if (from <= anyFrom && to >= anyTo) return "Any year";
  return from === to ? String(from) : `${from} to ${to}`;
};
