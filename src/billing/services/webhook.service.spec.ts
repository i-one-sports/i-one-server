import { Types } from 'mongoose';
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
  let service: WebhookService;
  let paystackService: { validateWebhookSignature: jest.Mock; parseWebhookEvent: jest.Mock };
  let sessionPaymentService: { confirmSessionPayment: jest.Mock };
  let webhookEventRepository: { create: jest.Mock; findOneAndUpdate: jest.Mock; findRaw: jest.Mock };
  let rawFindOneAndUpdate: jest.Mock;

  const sessionId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const body = {
    event: 'charge.success',
    data: { reference: 'REF_1', amount: 210000, metadata: { sessionId, userId } },
  };
  const duplicateKey = Object.assign(new Error('E11000'), { code: 11000 });

  beforeEach(() => {
    paystackService = {
      validateWebhookSignature: jest.fn().mockReturnValue(true),
      parseWebhookEvent: jest.fn((b: any) => b),
    };
    sessionPaymentService = { confirmSessionPayment: jest.fn().mockResolvedValue({ status: 'PAID' }) };
    rawFindOneAndUpdate = jest.fn();
    webhookEventRepository = {
      create: jest.fn().mockResolvedValue({}),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      findRaw: jest.fn().mockReturnValue({ findOneAndUpdate: rawFindOneAndUpdate }),
    };

    service = new WebhookService(
      paystackService as any,
      {} as any,
      sessionPaymentService as any,
      {} as any,
      webhookEventRepository as any,
      {} as any,
      {} as any,
    );
  });

  it('records the event once and processes it', async () => {
    await expect(service.handleWebhook('sig', body, 'raw')).resolves.toEqual({ status: 'success' });

    expect(webhookEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'REF_1', processed: false, attempts: 1 }),
    );
    expect(sessionPaymentService.confirmSessionPayment).toHaveBeenCalledTimes(1);
    expect(webhookEventRepository.findOneAndUpdate).toHaveBeenCalledWith(
      { eventId: 'REF_1' },
      expect.objectContaining({ processed: true }),
    );
  });

  it('returns duplicate without reprocessing when the reference was already handled', async () => {
    webhookEventRepository.create.mockRejectedValue(duplicateKey);
    rawFindOneAndUpdate.mockResolvedValue(null); // processed, or still in-flight

    await expect(service.handleWebhook('sig', body, 'raw')).resolves.toEqual({ status: 'duplicate' });
    expect(sessionPaymentService.confirmSessionPayment).not.toHaveBeenCalled();
  });

  it('reprocesses a redelivery whose earlier attempt never finished', async () => {
    webhookEventRepository.create.mockRejectedValue(duplicateKey);
    rawFindOneAndUpdate.mockResolvedValue({ eventId: 'REF_1', attempts: 2 });

    await expect(service.handleWebhook('sig', body, 'raw')).resolves.toEqual({ status: 'success' });

    const [filter, update] = rawFindOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ eventId: 'REF_1', processed: false });
    expect(update).toEqual({ $set: { processingStartedAt: expect.any(Date) }, $inc: { attempts: 1 } });
    expect(sessionPaymentService.confirmSessionPayment).toHaveBeenCalledTimes(1);
  });

  it('surfaces a processing failure so Paystack redelivers, leaving the event unprocessed', async () => {
    sessionPaymentService.confirmSessionPayment.mockRejectedValue(new Error('wallet lookup failed'));

    await expect(service.handleWebhook('sig', body, 'raw')).rejects.toThrow('wallet lookup failed');
    expect(webhookEventRepository.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
