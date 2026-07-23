import { Group } from './group.model';
import { Contribution } from '../contribution/contribution.model';
import { User } from '../user/user.model';
import { SettingsService } from '../settings/settings.service';
import { NotificationService } from '../notification/notification.service';
import QueryBuilder from '../../builder/QueryBuilder';
import stripe from '../../../config/stripe';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { IGroup } from './group.interface';

// Get current active period number
const getCurrentPeriodNumber = (group: IGroup): number => {
  const now = new Date();
  const start = new Date(group.startDate);
  if (now <= start) return 1;

  const totalMembers = group.members.length;
  const maxPeriod = group.totalCycles * totalMembers;

  let elapsedPeriods = 0;
  if (group.paymentFrequency === 'weekly') {
    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    elapsedPeriods = Math.floor(diffDays / 7);
  } else {
    const yearDiff = now.getFullYear() - start.getFullYear();
    const monthDiff = now.getMonth() - start.getMonth() + (yearDiff * 12);
    if (group.paymentFrequency === 'monthly') {
      elapsedPeriods = monthDiff;
    } else if (group.paymentFrequency === 'quarterly') {
      const interval = group.quarterlyIntervalMonths || 3;
      elapsedPeriods = Math.floor(monthDiff / interval);
    }
  }

  const period = elapsedPeriods + 1;
  return period > maxPeriod ? maxPeriod : period;
};

// Calculate group expected and completed amounts + progress percentage
const calculateGroupStats = async (group: any) => {
  const membersCountForCalculation = (group.status === 'pending' || !group.members) ? group.targetedMembers : group.members.length;
  const totalPeriods = (group.rotationSchedule ? group.rotationSchedule.length : 0) || (group.totalCycles * membersCountForCalculation);
  
  // 1. Calculate targetedTotalPullAmount (for the whole group from start to finish)
  const targetedTotalPullAmount = group.targetPoolAmount * totalPeriods;

  // 2. Calculate totalCollectedAmount (up to current period)
  let totalCollectedAmount = 0;
  let currentPeriod = 0;

  if (group.status === 'active' && group.rotationSchedule && group.rotationSchedule.length > 0) {
    currentPeriod = getCurrentPeriodNumber(group);
  } else if (group.status === 'completed') {
    currentPeriod = totalPeriods;
  }

  if (currentPeriod > 0) {
    // Find all paid contributions in this group up to the current period
    const paidContributionsCount = await Contribution.countDocuments({
      groupId: group._id,
      periodNumber: { $lte: currentPeriod },
      status: 'paid',
    });

    totalCollectedAmount = paidContributionsCount * group.contributionAmount;
  }

  // 3. Calculate progress percentage
  const progress = targetedTotalPullAmount > 0 ? Math.round((totalCollectedAmount / targetedTotalPullAmount) * 100) : 0;

  return {
    targetedTotalPullAmount,
    totalCollectedAmount,
    progress,
    currentPeriod,
  };
};

// Create new savings group
const createGroup = async (userId: string, groupData: Partial<IGroup>) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  if (!groupData.targetPoolAmount || !groupData.contributionAmount) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Pool amount and contribution are required.');
  }

  // Check division remainder
  if (groupData.targetPoolAmount % groupData.contributionAmount !== 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Pool amount must be divisible by contribution.'
    );
  }

  const targetedMembers = (groupData.targetPoolAmount / groupData.contributionAmount) + 1;

  if (targetedMembers < 2) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'At least 2 members are required to form a group.'
    );
  }

  const newGroup = await Group.create({
    ...groupData,
    targetedMembers,
    admin: userId,
    members: [userId],
    status: 'pending',
  });

  return newGroup;
};

// Join a public group
const joinGroup = async (userId: string, groupId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Private groups are invitation-only
  if (group.visibility === 'private') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'This group is private. Invitation required.');
  }

  if (group.status !== 'pending') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot join once the rotation starts.');
  }

  // Avoid duplicate membership
  const isMemberAlready = group.members.some((memberId) => String(memberId) === userId);
  if (isMemberAlready) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You are already in this group.');
  }

  // Check slots availability
  const expectedMembers = group.targetedMembers;
  if (group.members.length >= expectedMembers) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'This group is already full.');
  }

  const updatedGroup = await Group.findByIdAndUpdate(
    groupId,
    {
      $push: { members: userId },
    },
    { new: true }
  );

  return updatedGroup;
};

// Start or resume rotation
const startGroupRotation = async (userId: string, role: string, groupId: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Check permissions
  if (String(group.admin) !== userId && role !== 'admin') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Only the group creator or admin can do this.');
  }

  // Resume paused group
  if (group.status === 'paused') {
    const now = new Date();
    let shiftCount = 0;

    // Shift future payout dates from today
    const updatedSchedule = group.rotationSchedule.map((period) => {
      if (period.status === 'pending') {
        const newPayoutDate = new Date(now);
        if (group.paymentFrequency === 'weekly') {
          newPayoutDate.setDate(now.getDate() + shiftCount * 7);
        } else if (group.paymentFrequency === 'monthly') {
          newPayoutDate.setMonth(now.getMonth() + shiftCount);
        } else if (group.paymentFrequency === 'quarterly') {
          const interval = group.quarterlyIntervalMonths || 3;
          newPayoutDate.setMonth(now.getMonth() + shiftCount * interval);
        }
        shiftCount++;
        return {
          periodNumber: period.periodNumber,
          cycleNumber: period.cycleNumber,
          receiverId: period.receiverId,
          payoutDate: newPayoutDate,
          status: period.status,
        };
      }
      return period;
    });

    const resumedGroup = await Group.findByIdAndUpdate(
      groupId,
      {
        $set: {
          status: 'active',
          rotationSchedule: updatedSchedule,
        },
      },
      { new: true }
    );
    return resumedGroup;
  }

  if (group.status !== 'pending') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Rotation has already started.');
  }

  // Check group is full
  const expectedMembers = group.targetedMembers;
  if (group.members.length < expectedMembers) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Cannot start rotation. Group is not full yet.'
    );
  }

  const totalMembers = group.members.length;
  if (totalMembers < 2) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'At least 2 members are required to start.');
  }

  const schedule = [];
  const totalPeriods = group.totalCycles * totalMembers;
  const actualStartTime = new Date();

  // Create schedule items
  for (let period = 1; period <= totalPeriods; period++) {
    const cycle = Math.ceil(period / totalMembers);
    const receiverIndex = (period - 1) % totalMembers;
    const receiverId = group.members[receiverIndex];

    const payoutDate = new Date(actualStartTime);
    if (group.paymentFrequency === 'weekly') {
      payoutDate.setDate(payoutDate.getDate() + (period - 1) * 7);
    } else if (group.paymentFrequency === 'monthly') {
      payoutDate.setMonth(payoutDate.getMonth() + (period - 1));
    } else if (group.paymentFrequency === 'quarterly') {
      const interval = group.quarterlyIntervalMonths || 3;
      payoutDate.setMonth(payoutDate.getMonth() + (period - 1) * interval);
    }

    schedule.push({
      periodNumber: period,
      cycleNumber: cycle,
      receiverId,
      payoutDate,
      status: 'pending',
    });
  }

  const activatedGroup = await Group.findByIdAndUpdate(
    groupId,
    {
      $set: {
        status: 'active',
        startDate: actualStartTime,
        rotationSchedule: schedule,
      },
    },
    { new: true }
  );

  return activatedGroup;
};

// Pause group
const pauseGroup = async (userId: string, role: string, groupId: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Check permissions
  if (String(group.admin) !== userId && role !== 'admin') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Only the group creator or admin can do this.');
  }

  if (group.status !== 'active') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Only active groups can be paused.');
  }

  // Find current active period
  const currentPeriodNum = getCurrentPeriodNumber(group);
  const currentPeriodItem = group.rotationSchedule.find(
    (p) => p.periodNumber === currentPeriodNum
  );

  // Payments must be completed first
  if (!currentPeriodItem || currentPeriodItem.status !== 'completed') {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Cannot pause mid-cycle. All payments must be completed first.'
    );
  }

  const pausedGroup = await Group.findByIdAndUpdate(
    groupId,
    {
      $set: { status: 'paused' },
    },
    { new: true }
  );

  return pausedGroup;
};

// Initialize contribution checkout
const payContribution = async (userId: string, groupId: string, periodNumberQuery?: number) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  if (group.status !== 'active') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Group is not active');
  }

  // Check membership
  const isMember = group.members.some((memberId) => String(memberId) === userId);
  if (!isMember) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You are not a member of this group');
  }

  const currentPeriod = getCurrentPeriodNumber(group);
  const targetPeriod = periodNumberQuery !== undefined ? Number(periodNumberQuery) : currentPeriod;

  if (isNaN(targetPeriod)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid period number.');
  }

  const totalPeriods = group.totalCycles * group.members.length;
  if (targetPeriod < 1 || targetPeriod > totalPeriods) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid period number.');
  }

  if (targetPeriod > currentPeriod) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot pay for future periods in advance.');
  }

  const targetScheduleItem = group.rotationSchedule.find(
    (item) => item.periodNumber === targetPeriod
  );

  if (!targetScheduleItem) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Period schedule not found');
  }

  const receiverId = targetScheduleItem.receiverId;

  // Receiver doesn't pay in their slot
  if (String(receiverId) === userId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You are the receiver for this period. No payment needed.');
  }

  const receiverUser = await User.findById(receiverId);
  if (!receiverUser || !receiverUser.stripeAccountId || !receiverUser.stripeConnected) {
    if (receiverUser) {
      await NotificationService.insertNotification({
        title: 'Action Required: Set Up Stripe Connect',
        message: `Members are trying to pay contributions for group "${group.name}". Please complete your Stripe Connect setup to receive payouts.`,
        receiver: receiverUser._id,
        type: 'USER',
        screen: 'STRIPE_SETUP',
      });
    }
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Receiver has not set up their payment account yet.'
    );
  }

  // Check duplicate contributions
  const existingContribution = await Contribution.findOne({
    groupId,
    periodNumber: targetPeriod,
    senderId: userId,
    status: 'paid',
  });

  if (existingContribution) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You already paid for this period');
  }

  // Fetch platform settings
  const settings = await SettingsService.getSettings();
  const commissionPercentage = settings.platformCommission / 100;

  const commissionAmount = Math.round(group.contributionAmount * commissionPercentage);
  const transferAmount = group.contributionAmount - commissionAmount;

  // Fetch logged in user to get their email
  const loggedInUser = await User.findById(userId);
  if (!loggedInUser) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // Find or create stripe customer to lock email in checkout
  let stripeCustomerId: string;
  const existingCustomers = await stripe.customers.list({
    email: loggedInUser.email,
    limit: 1,
  });

  if (existingCustomers.data.length > 0) {
    stripeCustomerId = existingCustomers.data[0].id;
  } else {
    const newCustomer = await stripe.customers.create({
      email: loggedInUser.email,
      name: loggedInUser.fullName,
      metadata: {
        userId: String(loggedInUser._id),
      },
    });
    stripeCustomerId = newCustomer.id;
  }

  // Create stripe checkout session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${group.name} - Period ${targetPeriod} Contribution`,
          },
          unit_amount: group.contributionAmount * 100,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    payment_intent_data: {
      application_fee_amount: commissionAmount * 100,
      transfer_data: {
        destination: receiverUser.stripeAccountId,
      },
    },
    success_url: `${config.stripe.frontendUrl || 'http://localhost:3000'}/group/${groupId}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.stripe.frontendUrl || 'http://localhost:3000'}/group/${groupId}/cancel`,
    metadata: {
      groupId,
      periodNumber: String(targetPeriod),
      senderId: userId,
      receiverId: String(receiverId),
      commissionAmount: String(commissionAmount),
      transferAmount: String(transferAmount),
    },
  });

  // Log initial unpaid record
  await Contribution.create({
    groupId,
    periodNumber: targetPeriod,
    senderId: userId,
    receiverId,
    amount: group.contributionAmount,
    commissionAmount,
    transferAmount,
    stripeSessionId: session.id,
    status: 'unpaid',
  });

  return { url: session.url };
};

// Confirm webhook payment
const confirmContributionPayment = async (stripeSessionId: string, transactionId: string) => {
  const contribution = await Contribution.findOne({ stripeSessionId });
  if (!contribution) return;

  if (contribution.status === 'paid') return;

  await Contribution.findByIdAndUpdate(contribution._id, {
    $set: {
      status: 'paid',
      paymentDate: new Date(),
      transactionId,
    },
  });

  const group = await Group.findById(contribution.groupId);
  if (!group) return;

  // Count paid contributions
  const totalPaidPayers = await Contribution.countDocuments({
    groupId: group._id,
    periodNumber: contribution.periodNumber,
    status: 'paid',
  });

  const expectedPayers = group.members.length - 1;

  // Mark period complete if everyone paid
  if (totalPaidPayers >= expectedPayers) {
    await Group.updateOne(
      { _id: group._id, 'rotationSchedule.periodNumber': contribution.periodNumber },
      {
        $set: { 'rotationSchedule.$.status': 'completed' },
      }
    );

    const totalPeriods = group.totalCycles * group.members.length;

    // Mark group completed on last period
    if (contribution.periodNumber === totalPeriods) {
      await Group.findByIdAndUpdate(group._id, { $set: { status: 'completed' } });
    }
  }
};



// Get single group details
const getGroupDetails = async (groupId: string, userId: string, queryPeriod?: string) => {
  const group = await Group.findById(groupId)
    .populate('admin', 'fullName email image photo')
    .populate('members', 'fullName email image photo')
    .populate('rotationSchedule.receiverId', 'fullName email image photo');

  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  const totalPeriods = group.rotationSchedule.length;

  let currentPeriod = 0;
  let currentCycle = 1;
  let currentReceiver = null;
  let isCurrentReceiver = false;
  let hasPaidCurrentPeriod = false;

  // 1. Calculate the active/running period of the group
  let activePeriod = 0;
  if (group.status === 'active' && totalPeriods > 0) {
    activePeriod = getCurrentPeriodNumber(group);
  } else if (group.status === 'completed') {
    activePeriod = totalPeriods;
  }

  // 2. Validate and determine the targetPeriod to return stats for
  let targetPeriod = activePeriod; // Default to active/current period if no query is passed

  if (queryPeriod !== undefined) {
    const periodInt = Number(queryPeriod);
    if (!Number.isInteger(periodInt) || periodInt <= 0) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid period number. It must be a positive integer.');
    }

    if (periodInt > totalPeriods) {
      throw new ApiError(StatusCodes.BAD_REQUEST, `Invalid period number. Maximum allowed period is ${totalPeriods}.`);
    }

    targetPeriod = periodInt;
  }

  // Default calculations for the requested period
  let currentPeriodExpectedAmount = group.targetPoolAmount;
  let currentPeriodCollectedAmount = 0;
  let progress = 0;

  // Calculate stats for the requested period/rotation (targetPeriod)
  if (targetPeriod > 0) {
    const periodPaidCount = await Contribution.countDocuments({
      groupId,
      periodNumber: targetPeriod,
      status: 'paid',
    });
    currentPeriodExpectedAmount = group.targetPoolAmount;
    currentPeriodCollectedAmount = periodPaidCount * group.contributionAmount;
    progress = currentPeriodExpectedAmount > 0 
      ? Math.round((currentPeriodCollectedAmount / currentPeriodExpectedAmount) * 100) 
      : 0;
  }

  // Load receiver and other info for the active/current period
  if (group.status === 'active' && totalPeriods > 0 && activePeriod > 0) {
    currentPeriod = activePeriod;
    const currentScheduleItem = group.rotationSchedule.find(
      (p) => p.periodNumber === currentPeriod
    );
    if (currentScheduleItem) {
      currentCycle = currentScheduleItem.cycleNumber;

      // Get current receiver info
      currentReceiver = await User.findById(currentScheduleItem.receiverId).select('fullName email image photo');

      const receiverIdStr = String(currentScheduleItem.receiverId?._id || currentScheduleItem.receiverId);
      isCurrentReceiver = receiverIdStr === userId;

      // Check if user paid for active period
      hasPaidCurrentPeriod = !!(await Contribution.exists({
        groupId,
        periodNumber: currentPeriod,
        senderId: userId,
        status: 'paid',
      }));
    }
  } else if (group.status === 'completed') {
    currentPeriod = totalPeriods;
  }

  // Convert to plain object with rotationSchedule included
  const groupObj = group.toObject();

  return {
    group: groupObj,
    currentPeriod,
    currentCycle,
    currentReceiver,
    progress,
    currentPeriodExpectedAmount,
    currentPeriodCollectedAmount,
    isCurrentReceiver,
    hasPaidCurrentPeriod,
    totalPeriods,
  };
};

// Retrieve all discoverable groups
const getAllGroups = async (userId: string, role: string, query: Record<string, unknown>) => {
  const filter: Record<string, any> = {};
  if (role !== 'admin') {
    filter.visibility = 'public';
    filter.admin = { $ne: new Types.ObjectId(userId) };
    filter.members = { $ne: new Types.ObjectId(userId) };
  }

  const groupQuery = new QueryBuilder(
    Group.find(filter)
      .select('-rotationSchedule -members')
      .populate('admin', 'fullName email'),
    query
  )
    .filter()
    .sort()
    .paginate();

  const rawData = await groupQuery.modelQuery;
  const meta = await groupQuery.getPaginationInfo();

  const data = await Promise.all(
    rawData.map(async (group) => {
      const stats = await calculateGroupStats(group);
      const groupObj = group.toObject();
      return {
        ...groupObj,
        targetedTotalPullAmount: stats.targetedTotalPullAmount,
        totalCollectedAmount: stats.totalCollectedAmount,
        progress: stats.progress,
      };
    })
  );

  return { data, meta };
};

// Get groups authenticated user belongs to
const getUserGroups = async (userId: string) => {
  const groups = await Group.find({ members: new Types.ObjectId(userId) })
    .populate('admin', 'fullName email')
    .populate('members', 'fullName email');

  const result = await Promise.all(
    groups.map(async (group) => {
      const stats = await calculateGroupStats(group);
      const totalMembers = group.members.length;
      const totalPeriods = group.rotationSchedule.length;

      let nextDueDate: Date | null = null;
      let currentCycle = 1;

      if (group.status === 'active' && totalPeriods > 0) {
        const currentScheduleItem = group.rotationSchedule.find(
          (p) => p.periodNumber === stats.currentPeriod
        );
        if (currentScheduleItem) {
          nextDueDate = currentScheduleItem.payoutDate;
          currentCycle = currentScheduleItem.cycleNumber;
        }
      }

      return {
        _id: group._id,
        name: group.name,
        status: group.status,
        visibility: group.visibility,
        membersCount: totalMembers,
        progress: stats.progress,
        targetedTotalPullAmount: stats.targetedTotalPullAmount,
        totalCollectedAmount: stats.totalCollectedAmount,
        poolTotal: group.targetPoolAmount,
        myShare: group.contributionAmount,
        nextDue: nextDueDate,
        currentCycle,
        totalCycles: group.totalCycles,
        paymentFrequency: group.paymentFrequency,
        startDate: group.startDate,
      };
    })
  );

  return result;
};

// Leave/exit group
const leaveGroup = async (userId: string, groupId: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Only allowed to leave if the group status is pending
  if (group.status !== 'pending') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot leave once the rotation starts.');
  }

  const isMember = group.members.some((memberId) => String(memberId) === userId);
  if (!isMember) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You are not in this group.');
  }

  // Handle admin exit
  if (String(group.admin) === userId) {
    // Delete group if only member
    if (group.members.length <= 1) {
      await Group.findByIdAndDelete(groupId);
      return { deleted: true };
    } else {
      // Shift admin responsibility to next member
      const remainingMembers = group.members.filter((memberId) => String(memberId) !== userId);
      const newAdmin = remainingMembers[0];

      const updatedGroup = await Group.findByIdAndUpdate(
        groupId,
        {
          $pull: { members: new Types.ObjectId(userId) },
          $set: { admin: newAdmin },
        },
        { new: true }
      );
      return updatedGroup;
    }
  }

  const updatedGroup = await Group.findByIdAndUpdate(
    groupId,
    {
      $pull: { members: new Types.ObjectId(userId) },
    },
    { new: true }
  );

  return updatedGroup;
};

// Update group configuration
const updateGroup = async (userId: string, role: string, groupId: string, updateData: Partial<IGroup>) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Only Group Admin or system Admin can perform this action
  if (String(group.admin) !== userId && role !== 'admin') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Only the group creator or admin can do this.');
  }

  // Editing locked after start
  if (group.status !== 'pending') {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Cannot edit details after the rotation has started.'
    );
  }

  // Allow only configuration fields
  const allowedUpdates = [
    'name',
    'contributionAmount',
    'targetPoolAmount',
    'paymentFrequency',
    'quarterlyIntervalMonths',
    'startDate',
    'visibility',
  ];

  const filteredUpdates: Record<string, any> = {};
  for (const key of allowedUpdates) {
    if (updateData[key as keyof IGroup] !== undefined) {
      filteredUpdates[key] = updateData[key as keyof IGroup];
    }
  }

  const contributionAmount = updateData.contributionAmount !== undefined ? updateData.contributionAmount : group.contributionAmount;
  const targetPoolAmount = updateData.targetPoolAmount !== undefined ? updateData.targetPoolAmount : group.targetPoolAmount;

  if (updateData.contributionAmount !== undefined || updateData.targetPoolAmount !== undefined) {
    if (targetPoolAmount % contributionAmount !== 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Pool amount must be divisible by contribution.'
      );
    }
    const targetedMembers = (targetPoolAmount / contributionAmount) + 1;
    if (targetedMembers < 2) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'At least 2 members are required to form a group.'
      );
    }
    filteredUpdates.targetedMembers = targetedMembers;
  }

  const updatedGroup = await Group.findByIdAndUpdate(
    groupId,
    { $set: filteredUpdates },
    { new: true }
  ).populate('admin', 'fullName email').populate('members', 'fullName email');

  return updatedGroup;
};

// Retrieve payment history and member statuses
const getGroupPeriodHistory = async (groupId: string, periodNumberQuery?: number) => {
  const group = await Group.findById(groupId).populate('members', 'fullName email image');
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Resolve target period
  let periodNumber = periodNumberQuery !== undefined ? Number(periodNumberQuery) : undefined;
  if (periodNumber !== undefined && isNaN(periodNumber)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid period number.');
  }

  if (!periodNumber) {
    periodNumber = group.status === 'active' ? getCurrentPeriodNumber(group) : 1;
  }

  // Find schedule item
  const scheduleItem = group.rotationSchedule.find(
    (p) => p.periodNumber === periodNumber
  );

  if (!scheduleItem) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Period schedule not found');
  }

  const receiverId = scheduleItem.receiverId;
  const cycleNumber = scheduleItem.cycleNumber;

  // Find paid contributions in period
  const contributions = await Contribution.find({
    groupId,
    periodNumber,
    status: 'paid',
  });

  const memberStatuses = group.members.map((member: any) => {
    const isReceiver = String(member._id) === String(receiverId);

    // Match member contribution
    const contribution = contributions.find(
      (c) => String(c.senderId) === String(member._id)
    );

    let status: 'paid' | 'pending' | 'receiver' = 'pending';
    if (isReceiver) {
      status = 'receiver';
    } else if (contribution) {
      status = 'paid';
    }

    return {
      member: {
        _id: member._id,
        fullName: member.fullName,
        email: member.email,
        image: member.image,
      },
      status,
      amount: group.contributionAmount,
      paymentDate: contribution?.paymentDate || null,
      transactionId: contribution?.transactionId || null,
    };
  });

  return {
    groupId,
    periodNumber,
    cycleNumber,
    payoutDate: scheduleItem.payoutDate,
    payoutStatus: scheduleItem.status,
    members: memberStatuses,
  };
};

export const GroupService = {
  createGroup,
  joinGroup,
  startGroupRotation,
  payContribution,
  confirmContributionPayment,
  getGroupDetails,
  getCurrentPeriodNumber,
  getAllGroups,
  getUserGroups,
  pauseGroup,
  leaveGroup,
  updateGroup,
  getGroupPeriodHistory,
};
