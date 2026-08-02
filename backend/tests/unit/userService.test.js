const bcrypt = require('bcryptjs');

jest.mock('../../src/repositories/userRepository');

const userRepository = require('../../src/repositories/userRepository');
const userService = require('../../src/services/userService');
const AppError = require('../../src/errors/AppError');

describe('userService', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createUser', () => {
    it('hashes the password and never returns it', async () => {
      userRepository.create.mockImplementation(async (user) => user);

      const result = await userService.createUser({
        email: 'jane@example.com',
        password: 'supersecret',
        first_name: 'Jane',
        last_name: 'Doe',
      });

      expect(result).not.toHaveProperty('password_hash');
      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe('jane@example.com');
      expect(userRepository.create).toHaveBeenCalledTimes(1);

      const [savedUser] = userRepository.create.mock.calls[0];
      expect(savedUser.password_hash).toBeDefined();
      expect(savedUser.password_hash).not.toBe('supersecret');
    });

    it('propagates duplicate-email errors from the repository', async () => {
      userRepository.create.mockRejectedValue(new AppError(409, 'An account with this email already exists.'));

      await expect(
        userService.createUser({
          email: 'jane@example.com',
          password: 'supersecret',
          first_name: 'Jane',
          last_name: 'Doe',
        })
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('verifyCredentials', () => {
    it('returns null when the user does not exist', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      const result = await userService.verifyCredentials('missing@example.com', 'whatever');
      expect(result).toBeNull();
    });

    it('returns null when the password does not match', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      userRepository.findByEmail.mockResolvedValue({
        email: 'jane@example.com',
        password_hash: passwordHash,
        first_name: 'Jane',
        last_name: 'Doe',
      });

      const result = await userService.verifyCredentials('jane@example.com', 'wrong-password');
      expect(result).toBeNull();
    });

    it('returns the safe user when the password matches', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      userRepository.findByEmail.mockResolvedValue({
        email: 'jane@example.com',
        password_hash: passwordHash,
        first_name: 'Jane',
        last_name: 'Doe',
      });

      const result = await userService.verifyCredentials('jane@example.com', 'correct-password');
      expect(result).toMatchObject({ email: 'jane@example.com' });
      expect(result).not.toHaveProperty('password_hash');
    });
  });

  describe('getSelf', () => {
    it('throws 404 when the user is not found', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      await expect(userService.getSelf('missing@example.com')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('returns the safe user shape', async () => {
      userRepository.findByEmail.mockResolvedValue({
        email: 'jane@example.com',
        password_hash: 'hash',
        first_name: 'Jane',
        last_name: 'Doe',
      });
      const result = await userService.getSelf('jane@example.com');
      expect(result).not.toHaveProperty('password_hash');
    });
  });

  describe('updateSelf', () => {
    it('updates and returns the safe user shape', async () => {
      userRepository.update.mockResolvedValue({
        email: 'jane@example.com',
        password_hash: 'hash',
        first_name: 'Janet',
        last_name: 'Doe',
      });

      const result = await userService.updateSelf('jane@example.com', { first_name: 'Janet' });
      expect(result.first_name).toBe('Janet');
      expect(result).not.toHaveProperty('password_hash');
    });
  });
});
