export const R6_MAPS = [
  { id: "bank", name: "Bank", image: "🏦" },
  { id: "border", name: "Border", image: "🛂" },
  { id: "chalet", name: "Chalet", image: "🏔️" },
  { id: "club_house", name: "Club House", image: "🎱" },
  { id: "coastline", name: "Coastline", image: "🌊" },
  { id: "consulate", name: "Consulate", image: "🏛️" },
  { id: "emerald_plains", name: "Emerald Plains", image: "🌿" },
  { id: "kafe", name: "Kafe Dostoyevsky", image: "☕" },
  { id: "lair", name: "Lair", image: "🦈" },
  { id: "nighthaven", name: "Nighthaven Labs", image: "⚗️" },
  { id: "oregon", name: "Oregon", image: "🌲" },
  { id: "skyscraper", name: "Skyscraper", image: "🏗️" },
  { id: "stadium", name: "Stadium Bravo", image: "🏟️" },
  { id: "villa", name: "Villa", image: "🏡" },
  { id: "fortress", name: "Fortress", image: "🏰" },
  { id: "outback", name: "Outback", image: "🦘" },
] as const;

export type MapId = (typeof R6_MAPS)[number]["id"];

export function getMapById(id: string) {
  return R6_MAPS.find((m) => m.id === id);
}
