var config = {};

config.client = {
  host: 'localhost',
  port: 8332,
  user: '',
  pass: '',
};

config.daemon = false;
config.dryRun = true;
config.account = 'MyHub';
config.address = '';
config.passPhrase = '';
config.targetAmount = 1; // in BTC
config.useUnspendable = false;
config.Debug = 0;

module.exports = config;
