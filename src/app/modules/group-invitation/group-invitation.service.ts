import { GroupInvitation } from './group-invitation.model';
import { Group } from '../group/group.model';
import { User } from '../user/user.model';
import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';

// Send a new group invitation to a user
const sendInvitation = async (senderId: string, groupId: string, receiverId: string) => {
  if (senderId === receiverId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot invite yourself');
  }

  // 1. Verify group exists and sender is a member
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  const isSenderMember = group.members.some((memberId) => String(memberId) === senderId);
  if (!isSenderMember) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not a member of this group');
  }

  // 2. Group must be pending to invite members
  if (group.status !== 'pending') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Group is already active or completed');
  }

  // 3. Verify receiver exists
  const receiver = await User.findById(receiverId);
  if (!receiver) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Invited user not found');
  }

  // 4. Verify receiver is not already in the group
  const isReceiverMember = group.members.some((memberId) => String(memberId) === receiverId);
  if (isReceiverMember) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'User is already a member of this group');
  }

  // 5. Verify no active pending invitation exists
  const existingInvitation = await GroupInvitation.findOne({
    groupId,
    receiverId,
    status: 'pending',
  });
  if (existingInvitation) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'An active invitation is already pending for this user');
  }

  // 6. Verify if group slots are available
  const expectedMembersCount = Math.round(group.targetPoolAmount / group.contributionAmount);
  if (group.members.length >= expectedMembersCount) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Group is already full');
  }

  const invitation = await GroupInvitation.create({
    groupId,
    senderId,
    receiverId,
    status: 'pending',
  });

  return invitation;
};

// Retrieve all pending invitations for the logged-in user
const getMyInvitations = async (userId: string) => {
  const invitations = await GroupInvitation.find({
    receiverId: new Types.ObjectId(userId),
    status: 'pending',
  })
    .populate('groupId', 'name contributionAmount targetPoolAmount paymentFrequency totalCycles')
    .populate('senderId', 'fullName email image');

  return invitations;
};

// Accept or decline a group invitation
const respondToInvitation = async (invitationId: string, userId: string, action: 'accept' | 'decline') => {
  const invitation = await GroupInvitation.findById(invitationId);
  if (!invitation) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Invitation not found');
  }

  if (String(invitation.receiverId) !== userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'This invitation is not addressed to you');
  }

  if (invitation.status !== 'pending') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'This invitation has already been processed');
  }

  const group = await Group.findById(invitation.groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group no longer exists');
  }

  if (action === 'accept') {
    // 1. Verify receiver has set up stripe connect
    const user = await User.findById(userId);
    if (!user || !user.stripeConnected || !user.stripeAccountId) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Please complete your Stripe Connect setup before accepting the invitation'
      );
    }

    // 2. Verify group status
    if (group.status !== 'pending') {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Group is no longer accepting members');
    }

    // 3. Verify if slots are full
    const expectedMembersCount = Math.round(group.targetPoolAmount / group.contributionAmount);
    if (group.members.length >= expectedMembersCount) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Group is already full');
    }

    // 4. Join user to the group
    await Group.findByIdAndUpdate(group._id, {
      $addToSet: { members: new Types.ObjectId(userId) },
    });

    invitation.status = 'accepted';
  } else {
    invitation.status = 'declined';
  }

  await invitation.save();
  return invitation;
};

export const GroupInvitationService = {
  sendInvitation,
  getMyInvitations,
  respondToInvitation,
};
