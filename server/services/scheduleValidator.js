/**
 * Validates a generated schedule against hard constraints.
 * Returns { valid: boolean, issues: Issue[] }
 *
 * Issue shape: { type, severity, day, item_index?, message }
 * severity: "error" (schedule is broken) | "warning" (suboptimal but functional)
 */

const DAY_START = '09:00';
const DAY_END = '21:00';

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function validateSchedule(schedule, activities, travelTimes) {
  const issues = [];
  const activityMap = new Map(activities.map((a) => [a.place_id, a]));
  const usedPlaceIds = new Set();

  for (let d = 0; d < schedule.days.length; d++) {
    const day = schedule.days[d];
    const dayLabel = day.date;

    if (day.items.length > 5) {
      issues.push({
        type: 'too_many_activities',
        severity: 'warning',
        day: dayLabel,
        message: `${day.items.length} activities scheduled (max recommended: 5)`,
      });
    }

    for (let i = 0; i < day.items.length; i++) {
      const item = day.items[i];
      const activity = activityMap.get(item.place_id);
      const startMin = timeToMinutes(item.start_time);
      const endMin = timeToMinutes(item.end_time);

      // Check: unknown place_id
      if (!activity) {
        issues.push({
          type: 'unknown_activity',
          severity: 'error',
          day: dayLabel,
          item_index: i,
          message: `Unknown place_id "${item.place_id}" — Claude invented an activity`,
        });
        continue;
      }

      // Check: duplicate across days
      if (usedPlaceIds.has(item.place_id)) {
        issues.push({
          type: 'duplicate_activity',
          severity: 'warning',
          day: dayLabel,
          item_index: i,
          message: `"${activity.name}" appears multiple times in the schedule`,
        });
      }
      usedPlaceIds.add(item.place_id);

      // Check: before day start
      if (startMin < timeToMinutes(DAY_START)) {
        issues.push({
          type: 'too_early',
          severity: 'warning',
          day: dayLabel,
          item_index: i,
          message: `"${activity.name}" starts at ${item.start_time}, before ${DAY_START}`,
        });
      }

      // Check: after day end
      if (endMin > timeToMinutes(DAY_END)) {
        issues.push({
          type: 'too_late',
          severity: 'warning',
          day: dayLabel,
          item_index: i,
          message: `"${activity.name}" ends at ${item.end_time}, after ${DAY_END}`,
        });
      }

      // Check: duration too short
      const allocatedMin = endMin - startMin;
      if (allocatedMin < activity.duration) {
        issues.push({
          type: 'duration_short',
          severity: 'warning',
          day: dayLabel,
          item_index: i,
          message: `"${activity.name}" gets ${allocatedMin}min but needs ${activity.duration}min`,
        });
      }

      // Check: overlap + travel feasibility with previous item
      if (i > 0) {
        const prev = day.items[i - 1];
        const prevEndMin = timeToMinutes(prev.end_time);

        // Time overlap
        if (startMin < prevEndMin) {
          const prevActivity = activityMap.get(prev.place_id);
          issues.push({
            type: 'time_overlap',
            severity: 'error',
            day: dayLabel,
            item_index: i,
            message: `"${activity.name}" starts at ${item.start_time} but "${prevActivity?.name ?? prev.place_id}" ends at ${prev.end_time}`,
          });
        }

        // Travel feasibility
        const travelKey = `${prev.place_id}->${item.place_id}`;
        const travel = travelTimes?.get(travelKey);
        if (travel) {
          const gap = startMin - prevEndMin;
          if (gap < travel.duration_minutes) {
            const prevActivity = activityMap.get(prev.place_id);
            issues.push({
              type: 'travel_too_short',
              severity: 'error',
              day: dayLabel,
              item_index: i,
              message: `${gap}min gap between "${prevActivity?.name}" and "${activity.name}" but travel takes ${travel.duration_minutes}min`,
            });
          } else if (gap < travel.duration_minutes + 5) {
            const prevActivity = activityMap.get(prev.place_id);
            issues.push({
              type: 'tight_transition',
              severity: 'warning',
              day: dayLabel,
              item_index: i,
              message: `Only ${gap - travel.duration_minutes}min buffer between "${prevActivity?.name}" and "${activity.name}" after ${travel.duration_minutes}min travel`,
            });
          }
        }
      }
    }
  }

  // Check: any selected activities missing from schedule
  for (const act of activities) {
    if (!usedPlaceIds.has(act.place_id)) {
      issues.push({
        type: 'missing_activity',
        severity: 'warning',
        day: null,
        message: `"${act.name}" was selected but not scheduled`,
      });
    }
  }

  return {
    valid: issues.filter((i) => i.severity === 'error').length === 0,
    issues,
  };
}
