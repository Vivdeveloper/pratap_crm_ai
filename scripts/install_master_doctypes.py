"""Build master DocType folders in pratap_crm_ai from /tmp export-json files."""

import json
import re
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1] / "pratap_crm_ai" / "pratap_crm_ai"
DOCTYPE_ROOT = APP_ROOT / "doctype"
EXPORTS = {
	"Customer Segment": Path("/tmp/dt_customer_segment.json"),
	"Customer Source": Path("/tmp/dt_customer_source.json"),
	"Sub-category": Path("/tmp/dt_sub-category.json"),
	"Customer Sub-type": Path("/tmp/dt_customer_sub-type.json"),
	"Customer Status": Path("/tmp/dt_customer_status.json"),
	"Region": Path("/tmp/dt_region.json"),
	"Cities": Path("/tmp/dt_cities.json"),
	"Pincode": Path("/tmp/dt_pincode.json"),
	"Sales person CM": Path("/tmp/dt_sales_person_cm.json"),
}

FIELD_STRIP = {
	"parent",
	"parentfield",
	"parenttype",
	"name",
	"creation",
	"modified",
	"owner",
	"modified_by",
	"docstatus",
	"idx",
}


def scrub(name: str) -> str:
	return re.sub(r"[^\w]+", "_", name).strip("_").lower()


def clean_field(field: dict) -> dict:
	return {k: v for k, v in field.items() if k not in FIELD_STRIP}


def clean_doctype(doc: dict) -> dict:
	doc = {k: v for k, v in doc.items() if not k.startswith("_")}
	doc["module"] = "Pratap Crm Ai"
	doc["custom"] = 0
	doc["fields"] = [clean_field(f) for f in doc.get("fields", [])]
	if not doc.get("permissions") and not doc.get("istable"):
		doc["permissions"] = [
			{
				"role": "System Manager",
				"read": 1,
				"write": 1,
				"create": 1,
				"delete": 1,
				"export": 1,
				"print": 1,
				"email": 1,
				"report": 1,
				"share": 1,
			},
			{
				"role": "Sales User",
				"read": 1,
				"write": 1,
				"create": 1,
				"delete": 0,
				"export": 1,
				"print": 1,
				"email": 1,
				"report": 1,
				"share": 1,
			},
		]
	return doc


def write_doctype(name: str, export_path: Path) -> None:
	with export_path.open() as f:
		doc = json.load(f)[0]

	doc = clean_doctype(doc)
	folder = scrub(name)
	target_dir = DOCTYPE_ROOT / folder
	target_dir.mkdir(parents=True, exist_ok=True)

	(target_dir / "__init__.py").write_text("")
	(target_dir / f"{folder}.json").write_text(json.dumps(doc, indent=1) + "\n")

	class_name = "".join(part.capitalize() for part in folder.split("_"))
	py_path = target_dir / f"{folder}.py"
	if not py_path.exists():
		py_path.write_text(
			f"import frappe\n\n\nclass {class_name}(frappe.model.document.Document):\n\tpass\n"
		)

	print(f"Wrote {name} -> {target_dir}")


def main() -> None:
	DOCTYPE_ROOT.mkdir(parents=True, exist_ok=True)
	(DOCTYPE_ROOT / "__init__.py").touch(exist_ok=True)
	for name, path in EXPORTS.items():
		if not path.exists():
			raise FileNotFoundError(path)
		write_doctype(name, path)


if __name__ == "__main__":
	main()
