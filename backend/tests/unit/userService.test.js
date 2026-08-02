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

    it('assigns a uuid user_id on create', async () => {
      userRepository.create.mockImplementation(async (user) => user);

      const result = await userService.createUser({
        email: 'jane@example.com',
        password: 'supersecret',
        first_name: 'Jane',
        last_name: 'Doe',
      });

      expect(result.user_id).toEqual(
        expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      );

      const [savedUser] = userRepository.create.mock.calls[0];
      expect(savedUser.user_id).toBe(result.user_id);
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
        user_id: '11111111-1111-4111-8111-111111111111',
        password_hash: passwordHash,
        first_name: 'Jane',
        last_name: 'Doe',
      });

      const result = await userService.verifyCredentials('jane@example.com', 'correct-password');
      expect(result).toMatchObject({ email: 'jane@example.com', user_id: '11111111-1111-4111-8111-111111111111' });
      expect(result).not.toHaveProperty('password_hash');
    });

    it('backfills a missing user_id at login and persists it', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      userRepository.findByEmail.mockResolvedValue({
        email: 'jane@example.com',
        password_hash: passwordHash,
        first_name: 'Jane',
        last_name: 'Doe',
      });
      userRepository.update.mockImplementation(async (email, updates) => ({
        email,
        password_hash: passwordHash,
        first_name: 'Jane',
        last_name: 'Doe',
        ...updates,
      }));

      const result = await userService.verifyCredentials('jane@example.com', 'correct-password');

      expect(userRepository.update).toHaveBeenCalledTimes(1);
      const [email, updates] = userRepository.update.mock.calls[0];
      expect(email).toBe('jane@example.com');
      expect(updates.user_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i));
      expect(result.user_id).toBe(updates.user_id);
    });

    it('does not rewrite an existing user_id at login', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      userRepository.findByEmail.mockResolvedValue({
        email: 'jane@example.com',
        user_id: '22222222-2222-4222-8222-222222222222',
        password_hash: passwordHash,
        first_name: 'Jane',
        last_name: 'Doe',
      });

      const result = await userService.verifyCredentials('jane@example.com', 'correct-password');

      expect(userRepository.update).not.toHaveBeenCalled();
      expect(result.user_id).toBe('22222222-2222-4222-8222-222222222222');
    });
  });

  describe('getSelf', () => {
    it('throws 404 when the user is not found', async () => {
      userRepository.findByEmail.mockResolvedValue(null);
      await expect(userService.getSelf('missing@example.com')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('returns the safe user shape including user_id', async () => {
      userRepository.findByEmail.mockResolvedValue({
        email: 'jane@example.com',
        user_id: '33333333-3333-4333-8333-333333333333',
        password_hash: 'hash',
        first_name: 'Jane',
        last_name: 'Doe',
      });
      const result = await userService.getSelf('jane@example.com');
      expect(result).not.toHaveProperty('password_hash');
      expect(result.user_id).toBe('33333333-3333-4333-8333-333333333333');
    });
  });

  describe('updateSelf', () => {
    it('updates and returns the safe user shape', async () => {
      userRepository.update.mockResolvedValue({
        email: 'jane@example.com',
        user_id: '44444444-4444-4444-8444-444444444444',
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
