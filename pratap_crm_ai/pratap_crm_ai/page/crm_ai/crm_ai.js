frappe.pages["crm-ai"].on_page_load = function (wrapper) {
	const PAGE_METHOD = "pratap_crm_ai.pratap_crm_ai.page.crm_ai.crm_ai";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Business Card Scanner — Prospect"),
		single_column: true,
	});

	page.set_primary_action(__("View Prospects"), () => frappe.set_route("List", "Prospect"), "list");
	page.set_secondary_action(__("New scan"), () => resetForm(true), "refresh");

	$(`
		<div class="pratap-crm-ai-page row p-3">
			<div class="col-lg-6">
				<div class="card p-3 shadow-sm mb-3">
					<h5 class="mb-3">${__("Visiting card images")}</h5>
					<div id="card_image_fields"></div>
					<button id="extractBtn" class="btn btn-dark w-100 mt-3">
						<span class="mr-1">🔍</span> ${__("Extract & Auto-Fill")}
					</button>
					<div class="row mt-3">
						<div class="col-6">
							<div class="small text-muted fw-semibold mb-2">${__("Front preview")}</div>
							<div id="front_preview" class="text-center border rounded bg-light p-2" style="min-height:6rem;">
								<span class="text-muted small">${__("No image yet")}</span>
							</div>
						</div>
						<div class="col-6">
							<div class="small text-muted fw-semibold mb-2">${__("Back preview")}</div>
							<div id="back_preview" class="text-center border rounded bg-light p-2" style="min-height:6rem;">
								<span class="text-muted small">${__("No image yet")}</span>
							</div>
						</div>
					</div>
					<div id="ocr-status" class="small text-muted mt-2"></div>
					<div id="ai-settings-banner" class="alert alert-warning py-2 px-3 small mt-2" style="display:none;"></div>
				</div>
			</div>
			<div class="col-lg-6">
				<div class="card p-3 shadow-sm mb-3" id="prospect-output">
					<div id="prospect-success-slot" class="mb-0"></div>
					<h4 class="mb-3">📇 ${__("Prospect Details")}</h4>
					<div id="prospect-fields" class="mb-3"></div>
					<div id="extra-info" class="mb-3" style="display:none;">
						<h6>${__("Additional info from card")}</h6>
						<div id="extra-info-text" class="bg-light border p-2 rounded small"
							style="max-height:180px;overflow:auto;white-space:pre-wrap;font-family:monospace;"></div>
					</div>
					<button class="btn btn-success w-100" id="saveProspectBtn">
						💾 ${__("Insert into ERPNext Prospect")}
					</button>
					<div id="prospect-insert-msg" class="mt-3"></div>
				</div>
				<div class="card p-3 shadow-sm" id="ocr-raw-card" style="display:none;">
					<h6 class="d-flex justify-content-between align-items-center mb-2">
						${__("Full AI output")}
						<button class="btn btn-sm btn-outline-secondary" id="toggle-ocr">${__("Hide")}</button>
					</h6>
					<pre id="ocr-raw-text" class="bg-light p-2 rounded small mb-0"
						style="max-height:220px;overflow:auto;white-space:pre-wrap;"></pre>
				</div>
			</div>
		</div>
	`).appendTo(page.body);

	const PROSPECT_LAYOUT_FIELDS = [
		{
			fieldname: "company_name",
			fieldtype: "Data",
			label: `🏢 ${__("Company Name")}`,
			reqd: 1,
		},
		{
			fieldname: "custom_contact_person",
			fieldtype: "Data",
			label: `👤 ${__("Contact Person")}`,
		},
		{
			fieldname: "custom_mobile_no",
			fieldtype: "Data",
			label: `📱 ${__("Mobile No")}`,
			options: "Phone",
		},
		{
			fieldname: "custom_email",
			fieldtype: "Data",
			label: `✉️ ${__("Email")}`,
			options: "Email",
		},
		{ fieldname: "__col_break", fieldtype: "Column Break" },
		{
			fieldname: "custom_city",
			fieldtype: "Data",
			label: `📍 ${__("City")}`,
		},
		{
			fieldname: "custom_postal_code",
			fieldtype: "Data",
			label: `📮 ${__("Postal Code")}`,
		},
		{
			fieldname: "custom_country",
			fieldtype: "Data",
			label: `🌍 ${__("Country")}`,
		},
		{
			fieldname: "custom_remarks",
			fieldtype: "Small Text",
			label: `📝 ${__("Remarks")}`,
		},
	];

	const LAYOUT_ONLY = ["Column Break", "Section Break", "Tab Break", "Page Break", "Fold"];
	const PROSPECT_FIELD_KEYS = PROSPECT_LAYOUT_FIELDS.filter(
		(f) => f.fieldname && !LAYOUT_ONLY.includes(f.fieldtype)
	).map((f) => f.fieldname);

	const prospectLayout = new frappe.ui.form.Layout({
		body: page.body.find("#prospect-fields"),
		fields: PROSPECT_LAYOUT_FIELDS,
		doctype: "Prospect",
	});
	prospectLayout.make();
	prospectLayout.refresh();
	const prospectControls = prospectLayout.fields_dict;

	const cardImageLayout = new frappe.ui.form.Layout({
		body: page.body.find("#card_image_fields"),
		fields: [
			{
				fieldname: "front_image",
				fieldtype: "Attach Image",
				label: __("Front of card"),
				options: { make_attachments_public: true, allow_toggle_private: false },
			},
			{ fieldname: "__card_image_col", fieldtype: "Column Break" },
			{
				fieldname: "back_image",
				fieldtype: "Attach Image",
				label: __("Back of card"),
				options: { make_attachments_public: true, allow_toggle_private: false },
			},
		],
		doctype: "Prospect",
	});
	cardImageLayout.make();
	cardImageLayout.refresh();

	const frontCtrl = cardImageLayout.fields_dict.front_image;
	const backCtrl = cardImageLayout.fields_dict.back_image;

	function updatePreview(ctrl, selector) {
		const $box = page.body.find(selector);
		const url = ctrl.get_value();
		if (!url) {
			$box.html(`<span class="text-muted small">${__("No image yet")}</span>`);
			return;
		}
		const fullUrl = frappe.urllib.get_full_url(url);
		const safe = frappe.utils.escape_html(fullUrl);
		$box.html(
			`<a href="${safe}" target="_blank" rel="noopener noreferrer">` +
				`<img src="${safe}" class="img-fluid rounded" style="max-height:160px;object-fit:contain" alt="">` +
				`</a>`
		);
	}

	function watchPreview(parentSel, ctrl, previewSel) {
		const parent = page.body.find(parentSel)[0];
		if (!parent) return;
		new MutationObserver(() => updatePreview(ctrl, previewSel)).observe(parent, {
			subtree: true,
			childList: true,
			attributes: true,
		});
		updatePreview(ctrl, previewSel);
	}

	watchPreview("#card_image_fields", frontCtrl, "#front_preview");
	watchPreview("#card_image_fields", backCtrl, "#back_preview");

	let aiSettings = { enable_openai: false, openai_configured: false };

	function refreshSettingsBanner() {
		const $banner = page.body.find("#ai-settings-banner");
		if (aiSettings.enable_openai && aiSettings.openai_configured) {
			$banner.hide();
			return;
		}
		let msg = __("OpenAI is disabled.");
		if (aiSettings.enable_openai && !aiSettings.openai_configured) {
			msg = __("OpenAI is enabled but API key or model is missing in Pratap CRM Ai Settings.");
		}
		$banner
			.html(`${msg} <a href="/app/pratap-crm-ai-settings">${__("Open settings")}</a>`)
			.show();
	}

	frappe.call({
		method: `${PAGE_METHOD}.get_ai_settings`,
		callback(r) {
			aiSettings = r.message || aiSettings;
			refreshSettingsBanner();
		},
	});

	function showProspectSuccessBanner(prospectName) {
		const safe = frappe.utils.escape_html(prospectName);
		const href = `/app/prospect/${encodeURIComponent(prospectName)}`;
		page.body.find("#prospect-success-slot").html(
			`<div class="alert alert-success prospect-success-banner d-flex justify-content-between align-items-center shadow-sm fade show mb-3"
				style="border-radius:10px;">
				<div>✅ <strong>${__("Prospect")}</strong> <b>${safe}</b> ${__("created successfully.")}</div>
				<a href="${href}" target="_blank" class="btn btn-sm btn-dark">🔗 ${__("Open")}</a>
			</div>`
		);
	}

	function resetForm(showToast = false, keepImages = false, clearSuccessBanner = true) {
		PROSPECT_FIELD_KEYS.forEach((key) => {
			const c = prospectControls[key];
			if (c && c.set_value) c.set_value("");
		});
		page.body.find("#ocr-status, #prospect-insert-msg, #extra-info-text").empty();
		page.body.find("#ocr-raw-text").empty();
		page.body.find("#extra-info, #ocr-raw-card").hide();
		if (clearSuccessBanner) {
			page.body.find("#prospect-success-slot").empty();
		}

		if (!keepImages) {
			frontCtrl.set_value("");
			backCtrl.set_value("");
		}

		prospectLayout.refresh();
		cardImageLayout.refresh();
		updatePreview(frontCtrl, "#front_preview");
		updatePreview(backCtrl, "#back_preview");

		if (showToast) {
			frappe.show_alert({
				message: __("Ready for a new business card scan"),
				indicator: "blue",
			});
		}
	}

	function fillProspectFields(parsed) {
		if (!parsed || typeof parsed !== "object") return;

		let filled = 0;
		for (const key of PROSPECT_FIELD_KEYS) {
			const val = parsed[key];
			if (val && prospectControls[key]) {
				prospectControls[key].set_value(val);
				filled++;
			}
		}

		if (
			parsed.additional_info &&
			!prospectControls.custom_remarks?.get_value?.()
		) {
			const extra =
				typeof parsed.additional_info === "string"
					? parsed.additional_info
					: JSON.stringify(parsed.additional_info, null, 2);
			if (prospectControls.custom_remarks) {
				prospectControls.custom_remarks.set_value(extra);
				filled++;
			}
		}

		if (parsed.additional_info && Object.keys(parsed.additional_info).length) {
			page.body.find("#extra-info").show();
			page.body.find("#extra-info-text").text(
				typeof parsed.additional_info === "string"
					? parsed.additional_info
					: JSON.stringify(parsed.additional_info, null, 2)
			);
		} else {
			page.body.find("#extra-info").hide();
		}

		frappe.show_alert({
			message: __("Auto-filled {0} field(s)", [filled]),
			indicator: filled ? "green" : "orange",
		});
	}

	page.body.find("#extractBtn").on("click", function () {
		const front = frontCtrl.get_value();
		const back = backCtrl.get_value();
		if (!front && !back) {
			frappe.msgprint(__("Please upload the front or back of the visiting card."));
			return;
		}

		if (!aiSettings.enable_openai || !aiSettings.openai_configured) {
			frappe.msgprint({
				title: __("AI not configured"),
				message: __("Enable OpenAI and set API key + model in Pratap CRM Ai Settings."),
				indicator: "orange",
			});
			return;
		}

		const $btn = $(this);
		resetForm(false, true);
		page.body.find("#ocr-status").text(__("Extracting contact details using AI…"));
		$btn.prop("disabled", true);

		frappe.call({
			method: `${PAGE_METHOD}.extract_business_card_data`,
			args: { front_image: front || null, back_image: back || null },
			freeze: true,
			freeze_message: __("Analyzing business card…"),
			callback(r) {
				$btn.prop("disabled", false);
				const msg = r.message;
				if (!msg || msg.status === "disabled") {
					page.body
						.find("#ocr-status")
						.html(`<span class="text-danger">${__("AI extraction is not available.")}</span>`);
					return;
				}

				page.body.find("#ocr-raw-text").text(msg.raw_text || "");
				page.body.find("#ocr-raw-card").show();
				fillProspectFields(msg.parsed_data || {});
				page.body.find("#ocr-status").text(__("Data extracted successfully."));
			},
			error(err) {
				$btn.prop("disabled", false);
				page.body
					.find("#ocr-status")
					.html(
						`<span class="text-danger">${frappe.utils.escape_html(err.message || "")}</span>`
					);
			},
		});
	});

	page.body.find("#toggle-ocr").on("click", function () {
		const $raw = page.body.find("#ocr-raw-text");
		$raw.toggle();
		$(this).text($raw.is(":visible") ? __("Hide") : __("Show"));
	});

	page.body.find("#saveProspectBtn").on("click", () => {
		const company_name = (prospectControls.company_name.get_value() || "").trim();
		if (!company_name) {
			frappe.msgprint(__("Company Name is required."));
			return;
		}

		const prospect_data = {};
		for (const key of PROSPECT_FIELD_KEYS) {
			prospect_data[key] = (prospectControls[key].get_value() || "").trim();
		}

		saveProspect(prospect_data);
	});

	function saveProspect(prospect_data) {
		frappe.call({
			method: `${PAGE_METHOD}.create_prospect`,
			args: {
				prospect_data: JSON.stringify(prospect_data),
				front_image: frontCtrl.get_value() || null,
				back_image: backCtrl.get_value() || null,
			},
			freeze: true,
			freeze_message: __("Creating Prospect…"),
			callback(r) {
				const $msg = page.body.find("#prospect-insert-msg");
				$msg.empty();
				if (r.message) {
					showProspectSuccessBanner(r.message);
					resetForm(false, false, false);
					frappe.show_alert({
						message: __("Prospect saved successfully"),
						indicator: "green",
					});
				} else {
					page.body.find("#prospect-success-slot").empty();
					$msg.html(
						`<div class="alert alert-danger">${__("Failed to create Prospect.")}</div>`
					);
				}
			},
			error(err) {
				if (err?.message) {
					page.body.find("#prospect-insert-msg").html(
						`<div class="alert alert-danger">${frappe.utils.escape_html(err.message)}</div>`
					);
				}
			},
		});
	}
};
