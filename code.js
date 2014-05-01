
/*

	TODO:

		Filtering down to the part-row level

		Highlight blocks of text that matched the filtered text

		Highlight headers in the correct column

		More error handling messages
			Alert when file is not found

		On hover info text

		Remove log statements

		Make it all faster for IE8

*/

viz = {
	
	data: {
		raw: null,
		array: null,
		json: null
	},
		// Some storage for all the data, same data but different formats

	//
	//  Constants
	//_____________//

	DEBUG: false,
		// Whether to log output or not

	log: null,
		// Whether we will log output or not, this also depends on the console object being available

	LATE_THRESHOLD: 5,

	ALMOST_LATE_THRESHOLD: 3,


	DATA_FILEPATH: 'taskreport.csv',
		// The filepath for the CSV data


	NULL_CSV_STRING: ' ',
		// When the CSV data we parse is outputted, some cells are meant to be empty
		// If this string is in the cell that is how we know it is meant to be empty


	CR_SLIDE_SPEED: 'medium',

	CT_SLIDE_SPEED: 'slow',

	CN_SLIDE_SPEED: 'slow',

	BLOCK_SLIDE_SPEED: 'slow',


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
		$.get(viz.DATA_FILEPATH, function(data) {
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
		viz.setStatus('Forming hierarchical data structure');

		// Get the first row
		var row = data[0];

		// Find the indexes of the columns we care about, using the column titles
		var CR_index = row.indexOf('CR'),
			CN_index = row.indexOf('CN'),
			CT_index = row.indexOf('CT'),
			part_index = row.indexOf('Part/Doc/VS'),
			task_index = row.indexOf('Task'),
			objectDescription_index = row.indexOf('Object Description'),
			user_index = row.indexOf('User'),
			// role_index = row.indexOf('Role'),
			currentState_index = row.indexOf('Current State'),
			// status_index = row.indexOf('Status'),
			created_index = row.indexOf('Created'),
			lastModified_index = row.indexOf('Last Modified');

		// Create the toplevel data object
		var json = {
			records: {},
			recordCount: 0,
			lateRecordCount: 0
		};

		// Loop through every row
		// Start at 1 to avoid the column names
		for(var rowIndex = 1; rowIndex < data.length; rowIndex++ ) {

			row = data[rowIndex];

			// Break if it's an empty line(usually the last line in the file)
			if(row.length === 1 && row[0] === '') {
				continue;
			}

			//because IE8 doesn't, this code parses the date given by excel

			var createdDateStr=row[created_index]; //returned from mysql timestamp/datetime field
			var a=createdDateStr.split(" ");
			var d=a[0].split("-");
			var t=a[1].split(":");
			var createdDate = new Date(d[0],(d[1]-1),d[2],t[0],t[1], 0);//assumes all timezones are the same
			
			var modifiedDateStr=row[lastModified_index]; //returned from mysql timestamp/datetime field
			a=modifiedDateStr.split(" ");
			d=a[0].split("-");
			t=a[1].split(":");
			var modifiedDate = new Date(d[0],(d[1]-1),d[2],t[0],t[1], 0);//assumes all timezones are the same

			// End of IE8 date parsing code

			var CR_id = row[CR_index],
				CN_id = row[CN_index],
				CT_id = row[CT_index],
				part_id = row[part_index],
				createdValue = createdDate.valueOf(),
				modifiedValue = modifiedDate.valueOf();

			// Create new CR object if needed
			if(typeof json.records[CR_id] !== 'object') {
				json.records[CR_id] = {
					notices: {},
					noticeCount: 0,
					lateNoticeCount: 0,
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
					lateTaskCount: 0,
					loaded: false
				};
				CR.noticeCount++;
			}
			var CN = CR.notices[CN_id];

			// Check if CT_id is null
			if(CT_id === viz.NULL_CSV_STRING) {

				// CT is null, so this row defines the CN data
				CN.task = row[task_index];
				CN.objectDescription = row[objectDescription_index];
				CN.currentState = row[currentState_index];
				CN.user = row[user_index];
				CN.created = createdValue;
				CN.lastModified = modifiedValue;

			}
			else {

				// Create new CT object if needed
				if(typeof CN.tasks[CT_id] !== 'object') {
					CN.tasks[CT_id] = {
						parts: {},
						partCount: 0,
						latePartCount: 0,
						blocks: {},
						blockCount: 0,
						lateBlockCount: 0,
						loaded: false
					};
					CN.taskCount++;
				}
				var CT = CN.tasks[CT_id];

				// Check if part_id is null
				if(part_id === viz.NULL_CSV_STRING) {

					// Part is null, this row defines the CT data
					CT.task = row[task_index];
					CT.objectDescription = row[objectDescription_index];
					CT.currentState = row[currentState_index];
					CT.user = row[user_index];
					CT.created = createdValue;
					CT.lastModified = modifiedValue;

				}
				else {

					// Create new part array if needed
					if(typeof CT.parts[part_id] !== 'object') {
						CT.parts[part_id] = {
							task: row[task_index],
							objectDescription: row[objectDescription_index],
							currentState: row[currentState_index],
							user: row[user_index],
							created: createdValue,
							lastModified: modifiedValue,
							daysLate: NaN,
							isLate: false,
							isAlmostLate: false
						};
						CT.partCount++;
					}

					var part = CT.parts[part_id];


					// Get current time
					var currentTime = new Date().getTime();

					// Subtract current time - created part time
					var daysLate = currentTime-part.created;
					daysLate = Math.floor(daysLate/(1000*3600*24));

					part.daysLate = daysLate;

					if(daysLate > viz.LATE_THRESHOLD) {
						part.isLate = true;
					}
					else if(daysLate > viz.ALMOST_LATE_THRESHOLD) {
						part.isAlmostLate = true;
					}

					// Also sort the part by "user-task" in the CT object
					var userBlockId = part.user + ':' + part.task;
					if(typeof CT.blocks[userBlockId] !== 'object') {
						CT.blocks[userBlockId] = {
							parts: {},
							partCount: 0,
							latePartCount: 0
						};
						CT.blockCount++;
					}
					var userBlockData = CT.blocks[userBlockId];
					if(typeof userBlockData.parts[part_id] !== 'object') {
						userBlockData.parts[part_id] = [];
					}
					userBlockData.parts[part_id] = part;
					userBlockData.partCount++;

				}

			}

		}

		viz.tallyLateCounts(json);

		// Return the data
		return json;

	},

	tallyLateCounts: function viz_tallyLateCounts(json) {
		// Loop through the records
		var records = json.records;
		for(var CR_id in records) {
			var record = records[CR_id];
			// Loop through the notices
			var notices = record.notices;
			for(var CN_id in notices) {
				var notice = notices[CN_id];
				// Loop through the tasks
				var tasks = notice.tasks;
				for(var CT_id in tasks) {
					var task = tasks[CT_id];
					// Loop through the blocks
					var blocks = task.blocks;
					for(var block_id in blocks) {
						var block = blocks[block_id];
						// Loop through the parts
						var parts = block.parts;
						for(var part_id in parts) {
							var part = parts[part_id];
							if(part.isLate) {
								block.latePartCount++;
							}
						}
						// Check if block is late
						if(block.latePartCount) {
							task.lateBlockCount++;
						}
					}
					// Check if task is late
					if(task.lateBlockCount) {
						notice.lateTaskCount++;
					}
				}
				// Check if notice is late
				if(notice.lateTaskCount) {
					record.lateNoticeCount++;
				}
			}
			// Check if record is late
			if(record.lateNoticeCount) {
				json.lateRecordCount++;
			}
		}
	},
	
	//
	//  Page Generation
	//___________________//

	generatePage: function viz_generatePage(json) {
		
		// Set the status
		viz.setStatus('Generating the page');

		// if(viz.log) console.group('Generating page');
		// if(viz.log) console.time('Generate Page');
		$('#header-loading').show();

		//add filter button functionality
		$("#filterButton").click(function(){
			viz.filterPage();
		});

		//add reset button functionality
		$("#resetButton").click(function(){
			viz.resetPage();
		});

		$(document).keydown(function(e){
			//if enter key pressed, filter
			if (e.keyCode == 13) {
				viz.filterPage();
			}
		});
		

		var i;

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

		// if(viz.log) console.groupEnd();
		// if(viz.log) console.timeEnd('Generate Page');

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
		// if(data.role)				visible = visible || viz.filterRegex.test(data.role);
		if(data.currentState)		visible = visible || viz.filterRegex.test(data.currentState);
		if(data.task)				visible = visible || viz.filterRegex.test(data.task);
		// if(data.status)				visible = visible || viz.filterRegex.test(data.status);
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
		// if(data.role)				visible = visible || viz.filterRegex.test(data.role);
		if(data.currentState)		visible = visible || viz.filterRegex.test(data.currentState);
		if(data.task)				visible = visible || viz.filterRegex.test(data.task);
		// if(data.status)				visible = visible || viz.filterRegex.test(data.status);
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
		
		//console.log("BLOCK DATA",data);
		if(viz.filterRegex.test(block_id)) {
			visible = true;
		}

		// Filter each blocks parts
		for(var part_id in data.parts){
			if(viz.filterPart(part_id, data.parts[part_id])) {
				visible = true;
			}
		}



		//show/hide
		if(visible) {
			viz.expandBlock(CR_id, CN_id, CT_id, block_id);
			$div.show();
		}
		else {
			$div.hide();
			viz.collapseBlock(CR_id, CN_id, CT_id, block_id);
		}

		return visible;

	},

	filterPart: function viz_filterPart(part_id,data){
		var visible = false;
		//console.log("part data: ",data[0]);
		// data=data[0];
		//filter through properties of the parts for the filterWord
		if(data.role)				visible = visible || viz.filterRegex.test(data.role);
		if(data.currentState)		visible = visible || viz.filterRegex.test(data.currentState);
		if(data.task)				visible = visible || viz.filterRegex.test(data.task);
		if(data.status)				visible = visible || viz.filterRegex.test(data.status);
		if(data.user)				visible = visible || viz.filterRegex.test(data.user);
		if(data.objectDescription)	visible = visible || viz.filterRegex.test(data.objectDescription);

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
		// if(viz.log) console.groupCollapsed('Created DIV for record: '+CR_id);

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CR';
		$div.attr('data-cr', CR_id);

		// Load the template
		var templateData = {
			title: 'Change Record: '+CR_id,
			count: data.noticeCount,
			lateCount: data.lateNoticeCount
		};

		$div.loadTemplate('#CR-template', templateData);

		if(data.lateNoticeCount) {
			$div.find('.lateCountSpan').removeClass('hidden');
		}

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

		// if(viz.log) console.groupEnd();

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
		// if(viz.log) console.groupCollapsed('Created DIV for notice: '+CN_id);

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CN';
		$div.attr('data-cn', CN_id);

		// Load the template
		var templateData = {
			id: CN_id,
			count: data.taskCount,
			lateCount: data.lateTaskCount,
			user: data.user,
			currentState: data.currentState,
			objectDescription: data.objectDescription
		};

		// MCO's dont seem to have data
		if(typeof data.task === 'string') {
			templateData.task =  ' - '+data.task;
		}

		$div.loadTemplate('#CN-template', templateData);

		if(data.lateTaskCount) {
			$div.find('.lateCountSpan').removeClass('hidden');
		}

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

		// if(viz.log) console.groupEnd();

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
			viz.fillTaskDivision(CR_id, CN_id, CT_id, CT_data, $div.find('.CT-block-container'));
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
		// if(viz.log) console.groupCollapsed('Created DIV for task: '+id);

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CT';
		$div.attr('data-ct', id);

		// Load the template
		var templateData = {
			id: id,
			count: data.blockCount,
			lateCount: data.lateBlockCount,
			user: data.user,
			task: data.task,
			currentState: data.currentState,
			objectDescription: data.objectDescription
		};
		$div.loadTemplate('#CT-template', templateData);

		if(data.lateBlockCount) {
			$div.find('.lateCountSpan').removeClass('hidden');
		}

		// Get the title and notices div
		var $title = $div.find('.CT-title');

		// JR: TODO: Since we're moving to the block view rather than parts, remove this part div eventually
		var $childDiv = $div.find('.CT-parts');

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

		// if(viz.log) console.groupEnd();

		return div;

	},

	// This method fills a task division content div with its content
	fillTaskDivision: function viz_fillTaskDivision(CR_id, CN_id, id, data, blockContainer) {
		var colIndex;
		// Loop through every part
		var parts = data.parts;
		for(var part_id in parts) {
			var partArray = parts[part_id];
			for(var i=0;i<partArray.length;i++) {
				var partData = partArray[i];
				colIndex = viz.getColumnIndex(partData.task);
			}
		}
		// Loop through the blocks
		var $blockContainer = $(blockContainer),
			blocks = data.blocks;
		for(var block_id in blocks) {
			var blockDiv = viz.createBlockDivision(CR_id, CN_id, id,block_id, blocks[block_id]);
			colIndex = viz.getColumnIndex(block_id.split(':')[1]);
			//if(viz.log) console.log("column index",colIndex);
			$blockContainer.append(blockDiv);
		}
		// Set the loaded flag
		data.loaded = true;
	},

	createBlockDivision: function viz_createBlockDivision(CR_id, CN_id, CT_id, id, data) {

		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'block';
		$div.attr('data-block',id);

		var parts = data.parts,
			part_id, part;

		var oldestPart = NaN;

		for(part_id in parts){

			part = parts[part_id];

			if(isNaN(oldestPart) || part.created < oldestPart) {
				oldestPart = part.created;
			}

		}

		//get current time
		var seconds = new Date().getTime();

		//console.log("seconds: "+ seconds);

		//subtract current time - oldest part time
		oldestPart = seconds-oldestPart;
		oldestPart = Math.floor(oldestPart/(1000*3600*24));
		//console.log("oldest: "+ oldestPart);
		//get current time

		var pretask = id.split(':')[1];
		var templateData = {
			user: id.split(',')[0],
			task: pretask.split('-')[0],
			parts: "Parts: " + data.partCount,
			days: "Days Late: " + oldestPart
		};

		// Create and insert the header

		$div.loadTemplate('#block-template', templateData);
		var $header = viz.createBlockHeaderDivision(templateData);

		//user block red after 50 days late, yellow for 30-50 days
		if (oldestPart >= 50) {
			$header.addClass('block-late');
		}
		else if(oldestPart > 30 && oldestPart < 50) {
			$header.addClass('block-almostLate');
		}

		var colIndex = viz.getColumnIndex(templateData.task);
		$($div.find('.partRow')[0].children[colIndex]).append($header);

		// Hide the content

		var $contentDiv = $div.find('.block-content');

		$contentDiv.hide();

		// Create the collapse/expand children button
		$header.click(function() {
			if($contentDiv.is(':visible')) {
				viz.collapseBlock(CR_id, CN_id, CT_id, id);
			}
			else {
				viz.expandBlock(CR_id, CN_id, CT_id, id);
			}
		});

		// Fill the content div with part rows
		for(part_id in parts) {
			$contentDiv.append(viz.createPartRow(part_id, parts[part_id]));
		}

		return $div;

	},

	createBlockHeaderDivision: function viz_createBlockHeaderDivision(data) {
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'block-header';

		$div.loadTemplate('#block-header-template', data);

		return $div;

	},

	expandBlock: function viz_expandBlock(CR_id, CN_id, CT_id, block_id){

		//get the elements
		var $div = $('div[data-block="'+block_id+'"]');
		//console.log($div);
		//expand it
		var $contentDiv = $div.find('.block-content');
		$contentDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');

	},

	collapseBlock: function viz_collapseBlock(CR_id, CN_id, CT_id, block_id){
		//get the elements
		var $div = $('div[data-block="'+block_id+'"]');
		//collapse
		var $contentDiv = $div.find('.block-content');
		$contentDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
		
	},

	createPartRow: function viz_createPartRow(id, data) {

		var $div = $(document.createElement('tr'));

		$div.loadTemplate('#part-row-template', data);

		if(data.isLate) {
			$div.addClass('part-row-late');
		}
		else if(data.isAlmostLate) {
			$div.addClass('part-row-almostLate');
		}

		return $div;

	}

};

// Call our init method when the page is loaded
$(viz.init);