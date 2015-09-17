var width = $(document).width(),     // svg width
    height = $(document).height(),     // svg height
    dr = 15,      // default point radius
    off = dr,    // cluster hull offset
    expand = {}, // expanded clusters
    data, net, force, hullg, hull, linkg, link, nodeg, node;

var curve = d3.svg.line()
    .interpolate("cardinal-closed")
    .tension(1);

var animationTime = 1500;
var length = 150;

var linkedByIndex = {};


var fill = d3.scale.category20();

var random = new Chance();

function pickRandomIcon() {
    var result;
    var count = 0;
    for (var prop in FONT_AWESOME)
        if (Math.random() < 1 / ++count)
            result = prop;
    return FONT_AWESOME[result];
}
function nodeid(n) {
    return n.size ? "_g_" + n.group : n.name;
}

function linkid(l) {
    var u = nodeid(l.source),
        v = nodeid(l.target);
    return u < v ? u + "|" + v : v + "|" + u;
}

function getGroup(n) {
    return n.group;
}

// constructs the network to visualizenode.
function network(data, prev, index, expand) {
    expand = expand || {};
    var gm = {},    // group map
        nm = {},    // node map
        lm = {},    // link map
        gn = {},    // previous group nodes
        gc = {},    // previous group centroids
        nodes = [], // output nodes
        links = []; // output links

    // process previous nodes for reuse or centroid calculation
    if (prev) {
        prev.nodes.forEach(function (n) {
            var i = index(n), o;
            if (n.size > 0) {
                gn[i] = n;
                n.size = 0;
            } else {
                o = gc[i] || (gc[i] = {x: 0, y: 0, count: 0});
                o.x += n.x;
                o.y += n.y;
                o.count += 1;
            }
        });
    }

    // determine nodes
    for (var k = 0; k < data.nodes.length; ++k) {
        var n = data.nodes[k],
            i = index(n),
            l = gm[i] || (gm[i] = gn[i]) || (gm[i] = {group: i, size: 0, nodes: []});

        if (expand[i]) {
            // the node should be directly visible
            nm[n.name] = nodes.length;
            nodes.push(n);
            if (!n.lable) {
                n.lable = random.first();
                n.icon = pickRandomIcon();
                n.color = random.color();
                n.iconColor = random.color();
                n.isCluster = false;


            }
            n.width = n.height = 8 * 2;
            if (gn[i]) {
                // place new nodes at cluster location (plus jitter)
                n.x = gn[i].x + Math.random();
                n.y = gn[i].y + Math.random();
            }
        } else {
            // the node is part of a collapsed cluster
            if (l.size == 0) {
                // if new cluster, add to set and position at centroid of leaf nodes
                nm[i] = nodes.length;
                nodes.push(l);
                l.lable = "Group " + n.group;
                l.icon = FONT_AWESOME.folder;
                l.color = fill(n.group);
                l.isCluster = true;
                l.width = l.height = 8 * 2;
                if (gc[i]) {
                    l.x = gc[i].x / gc[i].count;
                    l.y = gc[i].y / gc[i].count;
                }
            }
            l.nodes.push(n);
        }
        // always count group size as we also use it to tweak the force graph strengths/distances
        l.size += 1;
        n.group_data = l;
    }

    for (i in gm) {
        gm[i].link_count = 0;
    }

    // determine links
    for (k = 0; k < data.links.length; ++k) {
        var e = data.links[k],
            u = index(e.source),
            v = index(e.target);
        if (u != v) {
            gm[u].link_count++;
            gm[v].link_count++;
        }
        u = expand[u] ? nm[e.source.name] : nm[u];
        v = expand[v] ? nm[e.target.name] : nm[v];
        var i = (u < v ? u + "|" + v : v + "|" + u),
            l = lm[i] || (lm[i] = {source: u, target: v, size: 0});
        l.size += 1;
    }
    for (i in lm) {
        links.push(lm[i]);
    }
    links.forEach(function(d) {
        linkedByIndex[d.source.index + "," + d.target.index] = 1;
        linkedByIndex[d.target.index + "," + d.source.index] = 1;

    });


    return {nodes: nodes, links: links};
}

function convexHulls(nodes, index, offset) {
    var hulls = {};

    // create point sets
    for (var k = 0; k < nodes.length; ++k) {
        var n = nodes[k];
        if (n.size) continue;
        var i = index(n),
            l = hulls[i] || (hulls[i] = []);
        l.push([n.x - offset, n.y - offset]);
        l.push([n.x - offset, n.y + offset]);
        l.push([n.x + offset, n.y - offset]);
        l.push([n.x + offset, n.y + offset]);
    }

    // create convex hulls
    var hullset = [];
    for (i in hulls) {
        hullset.push({group: i, path: d3.geom.hull(hulls[i])});
    }

    return hullset;
}

function drawCluster(d) {
    return curve(d.path); // 0.8
}

// --------------------------------------------------------

var body = d3.select("body");

var vis = body.append("svg")
    .attr("width", width)
    .attr("height", height);

d3.json("js/data1.json", function (json) {
    data = json;
    for (var i = 0; i < data.links.length; ++i) {
        o = data.links[i];
        o.source = data.nodes[o.source];
        o.target = data.nodes[o.target];
    }

    hullg = vis.append("g");
    linkg = vis.append("g");
    nodeg = vis.append("g");

    init();

    vis.attr("opacity", 0)
        .transition()
        .duration(2000)
        .attr("opacity", 1);
});

function init() {
    if (force) force.stop();

    linkedByIndex={};
    net = network(data, net, getGroup, expand);

    console.log(data.nodes.length);
    force = cola.d3adaptor()
        .nodes(net.nodes)
        .links(net.links)
        .size([width, height])
        // .constraints(graph.constraints)
        .symmetricDiffLinkLengths(length)
        .jaccardLinkLengths(length)
        .avoidOverlaps(true)
        .handleDisconnected(true)
        // .linkDistance(100)
        .start(0, 0, 0);

    //  .linkStrength(1)
    // .gravity(0.05)   // gravity+charge tweaked to ensure good 'grouped' view (e.g. green group not smack between blue&orange, ...
    // .charge(-600)    // ... charge is important to turn single-linked groups to the outside
    //.friction(0.5)   // friction adjusted to get dampened display: less bouncy bouncy ball [Swedish Chef, anyone?]
    // .start();

    hullg.selectAll("path.hull").remove();
    hull = hullg.selectAll("path.hull").data(convexHulls(net.nodes, getGroup, off));

    hull.enter().append("path")
        .attr("class", "hull")

        .attr("d", drawCluster)

        .style("fill", function (d) {
            return fill(d.group);
        })
        .on("dblclick", function (d) {
            console.log("hull dblclick", d, arguments, this, expand[d.group]);


            expand[d.group] = false;
            init();
        });

    link = linkg.selectAll("line.link").data(net.links, linkid);
    link.exit().remove();
    link.enter().append("line")

        .attr("class", "link")

        .attr("x1", function (d) {
            return d.source.x;
        })

        .attr("y1", function (d) {
            return d.source.y;
        })

        .attr("x2", function (d) {
            return d.target.x;
        })

        .attr("y2", function (d) {
            return d.target.y;
        })

        .style("stroke", function (d) {
            return fill(d.source.group);
        })

        .style("stroke-width", function (d) {
            return 1;
        })

        .style("opacity", function (d) {
            return 0;
        })
        .transition().duration(animationTime)

        .style("opacity", function (d) {
            return .5;
        })
        .ease("elastic");


    node = nodeg.selectAll("g.node").data(net.nodes, nodeid);
    node.exit().remove();
    var onEnter = node.enter();

    // NEW HERE
    var g = onEnter
        .append("g")

        .attr("class", function (d) {
            return "node" + (d.size ? "" : " leaf");
        })
        .attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });


    g.append('svg:circle')
        .transition().duration(animationTime)
        .attr("r", function (d) {
            var num = d.size ? ~~Math.log(d.size * d.link_count) * 2 + dr : Math.floor((Math.random() * 10) + 1) + dr + 1;
            d.fontSize = ~~(num * .9) + 5;
            return num;
        })

        .style("fill", function (d) {
            return d.isCluster ? "rgba(0, 0, 0, 0.0)" : fill(d.group);

        })

        .style("opacity", function (d) {
            return 0;
        })

        .style("opacity", function (d) {
            return 1;
        })

        .style("stroke", function (d) {
            return d.isCluster ? "rgba(0, 0, 0, 0.0)" : "#000";
        })
        .style("stroke-width", function (d) {
            return d.isCluster ? "0px" : "1px";
        })
        .ease("elastic");


    g.append('text')
        .attr("class", "nodeIcon")


        .style("opacity", 0)
        .transition().duration(animationTime)

        .style("opacity", function (d) {
            return 1;
        })
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-family', 'FontAwesome')
        .style('font-size', function (d) {
            return d.isCluster ? ~~(d.fontSize * 1.8) : d.fontSize;
        })
        .style("fill", function (d) {

            return d.isCluster ? fill(d.group) : "#FFF";
        })
        .text(function (d) {


            return d.icon;
        })
        .ease("elastic");


    g.on("click", function (d) {
        console.log(d);
    })
        .on("dblclick", function (d) {
            console.log("node dblclick", d, arguments, this, expand[d.group]);

            expand[d.group] = !expand[d.group];
            init();
        });
    g.append("text")
        . attr("dx", function (d) {
            return ~~(d.fontSize * 1.2);
        })
        .style("opacity", function (d) {
            return 0;
        })
        .transition().duration(animationTime)

        .style("opacity", function (d) {
            return 1;
        })

        .style('font-size', function (d) {
            return ~~(d.fontSize * .7);
        })
        .attr("fill", "black")

        .text(function (d, i) {

            return d.lable;
        });


    node.call(force.drag);

    var tick = function () {
        if (!hull.empty()) {
            hull.data(convexHulls(net.nodes, getGroup, off))
                .transition().duration(animationTime)
                .attr("d", drawCluster)
                .ease("elastic");
        }

        link.attr("x1", function (d) {
            return d.source.x;
        })
            .attr("y1", function (d) {
                return d.source.y;
            })
            .attr("x2", function (d) {
                return d.target.x;
            })
            .attr("y2", function (d) {
                return d.target.y;
            });

        node.attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });

        return false;
    };
    //d3.timer(tick, 0);

    function neighboring(a, b) {
        return linkedByIndex[a.index + "," + b.index];
    }
    force.on("tick", function () {
        setTimeout(tick, 0)
    });


}
