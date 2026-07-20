// Liberia's 15 counties — this is a national government EMR deployment.
// county -> administrative capital (shown as a hint).
export const LIBERIA_COUNTIES: { name: string; capital: string }[] = [
  { name: "Bomi", capital: "Tubmanburg" },
  { name: "Bong", capital: "Gbarnga" },
  { name: "Gbarpolu", capital: "Bopolu" },
  { name: "Grand Bassa", capital: "Buchanan" },
  { name: "Grand Cape Mount", capital: "Robertsport" },
  { name: "Grand Gedeh", capital: "Zwedru" },
  { name: "Grand Kru", capital: "Barclayville" },
  { name: "Lofa", capital: "Voinjama" },
  { name: "Margibi", capital: "Kakata" },
  { name: "Maryland", capital: "Harper" },
  { name: "Montserrado", capital: "Bensonville (Monrovia)" },
  { name: "Nimba", capital: "Sanniquellie" },
  { name: "Rivercess", capital: "River Cess" },
  { name: "River Gee", capital: "Fish Town" },
  { name: "Sinoe", capital: "Greenville" },
];

const REGION_KEY = "emr_region";
export function getRegion(): string {
  return localStorage.getItem(REGION_KEY) ?? "";
}
export function setRegion(region: string): void {
  if (region) localStorage.setItem(REGION_KEY, region);
}
