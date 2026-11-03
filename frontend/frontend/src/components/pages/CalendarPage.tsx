import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, MapPin, Plus, ChevronLeft, ChevronRight, Trash2, X, Check, Download } from 'lucide-react';
import { CompanionService } from '../../services/companion.service';
import { useCompanionStore } from '../../store/companion.store';
import { authApi } from '../../services/authApi';
import { showToast } from '../shell/Toast';

interface CalendarEvent {
  id: string; title: string; start: string; end: string;
  color: string; description: string; location: string;
  has_time?: boolean;
  provider?: string | null;
  provider_event_id?: string | null;
  sync_status?: string | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CalendarPage: React.FC<{ onChatNavigate: (msg: string) => void }> = ({ onChatNavigate }) => {
  const userId = useCompanionStore(s => s.userId);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(new Date());
  const [eventFilter, setEventFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');

  // Provider Connection State for Calendar Sync
  const [googleCalendarActive, setGoogleCalendarActive] = useState(false);
  const [googleIdentityOnly, setGoogleIdentityOnly] = useState(false);
  const [msActive, setMsActive] = useState(false);

  useEffect(() => {
    authApi.getConnections().then(data => {
      const g = data.connections?.find(c => c.provider.toLowerCase() === 'google' && (c.status === 'active' || c.status === 'connected'));
      const m = data.connections?.find(c => c.provider.toLowerCase() === 'microsoft' && (c.status === 'active' || c.status === 'connected'));

      const hasGoogleCalScope = Boolean(g?.scopes?.some((s: string) => s.toLowerCase().includes('calendar')));
      setGoogleCalendarActive(Boolean(g && hasGoogleCalScope));
      setGoogleIdentityOnly(Boolean(g && !hasGoogleCalScope));
      setMsActive(Boolean(m));
    }).catch(() => {});
  }, []);

  // Add Event Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('10:00');
  const [newLocation, setNewLocation] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CompanionService.getCalendarEvents(userId);
      setEvents(data.events || []);
    } catch { setEvents([]); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || submitting) return;

    setSubmitting(true);
    try {
      const startIso = newStartTime ? `${newDate}T${newStartTime}:00` : newDate;
      const endIso = newEndTime ? `${newDate}T${newEndTime}:00` : newDate;
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

      const res = await CompanionService.createCalendarEvent(
        newTitle.trim(),
        startIso,
        endIso,
        newLocation.trim(),
        newDescription.trim(),
        '#7c5cfc',
        userId,
        userTimezone
      );

      if (res && res.event) {
        setEvents(prev => [...prev, res.event]);
      } else {
        await fetchEvents();
      }

      const eventTimeStr = newStartTime ? ` at ${newStartTime}` : '';
      const notifObj = {
        title: `📅 Calendar: ${newTitle.trim()}`,
        text: `Event '${newTitle.trim()}' scheduled for ${newDate}${eventTimeStr}. Advance reminder set!`,
        message: `Event '${newTitle.trim()}' scheduled for ${newDate}${eventTimeStr}. Advance reminder set!`,
        type: 'calendar',
        role: 'mitra'
      };

      // 1. Update Raj's UI TopBar Notification Bell & List
      useCompanionStore.getState().addNotification({
        type: 'info',
        title: notifObj.title,
        body: notifObj.text,
        read: false
      });

      // 2. Update Floating Orb & Chatbot Window & Drawer
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mitra:notification', { detail: notifObj }));
        const bus = (window as any).__mitra_event_bus;
        if (bus && typeof bus.emit === 'function') {
          bus.emit('notification.received', notifObj);
        }
      }

      const syncStatusMsg = res?.sync_status || 'Saved only in Mitra';
      if (res?.synchronized) {
        showToast('success', 'Event Created', `"${newTitle.trim()}" — Event created and synced to Google Calendar.`);
      } else if (syncStatusMsg.toLowerCase().includes('permission required') || syncStatusMsg.toLowerCase().includes('permission')) {
        showToast('warning', 'Saved in Mitra', `"${newTitle.trim()}" — Google Calendar permission is required. Connect Google Calendar in Integrations.`);
      } else if (syncStatusMsg.toLowerCase().includes('sync failed') || syncStatusMsg.toLowerCase().includes('failed') || syncStatusMsg.toLowerCase().includes('disabled')) {
        showToast('warning', 'Saved in Mitra', `"${newTitle.trim()}" — Event saved in Mitra, but Google Calendar sync failed. Please try Sync again.`);
      } else {
        showToast('success', 'Event Created', `"${newTitle.trim()}" — Saved only in Mitra. Connect Google Calendar or Microsoft Calendar to sync externally.`);
      }

      setNewTitle('');
      setNewLocation('');
      setNewDescription('');
      setShowAddForm(false);
    } catch (err: any) {
      console.error('Failed to create event:', err);
      const msg = err?.message || 'Failed to create calendar event.';
      showToast('error', 'Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteEvent = async (eventId: string) => {
    try {
      setEvents(prev => prev.filter(e => e.id !== eventId));
      await CompanionService.deleteCalendarEvent(eventId, userId);
      showToast('info', 'Event Deleted', 'Calendar event removed.');
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('error', 'Error', 'Failed to delete event.');
    }
  };

  const downloadIcs = (event: CalendarEvent) => {
    const formatIcsDate = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const start = formatIcsDate(event.start);
    const end = formatIcsDate(event.end || event.start);
    const uid = `${event.id || Math.random().toString(36).slice(2)}@mitra.ai`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mitra AI//Companion Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${(event.title || 'Event').replace(/\n/g, ' ')}`,
      `DESCRIPTION:${(event.description || 'Created via Mitra AI Companion').replace(/\n/g, ' ')}`,
      `LOCATION:${(event.location || '').replace(/\n/g, ' ')}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${(event.title || 'event').replace(/[^a-zA-Z0-9_-]/g, '_')}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('info', 'Calendar File (.ics)', 'Downloaded .ics event. Open to add to Apple Calendar or native device calendar.');
  };

  const handleClearPast = async () => {
    try {
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
      const res = await CompanionService.clearPastCalendarEvents(userId);
      setEvents(prev => prev.filter(e => new Date(e.start) >= todayStart));
      showToast('success', 'Past Events Cleared', `Removed ${res.deleted_count || 0} past events.`);
    } catch (err) {
      console.error('Failed to clear past events:', err);
      showToast('error', 'Cleanup Failed', 'Could not clear past events.');
    }
  };

  const todayStr = new Date().toDateString();
  const weekStart = new Date(viewDate);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const goToPrevWeek = () => {
    setViewDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const goToNextWeek = () => {
    setViewDate(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToToday = () => setViewDate(new Date());

  const getEventsForDay = (day: Date) =>
    events.filter(e => new Date(e.start).toDateString() === day.toDateString());

  const formatTime = (iso: string, hasTime?: boolean) => {
    if (hasTime === false || !iso || !iso.includes('T')) return 'No time set';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const filteredEvents = events
    .filter(e => {
      const evDate = new Date(e.start);
      if (eventFilter === 'upcoming') return evDate >= todayStart;
      if (eventFilter === 'past') return evDate < todayStart;
      return true;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const pastEventsCount = events.filter(e => new Date(e.start) < todayStart).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="page-container pb-6 px-3 sm:px-6"
    >
      {/* Header — Fully Responsive on Mobile */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4 border-b border-border-subtle pb-4">
        <div className="flex items-center gap-3">
          <div className="page-icon"><Calendar size={20} /></div>
          <div>
            <h1 className="page-title text-base sm:text-xl font-bold">Calendar</h1>
            <p className="page-subtitle text-xs text-text-muted">{viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-between sm:justify-end">
          {pastEventsCount > 0 && (
            <button
              onClick={handleClearPast}
              className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-2xs font-semibold flex items-center gap-1 transition-colors"
              title="Delete all events before today"
            >
              <Trash2 size={12} /> Clear ({pastEventsCount})
            </button>
          )}
          <div className="flex items-center gap-1">
            <button onClick={goToPrevWeek} className="page-btn-icon p-1.5" aria-label="Previous week"><ChevronLeft size={16} /></button>
            <button onClick={goToToday} className="page-btn-sm text-2xs py-1 px-2.5">Today</button>
            <button onClick={goToNextWeek} className="page-btn-icon p-1.5" aria-label="Next week"><ChevronRight size={16} /></button>
          </div>
          <button
            onClick={() => setShowAddForm(prev => !prev)}
            className="page-btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
          >
            <Plus size={14} /> Add Event
          </button>
        </div>
      </div>

      {/* Mobile-Optimized Inline Add Event Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.form
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            onSubmit={handleCreateEvent}
            className="mb-6 p-3 sm:p-4 rounded-xl bg-surface-elevated border border-brand/30 flex flex-col gap-3 shadow-xl w-full max-w-full overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <h3 className="text-xs sm:text-sm font-semibold text-text-primary flex items-center gap-2">
                <Calendar size={16} className="text-brand-light flex-shrink-0" /> Create Calendar Event
              </h3>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-text-muted hover:text-text-primary p-1 flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2.5 w-full max-w-full min-w-0 overflow-hidden">
              <div className="min-w-0 w-full overflow-hidden">
                <label className="block text-2xs text-text-muted mb-1 font-medium truncate">Event Title *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="e.g. Ganesh Utsav / Client Meeting"
                  className="form-input-responsive bg-surface-overlay border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-brand w-full max-w-full min-w-0"
                />
              </div>

              <div className="min-w-0 w-full overflow-hidden date-time-input-container">
                <label className="block text-2xs text-text-muted mb-1 font-medium truncate text-center">Date *</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="bg-surface-overlay border border-border-subtle rounded-xl px-2 py-2 text-xs text-text-primary focus:outline-none focus:border-brand w-full min-w-0 max-w-full text-center font-medium box-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full max-w-full min-w-0 overflow-hidden box-border">
                <div className="min-w-0 w-full overflow-hidden date-time-input-container">
                  <label className="block text-2xs text-text-muted mb-1 font-medium truncate text-center">Start Time</label>
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={e => setNewStartTime(e.target.value)}
                    className="bg-surface-overlay border border-border-subtle rounded-xl px-2 py-2 text-xs text-text-primary focus:outline-none focus:border-brand w-full min-w-0 max-w-full text-center font-medium box-border"
                  />
                </div>

                <div className="min-w-0 w-full overflow-hidden date-time-input-container">
                  <label className="block text-2xs text-text-muted mb-1 font-medium truncate text-center">End Time</label>
                  <input
                    type="time"
                    value={newEndTime}
                    onChange={e => setNewEndTime(e.target.value)}
                    className="bg-surface-overlay border border-border-subtle rounded-xl px-2 py-2 text-xs text-text-primary focus:outline-none focus:border-brand w-full min-w-0 max-w-full text-center font-medium box-border"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full pt-3 border-t border-border-subtle/50">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="w-full py-2 rounded-xl border border-border-subtle text-xs text-text-muted hover:bg-surface-overlay font-medium transition-all text-center cursor-pointer active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !newTitle.trim()}
                className="w-full py-2 rounded-xl bg-brand text-white text-xs font-semibold hover:bg-brand-light transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Check size={14} /> {submitting ? 'Saving...' : 'Save Event'}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Grid view */}
      {loading ? (
        <div className="page-loading py-8 text-center text-xs text-text-muted">Loading events...</div>
      ) : (
        <>
          {/* Synchronization & Mobile Platform Notice Banner */}
          <div className="mb-4 p-3.5 rounded-2xl bg-surface-overlay border border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand shrink-0 mt-0.5 sm:mt-0">
                <Calendar size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap font-semibold text-text-primary text-xs">
                  <span>Calendar Cloud Sync</span>
                  {googleCalendarActive ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium">
                      ● Google Calendar Connected
                    </span>
                  ) : googleIdentityOnly ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-medium">
                      ⚠ Google Account Connected (Calendar access required)
                    </span>
                  ) : msActive ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium">
                      ● Outlook Calendar Active
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-medium">
                      ○ Saved Only in Mitra (Local)
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-medium">
                    🍏 Native Device: .ics Export
                  </span>
                </div>
                <p className="text-2xs text-text-muted mt-0.5 leading-relaxed">
                  Notice: Web applications cannot write directly to native mobile device calendars without an active Google Calendar or Microsoft Outlook connection. Use the .ics button to import events directly into Apple Calendar.
                </p>
              </div>
            </div>

            {(!googleCalendarActive && !msActive) && (
              <button
                type="button"
                onClick={() => (window as any).__MITRA_INTEGRATIONS__?.()}
                className="px-3 py-1.5 rounded-xl bg-surface-raised hover:bg-surface-elevated border border-border-subtle hover:border-brand/40 text-text-primary text-xs font-semibold whitespace-nowrap cursor-pointer transition-all active:scale-95 shrink-0"
              >
                {googleIdentityOnly ? 'Connect Google Calendar' : 'Connect Calendar'}
              </button>
            )}
          </div>

          <div className="calendar-week-strip mb-6 overflow-x-auto pb-2 flex gap-2">
            {weekDays.map(day => {
              const isToday = day.toDateString() === todayStr;
              const dayEvents = getEventsForDay(day);

              return (
                <div key={day.toISOString()} className={`calendar-day-col ${isToday ? 'is-today' : ''}`}>
                  <div className="calendar-day-header">
                    <span className="day-name">{DAYS[day.getDay()]}</span>
                    <span className={`day-number ${isToday ? 'today-pill' : ''}`}>{day.getDate()}</span>
                  </div>
                  <div className="calendar-day-events">
                    {dayEvents.map(ev => (
                      <div
                        key={ev.id}
                        className="calendar-event-chip group relative flex items-center justify-between gap-1 pr-1"
                        style={{ borderLeftColor: ev.color }}
                        title={`${ev.title} (${formatTime(ev.start, ev.has_time)})`}
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="event-time">{formatTime(ev.start, ev.has_time)}</span>
                          <span className="event-title truncate">{ev.title}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteEvent(ev.id);
                          }}
                          className="opacity-60 hover:opacity-100 p-0.5 rounded text-text-muted hover:text-red-400 transition-opacity"
                          title="Delete Event"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {dayEvents.length === 0 && (
                      <span className="no-events-text">No events</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Filter Bar & Event list */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-1">
              {(['upcoming', 'past', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setEventFilter(f)}
                  className={`px-2.5 py-1 rounded-full text-2xs capitalize transition-colors ${
                    eventFilter === f
                      ? 'bg-brand-muted text-brand-light font-semibold border border-brand/30'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {f} ({
                    f === 'upcoming' ? events.filter(e => new Date(e.start) >= todayStart).length :
                    f === 'past' ? events.filter(e => new Date(e.start) < todayStart).length :
                    events.length
                  })
                </button>
              ))}
            </div>
          </div>

          {filteredEvents.length === 0 ? (
            <div className="page-empty py-10 flex flex-col items-center gap-2">
              <Calendar size={32} className="text-text-muted" />
              <p className="text-xs text-text-muted">No {eventFilter} events</p>
              <button onClick={() => setShowAddForm(true)} className="page-btn-primary mt-1 text-xs py-1.5 px-3">
                <Plus size={14} /> Add Event
              </button>
            </div>
          ) : (
            <div className="page-card-list flex flex-col gap-2.5">
              {filteredEvents.map(ev => (
                <motion.div key={ev.id} className="page-card p-3 rounded-xl bg-surface-elevated border border-border-subtle" whileHover={{ scale: 1.005 }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div
                        className="w-2 h-9 rounded-full flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: ev.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="page-card-title text-xs font-semibold text-text-primary truncate">{ev.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-2xs text-text-muted flex-wrap">
                          <span className="flex items-center gap-1 font-medium text-text-secondary">
                            <Clock size={11} className="text-brand-light" />
                            {new Date(ev.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime(ev.start, ev.has_time)}
                          </span>
                          {ev.location && (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin size={11} /> {ev.location}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            ev.sync_status?.toLowerCase().includes('fail') || ev.sync_status?.toLowerCase().includes('error')
                              ? 'bg-red-500/10 border-red-500/30 text-red-400'
                              : ev.sync_status === 'Created in Google Calendar' || ev.sync_status === 'Synchronized with Google Calendar' || ev.provider === 'google'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : ev.sync_status === 'Created in Microsoft Calendar' || ev.sync_status === 'Synchronized with Microsoft Calendar' || ev.provider === 'microsoft'
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          }`}>
                            {ev.sync_status?.toLowerCase().includes('fail') || ev.sync_status?.toLowerCase().includes('error')
                              ? (ev.sync_status || 'Sync failed')
                              : (ev.sync_status === 'Created in Google Calendar' || ev.provider === 'google')
                              ? 'Synced to Google Calendar'
                              : (ev.sync_status === 'Created in Microsoft Calendar' || ev.provider === 'microsoft')
                              ? 'Synced to Microsoft Calendar'
                              : 'Saved only in Mitra'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => downloadIcs(ev)}
                        className="text-text-muted hover:text-brand-light p-1.5 rounded-lg hover:bg-brand/10 transition-colors cursor-pointer"
                        title="Add to Apple Calendar / Device (.ics)"
                        aria-label="Download .ics event"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => deleteEvent(ev.id)}
                        className="text-text-muted hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0 cursor-pointer"
                        title="Delete event"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
};

export default CalendarPage;
