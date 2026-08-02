const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const AppError = require('../errors/AppError');

const SALT_ROUNDS = 10;

function toSafeUser(user) {
  return {
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function createUser({ email, password, first_name, last_name }) {
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const now = new Date().toISOString();

  const user = await userRepository.create({
    email,
    password_hash,
    first_name,
    last_name,
    created_at: now,
    updated_at: now,
  });

  return toSafeUser(user);
}

async function verifyCredentials(email, password) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  return isValid ? toSafeUser(user) : null;
}

async function getSelf(email) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new AppError(404, 'User not found.');
  }
  return toSafeUser(user);
}

async function updateSelf(email, updates) {
  const user = await userRepository.update(email, updates);
  return toSafeUser(user);
}

module.exports = { createUser, verifyCredentials, getSelf, updateSelf };
