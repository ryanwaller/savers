-- Seed tag aliases for auto-tag normalization
-- Run this after 012_auto_tags.sql

INSERT INTO savers.tag_aliases (canonical_tag, variants) VALUES
  -- Design disciplines
  ('typography', ARRAY['type design', 'typeface', 'fonts', 'type', 'font design']),
  ('graphic design', ARRAY['graphic', 'visual design', 'communication design']),
  ('motion design', ARRAY['motion graphics', 'motion', 'animation', 'mograph']),
  ('interaction design', ARRAY['ixd', 'ui design', 'interaction']),
  ('product design', ARRAY['ux design', 'ux', 'digital product', 'product']),
  ('branding', ARRAY['brand identity', 'brand design', 'visual identity', 'identity design', 'logo design', 'logos']),
  ('illustration', ARRAY['illustrator', 'drawing', 'digital art']),
  ('web design', ARRAY['web', 'website design', 'web development', 'front-end', 'frontend']),
  ('print design', ARRAY['print', 'editorial', 'publication design', 'book design']),
  ('photography', ARRAY['photographer', 'photo']),

  -- Locations
  ('new york', ARRAY['nyc', 'new york city', 'brooklyn', 'manhattan']),
  ('los angeles', ARRAY['la', 'los angeles ca']),
  ('san francisco', ARRAY['sf', 'san francisco ca', 'bay area']),
  ('london', ARRAY['london uk', 'united kingdom']),
  ('berlin', ARRAY['berlin germany']),
  ('amsterdam', ARRAY['amsterdam netherlands']),
  ('paris', ARRAY['paris france']),
  ('tokyo', ARRAY['tokyo japan']),
  ('melbourne', ARRAY['melbourne australia']),
  ('stockholm', ARRAY['stockholm sweden']),

  -- Techniques/mediums
  ('risograph', ARRAY['riso', 'riso print']),
  ('letterpress', ARRAY['letter press']),
  ('screen printing', ARRAY['screenprint', 'silkscreen']),
  ('generative', ARRAY['generative art', 'generative design', 'creative coding']),
  ('variable fonts', ARRAY['variable type', 'variable typography']),
  ('brutalist', ARRAY['brutalism', 'brutalist design']),
  ('minimalist', ARRAY['minimal', 'minimalism', 'minimal design'])
ON CONFLICT (canonical_tag) DO UPDATE SET variants = EXCLUDED.variants;
