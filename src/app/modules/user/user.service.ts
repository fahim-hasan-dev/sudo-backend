import { StatusCodes } from 'http-status-codes'
import ApiError from '../../../errors/ApiError'
import { IUser } from './user.interface'
import { User } from './user.model'
import { USER_ROLES, USER_STATUS } from '../../../enum/user'
import { JwtPayload } from 'jsonwebtoken'
import { logger } from '../../../shared/logger'
import QueryBuilder from '../../builder/QueryBuilder'
import config from '../../../config'
import { Types } from 'mongoose'
import { Contribution } from '../contribution/contribution.model'
import { Group } from '../group/group.model'


const getAllUser = async (query: Record<string, unknown>) => {
    const userQueryBuilder = new QueryBuilder(User.find().select('-password -authentication'), query)
        .filter()
        .sort()
        .fields()
        .paginate()


    const users = await userQueryBuilder.modelQuery.lean()
    const paginationInfo = await userQueryBuilder.getPaginationInfo()

    const totalUsers = await User.countDocuments()
    const staticData = { totalUsers }

    return {
        users,
        staticData,
        meta: paginationInfo,
    }
}

const getSingleUser = async (id: string) => {
    const result = await User.findById(id).select('-password -authentication')
    return result
}

// delete User
const deleteUser = async (id: string) => {
    const user = await User.findById(id)
    if (!user) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'User not found')
    }

    const result = await User.findByIdAndDelete(id)
    return result
}

const updateProfile = async (
    user: JwtPayload,
    payload: Partial<IUser>
) => {
    const isExistUser = await User.findById(user.authId)

    if (!isExistUser) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'User not found or deleted.')
    }

    const updatedUser = await User.findOneAndUpdate(
        { _id: user.authId, status: { $ne: USER_STATUS.DELETED } },
        payload,
        { new: true },
    )

    if (!updatedUser) {
        throw new ApiError(StatusCodes.BAD_REQUEST, 'Failed to update profile')
    }

    return updatedUser
}

const getProfile = async (user: JwtPayload) => {
    const isExistUser = await User.findById(user.authId).lean().select('-password -authentication')
    if (!isExistUser) {
        throw new ApiError(
            StatusCodes.NOT_FOUND,
            'The requested profile not found or deleted.',
        )
    }

    return isExistUser
}


const deleteMyAccount = async (user: JwtPayload) => {
    const isExistUser = await User.findById(user.authId)
    if (!isExistUser) {
        throw new ApiError(
            StatusCodes.NOT_FOUND,
            'The requested profile not found or deleted.',
        )
    }

    await User.findByIdAndDelete(isExistUser._id)

    return 'Account deleted successfully'
}

const getDashboardSummary = async (user: JwtPayload) => {
  const userId = new Types.ObjectId(user.authId);

  // 1. Total contribution (gross amount paid by user across the app)
  const totalContributionResult = await Contribution.aggregate([
    { $match: { senderId: userId, status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalContribution = totalContributionResult[0]?.total || 0;

  // 2. Total savings (total net transferAmount received by user as receiver)
  const totalSavingsResult = await Contribution.aggregate([
    { $match: { receiverId: userId, status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$transferAmount' } } }
  ]);
  const totalSavings = totalSavingsResult[0]?.total || 0;

  // 3. Active groups count (count of active groups user belongs to)
  const activeGroups = await Group.countDocuments({
    members: userId,
    status: 'active'
  });

  // 4. This month's contribution total
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const endOfMonth = new Date();
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  endOfMonth.setDate(0);
  endOfMonth.setHours(23, 59, 59, 999);

  const thisMonthContributionResult = await Contribution.aggregate([
    {
      $match: {
        senderId: userId,
        status: 'paid',
        paymentDate: { $gte: startOfMonth, $lte: endOfMonth }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const thisMonthContribution = thisMonthContributionResult[0]?.total || 0;

  // 5. Last 5 contributions list
  const rawContributions = await Contribution.find({
    senderId: userId,
    status: 'paid'
  })
    .select('amount paymentDate transactionId periodNumber groupId')
    .sort({ paymentDate: -1 })
    .limit(5)
    .populate('groupId', 'name paymentFrequency totalCycles targetPoolAmount contributionAmount members')
    .lean();

  const last5Contributions = rawContributions.map((c: any) => {
    const group = c.groupId || {};
    const totalMembers = group.members?.length || 1;
    const cycleNumber = totalMembers > 0 ? Math.ceil(c.periodNumber / totalMembers) : 1;

    // Omit members list from response to keep payload size small
    const { members, ...groupDetails } = group;

    return {
      _id: c._id,
      amount: c.amount,
      paymentDate: c.paymentDate,
      transactionId: c.transactionId,
      periodNumber: c.periodNumber,
      cycleNumber,
      group: groupDetails
    };
  });

  return {
    totalContribution,
    totalSavings,
    activeGroups,
    thisMonthContribution,
    last5Contributions
  };
};

export const UserServices = {
    updateProfile,
    getAllUser,
    getSingleUser,
    deleteUser,
    getProfile,
    deleteMyAccount,
    getDashboardSummary,
}
