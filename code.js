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

	users: [],
	partStatus: [],
	currentStates: [],
	tasks: [],
	

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
		viz.log = viz.DEBUG && typeof console === 'object';
		viz.loadData();
	},

	// This function needs to be called whenever the header changes height,
	//  in order to update the change record top margin so that the top change
	//  record isnt hidden underneath the sticky header.
	headerUpdated: function viz_headerUpdated() {
		var h = $('#header')[0].offsetHeight + parseInt($('.CR').css('margin-top'), 10);
		$('#record-div').css('margin-top', h);
	},
	
	loadData: function viz_loadData() {
		if(viz.log) console.log('Loading data');
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

	//
	//  Data Parsing
	//________________//

	// This will parse the raw csv data into a 2d array
	// The default delimiter is a comma
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
					noticeCount: 0
				};
				json.recordCount++;
			}
			var CR = json.records[CR_id];

			// Create new CN object if needed
			if(typeof CR.notices[CN_id] !== 'object') {
				CR.notices[CN_id] = {
					tasks: {},
					taskCount: 0
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
						blockCount: 0
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
			if(records.hasOwnProperty(CR_id)) {
				var CR = records[CR_id];
				// Loop through the notices
				var notices = CR.notices;
				for(var CN_id in notices) {
					if(notices.hasOwnProperty(CN_id)) {
						var CN = notices[CN_id];
						// Loop through the tasks
						var tasks = CN.tasks;
						for(var CT_id in tasks) {
							if(tasks.hasOwnProperty(CT_id)) {
								var CT = tasks[CT_id];
								viz.calculateTaskTime(CT);
							}
						}
					}
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
			if(parts.hasOwnProperty(part_id)) {
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
					// Grab the part user
					var user = partPiece.user;
					if(viz.users.indexOf(user) === -1) {
						viz.users.push(user);
					}
					
					//Grab the part status
					var stat = partPiece.status;
					if(viz.partStatus.indexOf(stat) === -1) {
						viz.partStatus.push(stat);
					}
					

					//Grab the tasks
					var taskPiece = partPiece.task;
					if(viz.tasks.indexOf(taskPiece) === -1) {
						viz.tasks.push(taskPiece);
					}
					
					//Grab the current states
					var curStat = partPiece.currentState;

					if(viz.currentStates.indexOf(curStat) === -1) {
						viz.currentStates.push(curStat);
					}
					
				}
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

		
		if(viz.log) console.group('Generating page');
		if(viz.log) console.time('Generate Page');
		$('#header-loading').show();


		$userSelect = $("select[name='dropUser']");
		$statusSelect=$("select[name='dropStatus']");
		$taskSelect=$("select[name='dropTask']");
		$currentStateSelect=$("select[name='dropCurrentState']");
		
		$("#filterButton").click(function(){
				var $CRs = $div.find('.CR');
				
				if(viz.log) console.log('filterButton clicked');
				//filter out using the dropdown values and add to copy	
				$userSelected=$userSelect.val();
				$statusSelected=$statusSelect.val();
				$taskSelected=$taskSelect.val();					
				$currentStateSelected=$currentStateSelect.val();
					
				//if(viz.log) console.log($userSelected);
				//if(viz.log) console.log($statusSelected);
				//if(viz.log) console.log($taskSelected);
				//if(viz.log) console.log($currentStateSelected);
					
				//hide/unhide relevant records
					
				for(record_id in viz.data.json.records){
					var CR = viz.data.json.records[record_id];
					viz.filterCR(record_id, CR);
				}
					
		});
		
		
		//Add user names to user select filtering dropdown
		for (var i = 0; i < viz.users.length; i++) {
            $("<option/>").attr("value", viz.users[i].id).text(viz.users[i]).appendTo($userSelect);
			}
			
		//Add status to status select filtering dropdown
		for (var i = 0; i < viz.partStatus.length; i++) {
            $("<option/>").attr("value", viz.partStatus[i].id).text(viz.partStatus[i]).appendTo($statusSelect);
			}

		//Add Tasks to Tasks select filtering dropdown
		for (var i = 0; i < viz.tasks.length; i++) {
            $("<option/>").attr("value", viz.tasks[i].id).text(viz.tasks[i]).appendTo($taskSelect);
			}		
		
		//Add currentStates to CurrentStates select filtering dropdown
		for (var i = 0; i < viz.currentStates.length; i++) {
            $("<option/>").attr("value", viz.currentStates[i].id).text(viz.currentStates[i]).appendTo($currentStateSelect);
		}
			
		
		// Create a division that will contain CR's
		var $div = $(document.createElement('div'));

		var records = json.records;
		// Loop through every change record
		for(var CR_id in records) {
			if(records.hasOwnProperty(CR_id)) {
				var CR_data = records[CR_id];
				$div.append(viz.createRecordDivision(CR_id, CR_data));
			}
		}

		$('#header-loading').hide();
		$('#header-table').show();

		// Append the div to the record-div
		$('#record-div').append($div);

		// Call the headerUpdated method to fix the content margin
		viz.headerUpdated();

		if(viz.log) console.groupEnd();
		if(viz.log) console.timeEnd('Generate Page');

	},

	filterCR: function viz_filterCR(id,data){
		var $div = $('div[data-id="'+id+'"]');
		var visible = false;
		var isCurrentlyVisible = $div.is(':visible');
		
		var filterWord = $("#filterBox").val();
		var regx = new RegExp(filterWord,"i")

		if( id.indexOf(filterWord) != -1)
		{
			visible =true;
		}
		
		for(var notice_id in data.notices){
			if(viz.filterCN(notice_id,data.notices[notice_id]))
				visible =true;
		}
	
		if(viz.log)console.log(visible);
		if(visible !== isCurrentlyVisible) {
			if(visible) {
				$div.show();
			}
			else {
				$div.hide();
			}
		}
		
	},

	filterCN: function viz_filterCN(id,data){
	
		var $div = $('div[data-id="'+id+'"]');
		var visible = false;
		var isCurrentlyVisible = $div.is(':visible');
		
		var filterWord = $("#filterBox").val();
		var regx = new RegExp(filterWord,"i")

		if( id.indexOf(filterWord) != -1)
		{
			visible =true;
		};
		
		//filter through properties of the change notice for the filterWord
		if(data.role)
			visible = visible || (data.role.indexOf(regx) != -1);
		if(data.currentState)
			visible = visible || (data.currentState.indexOf(regx) != -1);
		if(data.task)
			visible = visible || (data.task.indexOf(regx) != -1);
		if(data.status)
			visible = visible || (data.status.indexOf(regx) != -1);
		
		
		for(var task_id in data.tasks){
			if(viz.filterCT(task_id,data.tasks[task_id]))
				visible =true;
		}
	
		//show/hide
		if(visible !== isCurrentlyVisible) {
			if(visible) {
				$div.show();
			}
			else {
				$div.hide();
			}
		}
		
		if(viz.log)console.log(visible);
		return visible;
	
	},

	filterCT: function viz_filterCT(id,data){
		
		var $div = $('div[data-id="'+id+'"]');
		var visible = false;
		var isCurrentlyVisible = $div.is(':visible');
		
		var filterWord = $("#filterBox").val();
		var regx = new RegExp(filterWord,"i")

		if( id.indexOf(filterWord) != -1)
		{
			visible =true;
		};
		
		//if(viz.log)console.log(data);
		//filter through properties of the change task for the filterWord
		if(data.role)
			visible = visible || (data.role.indexOf(regx) != -1);
		if(data.status)
			visible = visible || (data.status.indexOf(regx) != -1);
		if(data.task)
			visible = visible || (data.task.indexOf(regx) != -1);
		if(data.user)
			visible = visible || (data.user.indexOf(regx) != -1);
		if(data.objectDescription)
			visible = visible || (data.objectDescription.indexOf(regx) != -1);
		if(data.currentState)
			visible = visible || (data.currentState.indexOf(regx) != -1);
		
		
		for(var block_id in data.blocks){
			if(viz.filterBlock(block_id,data.blocks[block_id]))
				visible =true;
		}
	
		//show/hide
		if(visible !== isCurrentlyVisible) {
			if(visible) {
				$div.show();
			}
			else {
				$div.hide();
			}
		}

		if(viz.log)console.log(visible);
		return visible;
		
	},
	
	filterBlock: function viz_filterBlock(id,data){
		if(viz.log)console.log(data);
		
		return false;
	},

	
	// This method creates and returns a record division
	createRecordDivision: function viz_createRecordDivision(id, data, expanded) {
		if(viz.log) console.groupCollapsed('Created DIV for record: '+id);

		// The expanded property defaults to false
		if(typeof expanded !== 'boolean') {
			expanded = false;
		}

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CR';
		$div.attr('data-loaded', expanded);
		$div.attr('data-id', id);

		// Load the template
		var templateData = {
			title: 'Change Record: '+id,
			count: data.noticeCount
		};
		$div.loadTemplate('#CR-template', templateData);

		// Get the title and notices div
		var $title = $div.find('.CR-title');
		var $childDiv = $div.find('.CR-notices');

		// Create the collapse/expand click handler
		$title.click(function() {
			if($childDiv.is(':visible')) {
				$childDiv.hide('slide', { direction: 'up', origin: ['top', 'left'] }, 'medium');
				$div.removeClass('CR-expanded');
			}
			else {
				if($div.attr('data-loaded') === 'false') {
					viz.fillRecordDivision(id, data, $childDiv);
					$div.attr('data-loaded', 'true');
				}
				$childDiv.show('slide', { direction: 'up', origin: ['top', 'left'] }, 'medium');
				$div.addClass('CR-expanded');
			}
		});

		// If expanded, load the children, else hide the child div
		if(expanded) {
			viz.fillRecordDivision(id, data, $childDiv);
			$div.addClass('CR-expanded');
		}
		else {
			$childDiv.hide();
		}

		if(viz.log) console.groupEnd();

		return div;

	},

	fillRecordDivision: function viz_fillRecordDivision(id, data, $childDiv) {
		var notices = data.notices;
		// Loop through every change notice
		for(var CN_id in notices) {
			if(notices.hasOwnProperty(CN_id)) {
				var CN_data = notices[CN_id];
				$childDiv.append(viz.createNoticeDivision(CN_id, CN_data));
			}
		}
	},

	createNoticeDivision: function viz_createNoticeDivision(id, data, expanded) {
		if(viz.log) console.groupCollapsed('Created DIV for notice: '+id);

		// The expanded property defaults to false
		if(typeof expanded !== 'boolean') {
			expanded = false;
		}

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CN';
		$div.attr('data-loaded', expanded);
		$div.attr('data-id', id);

		// Load the template
		var templateData = {
			id: id,
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

		// Get the title and notices div
		var $title = $div.find('.CN-title');
		var $childDiv = $div.find('.CN-tasks');

		// Create the collapse/expand children button
		$title.click(function() {
			if($childDiv.is(':visible')) {
				$childDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
				$div.removeClass('CN-expanded');
			}
			else {
				if($div.attr('data-loaded') === 'false') {
					viz.fillNoticeDivision(id, data, $childDiv);
					$div.attr('data-loaded', 'true');
				}
				$childDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
				$div.addClass('CN-expanded');
			}
		});

		// If expanded, load the children, else hide the child div
		if(expanded) {
			viz.fillNoticeDivision(id, data, $childDiv);
			$div.addClass('CN-expanded');
		}
		else {
			$childDiv.hide();
		}

		if(viz.log) console.groupEnd();

		return div;

	},

	// This method fills a notice division children div with its children
	fillNoticeDivision: function viz_fillNoticeDivision(id, data, $childDiv) {
		// Loop through every change task
		var tasks = data.tasks;
		for(var CT_id in tasks) {
			if(tasks.hasOwnProperty(CT_id)) {
				var CT_data = tasks[CT_id];
				$childDiv.append(viz.createTaskDivision(CT_id, CT_data));
			}
		}
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

	// This method creates and returns a task division
	createTaskDivision: function viz_createTaskDivision(id, data, expanded) {

		// The expanded property defaults to false
		if(typeof expanded !== 'boolean') {
			expanded = false;
		}

		// Create the division
		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'CT';
		$div.attr('data-loaded', expanded);
		$div.attr('data-id', id);

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

		var $blockContainer = $div.find('.CT-block-container'),
			blockContainer = $blockContainer[0];

		// Create the collapse/expand children button
		$title.click(function() {
			if($childDiv.is(':visible')) {
				$childDiv.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
				$blockContainer.hide('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
				$div.removeClass('CT-expanded');
			}
			else {
				if($div.attr('data-loaded') === 'false') {
					viz.fillTaskDivision(id, data, tableRow, blockContainer);
					$div.attr('data-loaded', 'true');
				}
				$childDiv.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
				$blockContainer.show('slide', { direction: 'up', origin: ['top', 'center'] }, 'slow');
				$div.addClass('CT-expanded');
			}
		});

		// Set the data loaded attribute
		$div.attr('data-loaded', expanded);

		// Fill with parts if expanded, else hide the children div
		if(expanded) {
			viz.fillTaskDivision(id, data, tableRow, blockContainer);
		}
		else {
			$childDiv.hide();
			$blockContainer.hide();
		}

		// $div.append(childDiv);

		return div;

	},

	// This method fills a task division children div with its children
	fillTaskDivision: function viz_fillTaskDivision(id, data, tableRow, blockContainer) {
		// Loop through every part
		var parts = data.parts;
		for(var part_id in parts) {
			if(parts.hasOwnProperty(part_id)) {
				var partArray = parts[part_id];
				for(var i=0;i<partArray.length;i++) {
					var partData = partArray[i];
					var partDiv = viz.createPartDivision(part_id, partData);
					// var partDiv = viz.createPartDivision(part_id+'['+i+']', partData);
					var colIndex = viz.getColumnIndex(partData.task);
					$(tableRow.children[colIndex]).append(partDiv);
				}
			}
		}
		// Loop through the blocks
		var blocks = data.blocks;
		for(var block_id in blocks) {
			if(blocks.hasOwnProperty(block_id)) {
				var blockData = blocks[block_id];
				var blockDiv = viz.createBlockDivision(block_id, blockData);
				$(blockContainer).append(blockDiv);
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

	createBlockDivision: function viz_createBlockDivision(id, data) {

		var div = document.createElement('div'),
			$div = $(div);
		div.className = 'block';

		var templateData = {
			user: id.split(':')[0],
			task: id.split(':')[1]
		};

		$div.loadTemplate('#block-template', templateData);


		var $header = $div.find('.block-header');
		var $contentDiv = $div.find('.block-content');

		// Hide the content
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

		// Fill the content div
		var parts = data.parts;
		for(var part_id in parts) {
			// JR: FIXME: The parts are an array, but it seems that 
			var part = parts[part_id][0];
			$contentDiv.append(viz.createPartRow(part_id, part));
		}


		return $div;

	},

	createPartRow: function viz_createPartRow(id, data) {

		var div = document.createElement('div'),
			$div = $(div);

		var templateData = data;

		$div.loadTemplate('#part-row-template', templateData);

		return $div;

	}

};

// Call our init method when the page is loaded
$(viz.init);