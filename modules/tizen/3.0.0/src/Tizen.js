define(['Ti/_/lang', 'Ti/_/Evented', 'AttributeFilter', 'AttributeRangeFilter', 'CompositeFilter', 'SortMode', 'SimpleCoordinates', 'Power', 'Calendar', 'Download', 'Alarm', 'Callhistory', 'Notification', 'Apps'], 
		function(lang, Evented ,AttributeFilter, AttributeRangeFilter, CompositeFilter, SortMode, SimpleCoordinates, Power, Calendar, Download, Alarm, Callhistory, Notification, 'Apps') {
   
	var Tizen = lang.mixProps(require.mix({}, Evented), {
		constants: {
				FILTER_MATCH_FLAG_EXACTLY: 'EXACTLY',
				FILTER_MATCH_FLAG_FULLSTRING: 'FULLSTRING',
				FILTER_MATCH_FLAG_CONTAINS: 'CONTAINS',
				FILTER_MATCH_FLAG_STARTSWITH: 'STARTSWITH',
				FILTER_MATCH_FLAG_ENDSWITH: 'ENDSWITH',
				FILTER_MATCH_FLAG_EXISTS: 'EXISTS',
				SORT_MODE_ORDER_ASC: 'ASC',
				SORT_MODE_ORDER_DESC: 'DESC',
				COMPOSITE_FILTER_TYPE_UNION: 'UNION',
				COMPOSITE_FILTER_TYPE_INTERSECTION: 'INTERSECTION',
				Power: Power,
				Download: Download,
				Calendar: Calendar,
                Alarm: Alarm,
                Callhistory: Callhistory,
                Notification: Notification,
				Apps: Apps
		},

		createAttributeFilter: function(args) {
			return new AttributeFilter(args);
		},

		createAttributeRangeFilter: function(args) {
			return new AttributeRangeFilter(args);
		},

		createCompositeFilter: function(args) {
			return new CompositeFilter(args);
		},

		createSortMode: function(args) {
			return new SortMode(args);
		},

		createSimpleCoordinates: function(args) {
			return new SimpleCoordinates(args);
		}
	
	}, true);

	return Tizen;
});