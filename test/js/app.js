var test = require("tape");
var request = require('request');
var env = require('node-env-file');
var async = require('async');
env('./.env');

var openpublishState = require('openpublish-state')({
  network: "testnet"
});

var __nonces = {};
var commonWalletNonceStore = {
  get: function(address, callback) {
    callback(false, __nonces[address]);
  },
  set: function(address, nonce, callback) {
    __nonces[address] = nonce;
    callback(false, true);
  }
}

var __comments = {};
var commentsStore = {
  get: function(sha1, callback) {
    var comments = __comments[sha1] || [];
    callback(false, comments);
  },
  set: function(sha1, comments, callback) {
    __comments[sha1] = comments;
    callback(false, true);
  }
}
var resetCommentsStore = function() {
  __comments = {};
}

var commonBlockchain = require('mem-common-blockchain');

var createApp = function() {
  var app = require("../../src/js/app")({
    commonBlockchain: commonBlockchain,
    commonWalletNonceStore: commonWalletNonceStore,
    commentsStore: commentsStore,
    network: "testnet"
  });
  return app;
}


var port = 3434;
var serverRootUrl = "http://localhost:" + port;

var testCommonWallet = require('test-common-wallet');

/*

  On testnet,

    Alice published the document dc724af18fbdd4e59189f5fe768a5f8311527050
    Alice and Bob have tipped the document dc724af18fbdd4e59189f5fe768a5f8311527050

  These were created in the openpublish test suite:

    https://github.com/blockai/openpublish/blob/master/test/index-spec.js

*/

var aliceWallet = testCommonWallet({
  seed: "test",
  network: "testnet",
  commonBlockchain: commonBlockchain
});

var bobWallet = testCommonWallet({
  seed: "test1",
  network: "testnet",
  commonBlockchain: commonBlockchain
});

var sha1 = 'dc724af18fbdd4e59189f5fe768a5f8311527050';

test("Alice should verify for sha1 tipped by address", function(t) {  
  var app = createApp();
  var server = app.listen(port, function() {
    aliceWallet.login(serverRootUrl, function(err, res, body) {
      aliceWallet.request({host: serverRootUrl, path: "/verify/" + sha1 }, function(err, res, body) {
        t.equal(res.statusCode, 200, "200 statusCode");
        t.equal(body, "ok", "should be ok");
        server.close();
        t.end();
      });
    })
  });
});

test("Alice should not verify for sha1 not tipped by address", function(t) {
  var badSha1 = 'xxx';
  var app = createApp();
  var server = app.listen(port, function() {
    aliceWallet.login(serverRootUrl, function(err, res, body) {
      aliceWallet.request({host: serverRootUrl, path: "/verify/" + badSha1 }, function(err, res, body) {
        t.equal(res.statusCode, 401, "401 statusCode");
        t.notEqual(body, "ok", "should not be ok");
        server.close();
        t.end();
      });
    })
  });
});

test("Alice should get comments for sha1 tipped by address", function(t) {  
  var app = createApp();
  var server = app.listen(port, function() {
    aliceWallet.login(serverRootUrl, function(err, res, body) {
      aliceWallet.request({host: serverRootUrl, path: "/comments/" + sha1 }, function(err, res, body) {
        t.equal(res.statusCode, 200, "200 statusCode");
        t.equal(body, "[]", "returned empty comments");
        server.close();
        t.end();
      });
    })
  });
});

test("Alice should get comments for sha1 not tipped by address", function(t) {
  var badSha1 = 'xxx';
  var app = createApp();
  var server = app.listen(port, function() {
    aliceWallet.login(serverRootUrl, function(err, res, body) {
      aliceWallet.request({host: serverRootUrl, path: "/comments/" + badSha1 }, function(err, res, body) {
        t.equal(res.statusCode, 200, "200 statusCode");
        t.equal(body, "[]", "returned error message");
        server.close();
        t.end();
      });
    })
  });
});

test("Bob should post a new comment for sha1 tipped by address", function(t) {
  var commentBody = "test123";
  bobWallet.signMessage(commentBody, function(err, signedCommentBody) {
    var app = createApp();
    var server = app.listen(port, function() {
      bobWallet.login(serverRootUrl, function(err, res, body) {
        bobWallet.request({host: serverRootUrl, path: "/comments/" + sha1, method:"POST", form: {"commentBody": commentBody, "signedCommentBody": signedCommentBody} }, function(err, res, body) {
          t.equal(res.statusCode, 200, "200 statusCode");
          t.equal(body, "ok", "should be ok");
          commentsStore.get(sha1, function(err, comments) {
            t.equal(comments[0].commentBody, commentBody, "updated store with proper commentBody");
            t.equal(comments[0].address, bobWallet.address, "updated store with proper address");
            resetCommentsStore();
            server.close();
            t.end();
          });
        });
      });
    });
  });
});

test("Bob not should post a new comment after posting 3 within 5 minutes", function(t) {
  var commentTemplate = "testing comment - ";
  var commentBodies = [];
  for (var i = 0; i < 4; i++) {
    commentBodies[i] = commentTemplate + i;
  };
  var createAndPostComment = function(commentBody, callback) {
    bobWallet.signMessage(commentBody, function(err, signedCommentBody) {
      bobWallet.request({host: serverRootUrl, path: "/comments/" + sha1, method:"POST", form: {"commentBody": commentBody, "signedCommentBody": signedCommentBody} }, function(err, res, body) {
        callback(err, res, body);
      });
    });
  };
  t.plan(5);
  var app = createApp();
  var server = app.listen(port, function() {
    bobWallet.login(serverRootUrl, function(err, res, body) {
      var commentCount = 0;
      async.eachSeries(commentBodies, function(commentBody, next) {
        createAndPostComment(commentBody, function(err, res, body) {
          if (commentCount < 3) {
            t.equal(res.statusCode, 200, "should be 200");
          }
          else {
            t.equal(res.statusCode, 429, "should be 429");
          }
          ++commentCount;
          next();
        });
      }, function(err) {
        resetCommentsStore();
        server.close();
        t.ok("done", "done");
      });
    });
  });
});

test("Bob should not post an empty comment for sha1 tipped by address", function(t) {
  var commentBody = "";
  bobWallet.signMessage(commentBody, function(err, signedCommentBody) {
    var app = createApp();
    var server = app.listen(port, function() {
      bobWallet.login(serverRootUrl, function(err, res, body) {
        bobWallet.request({host: serverRootUrl, path: "/comments/" + sha1, method:"POST", form: {"commentBody": commentBody, "signedCommentBody": signedCommentBody} }, function(err, res, body) {
          t.equal(res.statusCode, 400, "400 statusCode");
          t.notEqual(body, "ok", "should not be ok");
          resetCommentsStore();
          server.close();
          t.end();
        });
      });
    });
  });
});

test("Alice should not post a new comment without a signature for sha1 tipped by address", function(t) {
  var commentBody = "test123";
  var signedCommentBody = "bunk";
  var app = createApp();
  var server = app.listen(port, function() {
    aliceWallet.login(serverRootUrl, function(err, res, body) {
      aliceWallet.request({host: serverRootUrl, path: "/comments/" + sha1, method:"POST", form: {"commentBody": commentBody, "signedCommentBody": signedCommentBody} }, function(err, res, body) {
        t.equal(res.statusCode, 401, "401 statusCode");
        t.notEqual(body, "ok", "should not be ok");
        commentsStore.get(sha1, function(err, comments) {
          t.equal(comments.length, 0, "did not update store");
          resetCommentsStore();
          server.close();
          t.end();
        });
      });
    });
  });
});

test("Bob should post a new comment for sha1 tipped by address and get a list of comments", function(t) {
  var commentBody = "testing 123";
  bobWallet.signMessage(commentBody, function(err, signedCommentBody) {
    var app = createApp();
    var server = app.listen(port, function() {
      bobWallet.login(serverRootUrl, function(err, res, body) {
        bobWallet.request({host: serverRootUrl, path: "/comments/" + sha1, method:"POST", form: {"commentBody": commentBody, "signedCommentBody":signedCommentBody} }, function(err, res, body) {
          t.equal(res.statusCode, 200, "200 statusCode");
          t.equal(body, "ok", "should be ok");
          bobWallet.request({host: serverRootUrl, path: "/comments/" + sha1 }, function(err, res, body) {
            t.equal(res.statusCode, 200, "200 statusCode");
            var comments = JSON.parse(body);
            t.equal(comments[0].commentBody, commentBody, "returned comments with proper commentBody");
            t.equal(comments[0].address, bobWallet.address, "returned comments with proper address");
            resetCommentsStore();
            server.close();
            t.end();
          });
        });
      })
    });
  });
});