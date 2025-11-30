
import { Developer, TicketStatus } from './types';

export const MOCK_DEVELOPERS: Developer[] = [
  { id: 'dev-1', name: 'Alice Chen', role: 'Frontend Lead', avatar: 'https://picsum.photos/100/100?random=1', capacity: 8 },
  { id: 'dev-2', name: 'Bob Smith', role: 'Backend Engineer', avatar: 'https://picsum.photos/100/100?random=2', capacity: 8 },
  { id: 'dev-3', name: 'Charlie Kim', role: 'Full Stack', avatar: 'https://picsum.photos/100/100?random=3', capacity: 8 },
];

// Exact colors from spec
export const STATUS_COLORS: Record<TicketStatus, string> = {
  [TicketStatus.TODO]: 'bg-[#94a3b8]', // Slate 400
  [TicketStatus.IN_PROGRESS]: 'bg-[#3b82f6]', // Blue 500
  [TicketStatus.DONE]: 'bg-[#22c55e]', // Green 500
  [TicketStatus.BLOCKED]: 'bg-[#ef4444]', // Red 500
};

export const AVAILABILITY_COLORS: Record<string, string> = {
  'Out of Office': 'bg-orange-300 border-orange-500',
  'Maintenance': 'bg-purple-300 border-purple-500',
  'Downtime': 'bg-gray-800 border-gray-900 text-white',
};

// Helper to generate some initial dates
const today = new Date();
export const INITIAL_START_DATE = new Date(today);
INITIAL_START_DATE.setDate(today.getDate() - 2); // Start slightly before today
