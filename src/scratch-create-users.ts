import mongoose from 'mongoose';
import { User } from './app/modules/user/user.model';
import { Group } from './app/modules/group/group.model';

const MONGO_URI = 'mongodb://localhost:27017/sudo';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Find the last created pending group
  const group = await Group.findOne({ status: 'pending' }).sort({ createdAt: -1 });
  if (!group) {
    console.log('No pending group found to add members to.');
    process.exit(0);
  }

  console.log(`Found Group: ${group.name} (ID: ${group._id})`);
  const expectedMembers = group.targetedMembers || Math.round(group.targetPoolAmount / group.contributionAmount);
  const currentMembersCount = group.members.length;
  const membersNeeded = expectedMembers - currentMembersCount;

  console.log(`Current members count: ${currentMembersCount}, Target: ${expectedMembers}`);
  
  if (membersNeeded <= 0) {
    console.log('The group is already full! No new test users needed.');
    process.exit(0);
  }

  console.log(`Creating ${membersNeeded} test users and adding them to group...`);

  const createdUsers = [];
  for (let i = 1; i <= membersNeeded; i++) {
    const email = `testuser${i}_${Math.floor(Math.random() * 10000)}@example.com`;
    const password = 'Password123!';
    const fullName = `Test Member ${i}`;

    const user = await User.create({
      email,
      password,
      fullName,
      stripeConnected: true,
      stripeAccountId: `acct_test_member_${i}_${Math.floor(Math.random() * 100000)}`,
      verified: true,
      status: 'active',
      role: 'user',
    });

    createdUsers.push({
      email,
      password,
      fullName,
      id: user._id,
    });

    group.members.push(user._id);
  }

  await group.save();
  console.log('Group members updated successfully!');
  console.log('\n--- CREATED TEST USERS DETAILS ---');
  createdUsers.forEach((u) => {
    console.log(`Name: ${u.fullName}`);
    console.log(`Email: ${u.email}`);
    console.log(`Password: ${u.password}`);
    console.log(`ID: ${u.id}`);
    console.log('----------------------------------');
  });

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
