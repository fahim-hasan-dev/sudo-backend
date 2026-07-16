import { Contribution } from './contribution.model';
import { Group } from '../group/group.model';
import { GroupService } from '../group/group.service';
import { Types } from 'mongoose';

// Retrieve contribution history for a specific user
const getUserContributionHistory = async (
  userId: string,
  filters: { type?: 'paid' | 'received' | 'all'; groupId?: string }
) => {
  const query: Record<string, any> = {};

  // Filter by group if provided
  if (filters.groupId) {
    query.groupId = new Types.ObjectId(filters.groupId);
  }

  // Filter based on user's role in the transaction (sender, receiver, or both)
  if (filters.type === 'paid') {
    query.senderId = new Types.ObjectId(userId);
  } else if (filters.type === 'received') {
    query.receiverId = new Types.ObjectId(userId);
  } else {
    query.$or = [
      { senderId: new Types.ObjectId(userId) },
      { receiverId: new Types.ObjectId(userId) },
    ];
  }

  const history = await Contribution.find(query)
    .populate('groupId', 'name contributionAmount paymentFrequency')
    .populate('senderId', 'fullName email')
    .populate('receiverId', 'fullName email')
    .sort({ createdAt: -1 });

  return history;
};

// Retrieve outstanding current due and past due (overdue) contributions for a user
const getUserOutstandingContributions = async (userId: string) => {
  // Find all active groups the user belongs to
  const activeGroups = await Group.find({
    members: new Types.ObjectId(userId),
    status: 'active',
  });

  const currentDues = [];
  const overdues = [];

  for (const group of activeGroups) {
    const currentPeriod = GroupService.getCurrentPeriodNumber(group);

    // Evaluate all periods from start up to current active period
    for (let period = 1; period <= currentPeriod; period++) {
      const scheduleItem = group.rotationSchedule.find(
        (item) => item.periodNumber === period
      );

      if (!scheduleItem) continue;

      const receiverId = scheduleItem.receiverId;

      // Skip evaluation if the user is the designated receiver for this period
      if (String(receiverId) === userId) continue;

      // Check if a completed payment exists
      const isPaid = await Contribution.exists({
        groupId: group._id,
        periodNumber: period,
        senderId: new Types.ObjectId(userId),
        status: 'paid',
      });

      if (!isPaid) {
        const dueItem = {
          groupId: group._id,
          groupName: group.name,
          periodNumber: period,
          cycleNumber: scheduleItem.cycleNumber,
          amount: group.contributionAmount,
          dueDate: scheduleItem.payoutDate,
        };

        if (period < currentPeriod) {
          overdues.push(dueItem);
        } else {
          currentDues.push(dueItem);
        }
      }
    }
  }

  return {
    currentDues,
    overdues,
  };
};

export const ContributionService = {
  getUserContributionHistory,
  getUserOutstandingContributions,
};
