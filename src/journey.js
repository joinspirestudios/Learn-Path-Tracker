const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = ['active', 'completed', 'missed', 'frozen'];
const SCHEDULE_TYPES = ['once', 'daily'];

export function localDateString(date = new Date()){
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(value){
  if(!value) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  if(!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function addDaysToDateString(value, days){
  const d = parseLocalDate(value);
  if(!d) return null;
  d.setDate(d.getDate() + Number(days || 0));
  return localDateString(d);
}

export function daysBetween(startDate, endDate){
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if(!start || !end) return 0;
  return Math.floor((end - start) / DAY_MS);
}

export function journeyDayForDate(startDate, today = localDateString()){
  if(!startDate) return 0;
  return Math.max(1, daysBetween(startDate, today) + 1);
}

export function dateForJourneyDay(startDate, dayNumber){
  if(!startDate) return null;
  return addDaysToDateString(startDate, Math.max(0, Number(dayNumber || 1) - 1));
}

export function inferDurationDays(label){
  const text = String(label || '').toLowerCase();
  const days = text.match(/(\d+)\s*days?/);
  if(days) return Number(days[1]);
  const weeks = text.match(/(\d+)\s*weeks?/);
  if(weeks) return Number(weeks[1]) * 7;
  const months = text.match(/(\d+)\s*months?/);
  if(months) return Number(months[1]) === 12 ? 365 : Number(months[1]) * 30;
  const years = text.match(/(\d+)\s*years?/);
  if(years) return Number(years[1]) * 365;
  if(text.includes('1 year') || text.includes('one year')) return 365;
  return null;
}

export function normalizeDurationDays(value, label = ''){
  const n = Number(value);
  if(Number.isFinite(n) && n > 0) return Math.round(n);
  return inferDurationDays(label);
}

function cleanScheduleType(task){
  if(SCHEDULE_TYPES.includes(task.scheduleType)) return task.scheduleType;
  if(task.unlockDay != null || task.startDay != null) return 'once';
  return null;
}

function normalizeDay(value){
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function normalizeTaskSchedule(task, fallbackDay, durationDays){
  const scheduleType = cleanScheduleType(task);
  const unlockDay = normalizeDay(task.unlockDay);
  const startDay = normalizeDay(task.startDay);
  const endDay = normalizeDay(task.endDay);
  if(scheduleType === 'daily'){
    const start = startDay || unlockDay || 1;
    return {
      ...task,
      scheduleType: 'daily',
      startDay: start,
      endDay: endDay || durationDays || start,
      unlockDay: unlockDay || start,
    };
  }
  const onceDay = unlockDay || startDay || fallbackDay || 1;
  return {
    ...task,
    scheduleType: scheduleType || 'once',
    startDay: startDay || onceDay,
    endDay: endDay,
    unlockDay: onceDay,
  };
}

export function getPathTasks(pathOrTasks, pathId = 'path'){
  const durationDays = Array.isArray(pathOrTasks)
    ? null
    : normalizeDurationDays(pathOrTasks?.durationDays, pathOrTasks?.durationLabel);
  if(Array.isArray(pathOrTasks)){
    const hasSchedule = pathOrTasks.some(task => task.scheduleType || task.unlockDay != null || task.startDay != null);
    return pathOrTasks.map((task, index) => normalizeTaskSchedule({
        ...task,
        id: task.id || `${pathId}:task:${index}`,
        title: task.title || task.text || `Task ${index + 1}`,
        order: task.order == null ? index : task.order,
      },
      hasSchedule ? 1 : index + 1,
      null
    ));
  }
  const raw = [];
  (pathOrTasks?.weeks || []).forEach((week, wi) => {
    (week.tasks || []).forEach((task, ti) => {
      raw.push({
        ...task,
        id: task.id || `${pathId}:w${wi}:t${ti}`,
        title: task.title || task.text || `Task ${raw.length + 1}`,
        weekIndex: wi,
        taskIndex: ti,
        sectionTitle: week.title || `Section ${wi + 1}`,
        order: raw.length,
      });
    });
  });
  const hasSchedule = raw.some(task => task.scheduleType || task.unlockDay != null || task.startDay != null);
  return raw.map((task, index) => ({
    ...normalizeTaskSchedule(task, hasSchedule ? 1 : index + 1, durationDays),
    order: task.order == null ? index : task.order,
  })).filter(task => task.kind !== 'resource');
}

export function getTasksForDay(pathTasks, dayNumber){
  const day = Number(dayNumber || 1);
  return getPathTasks(pathTasks).filter(task => {
    if(task.scheduleType === 'daily'){
      const start = Number(task.startDay || task.unlockDay || 1);
      const end = Number(task.endDay || start);
      return day >= start && day <= end;
    }
    return Number(task.unlockDay || task.startDay || 1) === day;
  });
}

export function getMaxRoadmapDay(pathOrTasks, enrollment){
  const tasks = getPathTasks(pathOrTasks);
  const durationDays = Array.isArray(pathOrTasks)
    ? null
    : normalizeDurationDays(pathOrTasks?.durationDays, pathOrTasks?.durationLabel);
  const maxTaskDay = tasks.reduce((max, task) => {
    if(task.scheduleType === 'daily') return Math.max(max, Number(task.endDay || task.startDay || task.unlockDay || 1));
    return Math.max(max, Number(task.unlockDay || task.startDay || 1));
  }, 1);
  const currentDay = Number(enrollment?.currentDay || 1);
  const lastCompleted = enrollment?.lastCompletedDay == null ? 0 : Number(enrollment.lastCompletedDay);
  const calculatedToday = enrollment?.startDate ? journeyDayForDate(enrollment.startDate) : 1;
  return Math.max(durationDays || 0, 7, maxTaskDay, currentDay + 6, calculatedToday + 6, lastCompleted);
}

export function getDayStatus(dayNumber, enrollment, dayLogs = {}, today = localDateString()){
  const day = Number(dayNumber || 1);
  const log = dayLogs[day] || dayLogs[String(day)];
  if(['completed', 'missed', 'frozen'].includes(log?.status)) return log.status;
  if(!enrollment?.startDate) return 'locked';
  const activeCalendarDay = journeyDayForDate(enrollment.startDate, today);
  const currentDay = Number(enrollment.currentDay || 1);
  if(day === activeCalendarDay && day === currentDay) return 'active';
  if(day < activeCalendarDay && day <= currentDay) return 'missed';
  return 'locked';
}

export function canOpenDay(dayNumber, status){
  return OPEN_STATUSES.includes(status);
}

export function canCompleteDay(dayNumber, enrollment, today = localDateString()){
  if(!enrollment?.startDate || enrollment.status !== 'active') return false;
  const day = Number(dayNumber || 1);
  return day === Number(enrollment.currentDay || 1)
    && day === journeyDayForDate(enrollment.startDate, today);
}
