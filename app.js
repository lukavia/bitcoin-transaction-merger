require('bitcoin-math');

var bitcoin = require('bitcoin');
var blib = require('bitcoinjs-lib');
var AllowFreeThreshold = 57600000; // COIN * 144 / 250
var config = require('./config');
var threshold = AllowFreeThreshold;
var client = new bitcoin.Client(config.client);
var HubAddress = config.address;
var HubAccount = config.account;
var Addresses = {};
var Queue = {};
Queue.Addresses = [];
Queue.Batch = [];
//client.walletPassphrase('',5,function(err,wallet){
//  if (err) return console.log(err);
//});

function debug(val,level){
  if (config.Debug && level <= config.Debug){
    console.log(val);
  }
}

function getAddresFromScriptPubKey(scriptPubKey){
  return blib.address.fromOutputScript(new Buffer(scriptPubKey, 'hex'),blib.networks.bitcoin).toString();
}

function AddressAddToQueue(tx){
  var addr = getAddresFromScriptPubKey(tx.scriptPubKey);
  if (!Addresses[addr] && Queue.Addresses.indexOf(addr) < 0) {
    Queue.Addresses.push(addr);
    Queue.Batch.push({method:'validateaddress',params: [addr] });
  }
}

function getAddressInfo(tx){
  var addr = getAddresFromScriptPubKey(tx.scriptPubKey);
  if (!Addresses[addr] && (tx.spendable || config.useUnspendable)){
    client.validateAddress(addr,function(err,data){
      if (err) return console.log(err);
      debug('validateAddress: ' + addr,6);
      Addresses[addr] = data;
      debug(data,7);
    });
  }
}

function mergeTransactions(){
  console.log((new Date()).toString());
  client.listUnspent(1,function(err, unspend, resHeaders) {
    if (err) return console.log(err);
    unspend.sort(function(a,b){
      // send unspandble to the end
      if(!config.useUnspendable && !a.spendable) return 1;
      if(!config.useUnspendable && !b.spendable) return -1;
      // this is a hack to get all the addresses info
      AddressAddToQueue(a);
      AddressAddToQueue(b);
      //getAddressInfo(a);
      //getAddressInfo(b);
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
	debug('Set treshold to: ' + threshold,1);

        client.cmd(Queue.Batch, function(err, data, resHeaders) {
          if (err) return console.log(err);
          debug('validateAddress: ' + data.address,6);
          Addresses[data.address] = data;
          debug(data,7);
          var _idx = Queue.Addresses.indexOf(data.address);
	  if (_idx >= 0) {
            Queue.Batch.splice(_idx,1);
            Queue.Addresses.splice(_idx,1);
          }
        });

        while (unspend.length > 4){
          var output = {};
          output['HubAddress'] = 0;
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
  var tx = new blib.TransactionBuilder();
  for (f in trx ) {
    tx.addInput(trx[f].txid,trx[f].vout);
  }
  //for (o in output) {
  //  tx.addOutput(o,output[o].toSatoshi());
  //}
  var _func = function () {
    tx.addOutput(HubAddress,output['HubAddress'].toSatoshi());
    var rawTransaction = tx.buildIncomplete().toHex();
  //client.createRawTransaction(trx,output,function(err,rawTransaction){
    //if (err) return console.log(err);
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
  //});
  }
  if (config.account) {
    client.getAccountAddress(config.account,function(err,address){
      if (err) return console.log(err);
      HubAddress = address;
      _func();
    });
  } else {
    _func();
  }
};

function findTransaction(inputs,output){
  var dPriorityInputs = 0.0;
  var nQuantityUncompressed = 0;
  var nBytes = 0;
  var nBytesInputs = 0;
  var i = 0;
  var res = [];

  function calcTx(){
    if ((input.spendable || config.useUnspendable) && input.amount < config.targetAmount) { // filter watch-only wallet transactions
      var addr = getAddresFromScriptPubKey(input.scriptPubKey);
      dPriorityInputs = dPriorityInputs + input.amount.toSatoshi() * (input.confirmations+1);
      if (Addresses[addr] && !Addresses[addr].iscompressed){
        nQuantityUncompressed++;
        nBytesInputs += 180;
      } else {
        nBytesInputs += 148;
      }
      nBytes = nBytesInputs + ((1 * 34) + 10);
      debug({input:{seq:cnt,nBytes:nBytes,dPriorityInputs:dPriorityInputs}},2);
    }
  }
  function addTx(){
    debug({addTx:{amount:input.amount}},4);
    if ((input.spendable || config.useUnspendable) && input.amount < config.targetAmount) { // filter watch-only wallet transactions
      output['HubAddress'] = output['HubAddress'] + input.amount.toSatoshi();
      res.push({txid:input.txid,vout:input.vout});
      i++;
      debug({output:{seq:i,txid:input.txid,vout:input.vout,amount:output['HubAddress']}},2);
      //console.log(nBytes,input.amount,nQuantityUncompressed,threshold,dPriorityInputs/(nBytes - nBytesInputs + (nQuantityUncompressed*29)));
    }
  }
  
  do {
    var cnt = 0;
    var input = inputs[0];
    calcTx();
    addTx();
    inputs.shift();
    cnt++;
  } while (nBytes<1024 &&
    ( dPriorityInputs == (nBytes - nBytesInputs + (nQuantityUncompressed*29)) ||
      dPriorityInputs/(nBytes - nBytesInputs + (nQuantityUncompressed*29)) < threshold)
    && inputs.length);
  //console.log('----');
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
    } else if(inputs.length && (input.spendable || config.useUnspendable)){ //Return last transaction for next pass
      inputs.unshift(input);
    }
  }
  //console.log('=====');
  if(dPriorityInputs/(nBytes - nBytesInputs + (nQuantityUncompressed*29)) < threshold){
    console.log('Not enought priority');
    return false;
  }
  if (nBytes < 1024 - 180){ // Max bytes - 1 uncompressed
    console.log('Not enought unspend transactions');
    return false;
  }
  if (output['HubAddress'] < 1000000){
    console.log('Not enought bitcoin amount');
    return false;
  }
  output['HubAddress'] = output['HubAddress'].toBitcoin();
  return res;
}

mergeTransactions();
if (config.daemon){
  setInterval(mergeTransactions,1000 * 60 * 10);
}
