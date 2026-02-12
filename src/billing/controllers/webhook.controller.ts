import { Controller, Post, Headers, Body, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from '../services/webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('paystack')
  async paystackWebhook(
    @Headers('x-paystack-signature') signature: string,
    @Body() body: any,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body);

    return await this.webhookService.handleWebhook(signature, body, rawBody);
  }
}
