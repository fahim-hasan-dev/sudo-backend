import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { StatusCodes } from 'http-status-codes';
import { StripeService } from './stripe.service';
import { JwtPayload } from 'jsonwebtoken';

// Controller to initialize Stripe Connect onboarding session
const createConnectedAccount = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await StripeService.createExpressConnectedAccount(user.authId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Stripe onboarding URL generated successfully',
    data: result,
  });
});

// Controller to check connected account onboarding status
const checkConnectedAccountStatus = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await StripeService.checkConnectedAccountStatus(user.authId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Stripe account status verified successfully',
    data: result,
  });
});

// Controller to retrieve Stripe dashboard login link
const createExpressDashboardLink = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as JwtPayload;
  const result = await StripeService.createExpressDashboardLink(user.authId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: 'Stripe Express dashboard login link generated successfully',
    data: result,
  });
});

// HTML deep-linking callback endpoint
const connectCallback = catchAsync(async (req: Request, res: Response) => {
  const status = req.query.status as string || 'success';
  
  res.setHeader('Content-Type', 'text/html');
  res.status(StatusCodes.OK).send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Stripe Connect Callback</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: #f7fafc;
            color: #2d3748;
            text-align: center;
            padding: 20px;
        }
        .container {
            max-width: 400px;
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }
        h1 {
            font-size: 24px;
            margin-bottom: 16px;
            color: #4c51bf;
        }
        p {
            font-size: 16px;
            color: #718096;
            margin-bottom: 24px;
            line-height: 1.5;
        }
        .btn {
            display: inline-block;
            background-color: #4c51bf;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            transition: background-color 0.2s;
        }
        .btn:hover {
            background-color: #434190;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Stripe Onboarding</h1>
        <p id="msg">Processing your registration. You will be redirected back to the app shortly...</p>
        <a id="btn" class="btn" href="#">Return to App</a>
    </div>
    <script>
        const status = new URLSearchParams(window.location.search).get('status') || 'success';
        let deepLink = "sudoapp://stripe-callback?status=" + status;
        
        // Show status message
        const msgEl = document.getElementById('msg');
        const btnEl = document.getElementById('btn');
        
        if (status === 'success') {
            msgEl.innerText = "Stripe onboarding complete! You can now return to the app.";
        } else {
            msgEl.innerText = "Stripe onboarding was refreshed or canceled. Please return to the app.";
        }
        
        btnEl.href = deepLink;
        
        // Auto-redirect
        setTimeout(() => {
            window.location.href = deepLink;
        }, 1200);
    </script>
</body>
</html>
  `);
});

export const StripeController = {
  createConnectedAccount,
  checkConnectedAccountStatus,
  createExpressDashboardLink,
  connectCallback,
};
