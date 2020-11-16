(function () {
    
    //create a list of attributes from the csv file headers
    var attrArray = ["Select Age Range", "Age 0-9", "Age 10-19", "Age 20-29", "Age 30-39", "Age 40-49", "Age 50-59", "Age 60-69", "Age 70-79", "Age 80 Plus"],

        //set the initial value of the variable currently being visualized
        expressed = attrArray[0];
    
    //set the dimensions for the chart frame
    var chartWidth = window.innerWidth * 0.425,
        chartHeight = 600,
        leftPadding = 30,
        rightPadding = 50,
        topBottomPadding = 6,
        chartInnerWidth = chartWidth - leftPadding - rightPadding,
        chartInnerHeight = chartHeight - topBottomPadding * 2,
        translate = "translate(" + leftPadding + "," + topBottomPadding + ")";

    //create a scale to size the bars proportionally to the frame and for the axis
    var yScale = d3.scale.linear()
        .range([585, 0])
        .domain([0, 140]);
    
    //begin the script when the window loads
    window.onload = setMap();

    //function to create the map
    function setMap(){
           
        //set the dimension fo the map frame
        var width = window.innerWidth * 0.425,
            height = 585;
        
        //create a new svg element with the dimensions of the map frame
        var map = d3.select("body")
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("class", "map")
            .attr("fill", "lightBlue");
        
        //create a transverseMercator projection centered on New Jersey
        var projection = d3.geo.transverseMercator()
            .rotate([74 + 30 / 60, -40 - 10 / 60])
            .scale(13000)
            .translate([width / 2, height / 2]);

        //create svg path generator using the projection
        var path = d3.geo.path()
            .projection(projection);
        
        //use queue.js to parallelize asynchronous data loading for cpu efficiency
        d3.queue()
            //load attributes data from csv file
            .defer(d3.csv, "data/lab2_data.csv")
            //load county geometry from topojson
            .defer(d3.json, "data/NJ_Counties.topojson")
            //load surrounding state geometry from topojson
            .defer(d3.json, "data/states.topojson")  
            .await(callback);

        //call back function to load create map details and chart
        function callback(error, csvData, njc, state){

            //place graticules on the map
            setGraticule(map, path);

            //translate New Jersey TopoJSON data
            var NJCounties = topojson.feature(njc, njc.objects.NJ_Counties).features,
                otherStates = topojson.feature(state, state.objects.states);

            //add surrounding states to map
            var states = map.append("path")
                .datum(otherStates)
                .attr("class", "states")
                .attr("d", path);
            
            //join csv data to GeoJSON enumeration units
            NJCounties = joinData(NJCounties, csvData);
            
            //create the color scale
            var colorScale = makeColorScale(csvData);

            //add enumeration units to the map
            setEnumerationUnits(NJCounties, map, path, colorScale);
            
            //add chart
            setChart(csvData, colorScale);
            
            //add dropdown menu
            createDropdown(csvData);
            
        };//end of callback()
    };//end of setMap()

    //function to create the graticules
    function setGraticule(map, path) {
        
        //place graticule lines every 1 degree
        var graticule = d3.geo.graticule()
            .step([1, 1]); 

        //create graticule lines
        var gratLines = map.selectAll(".gratLines")
            .data(graticule.lines)
            .enter()
            .append("path")
            .attr("class", "gratLines")
            .attr("d", path);
    };
    
    //function to join csv data to geojson attributes
    function joinData(NJCounties, csvData){
        for (var i=0; i < csvData.length; i++) {
                //the current county
                var csvCounty = csvData[i];
                //the csv primary key
                var csvKey = csvCounty.GEOID;

                //loop through geojson enumeration units
                for (var a=0; a<NJCounties.length; a++) {
                    
                    //the current enumeration unit geojson properties
                    var geojsonProps = NJCounties[a].properties;
                    //the geojson primary key
                    var geojsonKey = geojsonProps.GEOID;

                    //where primary keys match, transfer csv data to geojson properties object
                    if (geojsonKey == csvKey) {

                        //assign all attributes and values
                        attrArray.forEach(function(attr){
                            //get csv attribute value
                            var val = parseFloat(csvCounty[attr]);
                            //assign attribute and value to geojson properties
                            geojsonProps[attr] = val;
                        });
                    };
                };
            };

        return NJCounties;
    };
    
    //function to create color scale generator
    function makeColorScale(data){
        var colorClasses = ['#ccece6','#99d8c9','#66c2a4','#41ae76','#238b45','#005824'];

        //create color scale generator
        var colorScale = d3.scale.threshold()
            .range(colorClasses);

        //build array of all values of the expressed attribute
        var domainArray = [];
        for (var i=0; i<data.length; i++){
            var val = parseFloat(data[i][expressed]);
            domainArray.push(val);
        };

        //cluster data using ckmeans clustering algorithm to create natural breaks
        var clusters = ss.ckmeans(domainArray, 5);
        //reset domain array to cluster minimums
        domainArray = clusters.map(function(d){
            return d3.min(d);
        });
        //remove first value from domain array to create class breakpoints
        domainArray.shift();

        //assign array of last 4 cluster minimums as domain
        colorScale.domain(domainArray);

        return colorScale;
};
    
    //function to create enumeration units and place them on the map
    function setEnumerationUnits(NJCounties, map, path, colorScale){

        //add New Jersey counties to map
        var counties = map.selectAll(".counties")
            .data(NJCounties)
            .enter()
            .append("path")
            .attr("class", function(d){
                return "counties " + d.properties.GEOID;
            })
            .attr("d", path)
            .style("fill", function(d){
                return colorScale(d.properties[expressed]);
            })
            .style("fill", function(d){
                return choropleth(d.properties, colorScale);
            })
            .on("mouseover", function(d){
                highlight(d.properties);
            })
            .on("mouseout", function(d){
                dehighlight(d.properties);
            })
            .on("mousemove", moveLabel);
                
        //add style descriptor to each path
        var desc = counties.append("desc")
            .text('{"stroke": "#000", "stroke-width": "0.5px"}');
    };
    
    //function to assign color of enumeration unit and handle missing value
    function choropleth(props, colorScale){
        
        //make sure attribute value is a number
        var val = parseFloat(props[expressed]);
        
        //if attribute value exists, assign a color; otherwise assign gray
        if (typeof val == 'number' && !isNaN(val)){
            return colorScale(val);
        } else {
            return "#CCC";
        };
    };

    //function to create coordinated axis bar chart
    function setChart(csvData, colorScale){

        //create a second svg element to hold the bar chart
        var chart = d3.select("body")
            .append("svg")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("class", "chart");

        //create a rectangle for chart background fill
        var chartBackground = chart.append("rect")
            .attr("class", "chartBackground")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);

        //set bars for each county
        var bars = chart.selectAll(".bars")
            .data(csvData)
            .enter()
            .append("rect")
            .sort(function(a, b){
                return b[expressed]-a[expressed]
            })
            .attr("class", function(d){
                return "bar " + d.GEOID;
            })
            .attr("width", chartInnerWidth / csvData.length - 1)
            .on("mouseover", highlight)
            .on("mouseout", dehighlight)
            .on("mousemove", moveLabel);
        
        //add style descriptor to each rect
        var desc = bars.append("desc")
            .text('{"stroke": "none", "stroke-width": "0px"}');

        //create a text element for the chart title
        var chartTitle = chart.append("text")
            .attr("x", 90)
            .attr("y", 40)
            .attr("class", "chartTitle")

        //create frame for chart border
        var chartFrame = chart.append("rect")
            .attr("class", "chartFrame")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);

        //create vertical axis generator
        var yAxis = d3.svg.axis()
            .scale(yScale)
            .orient("left");

        //place axis
        var axis = chart.append("g")
            .attr("class", "axis")
            .attr("transform", translate)
            .call(yAxis);
        
        //set bar positions, heights, and colors
        updateChart(bars, csvData.length, colorScale);
        
    };
    
    //function to create a dropdown menu for attribute selection
    function createDropdown(csvData){
        
        //add select element
        var dropdown = d3.select("body")
            .append("select")
            .attr("class", "dropdown")
            .on("change", function(){
                changeAttribute(this.value, csvData)
            });

        //add attribute name options
        var attrOptions = dropdown.selectAll("attrOptions")
            .data(attrArray)
            .enter()
            .append("option")
            .attr("value", function(d){ return d })
            .text(function(d){ return d });
    };
       
    //dropdown change listener handler
    function changeAttribute(attribute, csvData){
        
        //change the expressed attribute
        expressed = attribute;

        //recreate the color scale
        var colorScale = makeColorScale(csvData);

        //recolor enumeration units
        var counties = d3.selectAll(".counties")
            .transition()
            .duration(1000)
            .style("fill", function(d){
                return choropleth(d.properties, colorScale)
        });
        
        //re-sort, resize, and recolor bars
        var bars = d3.selectAll(".bar")
            //re-sort bars
            .sort(function(a, b){
                return b[expressed] - a[expressed];
            })
            .transition()
            .delay(function(d, i){
                return i * 40
            })
            .duration(1500);

        updateChart(bars, csvData.length, colorScale);
    };

    //function to position, size, and color bars in chart
    function updateChart(bars, n, colorScale){
        
        //position bars
        bars.attr("x", function(d, i){
                return i * (chartInnerWidth / n) + leftPadding;
            })
            //size/resize bars
            .attr("height", function(d, i){
                return 585 - yScale(parseFloat(d[expressed]));
            })
            .attr("y", function(d, i){
                return yScale(parseFloat(d[expressed])) + topBottomPadding;
            })
            //color/recolor bars
            .style("fill", function(d){
                return choropleth(d, colorScale);
            });
        
        //add text to chart title
        var chartTitle = d3.select(".chartTitle")
            .text("Number of Residents per County " + expressed + " per 1,000");
    };
    
     //function to highlight enumeration units and bars
    function highlight(props){
        
        //change stroke
        var selected = d3.selectAll("." + props.GEOID)
            .style("stroke", "blue")
            .style("stroke-width", "2");
        setLabel(props);
    };
    
     //function to reset the element style on mouseout
    function dehighlight(props){
        var selected = d3.selectAll("." + props.GEOID)
            .style("stroke", function(){
                return getStyle(this, "stroke")
            })
            .style("stroke-width", function(){
                return getStyle(this, "stroke-width")
            });

        function getStyle(element, styleName){
            var styleText = d3.select(element)
                .select("desc")
                .text();

            var styleObject = JSON.parse(styleText);

            return styleObject[styleName];
        };
        
        d3.select(".infolabel")
            .remove();      
    };

    //function to create dynamic label
    function setLabel(props){
        
        //label content
        var labelAttribute = "<h1>" + props[expressed] +
            "</h1><b>" + expressed + "</b>";

        var countyName = props.NAME + " County"    
        
        //create info label div
        var infolabel = d3.select("body")
            .append("div")
            .attr("class", "infolabel")
            .attr("id", props.GEOID + "_label")
            .html(labelAttribute)
            .append("div")
            .attr("class", "countyName")
            .html(countyName);

    };

    //function to move info label with mouse
    function moveLabel(){
        
        //get width of label
        var labelWidth = d3.select(".infolabel")
            .node()
            .getBoundingClientRect()
            .width;

        //use coordinates of mousemove event to set label coordinates
        var x1 = d3.event.clientX + 10,
            y1 = d3.event.clientY - 75,
            x2 = d3.event.clientX - labelWidth - 10,
            y2 = d3.event.clientY + 25;

        //horizontal label coordinate, testing for overflow
        var x = d3.event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1;
        
        //vertical label coordinate, testing for overflow
        var y = d3.event.clientY < 75 ? y2 : y1; 

        d3.select(".infolabel")
            .style("left", x + "px")
            .style("top", y + "px");
    };
    
    
})();