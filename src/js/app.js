module.exports = function(options) {

  var commonBlockchain = options.commonBlockchain;
  var network = options.network;
  var commonWalletNonceStore = options.commonWalletNonceStore;
  var commentsStore = options.commentsStore;

  var bitcoin = require('bitcoinjs-lib');

  /*

    Open Publish state
    ------------------

  */

  var openpublishState = require('openpublish-state')({
    network: network
  });

  /*

    app
    ---
    express

     cors
     body-parser
     express-common-wallet

  */

  var express = require('express');
  var cors = require('cors');
  var bodyParser = require('body-parser');
  var expressCommonWallet = require('express-common-wallet');
  var app = express();
  app.use(cors());
  app.use(bodyParser());
  app.use("/", expressCommonWallet({
    commonWalletNonceStore: commonWalletNonceStore
  }));

  /*

    verification middleware
    -----------------------

    depends on express-common-wallet router middleware

  */

  var verifyTip = function(req, res, next) {
    var verifiedAddress = req.verifiedAddress;
    var sha1 = req.params.sha1;
    if (sha1 && verifiedAddress) {
      openpublishState.findTipsByUser({address: verifiedAddress}, function(err, tips) {
        tips.forEach(function(tip) {
          if (tip.opendoc_sha1 === sha1) {
            req.tipVerified = true;
          }
        });
        next();
      });
    }
    else {
      next();
    }
  };

  var verifyAddressAndTip = function(req, res, next) {
    var sha1 = req.params.sha1;
    verifyTip(req, res, function() {
      var verifiedAddress = req.verifiedAddress;
      if (!verifiedAddress) {
        return res.status(401).send("Unauthorized");
      } 
      var tipVerified = req.tipVerified;
      if (!tipVerified) {
        return res.status(401).send("Missing Opentip: " + sha1);
      }
      next();
    });
  };

  /*

    get and post comments endpoints
    -------------------------------

  */

  app.get("/comments/:sha1", verifyAddressAndTip, function(req, res) {
    var sha1 = req.params.sha1;
    commentsStore.get(sha1, function(err, comments) {
      if (err) {
        res.status(500).send("Error");
      }
      res.status(200).send(comments);
    });
  });

  app.post("/comments/:sha1", verifyAddressAndTip, function(req, res) {
    var sha1 = req.params.sha1;
    var verifiedAddress = req.verifiedAddress;
    var network = req.headers["x-common-wallet-network"] == "testnet" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
    var commentBody = req.body.commentBody;
    var signedCommentBody = req.body.signedCommentBody;
    var commonBodyIsVerified;
    try {
      commonBodyIsVerified = bitcoin.Message.verify(verifiedAddress, signedCommentBody, commentBody, network);
    }
    catch(e) {
      commonBodyIsVerified = false;
    }
    if (!commonBodyIsVerified) {
      return res.status(401).send("Unauthorized Comment");
    }
    var newComment = {
      commentBody: commentBody,
      address: verifiedAddress
    }
    commentsStore.get(sha1, function(err, comments) {
      comments.push(newComment);
      commentsStore.set(sha1, comments, function(err, receipt) {
        if (err) {
          res.status(500).send("Error");
        }
        res.status(200).send("ok");
      });
    });
  });

  return app;
}