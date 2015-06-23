require('bitcoin-math');

var bitcoin = require('bitcoin');
var treshold = 57600000;
var config = require('./config');

// all config options are optional
var client = new bitcoin.Client(config.client);
var HubAddress = config.address;

//client.walletPassphrase('',5,function(err,wallet){
//  if (err) return console.log(err);
//});
function mergeTransactions(){
  console.log((new Date()).toString());
  client.listUnspent(0,function(err, unspend, resHeaders) {
    if (err) return console.log(err);
    unspend.sort(function(a,b){return b.amount.toSatoshi() * b.confirmations - a.amount.toSatoshi() * a.confirmations});

    while (unspend.length > 2){
      output = {};
      output[HubAddress] = 0;
      trx = findTransaction(unspend,output);
      if (trx) {
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
                });
              });
            }
          });
        });
      }
    }
  });
}

function findTransaction(inputs,output){
  var priority = 0;
  var i = 0;
  var res = [];
  while (i<6 && priority/(((i+1)*34)+10) < treshold && inputs.length){
    input = inputs.shift();
    priority = priority + input.amount.toSatoshi() * (input.confirmations+1);
    output[HubAddress] = output[HubAddress] + input.amount.toSatoshi();
    res.push({txid:input.txid,vout:input.vout});
    i++;
  }
  if (i == 6){
    console.log('No transactions with minimum priority found');
    return false;
  }
  while (i<6 && inputs.length){
    input = inputs.pop();
    output[HubAddress] = output[HubAddress] + input.amount.toSatoshi();
    res.push({txid:input.txid,vout:input.vout});
    i++;
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