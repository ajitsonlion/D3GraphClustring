var width = $(document).width(),     // svg width
    height = $(document).height(),   // svg height
    nodeSize = [40, 40], // node collision dimensions
    layers, outerGraph, outerNet, outerL;

var d3 = this.d3;
var cola = this.cola;

function isNum(a) {
    return !isNaN(parseFloat(a)) && isFinite(a);
}

function getGroup(n) {
    return n.group;
}


// build groups, nodes, and links of current network
function network(graph, expand) {
    // cache info for all data
    var groupMap = graph.groupMap,
        nodeMap = graph.nodeMap,
        linkMap = graph.linkMap,
        nodes = graph.nodes,
        links = graph.links;

    // displayMap is a container for everything in
    // the current visualization, keyed by object name
    var displayMap = {nodes: {}, links: {}, groups: {}},
    // arrays of objects to display
        displayNodes = [],
        displayLinks = [],
        displayGroups = [],
        constraints = [];

    // lexicOrder creates reproducible labels given a pair of unordered input strings
    function lexicOrder(u, v) {
        return u < v ? u + '|' + v : v + '|' + u;
    }

    // define the current set of nodes: loop through the global list of groups
    for (key in groupMap) {
        if (expand[key]) {
            displayMap.groups[key] = {leaves: [], groups: [], name: key, id: groupMap[key].id};
            // loop over leaves and push onto display arrays
            groupMap[key].indices.forEach(function (index) {
                var n = nodes[index],
                    i = displayNodes.length;
                displayNodes.push(n);
                displayMap.nodes[n.name] = displayNodes[i];
                displayMap.groups[key].leaves.push(i);
            });
        } else {
            // if the current group is collapsed, push a group node
            var i = displayNodes.length;
            displayNodes.push({name: key, group: key});
            displayMap.nodes[key] = displayNodes[i];
        }
        // done with node definitions
    }

    // push groups from displayMap to displayGroups
    for (key in displayMap.groups) {
        displayGroups.push(displayMap.groups[key]);
    }

    // check for constraints on expanded groups
    displayGroups.forEach(function (g) {
        if (graph.grpCons === undefined) {
            return
        }
        var cons = graph.grpCons[g.name];
        if (cons) {
            // if the current displayGroup is in the list of JSON group constraints
            // then set up a new constraint, iterating over the group leaves and adding
            // them to the webCola constraint
            cons.forEach(function (con) {
                var newCon = {type: 'alignment', axis: con.axis, offsets: []};
                g.leaves.forEach(function (leaf) {
                    newCon.offsets.push({
                        node: leaf,
                        "offset": con.spacing ? con.spacing * g.leaves.indexOf(leaf) : 0
                    });
                });
                constraints.push(newCon);
            });
        }
    });


    // define links given the current node set
    for (key in linkMap) {
        // we need to see if linked groups are expanded, so cache the groups
        var srcGrp = linkMap[key].groups[0],
            tgtGrp = linkMap[key].groups[1];
        if (expand[srcGrp] && expand[tgtGrp]) {
            // if both groups are expanded, use linked node names
            var src = linkMap[key].names[0],
                tgt = linkMap[key].names[1],
                thisLink = lexicOrder(src, tgt),
                i = displayLinks.length;
            // node|node links are singular, so push to displayLinks directly
            displayLinks.push({
                source: displayMap.nodes[src],
                target: displayMap.nodes[tgt],
                count: 1,
                name: key
            });
            // add a displayMap entry
            displayMap.links[thisLink] = displayLinks[i];
        } else if (expand[srcGrp]) {
            // if the source group is expanded, get the source node name
            // and use the group name for the target
            var src = linkMap[key].names[0],
                thisLink = lexicOrder(src, tgtGrp);
            displayMap.links[thisLink] =
                displayMap[thisLink] || {
                    source: displayMap.nodes[src],
                    target: displayMap.nodes[tgtGrp],
                    count: 0,
                    name: thisLink
                };
            displayMap.links[thisLink].count += 1;
        } else if (expand[tgtGrp]) {
            // if the target group is expanded, get the target node name
            // and use the group name for the source
            var tgt = linkMap[key].names[1],
                thisLink = lexicOrder(srcGrp, tgt);
            displayMap.links[thisLink] =
                displayMap[thisLink] || {
                    source: displayMap.nodes[srcGrp],
                    target: displayMap.nodes[tgt],
                    count: 0,
                    name: thisLink
                };
            displayMap.links[thisLink].count += 1;
        } else {
            // if neither group is expanded we use group names
            var thisLink = lexicOrder(srcGrp, tgtGrp);
            displayMap.links[thisLink] =
                displayMap[thisLink] || {
                    source: displayMap.nodes[srcGrp],
                    target: displayMap.nodes[tgtGrp],
                    count: 0,
                    name: thisLink
                };
            displayMap.links[thisLink].count += 1;
        }
        // done with link definitions
    }

    // now push links from displayMap to displayLinks
    for (key in displayMap.links) {
        displayLinks.push(displayMap.links[key]);
    }

    // return new network
    return {nodes: displayNodes, links: displayLinks, groups: displayGroups, constraints: constraints, map: displayMap};
}

// (re)initialize visualization
function init(layout, graph, expand, layers) {
    var drad = 8,      	// default node radius
        svgNodes, svgLinks, svgGroups; // containers for svg data joins

    // get current nodes and links
    var net = network(graph, expand);
    net.nodes.forEach(function (v) {
        v.width = drad * 2;
        v.height = drad * 2;
    });
    // set up the force layout
    layout
        .nodes(net.nodes)
        .links(net.links)
        .groups(net.groups);
    if (net.constraints) {
        layout.constraints(net.constraints);
    }
    layout
        .avoidOverlaps(true)
        .handleDisconnected(false)
        .jaccardLinkLengths(50)
        .start(0, 50, 50);

    // bind group data to a group of svg elements
    svgGroups = layers.groups.selectAll('.group').data(net.groups, function (g) {
        return g.name
    });
    // remove any existing svg elements that are not in net.groups
    svgGroups.exit().remove();
    // append graphics to each new svg element in the group
    svgGroups.enter().append('rect')
        .attr('class', 'group')
        .attr('rx', drad).attr('ry', drad)
        .style('fill', function (d) {
            return color(2 * d.id + 1);
        })
        .on('click', function (d) {
            // if we're dragging, d3 will set a flag to indicate
            // we should ignore click behaviour, so check the flag first
            if (d3.event.defaultPrevented) return;
            // if we're clicking, log it
            console.log('group click', d.name, expand[d.name]);
            // toggle expansion for this group
            if (expand[d.name]) {
                expand[d.name] = !expand[d.name];
            } else {
                expand[d.name] = true;
            }
            // reinitialize the visualization
            init(layout, graph, expand, layers);
        })
        .call(cola.drag);

    // bind link data to a group of svg elements
    svgLinks = layers.links.selectAll('.link').data(net.links, function (L) {
        return L.name
    });
    // remove any existing svg elements that are not in net.links
    svgLinks.exit().remove();
    // append graphics to each new svg element in the group
    svgLinks.enter().append('line')
        .attr('class', 'link')
        .style('stroke-width', function (d) {
            return d.count;
        });

    // bind node data to a group of svg elements
    svgNodes = layers.nodes.selectAll('.node').data(net.nodes, function (n) {
        return n.name
    });
    // remove any existing svg elements which are not in net.links
    svgNodes.exit().remove();
    // append graphics to each new svg element in the group
    svgNodes.enter().append('circle')
        .attr('class', 'node')
        .attr('r', function (d) {
            if (d.indices && d.indices.length > drad) {
                return d.indices.length;
            }
            else {
                return drad;
            }
        })
        .style('fill', function (d) {
            return color(2 * graph.groupMap[d.group].id);
        })
        .style('stroke-width', 1)
        .on('click', function (d) {
            // if we're dragging, d3 will set a flag to indicate
            // we should ignore click behaviour, so check the flag first
            if (d3.event.defaultPrevented) return;
            // if we're clicking, log it
            console.log('node click', d.group, d.name, expand[d.group]);
            // toggle expansion for this group
            if (expand[d.group]) {
                expand[d.group] = !expand[d.group];
            } else {
                expand[d.group] = true;
            }
            // reinitialize the visualization
            init(layout, graph, expand, layers);
        })
        .call(cola.drag);

    // update positions of svg elements on each iteration of the force layout
    cola.on('tick', function () {

        svgLinks.attr('x1', function (d) {
            return d.source.x;
        })
            .attr('y1', function (d) {
                return d.source.y;
            })
            .attr('x2', function (d) {
                return d.target.x;
            })
            .attr('y2', function (d) {
                return d.target.y;
            });

        svgNodes.attr("cx", function (d) {
            return d.x;
        })
            .attr("cy", function (d) {
                return d.y;
            });

        svgGroups.attr('x', function (d) {
            return d.bounds.x;
        })
            .attr('y', function (d) {
                return d.bounds.y;
            })
            .attr('width', function (d) {
                return d.bounds.width();
            })
            .attr('height', function (d) {
                return d.bounds.height();
            });

    });

    outerNet = net;

    // Done with initialization
}

var color = d3.scale.category20();

// define color domain for future reference
for (var i = 0; i < color.range().length; i++) {
    color(i);
}

// get a handle for the force layout
var cola = cola.d3adaptor().size([width, height]);

// set up the svg environment
var svg = d3.select("body")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

// make some svg groups for layered visualization
layers = {
    groups: svg.append('g'),
    links: svg.append('g'),
    nodes: svg.append('g')
};

// container of booleans for group expansion
expand = {};

// read JSON file and begin data operations
// the commented line is a larger network that fails
d3.json("js/data.json", function (error, graph) {
    //d3.json("https://raw.githubusercontent.com/shortda/colaCables/master/cableTest.json", function (error, graph) {

    if (error) {
        throw error
    }
    ;

    // nodes and links reference names, so we need maps to indices.
    // we assume that nodes are grouped using name prefixes.
    // prefixes must be separated from identifiers with an underbar.
    var groupMap = {},
        nodeMap = {},
        linkMap = {}
    delim = '_';

    // map nodes and groups
    graph.nodes.forEach(function (n) {
        var name = n.name,
            grp = getGroup(n, delim),
            id = Object.keys(groupMap).length,
            thisGrp = groupMap[grp] || (groupMap[grp] = {names: [], indices: [], id: id});
        thisGrp.names.push(name);
        thisGrp.indices.push(graph.nodes.indexOf(n));
        nodeMap[name] = graph.nodes.indexOf(n);
        n.group = grp;
        n.width = nodeSize[0];
        n.height = nodeSize[1];
    });
    // map links. each link must have a unique name
    // in addition to a source and a target.
    graph.links.forEach(function (L) {
        var name = L.name || graph.links.indexOf(L),
            src = L.source,
            tgt = L.target;
        if ((isNum(src) || (typeof (src) == 'number')) && (isNum(tgt) || (typeof (tgt) == 'number'))) {
            if (src != Math.floor(src) || tgt != Math.floor(tgt)) {
                alert("linkMap error: a source or target is a non-integer number");
            }
            src = graph.nodes[src];
            tgt = graph.nodes[tgt];
            linkMap[name] = {
                names: [src.name, tgt.name],
                indices: [src, tgt],
                groups: [getGroup(src, delim), getGroup(tgt, delim)]
            };
        } else {
            var i = nodeMap[src],
                j = nodeMap[tgt];
            linkMap[name] = {
                names: [src, tgt],
                indices: [i, j],
                groups: [getGroup(graph.nodes[i], delim), getGroup(graph.nodes[j], delim)]
            };
            L.source = i;
            L.target = j;
        }
    });

    // roll maps into graph for portability
    graph.groupMap = groupMap;
    graph.nodeMap = nodeMap;
    graph.linkMap = linkMap;

    // external variables to assist with debugging
    outerL = layers;
    outerGraph = graph;

    init(cola, graph, expand, layers);
});