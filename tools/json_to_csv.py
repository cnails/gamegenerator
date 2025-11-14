#!/usr/bin/env python3
"""Tool to convert JSON balance files to CSV for easy editing."""

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any, Dict, List


def flatten_dict(d: Dict[str, Any], parent_key: str = "", sep: str = ".") -> Dict[str, Any]:
    """Flatten nested dictionary."""
    items: List[tuple[str, Any]] = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        elif isinstance(v, list):
            items.append((new_key, json.dumps(v)))
        else:
            items.append((new_key, v))
    return dict(items)


def json_to_csv(json_path: Path, csv_path: Path) -> None:
    """Convert JSON file to CSV."""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Determine structure
    if isinstance(data, dict):
        # Check if it's a collection (enemies, weapons, perks)
        if "perks" in data or "base_weapons" in data or any(
            isinstance(v, dict) and "name" in v for v in data.values()
        ):
            # Collection format
            rows = []
            all_keys = set()

            # Collect all keys from all items
            for item_id, item_data in data.items():
                if isinstance(item_data, dict):
                    flattened = flatten_dict(item_data)
                    all_keys.update(flattened.keys())

            # Sort keys for consistent output
            sorted_keys = sorted(all_keys)
            header = ["id"] + sorted_keys

            # Create rows
            for item_id, item_data in data.items():
                if isinstance(item_data, dict):
                    flattened = flatten_dict(item_data)
                    row = [item_id] + [flattened.get(k, "") for k in sorted_keys]
                    rows.append(row)

            # Write CSV
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(header)
                writer.writerows(rows)
        else:
            # Nested structure (weapons.json with sections)
            # Handle each section separately
            sections = {}
            for key, value in data.items():
                if isinstance(value, dict):
                    sections[key] = value

            # Write each section to separate CSV
            for section_name, section_data in sections.items():
                section_csv_path = csv_path.parent / f"{csv_path.stem}_{section_name}{csv_path.suffix}"
                rows = []
                all_keys = set()

                for item_id, item_data in section_data.items():
                    if isinstance(item_data, dict):
                        flattened = flatten_dict(item_data)
                        all_keys.update(flattened.keys())

                sorted_keys = sorted(all_keys)
                header = ["id"] + sorted_keys

                for item_id, item_data in section_data.items():
                    if isinstance(item_data, dict):
                        flattened = flatten_dict(item_data)
                        row = [item_id] + [flattened.get(k, "") for k in sorted_keys]
                        rows.append(row)

                with open(section_csv_path, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(header)
                    writer.writerows(rows)

                print(f"Created {section_csv_path}")


def csv_to_json(csv_path: Path, json_path: Path, structure_type: str = "collection") -> None:
    """Convert CSV file back to JSON."""
    rows = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    if not rows:
        print("No data found in CSV")
        return

    # Reconstruct nested structure
    result = {}
    for row in rows:
        item_id = row.pop("id", "")
        if not item_id:
            continue

        # Reconstruct nested dict from flattened keys
        item_data: Dict[str, Any] = {}
        for key, value in row.items():
            if not value:
                continue

            # Split key by dots to create nested structure
            parts = key.split(".")
            current = item_data
            for i, part in enumerate(parts[:-1]):
                if part not in current:
                    current[part] = {}
                current = current[part]

            # Try to parse value
            final_key = parts[-1]
            try:
                # Try JSON parsing for lists/dicts
                parsed_value = json.loads(value)
                current[final_key] = parsed_value
            except (json.JSONDecodeError, ValueError):
                # Try number parsing
                try:
                    if "." in value:
                        current[final_key] = float(value)
                    else:
                        current[final_key] = int(value)
                except ValueError:
                    # Try boolean
                    if value.lower() == "true":
                        current[final_key] = True
                    elif value.lower() == "false":
                        current[final_key] = False
                    else:
                        current[final_key] = value

        result[item_id] = item_data

    # Write JSON
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Created {json_path}")


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Convert JSON balance files to/from CSV")
    parser.add_argument("input", type=str, help="Input file path (JSON or CSV)")
    parser.add_argument("-o", "--output", type=str, help="Output file path (optional)")
    parser.add_argument(
        "--to-csv", action="store_true", help="Convert JSON to CSV (default if input is JSON)"
    )
    parser.add_argument(
        "--to-json", action="store_true", help="Convert CSV to JSON (default if input is CSV)"
    )

    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File {input_path} does not exist")
        sys.exit(1)

    # Determine conversion direction
    if input_path.suffix == ".json":
        to_csv = not args.to_json
        default_output = input_path.with_suffix(".csv")
    elif input_path.suffix == ".csv":
        to_csv = False
        default_output = input_path.with_suffix(".json")
    else:
        print("Error: Input file must be .json or .csv")
        sys.exit(1)

    output_path = Path(args.output) if args.output else default_output

    if to_csv:
        json_to_csv(input_path, output_path)
        print(f"Converted {input_path} -> {output_path}")
    else:
        csv_to_json(input_path, output_path)
        print(f"Converted {input_path} -> {output_path}")


if __name__ == "__main__":
    main()

