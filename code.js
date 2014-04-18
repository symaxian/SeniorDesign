/*

	Notes:

		Null ID's
			We need to decide what to do with null task ID's and null part ID's.
			At the moment the string "null" is treated as the ID and pushed with the regular data.
			RESOLVED: A null id means that the relevant row does not provide info on a part, but the CN/CT info

		CN == CT
			It seems like the change notice ID(CN) is always equal to the change task ID(CT).
			The only exception is when either or both are "null".
			Should we collapse CN and CT to a single object?

	TODO:

		Highlight headers in the correct column

		Flexible data column handling!

		Graceful error handling everywhere
			File missing error handling

		Status text
			Awaiting data file
			Parsing data
			Filtering page
			Generating page
			...

		Late part/CT/CN/CR coloring

		On hover info text

		Remove log statements

		Make it all faster for IE8

		Manufacturing tasks have no data, so dont display the missing data on the page

*/

viz = {
	

	DEBUG: true,
		// Whether to log output or not

	log: null,

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
			JR: The new data should never have the ugly links in it, remove this later on
		*/

	data: {
		raw: null,
		array: null,
		json: null
	},
		// Some storage for all the data, same data but different formats

	CR_SLIDE_SPEED: 'medium',

	CT_SLIDE_SPEED: 'slow',

	CN_SLIDE_SPEED: 'slow',

	BLOCK_SLIDE_SPEED: 'slow',

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

	//
	//  Initialization
	//__________________//

	init: function viz_init() {
		viz.setStatus('Initializating');
		// Used for dealing with IE8, which does not support indexOf
		if (!Array.prototype.indexOf) {
			Array.prototype.indexOf = function(obj, start) {
				for (var i = (start || 0), j = this.length; i < j; i++) {
					if (this[i] === obj) {
						return i;
					}
				}
				return -1;
			};
		}
		viz.log = viz.DEBUG && typeof console === 'object';
		viz.loadData();
	},

	// This function needs to be called whenever the header changes height,
	//  in order to update the change record top margin so that the top change
	//  record isnt hidden underneath the sticky header.
	headerUpdated: function viz_headerUpdated() {
		var height = $('#header')[0].offsetHeight + parseInt($('.CR').css('margin-top'), 10);
		$('#record-div').css('margin-top', height);
	},

	loadData: function viz_loadData() {
		// Set the status text
		viz.setStatus('Waiting for data file');
		if(viz.log) console.log('Loading data');

		// Request the file
		$.get(viz.dataFilepath, function(data) {
			if(viz.log) console.log('Data loaded');

			// JR: TODO: Error handling if the file was not found

			// Save the raw data
			viz.data.raw = data;
			// Break the raw data up into a 2d array
			viz.data.array = viz.parseRawData(data);
			// Turn the 2d array into a JSON tree
			viz.data.json = viz.parseData(viz.data.array);
			// Generate the page
			viz.generatePage(viz.data.json);

		});
	},

	hideStatus: function viz_hideStatus() {
		$('#status_text_cell').hide();
	},

	setStatus: function viz_setStatus(msg) {
		$('#status_text_cell').show();
		$('#status_text').text(msg);
	},

	//
	//  Data Parsing
	//________________//

	// This will parse the raw csv data into a 2d array
	// The default delimiter is a comma
	parseRawData: function viz_parseRawData(data, delimiter) {

		// Set the status
		viz.setStatus('Parsing raw data');

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

		// Create a regular expression to match all double double quotes
		var globalDoubleQuoteRegEx = new RegExp('""', 'g');

		// Create an array to hold our data. Give the array a default empty first row
		var arrData = [[]];

		// Create an array to hold our individual pattern matching groups
		var arrMatches = objPattern.exec(data),
			strMatchedDelimiter,
			strMatchedValue;

		// Loop over the regular expression matches until we can no longer find a match
		while(arrMatches) {

			// Get the delimiter that was found.
			strMatchedDelimiter = arrMatches[1];

			// Check to see if the given delimiter has a length (is not the start of string) and if it matches field delimiter.
			// If it does not, then we know that this delimiter is a row delimiter.
			if(strMatchedDelimiter.length && (strMatchedDelimiter !== delimiter)) {
				// Since we have reached a new row of data, add an empty row to our data array
				arrData.push([]);
			}

			// Now that we have our delimiter out of the way, let's check to see which kind of value we captured (quoted or unquoted).
			if(arrMatches[2]) {
				// We found a quoted value
				// When we capture this value, unescape any double quotes
				strMatchedValue = arrMatches[2].replace(
					globalDoubleQuoteRegEx,
					'"'
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

	// This will parse the 2d array of data into a hierarchical JSON object
	parseData: function viz_parseData(data) {

		// Set the status
		viz.setStatus('Forming hierarchical data structure')

		// JR: TODO: Create column indexes dynamically, depending on the columns present

		// Define indexes for the columns
		// This just helps for readability
		var index = {};
		for(var colNameIndex=0; colNameIndex<viz.columnNames.length; colNameIndex++) {
			index[viz.columnNames[colNameIndex]] = colNameIndex;
		}

		var json = {
			records: {},
			recordCount: 0
		};

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
			if(typeof json.records[CR_id] !== 'object') {
				json.records[CR_id] = {
					notices: {},
					noticeCount: 0,
					loaded: false
				};
				json.recordCount++;
			}
			var CR = json.records[CR_id];

			// Create new CN object if needed
			if(typeof CR.notices[CN_id] !== 'object') {
				CR.notices[CN_id] = {
					tasks: {},
					taskCount: 0,
					loaded: false
				};
				CR.noticeCount++;
			}
			var CN = CR.notices[CN_id];

			// Check if CT_id is null
			if(CT_id === 'null') {

				// CT is null, so this row defines the CN data
				CN.task = row[index.Task];
				CN.objectDescription = row[index.ObjectDescription];
				CN.currentState = row[index.CurrentState];
				CN.user = row[index.User];
				CN.role = row[index.Role];
				CN.created = new Date(row[index.Created]).valueOf();
				CN.lastModified = new Date(row[index.LastModified]).valueOf();
				CN.status = row[index.Status];

			}
			else {

				// Create new CT object if needed
				if(typeof CN.tasks[CT_id] !== 'object') {
					CN.tasks[CT_id] = {
						parts: {},
						partCount: 0,
						blocks: {},
						blockCount: 0,
						loaded: false
					};
					CN.taskCount++;
				}
				var CT = CN.tasks[CT_id];

				// Check if part_id is null
				if(part_id === 'null') {

					// Part is null, this row defines the CT data
					CT.task = row[index.Task];
					CT.objectDescription = row[index.ObjectDescription];
					CT.currentState = row[index.CurrentState];
					CT.user = row[index.User];
					CT.role = row[index.Role];
					CT.created = new Date(row[index.Created]).valueOf();
					CT.lastModified = new Date(row[index.LastModified]).valueOf();
					CT.status = row[index.Status];

				}
				else {

					// Create new part array if needed
					if(typeof CT.parts[part_id] !== 'object') {
						CT.parts[part_id] = [];
						CT.partCount++;
					}
					var part = CT.parts[part_id];

					// Add a new part piece object to the CT object
					var partPiece = {
						task: row[index.Task],
						// actions: row[index.Actions],			JR: Ignored, always blank
						objectDescription: row[index.ObjectDescription],
						currentState: row[index.CurrentState],
						user: row[index.User],
						role: row[index.Role],
						created: new Date(row[index.Created]).valueOf(),
						lastModified: new Date(row[index.LastModified]).valueOf(),
						status: row[index.Status]
					};

					// Also sort the part by "user-task" in the CT object
					var userBlockId = partPiece.user + ':' + partPiece.task;
					if(typeof CT.blocks[userBlockId] !== 'object') {
						CT.blocks[userBlockId] = {
							parts: {},
							partCount: 0
						};
						CT.userCount++;
					}
					var userBlockData = CT.blocks[userBlockId];
					if(typeof userBlockData.parts[part_id] !== 'object') {
						userBlockData.parts[part_id] = [];
					}
					userBlockData.parts[part_id].push(partPiece);

					// JR: TODO: Remove this once we know that the data will never have the ugly links in this columns
					if(viz.splitObjectDescription) {
						var string = partPiece.objectDescription;
						partPiece.link = string.split(' ')[0];
						partPiece.objectDescription = string.substr(string.indexOf(' '));
					}

					part.push(partPiece);

				}

			}

		}

		// Derive the begin-end time points for each task
		viz.calculateAllTaskTimes(json);

		// Return the data
		return json;

	},

	calculateAllTaskTimes: function viz_calculateAllTaskTimes(json) {
		// Loop through the records
		var records = json.records;
		for(var CR_id in records) {
			// Loop through the notices
			var notices = records[CR_id].notices;
			for(var CN_id in notices) {
				// Loop through the tasks
				var tasks = notices[CN_id].tasks;
				for(var CT_id in tasks) {
					viz.calculateTaskTime(tasks[CT_id]);
				}
			}
		}
	},

	calculateTaskTime: function viz_calculateTaskTimes(CT) {
		var minCreated = Infinity,
			maxCreated = 0,
			minModified = Infinity,
			maxModified = 0;
		// Loop through the parts
		var parts = CT.parts;
		for(var part_id in parts) {
			var part = parts[part_id];
			// Loop through the part pieces
			for(var partPieceIndex=0; partPieceIndex<part.length; partPieceIndex++) {

				// Get the part piece data and the times
				var partPiece = part[partPieceIndex];
				var created = partPiece.created,
					modified = partPiece.lastModified;

				// Update the min/max times
				if(created < minCreated) {
					minCreated = created;
				}
				else if(created > maxCreated) {
					maxCreated = created;
				}
				if(modified < minModified) {
					minModified = modified;
				}
				else if(modified > maxModified) {
					maxModified = modified;
				}

				// The four blocks of commented code below were used to collect the possible property values
				// This was done to then create dropdowns to filter from these values

				// Grab the part user
				// var user = partPiece.user;
				// if(viz.users.indexOf(user) === -1) {
				// 	viz.users.push(user);
				// }

				//Grab the part status
				// var status = partPiece.status;
				// if(viz.partStatus.indexOf(status) === -1) {
				// 	viz.partStatus.push(status);
				// }

				//Grab the tasks
				// var task = partPiece.task;
				// if(viz.tasks.indexOf(task) === -1) {
				// 	viz.tasks.push(task);
				// }

				//Grab the current states
				// var currentState = partPiece.currentState;
				// if(viz.currentStates.indexOf(currentState) === -1) {
				// 	viz.currentStates.push(currentState);
				// }

			}
		}
		// Set the data on the CT
		CT.minCreated = minCreated;
		CT.maxCreated = maxCreated;
		CT.minModified = minModified;
		CT.maxModified = maxModified;
	},

	
	//
	//  Page Generation
	//___________________//

	generatePage: function viz_generatePage(json) {
		
		// Set the status
		viz.setStatus('Generating the page');

		if(viz.log) console.group('Generating page');
		if(viz.log) console.time('Generate Page');
		$('#header-loading').show();

		//add filter button functionality
		$("#filterButton").click(function(){
			viz.filterPage();
		});

		//add reset button functionality
		$("#resetButton").click(function(){
			viz.resetPage();
		});
		
		//if enter key pressed, filter
		$('#filterBox').on("keypress", function(e) {
			if (e.keyCode == 13) {
				viz.filterPage();
			}
		});

		var i;

		/*
		//dropdown filters
		$userSelect = $("select[name='dropUser']");
		$statusSelect = $("select[name='dropStatus']");
		$taskSelect = $("select[name='dropTask']");
		$currentStateSelect = $("select[name='dropCurrentState']");
		

		//Add user names to user select filtering dropdown
		for (i = 0; i < viz.users.length; i++) {
            $("<option/>").attr("value", viz.users[i].id).text(viz.users[i]).appendTo($userSelect);
		}
			
		//Add status to status select filtering dropdown
		for (i = 0; i < viz.partStatus.length; i++) {
            $("<option/>").attr("value", viz.partStatus[i].id).text(viz.partStatus[i]).appendTo($statusSelect);
		}

		//Add Tasks to Tasks select filtering dropdown
		for (i = 0; i < viz.tasks.length; i++) {
            $("<option/>").attr("value", viz.tasks[i].id).text(viz.tasks[i]).appendTo($taskSelect);
		}

		//Add currentStates to CurrentStates select filtering dropdown
		for (i = 0; i < viz.currentStates.length; i++) {
            $("<option/>").attr("value", viz.currentStates[i].id).text(viz.currentStates[i]).appendTo($currentStateSelect);
		}

		*/

		// Create a division that will contain CR's
		var $div = $(document.createElement('div'));

		var records = json.records;
		// Loop through every change record
		for(var CR_id in records) {
			$div.append(viz.createRecordDivision(CR_id, records[CR_id]));
		}

		$('#header-loading').hide();
		$('#header-table').show();

		// Append the div t
		$('#record-div').append($div);

		// Call the headerUpdated method to fix the content margin
		viz.headerUpdated();

		if(viz.log) console.groupEnd();
		if(viz.log) console.timeEnd('Generate Page');

		// Hide the status text
		viz.hideStatus();

	},

	//
	//  Reset
	//_________//

	resetPage: function viz_resetPage() {

		// Set the status text
		viz.setStatus('Resetting page');

		$('#filterBox').val('');

		// Show all the CR div's
		$('[data-cr]').show();

		// Collapse the CRs, including children
		var records = viz.data.json.records;
		for(var CR_id in records) {
			viz.collapseCR(CR_id, true);
		}

		// Show all the CN's and CT's
		$('[data-cn]').show();
		$('[data-ct]').show();
		$('[data-block]').show();

		// Hide the status text
		viz.hideStatus();
					
	},


	//
	//  Filtering
	//_____________//

	filterPage: function viz_filterPage() {
		// Set the status text
		viz.setStatus('Filtering page');
		// Create and save the filter regular expression
		var filterText = $('#filterBox').val();
		viz.filterRegex = new RegExp(filterText, 'i');
		// Filter through the records
		var records = viz.data.json.records;
		for(var CR_id in records) {
			viz.filterCR(CR_id, records[CR_id]);
		}
		// Hide the status text
		viz.hideStatus();
	},

	filterCR: function viz_filterCR(CR_id, data){
		var $div = $('div[data-cr="'+CR_id+'"]');
		var visible = false;
		
		// JR: TODO: Highlighting of matched text
		if(viz.filterRegex.test(CR_id)) {
			visible = true;
			//$div.addClass('highlighted');
			
		}
		else {
			//$div.removeClass('highlighted');
		
		}

		for(var CN_id in data.notices){
			if(viz.filterCN(CR_id, CN_id, data.notices[CN_id])) {
				visible = true;
			}
		}
	
		if(visible) {
			viz.expandCR(CR_id);
			$div.show();
			
		}
		else {
			$div.hide();
			viz.collapseCR(CR_id);
		}
		
	},

	filterCN: function viz_filterCN(CR_id, CN_id, data){

		var $div = $('div[data-cn="'+CN_id+'"]');
		var visible = false;

		// JR: TODO: Highlighting
		if(viz.filterRegex.test(CN_id)) {
			visible = true;
			//$div.addClass('highlighted');
		}
		else{
			//$div.removeClass('highlighted');
		}

		// Filter through properties of the change notice for the filterWord
		if(data.role)				visible = visible || viz.filterRegex.test(data.role);
		if(data.currentState)		visible = visible || viz.filterRegex.test(data.currentState);
		if(data.task)				visible = visible || viz.filterRegex.test(data.task);
		if(data.status)				visible = visible || viz.filterRegex.test(data.status);
		if(data.user)				visible = visible || viz.filterRegex.test(data.user);
		if(data.objectDescription)	visible = visible || viz.filterRegex.test(data.objectDescription);

		// Load the CN, for some reason it will not filter correctly if not loaded
		viz.loadCN(CR_id, CN_id);

		var tasks = data.tasks;
		for(var CT_id in tasks) {
			if(viz.filterCT(CR_id, CN_id, CT_id, tasks[CT_id])) {
				visible = true;
			}
		}

		if(visible) {
			viz.expandCN(CR_id, CN_id);
			$div.show();
		}
		else {
			$div.hide();
			viz.collapseCN(CR_id, CN_id);
			
		}
		
		return visible;
	
	},

	filterCT: function viz_filterCT(CR_id, CN_id, CT_id, data) {
		
		var $div = $('div[data-ct="'+CT_id+'"]');
		var visible = false;

		if(viz.filterRegex.test(CT_id)) {
			visible = true;
			//$div.addClass('highlighted');
		}
		else{
			//$div.removeClass('highlighted');
		}

		//filter through properties of the change task for the filterWord
		if(data.role)				visible = visible || viz.filterRegex.test(data.role);
		if(data.currentState)		visible = visible || viz.filterRegex.test(data.currentState);
		if(data.task)				visible = visible || viz.filterRegex.test(data.task);
		if(data.status)				visible = visible || viz.filterRegex.test(data.status);
		if(data.user)				visible = visible || viz.filterRegex.test(data.user);
		if(data.objectDescription)	visible = visible || viz.filterRegex.test(data.objectDescription);

		// Filter each block
		for(var block_id in data.blocks){
			if(viz.filterBlock(CR_id, CN_id, CT_id, block_id, data.blocks[block_id])) {
				visible = true;
			}
		}

		//show/hide
		if(visible) {
			viz.expandCT(CR_id, CN_id, CT_id);
			$div.show();
		}
		else {
			$div.hide();
			viz.collapseCT(CR_id, CN_id, CT_id);
		}

		return visible;
		
	},

	filterBlock: function viz_filterBlock(CR_id, CN_id, CT_id, block_id, data) {
		
		var $div = $('div[data-block="'+block_id+'"]');
		var visible = false;
		
		console.log(data);
		if(viz.filterRegex.test(block_id)) {
			visible = true;
		}

		//filter through properties of the change task for the filterWord
		if(data.role)				visible = visible || viz.filterRegex.test(data.role);
		if(data.currentState)		visible = visible || viz.filterRegex.test(data.currentState);
		if(data.task)				visible = visible || viz.filterRegex.test(data.task);
		if(data.status)				visible = visible || viz.filterRegex.test(data.status);
		if(data.user)				visible = visible || viz.filterRegex.test(data.user);
		if(data.objectDescription)	visible = visible || viz.filterRegex.test(data.objectDescription);

		// Filter each block
		for(var part_id in data.parts){
			//if(viz.filterParts(CR_id, CN_id, CT_id, block_id, data.blocks[block_id])) {
			//	visible = true;
			//}
		}



		//show/hide
		if(visible) {
			viz.expandBlock(block_id);
			$div.show();
		}
		else {
			$div.hide();
			viz.collapseBlock();
		}

		return visible;

	},

	//
	//  Change Record
	//_________________//

	loadCR: function(CR_id) {
		var CR_data = viz.data.json.records[CR_id];
		// Check if loaded
		if(!CR_data.loaded) {
			// Get the div
			var $div = $('div[data-cr="'+CR_id+'"]');
			// Fill the content
			viz.fillRecordDivision(CR_id, CR_data, $div.find('.CR-notices'));
		}
	},

	collapseCR: function(CR_id, collapseChildren) {
		collapseChildren = collapseChildren || false;
		// Get the elements
		var $div = $('div[data-cr="'+CR_id+'"]');
		var $childDiv = $div.find('.CR-notices');
		// Collapse it
		$childDiv.hide('slide', { direction: 'up', origin: ['top', 'left'] }, viz.CR_SLIDE_SPEED);
		$div.removeClass('CR-expanded');
		// Collapse the children
		if(collapseChildren) {
			for(var CN_id in viz.data.json.records[CR_id].notices) {
				viz.collapseCN(CR_id, CN_id, true);
			}
		}
	},

	expandCR: function(CR_id) {
		// Ensure it's loaded
		viz.loadCR(CR_id);
		// Get the element
		var $div = $('div[data-cr="'+CR_id+'"]');
		var $childDiv = $div.find('.CR-notices');
		// Expand it
		$childDiv.show('slide', { direction: 'up', origin: ['top', 'left'] }, viz.CR_SLIDE_SPEED);
		$div.addClass('CR-expanded');
	},


	
	// This method creates and returns a record division
	createRecordDivision: function viz_createRecordDivision(CR_id, data) {
		if(viz.log) console.groupCollapsed('Created DIV for record: '+CR_id);

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CR';
		$div.attr('data-cr', CR_id);

		// Load the template
		var templateData = {
			title: 'Change Record: '+CR_id,
			count: data.noticeCount
		};
		$div.loadTemplate('#CR-template', templateData);

		// Get the title and notices div
		var $title = $div.find('.CR-title');
		var $childDiv = $div.find('.CR-notices');

		// Create the collapse/expand click handler
		$title.click(function() {
			if($childDiv.is(':visible')) {
				viz.collapseCR(CR_id);
			}
			else {
				viz.expandCR(CR_id);
			}
		});

		// Hide the content
		$childDiv.hide();

		if(viz.log) console.groupEnd();

		return div;

	},

	fillRecordDivision: function viz_fillRecordDivision(CR_id, data, $childDiv) {
		// Loop through every change notice
		var notices = data.notices;
		for(var CN_id in notices) {
			$childDiv.append(viz.createNoticeDivision(CR_id, CN_id, notices[CN_id]));
		}
		// Set the loaded flag
		data.loaded = true;
	},

	//
	//  Change Notice
	//_________________//

	loadCN: function(CR_id, CN_id) {
		// Get the CR data
		var CR_data = viz.data.json.records[CR_id];
		// Load the CR
		if(!CR_data.loaded) {
			viz.loadCR(CR_id);
		}
		// Get the CN data
		var CN_data = CR_data.notices[CN_id];
		// Check if loaded
		if(!CN_data.loaded) {
			// Get the div
			var $div = $('div[data-cn="'+CN_id+'"]');
			// Fill the content
			viz.fillNoticeDivision(CR_id, CN_id, CN_data, $div.find('.CN-tasks'));
		}
	},

	collapseCN: function(CR_id, CN_id, collapseChildren) {
		collapseChildren = collapseChildren || false;
		// Get the elements
		var $div = $('div[data-cn="'+CN_id+'"]');
		var $childDiv = $div.find('.CN-tasks');
		// Collapse it
		$childDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, viz.CN_SLIDE_SPEED);
		$div.removeClass('CN-expanded');
		// Collapse the children
		if(collapseChildren) {
			for(var CT_id in viz.data.json.records[CR_id].notices[CN_id].tasks) {
				viz.collapseCT(CR_id, CN_id, CT_id, true);
			}
		}
	},

	expandCN: function(CR_id, CN_id) {
		// Ensure it's loaded
		viz.loadCN(CR_id, CN_id);
		// Get the element
		var $div = $('div[data-cn="'+CN_id+'"]');
		// Expand it
		var $childDiv = $div.find('.CN-tasks');
		$childDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, viz.CN_SLIDE_SPEED);
		$div.addClass('CN-expanded');
	},

	createNoticeDivision: function viz_createNoticeDivision(CR_id, CN_id, data) {
		if(viz.log) console.groupCollapsed('Created DIV for notice: '+CN_id);

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CN';
		$div.attr('data-cn', CN_id);

		// Load the template
		var templateData = {
			id: CN_id,
			count: data.taskCount,
			user: data.user,
			currentState: data.currentState,
			objectDescription: data.objectDescription
		};

		// MCO's dont seem to have data
		if(typeof data.task === 'string') {
			templateData.task =  ' - '+data.task;
		}

		$div.loadTemplate('#CN-template', templateData);

		if(typeof data.task === 'undefined') {
			$div.find('.CN-data').hide();
		}

		// Get the title and notices div
		var $title = $div.find('.CN-title');
		var $childDiv = $div.find('.CN-tasks');

		// Create the collapse/expand children button
		$title.click(function() {
			if($childDiv.is(':visible')) {
				viz.collapseCN(CR_id, CN_id);
			}
			else {
				viz.expandCN(CR_id, CN_id);
			}
		});

		// Hide the content
		$childDiv.hide();

		if(viz.log) console.groupEnd();

		return div;

	},

	// This method fills a notice division children div with its children
	fillNoticeDivision: function viz_fillNoticeDivision(CR_id, CN_id, data, $childDiv) {
		// Loop through every change task
		var tasks = data.tasks;
		for(var CT_id in tasks) {
			$childDiv.append(viz.createTaskDivision(CR_id, CN_id, CT_id, tasks[CT_id]));
		}
		// Set the loaded flag
		data.loaded = true;
	},

	// Returns the column that a task goes under
	// Each part row has a task string, the part does under a column dependent on the first few chars of the task string
	getColumnIndex: function viz_getColumnIndex(task) {
		// Get the prefixes, followed by either '-' or ' - '
		var prefix;
		var prefix1 = task.split('-')[0];
		var prefix2 = task.split(' - ')[0];
		// Check for the correct prefix
		if(prefix1.length < prefix2.length) {
			prefix = prefix1;
		}
		else {
			prefix = prefix2;
		}
		// Return the relevant column
		if(prefix === 'C1S4') {
			return 0;
		}
		if(prefix === 'GateS') {
			return 1;
		}
		if(prefix === 'CT1' || prefix === 'CN28' || prefix === 'P1') {
			return 2;
		}
		if(prefix === 'CT16' || prefix === 'P3') {
			return 3;
		}
		if(prefix === 'P5MFG') {
			return 4;
		}
		if(prefix === 'P33') {
			return 5;
		}
		if(prefix === 'CN49' || prefix === 'CN52') {
			return 6;
		}
		if(prefix === 'MCT16' || prefix === 'MCT17' || prefix === 'MCT18') {
			return 7;
		}
		if(prefix === 'MCN56') {
			return 8;
		}
		if(prefix === 'P9') {
			return 9;
		}
		if(prefix === 'P10') {
			return 10;
		}
		if(prefix === 'P23') {
			return 11;
		}
		if(prefix === 'MCT19' || prefix === 'MCT20') {
			return 12;
		}
		if(prefix === 'MCN20') {
			return 13;
		}
		return 0;
	},

	//
	//  Change Task
	//_______________//

	loadCT: function(CR_id, CN_id, CT_id) {
		// Get the CN data
		var CN_data = viz.data.json.records[CR_id].notices[CN_id];
		// Load the CN
		if(!CN_data.loaded) {
			viz.loadCN(CR_id, CN_id);
		}
		// Get the CT data
		var CT_data = CN_data.tasks[CT_id];
		// Check if loaded
		if(!CT_data.loaded) {
			// Get the div
			var $div = $('div[data-ct="'+CT_id+'"]');
			// Fill the content
			viz.fillTaskDivision(CR_id, CN_id, CT_id, CT_data, CT_data.tableRow, $div.find('.CT-block-container'));
		}
	},

	collapseCT: function(CR_id, CN_id, CT_id) {
		// Get the elements
		var $div = $('div[data-ct="'+CT_id+'"]');
		var $childDiv = $div.find('.CT-parts');
		// Collapse it
		$childDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, viz.CT_SLIDE_SPEED);
		$div.removeClass('CT-expanded');
	},

	expandCT: function(CR_id, CN_id, CT_id) {
		// Ensure it's loaded
		viz.loadCT(CR_id, CN_id, CT_id);
		// Get the elements
		var $div = $('div[data-ct="'+CT_id+'"]');
		// Get the content elements
		var $childDiv = $div.find('.CT-parts');
		// Expand it
		$childDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, viz.CT_SLIDE_SPEED);
		$div.addClass('CT-expanded');
	},

	// This method creates and returns a task division
	createTaskDivision: function viz_createTaskDivision(CR_id, CN_id, id, data) {
		if(viz.log) console.groupCollapsed('Created DIV for task: '+id);

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CT';
		$div.attr('data-ct', id);

		// Load the template
		var templateData = {
			id: id,
			count: data.partCount,
			user: data.user,
			task: data.task,
			currentState: data.currentState,
			objectDescription: data.objectDescription
		};
		$div.loadTemplate('#CT-template', templateData);

		// Get the title and notices div
		var $title = $div.find('.CT-title');

		// JR: TODO: Since we're moving to the block view rather than parts, remove this part div eventually
		var $childDiv = $div.find('.CT-parts');
		var tableRow = $div.find('#partRow')[0];
		data.tableRow = tableRow;

		// Create the collapse/expand children button
		$title.click(function() {
			if($childDiv.is(':visible')) {
				viz.collapseCT(CR_id, CN_id, id);
			}
			else {
				viz.expandCT(CR_id, CN_id, id);
			}
		});

		// Hide the content
		$childDiv.hide();

		if(viz.log) console.groupEnd();

		return div;

	},

	// This method fills a task division content div with its content
	fillTaskDivision: function viz_fillTaskDivision(CR_id, CN_id, id, data, tableRow, blockContainer) {
		// Loop through every part
		var parts = data.parts;
		for(var part_id in parts) {
			var partArray = parts[part_id];
			for(var i=0;i<partArray.length;i++) {
				var partData = partArray[i];
				var colIndex = viz.getColumnIndex(partData.task);
			}
		}
		// Loop through the blocks
		var $blockContainer = $(blockContainer),
			blocks = data.blocks;
		for(var block_id in blocks) {
			var blockDiv = viz.createBlockDivision(CR_id, CN_id, id,block_id, blocks[block_id]);
			//console.log(data);
			colIndex = viz.getColumnIndex(block_id.split(':')[1]);
			if(viz.log) console.log(colIndex);
			if(viz.log) console.log($blockContainer);
			$blockContainer.append(blockDiv);
			//$(tableRow.children[colIndex]).append(blockDiv);
		}
		// Set the loaded flag
		data.loaded = true;
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

		var templateData = {};
		for(var i=0;i<propertyNames.length;i++) {
			templateData[propertyNames[i]] = data[propertyNames[i]];
		}
		templateData.id = id;

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

		var $header = $div.find('.part-header');
		var $contentDiv = $div.find('.part-content');

		$contentDiv.hide();

		// Create the collapse/expand children button
		$header.click(function() {
			if($contentDiv.is(':visible')) {
				$contentDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
			}
			else {
				$contentDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
			}
		});

		return div;

	},

	createBlockDivision: function viz_createBlockDivision(CR_id, CN_id, CT_id, id, data) {

		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'block';
		$div.attr('data-block',id);

		var parts = data.parts;
		var partsAmount=0;

		//console.log(data);
		
		var oldestPart =0;

		//console.log(data);
		
		var oldestPart;
				
		for(var part_id in parts){
			
			var partPiece = parts[part_id];
			if(oldestPart == 0)
				oldestPart = partPiece[0].created;

			//console.log("created: "+ partPiece[0].created);
			
			day = partPiece[0].created;
			if(part_id == 0)
				oldestPart = partPiece[0].created;

			if(viz.log) console.log(partPiece[0]);
			
			day = partPiece.created;
			if (day < oldestPart)
				oldestPart=day;
			partsAmount++;
		}

		
			

		//get current time
		var seconds = new Date().getTime() ;
		//console.log("seconds: "+ seconds);
		
		//subtract current time - oldest part time
		oldestPart=seconds-oldestPart;
		oldestPart=parseInt(oldestPart/(1000*3600*24));
		//console.log("oldest: "+ oldestPart);
		//get current time
		

		var pretask = id.split(':')[1];
		var templateData = {
			user: id.split(',')[0],
			task: pretask.split('-')[0],
			parts: "Parts: " + partsAmount,
			days: "Days: " + oldestPart
		};

		

		$div.loadTemplate('#block-template', templateData);


		var $header = $div.find('.block-header');
		var $contentDiv = $div.find('.block-content');

		// Hide the content
		$contentDiv.hide();

		// Create the collapse/expand children button
		$header.click(function() {
			if($contentDiv.is(':visible')) {
				//$contentDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
				viz.collapseBlock(CR_id,CN_id,CT_id,id);
			}
			else {
				//$contentDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
				viz.expandBlock(CR_id,CN_id,CT_id,id);

			}
		});

		// Fill the content div
		//var parts = data.parts;
		for(var part_id in parts) {
			// JR: FIXME: The parts are an array, but it seems that 
			var part = parts[part_id][0];
			$contentDiv.append(viz.createPartRow(part_id, part));
		}


		return $div;

	},

	expandBlock: function viz_expandBlock(CR_id, CN_id, CT_id, block_id){
		
		//make sure its loaded
		viz.loadBlock(CR_id, CN_id, CT_id, block_id);
		//get the elements
		var $div = $('div[data-block="'+block_id+'"]');
		//console.log($div);
		//expand it
		var $contentDiv = $div.find('.block-content');
		$contentDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');

	},
	
	collapseBlock: function viz_collapseBlock(CR_id, CN_id, CT_id, block_id){
		//make sure its loaded
		viz.loadBlock(CR_id, CN_id, CT_id, block_id);
		//get the elements
		var $div = $('div[data-block="'+block_id+'"]');
		//collapse
		var $contentDiv = $div.find('.block-content');
		$contentDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
		
	},
	loadBlock: function viz_loadBlock(CR_id,CN_id,CT_id,block_id){
		console.log("block loaded");
		
	},

	createPartRow: function viz_createPartRow(id, data) {

		var div = document.createElement('tr'),
			$div = $(div);

		var templateData = data;
		

		$div.loadTemplate('#part-row-template', templateData);

		return $div;

	}

};

// Call our init method when the page is loaded
$(viz.init);