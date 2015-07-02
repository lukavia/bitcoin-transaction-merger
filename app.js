require('bitcoin-math');

var bitcoin = require('bitcoin');
var AllowFreeThreshold = 57600000; // COIN * 144 / 250
var config = require('./config');
var threshold = AllowFreeThreshold;
var client = new bitcoin.Client(config.client);
var HubAddress = config.address;

//client.walletPassphrase('',5,function(err,wallet){
//  if (err) return console.log(err);
//});
function mergeTransactions(){
  console.log((new Date()).toString());
  client.listUnspent(1,function(err, unspend, resHeaders) {
    if (err) return console.log(err);
    unspend.sort(function(a,b){return b.amount.toSatoshi() * b.confirmations - a.amount.toSatoshi() * a.confirmations});
    //unspend.sort(function(a,b){return b.amount.toSatoshi() - a.amount.toSatoshi()});
    //unspend.sort(function(a,b){return b.confirmations - a.confirmations});
    //console.log(unspend);
    if(unspend.length < 6) {
      console.log('Not enought unspend transactions');
    } else {
      client.estimatePriority(25,function(err,minPriority){
        if (err) return console.log(err);
        if (minPriority > 0){
          threshold = minPriority;
        } else {
          threshold = AllowFreeThreshold;
        }
        while (unspend.length > 2){
          var output = {};
          output[HubAddress] = 0;
          var trx = findTransaction(unspend,output);
          if (trx) {
            if(config.passPhrase){
              client.walletPassphrase(config.passPhrase,1,function(err){
                if (err) return console.log(err);
                processTransaction(this.trx,this.output,function(){
                  client.walletLock(function(err){
                    if (err) return console.log(err);
                  });
                });
              }.bind({trx:trx,output:output}));
            } else {
              processTransaction(trx,output);
            }
          }
        }
      });
    }
  });
}

function processTransaction(trx,output,callback){
  client.createRawTransaction(trx,output,function(err,rawTransaction){
    if (err) return console.log(err);
    client.decodeRawTransaction(rawTransaction,function(err,transaction){
      if (err) return console.log(err);
        console.log('Will send txid: '+transaction.txid);
        console.log('  with total amount of '+transaction.vout[0].value+' to address '+HubAddress);
        console.log('  rawTransaction: '+rawTransaction);
      if (config.dryRun){
        console.log('  dry run nothing is send');
      } else {
        client.signRawTransaction(rawTransaction,function(err,signedTransaction){
          if (err) return console.log(err);
          client.sendRawTransaction(signedTransaction.hex,function(err){
            if (err) return console.log(err);
            console.log('Send txid: '+transaction.txid);
            if(callback){
              callback();
            }
          });
        });
      }
    });
  });
};

function findTransaction(inputs,output){
  var priority = 0;
  var i = 0;
  var res = [];
  while (i<6 && priority/(((2)*34)+10) < threshold && inputs.length){// (2) Should be outputs+1
    var input = inputs[0];
    if (input.spendable) { // filter watch-only wallet transactions
      priority = priority + input.amount.toSatoshi() * (input.confirmations+1);
      output[HubAddress] = output[HubAddress] + input.amount.toSatoshi();
      res.push({txid:input.txid,vout:input.vout});
      i++;
    }
    inputs.shift();
  }
  if (i == 7){
    console.log('No transactions with minimum priority found');
    return false;
  }
  while (i<6 && inputs.length){
    input = inputs.pop();
    if (input.spendable) { // filter watch-only wallet transactions
      output[HubAddress] = output[HubAddress] + input.amount.toSatoshi();
      res.push({txid:input.txid,vout:input.vout});
      i++;
    }
  }
  if (i < 6){
    console.log('Not enought unspend transactions');
    return false;
  }
  if (output[HubAddress] < 1000000){
    console.log('Not enought bitcoin amount');
    return false;
  }
  output[HubAddress] = output[HubAddress].toBitcoin();
  return res;
}

mergeTransactions();
if (config.daemon){
  setInterval(mergeTransactions,1000 * 60 * 10);
}