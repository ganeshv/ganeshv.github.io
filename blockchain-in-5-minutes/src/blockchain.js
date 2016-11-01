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

$(document).ready(blockchain_example);
