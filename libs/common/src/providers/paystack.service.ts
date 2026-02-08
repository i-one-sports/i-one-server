import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: 'success' | 'failed' | 'abandoned';
    reference: string;
    amount: number;
    message: string | null;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    customer: {
      id: number;
      email: string;
      customer_code: string;
    };
  };
}

@Injectable()
export class PaystackService {
  private readonly axiosInstance: AxiosInstance;
  private readonly secretKey: string;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('PAYSTACK_SECRET_KEY');
    this.secretKey = secretKey!;


    if (!secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is not defined');
    }

    // Create axios instance with base config
    this.axiosInstance = axios.create({
      baseURL: 'https://api.paystack.co',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Initialize a payment transaction
   */
  async initializeTransaction(
    email: string,
    amount: number,
    reference: string,
    metadata?: Record<string, any>
  ): Promise<PaystackInitializeResponse> {
    try {
      const callbackUrl = this.configService.get<string>('PAYSTACK_CALLBACK_URL');

      const response = await this.axiosInstance.post<PaystackInitializeResponse>(
        '/transaction/initialize',
        {
          email,
          amount,
          reference,
          callback_url: callbackUrl,
          metadata: {
            ...metadata,
            custom_fields: [
              {
                display_name: 'Transaction Type',
                variable_name: 'transaction_type',
                value: 'wallet_deposit'
              }
            ]
          }
        }
      );

      if (!response.data.status) {
        throw new BadRequestException(response.data.message || 'Failed to initialize payment');
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new BadRequestException(
          error.response?.data?.message || 'Unable to initialize payment'
        );
      }
      throw new InternalServerErrorException('Payment initialization failed');
    }
  }

  /**
   * Verify a transaction by reference
   */
  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    try {
      const response = await this.axiosInstance.get<PaystackVerifyResponse>(
        `/transaction/verify/${reference}`
      );

      if (!response.data.status) {
        throw new BadRequestException(response.data.message || 'Verification failed');
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new BadRequestException(
          error.response?.data?.message || 'Unable to verify transaction'
        );
      }
      throw new InternalServerErrorException('Transaction verification failed');
    }
  }

  /**
   * Validate Paystack webhook signature
   */
  validateWebhookSignature(signature: string, body: string): boolean {
    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY is not configured');
    }

    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(body)
      .digest('hex');

    return hash === signature;
  }
}