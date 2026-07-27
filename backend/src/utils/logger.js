/* eslint-disable no-console */

function info(message) {
  console.info(message);
}

function error(message, err) {
  console.error(message, err);
}

module.exports = { info, error };
