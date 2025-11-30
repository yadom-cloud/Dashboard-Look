
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    Developer, Ticket, AvailabilityBlock, TicketStatus, AvailabilityType, ViewMode, SortOption 
} from './types';
import { MOCK_DEVELOPERS, INITIAL_START_DATE } from './constants';
import GanttChart from './components/GanttChart';
import { supabase } from './supabaseClient';
import { 
    Layout, RefreshCw, X, Search, Database, Copy,
    ChevronLeft, ChevronRight, Target, Users, AlertTriangle, AlertCircle, Calendar
} from 'lucide-react';


// Force mock if Supabase fails
const USE_MOCK_DATA = window.USE_MOCK_DATA || !import.meta.env.VITE_SUPABASE_ANON_KEY;

// Your MOCK_DEVELOPERS, MOCK_TICKETS, MOCK_BLOCKS here (from my previous message)
const MOCK_DEVELOPERS = [ /* ... paste the array */ ];
const MOCK_TICKETS = [ /* ... paste the array */ ];
const MOCK_BLOCKS = [ /* ... paste the array */ ];
// --- Data Mappers ---


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
    else if (t.assignee_id) assigneeId = t.assignee_id; 

    const fallbackStart = t.updated_at ? t.updated_at.split('T')[0] : new Date().toISOString().split('T')[0];
    const fallbackEnd = new Date(new Date(fallbackStart).getTime() + (3 * 86400000)).toISOString().split('T')[0];

    // Inference for labels if they don't exist in DB
    const inferredLabels = [];
    if (t.priority === 'High' || (t.summary || '').toLowerCase().includes('critical')) inferredLabels.push('Major');
    if ((t.summary || '').toLowerCase().includes('bug')) inferredLabels.push('Bug');

    return {
        id: t.key || t.id,
        key: t.key || 'UNK-000',
        title: t.summary || t.title || 'Untitled Issue',
        assigneeId: assigneeId,
        status: t.status || TicketStatus.TODO,
        startDate: t.start_date || fallbackStart,
        endDate: t.end_date || fallbackEnd,
        priority: t.priority || 'Medium',
        labels: inferredLabels // Pass inferred labels
    };
};

const App: React.FC = () => {
  // --- State ---
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);
  const [viewStartDate, setViewStartDate] = useState<Date>(INITIAL_START_DATE);
  
  // View Control
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('2 Weeks');
  const [sortOption, setSortOption] = useState<SortOption>('LOAD_WEEK_DESC');
  const [highlightFreeSlots, setHighlightFreeSlots] = useState(false);
  const [showWeekends, setShowWeekends] = useState(false);
  
  const [devLookup, setDevLookup] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showWarningBanner, setShowWarningBanner] = useState(true); // Dismissible

  // Modals
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newAvailability, setNewAvailability] = useState<{devId: string, date: string} | null>(null);

  // --- Helpers ---
  const getDevLoad = useCallback((devId: string, days: number, offsetStart: Date) => {
      let totalLoad = 0;
      for(let i=0; i<days; i++) {
          const d = new Date(offsetStart);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split('T')[0];
          
          // Ticket Load
          const activeTickets = tickets.filter(t => t.assigneeId === devId && t.startDate <= dateStr && t.endDate >= dateStr && t.status !== TicketStatus.DONE);
          activeTickets.forEach(t => {
              const lower = (t.title || '').toLowerCase();
              if (lower.includes('major') || t.labels?.includes('Major')) totalLoad += 1.0;
              else if (lower.includes('bug') || t.labels?.includes('Bug')) totalLoad += 0.2;
              else totalLoad += 0.5;
          });
          
          // Block Load
          if (availabilityBlocks.some(b => b.developerId === devId && b.startDate <= dateStr && b.endDate >= dateStr)) {
              totalLoad += 1.0;
          }
      }
      return totalLoad / days; // Average daily load
  }, [tickets, availabilityBlocks]);

  // --- Derived State & Sorting ---
  const filteredDevelopers = useMemo(() => {
      let devs = developers;
      if (searchQuery.trim()) {
          devs = devs.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }

      // Sorting Logic
      return [...devs].sort((a, b) => {
          if (sortOption === 'ALPHABETICAL') return a.name.localeCompare(b.name);
          
          // Calculate Load for sorting
          const loadA = getDevLoad(a.id, 7, viewStartDate); // Load this week
          const loadB = getDevLoad(b.id, 7, viewStartDate);
          
          if (sortOption === 'LOAD_WEEK_DESC') return loadB - loadA;
          
          if (sortOption === 'LOAD_TODAY_DESC') {
              const today = new Date();
              const todayA = getDevLoad(a.id, 1, today);
              const todayB = getDevLoad(b.id, 1, today);
              return todayB - todayA;
          }

          if (sortOption === 'OVERBOOKED_DESC') {
             // Prioritize those over 100%
             const overA = loadA > 1.0 ? 1 : 0;
             const overB = loadB > 1.0 ? 1 : 0;
             if (overA !== overB) return overB - overA;
             return loadB - loadA;
          }
          
          return 0;
      });

  }, [developers, searchQuery, sortOption, getDevLoad, viewStartDate]);

  const daysToShow = useMemo(() => {
      switch (viewMode) {
          case 'Week': return 7;
          case '2 Weeks': return 14;
          case 'Month': return 30;
          default: return 14;
      }
  }, [viewMode]);

  // --- Team Metrics ---
  const teamMetrics = useMemo(() => {
      const today = new Date();
      let totalLoadSum = 0;
      let free = 0;
      let overbooked = 0;
      let devCount = 0;

      filteredDevelopers.forEach(dev => {
          devCount++;
          const dailyLoad = getDevLoad(dev.id, 1, today);
          totalLoadSum += Math.min(dailyLoad * 100, 150); // Cap
          if (dailyLoad < 0.5) free++;
          if (dailyLoad >= 1.0) overbooked++;
      });

      return {
          utilization: devCount ? Math.round(totalLoadSum / devCount) : 0,
          free,
          overbooked
      };
  }, [filteredDevelopers, getDevLoad]);

  // --- Warning Banner Logic ---
  const warningStatus = useMemo(() => {
      let countOver120 = 0;
      let countOver100 = 0;
      let totalWeeklyLoad = 0;
      const overbookedNames: string[] = [];

      filteredDevelopers.forEach(dev => {
          const load = getDevLoad(dev.id, 7, viewStartDate); // Weekly load
          totalWeeklyLoad += load;
          if (load >= 1.2) {
              countOver120++;
              overbookedNames.push(`${dev.name} ${Math.round(load*100)}%`);
          }
          if (load >= 1.0) countOver100++;
      });

      const avg = filteredDevelopers.length ? totalWeeklyLoad / filteredDevelopers.length : 0;
      
      if (countOver120 >= 3) return { level: 'RED', names: overbookedNames.slice(0, 3) };
      if (countOver100 >= 5) return { level: 'ORANGE', names: [] };
      if (avg >= 0.9) return { level: 'YELLOW', names: [] };
      return { level: 'NONE', names: [] };

  }, [filteredDevelopers, getDevLoad, viewStartDate]);


  // --- Data Loading ---
  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    setDataError(null);
    try {
      // 1. Fetch Developers
      const { data: devData, error: devError } = await supabase.from('developers').select('*');
      if (devError) throw devError;
      
      const lookup: Record<string, string> = {};
      if (devData) {
          const mappedDevs = devData.map(mapDeveloper);
          devData.forEach(d => {
              if (d.jira_account_id) lookup[d.jira_account_id] = d.id;
              if (d.display_name) lookup[d.display_name] = d.id; 
              if (d.name) lookup[d.name] = d.id;
          });
          setDevelopers(mappedDevs);
          setDevLookup(lookup);
      }

      // 2. Fetch Tickets
      const { data: ticketData, error: ticketError } = await supabase.from('jira_tickets').select('*').limit(200);
      if (ticketError) throw ticketError;
      if (ticketData) {
          const mappedTickets = ticketData.map(t => mapTicket(t, lookup));
          setTickets(mappedTickets);
      }

      // 3. Availability
      const { data: blockData } = await supabase.from('manual_availability').select('*');
      if (blockData) setAvailabilityBlocks(blockData.map(mapBlock));

    } catch (error: any) {
      console.error("Error:", error);
      let msg = error.message || JSON.stringify(error);
      if (msg.includes('does not exist') || error?.code === '42P01') {
          msg = "Required tables missing. Please run setup script.";
          setShowSetup(true);
      }
      setDataError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAllData(); }, []);

  // --- Interactions ---

  const handleTicketDrop = async (ticketId: string, targetDevId: string, targetDate: string) => {
      // Optimistic Update
      setTickets(prev => prev.map(t => {
          if (t.id === ticketId) {
              return { ...t, assigneeId: targetDevId, startDate: targetDate, endDate: targetDate }; // Reset to single day or keep duration? Spec says update due/target. I'll just set start/end to target date for simplicity of "Move to day"
          }
          return t;
      }));

      // In a real app, update DB:
      // await supabase.from('jira_tickets').update({ assignee: ..., start_date: ... }).eq('key', ticketId);
  };

  const handleAddAvailability = async (devId: string, date: string) => {
      setNewAvailability({ devId, date });
  };

  const confirmAvailability = async (type: AvailabilityType, notes: string) => {
      if (!newAvailability) return;
      const optimistic: AvailabilityBlock = {
          id: `temp-${Date.now()}`,
          developerId: newAvailability.devId,
          type,
          startDate: newAvailability.date,
          endDate: newAvailability.date,
          notes
      };
      setAvailabilityBlocks(prev => [...prev, optimistic]);
      setNewAvailability(null);
      
      await supabase.from('manual_availability').insert({
          developer_id: newAvailability.devId,
          reason: notes || type,
          start_time: newAvailability.date,
          end_time: newAvailability.date
      });
  };

  // --- SQL Script ---
  const sqlScript = `
create table if not exists developers ( id uuid default gen_random_uuid() primary key, jira_account_id text, display_name text, email text, role text, capacity int );
create table if not exists jira_tickets ( key text primary key, summary text, status text, assignee_jira_id text, assignee text, updated_at timestamptz, start_date date, end_date date, priority text );
create table if not exists manual_availability ( id uuid default gen_random_uuid() primary key, developer_id uuid references developers(id), start_time timestamptz, end_time timestamptz, reason text );
alter publication supabase_realtime add table jira_tickets, manual_availability;
`;

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] font-sans text-[#1e293b] overflow-hidden">
        
        {/* --- 1. Fixed Top Bar (72px) --- */}
        <header className="flex-shrink-0 bg-white border-b border-[#e2e8f0] h-[72px] px-6 flex items-center justify-between z-30 relative shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]">
            
            {/* Left: Title & Team Stats */}
            <div className="flex items-center gap-8">
                <div className="flex flex-col justify-center">
                   <h1 className="text-[20px] font-semibold tracking-tight text-[#1e293b] leading-none mb-1">Resource Allocation</h1>
                   <div className="flex items-center gap-2 text-xs font-medium text-[#64748b]">
                       <span className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                           <Calendar className="w-3 h-3"/> Nov 24 – Dec 7
                       </span>
                       <span className="text-[#94a3b8]">•</span>
                       <select value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)} className="bg-transparent border-none p-0 text-xs font-medium cursor-pointer focus:ring-0">
                           <option>Week</option>
                           <option>2 Weeks</option>
                           <option>Month</option>
                       </select>
                   </div>
                </div>
                
                <div className="h-8 w-px bg-slate-200"></div>

                <div className="flex items-center gap-4 text-[#475467] text-sm font-medium">
                    <span>Team <strong>{teamMetrics.utilization}%</strong> utilised</span>
                    <span className="text-slate-300">•</span>
                    <span><strong>{teamMetrics.free}</strong> free today</span>
                    <span className="text-slate-300">•</span>
                    <span><strong>{teamMetrics.overbooked}</strong> overbooked</span>
                </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-[#94a3b8]" />
                    <input 
                        type="text" placeholder="Search developers…" 
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-[300px] pl-9 pr-4 py-2 text-sm border border-[#cbd5e1] rounded bg-white text-[#1e293b] placeholder-[#94a3b8] focus:ring-2 focus:ring-blue-100 focus:border-[#3b82f6] transition-all"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-[#64748b]">Sort:</span>
                    <select 
                        value={sortOption} onChange={e => setSortOption(e.target.value as SortOption)}
                        className="text-sm border-[#cbd5e1] rounded bg-white py-1.5 pl-2 pr-8 focus:ring-blue-500 focus:border-blue-500 font-medium text-[#1e293b]"
                    >
                        <option value="LOAD_WEEK_DESC">Load this week (desc)</option>
                        <option value="LOAD_TODAY_DESC">Load today</option>
                        <option value="OVERBOOKED_DESC">Overbooked first</option>
                        <option value="ALPHABETICAL">Alphabetical</option>
                    </select>
                </div>

                <button 
                    onClick={() => setHighlightFreeSlots(!highlightFreeSlots)}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors border
                        ${highlightFreeSlots 
                            ? 'bg-[#10b981] text-white border-[#10b981] shadow-sm' 
                            : 'bg-white text-[#475467] border-[#cbd5e1] hover:bg-slate-50'
                        }
                    `}
                >
                    <Target className="w-4 h-4" />
                    Find free slot
                </button>
            </div>
        </header>

        {/* --- Warning Banner --- */}
        {showWarningBanner && warningStatus.level !== 'NONE' && (
            <div className={`
                flex-shrink-0 h-[48px] px-6 flex items-center justify-between
                ${warningStatus.level === 'RED' ? 'bg-[#fee2e2] text-[#991b1b]' : ''}
                ${warningStatus.level === 'ORANGE' ? 'bg-[#ffedd5] text-[#9a3412]' : ''}
                ${warningStatus.level === 'YELLOW' ? 'bg-[#fef3c7] text-[#92400e]' : ''}
            `}>
                <div className="flex items-center gap-2 font-medium text-sm">
                    {warningStatus.level === 'RED' && <AlertCircle className="w-5 h-5"/>}
                    {warningStatus.level !== 'RED' && <AlertTriangle className="w-5 h-5"/>}
                    
                    <span className="font-bold">
                        {warningStatus.level === 'RED' ? 'CRITICAL:' : 'WARNING:'}
                    </span>
                    
                    {warningStatus.level === 'RED' 
                        ? `${warningStatus.names.length} developers over 120% this week – ${warningStatus.names.join(', ')}…`
                        : `Team utilization is high. Consider redistributing tasks.`
                    }
                </div>
                <button onClick={() => setShowWarningBanner(false)}><X className="w-4 h-4 opacity-60 hover:opacity-100"/></button>
            </div>
        )}

        {/* --- Gantt Chart Area --- */}
        <div className="flex-grow flex flex-col min-h-0 relative">
            {dataError && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded shadow-md flex items-center gap-2">
                     <AlertCircle className="w-4 h-4"/> <span>{dataError}</span>
                </div>
            )}

            <div className="flex-grow bg-white overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
                <GanttChart 
                    developers={filteredDevelopers}
                    tickets={tickets}
                    availabilityBlocks={availabilityBlocks}
                    viewStartDate={viewStartDate}
                    daysToShow={daysToShow}
                    highlightFreeSlots={highlightFreeSlots}
                    showWeekends={showWeekends}
                    onAddAvailability={handleAddAvailability}
                    onTicketClick={setSelectedTicket}
                    onTicketDrop={handleTicketDrop}
                />
            </div>
            
            {/* View Footer / Legend */}
            <div className="h-10 border-t border-[#e2e8f0] bg-white flex items-center justify-between px-6 text-xs text-[#64748b]">
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={showWeekends} onChange={e => setShowWeekends(e.target.checked)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"/>
                        Always show weekends
                    </label>
                </div>
                <div className="flex gap-4">
                     <span className="font-semibold uppercase text-[10px] tracking-wider text-slate-400">Heatmap</span>
                     <div className="flex items-center gap-1"><div className="w-3 h-3 bg-[#d1fae5] rounded-[2px]"></div> &lt;60%</div>
                     <div className="flex items-center gap-1"><div className="w-3 h-3 bg-[#fef9c3] rounded-[2px]"></div> 60-90%</div>
                     <div className="flex items-center gap-1"><div className="w-3 h-3 bg-[#fed7aa] rounded-[2px]"></div> 90-110%</div>
                     <div className="flex items-center gap-1"><div className="w-3 h-3 bg-[#fca5a5] rounded-[2px]"></div> ≥110%</div>
                </div>
            </div>
        </div>

        {/* --- Modals (Setup, Availability, Ticket Details) --- */}
        {showSetup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-lg p-6 w-[500px]">
                    <h3 className="font-bold mb-4 flex gap-2"><Database className="text-blue-600"/> Setup Required</h3>
                    <div className="bg-slate-900 text-slate-50 p-3 rounded text-xs overflow-auto font-mono mb-4 relative">
                        {sqlScript}
                        <button onClick={() => navigator.clipboard.writeText(sqlScript)} className="absolute top-2 right-2 text-white/50 hover:text-white"><Copy className="w-4 h-4"/></button>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowSetup(false)} className="px-4 py-2 text-slate-600">Close</button>
                    </div>
                </div>
            </div>
        )}

        {newAvailability && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                <div className="bg-white rounded shadow-lg p-6 w-80">
                    <h3 className="font-bold mb-4">Add Unavailable Time</h3>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        confirmAvailability(data.get('type') as AvailabilityType, data.get('notes') as string);
                    }}>
                        <select name="type" className="w-full mb-2 border rounded p-2 text-sm">
                            <option value={AvailabilityType.OOO}>Out of Office</option>
                            <option value={AvailabilityType.MAINTENANCE}>Training / Maintenance</option>
                        </select>
                        <input name="notes" placeholder="Reason..." className="w-full mb-4 border rounded p-2 text-sm" />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setNewAvailability(null)} className="px-3 py-1.5 text-sm text-slate-500">Cancel</button>
                            <button type="submit" className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded">Add</button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};

export default App;
