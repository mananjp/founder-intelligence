
"""Tests for the versioned YAML prompt registry."""

from pathlib import Path

import pytest

from fi_ai.prompts.registry import (
    PromptRegistryError,
    load_all_prompts,
    load_prompt,
)

VALID_PROMPT = """\
id: sample_prompt
version: 1
task: sample_task
input_schema:
  type: object
  properties:
    question:
      type: string
  required:
    - question
output_schema: SampleOutput
system: You are a helpful research assistant.
user_template: "Question: {question}"
eval_suite: golden/sample
"""


def write_prompt(directory: Path, filename: str, content: str) -> Path:
    """Create a prompt fixture inside a temporary directory."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / filename
    path.write_text(content, encoding="utf-8")
    return path


def test_load_existing_extract_evidence_prompt():
    """The existing extraction prompt should load successfully."""
    prompt = load_prompt("extract_evidence", 1)

    assert prompt.id == "extract_evidence"
    assert prompt.version == 1
    assert prompt.task == "extract_evidence"
    assert prompt.input_schema["type"] == "object"


def test_load_all_prompts_discovers_registered_prompts():
    """The registry should discover the existing YAML prompt files."""
    prompts = load_all_prompts()

    assert ("extract_evidence", 1) in prompts
    assert prompts[("extract_evidence", 1)].id == "extract_evidence"


def test_missing_prompt_version_raises_error(tmp_path: Path):
    """Requesting an unavailable version should fail explicitly."""
    with pytest.raises(PromptRegistryError, match="Prompt version not found"):
        load_prompt("sample_prompt", 2, tmp_path)


@pytest.mark.parametrize("prompt_id", ["", "Invalid-ID", "../sample"])
def test_invalid_prompt_id_raises_error(prompt_id: str):
    """Prompt IDs must follow the registry naming convention."""
    with pytest.raises(PromptRegistryError, match="Invalid prompt ID"):
        load_prompt(prompt_id, 1)


@pytest.mark.parametrize("version", [0, -1, True, 1.5, "1"])
def test_invalid_prompt_version_raises_error(version):
    """Prompt versions must be positive integers."""
    with pytest.raises(PromptRegistryError, match="positive integer"):
        load_prompt("sample_prompt", version)


def test_malformed_yaml_raises_error(tmp_path: Path):
    """Invalid YAML syntax should be rejected."""
    write_prompt(
        tmp_path,
        "sample_prompt.v1.yaml",
        "id: sample_prompt\nversion: [invalid",
    )

    with pytest.raises(PromptRegistryError, match="Could not read prompt file"):
        load_prompt("sample_prompt", 1, tmp_path)


def test_non_object_yaml_raises_error(tmp_path: Path):
    """A prompt file must contain a YAML object."""
    write_prompt(
        tmp_path,
        "sample_prompt.v1.yaml",
        "- item_one\n- item_two\n",
    )

    with pytest.raises(PromptRegistryError, match="YAML object"):
        load_prompt("sample_prompt", 1, tmp_path)


def test_missing_manifest_fields_raise_error(tmp_path: Path):
    """Required manifest fields must be present."""
    write_prompt(
        tmp_path,
        "sample_prompt.v1.yaml",
        "id: sample_prompt\nversion: 1\ntask: sample_task\n",
    )

    with pytest.raises(PromptRegistryError, match="Invalid prompt manifest"):
        load_prompt("sample_prompt", 1, tmp_path)


def test_invalid_input_schema_type_raises_error(tmp_path: Path):
    """The input schema must describe an object."""
    invalid_prompt = VALID_PROMPT.replace(
        "type: object",
        "type: array",
        1,
    )
    write_prompt(
        tmp_path,
        "sample_prompt.v1.yaml",
        invalid_prompt,
    )

    with pytest.raises(PromptRegistryError, match="Invalid prompt manifest"):
        load_prompt("sample_prompt", 1, tmp_path)


def test_invalid_required_schema_fields_raise_error(tmp_path: Path):
    """Required schema fields must exist in properties."""
    invalid_prompt = VALID_PROMPT.replace(
        "    - question",
        "    - missing_field",
    )
    write_prompt(
        tmp_path,
        "sample_prompt.v1.yaml",
        invalid_prompt,
    )

    with pytest.raises(PromptRegistryError, match="Invalid prompt manifest"):
        load_prompt("sample_prompt", 1, tmp_path)


def test_filename_and_manifest_must_match(tmp_path: Path):
    """The prompt ID and version must match the filename."""
    invalid_prompt = VALID_PROMPT.replace(
        "id: sample_prompt",
        "id: another_prompt",
    )
    write_prompt(
        tmp_path,
        "sample_prompt.v1.yaml",
        invalid_prompt,
    )

    with pytest.raises(
        PromptRegistryError,
        match="metadata does not match filename",
    ):
        load_prompt("sample_prompt", 1, tmp_path)


def test_load_all_prompts_rejects_missing_directory(tmp_path: Path):
    """The registry should reject a nonexistent prompt directory."""
    missing_directory = tmp_path / "missing"

    with pytest.raises(
        PromptRegistryError,
        match="Prompt directory does not exist",
    ):
        load_all_prompts(missing_directory)
