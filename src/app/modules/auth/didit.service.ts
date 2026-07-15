import axios from 'axios';
import crypto from 'crypto';
import config from '../../../config';
import { logger } from '../../../shared/logger';

// Convert float whole numbers to integers for matching signatures
const normalizeFloatingNumbers = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(normalizeFloatingNumbers);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, itemValue]) => [key, normalizeFloatingNumbers(itemValue)])
    );
  }
  return typeof value === 'number' && value % 1 === 0 ? Math.floor(value) : value;
};

// Sort object keys alphabetically to ensure consistent hash string
const sortObjectKeysAlphabetically = (targetObject: any): any => {
  if (typeof targetObject !== 'object' || targetObject === null || Array.isArray(targetObject)) {
    return targetObject;
  }
  return Object.keys(targetObject)
    .sort()
    .reduce((sortedObject: Record<string, any>, currentKey: string) => {
      sortedObject[currentKey] = sortObjectKeysAlphabetically(targetObject[currentKey]);
      return sortedObject;
    }, {});
};

// Verify HMAC-SHA256 signature from Didit webhook
export const verifyWebhookSignature = (
  rawPayload: any,
  receivedSignature: string,
  sharedSecret: string
): boolean => {
  try {
    const canonicalJsonString = JSON.stringify(
      sortObjectKeysAlphabetically(normalizeFloatingNumbers(rawPayload))
    );

    const calculatedSignature = crypto
      .createHmac('sha256', sharedSecret)
      .update(canonicalJsonString, 'utf8')
      .digest('hex');

    const signatureBuffer = Buffer.from(receivedSignature, 'hex');
    const calculatedBuffer = Buffer.from(calculatedSignature, 'hex');

    if (signatureBuffer.length !== calculatedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, calculatedBuffer);
  } catch (error) {
    logger.error('[DiditKycService] Error occurred during signature verification:', error);
    return false;
  }
};

// Start a verification session (falls back to mock if API key is missing)
export const createVerificationSession = async (userId: string) => {
  const { apiKey, baseUrl, workflowId } = config.didit;
  const backendWebhookUrl = `${config.backend_url}/api/v1/auth/didit-webhook`;

  if (!apiKey) {
    logger.warn('[DiditKycService] DIDIT_API_KEY is not configured. Running in simulation mode.');

    const mockSessionId = `didit_session_${Math.random().toString(36).substring(2, 11)}`;
    const mockVerificationUrl = `https://sandbox.didit.me/verify?session=${mockSessionId}&callback=${encodeURIComponent(backendWebhookUrl)}`;

    return {
      success: true,
      sessionId: mockSessionId,
      url: mockVerificationUrl,
      isMock: true,
    };
  }

  try {
    const response = await axios.post(
      `${baseUrl}/session/`,
      {
        workflow_id: workflowId || 'default-workflow-id',
        vendor_data: userId,
        callback: backendWebhookUrl,
      },
      {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      sessionId: response.data.session_id || response.data.id,
      url: response.data.session_url || response.data.url,
      isMock: false,
    };
  } catch (error) {
    logger.error('[DiditKycService] Failed to create verification session:', error);
    throw error;
  }
};

// Retrieve verification details from Didit
export const retrieveSessionResults = async (sessionId: string) => {
  const { apiKey, baseUrl } = config.didit;

  if (!apiKey || sessionId.startsWith('didit_session_')) {
    return {
      success: true,
      session_id: sessionId,
      status: 'Approved',
      isMock: true,
    };
  }

  try {
    const response = await axios.get(`${baseUrl}/session/${sessionId}/decision/`, {
      headers: {
        'x-api-key': apiKey,
      },
    });

    return response.data;
  } catch (error) {
    logger.error('[DiditKycService] Failed to retrieve session results:', error);
    throw error;
  }
};

export const DiditKycService = {
  verifyWebhookSignature,
  createVerificationSession,
  retrieveSessionResults,
};
