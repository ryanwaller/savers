import "server-only";

// Transcribed from the user's screenshots of the current Savers sidebar.
// Counts are the displayed counts, not totals inferred from preview cards.
export type RealCollection = {
  id: string;
  name: string;
  count: number | null;
  parentId?: string;
  group: "links" | "images" | "smart";
};

const links: Array<[string, number | null, string?]> = [
  ["Finance & Trading", 8],
  ["Design", 19],
  ["Typographers", 83, "Design"],
  ["Cool Fonts", null, "Typographers"],
  ["Developers", 42, "Design"],
  ["Designers", 144, "Design"],
  ["Photographers", 17, "Design"],
  ["Animators", 18, "Design"],
  ["Tools", 13, "Design"],
  ["Aggregator", 7, "Design"],
  ["Signage", 1, "Design"],
  ["AI Tools", 2, "Design"],
  ["Illustrators", 3, "Design"],
  ["Package Design", 4, "Design"],
  ["Work with...", 47, "Design"],
  ["Nice Sites", 21],
  ["Galleries", 27, "Nice Sites"],
  ["Other Means", 3, "Nice Sites"],
  ["Architects", 4, "Nice Sites"],
  ["Books", 2],
  ["Bookstore", 5, "Books"],
  ["Publishers", 10, "Books"],
  ["Book", 2, "Books"],
  ["Art & Culture", 31],
  ["Artists", 1, "Art & Culture"],
  ["Museums", 8, "Art & Culture"],
  ["Schools", 4, "Art & Culture"],
  ["Shopping", 1],
  ["Clothing & Accessories", 13, "Shopping"],
  ["Home", 9, "Shopping"],
  ["Stores", 6, "Shopping"],
  ["Books", 1, "Shopping"],
  ["Office & Technology", 5, "Shopping"],
  ["Weird", 2, "Shopping"],
  ["Work", 10],
  ["Recipes", null],
  ["Bread", 12, "Recipes"],
  ["Bowls", 14, "Recipes"],
  ["Dessert", 6, "Recipes"],
  ["Salads", 3, "Recipes"],
  ["Soups", 18, "Recipes"],
  ["Prep", 5, "Recipes"],
  ["Sandwiches", 5, "Recipes"],
  ["Meals", 32, "Recipes"],
  ["Breakfast", 2, "Recipes"],
  ["Read Later", 54],
  ["Parenting", 29],
  ["Login", 7],
];

const images: Array<[string, number | null, string?]> = [
  ["Letters as Objects", 14],
  ["Counterimages", 8],
  ["Little Guys", 32],
  ["Graffiti Logos", 6],
  ["Funny Apostrophes", 7],
  ["City Logos", 1],
];

const smart: Array<[string, number | null, string?]> = [["High Design", 12]];

function makeCollections(
  rows: Array<[string, number | null, string?]>,
  group: RealCollection["group"],
): RealCollection[] {
  const ids = new Map<string, string>();
  const seen = new Map<string, number>();
  return rows.map(([name, count, parent]) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const ordinal = (seen.get(slug) || 0) + 1;
    seen.set(slug, ordinal);
    const id = `${group}-${slug}${ordinal > 1 ? `-${ordinal}` : ""}`;
    if (!ids.has(name)) ids.set(name, id);
    return { id, name, count, group, parentId: parent ? ids.get(parent) : undefined };
  });
}

export const realCollections = [
  ...makeCollections(links, "links"),
  ...makeCollections(images, "images"),
  ...makeCollections(smart, "smart"),
];
