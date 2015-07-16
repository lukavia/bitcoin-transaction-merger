require('bitcoin-math');

var bitcoin = require('bitcoin');
var blib = require('bitcoinjs-lib');
var AllowFreeThreshold = 57600000; // COIN * 144 / 250
var config = require('./config');
var threshold = AllowFreeThreshold;
var client = new bitcoin.Client(config.client);
var HubAddress = config.address;
var Addresses = {};

//client.walletPassphrase('',5,function(err,wallet){
//  if (err) return console.log(err);
//});
function getAddresFromScriptPubKey(scriptPubKey){
  return blib.Address.fromOutputScript(blib.Script.fromHex(scriptPubKey),blib.networks.bitcoin).toString();
}

function getAddressInfo(tx){
  var addr = getAddresFromScriptPubKey(tx.scriptPubKey);
  if (!Addresses[addr] && tx.spendable){
    client.validateAddress(addr,function(err,data){
      if (err) return console.log(err);
      Addresses[addr] = data;
    });
  }
}

function mergeTransactions(){
  console.log((new Date()).toString());
  client.listUnspent(1,function(err, unspend, resHeaders) {
    if (err) return console.log(err);
    unspend.sort(function(a,b){
      // send unspandble to the end
      if(!a.spendable) return 1;
      if(!b.spendable) return -1;
      // this is a hack to get all the addresses info
      getAddressInfo(a);
      getAddressInfo(b);
      // !compressed nInputSize = 29
      //double dPriority = ((double)out.tx->vout[out.i].nValue  / (nInputSize + 78)) * (out.nDepth+1); // 78 = 2 * 34 + 10
      return b.amount.toSatoshi() * b.confirmations - a.amount.toSatoshi() * a.confirmations;
    });

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
        while (unspend.length > 4){
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
  var dPriorityInputs = 0.0;
  var nQuantityUncompressed = 0;
  var nBytes = 0;
  var nBytesInputs = 0;
  var i = 0;
  var res = [];

  function calcTx(){
    if (input.spendable) { // filter watch-only wallet transactions
      var addr = getAddresFromScriptPubKey(input.scriptPubKey);
      dPriorityInputs = dPriorityInputs + input.amount.toSatoshi() * (input.confirmations+1);
      if (Addresses[addr] && !Addresses[addr].iscompressed){
        nQuantityUncompressed++;
        nBytesInputs += 180;
      } else {
        nBytesInputs += 148;
      }
      nBytes = nBytesInputs + ((1 * 34) + 10);
    }
  }
  function addTx(){
    if (input.spendable) { // filter watch-only wallet transactions
      output[HubAddress] = output[HubAddress] + input.amount.toSatoshi();
      res.push({txid:input.txid,vout:input.vout});
      i++;
      console.log(nBytes,input.amount,nQuantityUncompressed,threshold,dPriorityInputs/(nBytes - nBytesInputs + (nQuantityUncompressed*29)));
    }
  }
  
  do {
    var input = inputs[0];
    calcTx();
    addTx();
    inputs.shift();
  } while (nBytes<1024 && dPriorityInputs/(nBytes - nBytesInputs + (nQuantityUncompressed*29)) < threshold && inputs.length);
  console.log('----');
  if (nBytes > 1024){
    console.log('Transaction too large');
    return false;
  }
  // Add more transactions
  while (nBytes<1024 && inputs.length){
    input = inputs.pop();
    calcTx();
    if (nBytes<1024){
      addTx();
    } else if(inputs.length && input.spendable){ //Return last transaction for next pass
      inputs.unshift(input);
    }
  }
  console.log('=====');
  if(dPriorityInputs/(nBytes - nBytesInputs + (nQuantityUncompressed*29)) < threshold){
    console.log('Not enought priority');
    return false;
  }
  if (i < 5){
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