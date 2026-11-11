export type CardKind = "link" | "image" | "note" | "file";

export type PreviewCard = {
  id: string;
  kind: CardKind;
  title: string;
  description?: string;
  source?: string;
  url?: string;
  image?: string;
  collection?: string;
  note?: string;
  date: string;
  tone?: "cream" | "sage" | "lavender" | "stone";
  featured?: boolean;
};

export const collections = [
  {
    id: "design",
    name: "Design that stays with me",
    count: 18,
    description: "Quiet details, bold ideas, and things worth returning to.",
    image: "/rebuild/architecture.svg",
  },
  {
    id: "reading",
    name: "For the long read",
    count: 12,
    description: "Essays for a slower afternoon.",
    image: "/rebuild/reading.svg",
  },
  {
    id: "spaces",
    name: "Spaces & places",
    count: 9,
    description: "Rooms, buildings, and the feeling of being somewhere.",
    image: "/rebuild/interior.svg",
  },
  {
    id: "ideas",
    name: "Small ideas, big feelings",
    count: 7,
    description: "The sentences I don't want to lose.",
    image: "/rebuild/flowers.svg",
  },
] as const;

export const initialCards: PreviewCard[] = [
  {
    id: "architecture",
    kind: "link",
    title: "The art of noticing ordinary things",
    description:
      "A gentle reminder that attention can turn an ordinary day into something remarkable.",
    source: "thecreativeindependent.com",
    url: "https://thecreativeindependent.com/",
    image: "/rebuild/architecture.svg",
    collection: "design",
    date: "Today",
    featured: true,
  },
  {
    id: "quote",
    kind: "note",
    title: "A little more room for wonder",
    description:
      "The more you notice, the more there is to notice. Make space for the small things that ask you to pause.",
    collection: "ideas",
    date: "Today",
    tone: "cream",
  },
  {
    id: "interior",
    kind: "image",
    title: "Somewhere to think",
    description: "Warm light, long shadows, and a room with nothing to prove.",
    image: "/rebuild/interior.svg",
    source: "Saved image",
    collection: "spaces",
    date: "Yesterday",
    featured: true,
  },
  {
    id: "making",
    kind: "link",
    title: "Making things is a way of paying attention",
    description:
      "On the quiet relationship between curiosity, craft, and making something of your own.",
    source: "are.na",
    url: "https://www.are.na/",
    collection: "design",
    date: "Yesterday",
    tone: "sage",
  },
  {
    id: "reading",
    kind: "link",
    title: "A room of one's own, revisited",
    description:
      "What it means to make space for thought in a world that rarely sits still.",
    source: "lithub.com",
    url: "https://lithub.com/",
    image: "/rebuild/reading.svg",
    collection: "reading",
    date: "Monday",
  },
  {
    id: "flowers",
    kind: "image",
    title: "Collected colors, early spring",
    description: "A palette to come back to.",
    image: "/rebuild/flowers.svg",
    source: "Saved image",
    collection: "design",
    date: "Monday",
  },
  {
    id: "essay",
    kind: "link",
    title: "Why we keep what we find",
    description:
      "A good collection is less a filing system and more a record of becoming.",
    source: "sublimeinternet.substack.com",
    url: "https://sublimeinternet.substack.com/",
    collection: "reading",
    date: "Sunday",
    tone: "lavender",
  },
  {
    id: "file",
    kind: "file",
    title: "Notes on visual rhythm.pdf",
    description:
      "A small reference for spacing, repetition, and how a page begins to breathe.",
    source: "PDF · 2.4 MB",
    collection: "design",
    date: "Sunday",
    tone: "stone",
  },
  {
    id: "garden",
    kind: "note",
    title: "Ideas are like gardens",
    description:
      "You don't always know what will grow. Make a place for things to meet, and come back often enough to see what happened.",
    collection: "ideas",
    date: "Last week",
    tone: "sage",
  },
];

export const inboxItems = [
  {
    title: "A guide to collecting what matters",
    source: "The Creative Independent",
    type: "Feed find",
    image: "/rebuild/reading.svg",
  },
  {
    title: "The things we make room for",
    source: "Dense Discovery",
    type: "Feed find",
    image: "/rebuild/architecture.svg",
  },
  {
    title: "An overlooked image worth keeping",
    source: "Unsorted save",
    type: "Needs a home",
    image: "/rebuild/flowers.svg",
  },
];
