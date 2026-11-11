#!/usr/bin/env python3
"""Prepare a Savers CSV export for the isolated preview, without external APIs.

Writes numbered base64 chunks to an output directory for Railway variables.
The CSV and generated chunks are local working files and must not be committed.
"""

import argparse
import csv
import gzip
import json
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlparse


SENSITIVE_QUERY_KEYS = {
    "token", "access_token", "secret", "password", "auth", "signature", "code", "api_key", "key"
}


def slug(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_file", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--image-dir", type=Path)
    args = parser.parse_args()

    cards = []
    duplicate_books = 0
    with args.csv_file.open(newline="", encoding="utf-8-sig") as source:
        for index, row in enumerate(csv.DictReader(source)):
            raw_url = (row.get("URL") or "").strip()
            parsed = urlparse(raw_url)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                continue
            sensitive = any(key.lower() in SENSITIVE_QUERY_KEYS for key, _ in parse_qsl(parsed.query))
            collection_name = (row.get("Collection") or "").strip()
            collection = None if collection_name == "Unsorted" else f"links-{slug(collection_name)}"
            if collection_name == "Books":
                duplicate_books += 1
                if duplicate_books == 3:
                    collection = "links-books-2"
            image_name = Path((row.get("ImageFilename") or "").strip()).name
            image = None
            if args.image_dir and image_name and (args.image_dir / image_name).is_file():
                image = f"/rebuild/bookmark-images/{image_name}"
            else:
                image_url = (row.get("ImageURL") or "").strip()
                image_parsed = urlparse(image_url)
                if (
                    image_parsed.scheme == "https"
                    and image_parsed.hostname == "zyeuthooypsjclffmird.supabase.co"
                    and image_parsed.path.startswith("/storage/v1/object/public/bookmark-previews/")
                ):
                    # These are the already-generated public previews in the export.
                    # Browser image GETs use no metadata or AI generation credits.
                    image = image_url
            tags = [tag.strip() for tag in (row.get("Tags") or "").split(",") if tag.strip()]
            note = (row.get("Notes") or "").strip()
            card = {
                "id": f"bookmark-{index}",
                "kind": "link",
                "title": (row.get("Title") or "").strip() or parsed.hostname,
                "source": parsed.hostname.removeprefix("www."),
                "collection": collection,
                "date": "Saved",
            }
            if not sensitive:
                card["url"] = raw_url
            if image:
                card["image"] = image
            if tags:
                card["tags"] = tags
            if note:
                card["note"] = note
            cards.append(card)

    payload = gzip.compress(json.dumps(cards, ensure_ascii=False, separators=(",", ":")).encode())
    from base64 import b64encode
    encoded = b64encode(payload).decode("ascii")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for old in args.output_dir.glob("SAVERS_REBUILD_CARDS_*"):
        old.unlink()
    for index, start in enumerate(range(0, len(encoded), 12000)):
        (args.output_dir / f"SAVERS_REBUILD_CARDS_{index}").write_text(encoded[start:start + 12000])
    print(json.dumps({
        "cards": len(cards),
        "with_images": sum("image" in card for card in cards),
        "with_tags": sum("tags" in card for card in cards),
        "with_notes": sum("note" in card for card in cards),
        "sensitive_urls_redacted": sum("url" not in card for card in cards),
        "gzip_bytes": len(payload),
        "chunks": len(list(args.output_dir.glob("SAVERS_REBUILD_CARDS_*"))),
    }))


if __name__ == "__main__":
    main()
