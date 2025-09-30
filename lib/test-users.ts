import { deriveKeysFromSeed } from './crypto';

export interface TestUser {
  seed: string;
  ss58Address: string;
  displayName: string;
  pk: string;
  avatarUrl?: string;
  about?: string;
}

// Raw test user data without derived keys
const TEST_USER_DATA = [
  {
    seed: "property reject cute tower awkward boil burst advice door phrase fuel lift",
    displayName: "Alice",
    about: "Crypto enthusiast and early adopter",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice"
  },
  {
    seed: "ordinary powder shop december slim clown ripple mixed benefit curious hungry ball",
    displayName: "Bob",
    about: "Developer and blockchain researcher",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob"
  },
  {
    seed: "dynamic junior sight client omit cart write domain material surround uncle assist",
    displayName: "Charlie",
    about: "Privacy advocate and security expert",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=charlie"
  },
  {
    seed: "anger cloud box pattern hundred wrestle fortune soap permit eight dynamic elder",
    displayName: "Diana",
    about: "AI researcher and tech innovator",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=diana"
  },
  {
    seed: "throw brother wire monkey pioneer visit photo taxi own toast gallery major",
    displayName: "Eve",
    about: "Digital artist and NFT creator",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=eve"
  },
  {
    seed: "erupt ensure village chunk vote cross plastic deer bulk cube venue pipe",
    displayName: "Frank",
    about: "DeFi protocol developer",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=frank"
  },
  {
    seed: "ranch series twelve ice come message shrug pupil soda capital piano film",
    displayName: "Grace",
    about: "Blockchain consultant and educator",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=grace"
  },
  {
    seed: "comic erase naive cactus refuse economy guilt pulp cup frost blur mercy",
    displayName: "Henry",
    about: "Smart contract auditor",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=henry"
  },
  {
    seed: "human stock federal ready rough enough bargain acquire awake bronze lumber minute",
    displayName: "Ivy",
    about: "Web3 community manager",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=ivy"
  },
  {
    seed: "private crime cushion direct trumpet olympic naive strike sell affair own plug",
    displayName: "Jack",
    about: "Cryptocurrency trader and analyst",
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=jack"
  }
];

// Cache for derived test users
let _testUsers: TestUser[] | null = null;

// Initialize test users with derived keys
export async function initializeTestUsers(): Promise<TestUser[]> {
  if (_testUsers) {
    return _testUsers;
  }

  const users = await Promise.all(TEST_USER_DATA.map(async (user) => {
    const { ss58Address, pk } = await deriveKeysFromSeed(user.seed);
    return {
      ...user,
      ss58Address,
      pk: Buffer.from(pk).toString('hex')
    };
  }));

  _testUsers = users;
  return users;
}

// Get test users (will initialize if needed)
export async function getTestUsers(): Promise<TestUser[]> {
  return await initializeTestUsers();
}

export async function getTestUserByAddress(address: string): Promise<TestUser | undefined> {
  const users = await getTestUsers();
  return users.find(user => user.ss58Address === address);
}

export async function getTestUserBySeed(seed: string): Promise<TestUser | undefined> {
  const users = await getTestUsers();
  return users.find(user => user.seed === seed);
}
