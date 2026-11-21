import { Injectable, Logger } from '@nestjs/common'
import { DeleteObjectCommand, PutObjectCommand, S3 } from '@aws-sdk/client-s3'
import { RandomGen, UploadType } from '@app/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class AwsService {
  private readonly logger = new Logger(AwsService.name)
  protected readonly AWS_S3_BUCKET: string
  public s3: S3

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get('AWS_S3_ENDPOINT')
    this.AWS_S3_BUCKET = this.configService.get('AWS_S3_BUCKET') || 'i-one'
    
    this.s3 = new S3({
      endpoint,
      forcePathStyle: true,
      region: this.configService.get('AWS_REGION')
    })
  }

  async upload(
    file: Express.Multer.File, 
    type: UploadType,
    identifier?: string
  ): Promise<string | undefined> {
    const timestamp = Date.now()
    const randomString = RandomGen.genRandomString(100, 8)
    const extension = file.mimetype.split('/')[1]
    
    const Key = `${type}/${identifier || timestamp}/${randomString}.${extension}`

    const command = new PutObjectCommand({
      Key,
      Bucket: this.AWS_S3_BUCKET,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentDisposition: 'inline',
    })

    const baseUrl = this.configService.get('AWS_S3_BASE_URL')
    const url = `${baseUrl}/${Key}`

    try {
      await this.s3.send(command)
      return url
    } catch (error) {
      this.logger.error({
        message: `Failed to upload ${type} to S3`,
        error,
        key: Key
      })
      return undefined
    }
  }

  // Deletes a file this service uploaded, given its public URL. Only acts on
  // URLs under our own AWS_S3_BASE_URL and inside one of `allowedTypes`'
  // folders, so a URL from elsewhere (or another kind of upload) is never
  // touched. Never throws: returns false when nothing was deleted.
  async deleteByUrl(url: string | null | undefined, allowedTypes: UploadType[]): Promise<boolean> {
    const baseUrl = this.configService.get<string>('AWS_S3_BASE_URL')
    if (!url || !baseUrl || !url.startsWith(`${baseUrl}/`)) return false

    const Key = decodeURIComponent(url.slice(baseUrl.length + 1).split('?')[0])
    if (Key.includes('..') || !allowedTypes.some((type) => Key.startsWith(`${type}/`))) return false

    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.AWS_S3_BUCKET, Key }))
      return true
    } catch (error) {
      this.logger.error({ message: 'Failed to delete file from S3', error, key: Key })
      return false
    }
  }
}
