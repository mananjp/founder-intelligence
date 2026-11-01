"""Readability extraction using trafilatura."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

import trafilatura
from trafilatura.metadata import extract_metadata


@dataclass(frozen=True, slots=True)
class ExtractedContent:
    text: str
    title: str | None = None
    publisher: str | None = None
    published_at: date | None = None


def extract_readability(html: str, url: str | None = None) -> ExtractedContent:
    """Extract clean readable text and metadata from HTML using trafilatura."""
    if not html or not html.strip():
        return ExtractedContent(text="")

    extracted_text = trafilatura.extract(
        html,
        url=url,
        include_comments=False,
        include_tables=True,
        no_fallback=False,
    )

    metadata = extract_metadata(html, default_url=url)
    title = metadata.title if metadata and metadata.title else None
    publisher = metadata.sitename if metadata and metadata.sitename else None
    published_at = None

    if metadata and metadata.date:
        try:
            published_at = date.fromisoformat(metadata.date[:10])
        except (ValueError, TypeError):
            published_at = None

    # Fallback if trafilatura extraction returned None
    if not extracted_text:
        # Strip HTML tags as basic fallback
        stripped = re.sub(r"<[^>]+>", " ", html)
        extracted_text = " ".join(stripped.split())

    return ExtractedContent(
        text=extracted_text or "",
        title=title,
        publisher=publisher,
        published_at=published_at,
    )
