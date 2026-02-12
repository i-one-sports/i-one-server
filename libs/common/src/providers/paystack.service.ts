import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly axios: AxiosInstance;
  private readonly baseUrl: string;

  constructor() {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const baseUrl = process.env.PAYSTACK_BASE_URL;

    if (!secret) {
      throw new Error('PAYSTACK_SECRET_KEY is not set');
    }

    if (!baseUrl) {
      throw new Error('PAYSTACK_BASE_URL is not set');
    }

    this.baseUrl = baseUrl;

    this.axios = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    this.logger.log('Paystack service initialized');
  }

  async fetchAllBanks(country = 'Nigeria') {
    try {
      const { data } = await this.axios.get('/bank', {
        params: { country },
      });

      // Paystack returns { status, message, data: [banks...] }
      if (data && Array.isArray(data.data)) {
        this.logger.log(`Fetched ${data.data.length} banks from Paystack`);
        return data.data;
      }

      if (Array.isArray(data)) {
        this.logger.log(`Fetched ${data.length} banks from Paystack (array response)`);
        return data;
      }

      this.logger.warn('Unexpected Paystack banks response shape', JSON.stringify(data));
      return [];
    } catch (error: any) {
      this.logger.error(
        'Failed fetching banks from Paystack',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  
 async resolveAccount(
  accountNumber: string,
  bankCode: string,
) {
  try {
    const { data } = await this.axios.get('/bank/resolve', {
      params: {
        account_number: accountNumber,
        bank_code: bankCode,
      },
    });

    return data;
  } catch (error: any) {
    this.logger.error(
      'Failed to resolve bank account',
      error?.response?.data || error?.message,
    );
    throw error;
  }
}

  // ==================== DVA METHODS ====================

  async createCustomer(
    email: string,
    firstName: string,
    lastName: string,
    phone?: string,
  ) {
    try {
      const { data } = await this.axios.post('/customer', {
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
      });

      this.logger.log(`Created Paystack customer: ${data.data.customer_code}`);
      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to create Paystack customer',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  async createDedicatedVirtualAccount(
    customerCode: string,
    preferredBank: string = 'wema-bank',
  ) {
    try {
      const { data } = await this.axios.post('/dedicated_account', {
        customer: customerCode,
        preferred_bank: preferredBank,
      });

      this.logger.log(
        `Created DVA for customer ${customerCode}: ${data.data.account_number}`,
      );
      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to create DVA',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  async getDedicatedAccount(customerCode: string) {
    try {
      const { data } = await this.axios.get('/dedicated_account', {
        params: { customer: customerCode },
      });

      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to fetch DVA',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // ==================== TRANSACTION METHODS ====================

  async initializeTransaction(
    email: string,
    amount: number,
    reference: string,
    metadata?: Record<string, any>,
  ) {
    try {
      const { data } = await this.axios.post('/transaction/initialize', {
        email,
        amount: amount * 100,
        reference,
        metadata,
        channels: ['bank_transfer'],
      });

      this.logger.log(`Initialized transaction: ${reference}`);
      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to initialize transaction',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  async verifyTransaction(reference: string) {
    try {
      const { data } = await this.axios.get(`/transaction/verify/${reference}`);

      this.logger.log(
        `Verified transaction: ${reference} - Status: ${data.data.status}`,
      );
      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to verify transaction',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // ==================== TRANSFER METHODS ====================

  async createTransferRecipient(
    type: 'nuban',
    name: string,
    accountNumber: string,
    bankCode: string,
    currency: string = 'NGN',
  ) {
    try {
      const { data } = await this.axios.post('/transferrecipient', {
        type,
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency,
      });

      this.logger.log(`Created transfer recipient: ${data.data.recipient_code}`);
      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to create transfer recipient',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  async initiateTransfer(
    amount: number,
    recipientCode: string,
    reference: string,
    reason?: string,
  ) {
    try {
      const { data } = await this.axios.post('/transfer', {
        source: 'balance',
        amount: amount * 100,
        recipient: recipientCode,
        reference,
        reason: reason || 'Withdrawal',
      });

      this.logger.log(`Initiated transfer: ${reference}`);
      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to initiate transfer',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  async finalizeTransfer(transferCode: string) {
    try {
      const { data } = await this.axios.post('/transfer/finalize_transfer', {
        transfer_code: transferCode,
      });

      this.logger.log(`Finalized transfer: ${transferCode}`);
      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to finalize transfer',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  async listTransfers(page: number = 1, perPage: number = 50) {
    try {
      const { data } = await this.axios.get('/transfer', {
        params: { page, perPage },
      });

      return data.data;
    } catch (error: any) {
      this.logger.error(
        'Failed to list transfers',
        error?.response?.data || error?.message,
      );
      throw error;
    }
  }

  // ==================== WEBHOOK METHODS ====================

  validateWebhookSignature(signature: string, body: string): boolean {
    const crypto = require('crypto');
    const secret = process.env.PAYSTACK_SECRET_KEY;

    const hash = crypto.createHmac('sha512', secret).update(body).digest('hex');

    return hash === signature;
  }

  parseWebhookEvent(body: any): {
    event: string;
    data: any;
  } {
    return {
      event: body.event,
      data: body.data,
    };
  }

}
