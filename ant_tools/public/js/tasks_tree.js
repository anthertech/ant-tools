frappe.provide("frappe.treeview_settings");

(function () {
	const base = frappe.treeview_settings["Task"] || {};
	const base_onrender = base.onrender;

	frappe.treeview_settings["Task"] = Object.assign({}, base, {
		get_tree_nodes: "ant_tools.overrides.task_tree.get_children",

		onrender: function (node) {
			// Keep Frappe's original tree rendering
			if (base_onrender) {
				base_onrender(node);
			}

			render_task_row(node);
		},
	});
})();


/* =========================================================
   RENDER TASK ROW
   ========================================================= */

function render_task_row(node) {

	if (node.is_root) {
		return;
	}

	const node_data = node.data || {};

	if (!node_data.value) {
		return;
	}

	const task_name = node_data.value;

	const $li = $(node.parent);

	if (!$li.length) {
		return;
	}


	/*
	 * First render using the data already available
	 * in the tree.
	 */
	render_task_row_data(node, node_data);


	/*
	 * Fetch the latest values from Task master.
	 *
	 * This ensures that if the Task was edited,
	 * the tree displays the latest:
	 *
	 * - Status
	 * - Progress
	 * - Expected Start Date
	 * - Expected End Date
	 * - Assigned Users
	 */
	frappe.db
		.get_value(
			"Task",
			task_name,
			[
				"status",
				"progress",
				"exp_start_date",
				"exp_end_date",
				"_assign"
			]
		)
		.then((r) => {

			if (!r || !r.message) {
				return;
			}

			/*
			 * Make sure the row still exists.
			 */
			if (!document.body.contains($li[0])) {
				return;
			}


			/*
			 * Merge latest Task master values
			 * with the existing tree data.
			 */
			const latest_data = {
				...node_data,
				...r.message
			};


			/*
			 * Update node data as well.
			 */
			node.data = latest_data;


			/*
			 * Render again using the latest
			 * Task master values.
			 */
			render_task_row_data(
				node,
				latest_data
			);
		})
		.catch((error) => {

			console.error(
				"Could not fetch latest Task data:",
				error
			);

		});
}


/* =========================================================
   RENDER TASK DATA
   ========================================================= */

function render_task_row_data(node, d) {

	const $li = $(node.parent);

	if (!$li.length) {
		return;
	}


	/* =========================================================
	   REMOVE PREVIOUS CUSTOM ELEMENTS
	   ========================================================= */

	$li.find(".task-tree-right").remove();

	$li.find(".task-tree-dates").remove();


	/* =========================================================
	   DATES
	   ========================================================= */

	let date_parts = [];


	if (d.exp_start_date) {

		date_parts.push(
			__("Exp. Start") +
				": " +
				frappe.datetime.str_to_user(
					d.exp_start_date
				)
		);
	}


	if (d.exp_end_date) {

		date_parts.push(
			__("Exp. End") +
				": " +
				frappe.datetime.str_to_user(
					d.exp_end_date
				)
		);
	}


	if (date_parts.length) {

		const $dates = $(`
			<div class="task-tree-dates">
				${date_parts.join(" &nbsp;|&nbsp; ")}
			</div>
		`);

		$dates.insertBefore(node.$ul);
	}


	/* =========================================================
	   PROGRESS
	   ========================================================= */

	const percentage = flt(
		d.progress || 0
	);


	const safe_percentage = Math.min(
		Math.max(percentage, 0),
		100
	);


	/* =========================================================
	   STATUS
	   ========================================================= */

	/*
	 * IMPORTANT:
	 *
	 * Status comes DIRECTLY from Task master.
	 *
	 * No Overdue calculation.
	 * No custom status.
	 * No date-based status.
	 */

	const status = d.status || "Open";

	const status_color = get_status_color(
		status
	);


	/* =========================================================
	   ASSIGNEES
	   ========================================================= */

	let assignees = [];


	try {

		if (d._assign) {

			if (Array.isArray(d._assign)) {

				assignees = d._assign;

			} else {

				assignees = JSON.parse(
					d._assign
				);
			}
		}

	} catch (e) {

		console.warn(
			"Could not parse Task _assign:",
			e
		);

		assignees = [];
	}


	/* =========================================================
	   RIGHT SIDE
	   ========================================================= */

	const $right = $(`
		<div class="task-tree-right">

			<!-- =========================
			     PROGRESS
			     ========================= -->

			<div class="task-tree-progress">

				<div class="progress-bar-outer">

					<div
						class="progress-bar-inner"
						style="
							width: ${safe_percentage}%;
							background: ${get_progress_color(
								percentage
							)};
						"
					></div>

				</div>


				<span class="task-tree-percent">
					${percentage}%
				</span>

			</div>


			<!-- =========================
			     ASSIGNEES
			     ========================= -->

			<div class="task-tree-avatars"></div>


			<!-- =========================
			     STATUS
			     ========================= -->

			<div
				class="indicator-pill ${status_color} task-tree-status"
			>
				${__(status)}
			</div>

		</div>
	`);


	/* =========================================================
	   RENDER AVATARS
	   ========================================================= */

	if (assignees.length) {

		try {

			$right
				.find(".task-tree-avatars")
				.html(
					frappe.avatar_group(
						assignees,
						3,
						{
							align: "left"
						}
					)
				);

		} catch (e) {

			console.warn(
				"Could not render Task avatars:",
				e
			);

		}
	}


	/* =========================================================
	   INSERT RIGHT SIDE
	   ========================================================= */

	$right.insertBefore(node.$ul);
}


/* =========================================================
   STATUS COLOR
   ========================================================= */

/*
 * This function ONLY controls the visual color.
 *
 * It does NOT change the Task status.
 */

function get_status_color(status) {

	const map = {

		"Open": "orange",

		"Working": "blue",

		"Pending Review": "orange",

		"Completed": "green",

		"Cancelled": "red",

		"On Hold": "grey",

		"Overdue": "red",

	};

	return map[status] || "grey";
}

/* =========================================================
   PROGRESS COLOR
   ========================================================= */

/*
 * This only controls the progress bar color.
 *
 * It does NOT modify Task.progress.
 */

function get_progress_color(percentage) {

	if (percentage >= 100) {

		return "var(--green-500)";
	}


	if (percentage <= 0) {

		return "var(--gray-300)";
	}


	return "var(--blue-500)";
}