const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = ['active', 'completed', 'missed', 'frozen'];

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

export function getPathTasks(pathOrTasks, pathId = 'path'){
  if(Array.isArray(pathOrTasks)){
    return pathOrTasks.map((task, index) => ({
      ...task,
      id: task.id || `${pathId}:task:${index}`,
      title: task.title || task.text || `Task ${index + 1}`,
      unlockDay: task.unlockDay == null ? (task.assignedDay || 1) : Number(task.unlockDay),
      order: task.order == null ? index : task.order,
    }));
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
  const hasUnlockDays = raw.some(task => task.unlockDay != null && Number(task.unlockDay) > 0);
  return raw.map((task, index) => ({
    ...task,
    unlockDay: task.unlockDay != null && Number(task.unlockDay) > 0
      ? Number(task.unlockDay)
      : (hasUnlockDays ? 1 : index + 1),
  }));
}

export function getTasksForDay(pathTasks, dayNumber){
  const day = Number(dayNumber || 1);
  return getPathTasks(pathTasks).filter(task => Number(task.unlockDay || 1) === day);
}

export function getMaxRoadmapDay(pathTasks, enrollment){
  const tasks = getPathTasks(pathTasks);
  const maxTaskDay = tasks.reduce((max, task) => Math.max(max, Number(task.unlockDay || 1)), 1);
  const currentDay = Number(enrollment?.currentDay || 1);
  const lastCompleted = enrollment?.lastCompletedDay == null ? 0 : Number(enrollment.lastCompletedDay);
  const calculatedToday = enrollment?.startDate ? journeyDayForDate(enrollment.startDate) : 1;
  return Math.max(7, maxTaskDay, currentDay + 6, calculatedToday + 6, lastCompleted);
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
