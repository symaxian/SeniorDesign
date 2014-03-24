/*

	Notes:

		Null ID's
			We need to decide what to do with null task ID's and null part ID's.
			At the moment the string "null" is treated as the ID and pushed with the regular data.

		CN == CT
			It seems like the change notice ID(CN) is always equal to the change task ID(CT).
			The only exception is when either or both are "null".
			Should we collapse CN and CT to a single object?

	TODO:

		How do we merge multiple part entries?
			JR: They seem to reflect a part being in multiple stages with different users
				Perhaps just keep them as separate part blocks but maybe have each block acknowledge the other ones

		Graceful error handling everywhere

		UI:
			- Fix collapsing/expanding animation
			- Position expand button better
			- Everything for the parts
			- Option to load pieces over time?
				Maybe hide by default and lazily load task or part divs

*/

viz = {

	DEBUG: true,
		// Whether to log output or not

	dataFilepath: 'ecr_report.csv',
		// The filepath for the CSV data

	splitObjectDescription: true,
		/*
			Whether to split the ObjectDescription column into two properties, description and link
				"http://plmuat2.ingerrand.com:8021/Windchill/servlet/TypeBasedIncludeServlet?oid=OR%3Awt.change2.WTChangeOrder2%3A17236793405&u8=1 ((M0114)SHIP WITH KITS. OBSOLETE TLSP. THE BALL VALVE X13680518010 IS BEING REPLACED. THE VENDOR IS DISCONTINUING CURRENT VALVE AND REPLACING WITH A NEW VALVE. VALVE IS DIRECT SHIPPED TO CUSTOMER., Engineering Change Notice - ECO-0039613)"
					into
				"http://plmuat2.ingerrand.com:8021/Windchill/servlet/TypeBasedIncludeServlet?oid=OR%3Awt.change2.WTChangeOrder2%3A17236793405&u8=1"
					and
				"((M0114)SHIP WITH KITS. OBSOLETE TLSP. THE BALL VALVE X13680518010 IS BEING REPLACED. THE VENDOR IS DISCONTINUING CURRENT VALVE AND REPLACING WITH A NEW VALVE. VALVE IS DIRECT SHIPPED TO CUSTOMER., Engineering Change Notice - ECO-0039613)"
			JR: I'm unsure as to whether or not this will always be safe
		*/

	data: {
		raw: null,
		array: null,
		json: null
	},
		// Some storage for all the data, same data but different formats

	columnNames: [
		'ObjectTypeIndicator',
		'Reassigned',
		'PR',
		'CR',
		'CN',
		'CT',
		'Part',		// Renamed from 'Part/Doc/VS',
		'Task',
		'Actions',
		'ObjectDescription',
		'CurrentState',
		'User',
		'Role',
		'Created',
		'LastModified',
		'Status'
	],

	init: function viz_init() {
		viz.loadData();
	},

	// This function needs to be called whenever the header changes height,
	//  in order to update the change record top margin so that the top change
	//  isnt hidden underneath the stick header.
	headerUpdated: function viz_headerUpdated() {
		var h = $('#header')[0].offsetHeight + parseInt($('.change-record').css('margin-top'), 10);
		viz.console.log(h);
		$('#record-div').css('margin-top', h);
	},

	loadData: function viz_loadData() {
		viz.console.log('Loading data');
		$.get(viz.dataFilepath, function(data) {
			viz.console.log('Data loaded');

			// JR: TODO: Error handling if the file was not found

			// Save the raw data
			viz.data.raw = data;
			// Break the raw data up into a 2d array
			viz.data.array = viz.parseRawData(data);
			// Turn the 2d array into a JSON tree
			viz.data.json = viz.parseData(viz.data.array);
			// Generate the page
			viz.generatePage(viz.data.json);


			// Set our data for the post
			var post = {
					author: 'Joe Bloggs',
					date: '25th May 2013',
					// authorPicture: 'SimpleExample/img/joeBloggs.gif',
					post: 'This is the contents of my post'
				};

			$.addTemplateFormatter({
				upperCaseFormatter : function(value, template) {
						return value.toUpperCase();
					},
				lowerCaseFormatter : function(value, template) {
						return value.toLowerCase();
					},
				sameCaseFormatter : function(value, template) {
						if(template == 'upper') {
							return value.toUpperCase();
						}
						return value.toLowerCase();
					}
			});

			$('.script-template-container').loadTemplate('#part-template', post);

		});
	},

	//
	//  Data Parsing
	//________________//

	// This will parse the raw csv data into a 2d array
	// The default delimiter is the comma
	parseRawData: function viz_parseRawData(data, delimiter) {

		delimiter = delimiter || ',';

		// Create a regular expression to parse the CSV values
		var objPattern = new RegExp(
			(
				// Delimiters
				"(\\" + delimiter + "|\\r?\\n|\\r|^)" +
				// Quoted fields
				"(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
				// Standard fields
				"([^\"\\" + delimiter + "\\r\\n]*))"
			),
			'gi'
		);

		// Create an array to hold our data. Give the array a default empty first row
		var arrData = [[]];

		// Create an array to hold our individual pattern matching groups
		var arrMatches = objPattern.exec(data);

		// Loop over the regular expression matches until we can no longer find a match
		while(arrMatches) {

			// Get the delimiter that was found.
			var strMatchedDelimiter = arrMatches[1];

			// Check to see if the given delimiter has a length (is not the start of string) and if it matches field delimiter.
			// If id does not, then we know that this delimiter is a row delimiter.
			if(strMatchedDelimiter.length && (strMatchedDelimiter !== delimiter)) {
				// Since we have reached a new row of data, add an empty row to our data array
				arrData.push([]);
			}

			// Now that we have our delimiter out of the way, let's check to see which kind of value we captured (quoted or unquoted).
			var strMatchedValue;
			if(arrMatches[2]) {
				// We found a quoted value
				// When we capture this value, unescape any double quotes
				strMatchedValue = arrMatches[2].replace(
					new RegExp('""', 'g'),
					"\""
				);
			}
			else {
				// We found a non-quoted value
				strMatchedValue = arrMatches[3];
			}

			// Now that we have our value string, let's add it to the data array
			arrData[arrData.length-1].push(strMatchedValue);

			arrMatches = objPattern.exec(data);

		}

		// Return the parsed data
		return arrData;
	},

	parseData: function viz_parseData(data) {

		// Define indexes for the columns
		// This just helps for readability
		var index = {};
		for(var colNameIndex=0; colNameIndex<viz.columnNames.length; colNameIndex++) {
			index[viz.columnNames[colNameIndex]] = colNameIndex;
		}

		var json = {};

		// Loop through every row
		// Start at 1 to avoid the column names
		for(var rowIndex = 1; rowIndex < data.length; rowIndex++ ) {

			var row = data[rowIndex];

			// Break if it's an empty line(usually the last line in the file)
			if(row.length === 1 && row[0] === '') {
				continue;
			}

			var CR_id = row[index.CR],
				CN_id = row[index.CN],
				CT_id = row[index.CT],
				part_id = row[index.Part];

			// Create new CR object if needed
			if(typeof json[CR_id] !== 'object') {
				json[CR_id] = {};
			}
			var CR = json[CR_id];

			// Create new CN object if needed
			if(typeof CR[CN_id] !== 'object') {
				CR[CN_id] = {};
			}
			var CN = CR[CN_id];

			// JR: Until we decide on what to do with null tasks(CT), just use "null" as a task ID

			// Check if CT_id is null
			// if(CT_id !== 'null') {

				// Create new CT object if needed
				if(typeof CN[CT_id] !== 'object') {
					CN[CT_id] = {};
				}
				var CT = CN[CT_id];

				// Create new part array if needed
				if(typeof CT[part_id] !== 'object') {
					CT[part_id] = [];
				}
				var part = CT[part_id];

				// Add a new part object to the CT object
				var partPiece = {
					task: row[index.Task],
					// actions: row[index.Actions],			JR: Ignored, always blank
					objectDescription: row[index.ObjectDescription],
					currentState: row[index.CurrentState],
					user: row[index.User],
					role: row[index.Role],
					created: row[index.Created],
					lastModified: row[index.LastModified],
					status: row[index.Status]
				};

				if(viz.splitObjectDescription) {
					var string = partPiece.objectDescription;
					partPiece.link = string.split(' ')[0];
					partPiece.objectDescription = string.substr(string.indexOf(' '));
				}

				part.push(partPiece);

			// }

		}

		// Return the data
		return json;

	},

	//
	//  Page Generation
	//___________________//

	generatePage: function viz_generatePage(data) {

		viz.console.group('Generating page');

		$('#header-loading').show();

		var $div = $('#record-div');

		// Loop through every change record
		for(var CR_id in data) {
			if(data.hasOwnProperty(CR_id)) {
				var CR_data = data[CR_id];
				$div.append(viz.createRecordDivision(CR_id, CR_data));
			}
		}

		$('#header-loading').hide();
		$('#header-table').show();

		viz.headerUpdated();

		viz.console.groupEnd();

	},

	createRecordDivision: function viz_createRecordDivision(id, data, expanded) {
		viz.console.groupCollapsed('Created DIV for record: '+id);

		// The expanded property defaults to false
		if(typeof expanded !== 'boolean') {
			expanded = false;
		}

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'change-record';

		// Create the title element
		var title = document.createElement('h3'),
			$title = $(title);
		$title.text('Change Record: '+id);
		title.className = 'change-record-title';

		// Create the children list div
		var childDiv = document.createElement('div'),
			$childDiv = $(childDiv);

		// Create the collapse/expand click handler
		$title.click(function() {
			if($childDiv.is(':visible')) {
				$childDiv.hide('slide', { direction: 'up', origin: ['top', 'left'] }, 'medium');
				$div.removeClass('change-record-expanded');
			}
			else {
				if($div.attr('data-loaded') === 'false') {
					viz.fillRecordDivision(id, data, childDiv);
					$div.attr('data-loaded', 'true');
				}
				$childDiv.show('slide', { direction: 'up', origin: ['top', 'left'] }, 'medium');
				$div.addClass('change-record-expanded');
			}
		});

		// fillRecordDivision(id, data, childDiv);

		$div.attr('data-loaded', expanded);
		if(expanded) {
			viz.fillRecordDivision(id, data, childDiv);
			$div.addClass('change-record-expanded');
		}
		else {
			$childDiv.hide();
		}

		$div.append(title);
		$div.append(childDiv);

		viz.console.groupEnd();

		return div;

	},

	fillRecordDivision: function viz_fillRecordDivision(id, data, childDiv) {
		var $childDiv = $(childDiv);
		// Loop through every change notice
		for(var CN_id in data) {
			if(data.hasOwnProperty(CN_id)) {
				var CN_data = data[CN_id];
				$childDiv.append(viz.createNoticeDivision(CN_id, CN_data));
			}
		}

	},

	createNoticeDivision: function viz_createNoticeDivision(id, data, expanded) {
		viz.console.groupCollapsed('Created DIV for notice: '+id);

		// The expanded property defaults to false
		if(typeof expanded !== 'boolean') {
			expanded = false;
		}

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'change-notice';

		// Create a title
		var title = document.createElement('h4'),
			$title = $(title);
		$title.text('Change Notice: '+id);
		title.className = 'change-notice-title';

		// Create the children list div
		var childDiv = document.createElement('div'),
			$childDiv = $(childDiv);

		// Create the collapse/expand children button
		$title.click(function() {
			if($childDiv.is(':visible')) {
				$childDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
			}
			else {
				if($div.attr('data-loaded') === 'false') {
					viz.fillNoticeDivision(id, data, childDiv);
					$div.attr('data-loaded', 'true');
				}
				$childDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
			}
		});

		// Set the data loaded attribute
		$div.attr('data-loaded', expanded);
		if(expanded) {
			viz.fillNoticeDivision(id, data, childDiv);
		}
		else {
			$childDiv.hide();
		}

		// Add the components
		$div.append(title);
		$div.append(childDiv);

		viz.console.groupEnd();

		return div;

	},

	fillNoticeDivision: function viz_fillNoticeDivision(id, data, div) {

		// Loop through every change task
		// viz.console.log(data);
		var $div = $(div);
		for(var CT_id in data) {
			if(data.hasOwnProperty(CT_id)) {
				var CT_data = data[CT_id];
				$div.append(viz.createTaskDivision(CT_id, CT_data));
			}
		}

	},

	getColumnIndex: function viz_getColumnIndex(task) {
		var prefix;
		var prefix1 = task.split('-')[0];
		var prefix2 = task.split(' - ')[0];
		if(prefix1.length < prefix2.length) {
			prefix = prefix1;
		}
		else {
			prefix = prefix2;
		}
		if(prefix === 'CT1' || prefix === 'CN28' || prefix === 'P1') {
			return 2;
		}
		if(prefix === 'P33') {
			return 5;
		}
		if(prefix === 'MCT16' || prefix === 'MCT17' || prefix === 'MCT18') {
			return 7;
		}
		return 0;
	},

	createTaskDivision: function viz_createTaskDivision(id, data, expanded) {

		// The expanded property defaults to false
		if(typeof expanded !== 'boolean') {
			expanded = false;
		}

		// Create the div
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'change-task';
		$div.attr('data-loaded', true);

		// Create the title
		var title = document.createElement('h4'),
			$title = $(title);
		$title.text('Change Task: '+id);
		title.className = 'change-task-title';
		$div.append(title);

		// Create the children list div
		var childDiv = document.createElement('div'),
			$childDiv = $(childDiv);

		var $table = $.parseHTML('<table><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>'),
			table = $table[0];
		$childDiv.append(table);
		var tableRow = table.childNodes[0].childNodes[0];


		// Create the collapse/expand children button
		$title.click(function() {
			if($childDiv.is(':visible')) {
				$childDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
			}
			else {
				if($div.attr('data-loaded') === 'false') {
					viz.fillTaskDivision(id, data, childDiv, tableRow);
					$div.attr('data-loaded', 'true');
				}
				$childDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
			}
		});

		// Set the data loaded attribute
		$div.attr('data-loaded', expanded);
		if(expanded) {
			viz.fillTaskDivision(id, data, childDiv, tableRow);
		}
		else {
			$childDiv.hide();
		}

		$div.append(childDiv);

		return div;

	},

	fillTaskDivision: function viz_fillTaskDivision(id, data, childDiv, tableRow) {
		var $childDiv = $(childDiv);

		// Loop through every part
		for(var part_id in data) {
			if(data.hasOwnProperty(part_id)) {
				var partArray = data[part_id];
				for(var i=0;i<partArray.length;i++) {
					var partData = partArray[i];
					var partDiv = viz.createPartDivision(part_id, partData);
					// var partDiv = viz.createPartDivision(part_id+'['+i+']', partData);
					var colIndex = viz.getColumnIndex(partData.task);
					$(tableRow.childNodes[colIndex]).append(partDiv);
				}
			}
		}
	},

	createPartDivision: function viz_createPartDivision(id, data) {

		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'part';

		var title = document.createElement('h4');
		$(title).text(id);
		$div.append(title);

		// JR: This is just temporary, just to show all the part data

		// Add the data
		var dl = document.createElement('dl');

		// JR: objectDescription is ignored for now, too much text

		var propertyNames = [
			'task',
			// 'objectDescription',
			'currentState',
			'user',
			'role',
			'created',
			'lastModified',
			'status'
		];

		if(viz.splitObjectDescription) {
			// dtData.push('Document Link');
			// propertyNames.push('link');
		}

		var templateData = {};

		for(var i=0;i<propertyNames.length;i++) {
			templateData[propertyNames[i]] = data[propertyNames[i]];
		}

		// $.addTemplateFormatter({
		// 	upperCaseFormatter : function(value, template) {
		// 			return value.toUpperCase();
		// 		},
		// 	lowerCaseFormatter : function(value, template) {
		// 			return value.toLowerCase();
		// 		},
		// 	sameCaseFormatter : function(value, template) {
		// 			if(template == 'upper') {
		// 				return value.toUpperCase();
		// 			}
		// 			return value.toLowerCase();
		// 		}
		// });

		$div.loadTemplate('#part-template', templateData);


		return div;

	},

	console: {

		log: function() {
			if(typeof console === 'object' && viz.DEBUG) {
				console.log.apply(console, arguments);
			}
		},

		group: function() {
			if(typeof console === 'object' && viz.DEBUG) {
				console.group.apply(console, arguments);
			}
		},

		groupCollapsed: function() {
			if(typeof console === 'object' && viz.DEBUG) {
				console.groupCollapsed.apply(console, arguments);
			}
		},

		groupEnd: function() {
			if(typeof console === 'object' && viz.DEBUG) {
				console.groupEnd.apply(console, arguments);
			}
		}

	}

};

// Call our init method when the page is loaded
$(viz.init);