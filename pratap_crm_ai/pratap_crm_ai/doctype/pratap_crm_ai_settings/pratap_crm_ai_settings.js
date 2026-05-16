// Copyright (c) 2026, Viv Choudhary and contributors
// For license information, please see license.txt

frappe.ui.form.on("Pratap CRM Ai Settings", {
	refresh(frm) {
		frm.add_custom_button(__("Open Business Card Scanner"), () => {
			frappe.set_route("crm-ai");
		});
	},
	validate(frm) {
		if (frm.doc.enable_openai && !frm.doc.openai_api_key) {
			frappe.throw(__("OpenAI API Key is required when OpenAI is enabled."));
		}
		if (frm.doc.enable_openai && !frm.doc.openai_model) {
			frappe.msgprint({
				title: __("Model not set"),
				message: __("Using default model: gpt-4.1-nano"),
				indicator: "blue",
			});
		}
	},
});
