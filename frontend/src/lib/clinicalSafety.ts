// Clinical-safety helpers: allergy cross-reactivity checks and vital-sign
// range flagging. Lightweight rules for the demo — a production build would use
// a full drug-knowledge base (e.g. First Databank) and lab reference ranges.
import type { Allergy } from "../types";

// --- Allergy cross-reactivity -------------------------------------------------
const CROSS_REACTIVITY: { allergyKeywords: string[]; drugs: string[] }[] = [
  {
    allergyKeywords: ["penicillin", "amoxicillin", "beta-lactam"],
    drugs: ["penicillin", "amoxicillin", "ampicillin", "augmentin", "amoxiclav", "dicloxacillin", "piperacillin"],
  },
  {
    allergyKeywords: ["sulfa", "sulfonamide", "cotrimoxazole", "bactrim", "septrin"],
    drugs: ["sulfamethoxazole", "cotrimoxazole", "bactrim", "septrin", "sulfadiazine", "sulfasalazine"],
  },
  {
    allergyKeywords: ["aspirin", "nsaid", "ibuprofen", "salicylate"],
    drugs: ["aspirin", "ibuprofen", "naproxen", "diclofenac", "ketorolac", "indomethacin", "celecoxib"],
  },
  {
    allergyKeywords: ["cephalosporin"],
    drugs: ["cephalexin", "cefuroxime", "ceftriaxone", "cefixime", "cefazolin", "cefaclor"],
  },
  {
    allergyKeywords: ["codeine", "opioid", "morphine"],
    drugs: ["codeine", "morphine", "tramadol", "oxycodone", "hydrocodone"],
  },
];

/** Returns the conflicting allergy substance if the medication is unsafe, else null. */
export function medAllergyConflict(medName: string, allergies: Allergy[]): string | null {
  const med = (medName || "").toLowerCase().trim();
  if (!med) return null;
  for (const a of allergies) {
    if (a.status && a.status !== "Active") continue;
    const sub = (a.substance || "").toLowerCase().trim();
    if (!sub) continue;
    // Direct name overlap (e.g. allergy "Penicillin" vs med "Penicillin V").
    if (med.includes(sub)) return a.substance;
    // Class cross-reactivity (e.g. Penicillin allergy vs Amoxicillin).
    const group = CROSS_REACTIVITY.find((g) => g.allergyKeywords.some((k) => sub.includes(k)));
    if (group && group.drugs.some((d) => med.includes(d))) return a.substance;
  }
  return null;
}

// --- Vital-sign flagging ------------------------------------------------------
export type VitalLevel = "normal" | "low" | "high" | "critical";

/** Flag a vital value against typical adult ranges. */
export function flagVital(key: string, value: number | null | undefined): VitalLevel {
  if (value == null || isNaN(value)) return "normal";
  const v = value;
  switch (key) {
    case "bp_systolic":
      return v >= 180 ? "critical" : v >= 140 ? "high" : v < 90 ? "low" : "normal";
    case "bp_diastolic":
      return v >= 120 ? "critical" : v >= 90 ? "high" : v < 60 ? "low" : "normal";
    case "heart_rate":
      return v > 130 ? "critical" : v > 100 ? "high" : v < 50 ? "low" : "normal";
    case "resp_rate":
      return v > 30 ? "critical" : v > 20 ? "high" : v < 12 ? "low" : "normal";
    case "temperature_f":
      return v >= 103 ? "critical" : v >= 100.4 ? "high" : v < 95 ? "low" : "normal";
    case "spo2":
      return v < 90 ? "critical" : v < 94 ? "low" : "normal";
    case "bmi":
      return v >= 40 ? "critical" : v >= 30 ? "high" : v < 18.5 ? "low" : "normal";
    case "pain_score":
      return v >= 7 ? "high" : "normal";
    default:
      return "normal";
  }
}

export function isAbnormal(level: VitalLevel): boolean {
  return level !== "normal";
}

/** CSS class suffix for a vital tile / input. */
export function vitalClass(level: VitalLevel): string {
  if (level === "critical") return "v-crit";
  if (level === "high") return "v-high";
  if (level === "low") return "v-low";
  return "";
}

export function vitalLabel(level: VitalLevel): string {
  if (level === "critical") return "CRITICAL";
  if (level === "high") return "HIGH";
  if (level === "low") return "LOW";
  return "";
}
