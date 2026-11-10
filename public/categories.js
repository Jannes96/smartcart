// Einzige Quelle der Wahrheit für Kategorien – wird vom Server (Validierung)
// und vom Browser (Dropdowns, Gruppierung) importiert.
//
// Die Reihenfolge ist bewusst der typische Laufweg durch einen Supermarkt und
// nicht alphabetisch: So steht die Liste im Laden in der Reihenfolge, in der
// man die Regale abläuft.
export const CATEGORIES = [
  { id: "obst-gemuese", label: "Obst & Gemüse", icon: "🥬" },
  { id: "backwaren", label: "Backwaren", icon: "🥐" },
  { id: "molkerei", label: "Molkerei & Eier", icon: "🧀" },
  { id: "fleisch-fisch", label: "Fleisch & Fisch", icon: "🥩" },
  { id: "tiefkuehl", label: "Tiefkühl", icon: "🧊" },
  { id: "vorrat", label: "Vorrat & Konserven", icon: "🥫" },
  { id: "suesses", label: "Süßes & Snacks", icon: "🍫" },
  { id: "getraenke", label: "Getränke", icon: "🧃" },
  { id: "haushalt", label: "Haushalt & Drogerie", icon: "🧻" },
  { id: "sonstiges", label: "Sonstiges", icon: "📦" },
];

export const DEFAULT_CATEGORY = "sonstiges";

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export const isCategory = (id) => BY_ID.has(id);

// Unbekannte oder fehlende Werte fallen auf "Sonstiges" zurück, damit ein Item
// nie unsichtbar wird – z.B. wenn eine Kategorie später entfernt wird.
export const categoryOr = (id) => BY_ID.get(id) ?? BY_ID.get(DEFAULT_CATEGORY);
