import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { UploadType } from '@app/common';
import { AwsService } from './aws.service';

describe('AwsService.deleteByUrl', () => {
  const BASE = 'https://cdn.i-one.example';
  const config = { get: (key: string) => ({ AWS_S3_BASE_URL: BASE, AWS_S3_BUCKET: 'i-one', AWS_REGION: 'eu-west-2' })[key] };
  let service: AwsService;
  let send: jest.SpyInstance;

  beforeEach(() => {
    service = new AwsService(config as unknown as ConfigService);
    send = jest.spyOn(service.s3, 'send').mockImplementation(() => Promise.resolve({}));
  });

  it('deletes an avatar it uploaded', async () => {
    await expect(service.deleteByUrl(`${BASE}/users/171/abc.png`, [UploadType.USER_AVATAR])).resolves.toBe(true);
    const command = send.mock.calls[0][0] as DeleteObjectCommand;
    expect(command.input).toEqual({ Bucket: 'i-one', Key: 'users/171/abc.png' });
  });

  it.each([
    ['no url', null],
    ['someone else’s host', 'https://evil.example/users/1/a.png'],
    ['another kind of upload (KYC document)', `${BASE}/documents_front/1/id.png`],
    ['path tricks', `${BASE}/users/../documents_front/1/id.png`],
  ])('leaves %s alone', async (_label, url) => {
    await expect(service.deleteByUrl(url, [UploadType.USER_AVATAR, UploadType.AVATAR])).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns false instead of throwing when S3 fails', async () => {
    send.mockImplementation(() => Promise.reject(new Error('S3 down')));
    await expect(service.deleteByUrl(`${BASE}/users/1/a.png`, [UploadType.USER_AVATAR])).resolves.toBe(false);
  });
});
