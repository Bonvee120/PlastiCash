// Fixed list of Enugu areas. Keep in sync with api/app/areas.py (the API rejects anything else).
export const AREAS = [
  "Independence Layout",
  "New Haven",
  "Trans-Ekulu",
  "Abakpa",
  "Emene",
  "GRA",
  "Achara Layout",
  "Uwani",
  "Ogui",
  "Asata",
  "Coal Camp",
  "Thinkers Corner",
  "Gariki",
  "Agbani Road",
] as const;

export const ORG_TYPES = [
  { value: "company", label: "Company" },
  { value: "school", label: "School" },
  { value: "NGO", label: "NGO" },
  { value: "church", label: "Church" },
  { value: "estate", label: "Estate" },
  { value: "other", label: "Other" },
] as const;
