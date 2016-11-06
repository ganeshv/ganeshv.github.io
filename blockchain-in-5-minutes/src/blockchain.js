const sha1 = require('sha1'),
    csp = gentrify.csp;

function blockchain_example() {
    const template = block => `
        <div class="gitblock" id="gitblock_${block.idx}">
            <div class="blockname"><strong>ID </strong><span class="gitblock_id">${block.id}</span></div>
            <div class="blockparent"><strong>Parent </strong><span class="gitblock_parent">${block.parent_id}</span></div>
            <textarea rows="6">${block.contents}</textarea>
        </div>
    `;
    let parent_id = "0000000000",
        parent_ch = csp.chan();
    const contents = [
        "Mary had a little lamb",
        "Its fleece was white as snow",
        "And everywhere that Mary went",
        "The lamb was sure to go"
    ];
    for (let i = 0; i < 4; i++) {
        const block = {
            idx: i,
            id: sha1(`parent ${parent_id}\n${contents[i]}`),
            parent_id: parent_id,
            contents: contents[i]
        };
        $("#blockchain").append(template(block));
        if (i < 3) $("#blockchain").append('<div class="blockarrow">&#8594;</div>');
        const outch = csp.chan();
        csp.spawn(run_block(parent_ch, outch, i));
        parent_id = block.id;
        parent_ch = outch;
    }
    parent_ch.close(); // close output of last block so `put` always succeeds
}

function* run_block(parentch, outch, idx) {
    const block_el = $(`#gitblock_${idx}`),
        name_div = $(`#gitblock_${idx} .blockname`),
        name_span = $(`#gitblock_${idx} .gitblock_id`),
        parent_div = $(`#gitblock_${idx} .blockparent`),
        parent_span = $(`#gitblock_${idx} .gitblock_parent`),
        txt = $(`#gitblock_${idx} textarea`),
        txtch = listen(txt[0], 'change');

    let content = txt.val(),
        id, parent_id,
        old_id, old_parent_id;

    while (true) {
        let r = yield csp.alts([parentch, txtch]);
        old_parent_id = parent_id;
        old_id = id;
        if (r.channel === parentch) {
            parent_id = r.value;
        } else {
            content = txt.val();
        }
        id = sha1(`parent ${parent_id}\n${content}`);
        render();
        yield csp.timeout(300);
        yield csp.put(outch, id);
    } 

    function render() {
        name_span.text(id);
        name_div.attr('title', id);
        parent_span.text(parent_id);
        parent_div.attr('title', parent_id);
        if (old_parent_id !== parent_id) {
            parent_span.animate({backgroundColor: "#f2dede"}, 100)
                .delay(100)
                .animate({backgroundColor: "#fff"}, 100);
        }
        if (old_id !== id) {
            name_span.animate({backgroundColor: "#f2dede"}, 100)
                .delay(100)
                .animate({backgroundColor: "#fff"}, 100);
        }
    }
}

function listen(el, type, ch) {
    ch = ch || csp.chan();
    el.addEventListener(type, function(e) {
        csp.putAsync(ch, e);
    });
    return ch;
}

function* tosser(container, outch) {
    const toss1 = listen($(`${container} .toss1`)[0], 'click'),
        toss100 = listen($(`${container} .toss100`)[0], 'click'),
        reset = listen($(`${container} .resetbutton`)[0], 'click');

    let messages = [];

    while (true) {
        let chans = [toss1, toss100, reset];
        if (messages.length) {
            chans.push([outch, messages[0]])
        }
        let r = yield csp.alts(chans);
        if (r.channel === toss1) {
            messages.push('toss');
        } else if (r.channel === toss100) {
            messages = messages.concat(new Array(100).fill('atoss'));
        } else if (r.channel === reset) {
            messages = [];
            yield csp.put(outch, 'reset');
        } else if (r.channel === outch) {
            messages.shift();
        }
    }
}

function* coin_casino(graph, tossch) {
    const coins = $("#coins .coin"),
        ncoins = coins.length,
        heads = '<img src="img/heads.png">',
        tails = '<img src="img/tails.png">',
        blur = '<img src="img/heads-blur.png">';
    
    let wins = 0,
        trials = 0,
        hist = new Array(ncoins + 1).fill(0),
        current = [],
        sum = 0,
        msg;

    render_reset();
    while (true) {
        msg = yield tossch;
        if (msg === 'toss'|| msg === 'atoss') {
            current = coins.map(get_random);
            sum = Array.from(current).reduce((x, y) => x + y, 0);
            hist[sum] = hist[sum] ? hist[sum] + 1 : 1;
            trials++;
            if (sum === ncoins) wins++;
            yield render_toss();
        } else if (msg === 'reset') {
            wins = trials = sum = 0;
            hist = new Array(ncoins + 1).fill(0);
            current = [];
            render_reset();
        }
    }

    function* render_toss() {

        coins.html(blur);
        if (msg === 'toss') yield csp.timeout(150);
        coins.html(x => current[x] ? heads : tails);
        $("#coins").clone().removeAttr('id')
            .css('background-color', sum === ncoins ? '#fff' : '#ddd')
            .css('opacity', sum === ncoins ? '1.0' : '0.5')
            .prependTo($("#coinlog"));
        $("#coinresult").html(`<h2>Wins: ${wins} / ${trials}</h2><p><i>(expected ${Math.round(1 / (1 << ncoins) * trials)})</i></p>`);

        graph.update(hist.map(x => x / trials));
    }

    function render_reset() {
        $("#coinlog").empty();
        $("#coinresult").html(`<h2>Wins: ${wins} / ${trials}</h2><p><i>(expected ${Math.round(1 / (1 << ncoins) * trials)})</i></p>`);
        graph.update(hist);
    }
}

class Graph {
    constructor(ncoins, divspec, title) {
        let outer_width = $(divspec).width(),
            outer_height = $(divspec).height(),
            margin = {top: 40, left: 40},
            values = new Array(ncoins + 1).fill(0),
            width = outer_width - margin.left * 2,
            height = outer_height - margin.top * 2;
     
        let x = this.x = d3.scale.linear()
            .domain([0, 1])
            .range([0, width]);

        let y = this.y = d3.scale.ordinal()
            .domain(d3.range(values.length))
            .rangeRoundBands([0, height]);

        var xAxis = d3.svg.axis()
            .scale(x)
            .orient('bottom')
            .ticks(10, "%");


        var yAxis = d3.svg.axis()
            .scale(y)
            .orient('left');

        let chart = this.chart = d3.select(`${divspec} svg`)
            .attr("width", outer_width)
            .attr("height", outer_height)
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        chart.append('g')
            .attr('class', 'x axis')
            .attr("transform", `translate(0, ${height})`)
            .call(xAxis);


        chart.append("text")
            .attr("transform", `translate(${width / 2}, ${height + margin.top * 0.7})`)
            .style("text-anchor", "middle")
            .text("Frequency");

        chart.append('g')
            .attr('class', 'y axis')
            .call(yAxis)

        chart.append("text")
            .attr("transform", `translate(-${margin.left / 2}, ${height / 2})rotate(-90)`)
            .style("text-anchor", "middle")
            .text(title);

        this.update(values);
        let pct = 1 / (1 << (values.length - 1));
        chart.append("line")
            .attr("stroke", "#000")
            .attr("stroke-dasharray", "3")
            .attr("x1", x(pct))
            .attr("y1", 0)
            .attr("x2", x(pct))
            .attr("y2", height);
    }

    update(data) {
        const bar = this.chart.selectAll(".bar")
            .data(data),
            x = this.x,
            y = this.y;

        bar.enter().append("rect")
            .attr("class", "bar")
            .attr("height", y.rangeBand() - 1)
            .attr("x", 1)
            .attr("y", (d, i) => y(i))
            .attr("width", d => x(d))
            .attr("fill", (d, i) => i === data.length - 1 ?
                "rgb(232, 190, 100)" : "#ccc");

        bar.attr("y", (d, i) => y(i))
            .attr("width", d => x(d));
    }

}

function coin_example() {
    const ncoins = $("#coins .coin").length,
        ch = csp.chan(),
        graph = new Graph(ncoins, "#coingraph", "Heads");
    csp.takeAsync(csp.spawn(coin_casino(graph, ch)), x => console.log(x));
    csp.takeAsync(csp.spawn(tosser("#coinbuttons", ch)), x => console.log(x));
}

function* sha1_casino(graph, tossch) {
    const coins = $("#coins .coin"),
        ncoins = coins.length,
        input = $("#sha1block input"),
        payload = "Mary had a little lamb",
        tweakch = listen(input[0], 'blur');
    
    let wins = 0,
        trials = 0,
        hist = new Array(ncoins + 1).fill(0),
        current = [],
        sum = 0,
        tweak = 0,
        msg,
        sha1sum = sha1(`${payload}${tweak}`);

    render_reset();
    while (true) {
        const r = yield csp.alts([tossch, tweakch]);
        if (r.channel === tossch) {
            msg = r.value;
            if (msg === 'reset') {
                wins = trials = sum = tweak = 0;
                hist = new Array(ncoins + 1).fill(0);
                current = [];
                render_reset();
                continue;
            }
            tweak++;
            sha1sum = sha1(`${payload}${tweak}`);
        } else {
            msg = 'blur';
            const str = input.val();
            sha1sum = sha1(`${payload}${str}`);
        }
        const shabits = hextobits(sha1sum);
        current = shabits.slice(0, ncoins);
        sum = Array.from(current).reduce((x, y) => x + y, 0);
        hist[sum] = hist[sum] ? hist[sum] + 1 : 1;
        trials++;
        if (sum === ncoins) wins++;
        yield render_toss();
    }

    function* render_toss() {
        if (msg !== 'blur') input.val(tweak);
        $("#sha1-out").html(`&nbsp;${sha1sum}&nbsp;`);
        const bits = current.map(x => x ? '&#x25CB;' : '&#x25CF;');
        $(`<div class="slog-entry"><p>${bits.join('')}</p><p>${sha1sum}</p>`)
            .css('background-color', sum === ncoins ? 'rgba(255,230,143,0.8)' : '#eee')
            .prependTo($("#sha1log"));
        $("#sha1result").html(`<h2>Wins: ${wins} / ${trials}</h2><p><i>(expected ${Math.round(1 / (1 << ncoins) * trials)})</i></p>`);

        graph.update(hist.map(x => x / trials));
    }

    function render_reset() {
        $("#sha1block span").text(payload);
        $("#sha1-out").html(`&nbsp;${sha1sum}&nbsp;`);
        input.val(tweak);
        $("#sha1log").empty();
        $("#sha1result").html(`<h2>Wins: ${wins} / ${trials}</h2><p><i>(expected ${Math.round(1 / (1 << ncoins) * trials)})</i></p>`);
        graph.update(hist);
    }
}

function hextobits(str) {
    const chars = str.split(''),
        nums = chars.map(x => parseInt(x, 16)),
        bins = nums.map(x => [8, 4, 2, 1].map(y => x & y ? 1 : 0)),
        bits = [].concat.apply([], bins);
    return bits;
}

function sha1_example() {
    const ncoins = $("#coins .coin").length,
        ch = csp.chan(),
        graph = new Graph(ncoins, "#sha1graph", "0s in leading n bits");
    csp.takeAsync(csp.spawn(sha1_casino(graph, ch)), x => console.log(x));
    csp.takeAsync(csp.spawn(tosser("#sha1buttons", ch)), x => console.log(x));
}

function get_random() {
    const arr = new Uint8Array(1);
    crypto.getRandomValues(arr);
    return arr[0] > 127 ? 1 : 0;
}

$(document).ready(function() {
    blockchain_example();
    coin_example();
    sha1_example();
});
