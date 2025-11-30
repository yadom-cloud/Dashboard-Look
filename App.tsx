import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Developer, Ticket, AvailabilityBlock, TicketStatus, AvailabilityType, ViewMode, SortOption
} from './types';
import { INITIAL_START_DATE } from './constants';
import GanttChart from './components/GanttChart';
import { supabase } from './supabaseClient';
import {
  Layout, RefreshCw, X, Search, Database, Copy,
  ChevronLeft, ChevronRight, Target, Users, AlertTriangle, AlertCircle, Calendar
} from 'lucide-react';

// ——————————————————————— MOCK DATA (instant beautiful demo) ———————————————————————
const MOCK_DEVELOPERS = [
  { id: '1', display_name: 'Louis', role: 'Developer', avatar: 'https://ui-avatars.com/api/?name=Louis&background=ef4444', capacity: 8, jira_account_id: 'louis-jira' },
  { id: '2', display_name: 'Lucaszlaw', role: 'Developer', avatar: 'https://ui-avatars.com/api/?name=Lucaszlaw&background=dc2626', capacity: 8, jira_account_id: 'luca-jira' },
  { id: '3', display_name: 'Thomas', role: 'Developer', avatar: 'https://ui-avatars.com/api/?name=Thomas&background=f97316', capacity: 8, jira_account_id: 'thomas-jira' },
  { id: '4', display_name: 'Peng', role: 'Developer', avatar: 'https://ui-avatars.com/api/?name=Peng&background=22c55e', capacity: 8, jira_account_id: 'peng-jira' },
  { id: '5', display_name: 'David', role: 'Developer', avatar: 'https://ui-avatars.com/api/?name=David&background=3b82f6', capacity: 8, jira_account_id: 'david-jira' },
  { id: '6', display_name: 'Calvin', role: 'Developer', avatar: 'https://ui-avatars.com/api/?name=Calvin&background=a855f7', capacity: 8, jira_account_id: 'calvin-jira' },
  { id: '7', display_name: 'Wei Lin', role: 'Developer', avatar: 'https://ui-avatars.com/api/?name=Wei+Lin&background=ec4899', capacity: 8, jira_account_id: 'wei-jira' },
];

const MOCK_TICKETS = [
  { key: 'EV-2778', summary: 'Critical Payment Bug (Major)', assignee_jira_id: 'louis-jira', status: 'In Progress', priority: 'High', start_date: '2025-12-01', end_date: '2025-12-05' },
  { key: 'EV-2867', summary: 'API Security Patch (Major)', assignee_jira_id: 'luca-jira', status: 'In Progress', priority: 'High', start_date: '2025-11-30', end_date: '2025-12-07' },
  { key: 'EV-2893', summary: 'Minor UI Polish', assignee_jira_id: 'peng-jira', status: 'To Do', priority: 'Low', start_date: '2025-12-03', end_date: '2025-12-04' },
  { key: 'EV-2500', summary: 'Commission Fix (Major)', assignee_jira_id: 'wei-jira', status: 'To Do', priority: 'High', start_date: '2025-12-02', end_date: '2025-12-06' },
  { key: 'EV-2450', summary: 'Bug in Reports', assignee_jira_id: 'calvin-jira', status: 'In Progress', priority: 'Medium', start_date: '2025-12-01', end_date: '2025-12-03' },
];

const MOCK_BLOCKS = [
  { id: 'b1', developer_id: '2', reason: 'OOO', start_time: '2025-12-02T00:00:00Z', end_time: '2025-12-04T00:00:00Z' },
];

// ——————————————————————— Data Mappers (unchanged) ———————————————————————
const mapDeveloper = (d: any): Developer => ({
  id: d.id,
  name: d.display_name || d.name || 'Unknown',
  role: d.role || 'Developer',
  avatar: d.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(d.display_name || 'D')}&background=random`,
  capacity: d.capacity || 8,
  jiraAccountId: d.jira_account_id
});

const mapBlock = (b: any): AvailabilityBlock => ({
  id: b.id,
  developerId: b.developer_id,
  type: (b.reason as AvailabilityType) || AvailabilityType.OOO,
  startDate: b.start_time || b.start_date || new Date().toISOString(),
  endDate: b.end_time || b.end_date || new Date().toISOString(),
  notes: b.reason
});

const mapTicket = (t: any, devMap: Record<string, string>): Ticket => {
  let assigneeId = 'unassigned';
  if (t.assignee_jira_id && devMap[t.assignee_jira_id]) assigneeId = devMap[t.assignee_jira_id];
  else if (t.assignee && devMap[t.assignee]) assigneeId = devMap[t.assignee];

  const inferredLabels = [];
  if (t.priority === 'High' || /major|critical/i.test(t.summary || '')) inferredLabels.push('Major');
  if (/bug/i.test(t.summary || '')) inferredLabels.push('Bug');

  return {
    id: t.key || t.id,
    key: t.key || 'UNK-000',
    title: t.summary || 'Untitled',
    assigneeId,
    status: t.status || TicketStatus.TODO,
    startDate: t.start_date || new Date().toISOString().split('T')[0],
    endDate: t.end_date || new Date(Date.now() + 3*86400000).toISOString().split('T')[0],
    priority: t.priority || 'Medium',
    labels: inferredLabels
  };
};

// ——————————————————————— MAIN APP COMPONENT ———————————————————————
const App: React.FC = () => {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [viewStartDate] = useState<Date>(INITIAL_START_DATE);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('2 Weeks');
  const [sortOption, setSortOption] = useState<SortOption>('LOAD_WEEK_DESC');
  const [highlightFreeSlots, setHighlightFreeSlots] = useState(false);
  const [showWeekends] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showWarningBanner, setShowWarningBanner] = useState(true);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newAvailability, setNewAvailability] = useState<{devId: string, date: string} | null>(null);

  // ———————————————————— FETCH + MOCK FALLBACK ————————————————————
  const fetchAllData = use
