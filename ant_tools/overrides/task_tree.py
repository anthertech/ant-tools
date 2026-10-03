import frappe

from frappe.query_builder import Field, functions


@frappe.whitelist()
def get_children(
	doctype,
	parent=None,
	task=None,
	project=None,
	is_root=False,
	**filters
):

	flist = [
		["docstatus", "<", "2"]
	]


	if task:

		flist.append(
			["parent_task", "=", task]
		)

	elif parent and not is_root:

		flist.append(
			["parent_task", "=", parent]
		)

	else:

		flist.append(
			functions.IfNull(
				Field("parent_task"),
				""
			) == ""
		)


	if project:

		flist.append(
			["project", "=", project]
		)


	return frappe.get_list(
		doctype,

		fields=[
			"name as value",
			"subject as title",
			"is_group as expandable",

			"status",
			"progress",

			"exp_start_date",
			"exp_end_date",

			"_assign",
		],

		filters=flist,

		order_by="exp_start_date asc",
	)