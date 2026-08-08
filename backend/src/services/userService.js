const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');
const userRepository = require('../repositories/userRepository');
const AppError = require('../errors/AppError');

const SALT_ROUNDS = 10;

function toSafeUser(user) {
  return {
    email: user.email,
    user_id: user.user_id,
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
    user_id: randomUUID(),
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
  if (!isValid) {
    return null;
  }

  // Accounts created before user_id existed have no attribute for it. Rather
  // than a one-off migration script, assign it the first time such an
  // account logs in and persist it - the sites table (and its S3 history
  // keys) are keyed on this id, so it must exist before any site can be created.
  if (!user.user_id) {
    const updated = await userRepository.update(email, { user_id: randomUUID() });
    return toSafeUser(updated);
  }

  return toSafeUser(user);
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

module.exports = { createUser, verifyCredentials, getSelf, updateSelf, toSafeUser };
