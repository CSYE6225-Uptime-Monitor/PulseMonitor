const { mockClient } = require('aws-sdk-client-mock');
const { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const { s3Client } = require('../../src/db/s3');
const exportRepository = require('../../src/repositories/exportRepository');
const { prefixFor, buildKey } = require('../../src/utils/exportKeys');

const s3Mock = mockClient(s3Client);

const PREFIX = 'exports';
const USER_ID = 'u1';
const BUCKET = 'pulsemonitor-test-user-data';

function keyAt(isoString, exportId8 = 'abcdef12') {
  return buildKey(PREFIX, USER_ID, new Date(isoString).getTime(), exportId8);
}

describe('exportRepository.putExport', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('writes the bundle JSON to the user-data bucket under the export key', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    const ms = Date.parse('2026-08-02T14:05:03.123Z');

    await exportRepository.putExport(USER_ID, ms, 'abcdef12', { profile: { user_id: USER_ID } });

    const call = s3Mock.commandCalls(PutObjectCommand)[0];
    expect(call.args[0].input.Bucket).toBe(BUCKET);
    expect(call.args[0].input.Key).toBe(keyAt('2026-08-02T14:05:03.123Z'));
    expect(call.args[0].input.ContentType).toBe('application/json');
    expect(JSON.parse(call.args[0].input.Body)).toEqual({ profile: { user_id: USER_ID } });
  });
});

describe('exportRepository.listExports', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('issues exactly one ListObjectsV2 and zero GetObjects', async () => {
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [], IsTruncated: false });

    await exportRepository.listExports(USER_ID);

    expect(s3Mock.commandCalls(ListObjectsV2Command)).toHaveLength(1);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
    const call = s3Mock.commandCalls(ListObjectsV2Command)[0];
    expect(call.args[0].input.Bucket).toBe(BUCKET);
    expect(call.args[0].input.Prefix).toBe(prefixFor(PREFIX, USER_ID));
    expect(call.args[0].input.MaxKeys).toBe(100);
  });

  it('derives export_id, created_at, and size_bytes from the key and Size alone', async () => {
    const ms = Date.parse('2026-08-02T14:05:03.123Z');
    const key = keyAt('2026-08-02T14:05:03.123Z');
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [{ Key: key, Size: 512 }], IsTruncated: false });

    const exports = await exportRepository.listExports(USER_ID);

    expect(exports).toEqual([
      {
        export_id: `${ms}-abcdef12`,
        created_at: new Date(ms).toISOString(),
        size_bytes: 512,
      },
    ]);
  });

  it('returns newest first', async () => {
    const older = keyAt('2026-08-01T00:00:00.000Z', 'aaaaaaaa');
    const newer = keyAt('2026-08-02T00:00:00.000Z', 'bbbbbbbb');
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: older, Size: 1 },
        { Key: newer, Size: 2 },
      ],
      IsTruncated: false,
    });

    const exports = await exportRepository.listExports(USER_ID);

    expect(exports.map((e) => e.export_id)).toEqual([
      exports.find((e) => e.size_bytes === 2).export_id,
      exports.find((e) => e.size_bytes === 1).export_id,
    ]);
    expect(exports[0].size_bytes).toBe(2);
  });

  it('ignores keys that do not match the export key shape', async () => {
    const foreign = `${prefixFor(PREFIX, USER_ID)}latest.json`;
    const valid = keyAt('2026-08-02T00:00:00.000Z');
    s3Mock.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: foreign, Size: 1 },
        { Key: valid, Size: 2 },
      ],
      IsTruncated: false,
    });

    const exports = await exportRepository.listExports(USER_ID);

    expect(exports).toHaveLength(1);
  });
});

describe('exportRepository.presignDownload', () => {
  beforeEach(() => {
    s3Mock.reset();
    getSignedUrl.mockReset();
  });

  it('presigns a GetObject with the export key, response headers, and configured TTL', async () => {
    getSignedUrl.mockResolvedValue('https://s3.example.com/signed');

    const url = await exportRepository.presignDownload(USER_ID, '1234567890123-abcdef12', {
      filename: 'pulsemonitor-export-abcdef12.json',
      ttlSeconds: 300,
    });

    expect(url).toBe('https://s3.example.com/signed');
    const [, command, options] = getSignedUrl.mock.calls[0];
    expect(command.input.Bucket).toBe(BUCKET);
    expect(command.input.Key).toBe(`${prefixFor(PREFIX, USER_ID)}1234567890123-abcdef12.json`);
    expect(command.input.ResponseContentDisposition).toBe('attachment; filename="pulsemonitor-export-abcdef12.json"');
    expect(command.input.ResponseContentType).toBe('application/json');
    expect(options).toEqual({ expiresIn: 300 });
  });

  it('rejects a malformed export id before ever calling getSignedUrl', async () => {
    await expect(
      exportRepository.presignDownload(USER_ID, '../../other-user/x', { filename: 'x.json', ttlSeconds: 300 })
    ).rejects.toThrow();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
