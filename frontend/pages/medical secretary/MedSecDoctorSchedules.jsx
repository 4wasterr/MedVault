import React, { useEffect, useMemo, useState } from 'react';
import MedSecShell from './MedSecShell';
import { useDraftState } from '../../client/src/useDraftState';
import { isBookingUnavailable, dateKey, displayDate, displayTime, getSchedule, hasBooking, scheduleKey, slotsBetween, timeMinutes, todayISO } from './medsecData';

export default function MedSecDoctorSchedules({ onNavigate, onLogout, appointments = [], schedules = {}, setSchedules, doctors: managedDoctors = [], username }) {
  const doctors = managedDoctors.filter((item) => item.active && (!item.secretaryUsername || item.secretaryUsername === username)).map((item) => item.name);
  const defaultDoctor = doctors[0] || '';
  const [doctor, setDoctor] = useDraftState('schedules:doctor', defaultDoctor);
  const [date, setDate] = useDraftState('schedules:date', todayISO());
  const [scheduleSnapshot, setScheduleSnapshot] = useDraftState('schedules:scheduleSnapshot', () => getSchedule(schedules, defaultDoctor, todayISO()));
  const [start, setStart] = useDraftState('schedules:start', '08:00');
  const [end, setEnd] = useDraftState('schedules:end', '17:00');
  const [blockStart, setBlockStart] = useDraftState('schedules:blockStart', '12:00');
  const [blockEnd, setBlockEnd] = useDraftState('schedules:blockEnd', '13:00');
  const [reason, setReason] = useDraftState('schedules:reason', 'Unavailable');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const key = scheduleKey(doctor, date);
  const schedule = getSchedule(schedules, doctor, date);
  const slots = useMemo(() => slotsBetween(schedule.start, schedule.end), [schedule.start, schedule.end]);
  const bookedCount = slots.filter((slot) => hasBooking(appointments, doctor, date, slot)).length;
  const blockedCount = slots.filter(slot => !hasBooking(appointments, doctor, date, slot) && isBookingUnavailable(schedules, [], doctor, date, slot)).length;

  const chooseSchedule = (nextDoctor, nextDate) => {
    const next = getSchedule(schedules, nextDoctor, nextDate);
    setDoctor(nextDoctor); setDate(nextDate);
    setScheduleSnapshot(next);
    setStart(next.start); setEnd(next.end); setError(''); setMessage('');
  };

  useEffect(() => {
    if (!doctors.includes(doctor)) chooseSchedule(doctors[0] || '', date);
  }, [doctors.join('|'), doctor, date]);

  const saveAvailability = (event) => {
    event.preventDefault();
    if (JSON.stringify(schedule) !== JSON.stringify(scheduleSnapshot)) {
      setError('This schedule changed in another session. Select the doctor and date again to review it.'); return;
    }
    const first = timeMinutes(start);
    const last = timeMinutes(end);
    if (!date || !Number.isFinite(first) || !Number.isFinite(last) || last - first < 30) {
      setError('Choose valid operating hours with room for at least one 30-minute appointment.'); return;
    }
    const excludedBooking = appointments.find((appointment) =>
      appointment.doctor === doctor && dateKey(appointment.date) === date &&
      !['Open', 'Cancelled'].includes(appointment.status) && (timeMinutes(appointment.time) < first || timeMinutes(appointment.time) + 30 > last)
    );
    if (excludedBooking) { setError('This change would remove an already booked time. Reschedule that appointment first.'); return; }
    const blocked = Object.fromEntries(Object.entries(schedule.blocked || {}).filter(([slot]) => timeMinutes(slot) >= first && timeMinutes(slot) + 30 <= last));
    const nextSchedule = { doctor, date, start, end, blocked, blockedPeriods: (schedule.blockedPeriods || []).filter(period => timeMinutes(period.start) >= first && timeMinutes(period.end) <= last) };
    setSchedules((current) => ({ ...current, [key]: nextSchedule }));
    setScheduleSnapshot(nextSchedule);
    setError(''); setMessage(`Availability saved for ${doctor} on ${displayDate(date)}.`);
  };

  const blockPeriod = (event) => {
    event.preventDefault();
    if (JSON.stringify(schedule) !== JSON.stringify(scheduleSnapshot)) {
      setError('This schedule changed in another session. Select the doctor and date again to review it.'); return;
    }
    const first = timeMinutes(blockStart);
    const last = timeMinutes(blockEnd);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first >= last || first < timeMinutes(schedule.start) || last > timeMinutes(schedule.end)) {
      setError('Choose a valid period within the doctor operating hours.'); return;
    }
    if (appointments.some(item => item.doctor === doctor && dateKey(item.date) === date && !['Open', 'Cancelled'].includes(item.status) && timeMinutes(item.time) < last && timeMinutes(item.time) + 30 > first)) {
      setError('A booked appointment falls in this period. Reschedule it before blocking.'); return;
    }
    const nextSchedule = { ...schedule, doctor, date, blockedPeriods: [...(schedule.blockedPeriods || []), { start: blockStart, end: blockEnd, reason: reason.trim() || 'Unavailable' }] };
    setSchedules((current) => ({ ...current, [key]: nextSchedule }));
    setScheduleSnapshot(nextSchedule);
    setError(''); setMessage('Unavailable period saved.');
  };

  const toggleSlot = (slot) => {
    if (JSON.stringify(schedule) !== JSON.stringify(scheduleSnapshot)) {
      setError('This schedule changed in another session. Select the doctor and date again to review it.'); return;
    }
    if (hasBooking(appointments, doctor, date, slot)) return;
    if ((schedule.blockedPeriods || []).some(period => timeMinutes(slot) < timeMinutes(period.end) && timeMinutes(slot) + 30 > timeMinutes(period.start))) { setError('Use Unblock period to remove this unavailable period.'); return; }
    const blocked = { ...schedule.blocked };
    if (blocked[slot]) delete blocked[slot]; else blocked[slot] = reason.trim() || 'Unavailable';
    const nextSchedule = { ...schedule, doctor, date, blocked };
    setSchedules((current) => ({ ...current, [key]: nextSchedule }));
    setScheduleSnapshot(nextSchedule);
    setError(''); setMessage(blocked[slot] ? `${displayTime(slot)} blocked.` : `${displayTime(slot)} is available again.`);
  };

  return <MedSecShell active="schedules" title="Doctor Schedules" subtitle="Daily operating hours and precise unavailable periods" onNavigate={onNavigate} onLogout={onLogout}>
    {!doctors.length && <p className="medsec-notice">No active doctors are currently available for your schedule access.</p>}
    {doctors.length > 0 && <div className="medsec-grid medsec-schedule-grid">
      <section className="medsec-panel">
        <h2>Availability</h2>
        <div className="medsec-form-grid">
          <label className="medsec-field"><span>Doctor</span><select value={doctor} onChange={(event) => chooseSchedule(event.target.value, date)}>{doctors.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="medsec-field"><span>Date</span><input type="date" value={date} onChange={(event) => chooseSchedule(doctor, event.target.value)} /></label>
        </div>
        <div className="medsec-section-divider" />
        <form onSubmit={saveAvailability}>
          <h3>Set daily hours</h3>
          <div className="medsec-form-grid">
            <label className="medsec-field"><span>Start</span><input type="time" step="60" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            <label className="medsec-field"><span>End</span><input type="time" step="60" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          </div>
          <div className="medsec-actions"><button type="submit" className="medsec-btn">Save Availability</button></div>
        </form>
        <div className="medsec-section-divider" />
        <form onSubmit={blockPeriod}>
          <h3>Block unavailable period</h3>
          <div className="medsec-form-grid">
            <label className="medsec-field"><span>From</span><input type="time" step="60" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} /></label>
            <label className="medsec-field"><span>Until</span><input type="time" step="60" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} /></label>
            <label className="medsec-field wide"><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Unavailable" /></label>
          </div>
          <div className="medsec-actions"><button type="submit" className="medsec-btn secondary">Block Period</button></div>
        </form>
        {error && <p className="medsec-error" role="alert">{error}</p>}
        {message && <p className="medsec-notice" role="status">{message}</p>}
      </section>

      <section className="medsec-panel">
        <div className="medsec-panel-heading"><div><span className="medsec-muted">{doctor} · {displayDate(date)}</span><h2>30-minute slots</h2></div>
          <button type="button" className="medsec-btn secondary" onClick={() => onNavigate('appointments')}>View Bookings</button></div>
        <div className="medsec-schedule-stats">
          <span className="medsec-badge">{slots.length - blockedCount - bookedCount} available</span>
          <span className="medsec-badge blocked">{blockedCount} blocked</span>
          <span className="medsec-badge consultation">{bookedCount} booked</span>
        </div>
        <p className="medsec-muted">Click an available slot to block it, or a blocked slot to make it available again. Booked slots are protected.</p>
        <div>{(schedule.blockedPeriods || []).map((period, index) => <div className="medsec-info-row" key={index}><span>{displayTime(period.start)}?{displayTime(period.end)} ? {period.reason}</span><button type="button" className="medsec-btn outline" onClick={() => { if (JSON.stringify(schedule) !== JSON.stringify(scheduleSnapshot)) { setError('This schedule changed. Select it again before editing.'); return; } const next = { ...schedule, blockedPeriods: schedule.blockedPeriods.filter((_, i) => i !== index) }; setSchedules(current => ({ ...current, [key]: next })); setScheduleSnapshot(next); }}>Unblock period</button></div>)}</div>
        <div className="medsec-slot-grid">
          {slots.map((slot) => {
            const booked = hasBooking(appointments, doctor, date, slot);
            const blocked = schedule.blocked?.[slot] || (isBookingUnavailable(schedules, [], doctor, date, slot) ? 'Unavailable period' : '');
            return <button key={slot} type="button" disabled={booked} className={`medsec-slot ${booked ? 'booked' : blocked ? 'blocked' : 'available'}`}
              onClick={() => toggleSlot(slot)} title={booked ? 'Booked appointment' : blocked ? 'Click to unblock' : 'Click to block'}>
              <strong>{displayTime(slot)}</strong><small>{booked ? 'Booked' : blocked || 'Available'}</small>
            </button>;
          })}
          {!slots.length && <p className="medsec-muted">Set valid availability to generate slots.</p>}
        </div>
      </section>
    </div>}
  </MedSecShell>;
}
