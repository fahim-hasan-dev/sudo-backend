import stripe from '../../../config/stripe';
import { User } from '../user/user.model';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';

// Create or retrieve onboarding link for Stripe Express account
const createExpressConnectedAccount = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  let stripeAccountId = user.stripeAccountId;

  // Create Stripe account if user doesn't have one
  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    stripeAccountId = account.id;

    // Save Stripe account ID in user document
    await User.findByIdAndUpdate(userId, { stripeAccountId });
  }

  // Generate the onboarding link
  const returnUrl = `${config.backend_url || 'http://localhost:5002'}/api/v1/stripe/connect-callback?status=success`;
  const refreshUrl = `${config.backend_url || 'http://localhost:5002'}/api/v1/stripe/connect-callback?status=refresh`;

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return { url: accountLink.url };
};

// Check connected account details and update status in database
const checkConnectedAccountStatus = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  if (!user.stripeAccountId) {
    return {
      stripeAccountId: '',
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      stripeConnected: false,
    };
  }

  const account = await stripe.accounts.retrieve(user.stripeAccountId);

  // Mark connected true if onboarding is complete and payments are active
  const isSetupComplete = account.details_submitted && account.charges_enabled;

  if (isSetupComplete && !user.stripeConnected) {
    await User.findByIdAndUpdate(userId, { stripeConnected: true });
  }

  return {
    stripeAccountId: user.stripeAccountId,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    stripeConnected: isSetupComplete,
  };
};

// Generate login link for Stripe Express dashboard access
const createExpressDashboardLink = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  if (!user.stripeAccountId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'No Stripe account registered for this user');
  }

  const loginLink = await stripe.accounts.createLoginLink(user.stripeAccountId);

  return { url: loginLink.url };
};

export const StripeService = {
  createExpressConnectedAccount,
  checkConnectedAccountStatus,
  createExpressDashboardLink,
};
