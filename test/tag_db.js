var assuming = require("mocha-assume").assuming;

var TagDB = artifacts.require("TagDB");

var testCases = [
  {
    name: "tag-no-index",
    run: function(db) {
      return db.tagBox(boxID("1"), "a");
    },
    expected: {
      boxTags: {"1": ["a"]}
    },
    unexpected: {
      tags: ["a"],
      tagBoxes: {"a": ["1"]}
    }
  },
  {
    name: "tag-index-before",
    run: function(db) {
      return Promise.resolve()
        .then(function() { return db.indexBox(boxID("1")); })
        .then(function() { return db.tagBox(boxID("1"), "a"); });
    },
    expected: {
      boxTags: {"1": ["a"]},
      tags: ["a"],
      tagBoxes: {"a": ["1"]},
    }
  },
  {
    name: "tag-index-after",
    run: function(db) {
      return Promise.resolve()
        .then(function() { return db.tagBox(boxID("1"), "a"); })
        .then(function() { return db.indexBox(boxID("1")); });
    },
    expected: {
      boxTags: {"1": ["a"]},
      tags: ["a"],
      tagBoxes: {"a": ["1"]},
    }
  },
  {
    name: "lots-of-tags-then-index",
    run: function(db) {
      tags = [
        "a","b","c","d","e","f","g","h","i","j","k","l","m","n", "o", "p",
        "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
      ];
      return Promise.all(tags.map(function(tag) {
        return db.tagBox(boxID("1"), tag);
      })).then(function() {
        return db.indexBox(boxID("1")).then(function(result) {
          var gasUsed = result.receipt.gasUsed;
          var gasLimit = web3.eth.getBlock(result.receipt.blockNumber).gasLimit;
          // console.log("index gas used: ", gasUsed);
          // console.log("index block gas limit: ", gasLimit);
          // console.log("difference: ", gasLimit - gasUsed);
        });
      });
    },
    expected: {
      boxTags: {"1": [
        "a","b","c","d","e","f","g","h","i","j","k","l","m","n", "o", "p",
        "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
      ]},
      tags: [
        "a","b","c","d","e","f","g","h","i","j","k","l","m","n", "o", "p",
        "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
      ],
      tagBoxes: [
        "a","b","c","d","e","f","g","h","i","j","k","l","m","n", "o", "p",
        "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
      ].reduce(function (acc, tag) { acc[tag] = ["1"]; return acc}, {})
    }
  },
];

function boxID(name) {
  return web3.toAscii(web3.sha3(name));
}

// https://github.com/uxitten/polyfill/blob/master/string.polyfill.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat
if (!String.prototype.padEnd) {
    String.prototype.padEnd = function padEnd(targetLength,padString) {
        targetLength = targetLength>>0; //floor if number or convert non-number to 0;
        padString = String(padString || ' ');
        if (this.length > targetLength) {
            return String(this);
        }
        else {
            targetLength = targetLength-this.length;
            if (targetLength > padString.length) {
                padString += padString.repeat(targetLength/padString.length); //append to original to ensure we are longer than needed
            }
            return String(this) + padString.slice(0,targetLength);
        }
    };
}

function paddedTag(tag) {
  // 32 bytes * 2 + 2 for 0x
  return web3.toHex(tag).padEnd(66, "0");

}

contract("TagDB", function(accounts) {
  /* create separate context for each test case */
  testCases.forEach(function(test) {
    describe(test.name, function() {

      /* set defaults */
      test.setup = test.setup || Promise.resolve;
      test.run = test.run || Promise.resolve;

      test.expected = test.expected || {};
      test.unexpected = test.unexpected || {};

      var db;
      beforeEach("Deploy new TagDB", function() {
        return TagDB.new().then(function(_db) { db = _db; });
      });

      beforeEach("Run test case", function() {
        return test.run(db);
      });

      assuming(
        test.expected.tags !== undefined || test.unexpected.tags !== undefined
      ).it("should meet tag existence expectations via tagExists()", function() {
        var expectations = (test.expected.tags || []).map(function(tag) {
          return db.tagExists(tag).then(function(exists) {
            assert.ok(exists, "expected tag `" + tag + "` not found");
          });
        });

        var unexpectations = (test.unexpected.tags || []).map(function(tag) {
          return db.tagExists(tag).then(function(exists) {
            assert.ok(!exists, "unexpected tag `" + tag + "` found");
          });
        });

        return Promise.all(expectations.concat(unexpectations));
      });

      assuming(
        test.expected.boxTags !== undefined || test.unexpected.boxTags !== undefined
      ).it("should record box tags correctly", function() {
        var expectations = Object.keys(
          test.expected.boxTags || {}
        ).map(function(box) {
          var expectedTags = test.expected.boxTags[box];

          return db.numTagsForBox(boxID(box)).then(function(count) {
            var idxs = []; for (var i = 0; i < count; i++) { idxs.push(i); }

            return Promise.all(idxs.map(function(idx) {
              return db.tagForBoxAt(boxID(box), idx);
            })).then(function(tags) {
              expectedTags.forEach(function(tag) {
                assert(
                  tags.includes(paddedTag(tag)),
                  "expected box `" + box + "` to include tag `" + tag + "`"
                );
              });
            });
          });
        });

        var unexpectations = Object.keys(
          test.unexpected.boxTags || {}
        ).map(function(box) {
          var unexpectedTags = test.unexpected.boxTags[box];

          return db.numTagsForBox(boxID(box)).then(function(count) {
            var idxs = []; for (var i = 0; i < count; i++) { idxs.push(i); }

            return Promise.all(idxs.map(function(idx) {
              return db.tagForBoxAt(boxID(box), idx);
            })).then(function(tags) {
              unexpectedTags.forEach(function(tag) {
                assert(
                  !tags.includes(paddedTag(tag)),
                  "unexpected box `" + box + "` to not include tag `" + box + "`"
                );
              });
            });
          });
        });

        return Promise.all(expectations.concat(unexpectations));
      });

      assuming(
        test.expected.tagBoxes !== undefined || test.unexpected.tagBoxes !== undefined
      ).it("should record tag boxes correctly", function() {
        var expectations = Object.keys(
          test.expected.tagBoxes || {}
        ).map(function(tag) {
          var expectedBoxes = test.expected.tagBoxes[tag];

          return db.numBoxesWithTag(tag).then(function(count) {
            var idxs = []; for (var i = 0; i < count; i++) { idxs.push(i); }

            return Promise.all(idxs.map(function(idx) {
              return db.boxWithTagAt(tag, idx);
            })).then(function(boxes) {
              expectedBoxes.forEach(function(box) {
                assert(
                  boxes.includes(web3.toHex(boxID(box))),
                  "expected tag `" + tag + "` to include box `" + box + "`"
                );
              });
            });
          });
        });

        var unexpectations = Object.keys(
          test.unexpected.tagBoxes || {}
        ).map(function(tag) {
          var unexpectedBoxes = test.unexpected.tagBoxes[tag];

          return db.numBoxesWithTag(tag).then(function(count) {
            var idxs = []; for (var i = 0; i < count; i++) { idxs.push(i); }

            return Promise.all(idxs.map(function(idx) {
              return db.boxWithTagAt(tag, idx);
            })).then(function(boxes) {
              unexpectedBoxes.forEach(function(box) {
                assert(
                  !boxes.includes(web3.toHex(boxID(box))),
                  "unexpected tag `" + tag + "` to not include box `" + box + "`"
                );
              });
            });
          });
        });

        return Promise.all(expectations.concat(unexpectations));
      });
    });
  });
});
