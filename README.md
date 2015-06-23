# bitcoin-transaction-merger
NodeJS deamon that connects to bitcoin wallet and merges the input transactions into bigger once

# DISCLAIMER - USE AT YOUR OWN RISK
IF YOU USE THIS SOFTWARE YOU DO SO ON YOUR OWN RISK AND THE AUTHOR CAN NOT BE HOLD RESPONSIBLE FOR ANY LOSS OF BITCOINS OR OTHER ASSETS.

## Purpose
The purpose of this app is to find the transaction with higher priority and to merge them with tansaction with lowest priority it portions of six.
By doing so the newly created transaction can be send to the network with no fees, but can take longer to be confirmed.
Since bitcoin network determines fees based on data size and amount merging all transactions recieved in one transaction, this would help you lower the fees needed to be used when spending Bitcoins.

## Installation
We presume you have nodejs and git installed on your system and can use a terminal.
In a terminal you need to clone the repository
```bash
git clone https://github.com/lukavia/bitcoin-transaction-merger
cd bitcoin-transaction-merger
```
And install dependencies
```bash
npm install
```

## Configuration
Copy the config-sample.js to config.js and use your favorite editor to fill in connection details and address to be used for sending the transactions.
```bash
cp config-sample.js config.js
```

# Donations
If you like this app and want to say thanks use:

BTC: 1886zXxHGSzkG1X2Uc2nX5sTXPuY7ghKx5
