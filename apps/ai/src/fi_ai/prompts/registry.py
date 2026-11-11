
"""Versioned YAML prompt registry.

Prompt files follow the naming convention:
    {prompt_id}.v{version}.yaml

Callers must request an explicit version so prompt changes are reproducible.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    model_validator,
)

PROMPTS_DIR = Path(__file__).resolve().parent

PROMPT_FILENAME = re.compile(
    r"^(?P<id>[a-z][a-z0-9_]*)\.v(?P<version>[1-9]\d*)\.yaml$"
)


class PromptRegistryError(Exception):
    """Raised when a prompt cannot be loaded or validated."""


class PromptManifest(BaseModel):
    """Validated metadata and content for one versioned prompt."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    version: int = Field(ge=1, strict=True)
    task: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    input_schema: dict[str, Any]
    output_schema: str = Field(min_length=1)
    system: str = Field(min_length=1)
    user_template: str = Field(min_length=1)
    eval_suite: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_input_schema(self) -> PromptManifest:
        """Require input_schema to describe a valid JSON object shape."""
        if self.input_schema.get("type") != "object":
            raise ValueError("input_schema.type must be 'object'")

        properties = self.input_schema.get("properties")

        if not isinstance(properties, dict):
            raise TypeError("input_schema.properties must be an object")

        required = self.input_schema.get("required", [])

        if not isinstance(required, list) or not all(
            isinstance(item, str) for item in required
        ):
            raise ValueError("input_schema.required must be a list of strings")

        unknown_required = set(required) - set(properties)

        if unknown_required:
            raise ValueError(
                "input_schema.required contains unknown fields: "
                f"{sorted(unknown_required)}"
            )

        return self


def _read_manifest(path: Path) -> PromptManifest:
    """Read one YAML file and validate its manifest."""
    try:
        with path.open("r", encoding="utf-8") as file:
            data = yaml.safe_load(file)
    except (OSError, yaml.YAMLError) as exc:
        raise PromptRegistryError(
            f"Could not read prompt file {path}: {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise PromptRegistryError(
            f"Prompt file must contain a YAML object: {path}"
        )

    try:
        manifest = PromptManifest.model_validate(data)
    except (ValidationError, TypeError) as exc:
        raise PromptRegistryError(
            f"Invalid prompt manifest {path}: {exc}"
        ) from exc

    match = PROMPT_FILENAME.fullmatch(path.name)

    if match is None:
        raise PromptRegistryError(
            f"Invalid prompt filename {path.name!r}; "
            "expected '<prompt_id>.v<version>.yaml'"
        )

    filename_id = match.group("id")
    filename_version = int(match.group("version"))

    if manifest.id != filename_id or manifest.version != filename_version:
        raise PromptRegistryError(
            f"Prompt metadata does not match filename: {path.name}"
        )

    return manifest


def load_prompt(
    prompt_id: str,
    version: int,
    prompts_dir: Path | None = None,
) -> PromptManifest:
    """Load one explicitly pinned prompt version."""
    if not re.fullmatch(r"[a-z][a-z0-9_]*", prompt_id):
        raise PromptRegistryError(f"Invalid prompt ID: {prompt_id!r}")

    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise PromptRegistryError(
            "Prompt version must be a positive integer"
        )

    root = prompts_dir if prompts_dir is not None else PROMPTS_DIR
    path = root / f"{prompt_id}.v{version}.yaml"

    if not path.is_file():
        raise PromptRegistryError(
            f"Prompt version not found: {prompt_id} v{version}"
        )

    return _read_manifest(path)


def load_all_prompts(
    prompts_dir: Path | None = None,
) -> dict[tuple[str, int], PromptManifest]:
    """Load all valid prompt manifests."""
    root = prompts_dir if prompts_dir is not None else PROMPTS_DIR

    if not root.is_dir():
        raise PromptRegistryError(
            f"Prompt directory does not exist: {root}"
        )

    manifests: dict[tuple[str, int], PromptManifest] = {}

    for path in sorted(root.glob("*.yaml")):
        manifest = _read_manifest(path)
        key = (manifest.id, manifest.version)

        if key in manifests:
            raise PromptRegistryError(
                f"Duplicate prompt version detected: "
                f"{manifest.id} v{manifest.version}"
            )

        manifests[key] = manifest

    return manifests
