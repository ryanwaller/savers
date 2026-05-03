export const MAX_AI_TAGS = 7;

export const DESIGN_DISCIPLINES = [
  "Print Design",
  "Book Design",
  "Exhibition Design",
  "Web Design",
  "UI/UX Design",
  "Branding / Identity Design",
  "Typography",
  "Packaging Design",
  "Environmental Design",
  "Motion Graphics",
  "Graphic Design",
] as const;

export const TAGGING_SYSTEM_PROMPT = `You are a tagging assistant for a design-focused bookmarking app. Your job is to extract structured tags from webpage content.

Tag categories to extract:
1. Locations
- If you detect a city, return the city only. The app will infer the country automatically.
- Examples: "Berlin", "Tokyo", "Portland"
- If only a country is clearly stated, return the country.

2. Institutions
- Schools, universities, studios, agencies, museums, galleries, publishers, brands, and design programs
- Use the full official name when possible

3. Design disciplines
- Use only the exact values allowed by the schema
- Only include disciplines clearly supported by the content

4. Custom tags
- Other specific, reusable tags not already covered above
- Prefer concrete nouns and short phrases over generic descriptors

Output rules:
- Return only valid JSON
- Deduplicate tags
- Maximum 7 total tags across all categories
- If a category has no matches, return an empty array
- Do not guess
- Skip generic filler like "design", "website", "portfolio", "creative", "article", "inspiration"`;

type BuildPromptOptions = {
  url: string;
  title: string | null;
  description: string | null;
  bodyText: string;
  existingTags?: string[];
  collectionPath?: string | null;
  maxTags?: number;
};

export function buildStructuredTaggingPrompt({
  url,
  title,
  description,
  bodyText,
  existingTags = [],
  collectionPath = null,
  maxTags = MAX_AI_TAGS,
}: BuildPromptOptions) {
  const existingLine = existingTags.length
    ? `Existing tags on this bookmark (do not repeat these): ${existingTags.join(", ")}`
    : "Existing tags on this bookmark: none";

  const collectionLine = collectionPath
    ? `Collection path context: ${collectionPath}
- Use this as context, but do not just restate the collection name as tags.
- Prefer narrower facts the collection does not already imply.`
    : "Collection path context: none";

  const schema = `{
  "locations": ["city-or-country"],
  "institutions": ["official name"],
  "designDisciplines": [${DESIGN_DISCIPLINES.map((value) => `"${value}"`).join(", ")}],
  "customTags": ["specific reusable tag"]
}`;

  return `Extract up to ${maxTags} total tags from this bookmarked page.

Prioritize in this order:
1. Location
2. Institution / studio / publisher / museum / brand
3. Design discipline
4. Specific custom tags (techniques, materials, movement, language/script, subject matter)

Examples:
Input:
Title: "Typography work from students at Yale School of Art"
Description: "Letterpress posters printed in New Haven"
Output:
{
  "locations": ["New Haven"],
  "institutions": ["Yale School Of Art"],
  "designDisciplines": ["Typography", "Print Design"],
  "customTags": ["letterpress", "posters", "student work"]
}

Input:
Title: "Exhibition design for the V&A Museum graphic design gallery"
Description: "Created by London-based studio Atelier Works"
Output:
{
  "locations": ["London"],
  "institutions": ["V&A Museum", "Atelier Works"],
  "designDisciplines": ["Exhibition Design", "Graphic Design"],
  "customTags": ["gallery", "museum"]
}

Input:
Title: "Why Bricia Lopez's Vegan Aciento Is Genius"
Description: "Garlic, nuts, and seeds meld into a vegan version of a Oaxacan specialty"
Output:
{
  "locations": ["Oaxaca"],
  "institutions": ["Food52"],
  "designDisciplines": [],
  "customTags": ["vegan", "recipe", "oaxacan", "aciento"]
}

Bookmark:
- URL: ${url}
- Title: ${title ?? "Unknown"}
- Description: ${description ?? "None"}
${collectionLine}
${existingLine}

Primary source text:
"""
${bodyText || "(no body text extracted)"}
"""

Return JSON using exactly this shape:
${schema}`;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function flattenStructuredTags(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;
  return [
    ...readStringArray(record.locations),
    ...readStringArray(record.institutions),
    ...readStringArray(record.designDisciplines),
    ...readStringArray(record.customTags),
  ];
}
