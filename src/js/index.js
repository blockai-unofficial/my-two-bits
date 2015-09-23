/*

  Environment Variables

*/

var AWS_ACCESS_KEY_ID =  process.env.AWS_ACCESS_KEY_ID;
var AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
var NONCE_TABLE_NAME = process.env.NONCE_TABLE_NAME;
var COMMENTS_TABLE_NAME = process.env.COMMENTS_TABLE_NAME;
var PORT = process.env.PORT || 3434;
var BLOCKCHAIN_NETWORK = process.env.BLOCKCHAIN_NETWORK;
var BLOCKCYPHER_TOKEN = process.env.BLOCKCYPHER_TOKEN;

var commonBlockchain = require('blockcypher-unofficial')({
  key: BLOCKCYPHER_TOKEN,
  network: BLOCKCHAIN_NETWORK
});

/*

  commonWalletNonceStore
  ----------------------
  dynamodb

*/

var dynamodb =  require('dynamodb');
var ddb = dynamodb.ddb({ accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY });

ddb.createTable(NONCE_TABLE_NAME, { hash: ['address', ddb.schemaTypes().string] }, { read: 10, write: 10 }, function() {});
var commonWalletNonceStore = {
  get: function(address, callback) {
    ddb.getItem(NONCE_TABLE_NAME, address, null, {}, function(err, resp, cap) {
      var nonce = resp.nonce;
      callback(err, nonce);
    });
  },
  set: function(address, nonce, callback) {
    ddb.putItem(NONCE_TABLE_NAME, {address:address, nonce:nonce}, {}, function(err, resp, cap) {
      callback(err, resp);
    });
  }
};

/*

  commentsStore
  -----------------
  dynamodb

*/

ddb.createTable(COMMENTS_TABLE_NAME, { hash: ['sha1', ddb.schemaTypes().string] }, { read: 10, write: 10 }, function() {});
var commentsStore = {
  get: function(sha1, callback) {
    ddb.getItem(COMMENTS_TABLE_NAME, sha1, null, {}, function(err, resp, cap) {
      var commentsJSON;
      if (!resp || !resp.commentsJSON) {
        commentsJSON = "[]";
      }
      else {
        commentsJSON = resp.commentsJSON;
      }
      var comments = JSON.parse(commentsJSON);
      callback(err, comments);
    });
  },
  set: function(sha1, comments, callback) {
    var commentsJSON = JSON.stringify(comments);
    ddb.putItem(COMMENTS_TABLE_NAME, {sha1:sha1, commentsJSON:commentsJSON}, {}, function(err, resp, cap) {
      console.log(err, resp, cap);
      callback(err, resp);
    });
  }
};

/*

  app

*/

var app = require("./app")({
  commonBlockchain: commonBlockchain,
  commonWalletNonceStore: commonWalletNonceStore,
  commentsStore: commentsStore
});

var server = app.listen(PORT, function() {

});