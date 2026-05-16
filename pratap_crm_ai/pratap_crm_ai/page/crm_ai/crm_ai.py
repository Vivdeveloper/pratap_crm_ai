# Copyright (c) 2026, Viv Choudhary and contributors
# For license information, please see license.txt

import base64
import json
import os
import re

import frappe
import requests

SETTINGS_DOCTYPE = "Pratap CRM Ai Settings"
DEFAULT_OPENAI_MODEL = "gpt-4.1-nano"

PROSPECT_AI_FIELDS = (
	"company_name",
	"custom_contact_person",
	"custom_mobile_no",
	"custom_email",
	"custom_city",
	"custom_postal_code",
	"custom_country",
	"custom_remarks",
)

EXTRACT_PROMPT = (
	"Extract all details from the business card image(s). "
	"Return pure JSON only with these exact keys: "
	"company_name, custom_contact_person, custom_mobile_no, custom_email, "
	"custom_city, custom_postal_code, custom_country, custom_remarks. "
	"Use company_name for the organization on the card. "
	"Use custom_contact_person for the person's full name. "
	"Use custom_remarks for notes, remarks, or other text not mapped above. "
	"Put any remaining extra text under additional_info."
)


@frappe.whitelist()
def get_ai_settings():
	"""Return safe OpenAI settings for the CRM AI page (no API key)."""
	settings = frappe.get_single(SETTINGS_DOCTYPE)
	api_key = (settings.get("openai_api_key") or "").strip()
	model = (settings.get("openai_model") or "").strip() or DEFAULT_OPENAI_MODEL

	return {
		"enable_openai": bool(settings.get("enable_openai")),
		"openai_configured": bool(api_key and model),
		"openai_model": model,
	}


def _get_openai_config():
	settings = frappe.get_single(SETTINGS_DOCTYPE)
	if not settings.get("enable_openai"):
		frappe.throw(
			"OpenAI is disabled. Enable it in Pratap CRM Ai Settings.",
			title="AI Disabled",
		)

	api_key = (settings.get("openai_api_key") or "").strip()
	model = (settings.get("openai_model") or "").strip() or DEFAULT_OPENAI_MODEL

	if not api_key:
		frappe.throw("OpenAI API key is not configured in Pratap CRM Ai Settings.")
	if not model:
		frappe.throw("OpenAI model is not set in Pratap CRM Ai Settings.")

	return api_key, model


def _image_path_to_data_url(image_ref):
	if not image_ref:
		return None

	if image_ref.startswith("data:"):
		return image_ref

	if image_ref.startswith("http"):
		return requests.utils.requote_uri(image_ref)

	if not image_ref.startswith("/"):
		return frappe.utils.get_url(image_ref)

	is_private = "/private/files/" in image_ref
	filename = image_ref.split("/files/")[-1]
	file_path = frappe.get_site_path(
		"private" if is_private else "public", "files", filename
	)

	if not os.path.exists(file_path):
		return frappe.utils.get_url(image_ref)

	try:
		from io import BytesIO

		from PIL import Image

		with Image.open(file_path) as img:
			if img.mode in ("RGBA", "P"):
				img = img.convert("RGB")
			img.thumbnail((1024, 1024))
			buffer = BytesIO()
			img.save(buffer, format="JPEG", quality=80)
			encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
		return f"data:image/jpeg;base64,{encoded}"
	except Exception:
		with open(file_path, "rb") as handle:
			encoded = base64.b64encode(handle.read()).decode("utf-8")
		ext = os.path.splitext(filename)[1].lower().lstrip(".") or "jpeg"
		mime = "png" if ext == "png" else "jpeg"
		return f"data:image/{mime};base64,{encoded}"


def _parse_json_from_text(text):
	if not text:
		return {}
	match = re.search(r"\{[\s\S]*\}", text)
	if not match:
		return {}
	try:
		return json.loads(match.group(0))
	except json.JSONDecodeError:
		return {}


def _normalize_prospect_data(parsed):
	"""Map generic OCR keys to Prospect custom fields."""
	data = dict(parsed or {})

	if not data.get("company_name"):
		data["company_name"] = data.get("company") or data.get("organization")

	if not data.get("custom_contact_person"):
		first = (data.get("first_name") or "").strip()
		last = (data.get("last_name") or "").strip()
		full = " ".join(part for part in (first, last) if part).strip()
		data["custom_contact_person"] = full or data.get("contact_person") or data.get("name")

	if not data.get("custom_mobile_no"):
		data["custom_mobile_no"] = (
			data.get("mobile")
			or data.get("mobile_no")
			or data.get("phone")
			or data.get("whatsapp")
		)

	if not data.get("custom_email"):
		data["custom_email"] = data.get("email") or data.get("email_id")

	if not data.get("custom_city"):
		data["custom_city"] = data.get("city")

	if not data.get("custom_postal_code"):
		data["custom_postal_code"] = (
			data.get("postal_code") or data.get("pincode") or data.get("zip")
		)

	if not data.get("custom_country"):
		data["custom_country"] = data.get("country")

	if isinstance(data.get("custom_remarks"), dict):
		data["custom_remarks"] = json.dumps(data["custom_remarks"], ensure_ascii=False)

	if not data.get("custom_remarks"):
		data["custom_remarks"] = (
			data.get("remarks") or data.get("remark") or data.get("notes")
		)
		if not data.get("custom_remarks") and data.get("additional_info"):
			extra = data["additional_info"]
			data["custom_remarks"] = (
				json.dumps(extra, ensure_ascii=False)
				if isinstance(extra, dict)
				else str(extra)
			)

	return {key: data.get(key) for key in PROSPECT_AI_FIELDS if data.get(key)}


@frappe.whitelist()
def extract_business_card_data(front_image=None, back_image=None):
	"""Extract business card details using OpenAI vision."""
	front_url = _image_path_to_data_url(front_image)
	back_url = _image_path_to_data_url(back_image)

	if not front_url and not back_url:
		frappe.throw("Please upload at least one visiting card image (front or back).")

	api_key, model = _get_openai_config()

	content = [{"type": "input_text", "text": EXTRACT_PROMPT}]
	if front_url:
		content.append({"type": "input_image", "image_url": front_url})
	if back_url:
		content.append({"type": "input_image", "image_url": back_url})

	payload = {
		"model": model,
		"input": [{"role": "user", "content": content}],
	}

	try:
		response = requests.post(
			"https://api.openai.com/v1/responses",
			headers={
				"Content-Type": "application/json",
				"Authorization": f"Bearer {api_key}",
			},
			json=payload,
			timeout=120,
		)
		data = response.json()

		if not response.ok:
			message = data.get("error", {}).get("message", "OpenAI request failed")
			frappe.throw(message)

		text = ""
		for item in data.get("output", []):
			for block in item.get("content", []):
				if block.get("type") == "output_text":
					text += block.get("text", "")

		parsed = _normalize_prospect_data(_parse_json_from_text(text))

		return {
			"status": "success",
			"source": "openai",
			"raw_text": text,
			"parsed_data": parsed,
		}
	except frappe.ValidationError:
		raise
	except Exception as exc:
		frappe.log_error("Pratap CRM AI — OpenAI extract", frappe.get_traceback())
		frappe.throw(f"Error during OpenAI extraction: {exc}")


@frappe.whitelist()
def create_prospect(prospect_data, front_image=None, back_image=None):
	"""Insert parsed data into ERPNext Prospect."""
	if isinstance(prospect_data, str):
		try:
			prospect_data = json.loads(prospect_data)
		except Exception:
			frappe.throw("Invalid JSON for prospect_data")

	company_name = (prospect_data.get("company_name") or "").strip()
	if not company_name:
		frappe.throw(
			_("Company Name is required to create a Prospect."),
			title=_("Missing Company Name"),
		)

	meta = frappe.get_meta("Prospect")
	prospect_fields = {"doctype": "Prospect", "company_name": company_name}

	for fieldname in PROSPECT_AI_FIELDS:
		if fieldname == "company_name" or not meta.has_field(fieldname):
			continue
		value = (prospect_data.get(fieldname) or "").strip()
		if value:
			prospect_fields[fieldname] = value

	if meta.has_field("company") and not prospect_fields.get("company"):
		prospect_fields["company"] = frappe.defaults.get_user_default("Company")

	doc = frappe.get_doc(prospect_fields)
	doc.company_name = company_name
	doc.insert(ignore_permissions=True, ignore_mandatory=True)

	if not frappe.db.get_value("Prospect", doc.name, "company_name"):
		frappe.db.set_value("Prospect", doc.name, "company_name", company_name, update_modified=False)

	if front_image:
		file_url = _save_image(front_image, f"{doc.name}_front")
		if file_url:
			_attach_file_to_prospect(doc.name, file_url)

	if back_image:
		file_url = _save_image(back_image, f"{doc.name}_back")
		if file_url:
			_attach_file_to_prospect(doc.name, file_url)

	frappe.db.commit()
	return doc.name


def _save_image(image_data, file_base):
	if image_data.startswith("/") and "/files/" in image_data:
		return image_data

	if image_data.startswith("data:image"):
		try:
			header, encoded = image_data.split(",", 1)
			file_ext = "png" if "png" in header else "jpg"
			file_name = f"{file_base}.{file_ext}"
			file_path = frappe.utils.get_site_path("public", "files", file_name)
			with open(file_path, "wb") as handle:
				handle.write(base64.b64decode(encoded))
			return f"/files/{file_name}"
		except Exception as exc:
			frappe.log_error(f"Failed to save image {file_base}", str(exc))
			return None

	return None


def _attach_file_to_prospect(prospect_name, file_url):
	frappe.get_doc(
		{
			"doctype": "File",
			"file_url": file_url,
			"attached_to_doctype": "Prospect",
			"attached_to_name": prospect_name,
			"is_private": 0,
			"file_name": os.path.basename(file_url),
		}
	).insert(ignore_permissions=True)
