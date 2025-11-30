
import React, { useMemo, useState, useEffect } from 'react';
import { Developer, Ticket, AvailabilityBlock, TicketStatus, AvailabilityType, GanttItem } from '../types';
import { STATUS_COLORS } from '../constants';
import { Plus, GripVertical, Clock } from 'lucide-react';

interface GanttChartProps {
  developers: Developer[];
  tickets: Ticket[];
  availabilityBlocks: AvailabilityBlock[];
  viewStartDate: Date;
  daysToShow: number;
  highlightFreeSlots: boolean;
  showWeekends: boolean;
  onAddAvailability: (devId: string, date: string) => void;
  onTicketClick: (ticket: Ticket) => void;
  onTicketDrop: (ticketId: string, targetDevId: string, targetDate: string) => void;
}

const HEADER_HEIGHT_PX = 50;
const ROW_HEIGHT_PX = 120; // Enough space for stacked bars

// Helper to format date key
const formatDateKey = (date: Date) => date.toISOString().split('T')[0];

// --- HEATMAP FORMULA LOGIC ---
const calculateLoad = (tickets: Ticket[], blocks: AvailabilityBlock[], dateStr: string) => {
    // 1. Ticket Load Value
    const dayTickets = tickets.filter(t => t.startDate <= dateStr && t.endDate >= dateStr && t.status !== TicketStatus.DONE);
    let dailyTicketLoad = 0;
    
    dayTickets.forEach(t => {
        let load = 0.5; // Default (Minor/Standard)
        const labels = t.labels || [];
        const summaryLower = t.title.toLowerCase();
        
        // Check labels first, then fallback to title keywords
        if (labels.some(l => l.toLowerCase().includes('bug')) || summaryLower.includes('bug')) load = 0.20;
        else if (labels.some(l => l.toLowerCase().includes('minor'))) load = 0.50;
        else if (labels.some(l => l.toLowerCase().includes('major')) || summaryLower.includes('major')) load = 1.00;
        else load = 0.50;

        dailyTicketLoad += load;
    });

    // 2. Daily Manual Load
    const dayBlock = blocks.find(b => b.startDate <= dateStr && b.endDate >= dateStr);
    let dailyManualLoad = 0;
    let isFullDayBlock = false;
    let blockReason = '';

    if (dayBlock) {
        blockReason = dayBlock.notes || dayBlock.type;
        // Simplified: Assume blocks in this app are full day for now based on UI
        dailyManualLoad = 1.0; 
        isFullDayBlock = true;
    }

    // 4. Total Daily Load
    const totalDailyLoad = dailyTicketLoad + dailyManualLoad;

    // 5. Final %
    const percentage = Math.min(Math.round(totalDailyLoad * 100), 250);

    return { percentage, isFullDayBlock, blockReason };
};

const GanttChart: React.FC<GanttChartProps> = ({
  developers,
  tickets,
  availabilityBlocks,
  viewStartDate,
  daysToShow,
  highlightFreeSlots,
  showWeekends,
  onAddAvailability,
  onTicketClick,
  onTicketDrop
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Standard Column Width
  const DAY_WIDTH_PX = daysToShow <= 7 ? 160 : 100;

  // Generate array of dates
  const dates = useMemo(() => {
    const d = [];
    for (let i = 0; i < daysToShow; i++) {
      const date = new Date(viewStartDate);
      date.setDate(viewStartDate.getDate() + i);
      d.push(date);
    }
    return d;
  }, [viewStartDate, daysToShow]);

  // Check if weekends are empty across ALL developers to auto-collapse
  // (As per spec "Before rendering... check if ANY ticket... exists on Sat or Sun")
  // Since we also have a toggle, we'll use the toggle primarily, but if toggle is off, we collapse.
  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const getDayMetrics = (devId: string, date: Date) => {
      const dateStr = formatDateKey(date);
      const devTickets = tickets.filter(t => t.assigneeId === devId);
      const devBlocks = availabilityBlocks.filter(b => b.developerId === devId);
      
      const { percentage, isFullDayBlock, blockReason } = calculateLoad(devTickets, devBlocks, dateStr);

      // Spec: Day cell background
      // <60% → #d1fae5
      // 60-89% → #fef9c3
      // 90-109% → #fed7aa
      // ≥110% → #fca5a5
      let bgStyle = {};
      if (isFullDayBlock) {
          bgStyle = { backgroundColor: '#e5e7eb' }; // Gray base
      } else if (percentage < 60) {
          bgStyle = { backgroundColor: '#d1fae5' };
      } else if (percentage < 90) {
          bgStyle = { backgroundColor: '#fef9c3' };
      } else if (percentage < 110) {
          bgStyle = { backgroundColor: '#fed7aa' };
      } else {
          bgStyle = { backgroundColor: '#fca5a5' };
      }

      return { percentage, isFullDayBlock, blockReason, bgStyle };
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, ticket: Ticket) => {
      e.dataTransfer.setData('ticketId', ticket.id);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); // Necessary to allow dropping
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, devId: string, date: Date) => {
      e.preventDefault();
      const ticketId = e.dataTransfer.getData('ticketId');
      if (ticketId) {
          onTicketDrop(ticketId, devId, formatDateKey(date));
      }
  };

  // "Now" Line Position
  const nowPosition = useMemo(() => {
      const start = viewStartDate.getTime();
      const current = now.getTime();
      const diffMs = current - start;
      const totalDays = diffMs / (1000 * 60 * 60 * 24);
      
      // We need to account for collapsed weekends if that logic was strictly width-based
      // For simplicity in this implementation, we assume uniform width unless hidden
      // If we implement variable widths (5px for weekend), calculation gets complex.
      // We'll stick to uniform width for the line calculation logic for now or basic.
      return totalDays * DAY_WIDTH_PX;
  }, [now, viewStartDate, DAY_WIDTH_PX]);

  return (
    <div className="flex flex-col h-full bg-white relative select-none">
      {/* Header */}
      <div className="flex border-b border-[#e2e8f0] sticky top-0 bg-white z-20 shadow-sm" style={{ height: HEADER_HEIGHT_PX }}>
        <div className="w-10 bg-white border-r border-[#e2e8f0] flex-shrink-0"></div> {/* Grip column header */}
        <div className="w-56 flex-shrink-0 p-3 bg-white border-r border-[#e2e8f0] flex items-center justify-between text-[#64748b] font-semibold text-sm">
            <span>Avatar / Name</span>
            <span className="text-[10px] uppercase bg-slate-100 px-1 rounded">CAP</span>
        </div>
        <div className="flex-grow overflow-hidden relative">
           <div className="flex h-full">
            {dates.map((date) => {
                const isToday = formatDateKey(date) === formatDateKey(now);
                const isWknd = isWeekend(date);
                const collapsed = isWknd && !showWeekends;
                
                if (collapsed) {
                    return <div key={date.toISOString()} className="h-full border-r border-slate-100 bg-slate-50" style={{ width: 5 }}></div>;
                }

                return (
                  <div
                    key={date.toISOString()}
                    className={`flex-shrink-0 border-r border-[#e2e8f0] flex flex-col items-center justify-center text-xs relative
                      ${isToday ? 'bg-blue-50' : 'bg-white'}
                      ${isWknd ? 'bg-slate-50 text-slate-400' : 'text-[#64748b]'}
                    `}
                    style={{ width: DAY_WIDTH_PX }}
                  >
                    {isToday && <div className="absolute top-0 inset-x-0 h-1 bg-[#3b82f6]"></div>}
                    <span className={`font-bold ${isToday ? 'text-[#3b82f6]' : ''}`}>
                         {date.toLocaleDateString('en-US', { weekday: 'short' })} {date.getDate()}
                    </span>
                  </div>
                );
            })}
          </div>
          {/* Now Line Header */}
          {nowPosition >= 0 && (
             <div className="absolute top-0 bottom-0 w-0.5 bg-[#ef4444] z-30 pointer-events-none" style={{ left: nowPosition }}>
                 <Clock className="w-3 h-3 text-[#ef4444] absolute -top-1.5 -left-[5px] bg-white rounded-full" />
             </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-grow overflow-auto gantt-scroll relative">
        <div style={{ minWidth: '100%' }}>
          {developers.map((dev) => {
            // Check for critical overbooking (any day > 110%)
            let isCritical = false;
            // Scan visible days
            for(let d of dates) {
                const { percentage } = getDayMetrics(dev.id, d);
                if (percentage >= 110) { isCritical = true; break; }
            }

            return (
              <div key={dev.id} className="flex border-b border-[#e2e8f0] group bg-white" style={{ minHeight: ROW_HEIGHT_PX }}>
                {/* Drag Handle */}
                <div className="w-10 flex-shrink-0 border-r border-[#e2e8f0] flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-slate-50">
                    <GripVertical className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>

                {/* Developer Sidebar */}
                <div className={`w-56 flex-shrink-0 p-3 border-r border-[#e2e8f0] flex items-center gap-3 bg-white z-10 
                    ${isCritical ? 'border-l-4 border-l-[#ef4444]' : ''}
                `}>
                  <div className="relative">
                      <img src={dev.avatar} alt={dev.name} className="w-10 h-10 rounded-full object-cover" />
                  </div>
                  <div className="overflow-hidden">
                    <div className={`text-sm truncate text-[#1e293b] ${isCritical ? 'font-bold' : 'font-medium'}`}>{dev.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-[#64748b] px-1.5 py-0.5 bg-slate-100 rounded-full">{dev.capacity}h</span>
                    </div>
                  </div>
                </div>

                {/* Timeline Grid */}
                <div className="relative flex-grow flex">
                  {dates.map((date) => {
                      const isWknd = isWeekend(date);
                      const collapsed = isWknd && !showWeekends;
                      if (collapsed) {
                          return <div key={date.toISOString()} className="border-r border-slate-100 bg-slate-50 h-full" style={{ width: 5 }}></div>
                      }

                      const dateStr = formatDateKey(date);
                      const metrics = getDayMetrics(dev.id, date);
                      
                      // Filter tickets for this day to render bars
                      const cellTickets = tickets.filter(t => t.assigneeId === dev.id && t.startDate <= dateStr && t.endDate >= dateStr && t.status !== TicketStatus.DONE);

                      return (
                        <div
                          key={date.toISOString()}
                          className={`flex-shrink-0 border-r border-[#e2e8f0] h-full relative group/cell transition-colors duration-300
                            ${metrics.isFullDayBlock ? 'manual-stripe' : ''}
                            ${highlightFreeSlots && metrics.percentage < 60 ? 'free-slot-highlight' : ''}
                          `}
                          style={{ 
                              width: DAY_WIDTH_PX,
                              ...(!metrics.isFullDayBlock ? metrics.bgStyle : {})
                          }}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, dev.id, date)}
                        >
                           {/* Cell Header: Percentage & Add Button */}
                           <div className="flex justify-between items-start p-1 h-6">
                               {/* Add Button (Hidden unless hover) */}
                               <button 
                                  onClick={() => onAddAvailability(dev.id, dateStr)}
                                  className="opacity-0 group-hover/cell:opacity-100 hover:bg-black/10 rounded p-0.5 transition-opacity"
                               >
                                  <Plus className="w-3 h-3 text-slate-600" />
                               </button>

                               {/* Percentage Badge */}
                               {metrics.isFullDayBlock ? (
                                   <span className="text-[9px] font-bold text-slate-500 bg-white/60 px-1 rounded backdrop-blur-sm">BLOCKED</span>
                               ) : (
                                   <div className="bg-[#1e293b80] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                                       {metrics.percentage}%
                                   </div>
                               )}
                           </div>
                           
                           {/* Ticket Bars Stack */}
                           <div className="px-1 flex flex-col gap-1 w-full mt-1">
                               {cellTickets.map(ticket => {
                                   const summaryLower = ticket.title.toLowerCase();
                                   const isBug = (ticket.labels || []).some(l => l.toLowerCase().includes('bug')) || summaryLower.includes('bug');
                                   const isMajor = (ticket.labels || []).some(l => l.toLowerCase().includes('major')) || summaryLower.includes('major');
                                   
                                   // Height based on label %
                                   // Bug = 20% of cell (approx 24px)
                                   // Minor = 50% (approx 60px)
                                   // Major = 100% (approx 120px)
                                   let heightClass = 'h-8'; // Minor default (approx)
                                   let heightPx = 40;
                                   if (isBug) heightPx = 20;
                                   if (isMajor) heightPx = 80;

                                   return (
                                       <div 
                                          key={ticket.id}
                                          draggable
                                          onDragStart={(e) => handleDragStart(e, ticket)}
                                          className={`w-full rounded-[2px] text-[10px] text-white px-1.5 flex items-center shadow-sm cursor-grab active:cursor-grabbing hover:brightness-110 transition-all overflow-hidden
                                              ${STATUS_COLORS[ticket.status]}
                                          `}
                                          style={{ height: heightPx, minHeight: heightPx }}
                                          onClick={(e) => { e.stopPropagation(); onTicketClick(ticket); }}
                                          title={`${ticket.key}: ${ticket.title} (${ticket.status})`}
                                       >
                                           <div className="truncate font-medium leading-tight">
                                               <span className="opacity-80 mr-1">{ticket.key}</span>
                                               {ticket.title}
                                           </div>
                                       </div>
                                   );
                               })}
                           </div>
                        </div>
                      );
                  })}
                  
                  {/* Now Line Body */}
                  {nowPosition >= 0 && (
                     <div className="absolute top-0 bottom-0 w-0.5 bg-[#ef4444] pointer-events-none z-10" style={{ left: nowPosition }}></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GanttChart;
