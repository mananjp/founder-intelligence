"""Outbound URL validation for the research fetch pipeline.

Fetches are driven by URLs discovered from untrusted web content, so every
request target must be checked before it reaches the network. This guards
against SSRF to loopback, private, link-local (cloud metadata) and reserved
addresses, non-HTTP schemes, and credential-bearing URLs.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

import structlog

log = structlog.get_logger()

ALLOWED_SCHEMES = frozenset({"http", "https"})
BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "localhost.localdomain",
        "metadata",
        "metadata.google.internal",
        "instance-data",
    }
)


class UnsafeUrlError(ValueError):
    """Raised when an outbound URL fails SSRF validation."""


def _is_public_ip(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def _check_ip(raw: str, original_url: str) -> None:
    address = ipaddress.ip_address(raw)
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        address = address.ipv4_mapped
    if not _is_public_ip(address):
        raise UnsafeUrlError(f"Refusing to fetch non-public address {address} ({original_url})")


def _resolve(host: str, port: int, original_url: str) -> None:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Could not resolve {host} ({original_url}): {exc}") from exc

    if not infos:
        raise UnsafeUrlError(f"Host {host} did not resolve ({original_url})")

    for info in infos:
        _check_ip(info[4][0], original_url)


def validate_outbound_url(url: str, *, resolve_dns: bool = True) -> str:
    """Validate an absolute URL before fetching it.

    Returns the original URL on success and raises :class:`UnsafeUrlError`
    otherwise. ``resolve_dns`` performs a DNS lookup so hostnames resolving to
    internal addresses (including DNS-rebinding style answers) are rejected.
    """
    parts = urlsplit(url.strip())
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeUrlError(f"Unsupported URL scheme {parts.scheme!r} ({url})")
    if parts.username or parts.password:
        raise UnsafeUrlError(f"URL credentials are not allowed ({url})")

    host = parts.hostname
    if not host:
        raise UnsafeUrlError(f"URL has no host ({url})")

    normalized_host = host.rstrip(".").lower()
    if normalized_host in BLOCKED_HOSTNAMES or normalized_host.endswith(".localhost"):
        raise UnsafeUrlError(f"Refusing to fetch local host {host} ({url})")

    port = parts.port or (443 if parts.scheme.lower() == "https" else 80)

    try:
        literal = ipaddress.ip_address(normalized_host)
    except ValueError:
        literal = None

    if literal is not None:
        _check_ip(str(literal), url)
    elif resolve_dns:
        _resolve(normalized_host, port, url)

    return url
