const jsonwebtoken = require('jsonwebtoken');

let secret;

function init(jwtSecret) {
  secret = jwtSecret;
}

function sign(payload, expiresIn = '7d') {
  return jsonwebtoken.sign(payload, secret, { expiresIn });
}

function verify(token) {
  try {
    return jsonwebtoken.verify(token, secret);
  } catch {
    return null;
  }
}

module.exports = { init, sign, verify };
