(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.gentrify = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.csp = exports.handle_csp = exports.isCSP = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _gentrify = require("./gentrify");

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function isCSP(v) {
    return v instanceof ChanOp || v instanceof Channel;
}

function handle_csp(op, step) {
    try {
        if (op instanceof Channel) op = take(op);
        switch (op.type) {
            case "take":
                return op.chan.take(new Handler({ active: true }, step));
            case "put":
                return op.chan.put(op.value, new Handler({ active: true }, step));
            case "alts":
                return do_alts(op.ops, op.opts, step);
            default:
                throw new Error("Unknown CSP instruction ${op.type}");
        }
    } catch (e) {
        return { type: "value", value: e };
    }
}

function do_alts(oplist, opts, step) {
    if (oplist.length === 0) throw new Error("Empty alts list");

    var res = {},
        indexes = range(oplist.length),
        priority = opts && opts.priority,
        flag = { active: true };

    if (!priority) indexes = shuffle(indexes);

    var _loop = function _loop(i) {
        var op = priority ? oplist[i] : oplist[indexes[i]],
            ch = op instanceof Channel ? op : op[0],
            handler = new Handler(flag, function (x) {
            return step({ channel: ch, value: x });
        });

        res = op instanceof Channel ? ch.take(handler) : ch.put(op[1], handler);
        if (res.type !== "block") {
            return {
                v: { type: "value", value: { channel: ch, value: res.value } }
            };
        }
    };

    for (var i = 0; i < oplist.length; i++) {
        var _ret = _loop(i);

        if ((typeof _ret === "undefined" ? "undefined" : _typeof(_ret)) === "object") return _ret.v;
    }

    /* nothing was ready */
    if (opts && opts.default) {
        flag.active = false; /* torpedo all handlers queued above */
        return { type: "value", value: { channel: DEFAULT, value: opts.default } };
    }
    return res;
}

var CLOSED = null;
var DEFAULT = "xxx_def";
var NO_VALUE = "xxx_novalue";

var ChanOp = function ChanOp(opts) {
    _classCallCheck(this, ChanOp);

    Object.assign(this, opts);
};

var Handler = function () {
    function Handler(flag, cb) {
        _classCallCheck(this, Handler);

        this.flag = flag;
        this.cb = cb;
    }

    _createClass(Handler, [{
        key: "active",
        value: function active() {
            return this.flag.active;
        }
    }, {
        key: "deactivate",
        value: function deactivate() {
            this.flag.active = false;
        }
    }]);

    return Handler;
}();

var Channel = function () {
    function Channel() {
        _classCallCheck(this, Channel);

        this.takes = [];
        this.puts = [];
        this.closed = false;
    }

    _createClass(Channel, [{
        key: "put",
        value: function put(value, handler) {
            if (value === CLOSED) {
                throw new Error("Cannot put CLOSED");
            }
            if (this.closed) {
                return { type: "value", value: false };
            }
            while (this.takes.length) {
                var taker = this.takes.shift();
                if (!taker.active()) continue;
                if (handler) handler.deactivate();
                taker.deactivate();
                schedule(taker.cb, value);
                return { type: "value", value: true };
            }
            if (handler) {
                this.puts.push({ handler: handler, value: value });
                return { type: "block" };
            }
            return { type: "value", value: false };
        }
    }, {
        key: "take",
        value: function take(handler) {
            while (this.puts.length) {
                var _puts$shift = this.puts.shift(),
                    putter = _puts$shift.handler,
                    value = _puts$shift.value;

                if (!putter.active()) continue;
                putter.deactivate();
                schedule(putter.cb, true);
                if (handler) handler.deactivate();
                return { type: "value", value: value };
            }

            if (this.closed) {
                if (handler) {
                    handler.deactivate();
                    return { type: "value", value: CLOSED };
                }
                return { type: "value", value: NO_VALUE };
            }
            if (handler) {
                this.takes.push(handler);
                return { type: "block" };
            }
            return { type: "value", value: NO_VALUE };
        }
    }, {
        key: "close",
        value: function close() {
            if (this.closed) return;
            this.closed = true;

            while (this.takes.length) {
                var taker = this.takes.shift();
                if (!taker.active()) continue;
                taker.deactivate();
                schedule(taker.cb, CLOSED);
            }

            while (this.puts.length) {
                var _puts$shift2 = this.puts.shift(),
                    putter = _puts$shift2.handler,
                    value = _puts$shift2.value;

                if (!putter.active()) continue;
                putter.deactivate();
                schedule(putter.cb, false);
            }
        }
    }]);

    return Channel;
}();

function chan() {
    return new Channel();
}

function takeAsync(ch, cb) {
    var ret = ch.take(new Handler({ active: true }, cb));
    if (ret.type === "value") {
        cb(ret.value);
    }
}

function putAsync(ch, val, cb) {
    cb = cb || function (x) {};
    var ret = ch.put(val, new Handler({ active: true }, cb));
    if (ret.type === "value") {
        cb(ret.value);
    }
}

function put(ch, val) {
    return new ChanOp({ type: "put", chan: ch, value: val });
}

function take(ch) {
    return new ChanOp({ type: "take", chan: ch });
}

function offer(ch, value) {
    var ret = ch.put(value);
    return ret.value;
}

function poll(ch) {
    var ret = ch.take();
    return ret.value;
}

function alts(ops, opts) {
    return new ChanOp({ type: "alts", ops: ops, opts: opts });
}

function spawn(gen) {
    var ch = chan();

    (0, _gentrify.run)(gen, function (err, res) {
        return putAsync(ch, err || res, function () {
            return ch.close();
        });
    });
    return ch;
}

function go(gf) {
    var args = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

    return spawn(gf.apply(undefined, _toConsumableArray(args)));
}

function schedule(f) {
    for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
    }

    setTimeout(function () {
        return f.apply(undefined, args);
    }, 0);
}

function timeout(ms) {
    var ch = chan();
    setTimeout(function () {
        return ch.close();
    }, ms);
    return ch;
}

/* Utility functions */

function range(n) {
    return [].concat(_toConsumableArray(Array(n).keys()));
}

/* shuffle array in-place */
function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var _ref = [list[j], list[i]];
        list[i] = _ref[0];
        list[j] = _ref[1];
    }
    return list;
}

exports.isCSP = isCSP;
exports.handle_csp = handle_csp;
var csp = exports.csp = { handle_csp: handle_csp, ChanOp: ChanOp, DEFAULT: DEFAULT, NO_VALUE: NO_VALUE, CLOSED: CLOSED, chan: chan,
    takeAsync: takeAsync, putAsync: putAsync, take: take, put: put, poll: poll, offer: offer, alts: alts, go: go, spawn: spawn, timeout: timeout };

},{"./gentrify":2}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.csp = exports.tc = exports.run = undefined;

var _csp = require('./csp');

exports.run = run;
exports.tc = tc;
exports.csp = _csp.csp;

/*
 * Drive a generator, which may toss async ops like generators, promises,
 * thunks to us via `yield`, which we get by calling `genObj.next()`.  We
 * resolve the async request and bounce the result back via the next
 * `genObj.next(res)`, which is received by `genObj` as the result of the
 * `yield`.
 */

function run(gen, cb) {
    if (!isGenerator(gen)) throw new TypeError("Not a generator object");
    return typeof cb === 'function' ? _run(function (x) {
        return cb(null, x);
    }, cb) : new Promise(_run);

    function _run(resolve, reject) {
        var genstack = [gen];
        return step();

        function step(res) {
            while (true) {
                var g = genstack[genstack.length - 1];
                try {
                    var _ref = res instanceof Error ? g.throw(res) : g.next(res),
                        value = _ref.value,
                        done = _ref.done;

                    if (done) {
                        genstack.pop();
                        if (isTailCall(value)) {
                            genstack.push(value._gentrify_tc);
                            res = undefined;
                            continue;
                        }
                        if (genstack.length === 0) return resolve(value);
                        res = value;
                    } else if (isGenerator(value)) {
                        res = undefined;
                        genstack.push(value);
                    } else if (isPromise(value)) {
                        return value.then(function (x) {
                            return step(x);
                        }, function (x) {
                            return step(x instanceof Error ? x : new Error(x));
                        });
                    } else if ((0, _csp.isCSP)(value)) {
                        var cres = (0, _csp.handle_csp)(value, step);
                        if (cres.type === "block") return;
                        res = cres.value;
                    } else if (typeof value === 'function') {
                        /* thunk */
                        return value(function (e, r) {
                            return step(e ? e instanceof Error ? e : new Error(e) : r);
                        });
                    } else {
                        throw new TypeError("Unsupported type yielded");
                    }
                } catch (e) {
                    genstack.pop();
                    if (genstack.length === 0) return reject(e);
                    res = e;
                }
            }
        }
    }
}

/*
 * Wrap generator to signal to the trampoline that this is a tail call
 */

function tc(g) {
    if (!isGenerator(g)) throw new Error("Only generators can be returned in tail calls");
    return { _gentrify_tc: g };
}

function isGenerator(g) {
    return g && typeof g.next === 'function' && typeof g.throw === 'function';
}

function isPromise(p) {
    return p && typeof p.then === 'function';
}

function isTailCall(v) {
    return v && isGenerator(v._gentrify_tc);
}

},{"./csp":1}]},{},[2])(2)
});