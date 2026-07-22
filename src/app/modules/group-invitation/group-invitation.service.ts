import { GroupInvitation } from './group-invitation.model';
import { Group } from '../group/group.model';
import { User } from '../user/user.model';
import ApiError from '../../../errors/ApiError';
import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import { USER_STATUS } from '../../../enum/user';
import { emailHelper } from '../../../helpers/emailHelper';
import { emailTemplate } from '../../../shared/emailTemplate';

// Send a new group invitation to a user
const sendInvitation = async (senderId: string, groupId: string, email: string) => {
  // Fetch sender profile to get their name
  const sender = await User.findById(senderId);
  const senderName = sender ? sender.fullName : 'A member';

  // 1. Verify group exists and sender is a member
  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group not found');
  }

  const isSenderMember = group.members.some((memberId) => String(memberId) === senderId);
  if (!isSenderMember) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'You are not in this group.');
  }

  // 2. Group must be pending to invite members
  if (group.status !== 'pending') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Group rotation has already started.');
  }

  // 3. Check if receiver exists
  const receiver = await User.findOne({ email });
  if (!receiver || receiver.status === USER_STATUS.DELETED) {
    // If user is not registered or is deleted, send registration instructions email in human tone
    const unregisteredEmail = emailTemplate.unregisteredGroupInvitationEmail({
      receiverEmail: email,
      senderName,
      groupName: group.name,
    });

    setTimeout(() => {
      emailHelper.sendEmail(unregisteredEmail);
    }, 0);

    return {
      message: 'Invitation email sent successfully (User is not registered yet)',
      unregistered: true,
    };
  }

  const receiverId = String(receiver._id);

  if (senderId === receiverId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'You cannot invite yourself.');
  }

  // 4. Verify receiver is not already in the group
  const isReceiverMember = group.members.some((memberId) => String(memberId) === receiverId);
  if (isReceiverMember) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'User is already in this group.');
  }

  // 5. Verify no active pending invitation exists
  const existingInvitation = await GroupInvitation.findOne({
    groupId,
    receiverId,
    status: 'pending',
  });
  if (existingInvitation) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invitation already sent to this user.');
  }

  // 6. Verify if group slots are available
  const expectedMembersCount = group.targetedMembers;
  if (group.members.length >= expectedMembersCount) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'This group is already full.');
  }

  const invitation = await GroupInvitation.create({
    groupId,
    senderId,
    receiverId,
    status: 'pending',
  });

  // Send invitation notification email asynchronously
  const invitationEmail = emailTemplate.groupInvitationEmail({
    receiverEmail: receiver.email,
    receiverName: receiver.fullName,
    senderName,
    groupName: group.name,
  });

  setTimeout(() => {
    emailHelper.sendEmail(invitationEmail);
  }, 0);

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
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'This invitation is not for you.');
  }

  if (invitation.status !== 'pending') {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Invitation already processed.');
  }

  const group = await Group.findById(invitation.groupId);
  if (!group) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Group no longer exists');
  }

  if (action === 'accept') {
    // 2. Verify group status
    if (group.status !== 'pending') {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Group is no longer accepting members.');
    }

    // 3. Verify if slots are full
    const expectedMembersCount = group.targetedMembers;
    if (group.members.length >= expectedMembersCount) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'This group is already full.');
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
