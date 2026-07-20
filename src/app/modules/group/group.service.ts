import { Group } from './group.model';
import { Contribution } from '../contribution/contribution.model';
import { User } from '../user/user.model';
import { SettingsService } from '../settings/settings.service';
import QueryBuilder from '../../builder/QueryBuilder';
import stripe from '../../../config/stripe';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { IGroup } from './group.interface';

// Calculate the current period index based on dates and frequency
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

// Create a new savings group
const createGroup = async (userId: string, groupData: Partial<IGroup>) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // Restrict group creation if Stripe Connect setup is incomplete
  if (!user.stripeConnected || !user.stripeAccountId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Please set up your Stripe Connect account first.'
    );
  }

  if (!groupData.targetPoolAmount || !groupData.contributionAmount) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Pool amount and contribution are required.');
  }

  // Floating point check: check if targetPoolAmount is divisible by contributionAmount
  if (groupData.targetPoolAmount % groupData.contributionAmount !== 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Pool amount must be divisible by contribution.'
    );
  }

  const targetedMembers = groupData.targetPoolAmount / groupData.contributionAmount;

  const newGroup = await Group.create({
    ...groupData,
    targetedMembers,
    admin: userId,
    members: [userId],
    status: 'pending',
  });

  return newGroup;
};

// Join a savings group (restricted to public groups)
const joinGroup = async (userId: string, groupId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'User not found');
  }

  // Restrict entry if Stripe Connect setup is incomplete
  if (!user.stripeConnected || !user.stripeAccountId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Please set up your Stripe Connect account first.'
    );
  }

  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Enforce visibility restriction
  if (group.visibility === 'private') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'This group is private. Invitation required.');
  }

  if (group.status !== 'pending') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot join once the rotation starts.');
  }

  // Verify member uniqueness
  const isMemberAlready = group.members.some((memberId) => String(memberId) === userId);
  if (isMemberAlready) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You are already in this group.');
  }

  // Verify if group is already full
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

// Generate schedule and activate rotation (or resume from paused status)
const startGroupRotation = async (userId: string, role: string, groupId: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Only Group Admin or system Admin can perform this action
  if (String(group.admin) !== userId && role !== 'admin') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Only the group creator or admin can do this.');
  }

  // Handle Resuming from Paused state
  if (group.status === 'paused') {
    const now = new Date();
    let shiftCount = 0;
    
    // Shift all remaining pending periods to start from today
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

  // Enforce that group must be full before rotation starts
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

  // Build rotation schedule starting from the actual activation date
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
        startDate: actualStartTime, // Reset expected start date to actual start date
        rotationSchedule: schedule,
      },
    },
    { new: true }
  );

  return activatedGroup;
};

// Pause group activities (only allowed if current period/cycle is fully paid/completed)
const pauseGroup = async (userId: string, role: string, groupId: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Only Group Admin or system Admin can perform this action
  if (String(group.admin) !== userId && role !== 'admin') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Only the group creator or admin can do this.');
  }

  if (group.status !== 'active') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Only active groups can be paused.');
  }

  // Find the currently active period index
  const currentPeriodNum = getCurrentPeriodNumber(group);
  const currentPeriodItem = group.rotationSchedule.find(
    (p) => p.periodNumber === currentPeriodNum
  );

  // Can only pause if the running cycle/period has been fully completed (paid)
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

// Initialize contribution payment with direct transfer to the scheduled receiver
const payContribution = async (userId: string, groupId: string) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  if (group.status !== 'active') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Group is not active');
  }

  // Ensure payer is in group
  const isMember = group.members.some((memberId) => String(memberId) === userId);
  if (!isMember) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You are not a member of this group');
  }

  const currentPeriod = getCurrentPeriodNumber(group);
  const currentScheduleItem = group.rotationSchedule.find(
    (item) => item.periodNumber === currentPeriod
  );

  if (!currentScheduleItem) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Active period schedule not found');
  }

  const receiverId = currentScheduleItem.receiverId;

  // Receivers do not contribute during their payout slot
  if (String(receiverId) === userId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You are the receiver for this period. No payment needed.');
  }

  const receiverUser = await User.findById(receiverId);
  if (!receiverUser || !receiverUser.stripeAccountId || !receiverUser.stripeConnected) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'The scheduled receiver has not completed Stripe onboarding. Cannot process payment.'
    );
  }

  // Prevent duplicate payments
  const existingContribution = await Contribution.findOne({
    groupId,
    periodNumber: currentPeriod,
    senderId: userId,
    status: 'paid',
  });

  if (existingContribution) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You already paid for this period');
  }

  // Fetch platform commission settings
  const settings = await SettingsService.getSettings();
  const commissionPercentage = settings.platformCommission / 100;

  const commissionAmount = Math.round(group.contributionAmount * commissionPercentage);
  const transferAmount = group.contributionAmount - commissionAmount;

  // Stripe checkout session with destination connect transfer
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${group.name} - Period ${currentPeriod} Contribution`,
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
      periodNumber: String(currentPeriod),
      senderId: userId,
      receiverId: String(receiverId),
      commissionAmount: String(commissionAmount),
      transferAmount: String(transferAmount),
    },
  });

  // Track initial unpaid contribution
  await Contribution.create({
    groupId,
    periodNumber: currentPeriod,
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

// Confirm payment via Stripe webhook callback
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

  // Count total completed contributions for current period
  const totalPaidPayers = await Contribution.countDocuments({
    groupId: group._id,
    periodNumber: contribution.periodNumber,
    status: 'paid',
  });

  const expectedPayers = group.members.length - 1;

  // If all members paid, mark period complete
  if (totalPaidPayers >= expectedPayers) {
    await Group.updateOne(
      { _id: group._id, 'rotationSchedule.periodNumber': contribution.periodNumber },
      {
        $set: { 'rotationSchedule.$.status': 'completed' },
      }
    );

    const totalPeriods = group.totalCycles * group.members.length;

    // Complete entire group cycle if this was the last period
    if (contribution.periodNumber === totalPeriods) {
      await Group.findByIdAndUpdate(group._id, { $set: { status: 'completed' } });
    }
  }
};

// Detailed status tracking (who paid, who is unpaid, due status)
const trackGroupPayments = async (groupId: string) => {
  const group = await Group.findById(groupId).populate('members', 'fullName email');
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  const currentPeriod = getCurrentPeriodNumber(group);
  const totalPeriods = group.totalCycles * group.members.length;

  const trackingDetails = [];

  for (let period = 1; period <= totalPeriods; period++) {
    const scheduleItem = group.rotationSchedule.find((item) => item.periodNumber === period);
    const receiverId = scheduleItem?.receiverId;

    // Filter members scheduled to contribute this period
    const contributors = group.members.filter((member) => String(member._id) !== String(receiverId));

    const periodContributions = await Contribution.find({
      groupId,
      periodNumber: period,
      status: 'paid',
    });

    const paidMembers = periodContributions.map((c) => String(c.senderId));

    const memberDetails = contributors.map((member) => {
      const hasPaid = paidMembers.includes(String(member._id));
      return {
        memberId: member._id,
        name: (member as any).fullName,
        email: (member as any).email,
        status: hasPaid ? 'paid' : (period < currentPeriod ? 'overdue' : 'unpaid'),
      };
    });

    trackingDetails.push({
      periodNumber: period,
      cycleNumber: scheduleItem?.cycleNumber,
      dueDate: scheduleItem?.payoutDate,
      receiverId,
      status: scheduleItem?.status,
      contributions: memberDetails,
    });
  }

  return {
    groupName: group.name,
    currentPeriod,
    totalCycles: group.totalCycles,
    paymentFrequency: group.paymentFrequency,
    schedule: trackingDetails,
  };
};

// Get basic details and active rotation status for a single group
const getGroupDetails = async (groupId: string, userId: string) => {
  const group = await Group.findById(groupId)
    .populate('admin', 'fullName email');

  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  const totalPeriods = group.rotationSchedule.length;
  const completedPeriods = group.rotationSchedule.filter(
    (p) => p.status === 'completed'
  ).length;

  const progress = totalPeriods > 0 ? Math.round((completedPeriods / totalPeriods) * 100) : 0;

  let currentPeriod = 0;
  let currentCycle = 1;
  let currentReceiver = null;
  let isCurrentReceiver = false;
  let hasPaidCurrentPeriod = false;

  if (group.status === 'active' && totalPeriods > 0) {
    currentPeriod = getCurrentPeriodNumber(group);
    const currentScheduleItem = group.rotationSchedule.find(
      (p) => p.periodNumber === currentPeriod
    );
    if (currentScheduleItem) {
      currentCycle = currentScheduleItem.cycleNumber;
      
      // Populate ONLY the current period's receiver
      currentReceiver = await User.findById(currentScheduleItem.receiverId).select('fullName email image');
      
      const receiverIdStr = String(currentScheduleItem.receiverId?._id || currentScheduleItem.receiverId);
      isCurrentReceiver = receiverIdStr === userId;

      // Check if user has paid for the current active period
      hasPaidCurrentPeriod = !!(await Contribution.exists({
        groupId,
        periodNumber: currentPeriod,
        senderId: userId,
        status: 'paid',
      }));
    }
  }

  return {
    group,
    currentPeriod,
    currentCycle,
    currentReceiver,
    progress,
    isCurrentReceiver,
    hasPaidCurrentPeriod,
  };
};

// Retrieve all groups (admin sees public/private, user sees only public)
const getAllGroups = async (userId: string, role: string, query: Record<string, unknown>) => {
  const filter: Record<string, any> = {};
  if (role !== 'admin') {
    filter.visibility = 'public';
  }

  const groupQuery = new QueryBuilder(
    Group.find(filter).populate('admin', 'fullName email').populate('members', 'fullName email'),
    query
  )
    .filter()
    .sort()
    .paginate();

  const data = await groupQuery.modelQuery;
  const meta = await groupQuery.getPaginationInfo();

  return { data, meta };
};

// Retrieve groups that the authenticated user belongs to with progress and cycle info
const getUserGroups = async (userId: string) => {
  const groups = await Group.find({ members: new Types.ObjectId(userId) })
    .populate('admin', 'fullName email')
    .populate('members', 'fullName email');

  const result = groups.map((group) => {
    const totalMembers = group.members.length;
    const totalPeriods = group.rotationSchedule.length;
    const completedPeriods = group.rotationSchedule.filter(
      (p) => p.status === 'completed'
    ).length;

    const progress = totalPeriods > 0 ? Math.round((completedPeriods / totalPeriods) * 100) : 0;
    
    let currentPeriod = 0;
    let nextDueDate: Date | null = null;
    let currentCycle = 1;

    if (group.status === 'active' && totalPeriods > 0) {
      currentPeriod = getCurrentPeriodNumber(group);
      const currentScheduleItem = group.rotationSchedule.find(
        (p) => p.periodNumber === currentPeriod
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
      progress,
      poolTotal: group.targetPoolAmount,
      myShare: group.contributionAmount,
      nextDue: nextDueDate,
      currentCycle,
      totalCycles: group.totalCycles,
      paymentFrequency: group.paymentFrequency,
      startDate: group.startDate,
    };
  });

  return result;
};

// Leave/Exit a group (only allowed when group status is pending)
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

  // If the user is the admin/creator
  if (String(group.admin) === userId) {
    // If they are the only member, delete the group entirely
    if (group.members.length <= 1) {
      await Group.findByIdAndDelete(groupId);
      return { deleted: true };
    } else {
      // If there are other members, assign a new admin (first other member)
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

// Update/Edit group configuration (only allowed while group is in pending status)
const updateGroup = async (userId: string, role: string, groupId: string, updateData: Partial<IGroup>) => {
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Only Group Admin or system Admin can perform this action
  if (String(group.admin) !== userId && role !== 'admin') {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Only the group creator or admin can do this.');
  }

  // Strictly restrict editing if group has started, paused, or completed
  if (group.status !== 'pending') {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'Cannot edit details after the rotation has started.'
    );
  }

  // Filter allowed fields for update
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
    filteredUpdates.targetedMembers = targetPoolAmount / contributionAmount;
  }

  const updatedGroup = await Group.findByIdAndUpdate(
    groupId,
    { $set: filteredUpdates },
    { new: true }
  ).populate('admin', 'fullName email').populate('members', 'fullName email');

  return updatedGroup;
};

// Get member status list and payment history for a specific period/cycle
const getGroupPeriodHistory = async (groupId: string, periodNumberQuery?: number) => {
  const group = await Group.findById(groupId).populate('members', 'fullName email image');
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  // Resolve period number (default to current active period, or 1 if pending)
  let periodNumber = periodNumberQuery;
  if (!periodNumber) {
    periodNumber = group.status === 'active' ? getCurrentPeriodNumber(group) : 1;
  }

  // Find target schedule item to get cycle number and receiver
  const scheduleItem = group.rotationSchedule.find(
    (p) => p.periodNumber === periodNumber
  );

  if (!scheduleItem) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Period schedule not found');
  }

  const receiverId = scheduleItem.receiverId;
  const cycleNumber = scheduleItem.cycleNumber;

  // Retrieve all paid/unpaid contribution records for this period
  const contributions = await Contribution.find({
    groupId,
    periodNumber,
  });

  const memberStatuses = group.members.map((member: any) => {
    const isReceiver = String(member._id) === String(receiverId);
    
    // Find contribution record for this member
    const contribution = contributions.find(
      (c) => String(c.senderId) === String(member._id)
    );

    let status: 'paid' | 'pending' | 'receiver' = 'pending';
    if (isReceiver) {
      status = 'receiver';
    } else if (contribution && contribution.status === 'paid') {
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
  trackGroupPayments,
  getGroupDetails,
  getCurrentPeriodNumber,
  getAllGroups,
  getUserGroups,
  pauseGroup,
  leaveGroup,
  updateGroup,
  getGroupPeriodHistory,
};
