var test = require("tape");
var request = require('request');
var env = require('node-env-file');
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

var app = require("../../src/js/app")({
  commonBlockchain: commonBlockchain,
  commonWalletNonceStore: commonWalletNonceStore,
  commentsStore: commentsStore,
  network: "testnet"
});
var port = 3434;
var serverRootUrl = "http://localhost:" + port;

var testCommonWallet = require('test-common-wallet');

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

test("Alice should get comments for sha1 tipped by address", function(t) {
  var sha1 = 'dc724af18fbdd4e59189f5fe768a5f8311527050';
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

test("Alice should not get comments for sha1 not tipped by address", function(t) {
  var sha1 = 'xxx';
  var server = app.listen(port, function() {
    aliceWallet.login(serverRootUrl, function(err, res, body) {
      aliceWallet.request({host: serverRootUrl, path: "/comments/" + sha1 }, function(err, res, body) {
        t.equal(res.statusCode, 401, "401 statusCode");
        t.notEqual(body, "[]", "returned error message");
        server.close();
        t.end();
      });
    })
  });
});

test("Bob should post a new comment for sha1 tipped by address", function(t) {
  var sha1 = 'dc724af18fbdd4e59189f5fe768a5f8311527050';
  var commentBody = "test123";
  bobWallet.signMessage(commentBody, function(err, signedCommentBody) {
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

test("Bob should not post an empty comment for sha1 tipped by address", function(t) {
  var sha1 = 'dc724af18fbdd4e59189f5fe768a5f8311527050';
  var commentBody = "";
  bobWallet.signMessage(commentBody, function(err, signedCommentBody) {
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
  var sha1 = 'dc724af18fbdd4e59189f5fe768a5f8311527050';
  var commentBody = "test123";
  var signedCommentBody = "bunk";
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
  var sha1 = 'dc724af18fbdd4e59189f5fe768a5f8311527050';
  var commentBody = "testing 123";
  bobWallet.signMessage(commentBody, function(err, signedCommentBody) {
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