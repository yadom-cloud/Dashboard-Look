
export enum TicketStatus {
  TODO = 'To Do',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
  BLOCKED = 'Blocked'
}

export enum AvailabilityType {
  AVAILABLE = 'Available',
  OOO = 'Out of Office', // Vacation, Sick
  MAINTENANCE = 'Maintenance', // Admin work, training
  DOWNTIME = 'Downtime' // Unexpected
}

export type ViewMode = 'Week' | '2 Weeks' | 'Month';

export type SortOption = 'LOAD_WEEK_DESC' | 'LOAD_TODAY_DESC' | 'OVERBOOKED_DESC' | 'ALPHABETICAL';

export interface Ticket {
  id: string;
  key: string; // e.g., PROJ-123
  title: string;
  assigneeId: string;
  status: TicketStatus;
  startDate: string; // ISO Date string YYYY-MM-DD
  endDate: string; // ISO Date string YYYY-MM-DD
  priority: 'High' | 'Medium' | 'Low';
  labels?: string[]; // e.g. ['Bug', 'Major']
}

export interface AvailabilityBlock {
  id: string;
  developerId: string;
  type: AvailabilityType;
  startDate: string;
  endDate: string;
  notes?: string;
}

export interface Developer {
  id: string;
  name: string;
  role: string;
  avatar: string; // URL
  capacity: number; // Hours per day ideally
  jiraAccountId?: string;
}

export interface GanttItem {
  id: string;
  type: 'ticket' | 'availability';
  title: string;
  startDate: Date;
  endDate: Date;
  status?: TicketStatus;
  availabilityType?: AvailabilityType;
  data: Ticket | AvailabilityBlock;
}
