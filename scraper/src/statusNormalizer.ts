/**
 * Keeping one normalizer means only ONE place needs adjusting once you know
 * ShopDeck's exact status wording — every downstream query (dashboard, RTO
 * list, missing-parcel reconciliation) relies on these canonical values
 * rather than trying to fuzzy-match raw ShopDeck text in five different
 * places.
 *
 * ADJUST the keyword lists below once you've seen real status text.
 */
export function normalizeRtoStatus(rawText: string | null): string | null {
  if (!rawText) return null;
  const t = rawText.toLowerCase();

  if (t.includes("rto") && (t.includes("delivered") || t.includes("received"))) {
    return "RTO_DELIVERED";
  }
  if (t.includes("delivered") && !t.includes("rto") && !t.includes("non") && !t.includes("un")) {
    return "DELIVERED";
  }
  if (t.includes("rto") && (t.includes("transit") || t.includes("intransit"))) {
    return "RTO_IN_TRANSIT";
  }
  if (t.includes("rto")) {
    return "RTO_INITIATED";
  }
  return null;
}
