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

function* tosser(outch) {
    const toss1 = listen($("#toss1")[0], 'click'),
        toss100 = listen($("#toss100")[0], 'click'),
        reset = listen($("#resetbutton")[0], 'click');

    let tosses = 0;

    while (true) {
        let chans = [toss1, toss100, reset];
        if (tosses) {
            chans.push([outch, 'toss'])
        }
        let r = yield csp.alts(chans);
        if (r.channel === toss1) {
            tosses++;
        } else if (r.channel === toss100) {
            tosses += 100;
        } else if (r.channel === reset) {
            tosses = 0;
            yield csp.put(outch, 'reset');
        } else if (r.channel === outch) {
            tosses--;
        }
    }
}

function* casino(tossch) {
    const coinblock = $("#coinblock"),
        coins = $("#coins .coin"),
        ncoins = coins.length,
        coinlog = $("#coinlog"),
        heads = '<img src="img/heads.png">',
        tails = '<img src="img/tails.png">',
        blur = '<img src="img/heads-blur.png">';
    
    let wins = 0,
        trials = 0,
        hist = [],
        current = [],
        sum = 0;

    render_reset();
    while (true) {
        const msg = yield tossch;
        if (msg === 'toss') {
            current = coins.map(get_random);
            sum = Array.from(current).reduce((x, y) => x + y, 0);
            hist[sum] = hist[sum] ? hist[sum] + 1 : 1;
            trials++;
            if (sum === 0) wins++;
            yield render_toss();
        } else if (msg === 'reset') {
            wins = trials = sum = 0;
            hist = [];
            current = [];
            render_reset();
        }
    }

    function* render_toss() {
        coins.html(blur);
        yield csp.timeout(150);
        coins.html(x => current[x] ? tails : heads);
        $("#coins").clone().removeAttr('id')
            .css('background-color', sum ? '#fff' : '#ddd')
            .css('opacity', sum ? '0.5' : '1.0')
            .prependTo($("#coinlog"));
        $("#coinresult").html(`<h2>Wins: ${wins} / ${trials}</h2><p><i>(expected ${Math.round(1/32*trials)})</i></p>`);
        yield csp.timeout(100);
    }

    function render_reset() {
        $("#coinlog").empty();
        $("#coinresult").html(`<h2>Wins: ${wins} / ${trials}</h2><p><i>(expected ${Math.round(1/32*trials)})</i></p>`);
    }
}

function coin_example() {
    const ch = csp.chan();
    csp.takeAsync(csp.spawn(casino(ch)), x => console.log(x));
    csp.takeAsync(csp.spawn(tosser(ch)), x => console.log(x));
}

function get_random() {
    const arr = new Uint8Array(1);
    crypto.getRandomValues(arr);
    return arr[0] > 127 ? 1 : 0;
}

$(document).ready(function() {
    blockchain_example();
    coin_example();
});
