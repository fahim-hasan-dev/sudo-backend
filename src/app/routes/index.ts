import express from 'express';
import handleStripeWebhook from '../../stripe/handleStripeWebhook';
import { UserRoutes } from '../modules/user/user.route';
import { AuthRoutes } from '../modules/auth/auth.route';
import { StripeRoutes } from '../modules/stripe/stripe.route';
import { GroupRoutes } from '../modules/group/group.route';
import { ContributionRoutes } from '../modules/contribution/contribution.route';
import { GroupMessageRoutes } from '../modules/group-message/group-message.route';
import { CategoryRoutes } from '../modules/category/category.route';
import { ReviewRoutes } from '../modules/review/review.route';
import { PaymentRoutes } from '../modules/payment/payment.route';
import { PublicRoutes } from '../modules/public/public.route';
import { TokenRoutes } from '../modules/token/token.route';
import { PlanRoutes } from '../modules/plan/plan.route';
import { SubscriptionRoutes } from '../modules/subscription/subscription.route';
import { NotificationRoutes } from '../modules/notification/notification.routes';


const router = express.Router();

const apiRoutes = [
    { path: "/user", route: UserRoutes },
    { path: "/auth", route: AuthRoutes },
    { path: "/stripe", route: StripeRoutes },
    { path: "/group", route: GroupRoutes },
    { path: "/contribution", route: ContributionRoutes },
    { path: "/group-message", route: GroupMessageRoutes },
    { path: "/category", route: CategoryRoutes },
    { path: "/review", route: ReviewRoutes },
    { path: "/payment", route: PaymentRoutes },
    { path: "/public", route: PublicRoutes },
    { path: "/token", route: TokenRoutes },
    { path: "/plan", route: PlanRoutes },
    { path: "/subscription", route: SubscriptionRoutes },
    { path: "/notification", route: NotificationRoutes },
]

router.post('/webhook', handleStripeWebhook);

apiRoutes.forEach(route => router.use(route.path, route.route));
export default router;
